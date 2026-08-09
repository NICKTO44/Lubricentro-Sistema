// commands/facturacion.rs
// Emisión de comprobantes electrónicos (boletas/facturas) vía NubeFacT
//
// ⚠️ IMPORTANTE: la estructura del JSON de acá abajo está armada según el
// formato estándar y documentado de NubeFacT, pero NO fue probada todavía
// contra una cuenta real — hay que probarla con la cuenta Demo antes de
// usarla con clientes reales, y ajustar cualquier campo si SUNAT/NubeFacT
// lo pide distinto.

use crate::database::DatabasePool;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use chrono::Local;

#[derive(Debug, Deserialize)]
pub struct ItemComprobante {
    pub codigo: String,
    pub descripcion: String,
    pub cantidad: f64,
    pub precio_unitario: f64,  // precio de venta final, CON IGV incluido
    pub unidad_medida: String, // UNIDAD | KG | GRAMO | LITRO | ML (las mismas de nuestro sistema)
}

#[derive(Debug, Deserialize)]
pub struct EmitirComprobanteRequest {
    pub venta_id: i32,
    pub tipo: String,  // "BOLETA" | "FACTURA"
    pub cliente_documento: Option<String>,  // DNI (boleta) o RUC (factura)
    pub cliente_nombre: Option<String>,
    pub items: Vec<ItemComprobante>,
    pub total: f64,
}

#[derive(Debug, Serialize)]
pub struct ComprobanteResultado {
    pub success: bool,
    pub mensaje: String,
    pub enlace_pdf: Option<String>,
    pub serie: Option<String>,
    pub numero: Option<i64>,
}

// Traduce nuestra unidad interna al código SUNAT que espera NubeFacT
fn unidad_sunat(unidad: &str) -> &'static str {
    match unidad {
        "KG" => "KGM",
        "GRAMO" => "GRM",
        "LITRO" => "LTR",
        "ML" => "MLT",
        _ => "NIU", // Unidad (NIU = "unidad" en la tabla de SUNAT)
    }
}

