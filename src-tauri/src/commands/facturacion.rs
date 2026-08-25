// commands/facturacion.rs
// Emisión de comprobantes electrónicos (boletas/facturas) vía FacturaLibre.org
//
// ⚠️ IMPORTANTE: la estructura del JSON de acá abajo está armada según la
// documentación oficial de FacturaLibre (Postman: la guía "API de Facturación
// Electrónica para empresas individuales" de su panel, y su colección pública
// https://documenter.getpostman.com/view/6435177/TVRrUPuD), incluyendo un
// ejemplo real de boleta con respuesta 200 OK. Aun así, NO fue probada
// todavía contra la cuenta real — hay que probarla en el entorno Demo antes
// de usarla con clientes reales, y ajustar cualquier campo si FacturaLibre/
// SUNAT lo pide distinto.
//
// A diferencia de NubeFacT (proveedor anterior), FacturaLibre asigna el
// número correlativo automáticamente — por eso NO se calcula un correlativo
// local acá, se manda "numero_documento": "#" y se toma el número real de
// la respuesta (data.number, con forma "B001-310").

use crate::database::DatabasePool;
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use chrono::Local;

#[derive(Debug, Deserialize)]
pub struct ItemComprobante {
    pub codigo: String,
    pub descripcion: String,
    pub cantidad: f64,
    pub precio_unitario: f64,  // precio de venta final, CON IGV incluido
    pub unidad_medida: String, // UNIDAD | KG | GRAMO | LITRO | ML | GALON (las mismas de nuestro sistema)
}

#[derive(Debug, Deserialize)]
pub struct EmitirComprobanteRequest {
    pub venta_id: i32,
    pub tipo: String,  // "BOLETA" | "FACTURA"
    pub cliente_id: Option<i32>,  // referencia opcional, si se eligió un cliente guardado
    pub cliente_documento: Option<String>,  // DNI (boleta) o RUC (factura)
    pub cliente_nombre: Option<String>,
    pub items: Vec<ItemComprobante>,
    pub total: f64,
    // 🆕 Placa del vehículo (lubricentro). Opcional — no todas las ventas son
    // por un vehículo. Se manda como "dato adicional" del ítem con el código
    // 5010 del catálogo de FacturaLibre ("Numero de Placa"), confirmado en su
    // documentación oficial (ejemplo "Factura - Datos Adicionales Item (placa)":
    // https://documenter.getpostman.com/view/6435177/TVRrUPuD). Se repite en
    // todos los ítems de la venta para que aparezca junto a cada producto en
    // el PDF, ya que el dato va por ítem, no a nivel de todo el comprobante.
    pub placa: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ComprobanteResultado {
    pub success: bool,
    pub mensaje: String,
    pub enlace_pdf: Option<String>,
    pub serie: Option<String>,
    pub numero: Option<i64>,
}

// Traduce nuestra unidad interna al código SUNAT que espera FacturaLibre
fn unidad_sunat(unidad: &str) -> &'static str {
    match unidad {
        "KG" => "KGM",
        "GRAMO" => "GRM",
        "LITRO" => "LTR",
        "ML" => "MLT",
        "GALON" => "GLL", // 🆕 antes faltaba — caía (mal) en NIU junto con "unidad"
        _ => "NIU", // Unidad (NIU = "unidad" en la tabla de SUNAT)
    }
}

// 🆕 Código genérico del catálogo de Bienes y Servicios de SUNAT (UNSPSC)
// para productos de lubricentro (familia "Lubricantes y aditivos"). Es un
// valor provisional para poder probar en Demo — se decidió usar un código
// genérico para todos los productos por ahora en vez de agregar un campo
// nuevo al catálogo de productos. Si FacturaLibre/SUNAT lo rechaza o pide
// uno más específico por producto, hay que revisar esto.
const CODIGO_PRODUCTO_SUNAT_GENERICO: &str = "15121500";

