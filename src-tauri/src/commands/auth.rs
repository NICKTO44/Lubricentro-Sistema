// commands/auth.rs
// Comandos de autenticación - SQLite

use crate::database::DatabasePool;
use crate::models::{Usuario, UsuarioLogin, UsuarioResponse};
use rusqlite::params;
use rusqlite::OptionalExtension;

// Comando: Login de usuario
#[tauri::command]
pub fn login(
    db: tauri::State<DatabasePool>,
    credenciales: UsuarioLogin,
) -> UsuarioResponse {
    // Obtener conexión
    let conn = db.get_conn();

    // Buscar usuario por username
    let query = r"
        SELECT id, username, nombre_completo, email, rol_id, activo, password_hash
        FROM usuarios
        WHERE username = ? AND activo = 1
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(e) => {
            return UsuarioResponse {
                success: false,
                message: format!("Error al preparar consulta: {}", e),
                usuario: None,
            }
        }
    };

    let result = stmt.query_row([&credenciales.username], |row| {
        Ok((
            row.get::<_, i32>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, bool>(5)?,
            row.get::<_, String>(6)?,
        ))
    }).optional();

    match result {
        Ok(Some((id, username, nombre_completo, email, rol_id, activo, password_hash))) => {
            // 🔒 FIX CRÍTICO: antes esto no validaba la contraseña para nada
            // (aceptaba cualquier texto con tal de que el usuario existiera).
            // Ahora se verifica de verdad contra el hash bcrypt guardado.
            let password_valida = bcrypt::verify(&credenciales.password, &password_hash)
                .unwrap_or(false);

            if !password_valida {
                // Registrar intento fallido en sesiones_log
                let _ = conn.execute(
                    "INSERT INTO sesiones_log (usuario_id, resultado, ip_address) VALUES (?, 'FALLIDO', '127.0.0.1')",
                    params![id],
                );
                return UsuarioResponse {
                    success: false,
                    message: "Usuario o contraseña incorrectos".to_string(),
                    usuario: None,
                };
            }

            let usuario = Usuario::new(id, username, nombre_completo, email, rol_id, activo);

            // Registrar login exitoso en sesiones_log
            let _ = conn.execute(
                "INSERT INTO sesiones_log (usuario_id, resultado, ip_address) VALUES (?, 'EXITOSO', '127.0.0.1')",
                params![id],
            );

            UsuarioResponse {
                success: true,
                message: "Login exitoso".to_string(),
                usuario: Some(usuario),
            }
        }
        Ok(None) => UsuarioResponse {
            success: false,
            message: "Usuario o contraseña incorrectos".to_string(),
            usuario: None,
        },
        Err(e) => UsuarioResponse {
            success: false,
            message: format!("Error en consulta: {}", e),
            usuario: None,
        },
    }
}

// Comando: Verificar conexión a la base de datos
#[tauri::command]
pub fn test_database_connection(db: tauri::State<DatabasePool>) -> Result<String, String> {
    let conn = db.get_conn();
    
    let result: Result<i32, _> = conn.query_row("SELECT 1", [], |row| row.get(0));
    
    match result {
        Ok(1) => Ok("Conexión exitosa a la base de datos SQLite".to_string()),
        Ok(_) => Err("Resultado inesperado en consulta de prueba".to_string()),
        Err(e) => Err(format!("Error al ejecutar consulta: {}", e)),
    }
}