// commands/clientes.rs
// Comandos de Clientes - CRUD

use crate::database::DatabasePool;
use crate::models::cliente::{Cliente, ClienteNuevo, ClienteResponse, ClientesResponse};
use rusqlite::params;

fn row_to_cliente(row: &rusqlite::Row) -> rusqlite::Result<Cliente> {
    Ok(Cliente {
        id:               row.get(0)?,
        nombre:           row.get(1)?,
        tipo_documento:   row.get(2)?,
        numero_documento: row.get(3)?,
        telefono:         row.get(4)?,
        email:            row.get(5)?,
        direccion:        row.get(6)?,
        placa:            row.get(7)?,
        notas:            row.get(8)?,
        activo:           row.get::<_, i32>(9)? == 1,
    })
}

const SELECT_CLIENTE: &str = r"
    SELECT id, nombre, tipo_documento, numero_documento,
           telefono, email, direccion, placa, notas, activo
    FROM clientes
";

#[tauri::command]
pub fn obtener_clientes(db: tauri::State<'_, DatabasePool>) -> ClientesResponse {
    let conn = db.get_conn();

    let query = format!("{} WHERE activo = 1 ORDER BY nombre", SELECT_CLIENTE);
    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(_) => return ClientesResponse { success: false, clientes: vec![] },
    };

    let mapped = match stmt.query_map([], |row| row_to_cliente(row)) {
        Ok(r) => r,
        Err(_) => return ClientesResponse { success: false, clientes: vec![] },
    };

    let clientes: Vec<Cliente> = mapped.filter_map(|r| r.ok()).collect();
    ClientesResponse { success: true, clientes }
}

// 🆕 Búsqueda liviana usada por el selector del POS al emitir boleta/factura:
// filtra por nombre o número de documento, para no tener que traer y filtrar
// la lista completa en el frontend cada vez que el cajero escribe una letra.
#[tauri::command]
pub fn buscar_clientes(db: tauri::State<'_, DatabasePool>, texto: String) -> ClientesResponse {
    let conn = db.get_conn();

    let query = format!(
        "{} WHERE activo = 1 AND (nombre LIKE ?1 OR numero_documento LIKE ?1) ORDER BY nombre LIMIT 20",
        SELECT_CLIENTE
    );
    let patron = format!("%{}%", texto.trim());

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(_) => return ClientesResponse { success: false, clientes: vec![] },
    };

    let mapped = match stmt.query_map(params![patron], |row| row_to_cliente(row)) {
        Ok(r) => r,
        Err(_) => return ClientesResponse { success: false, clientes: vec![] },
    };

    let clientes: Vec<Cliente> = mapped.filter_map(|r| r.ok()).collect();
    ClientesResponse { success: true, clientes }
}

#[tauri::command]
pub fn agregar_cliente(
    db: tauri::State<'_, DatabasePool>,
    cliente: ClienteNuevo,
) -> ClienteResponse {
    let conn = db.get_conn();

    if cliente.nombre.trim().is_empty() {
        return ClienteResponse {
            success: false,
            message: "El nombre del cliente es obligatorio".to_string(),
            cliente: None,
        };
    }

    match conn.execute(
        r"INSERT INTO clientes
            (nombre, tipo_documento, numero_documento, telefono, email, direccion, placa, notas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            cliente.nombre.trim(),
            cliente.tipo_documento.as_deref().unwrap_or("DNI"),
            &cliente.numero_documento,
            &cliente.telefono,
            &cliente.email,
            &cliente.direccion,
            &cliente.placa,
            &cliente.notas,
        ],
    ) {
        Ok(_) => ClienteResponse {
            success: true,
            message: "Cliente agregado exitosamente".to_string(),
            cliente: None,
        },
        Err(e) => ClienteResponse {
            success: false,
            message: format!("Error al agregar cliente: {}", e),
            cliente: None,
        },
    }
}

#[tauri::command]
pub fn actualizar_cliente(
    db: tauri::State<'_, DatabasePool>,
    cliente_id: i32,
    cliente: ClienteNuevo,
) -> ClienteResponse {
    let conn = db.get_conn();

    if cliente.nombre.trim().is_empty() {
        return ClienteResponse {
            success: false,
            message: "El nombre del cliente es obligatorio".to_string(),
            cliente: None,
        };
    }

    match conn.execute(
        r"UPDATE clientes SET
            nombre = ?, tipo_documento = ?, numero_documento = ?,
            telefono = ?, email = ?, direccion = ?, placa = ?, notas = ?,
            fecha_actualizacion = datetime('now', 'localtime')
          WHERE id = ?",
        params![
            cliente.nombre.trim(),
            cliente.tipo_documento.as_deref().unwrap_or("DNI"),
            &cliente.numero_documento,
            &cliente.telefono,
            &cliente.email,
            &cliente.direccion,
            &cliente.placa,
            &cliente.notas,
            cliente_id,
        ],
    ) {
        Ok(_) => ClienteResponse {
            success: true,
            message: "Cliente actualizado exitosamente".to_string(),
            cliente: None,
        },
        Err(e) => ClienteResponse {
            success: false,
            message: format!("Error al actualizar cliente: {}", e),
            cliente: None,
        },
    }
}

// 🆕 Borrado lógico (como Proveedores): el cliente deja de listarse pero
// sus comprobantes ya emitidos conservan la referencia (cliente_id).
#[tauri::command]
pub fn eliminar_cliente(
    db: tauri::State<'_, DatabasePool>,
    cliente_id: i32,
) -> ClienteResponse {
    let conn = db.get_conn();
    match conn.execute(
        "UPDATE clientes SET activo = 0 WHERE id = ?",
        params![cliente_id],
    ) {
        Ok(_) => ClienteResponse {
            success: true,
            message: "Cliente eliminado".to_string(),
            cliente: None,
        },
        Err(e) => ClienteResponse {
            success: false,
            message: format!("Error: {}", e),
            cliente: None,
        },
    }
}