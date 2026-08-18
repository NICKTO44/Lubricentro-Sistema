use rusqlite::OptionalExtension;
use crate::database::DatabasePool;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfiguracionTienda {
    pub id: i32,
    pub nombre_tienda: String,
    pub direccion: String,
    pub telefono: String,
    pub email: String,
    pub rfc: String,
    pub mensaje_recibo: String,
    pub impresora_ip: String,
    pub impresora_tipo: String,
    pub impresora_puerto: i32,
    pub modo_negocio: String,  // 🆕 'ROPA' | 'MINIMARKET'
    pub nubefact_token: Option<String>,  // 🆕 token de la cuenta de NubeFacT (facturación electrónica)
    pub nubefact_ruta: Option<String>,   // 🆕 ruta de la cuenta de NubeFacT
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Categoria {
    pub id: i32,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub activo: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Usuario {
    pub id: i32,
    pub username: String,
    pub nombre_completo: String,
    pub email: Option<String>,
    pub rol_id: i32,
    pub rol_nombre: String,
    pub activo: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Rol {
    pub id: i32,
    pub nombre: String,
}

#[tauri::command]
pub fn obtener_configuracion_tienda(
    db: tauri::State<DatabasePool>,
) -> Result<ConfiguracionTienda, String> {
    let conn = db.get_conn();

    let query = "SELECT id, nombre_tienda, direccion, telefono, email, rfc, mensaje_recibo, COALESCE(impresora_ip, ''), COALESCE(impresora_tipo, 'TERMICA'), COALESCE(impresora_puerto, 9100), COALESCE(modo_negocio, 'ROPA'), nubefact_token, nubefact_ruta FROM configuracion_tienda LIMIT 1";
    
    let result = conn
        .query_row(query, [], |row| {
            Ok(ConfiguracionTienda {
                id: row.get(0)?,
                nombre_tienda: row.get(1)?,
                direccion: row.get(2)?,
                telefono: row.get(3)?,
                email: row.get(4)?,
                rfc: row.get(5)?,
                mensaje_recibo: row.get(6)?,
                impresora_ip: row.get(7)?,
                impresora_tipo: row.get(8)?,
                impresora_puerto: row.get(9)?,
                modo_negocio: row.get(10)?,
                nubefact_token: row.get(11)?,
                nubefact_ruta: row.get(12)?,
            })
        })
        .optional()
        .map_err(|e| format!("Error al obtener configuracion: {}", e))?;

    result.ok_or_else(|| "No hay configuracion registrada".to_string())
}

// =====================================================
// 🆕 COMANDO: ¿Falta elegir el tipo de negocio? (wizard de primer arranque)
// =====================================================
#[tauri::command]
pub fn necesita_elegir_modo_negocio(_db: tauri::State<DatabasePool>) -> Result<bool, String> {
    // El sistema opera con un único rubro (Lubricentro), fijado de fábrica.
    // Se conserva este comando por compatibilidad, pero ya no existe wizard de selección.
    Ok(false)
}

// =====================================================
// 🆕 COMANDO: Establecer el tipo de negocio elegido en el wizard de primer arranque
// =====================================================
#[tauri::command]
pub fn establecer_modo_negocio(
    db: tauri::State<DatabasePool>,
    modo_negocio: String,
) -> Result<String, String> {
    let conn = db.get_conn();
    conn.execute(
        "UPDATE configuracion_tienda SET modo_negocio = ?, modo_negocio_configurado = 1",
        params![&modo_negocio],
    )
    .map_err(|e| format!("Error al establecer modo de negocio: {}", e))?;

    // 🆕 Sembrar categorías por defecto según el negocio elegido — solo si el catálogo
    // de categorías está vacío (instalación limpia). Si ya hay categorías (instalación
    // migrada desde una versión anterior), no tocamos nada para no duplicar ni pisar datos.
    let ya_tiene_categorias: bool = conn
        .query_row("SELECT COUNT(*) FROM categorias", [], |row| {
            Ok(row.get::<_, i32>(0)? > 0)
        })
        .unwrap_or(true); // ante la duda, no sembrar (más seguro que duplicar)

    if !ya_tiene_categorias {
        // El sistema opera con un único rubro: Lubricentro. `modo_negocio` se conserva
        // como 'MINIMARKET' a nivel interno (venta por unidad/medida, sin tallas) solo
        // para reutilizar toda la lógica existente sin duplicarla.
        let _ = modo_negocio; // reservado para si en el futuro se agregan más rubros
        let categorias_default: Vec<(&str, &str, &str)> = vec![
            ("Aceites de Motor",          "Aceites minerales, semisintéticos y sintéticos para motor", "NINGUNA"),
            ("Grasas",                    "Grasas lubricantes para chasis, rodajes y uso industrial",  "NINGUNA"),
            ("Filtros de Aceite",         "Filtros de aceite para distintas marcas y modelos",          "NINGUNA"),
            ("Filtros de Aire",           "Filtros de aire de motor y habitáculo",                      "NINGUNA"),
            ("Filtros de Combustible",    "Filtros de gasolina, diésel y GLP/GNV",                      "NINGUNA"),
            ("Refrigerantes",             "Anticongelantes y refrigerantes para radiador",              "NINGUNA"),
            ("Líquidos de Frenos",        "Líquidos de frenos DOT 3, DOT 4 y DOT 5.1",                  "NINGUNA"),
            ("Aditivos",                  "Aditivos para motor, combustible y sistema de transmisión",  "NINGUNA"),
            ("Productos de Limpieza",     "Limpiadores de motor, tapicería y carrocería",               "NINGUNA"),
            ("Siliconas",                 "Siliconas y protectores para tablero, llantas y plásticos",  "NINGUNA"),
            ("Aromatizantes",             "Aromatizantes y ambientadores para vehículo",                "NINGUNA"),
            ("Accesorios para Vehículos", "Accesorios menores y complementos para el vehículo",         "NINGUNA"),
        ];

        for (nombre, descripcion, tipo_talla) in categorias_default {
            let _ = conn.execute(
                "INSERT INTO categorias (nombre, descripcion, tipo_talla) VALUES (?, ?, ?)",
                params![nombre, descripcion, tipo_talla],
            );
        }
    }

    Ok("Modo de negocio configurado exitosamente".to_string())
}

#[tauri::command]
pub fn actualizar_configuracion_tienda(
    db: tauri::State<DatabasePool>,
    nombre_tienda: String,
    direccion: String,
    telefono: String,
    email: String,
    rfc: String,
    mensaje_recibo: String,
    impresora_ip: String,
    impresora_tipo: String,
    impresora_puerto: i32,
) -> Result<String, String> {
    let conn = db.get_conn();

    // 🆕 modo_negocio NO se incluye acá a propósito: solo se puede fijar una vez,
    // a través del comando `establecer_modo_negocio` (wizard de primer arranque).
    // Así queda protegido incluso si el frontend llegara a mandarlo.
    let query = r"
        UPDATE configuracion_tienda 
        SET nombre_tienda = ?,
            direccion = ?,
            telefono = ?,
            email = ?,
            rfc = ?,
            mensaje_recibo = ?,
            impresora_ip = ?,
            impresora_tipo = ?,
            impresora_puerto = ?
    ";

    conn.execute(
        query,
        params![
            &nombre_tienda,
            &direccion,
            &telefono,
            &email,
            &rfc,
            &mensaje_recibo,
            &impresora_ip,
            &impresora_tipo,
            impresora_puerto,
        ],
    )
    .map_err(|e| format!("Error al actualizar configuracion: {}", e))?;

    Ok("Configuracion actualizada exitosamente".to_string())
}

// =====================================================
// 🆕 COMANDO: Guardar el token de la cuenta de NubeFacT del negocio
// (facturación electrónica — cada instalación usa su propia cuenta y RUC)
// =====================================================
#[tauri::command]
pub fn guardar_token_nubefact(
    db: tauri::State<DatabasePool>,
    token: String,
    ruta: String,
) -> Result<String, String> {
    let conn = db.get_conn();
    let token_limpio = token.trim();
    let ruta_limpia = ruta.trim();
    let token_valor: Option<&str> = if token_limpio.is_empty() { None } else { Some(token_limpio) };
    let ruta_valor: Option<&str> = if ruta_limpia.is_empty() { None } else { Some(ruta_limpia) };

    conn.execute(
        "UPDATE configuracion_tienda SET nubefact_token = ?, nubefact_ruta = ?",
        params![token_valor, ruta_valor],
    )
    .map_err(|e| format!("Error al guardar los datos: {}", e))?;

    Ok(if token_valor.is_some() && ruta_valor.is_some() {
        "Datos de facturación electrónica guardados".to_string()
    } else {
        "Facturación electrónica desactivada".to_string()
    })
}

#[tauri::command]
pub fn agregar_categoria(
    db: tauri::State<DatabasePool>,
    nombre: String,
    descripcion: Option<String>,
    tipo_talla: Option<String>,  // 🆕 'ROPA' | 'CALZADO' | 'NINGUNA' — antes quedaba forzado a 'ROPA' siempre
) -> Result<String, String> {
    let conn = db.get_conn();
    let tipo = tipo_talla.unwrap_or_else(|| "NINGUNA".to_string());
    conn.execute(
        "INSERT INTO categorias (nombre, descripcion, tipo_talla) VALUES (?, ?, ?)",
        params![&nombre, &descripcion, &tipo],
    )
    .map_err(|e| format!("Error al agregar categoria: {}", e))?;
    Ok("Categoria agregada exitosamente".to_string())
}

#[tauri::command]
pub fn actualizar_categoria(
    db: tauri::State<DatabasePool>,
    categoria_id: i32,
    nombre: String,
    descripcion: Option<String>,
    tipo_talla: Option<String>,  // 🆕
) -> Result<String, String> {
    let conn = db.get_conn();
    let tipo = tipo_talla.unwrap_or_else(|| "NINGUNA".to_string());
    conn.execute(
        "UPDATE categorias SET nombre = ?, descripcion = ?, tipo_talla = ? WHERE id = ?",
        params![&nombre, &descripcion, &tipo, categoria_id],
    )
    .map_err(|e| format!("Error al actualizar categoria: {}", e))?;
    Ok("Categoria actualizada exitosamente".to_string())
}

#[tauri::command]
pub fn obtener_usuarios(db: tauri::State<DatabasePool>) -> Result<Vec<Usuario>, String> {
    let conn = db.get_conn();
    let mut stmt = conn
        .prepare(r"
            SELECT u.id, u.username, u.nombre_completo, u.email, u.rol_id, r.nombre as rol_nombre, u.activo
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
            ORDER BY u.nombre_completo
        ")
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let usuarios: Vec<Usuario> = stmt
        .query_map([], |row| {
            Ok(Usuario {
                id: row.get(0)?,
                username: row.get(1)?,
                nombre_completo: row.get(2)?,
                email: row.get(3)?,
                rol_id: row.get(4)?,
                rol_nombre: row.get(5)?,
                activo: row.get(6)?,
            })
        })
        .map_err(|e| format!("Error al obtener usuarios: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(usuarios)
}

#[tauri::command]
pub fn obtener_roles(db: tauri::State<DatabasePool>) -> Result<Vec<Rol>, String> {
    let conn = db.get_conn();
    let mut stmt = conn
        .prepare("SELECT id, nombre FROM roles WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let roles: Vec<Rol> = stmt
        .query_map([], |row| {
            Ok(Rol {
                id: row.get(0)?,
                nombre: row.get(1)?,
            })
        })
        .map_err(|e| format!("Error al obtener roles: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(roles)
}

#[tauri::command]
pub fn agregar_usuario(
    db: tauri::State<DatabasePool>,
    username: String,
    password: String,
    nombre_completo: String,
    email: Option<String>,
    rol_id: i32,
) -> Result<String, String> {
    let conn = db.get_conn();
    let password_hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Error al hashear contrasena: {}", e))?;

    conn.execute(
        "INSERT INTO usuarios (username, password_hash, nombre_completo, email, rol_id) VALUES (?, ?, ?, ?, ?)",
        params![&username, &password_hash, &nombre_completo, &email, rol_id],
    )
    .map_err(|e| format!("Error al agregar usuario: {}", e))?;

    Ok("Usuario agregado exitosamente".to_string())
}

#[tauri::command]
pub fn actualizar_usuario(
    db: tauri::State<DatabasePool>,
    usuario_id: i32,
    username: String,
    nombre_completo: String,
    email: Option<String>,
    rol_id: i32,
    nueva_password: Option<String>,
) -> Result<String, String> {
    let conn = db.get_conn();

    if let Some(pass) = nueva_password {
        let password_hash = bcrypt::hash(&pass, bcrypt::DEFAULT_COST)
            .map_err(|e| format!("Error al hashear contrasena: {}", e))?;
        conn.execute(
            r"UPDATE usuarios SET username = ?, nombre_completo = ?, email = ?, rol_id = ?, password_hash = ? WHERE id = ?",
            params![&username, &nombre_completo, &email, rol_id, &password_hash, usuario_id],
        )
        .map_err(|e| format!("Error al actualizar usuario: {}", e))?;
    } else {
        conn.execute(
            r"UPDATE usuarios SET username = ?, nombre_completo = ?, email = ?, rol_id = ? WHERE id = ?",
            params![&username, &nombre_completo, &email, rol_id, usuario_id],
        )
        .map_err(|e| format!("Error al actualizar usuario: {}", e))?;
    }

    Ok("Usuario actualizado exitosamente".to_string())
}