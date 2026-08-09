// commands/licencias.rs
// Sistema de control de licencias

use crate::database::DatabasePool;
use rusqlite::params;
use serde::{Deserialize, Serialize};

// 🌐 Supabase: única fuente de verdad de qué códigos son válidos. Ya no se
// calcula nada localmente (antes un checksum matemático simple permitía que
// cualquiera generara códigos "válidos" sin pasar por vos). Ahora un código
// solo funciona si vos lo cargaste de antemano en la tabla `codigos_autorizados`
// (con tu herramienta generadora). La clave "publishable" de acá SOLO puede
// ejecutar la función `activar_codigo` — no puede leer ni listar la tabla.
const SUPABASE_URL: &str = "https://bngcbzjkgfnjcvzdzbhj.supabase.co";
const SUPABASE_KEY: &str = "sb_publishable_CHycXX_BWmYwdk_OlSgYCg_Vl9Wj1Zo";

#[derive(Debug, Deserialize)]
struct RespuestaActivarCodigo {
    exito: bool,
    mensaje: String,
    tipo: Option<String>,
}

/// Le pregunta a Supabase si el código es válido y, si lo es, lo marca como
/// usado (todo en un solo paso atómico, del lado del servidor).
/// - Ok(tipo_licencia) → código autorizado, ya quedó marcado como usado.
/// - Err(mensaje) → no autorizado, ya usado antes, o falló la conexión.
fn validar_y_activar_codigo_supabase(codigo: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let url = format!("{}/rest/v1/rpc/activar_codigo", SUPABASE_URL);

    let body = serde_json::json!({ "codigo_input": codigo });

    let respuesta = client
        .post(&url)
        .header("apikey", SUPABASE_KEY)
        .header("Authorization", format!("Bearer {}", SUPABASE_KEY))
        .header("Content-Type", "application/json")
        .json(&body)
        .send();

    match respuesta {
        Ok(resp) if resp.status().is_success() => {
            let filas: Vec<RespuestaActivarCodigo> = resp
                .json()
                .map_err(|_| "Respuesta inesperada del servidor. Intenta de nuevo.".to_string())?;

            match filas.first() {
                Some(fila) if fila.exito => fila
                    .tipo
                    .clone()
                    .ok_or_else(|| "El servidor no indicó el tipo de licencia.".to_string()),
                Some(fila) => Err(fila.mensaje.clone()),
                None => Err("No se pudo verificar el código.".to_string()),
            }
        }
        Ok(_) => {
            Err("No se pudo verificar el código en este momento. Intenta de nuevo en unos segundos.".to_string())
        }
        Err(_) => {
            Err("Se necesita conexión a internet para activar la licencia. Verifica tu conexión e intenta de nuevo.".to_string())
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EstadoLicencia {
    pub tipo_licencia: String,
    pub estado: String,
    pub fecha_instalacion: String,
    pub fecha_expiracion: String,
    pub dias_restantes: i32,
    pub puede_operar: bool,
    pub modo_solo_lectura: bool,
    pub codigo_activacion: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResultadoActivacion {
    pub success: bool,
    pub mensaje: String,
    pub nueva_fecha_expiracion: Option<String>,
    pub tipo_licencia: Option<String>,
}

#[tauri::command]
pub fn obtener_estado_licencia(
    db: tauri::State<DatabasePool>,
) -> Result<EstadoLicencia, String> {
    let conn = db.get_conn();

    let mut stmt = conn.prepare("
        SELECT tipo_licencia, estado, fecha_instalacion, fecha_expiracion, codigo_activacion
        FROM licencias WHERE id = 1
    ").map_err(|e| format!("Error al preparar query: {}", e))?;

    let resultado = stmt.query_row([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<String>>(4)?,
        ))
    });

    match resultado {
        Ok((tipo_licencia, estado, fecha_instalacion, fecha_expiracion, codigo_activacion)) => {
            let dias_restantes = calcular_dias_restantes_interno(&conn, &fecha_expiracion)?;

            // ✅ FIX: Solo puede operar con licencia ACTIVA (días > 0)
            // GRACIA eliminado — al expirar va directo a modo solo lectura
            let puede_operar = estado == "ACTIVO" && dias_restantes > 0;
            let modo_solo_lectura = !puede_operar;

            Ok(EstadoLicencia {
                tipo_licencia,
                estado,
                fecha_instalacion,
                fecha_expiracion,
                dias_restantes,
                puede_operar,
                modo_solo_lectura,
                codigo_activacion,
            })
        }
        Err(e) => Err(format!("Error al obtener licencia: {}", e)),
    }
}

#[tauri::command]
pub fn verificar_licencia(db: tauri::State<DatabasePool>) -> Result<bool, String> {
    let conn = db.get_conn();

    let (estado_actual, fecha_expiracion): (String, String) = conn
        .query_row(
            "SELECT estado, fecha_expiracion FROM licencias WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Error al leer licencia: {}", e))?;

    let dias_restantes = calcular_dias_restantes_interno(&conn, &fecha_expiracion)?;

    // ✅ FIX: Sin período de gracia — 0 o menos días = EXPIRADO
    let nuevo_estado = if dias_restantes > 0 {
        "ACTIVO"
    } else {
        "EXPIRADO"
    };

    if nuevo_estado != estado_actual {
        conn.execute(
            "UPDATE licencias SET estado = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = 1",
            params![nuevo_estado],
        )
        .map_err(|e| format!("Error al actualizar estado: {}", e))?;

        println!("✅ Estado de licencia actualizado: {} → {}", estado_actual, nuevo_estado);
    }

    // ✅ Solo puede operar si está ACTIVO con días > 0
    Ok(nuevo_estado == "ACTIVO" && dias_restantes > 0)
}

#[tauri::command]
pub fn activar_licencia(
    db: tauri::State<DatabasePool>,
    codigo: String,
    nombre_negocio: Option<String>,
) -> Result<ResultadoActivacion, String> {
    let conn = db.get_conn();

    let codigo_limpio = codigo.trim().to_uppercase().replace(" ", "");

    if !validar_formato_codigo(&codigo_limpio) {
        return Ok(ResultadoActivacion {
            success: false,
            mensaje: "Código inválido. Formato correcto: POS-M-XXXX-XXXX-XXXX".to_string(),
            nueva_fecha_expiracion: None,
            tipo_licencia: None,
        });
    }

    // 🌐 Única fuente de verdad: Supabase. Ya no se calcula nada localmente
    // (antes esto se podía "adivinar" con la fórmula del checksum). Ahora el
    // código tiene que estar cargado de antemano en `codigos_autorizados`
    // (con la herramienta generadora) y sin usar todavía.
    let _ = nombre_negocio; // ya no aplica acá: la nota se carga al generar el código, no al activarlo
    let tipo = match validar_y_activar_codigo_supabase(&codigo_limpio) {
        Ok(t) => t,
        Err(mensaje_error) => {
            return Ok(ResultadoActivacion {
                success: false,
                mensaje: mensaje_error,
                nueva_fecha_expiracion: None,
                tipo_licencia: None,
            });
        }
    };

    let dias_a_agregar = match tipo.as_str() {
        "MENSUAL" => 30,
        "ANUAL" => 365,
        _ => {
            return Ok(ResultadoActivacion {
                success: false,
                mensaje: "Tipo de licencia no reconocido en el código.".to_string(),
                nueva_fecha_expiracion: None,
                tipo_licencia: None,
            });
        }
    };

    let resultado = conn.execute(
        "UPDATE licencias SET 
            tipo_licencia = ?,
            estado = 'ACTIVO',
            codigo_activacion = ?,
            codigo_usado = 1,
            fecha_primera_activacion = COALESCE(fecha_primera_activacion, datetime('now', 'localtime')),
            fecha_expiracion = datetime('now', 'localtime', ? || ' days'),
            intentos_activacion = intentos_activacion + 1,
            fecha_actualizacion = datetime('now', 'localtime')
        WHERE id = 1",
        params![&tipo, &codigo_limpio, format!("+{}", dias_a_agregar)],
    );

    match resultado {
        Ok(_) => {
            let nueva_fecha: String = conn
                .query_row(
                    "SELECT fecha_expiracion FROM licencias WHERE id = 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_default();

            let _ = conn.execute(
                "INSERT INTO historial_licencias (
                    accion, estado_nuevo, tipo_licencia_nueva, codigo_usado,
                    resultado, mensaje, dias_agregados, fecha_expiracion_nueva
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    "ACTIVACION", "ACTIVO", &tipo, &codigo_limpio,
                    "EXITOSO",
                    format!("Licencia {} activada correctamente", tipo),
                    dias_a_agregar, &nueva_fecha,
                ],
            );

            println!("✅ Licencia {} activada. Válida hasta: {}", tipo, nueva_fecha);

            Ok(ResultadoActivacion {
                success: true,
                mensaje: format!("¡Licencia {} activada exitosamente!", tipo),
                nueva_fecha_expiracion: Some(nueva_fecha),
                tipo_licencia: Some(tipo),
            })
        }
        Err(e) => Ok(ResultadoActivacion {
            success: false,
            mensaje: format!("Error al activar licencia: {}", e),
            nueva_fecha_expiracion: None,
            tipo_licencia: None,
        }),
    }
}

#[tauri::command]
pub fn calcular_dias_restantes(db: tauri::State<DatabasePool>) -> Result<i32, String> {
    let conn = db.get_conn();

    let fecha_expiracion: String = conn
        .query_row(
            "SELECT fecha_expiracion FROM licencias WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Error al obtener fecha de expiración: {}", e))?;

    calcular_dias_restantes_interno(&conn, &fecha_expiracion)
}

#[tauri::command]
pub fn validar_codigo_activacion(codigo: String) -> Result<bool, String> {
    let codigo_limpio = codigo.trim().to_uppercase().replace(" ", "");
    Ok(validar_formato_codigo(&codigo_limpio))
}

fn calcular_dias_restantes_interno(
    conn: &rusqlite::Connection,
    fecha_expiracion: &str,
) -> Result<i32, String> {
    let dias: i32 = conn
        .query_row(
            "SELECT CAST((julianday(?) - julianday('now', 'localtime')) AS INTEGER) as dias_restantes",
            params![fecha_expiracion],
            |row| row.get(0),
        )
        .map_err(|e| format!("Error al calcular días: {}", e))?;

    Ok(dias)
}

fn validar_formato_codigo(codigo: &str) -> bool {
    let partes: Vec<&str> = codigo.split('-').collect();
    if partes.len() != 5 { return false; }
    if partes[0] != "POS" { return false; }
    if partes[1] != "M" && partes[1] != "A" { return false; }
    for i in 2..5 {
        if partes[i].len() != 4 { return false; }
        if !partes[i].chars().all(|c| c.is_alphanumeric()) { return false; }
    }
    true
}

#[tauri::command]
pub fn verificar_primera_vez(db: tauri::State<DatabasePool>) -> Result<bool, String> {
    let conn = db.get_conn();

    let columna_existe: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('licencias') WHERE name='primera_vez_mostrado'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !columna_existe {
        return Ok(true);
    }

    let ya_mostrado: i32 = conn
        .query_row(
            "SELECT COALESCE(primera_vez_mostrado, 0) FROM licencias WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(ya_mostrado == 0)
}

#[tauri::command]
pub fn marcar_primera_vez_vista(db: tauri::State<DatabasePool>) -> Result<bool, String> {
    let conn = db.get_conn();

    let columna_existe: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('licencias') WHERE name='primera_vez_mostrado'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !columna_existe {
        return Ok(false);
    }

    match conn.execute("UPDATE licencias SET primera_vez_mostrado = 1 WHERE id = 1", []) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn obtener_info_debug_licencia(
    db: tauri::State<DatabasePool>,
) -> Result<String, String> {
    let conn = db.get_conn();

    conn.query_row(
        "SELECT tipo_licencia, estado, fecha_instalacion, fecha_expiracion,
            CAST((julianday(fecha_expiracion) - julianday('now', 'localtime')) AS INTEGER) as dias_restantes,
            codigo_activacion
         FROM licencias WHERE id = 1",
        [],
        |row| {
            let tipo: String = row.get(0)?;
            let estado: String = row.get(1)?;
            let instalacion: String = row.get(2)?;
            let expiracion: String = row.get(3)?;
            let dias: i32 = row.get(4)?;
            let codigo: Option<String> = row.get(5)?;
            Ok(format!(
                "Tipo: {}\nEstado: {}\nInstalación: {}\nExpiración: {}\nDías restantes: {}\nCódigo: {}",
                tipo, estado, instalacion, expiracion, dias,
                codigo.unwrap_or("No activado".to_string())
            ))
        },
    ).map_err(|e| format!("Error: {}", e))
}