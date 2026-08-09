use rusqlite::OptionalExtension;
use crate::database::DatabasePool;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VentaResumen {
    pub id: i32,
    pub folio: String,
    pub fecha_hora: String,
    pub total: f64,
    pub metodo_pago: String,
    pub cajero: String,
    pub estado: String,
    pub comprobante_tipo: Option<String>,   // 🆕 'BOLETA' | 'FACTURA', si tiene
    pub comprobante_numero: Option<String>, // 🆕 ej: "BBB1-000003", si tiene
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductoVendido {
    pub producto_nombre: String,
    pub cantidad_vendida: f64,
    pub total_vendido: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EstadisticasVentas {
    pub total_ventas: i32,
    pub monto_total: f64,
    pub ticket_promedio: f64,
    pub ventas_efectivo: f64,
    pub ventas_tarjeta: f64,
    pub ventas_transferencia: f64,
}

// Comando: Obtener ventas por rango de fechas
#[tauri::command]
pub fn obtener_ventas_rango(
    db: tauri::State<DatabasePool>,
    fecha_inicio: String,
    fecha_fin: String,
) -> Result<Vec<VentaResumen>, String> {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            v.id,
            v.folio,
            strftime('%Y-%m-%d %H:%M', v.fecha_hora) as fecha_hora,
            v.total,
            v.metodo_pago,
            u.nombre_completo as cajero,
            v.estado,
            c.tipo,
            CASE WHEN c.serie IS NOT NULL AND c.numero IS NOT NULL
                 THEN c.serie || '-' || printf('%06d', c.numero) END
        FROM ventas v
        JOIN usuarios u ON v.usuario_id = u.id
        LEFT JOIN comprobantes_electronicos c ON c.venta_id = v.id AND c.estado = 'ACEPTADO'
        WHERE date(v.fecha_hora) BETWEEN ? AND ?
        ORDER BY v.fecha_hora DESC
    ";

    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let ventas_iter = stmt
        .query_map(params![&fecha_inicio, &fecha_fin], |row| {
            Ok(VentaResumen {
                id: row.get(0)?,
                folio: row.get(1)?,
                fecha_hora: row.get(2)?,
                total: row.get(3)?,
                metodo_pago: row.get(4)?,
                cajero: row.get(5)?,
                estado: row.get(6)?,
                comprobante_tipo: row.get(7)?,
                comprobante_numero: row.get(8)?,
            })
        })
        .map_err(|e| format!("Error al obtener ventas: {}", e))?;

    let ventas: Vec<VentaResumen> = ventas_iter
        .filter_map(|r| r.ok())
        .collect();

    Ok(ventas)
}

// Comando: Obtener productos más vendidos
#[tauri::command]
pub fn obtener_productos_mas_vendidos(
    db: tauri::State<DatabasePool>,
    fecha_inicio: String,
    fecha_fin: String,
    limite: i32,
) -> Result<Vec<ProductoVendido>, String> {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            p.nombre as producto_nombre,
            SUM(dv.cantidad) as cantidad_vendida,
            SUM(dv.total_linea) as total_vendido
        FROM detalles_venta dv
        JOIN productos p ON dv.producto_id = p.id
        JOIN ventas v ON dv.venta_id = v.id
        WHERE date(v.fecha_hora) BETWEEN ? AND ?
            AND v.estado = 'COMPLETADA'
        GROUP BY p.id, p.nombre
        ORDER BY cantidad_vendida DESC
        LIMIT ?
    ";

    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let productos_iter = stmt
        .query_map(params![&fecha_inicio, &fecha_fin, limite], |row| {
            Ok(ProductoVendido {
                producto_nombre: row.get(0)?,
                cantidad_vendida: row.get(1)?,
                total_vendido: row.get(2)?,
            })
        })
        .map_err(|e| format!("Error al obtener productos vendidos: {}", e))?;

    let productos: Vec<ProductoVendido> = productos_iter
        .filter_map(|r| r.ok())
        .collect();

    Ok(productos)
}

// Comando: Obtener estadísticas de ventas
#[tauri::command]
pub fn obtener_estadisticas_ventas(
    db: tauri::State<DatabasePool>,
    fecha_inicio: String,
    fecha_fin: String,
) -> Result<EstadisticasVentas, String> {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            COUNT(*) as total_ventas,
            COALESCE(SUM(total), 0) as monto_total,
            COALESCE(AVG(total), 0) as ticket_promedio,
            COALESCE(SUM(CASE WHEN metodo_pago = 'EFECTIVO' THEN total ELSE 0 END), 0) as ventas_efectivo,
            COALESCE(SUM(CASE WHEN metodo_pago = 'TARJETA' THEN total ELSE 0 END), 0) as ventas_tarjeta,
            COALESCE(SUM(CASE WHEN metodo_pago = 'TRANSFERENCIA' THEN total ELSE 0 END), 0) as ventas_transferencia
        FROM ventas
        WHERE date(fecha_hora) BETWEEN ? AND ?
            AND estado = 'COMPLETADA'
    ";

    let result = conn
        .query_row(
            query,
            params![&fecha_inicio, &fecha_fin],
            |row| {
                Ok(EstadisticasVentas {
                    total_ventas: row.get::<_, i32>(0)?,
                    monto_total: row.get(1)?,
                    ticket_promedio: row.get(2)?,
                    ventas_efectivo: row.get(3)?,
                    ventas_tarjeta: row.get(4)?,
                    ventas_transferencia: row.get(5)?,
                })
            }
        )
        .optional()
        .map_err(|e| format!("Error al obtener estadísticas: {}", e))?;

    Ok(result.unwrap_or(EstadisticasVentas {
        total_ventas: 0,
        monto_total: 0.0,
        ticket_promedio: 0.0,
        ventas_efectivo: 0.0,
        ventas_tarjeta: 0.0,
        ventas_transferencia: 0.0,
    }))
}

// Comando: Obtener ventas de hoy
#[tauri::command]
pub fn obtener_ventas_hoy(db: tauri::State<DatabasePool>) -> Result<Vec<VentaResumen>, String> {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            v.id,
            v.folio,
            strftime('%Y-%m-%d %H:%M', v.fecha_hora) as fecha_hora,
            v.total,
            v.metodo_pago,
            u.nombre_completo as cajero,
            v.estado,
            c.tipo,
            CASE WHEN c.serie IS NOT NULL AND c.numero IS NOT NULL
                 THEN c.serie || '-' || printf('%06d', c.numero) END
        FROM ventas v
        JOIN usuarios u ON v.usuario_id = u.id
        LEFT JOIN comprobantes_electronicos c ON c.venta_id = v.id AND c.estado = 'ACEPTADO'
        WHERE date(v.fecha_hora) = date('now', 'localtime')
        ORDER BY v.fecha_hora DESC
    ";

    let mut stmt = conn
        .prepare(query)
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let ventas_iter = stmt
        .query_map([], |row| {
            Ok(VentaResumen {
                id: row.get(0)?,
                folio: row.get(1)?,
                fecha_hora: row.get(2)?,
                total: row.get(3)?,
                metodo_pago: row.get(4)?,
                cajero: row.get(5)?,
                estado: row.get(6)?,
                comprobante_tipo: row.get(7)?,
                comprobante_numero: row.get(8)?,
            })
        })
        .map_err(|e| format!("Error al obtener ventas: {}", e))?;

    let ventas: Vec<VentaResumen> = ventas_iter
        .filter_map(|r| r.ok())
        .collect();

    Ok(ventas)
}

// Comando: Obtener estadísticas con devoluciones
#[tauri::command]
pub fn obtener_estadisticas_con_devoluciones(
    db: tauri::State<DatabasePool>,
    fecha_inicio: String,
    fecha_fin: String,
) -> Result<serde_json::Value, String> {
    let conn = db.get_conn();

    // Estadísticas de ventas
    let query_ventas = r"
        SELECT 
            COUNT(*) as total_ventas,
            COALESCE(SUM(total), 0) as total_vendido,
            COALESCE(AVG(total), 0) as ticket_promedio
        FROM ventas
        WHERE date(fecha_hora) BETWEEN ? AND ?
          AND estado = 'COMPLETADA'
    ";

    let ventas_stats = conn
        .query_row(
            query_ventas,
            params![&fecha_inicio, &fecha_fin],
            |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                ))
            }
        )
        .optional()
        .map_err(|e| format!("Error al obtener estadísticas de ventas: {}", e))?
        .unwrap_or((0, 0.0, 0.0));

    // Estadísticas de devoluciones
    let query_devoluciones = r"
        SELECT 
            COUNT(*) as total_devoluciones,
            COALESCE(SUM(monto_reembolsado), 0) as total_devuelto
        FROM devoluciones
        WHERE date(fecha_hora) BETWEEN ? AND ?
          AND estado = 'PROCESADA'
    ";

    let dev_stats = conn
        .query_row(
            query_devoluciones,
            params![&fecha_inicio, &fecha_fin],
            |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, f64>(1)?,
                ))
            }
        )
        .optional()
        .map_err(|e| format!("Error al obtener estadísticas de devoluciones: {}", e))?
        .unwrap_or((0, 0.0));

    let (total_ventas, total_vendido, ticket_promedio) = ventas_stats;
    let (total_devoluciones, total_devuelto) = dev_stats;
    let total_neto = total_vendido - total_devuelto;

    let resultado = serde_json::json!({
        "ventas": {
            "cantidad": total_ventas,
            "total": total_vendido,
            "ticket_promedio": ticket_promedio
        },
        "devoluciones": {
            "cantidad": total_devoluciones,
            "total": total_devuelto
        },
        "total_neto": total_neto
    });

    Ok(resultado)
}