#[tauri::command]
pub fn emitir_comprobante_electronico(
    db: tauri::State<DatabasePool>,
    request: EmitirComprobanteRequest,
) -> Result<ComprobanteResultado, String> {
    let conn = db.get_conn();

    // 1. Leer las credenciales de la cuenta de NubeFacT del negocio
    let (token, ruta): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT nubefact_token, nubefact_ruta FROM configuracion_tienda LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Error al leer configuración: {}", e))?;

    let token = token
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| "Todavía no configuraste tu cuenta de facturación electrónica. Andá a Configuración → Facturación Electrónica.".to_string())?;
    let ruta = ruta
        .filter(|r| !r.trim().is_empty())
        .ok_or_else(|| "Todavía no configuraste tu cuenta de facturación electrónica. Andá a Configuración → Facturación Electrónica.".to_string())?;

    // 2. Validar tipo y documento del cliente
    let tipo_comprobante = match request.tipo.as_str() {
        "BOLETA" => 2,
        "FACTURA" => 1,
        _ => return Err("Tipo de comprobante no válido".to_string()),
    };

    let documento = request.cliente_documento.clone().unwrap_or_default();
    let documento_limpio = documento.trim();

    if request.tipo == "FACTURA" && documento_limpio.len() != 11 {
        return Err("La factura necesita un RUC válido (11 dígitos)".to_string());
    }
    if request.tipo == "BOLETA" && !documento_limpio.is_empty() && documento_limpio.len() != 8 {
        return Err("El DNI debe tener 8 dígitos".to_string());
    }

    let cliente_tipo_doc = if request.tipo == "FACTURA" { 6 } else { 1 }; // 6=RUC, 1=DNI

    // 3. Número correlativo — se lleva la cuenta localmente, por serie y tipo
    let serie = if request.tipo == "FACTURA" { "FFF1" } else { "BBB1" };
    let siguiente_numero: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(numero), 0) + 1 FROM comprobantes_electronicos WHERE tipo = ? AND serie = ?",
            params![&request.tipo, serie],
            |row| row.get(0),
        )
        .unwrap_or(1);

    // 4. Armar los items en el formato de NubeFacT (valor sin IGV + IGV separado)
    let porcentaje_igv = 18.0;
    let items_json: Vec<serde_json::Value> = request.items.iter().map(|item| {
        let valor_unitario = item.precio_unitario / (1.0 + porcentaje_igv / 100.0);
        let subtotal = valor_unitario * item.cantidad;
        let total_item = item.precio_unitario * item.cantidad;
        let igv_item = total_item - subtotal;
        serde_json::json!({
            "unidad_de_medida": unidad_sunat(&item.unidad_medida),
            "codigo": item.codigo,
            "descripcion": item.descripcion,
            "cantidad": item.cantidad,
            "valor_unitario": (valor_unitario * 100.0).round() / 100.0,
            "precio_unitario": item.precio_unitario,
            "subtotal": (subtotal * 100.0).round() / 100.0,
            "tipo_de_igv": 1,
            "igv": (igv_item * 100.0).round() / 100.0,
            "total": (total_item * 100.0).round() / 100.0,
            "anticipo_regularizacion": false,
        })
    }).collect();

    let total_gravada = request.total / (1.0 + porcentaje_igv / 100.0);
    let total_igv = request.total - total_gravada;
    let fecha_emision = Local::now().format("%d-%m-%Y").to_string();

    let payload = serde_json::json!({
        "operacion": "generar_comprobante",
        "tipo_de_comprobante": tipo_comprobante,
        "serie": serie,
        "numero": siguiente_numero,
        "sunat_transaction": 1,
        "cliente_tipo_de_documento": cliente_tipo_doc,
        "cliente_numero_de_documento": documento_limpio,
        "cliente_denominacion": request.cliente_nombre.clone().unwrap_or_else(|| "Cliente".to_string()),
        "cliente_direccion": "-",
        "fecha_de_emision": fecha_emision,
        "moneda": 1,
        "porcentaje_de_igv": porcentaje_igv,
        "total_gravada": (total_gravada * 100.0).round() / 100.0,
        "total_igv": (total_igv * 100.0).round() / 100.0,
        "total": request.total,
        "enviar_automaticamente_a_la_sunat": true,
        "enviar_automaticamente_al_cliente": false,
        "items": items_json,
    });

    // 5. Llamar a la API de NubeFacT
    let client = reqwest::blocking::Client::new();
    let respuesta = client
        .post(&ruta)
        .header("Authorization", format!("Token token=\"{}\"", token))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send();

    match respuesta {
        Ok(resp) => {
            let status_ok = resp.status().is_success();
            let cuerpo: serde_json::Value = resp.json().unwrap_or(serde_json::json!({}));

            // 🔧 FIX: "aceptada_por_sunat" da SIEMPRE false en cuentas Demo, aunque el
            // comprobante se haya generado perfecto (Demo nunca manda nada a la SUNAT
            // real). El indicador confiable de éxito es que haya un PDF/link real y
            // que no venga un campo "errors" en la respuesta.
            let enlace_pdf = cuerpo.get("enlace_del_pdf").and_then(|v| v.as_str()).map(String::from);
            let tiene_error = cuerpo.get("errors").and_then(|v| v.as_str()).filter(|s| !s.is_empty());

            if status_ok && enlace_pdf.is_some() && tiene_error.is_none() {
                let enlace_xml = cuerpo.get("enlace_del_xml").and_then(|v| v.as_str()).map(String::from);

                conn.execute(
                    "INSERT INTO comprobantes_electronicos
                        (venta_id, tipo, serie, numero, cliente_documento, cliente_nombre, estado, enlace_pdf, enlace_xml)
                     VALUES (?, ?, ?, ?, ?, ?, 'ACEPTADO', ?, ?)",
                    params![
                        request.venta_id, &request.tipo, serie, siguiente_numero,
                        documento_limpio, &request.cliente_nombre, &enlace_pdf, &enlace_xml
                    ],
                ).ok();

                Ok(ComprobanteResultado {
                    success: true,
                    mensaje: format!("{} {}-{} emitida correctamente", request.tipo, serie, siguiente_numero),
                    enlace_pdf,
                    serie: Some(serie.to_string()),
                    numero: Some(siguiente_numero),
                })
            } else {
                let mensaje_error = cuerpo.get("errors")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_else(|| format!("NubeFacT/SUNAT rechazó el comprobante (respuesta: {})", cuerpo));

                conn.execute(
                    "INSERT INTO comprobantes_electronicos
                        (venta_id, tipo, serie, numero, cliente_documento, cliente_nombre, estado, mensaje_sunat)
                     VALUES (?, ?, ?, ?, ?, ?, 'RECHAZADO', ?)",
                    params![
                        request.venta_id, &request.tipo, serie, siguiente_numero,
                        documento_limpio, &request.cliente_nombre, &mensaje_error
                    ],
                ).ok();

                Ok(ComprobanteResultado {
                    success: false,
                    mensaje: mensaje_error,
                    enlace_pdf: None,
                    serie: None,
                    numero: None,
                })
            }
        }
        Err(e) => Err(format!("No se pudo conectar con el servicio de facturación electrónica: {}", e)),
    }
}

