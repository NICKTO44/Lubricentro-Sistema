// commands/lotes.rs
// Control de vencimiento por lotes (productos perecibles de minimarket)

use crate::database::DatabasePool;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Lote {
    pub id: i32,
    pub producto_id: i32,
    pub cantidad: f64,
    pub fecha_vencimiento: String,
    pub fecha_ingreso: String,
    pub compra_id: Option<i32>,
    pub numero_lote: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoteResponse {
    pub success: bool,
    pub message: String,
}

// =====================================================
// 🆕 COMANDO: Agregar un lote nuevo a un producto (al recibir mercadería)
// =====================================================
#[tauri::command]
pub fn agregar_lote_producto(
    db: tauri::State<DatabasePool>,
    producto_id: i32,
    cantidad: f64,
    fecha_vencimiento: String,
    compra_id: Option<i32>,
    numero_lote: Option<String>,
) -> LoteResponse {
    let conn = db.get_conn();

    if cantidad <= 0.0 {
        return LoteResponse { success: false, message: "La cantidad debe ser mayor a 0".to_string() };
    }
    if fecha_vencimiento.trim().is_empty() {
        return LoteResponse { success: false, message: "La fecha de vencimiento es obligatoria".to_string() };
    }

    let resultado = conn.execute(
        "INSERT INTO lotes_producto (producto_id, cantidad, fecha_vencimiento, compra_id, numero_lote)
         VALUES (?, ?, ?, ?, ?)",
        params![producto_id, cantidad, &fecha_vencimiento, compra_id, &numero_lote],
    );

    match resultado {
        Ok(_) => LoteResponse { success: true, message: "Lote agregado correctamente".to_string() },
        Err(e) => LoteResponse { success: false, message: format!("Error al agregar el lote: {}", e) },
    }
}

// =====================================================
// 🆕 COMANDO: Obtener los lotes activos de un producto
// (ordenados por vencimiento — el que vence antes, primero)
// =====================================================
#[tauri::command]
pub fn obtener_lotes_de_producto(
    db: tauri::State<DatabasePool>,
    producto_id: i32,
) -> Result<Vec<Lote>, String> {
    let conn = db.get_conn();
    let mut stmt = conn
        .prepare(
            "SELECT id, producto_id, cantidad, fecha_vencimiento, fecha_ingreso, compra_id, numero_lote
             FROM lotes_producto
             WHERE producto_id = ? AND activo = 1 AND cantidad > 0
             ORDER BY fecha_vencimiento ASC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![producto_id], |row| {
            Ok(Lote {
                id: row.get(0)?,
                producto_id: row.get(1)?,
                cantidad: row.get(2)?,
                fecha_vencimiento: row.get(3)?,
                fecha_ingreso: row.get(4)?,
                compra_id: row.get(5)?,
                numero_lote: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// 🆕 COMANDO: Reporte de lotes próximos a vencer o ya vencidos
// (para el dashboard/Reportes — "qué hay que rotar ya")
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct LoteAlerta {
    pub lote_id: i32,
    pub producto_id: i32,
    pub producto_nombre: String,
    pub cantidad: f64,
    pub unidad_medida: String,
    pub fecha_vencimiento: String,
    pub dias_restantes: i32, // negativo = ya vencido
}

#[tauri::command]
pub fn obtener_lotes_por_vencer(
    db: tauri::State<DatabasePool>,
    dias_horizonte: i32, // ej: 15 = "vencen en los próximos 15 días o antes"
) -> Result<Vec<LoteAlerta>, String> {
    let conn = db.get_conn();
    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.producto_id, p.nombre, l.cantidad, p.unidad_medida, l.fecha_vencimiento,
                    CAST(julianday(l.fecha_vencimiento) - julianday('now', 'localtime') AS INTEGER)
             FROM lotes_producto l
             JOIN productos p ON p.id = l.producto_id
             WHERE l.activo = 1 AND l.cantidad > 0
               AND julianday(l.fecha_vencimiento) - julianday('now', 'localtime') <= ?
             ORDER BY l.fecha_vencimiento ASC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![dias_horizonte], |row| {
            Ok(LoteAlerta {
                lote_id: row.get(0)?,
                producto_id: row.get(1)?,
                producto_nombre: row.get(2)?,
                cantidad: row.get(3)?,
                unidad_medida: row.get(4)?,
                fecha_vencimiento: row.get(5)?,
                dias_restantes: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// 🆕 COMANDO: Dar de baja un lote (por ejemplo, si venció y se descarta)
// =====================================================
#[tauri::command]
pub fn descartar_lote(db: tauri::State<DatabasePool>, lote_id: i32) -> LoteResponse {
    let conn = db.get_conn();
    let resultado = conn.execute(
        "UPDATE lotes_producto SET activo = 0, cantidad = 0 WHERE id = ?",
        params![lote_id],
    );
    match resultado {
        Ok(_) => LoteResponse { success: true, message: "Lote descartado".to_string() },
        Err(e) => LoteResponse { success: false, message: format!("Error: {}", e) },
    }
}