#[tauri::command]
pub fn emitir_comprobante_electronico(
    db: tauri::State<DatabasePool>,
    request: EmitirComprobanteRequest,
) -> Result<ComprobanteResultado, String> {
    let conn = db.get_conn();

    // 1. Leer las credenciales de la cuenta de FacturaLibre del negocio
    let (token, ruta): (Option<String>, Option<String>) = conn
        .query_row(
            "SELECT facturalibre_token, facturalibre_ruta FROM configuracion_tienda LIMIT 1",
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
    // Códigos SUNAT: tipo de documento 01 = Factura, 03 = Boleta.
    // Series por defecto de toda cuenta FacturaLibre nueva: F001 / B001.
    let (codigo_tipo_documento, serie) = match request.tipo.as_str() {
        "BOLETA" => ("03", "B001"),
        "FACTURA" => ("01", "F001"),
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

    // Catálogo 06 SUNAT — tipo de documento de identidad: 1 = DNI, 6 = RUC
    let cliente_tipo_doc = if request.tipo == "FACTURA" { "6" } else { "1" };

    // 🆕 Si se eligió un cliente guardado, traer su dirección/email/teléfono
    // reales de la tabla clientes — antes esto se mandaba siempre fijo como "-",
    // aunque el dato ya estuviera guardado.
    let (cliente_direccion, cliente_email, cliente_telefono): (String, String, String) =
        if let Some(cliente_id) = request.cliente_id {
            conn.query_row(
                "SELECT COALESCE(direccion, ''), COALESCE(email, ''), COALESCE(telefono, '') FROM clientes WHERE id = ?",
                params![cliente_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .unwrap_or(None)
            .unwrap_or_default()
        } else {
            (String::new(), String::new(), String::new())
        };

    // 3. Armar los items en el formato de FacturaLibre (valor sin IGV + IGV separado)
    let porcentaje_igv = 18.0;
    // 🆕 Placa del vehículo, si se ingresó. Va en cada ítem como "dato adicional"
    // (catálogo FacturaLibre, código 5010 = "Numero de Placa").
    let placa_limpia = request.placa.as_deref().map(|p| p.trim()).filter(|p| !p.is_empty());
    let items_json: Vec<serde_json::Value> = request.items.iter().map(|item| {
        let valor_unitario = item.precio_unitario / (1.0 + porcentaje_igv / 100.0);
        let total_item_val = item.precio_unitario * item.cantidad;
        let base_igv = valor_unitario * item.cantidad;
        let igv_item = total_item_val - base_igv;
        let mut item_json = serde_json::json!({
            "codigo_interno": item.codigo,
            "descripcion": item.descripcion,
            "codigo_producto_sunat": CODIGO_PRODUCTO_SUNAT_GENERICO,
            "unidad_de_medida": unidad_sunat(&item.unidad_medida),
            "cantidad": item.cantidad,
            "valor_unitario": (valor_unitario * 100.0).round() / 100.0,
            "codigo_tipo_precio": "01", // 01 = precio unitario incluye IGV
            "precio_unitario": item.precio_unitario,
            "codigo_tipo_afectacion_igv": "10", // 10 = Gravado - Operación Onerosa
            "total_base_igv": (base_igv * 100.0).round() / 100.0,
            "porcentaje_igv": porcentaje_igv,
            "total_igv": (igv_item * 100.0).round() / 100.0,
            "total_impuestos": (igv_item * 100.0).round() / 100.0,
            "total_valor_item": (base_igv * 100.0).round() / 100.0,
            "total_item": (total_item_val * 100.0).round() / 100.0,
        });
        if let Some(placa) = placa_limpia {
            item_json["datos_adicionales"] = serde_json::json!([
                {
                    "codigo": "5010",
                    "descripcion": "Numero de Placa",
                    "valor": placa,
                }
            ]);
        }
        item_json
    }).collect();

    let total_gravada = request.total / (1.0 + porcentaje_igv / 100.0);
    let total_igv = request.total - total_gravada;
    let fecha_emision = Local::now().format("%Y-%m-%d").to_string();
    let hora_emision = Local::now().format("%H:%M:%S").to_string();

    let payload = serde_json::json!({
        "serie_documento": serie,
        "numero_documento": "#", // FacturaLibre asigna el correlativo real
        "fecha_de_emision": fecha_emision,
        "hora_de_emision": hora_emision,
        "codigo_tipo_operacion": "0101", // Venta interna
        "codigo_tipo_documento": codigo_tipo_documento,
        "codigo_tipo_moneda": "PEN",
        // 🩹 Requerido por FacturaLibre (columna NOT NULL en su base): sin este
        // campo el insert falla con "SQLSTATE[23000]... Column 'date_of_due'
        // cannot be null". Venta al contado en el POS → vencimiento = misma
        // fecha de emisión (igual que su ejemplo "Boleta Gravada - Contingencia").
        // ⚠️ Confirmado en TODOS los ejemplos de su documentación pública
        // (Factura, Boleta, Boleta Contingencia, Factura Exportación): este
        // campo siempre está presente — no se puede omitir del payload. Y la
        // línea "FECHA DE VENCIMIENTO" que se ve en el PDF la imprime la
        // plantilla fija de FacturaLibre — no hay forma de ocultarla desde acá
        // (no existe ningún parámetro para eso en su API). Si de verdad no debe
        // aparecer, la única salida es dejar de usar el PDF de FacturaLibre como
        // comprobante impreso y generar uno propio con los datos de la respuesta.
        "fecha_de_vencimiento": fecha_emision,
        "datos_del_cliente_o_receptor": {
            "codigo_tipo_documento_identidad": cliente_tipo_doc,
            "numero_documento": documento_limpio,
            "apellidos_y_nombres_o_razon_social": request.cliente_nombre.clone().unwrap_or_else(|| "Cliente".to_string()),
            "codigo_pais": "PE",
            "ubigeo": "",
            "direccion": cliente_direccion,
            "correo_electronico": cliente_email,
            "telefono": cliente_telefono,
        },
        "totales": {
            "total_exportacion": 0.00,
            "total_operaciones_gravadas": (total_gravada * 100.0).round() / 100.0,
            "total_operaciones_inafectas": 0.00,
            "total_operaciones_exoneradas": 0.00,
            "total_operaciones_gratuitas": 0.00,
            "total_igv": (total_igv * 100.0).round() / 100.0,
            "total_impuestos": (total_igv * 100.0).round() / 100.0,
            "total_valor": (total_gravada * 100.0).round() / 100.0,
            "total_venta": request.total,
        },
        "items": items_json,
    });

    // 4. Llamar a la API de FacturaLibre
    let client = reqwest::blocking::Client::new();
    let respuesta = client
        .post(&ruta)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send();

    match respuesta {
        Ok(resp) => {
            let status_ok = resp.status().is_success();
            let cuerpo: serde_json::Value = resp.json().unwrap_or(serde_json::json!({}));

            let success = cuerpo.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let numero_asignado = cuerpo.pointer("/data/number").and_then(|v| v.as_str()).map(String::from);
            let external_id = cuerpo.pointer("/data/external_id").and_then(|v| v.as_str()).map(String::from);
            let estado_id = cuerpo.pointer("/data/state_type_id").and_then(|v| v.as_str()).map(String::from);
            let estado_desc = cuerpo.pointer("/data/state_type_description").and_then(|v| v.as_str()).map(String::from);
            let hash = cuerpo.pointer("/data/hash").and_then(|v| v.as_str()).map(String::from);
            let enlace_pdf = cuerpo.pointer("/links/pdf").and_then(|v| v.as_str()).map(String::from);
            let enlace_xml = cuerpo.pointer("/links/xml").and_then(|v| v.as_str()).map(String::from);
            let enlace_cdr = cuerpo.pointer("/links/cdr").and_then(|v| v.as_str()).map(String::from);
            let mensaje_respuesta = cuerpo.pointer("/response/description").and_then(|v| v.as_str()).map(String::from);

            // Extrae solo el número de "B001-310" → 310 (por si el correlativo
            // hay que mostrarlo o usarlo aparte de la serie)
            let numero_extraido: Option<i64> = numero_asignado.as_deref()
                .and_then(|n| n.rsplit('-').next())
                .and_then(|n| n.parse::<i64>().ok());

            if status_ok && success {
                // 🩹 Nota: el estado 07 "Observado" de SUNAT se guarda acá como
                // RECHAZADO (no como un estado aparte) porque la columna `estado`
                // de comprobantes_electronicos tiene un CHECK que en instalaciones
                // ya existentes no incluye 'OBSERVADO' (SQLite no permite ampliar
                // un CHECK con ALTER TABLE). El mensaje sí aclara que fue observado.
                let estado_guardado = match estado_id.as_deref() {
                    Some("05") => "ACEPTADO",
                    Some("07") | Some("09") => "RECHAZADO",
                    _ => "PENDIENTE", // 01 Registrado o 03 Enviado: todavía sin respuesta final de SUNAT
                };

                conn.execute(
                    "INSERT INTO comprobantes_electronicos
                        (venta_id, cliente_id, tipo, serie, numero, cliente_documento, cliente_nombre, estado, enlace_pdf, enlace_xml, enlace_cdr, external_id, hash, mensaje_sunat)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    params![
                        request.venta_id, request.cliente_id, &request.tipo, serie, numero_extraido,
                        documento_limpio, &request.cliente_nombre, estado_guardado,
                        &enlace_pdf, &enlace_xml, &enlace_cdr, &external_id, &hash, &mensaje_respuesta
                    ],
                ).ok();

                Ok(ComprobanteResultado {
                    success: true,
                    mensaje: mensaje_respuesta.unwrap_or_else(|| format!(
                        "{} {} emitida ({})",
                        request.tipo,
                        numero_asignado.clone().unwrap_or_default(),
                        estado_desc.unwrap_or_else(|| "procesando".to_string())
                    )),
                    enlace_pdf,
                    serie: Some(serie.to_string()),
                    numero: numero_extraido,
                })
            } else {
                let mensaje_error = mensaje_respuesta
                    .or_else(|| cuerpo.get("message").and_then(|v| v.as_str()).map(String::from))
                    .unwrap_or_else(|| format!("FacturaLibre/SUNAT rechazó el comprobante (respuesta: {})", cuerpo));

                conn.execute(
                    "INSERT INTO comprobantes_electronicos
                        (venta_id, cliente_id, tipo, serie, numero, cliente_documento, cliente_nombre, estado, mensaje_sunat)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 'RECHAZADO', ?)",
                    params![
                        request.venta_id, request.cliente_id, &request.tipo, serie, Option::<i64>::None,
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
// COMANDO: Abrir una URL con el navegador del sistema
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
// COMANDO: Descargar el PDF real del comprobante (en base64)
// Se usa para mostrarlo DENTRO de la app — los sitios externos como
// FacturaLibre normalmente bloquean que su contenido se "incruste" en otra
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

// =====================================================
// COMANDO: Probar credenciales de FacturaLibre sin emitir nada
// ⚠️ Igual que el resto de este archivo: la interpretación de la respuesta
// de FacturaLibre (qué cuenta como "token inválido") está armada según su
// documentación pública, pero no fue probada todavía contra una cuenta
// real — pruébala con tu cuenta Demo y avisa si el mensaje no calza con
// lo que de verdad responde FacturaLibre.
// =====================================================
#[derive(Debug, Serialize)]
pub struct PruebaCredencialesResultado {
    pub success: bool,
    pub mensaje: String,
}

#[tauri::command]
pub fn probar_credenciales_facturalibre(token: String, ruta: String) -> Result<PruebaCredencialesResultado, String> {
    let token = token.trim().to_string();
    let ruta = ruta.trim().to_string();

    if token.is_empty() || ruta.is_empty() {
        return Ok(PruebaCredencialesResultado {
            success: false,
            mensaje: "Completa la ruta y el token antes de probar la conexión.".to_string(),
        });
    }
    if !(ruta.starts_with("http://") || ruta.starts_with("https://")) {
        return Ok(PruebaCredencialesResultado {
            success: false,
            mensaje: "La ruta debe empezar con http:// o https://".to_string(),
        });
    }

    // Consulta liviana que no crea ningún comprobante real: pregunta por el
    // estado de un ticket de resumen que casi seguro no existe — solo nos
    // interesa si el token/URL fueron aceptados (401/403) o no.
    let url_status = format!(
        "{}/summaries/status",
        ruta.trim_end_matches('/').trim_end_matches("/documents")
    );
    let payload = serde_json::json!({
        "external_id": "00000000-0000-0000-0000-000000000000",
        "ticket": "0",
    });

    let client = reqwest::blocking::Client::new();
    let respuesta = client
        .post(&url_status)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send();

    match respuesta {
        Ok(resp) => {
            let status = resp.status();

            if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                return Ok(PruebaCredencialesResultado {
                    success: false,
                    mensaje: "FacturaLibre rechazó el token para esa ruta (no autorizado). Revisa que los copiaste bien.".to_string(),
                });
            }

            // 🔒 Si la respuesta no es JSON válido (ej: una página web cualquiera),
            // no la tratamos como "conexión exitosa" — esa ruta no es la API de
            // FacturaLibre.
            let cuerpo_texto = resp.text().unwrap_or_default();
            let cuerpo: Result<serde_json::Value, _> = serde_json::from_str(&cuerpo_texto);

            match cuerpo {
                Ok(_json) => Ok(PruebaCredencialesResultado {
                    success: true,
                    mensaje: "Conexión exitosa — la ruta y el token son válidos.".to_string(),
                }),
                Err(_) => Ok(PruebaCredencialesResultado {
                    success: false,
                    mensaje: "Esa ruta no respondió con datos de FacturaLibre (no es una respuesta JSON válida). Revisa que sea la URL exacta de tu cuenta (termina en /api/documents).".to_string(),
                }),
            }
        }
        Err(e) => Ok(PruebaCredencialesResultado {
            success: false,
            mensaje: format!("No se pudo conectar a esa ruta: {}", e),
        }),
    }
}