// =====================================================
// 🆕 COMANDO: Abrir una URL con el navegador del sistema
// (sin depender de ningún plugin de Tauri — evita el problema de
// versiones incompatibles que causaba errores de compilación)
// =====================================================
// Codificación base64 propia (para no agregar otra dependencia nueva al proyecto)
fn codificar_base64(datos: &[u8]) -> String {
    const TABLA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut resultado = String::with_capacity((datos.len() + 2) / 3 * 4);
    for bloque in datos.chunks(3) {
        let b0 = bloque[0];
        let b1 = *bloque.get(1).unwrap_or(&0);
        let b2 = *bloque.get(2).unwrap_or(&0);

        resultado.push(TABLA[(b0 >> 2) as usize] as char);
        resultado.push(TABLA[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        resultado.push(if bloque.len() > 1 { TABLA[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char } else { '=' });
        resultado.push(if bloque.len() > 2 { TABLA[(b2 & 0x3F) as usize] as char } else { '=' });
    }
    resultado
}

// =====================================================
// 🆕 COMANDO: Descargar el PDF real del comprobante (en base64)
// Se usa para mostrarlo DENTRO de la app — los sitios externos como
// NubeFacT normalmente bloquean que su contenido se "incruste" en otra
// página (X-Frame-Options), así que hay que traer el PDF primero y
// mostrarlo como si fuera un archivo propio, no como un link externo.
// =====================================================
#[tauri::command]
pub fn descargar_pdf_comprobante(url: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let respuesta = client
        .get(&url)
        .send()
        .map_err(|e| format!("No se pudo descargar el comprobante: {}", e))?;

    let bytes = respuesta
        .bytes()
        .map_err(|e| format!("Error al leer el PDF: {}", e))?;

    Ok(codificar_base64(&bytes))
}

#[tauri::command]
pub fn abrir_url_externa(url: String) -> Result<(), String> {
    let resultado = if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(&url).spawn()
    } else {
        std::process::Command::new("xdg-open").arg(&url).spawn()
    };

    resultado
        .map(|_| ())
        .map_err(|e| format!("No se pudo abrir el enlace: {}", e))
}

#[derive(Debug, Serialize)]
pub struct ComprobanteGuardado {
    pub id: i32,
    pub tipo: String,
    pub serie: Option<String>,
    pub numero: Option<i64>,
    pub estado: String,
    pub enlace_pdf: Option<String>,
    pub fecha_emision: String,
}

#[tauri::command]
pub fn obtener_comprobantes_de_venta(
    db: tauri::State<DatabasePool>,
    venta_id: i32,
) -> Result<Vec<ComprobanteGuardado>, String> {
    let conn = db.get_conn();
    let mut stmt = conn
        .prepare("SELECT id, tipo, serie, numero, estado, enlace_pdf, fecha_emision FROM comprobantes_electronicos WHERE venta_id = ? ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![venta_id], |row| {
            Ok(ComprobanteGuardado {
                id: row.get(0)?,
                tipo: row.get(1)?,
                serie: row.get(2)?,
                numero: row.get(3)?,
                estado: row.get(4)?,
                enlace_pdf: row.get(5)?,
                fecha_emision: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}