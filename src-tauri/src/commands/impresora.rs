use std::net::TcpStream;
use std::io::Write;
use std::thread;
use std::time::Duration;
use serde::Deserialize;
use crate::database::DatabasePool;

#[derive(Deserialize)]
pub struct DatosImpresion {
    pub nombre_tienda: String,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub items: Vec<ItemBoleta>,
    pub total: f64,
    pub efectivo: Option<f64>,
    pub cambio: Option<f64>,
    pub numero_boleta: Option<String>,
    pub cajero: Option<String>,
}

#[derive(Deserialize)]
pub struct ItemBoleta {
    pub nombre: String,
    pub cantidad: f64,
    pub precio_unitario: f64,
    pub subtotal: f64,
}

fn obtener_config_impresora(db: &DatabasePool) -> (String, String, i32) {
    let conn = db.get_conn();
    let result = conn.query_row(
        "SELECT COALESCE(impresora_ip, ''), COALESCE(impresora_tipo, 'TERMICA'), COALESCE(impresora_puerto, 9100) FROM configuracion_tienda LIMIT 1",
        [],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i32>(2)?)),
    );
    result.unwrap_or_else(|_| ("".to_string(), "TERMICA".to_string(), 9100))
}

fn centrar(texto: &str, ancho: usize) -> String {
    if texto.len() >= ancho {
        return texto.to_string();
    }
    let espacios = (ancho - texto.len()) / 2;
    format!("{}{}", " ".repeat(espacios), texto)
}

fn alinear_derecha(izquierda: &str, derecha: &str, ancho: usize) -> String {
    let total = izquierda.len() + derecha.len();
    if total >= ancho {
        return format!("{}{}", izquierda, derecha);
    }
    let puntos = ancho - total;
    format!("{}{}{}", izquierda, ".".repeat(puntos), derecha)
}

fn enviar_lento(stream: &mut TcpStream, texto: &str, es_matricial: bool) -> Result<(), String> {
    stream.write_all(&[0x1B, 0x40])
        .map_err(|e| format!("Error init: {}", e))?;
    stream.flush().ok();
    thread::sleep(Duration::from_millis(200));

    stream.write_all(&[0x1B, 0x74, 0x10])
        .map_err(|e| format!("Error charset: {}", e))?;
    stream.flush().ok();
    thread::sleep(Duration::from_millis(100));

    let delay = if es_matricial { 80 } else { 20 };

    for linea in texto.lines() {
        let linea_con_salto = format!("{}\n", linea);
        stream.write_all(linea_con_salto.as_bytes())
            .map_err(|e| format!("Error al enviar: {}", e))?;
        stream.flush().ok();
        thread::sleep(Duration::from_millis(delay));
    }

    if !es_matricial {
        stream.write_all(&[0x1D, 0x56, 0x41, 0x00]).ok();
    }

    Ok(())
}

#[tauri::command]
pub fn imprimir_boleta(
    db: tauri::State<DatabasePool>,
    datos: DatosImpresion,
) -> Result<String, String> {
    let (ip, tipo, puerto) = obtener_config_impresora(&db);

    if ip.is_empty() {
        return Err("No hay IP de impresora configurada. Ve a Configuracion para agregarla.".to_string());
    }

    let direccion = format!("{}:{}", ip, puerto);
    let es_matricial = tipo.to_uppercase() == "MATRICIAL";
    let ancho = if es_matricial { 32 } else { 42 };

    let mut stream = TcpStream::connect(&direccion)
        .map_err(|e| format!("No se pudo conectar a la impresora {}: {}", direccion, e))?;

    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

    let mut texto = String::new();

    // Encabezado
    texto.push_str(&"=".repeat(ancho));
    texto.push('\n');
    texto.push_str(&centrar(&datos.nombre_tienda, ancho));
    texto.push('\n');

    if let Some(dir) = &datos.direccion {
        if !dir.is_empty() {
            texto.push_str(&centrar(dir, ancho));
            texto.push('\n');
        }
    }
    if let Some(tel) = &datos.telefono {
        if !tel.is_empty() {
            texto.push_str(&centrar(&format!("Tel: {}", tel), ancho));
            texto.push('\n');
        }
    }

    texto.push_str(&"=".repeat(ancho));
    texto.push('\n');

    if let Some(num) = &datos.numero_boleta {
        texto.push_str(&format!("Boleta N: {}\n", num));
    }
    if let Some(cajero) = &datos.cajero {
        texto.push_str(&format!("Cajero: {}\n", cajero));
    }

    let ahora = chrono::Local::now();
    texto.push_str(&format!("Fecha: {}\n", ahora.format("%d/%m/%Y %H:%M")));
    texto.push_str(&"-".repeat(ancho));
    texto.push('\n');

    // Items con alineacion
    for item in &datos.items {
        // Nombre del producto (truncar si es muy largo)
        let nombre = if item.nombre.len() > ancho {
            item.nombre[..ancho].to_string()
        } else {
            item.nombre.clone()
        };
        texto.push_str(&format!("{}\n", nombre));

        let izq = format!("  {:.0} x S/.{:.2}", item.cantidad, item.precio_unitario);
        let der = format!("S/.{:.2}", item.subtotal);
        texto.push_str(&alinear_derecha(&izq, &der, ancho));
        texto.push('\n');
    }

    // Totales con alineacion
    texto.push_str(&"=".repeat(ancho));
    texto.push('\n');
    texto.push_str(&alinear_derecha("TOTAL:", &format!("S/.{:.2}", datos.total), ancho));
    texto.push('\n');

    if let Some(efectivo) = datos.efectivo {
        texto.push_str(&alinear_derecha("Efectivo:", &format!("S/.{:.2}", efectivo), ancho));
        texto.push('\n');
    }
    if let Some(cambio) = datos.cambio {
        texto.push_str(&alinear_derecha("Cambio:", &format!("S/.{:.2}", cambio), ancho));
        texto.push('\n');
    }

    texto.push_str(&"=".repeat(ancho));
    texto.push('\n');
    texto.push_str(&centrar("Gracias por su compra!", ancho));
    texto.push('\n');
    texto.push_str("\n\n\n");

    enviar_lento(&mut stream, &texto, es_matricial)?;

    Ok("Boleta impresa correctamente".to_string())
}

#[tauri::command]
pub fn probar_impresora(
    db: tauri::State<DatabasePool>,
) -> Result<String, String> {
    let (ip, tipo, puerto) = obtener_config_impresora(&db);

    if ip.is_empty() {
        return Err("No hay IP de impresora configurada.".to_string());
    }

    let direccion = format!("{}:{}", ip, puerto);
    let es_matricial = tipo.to_uppercase() == "MATRICIAL";

    let mut stream = TcpStream::connect(&direccion)
        .map_err(|e| format!("Error: {}", e))?;

    stream.write_all(&[0x1B, 0x40]).ok();
    thread::sleep(Duration::from_millis(200));
    stream.write_all(b"--- PRUEBA DE IMPRESION ---\nImpresora OK!\n\n\n")
        .map_err(|e| format!("Error al imprimir: {}", e))?;

    if !es_matricial {
        stream.write_all(&[0x1D, 0x56, 0x41, 0x00]).ok();
    }

    Ok("Prueba enviada correctamente".to_string())
}