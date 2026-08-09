// commands/ventas.rs
// Comandos de ventas - SQLite

use crate::database::DatabasePool;
use rusqlite::params;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

// =====================================================
// 🆕 Descontar stock por FEFO (primero en vencer, primero en salir)
// Recorre los lotes activos del producto, ordenados por fecha de
// vencimiento ascendente, y va descontando hasta cubrir la cantidad
// vendida — si un lote no alcanza, sigue con el siguiente.
// =====================================================
fn descontar_stock_fefo(
    conn: &rusqlite::Connection,
    producto_id: i32,
    cantidad_requerida: f64,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, cantidad FROM lotes_producto
             WHERE producto_id = ? AND activo = 1 AND cantidad > 0
             ORDER BY fecha_vencimiento ASC",
        )
        .map_err(|e| format!("Error al preparar consulta de lotes: {}", e))?;

    let lotes: Vec<(i32, f64)> = stmt
        .query_map(params![producto_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("Error al leer lotes: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let disponible_total: f64 = lotes.iter().map(|(_, c)| c).sum();
    if disponible_total < cantidad_requerida {
        return Err(format!(
            "Stock insuficiente por vencimiento (disponible: {}, solicitado: {})",
            disponible_total, cantidad_requerida
        ));
    }

    let mut restante = cantidad_requerida;
    for (lote_id, cantidad_lote) in lotes {
        if restante <= 0.0 {
            break;
        }
        let a_descontar = if cantidad_lote >= restante { restante } else { cantidad_lote };
        conn.execute(
            "UPDATE lotes_producto SET cantidad = cantidad - ? WHERE id = ?",
            params![a_descontar, lote_id],
        )
        .map_err(|e| format!("Error al descontar lote: {}", e))?;
        restante -= a_descontar;
    }

    Ok(())
}

// =====================================================
// ESTRUCTURAS
// =====================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductoVenta {
    pub id: i32,
    pub nombre: String,
    pub codigo: String,
    pub precio: f64,
    pub cantidad: f64,
    #[serde(rename = "descuentoPorcentaje")]
    pub descuento_porcentaje: Option<f64>,
    // 🆕 Campos de variante — opcionales para no romper productos sin tallas
    #[serde(rename = "varianteId")]
    pub variante_id: Option<i32>,
    pub talla: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VentaResult {
    pub venta_id: i32,
    pub folio: String,
}

// =====================================================
// COMANDO: Procesar venta
// =====================================================
#[tauri::command]
pub fn procesar_venta(
    db: tauri::State<'_, DatabasePool>,
    productos: Vec<ProductoVenta>,
    total: f64,
    metodo_pago: String,
    monto_recibido: Option<f64>,
    cambio: Option<f64>,
    usuario_id: i32,
) -> Result<VentaResult, String> {
    let conn = db.get_conn();

    // Verificar caja abierta
    let caja_abierta: Option<i32> = conn
        .query_row(
            "SELECT id FROM cajas WHERE usuario_id = ? AND estado = 'ABIERTA'",
            params![usuario_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Error al verificar caja: {}", e))?;

    if caja_abierta.is_none() {
        return Err("Debes abrir una caja antes de procesar ventas".to_string());
    }

    // 🆕 Validar stock de variantes antes de iniciar transacción
    for producto in &productos {
        if let Some(variante_id) = producto.variante_id {
            let stock_variante: Option<f64> = conn
                .query_row(
                    "SELECT stock FROM producto_variantes WHERE id = ? AND activo = 1",
                    params![variante_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| format!("Error al verificar stock de talla: {}", e))?;

            match stock_variante {
                None => return Err(format!(
                    "Talla {} de '{}' no encontrada",
                    producto.talla.as_deref().unwrap_or("?"),
                    producto.nombre
                )),
                Some(stock) if stock < producto.cantidad => return Err(format!(
                    "Stock insuficiente para {} talla {} (disponible: {}, solicitado: {})",
                    producto.nombre,
                    producto.talla.as_deref().unwrap_or("?"),
                    stock,
                    producto.cantidad
                )),
                _ => {}
            }
        }
    }

    // 🆕 Validar stock de productos con vencimiento (por lotes) antes de iniciar transacción
    for producto in &productos {
        if producto.variante_id.is_some() {
            continue; // las tallas ya se validaron arriba, y ropa nunca lleva vencimiento
        }
        let lleva_vencimiento: bool = conn
            .query_row(
                "SELECT lleva_vencimiento FROM productos WHERE id = ?",
                params![producto.id],
                |row| Ok(row.get::<_, i32>(0)? == 1),
            )
            .unwrap_or(false);

        if lleva_vencimiento {
            let disponible: f64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(cantidad), 0) FROM lotes_producto
                     WHERE producto_id = ? AND activo = 1",
                    params![producto.id],
                    |row| row.get(0),
                )
                .unwrap_or(0.0);

            if disponible < producto.cantidad {
                return Err(format!(
                    "Stock insuficiente para {} (disponible: {}, solicitado: {})",
                    producto.nombre, disponible, producto.cantidad
                ));
            }
        }
    }

    // Iniciar transacción
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Error al iniciar transacción: {}", e))?;

    // Rollback helper
    let rollback = |conn: &rusqlite::Connection, msg: String| -> String {
        let _ = conn.execute("ROLLBACK", []);
        msg
    };

    // 1. Generar folio único
    let fecha_actual = chrono::Local::now().format("%Y%m%d").to_string();
    let folio_query = format!(
        "SELECT COALESCE(MAX(CAST(substr(folio, -4) AS INTEGER)), 0) + 1
         FROM ventas WHERE folio LIKE 'V-{}%'",
        fecha_actual
    );

    let siguiente_numero: i32 = conn
        .query_row(&folio_query, [], |row| row.get(0))
        .unwrap_or(1);

    let folio = format!("V-{}-{:04}", fecha_actual, siguiente_numero);

    // 2. Calcular subtotal y descuento total
    let mut subtotal = 0.0f64;
    let mut descuento_total = 0.0f64;

    for p in &productos {
        let sub = p.precio * p.cantidad as f64;
        let desc = sub * (p.descuento_porcentaje.unwrap_or(0.0) / 100.0);
        subtotal += sub;
        descuento_total += desc;
    }

    // 3. Insertar venta
    if let Err(e) = conn.execute(
        r"INSERT INTO ventas (folio, subtotal, descuento, total, metodo_pago,
                              monto_recibido, cambio, usuario_id, estado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETADA')",
        params![&folio, subtotal, descuento_total, total, &metodo_pago,
                monto_recibido, cambio, usuario_id],
    ) {
        return Err(rollback(&conn, format!("Error al insertar venta: {}", e)));
    }

    let venta_id = conn.last_insert_rowid() as i32;

    // 4. Insertar detalles con variante_id y talla
    for p in &productos {
        let sub = p.precio * p.cantidad as f64;
        let desc = sub * (p.descuento_porcentaje.unwrap_or(0.0) / 100.0);
        let total_linea = sub - desc;

        // 🆕 Si el producto lleva vencimiento, descontar del lote que vence
        // primero ANTES de insertar el detalle (así el trigger de venta, que
        // registra el movimiento, ya lee el stock correcto y actualizado)
        if p.variante_id.is_none() {
            let lleva_vencimiento: bool = conn
                .query_row(
                    "SELECT lleva_vencimiento FROM productos WHERE id = ?",
                    params![p.id],
                    |row| Ok(row.get::<_, i32>(0)? == 1),
                )
                .unwrap_or(false);

            if lleva_vencimiento {
                if let Err(e) = descontar_stock_fefo(&conn, p.id, p.cantidad) {
                    return Err(rollback(&conn, e));
                }
            }
        }

        if let Err(e) = conn.execute(
            r"INSERT INTO detalles_venta
                (venta_id, producto_id, variante_id, talla, cantidad,
                 precio_unitario, subtotal, descuento_linea, total_linea)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                venta_id,
                p.id,
                p.variante_id,   // NULL si no tiene tallas
                p.talla,         // NULL si no tiene tallas
                p.cantidad,
                p.precio,
                sub,
                desc,
                total_linea,
            ],
        ) {
            return Err(rollback(&conn, format!("Error al insertar detalle: {}", e)));
        }
    }

    // 5. Commit
    if let Err(e) = conn.execute("COMMIT", []) {
        return Err(format!("Error al confirmar transacción: {}", e));
    }

    Ok(VentaResult { venta_id, folio })
}