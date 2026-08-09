// commands/proveedores.rs
// Comandos de Proveedores y Compras - v1.5

use crate::database::DatabasePool;
use crate::models::proveedor::{
    Proveedor, ProveedorNuevo, ProveedorResponse, ProveedoresResponse,
    Compra, DetalleCompra, PagoCompra, CompraDetalle,
    NuevaCompraRequest, RecibirMercaderiaRequest,
    RegistrarPagoRequest, CompraResponse, ComprasResponse,
    DevolucionProveedor, DetalleDevolucionProveedor,
    RegistrarDevolucionProveedorRequest, ResolverDevolucionRequest,
    DevolucionProveedorResponse, DevolucionesProveedorResponse,
};
use rusqlite::params;
use rusqlite::OptionalExtension;

// =====================================================
// PROVEEDORES - CRUD
// =====================================================

#[tauri::command]
pub fn obtener_proveedores(db: tauri::State<'_, DatabasePool>) -> ProveedoresResponse {
    let conn = db.get_conn();

    let mut stmt = match conn.prepare(r"
        SELECT id, nombre, contacto, telefono, email, direccion,
               tipo_documento, numero_documento, banco, numero_cuenta,
               notas, total_compras, credito_disponible, activo
        FROM proveedores
        WHERE activo = 1
        ORDER BY nombre
    ") {
        Ok(s) => s,
        Err(_) => return ProveedoresResponse { success: false, proveedores: vec![] },
    };

    let mapped = match stmt.query_map([], |row| {
        Ok(Proveedor {
            id:                 row.get(0)?,
            nombre:             row.get(1)?,
            contacto:           row.get(2)?,
            telefono:           row.get(3)?,
            email:              row.get(4)?,
            direccion:          row.get(5)?,
            tipo_documento:     row.get(6)?,
            numero_documento:   row.get(7)?,
            banco:              row.get(8)?,
            numero_cuenta:      row.get(9)?,
            notas:              row.get(10)?,
            total_compras:      row.get(11)?,
            credito_disponible: row.get(12)?,
            activo:             row.get::<_, i32>(13)? == 1,
        })
    }) {
        Ok(r) => r,
        Err(_) => return ProveedoresResponse { success: false, proveedores: vec![] },
    };

    let proveedores: Vec<Proveedor> = mapped.filter_map(|r| r.ok()).collect();
    ProveedoresResponse { success: true, proveedores }
}

#[tauri::command]
pub fn agregar_proveedor(
    db: tauri::State<'_, DatabasePool>,
    proveedor: ProveedorNuevo,
) -> ProveedorResponse {
    let conn = db.get_conn();

    match conn.execute(
        r"INSERT INTO proveedores
            (nombre, contacto, telefono, email, direccion,
             tipo_documento, numero_documento, banco, numero_cuenta, notas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            &proveedor.nombre,
            &proveedor.contacto,
            &proveedor.telefono,
            &proveedor.email,
            &proveedor.direccion,
            proveedor.tipo_documento.as_deref().unwrap_or("RUC"),
            &proveedor.numero_documento,
            &proveedor.banco,
            &proveedor.numero_cuenta,
            &proveedor.notas,
        ],
    ) {
        Ok(_) => ProveedorResponse {
            success: true,
            message: "Proveedor agregado exitosamente".to_string(),
            proveedor: None,
        },
        Err(e) => ProveedorResponse {
            success: false,
            message: format!("Error al agregar proveedor: {}", e),
            proveedor: None,
        },
    }
}

#[tauri::command]
pub fn actualizar_proveedor(
    db: tauri::State<'_, DatabasePool>,
    proveedor_id: i32,
    proveedor: ProveedorNuevo,
) -> ProveedorResponse {
    let conn = db.get_conn();

    match conn.execute(
        r"UPDATE proveedores SET
            nombre = ?, contacto = ?, telefono = ?, email = ?,
            direccion = ?, tipo_documento = ?, numero_documento = ?,
            banco = ?, numero_cuenta = ?, notas = ?,
            fecha_actualizacion = datetime('now', 'localtime')
          WHERE id = ?",
        params![
            &proveedor.nombre,
            &proveedor.contacto,
            &proveedor.telefono,
            &proveedor.email,
            &proveedor.direccion,
            proveedor.tipo_documento.as_deref().unwrap_or("RUC"),
            &proveedor.numero_documento,
            &proveedor.banco,
            &proveedor.numero_cuenta,
            &proveedor.notas,
            proveedor_id,
        ],
    ) {
        Ok(_) => ProveedorResponse {
            success: true,
            message: "Proveedor actualizado exitosamente".to_string(),
            proveedor: None,
        },
        Err(e) => ProveedorResponse {
            success: false,
            message: format!("Error al actualizar proveedor: {}", e),
            proveedor: None,
        },
    }
}

#[tauri::command]
pub fn eliminar_proveedor(
    db: tauri::State<'_, DatabasePool>,
    proveedor_id: i32,
) -> ProveedorResponse {
    let conn = db.get_conn();
    match conn.execute(
        "UPDATE proveedores SET activo = 0 WHERE id = ?",
        params![proveedor_id],
    ) {
        Ok(_) => ProveedorResponse {
            success: true,
            message: "Proveedor eliminado".to_string(),
            proveedor: None,
        },
        Err(e) => ProveedorResponse {
            success: false,
            message: format!("Error: {}", e),
            proveedor: None,
        },
    }
}

// =====================================================
// COMPRAS
// =====================================================

#[tauri::command]
pub fn obtener_compras(
    db: tauri::State<'_, DatabasePool>,
    proveedor_id: Option<i32>,
    estado: Option<String>,
) -> ComprasResponse {
    let conn = db.get_conn();

    let mut query = String::from(r"
        SELECT c.id, c.folio, c.proveedor_id, p.nombre,
               c.fecha_compra, c.fecha_recepcion, c.subtotal, c.descuento,
               c.credito_aplicado, c.total, c.tipo_pago, c.monto_pagado,
               c.saldo_pendiente, c.fecha_vencimiento_pago, c.estado,
               c.estado_pago, c.factura_numero, c.notas, c.notas_recepcion, c.usuario_id
        FROM compras c
        JOIN proveedores p ON c.proveedor_id = p.id
        WHERE 1=1
    ");

    if let Some(pid) = proveedor_id {
        query.push_str(&format!(" AND c.proveedor_id = {}", pid));
    }
    if let Some(est) = estado {
        if !est.is_empty() && est != "TODAS" {
            query.push_str(&format!(" AND c.estado = '{}'", est));
        }
    }
    query.push_str(" ORDER BY c.fecha_creacion DESC");

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(_) => return ComprasResponse { success: false, compras: vec![] },
    };

    let mapped = match stmt.query_map([], |row| Ok(row_to_compra(row)?)) {
        Ok(r) => r,
        Err(_) => return ComprasResponse { success: false, compras: vec![] },
    };

    let compras: Vec<Compra> = mapped.filter_map(|r| r.ok()).collect();
    ComprasResponse { success: true, compras }
}

#[tauri::command]
pub fn obtener_detalle_compra(
    db: tauri::State<'_, DatabasePool>,
    compra_id: i32,
) -> Result<CompraDetalle, String> {
    let conn = db.get_conn();

    // Compra principal
    let compra = conn.query_row(
        r"SELECT c.id, c.folio, c.proveedor_id, p.nombre,
                 c.fecha_compra, c.fecha_recepcion, c.subtotal, c.descuento,
                 c.credito_aplicado, c.total, c.tipo_pago, c.monto_pagado,
                 c.saldo_pendiente, c.fecha_vencimiento_pago, c.estado,
                 c.estado_pago, c.factura_numero, c.notas, c.notas_recepcion, c.usuario_id
          FROM compras c JOIN proveedores p ON c.proveedor_id = p.id
          WHERE c.id = ?",
        params![compra_id],
        |row| Ok(row_to_compra(row)?),
    )
    .map_err(|e| format!("Compra no encontrada: {}", e))?;

    // Items con cantidad_conforme
    let mut stmt_items = conn.prepare(r"
        SELECT dc.id, dc.compra_id, dc.producto_id, pr.nombre, pr.codigo,
               dc.variante_id, dc.talla, dc.cantidad, dc.cantidad_recibida,
               dc.cantidad_conforme, dc.precio_compra, dc.precio_venta_sugerido, dc.subtotal
        FROM detalles_compra dc
        JOIN productos pr ON dc.producto_id = pr.id
        WHERE dc.compra_id = ?
        ORDER BY dc.id
    ").map_err(|e| format!("Error: {}", e))?;

    let items: Vec<DetalleCompra> = stmt_items
        .query_map(params![compra_id], |row| {
            Ok(DetalleCompra {
                id:                    row.get(0)?,
                compra_id:             row.get(1)?,
                producto_id:           row.get(2)?,
                producto_nombre:       row.get(3)?,
                producto_codigo:       row.get(4)?,
                variante_id:           row.get(5)?,
                talla:                 row.get(6)?,
                cantidad:              row.get(7)?,
                cantidad_recibida:     row.get(8)?,
                cantidad_conforme:     row.get(9)?,
                precio_compra:         row.get(10)?,
                precio_venta_sugerido: row.get(11)?,
                subtotal:              row.get(12)?,
            })
        })
        .map_err(|e| format!("Error items: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Pagos
    let mut stmt_pagos = conn.prepare(r"
        SELECT id, compra_id, monto, fecha_pago, metodo_pago, referencia, notas
        FROM pagos_compra WHERE compra_id = ? ORDER BY fecha_pago
    ").map_err(|e| format!("Error: {}", e))?;

    let pagos: Vec<PagoCompra> = stmt_pagos
        .query_map(params![compra_id], |row| {
            Ok(PagoCompra {
                id:          row.get(0)?,
                compra_id:   row.get(1)?,
                monto:       row.get(2)?,
                fecha_pago:  row.get(3)?,
                metodo_pago: row.get(4)?,
                referencia:  row.get(5)?,
                notas:       row.get(6)?,
            })
        })
        .map_err(|e| format!("Error pagos: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Devoluciones a proveedor de esta compra
    let devoluciones = cargar_devoluciones_de_compra(&conn, compra_id);

    Ok(CompraDetalle { compra, items, pagos, devoluciones })
}

#[tauri::command]
pub fn crear_compra(
    db: tauri::State<'_, DatabasePool>,
    request: NuevaCompraRequest,
    usuario_id: i32,
) -> CompraResponse {
    let conn = db.get_conn();

    let subtotal: f64 = request.items.iter()
        .map(|i| i.precio_compra * i.cantidad as f64)
        .sum();
    let descuento        = request.descuento.unwrap_or(0.0);
    let credito_aplicado = request.credito_aplicado.unwrap_or(0.0);
    let total            = subtotal - descuento - credito_aplicado;

    // Validar que el crédito no supere el disponible
    if credito_aplicado > 0.0 {
        let credito_disp: f64 = conn.query_row(
            "SELECT credito_disponible FROM proveedores WHERE id = ?",
            params![request.proveedor_id],
            |row| row.get(0),
        ).unwrap_or(0.0);

        if credito_aplicado > credito_disp + 0.01 {
            return CompraResponse {
                success: false,
                message: format!(
                    "El crédito a aplicar S/ {:.2} supera el disponible S/ {:.2}",
                    credito_aplicado, credito_disp
                ),
                compra_id: None,
                folio: None,
            };
        }
    }

    // Generar folio C-YYYYMMDD-####
    let fecha = chrono::Local::now().format("%Y%m%d").to_string();
    let siguiente: i32 = conn.query_row(
        &format!(
            "SELECT COALESCE(MAX(CAST(substr(folio,-4) AS INTEGER)),0)+1
             FROM compras WHERE folio LIKE 'C-{}%'",
            fecha
        ),
        [],
        |row| row.get(0),
    ).unwrap_or(1);
    let folio = format!("C-{}-{:04}", fecha, siguiente);

    let saldo_pendiente = if request.tipo_pago == "CREDITO" { total } else { 0.0 };
    let monto_pagado    = if request.tipo_pago != "CREDITO" { total } else { 0.0 };
    let estado_pago     = if request.tipo_pago == "CREDITO" { "PENDIENTE" } else { "PAGADO" };

    // Insertar compra — el trigger trg_descontar_credito_proveedor descuenta automático
    let result = conn.execute(
        r"INSERT INTO compras
            (folio, proveedor_id, fecha_compra, subtotal, descuento,
             credito_aplicado, total, tipo_pago, monto_pagado, saldo_pendiente,
             fecha_vencimiento_pago, estado, estado_pago, usuario_id,
             factura_numero, notas)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![
            &folio,
            request.proveedor_id,
            &request.fecha_compra,
            subtotal, descuento, credito_aplicado, total,
            &request.tipo_pago,
            monto_pagado, saldo_pendiente,
            &request.fecha_vencimiento_pago,
            "PENDIENTE", estado_pago,
            usuario_id,
            &request.factura_numero,
            &request.notas,
        ],
    );

    if let Err(e) = result {
        return CompraResponse {
            success: false,
            message: format!("Error al crear compra: {}", e),
            compra_id: None,
            folio: None,
        };
    }

    let compra_id = conn.last_insert_rowid() as i32;

    // Insertar items
    for item in &request.items {
        let subtotal_item = item.precio_compra * item.cantidad as f64;
        if let Err(e) = conn.execute(
            r"INSERT INTO detalles_compra
                (compra_id, producto_id, variante_id, talla, cantidad,
                 cantidad_recibida, cantidad_conforme, precio_compra,
                 precio_venta_sugerido, subtotal)
              VALUES (?,?,?,?,?,0,0,?,?,?)",
            params![
                compra_id,
                item.producto_id,
                item.variante_id,
                &item.talla,
                item.cantidad,
                item.precio_compra,
                item.precio_venta_sugerido,
                subtotal_item,
            ],
        ) {
            return CompraResponse {
                success: false,
                message: format!("Error al insertar item: {}", e),
                compra_id: None,
                folio: None,
            };
        }

        // 🆕 Si el item tiene talla y se cargó un precio de venta sugerido,
        // lo aplicamos directo al precio propio de esa talla — así, tal como
        // pidió el negocio, cada talla puede venderse a un precio distinto.
        if let (Some(variante_id), Some(precio_sugerido)) = (item.variante_id, item.precio_venta_sugerido) {
            if precio_sugerido > 0.0 {
                conn.execute(
                    "UPDATE producto_variantes SET precio = ?, fecha_actualizacion = datetime('now', 'localtime') WHERE id = ?",
                    params![precio_sugerido, variante_id],
                ).ok(); // si falla, no interrumpe el registro de la compra
            }
        }
    }

    CompraResponse {
        success: true,
        message: "Compra registrada exitosamente".to_string(),
        compra_id: Some(compra_id),
        folio: Some(folio),
    }
}

#[tauri::command]
pub fn recibir_mercaderia(
    db: tauri::State<'_, DatabasePool>,
    request: RecibirMercaderiaRequest,
) -> CompraResponse {
    let conn = db.get_conn();

    // Actualizar cantidad_recibida y cantidad_conforme por item
    for item in &request.items {
        // cantidad_conforme no puede ser mayor que cantidad_recibida
        let conforme = item.cantidad_conforme.min(item.cantidad_recibida);

        if let Err(e) = conn.execute(
            "UPDATE detalles_compra SET cantidad_recibida = ?, cantidad_conforme = ? WHERE id = ?",
            params![item.cantidad_recibida, conforme, item.detalle_id],
        ) {
            return CompraResponse {
                success: false,
                message: format!("Error al actualizar item: {}", e),
                compra_id: None,
                folio: None,
            };
        }
    }

    // Determinar estado: RECIBIDA si todo lo pedido está conforme, PARCIAL si no
    let total_items: i32 = conn.query_row(
        "SELECT COUNT(*) FROM detalles_compra WHERE compra_id = ?",
        params![request.compra_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let items_completos: i32 = conn.query_row(
        "SELECT COUNT(*) FROM detalles_compra WHERE compra_id = ? AND cantidad_conforme >= cantidad",
        params![request.compra_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let nuevo_estado = if items_completos == total_items { "RECIBIDA" } else { "PARCIAL" };

    // Calcular cuántos llegaron dañados en total
    let total_danados: f64 = conn.query_row(
        "SELECT COALESCE(SUM(cantidad_recibida - cantidad_conforme), 0)
         FROM detalles_compra WHERE compra_id = ?",
        params![request.compra_id],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Actualizar estado — los triggers trg_after_compra_recibida y
    // trg_recalcular_total_compra se disparan automáticamente
    if let Err(e) = conn.execute(
        r"UPDATE compras SET
            estado = ?,
            fecha_recepcion = datetime('now', 'localtime'),
            notas_recepcion = ?,
            fecha_actualizacion = datetime('now', 'localtime')
          WHERE id = ?",
        params![nuevo_estado, &request.notas_recepcion, request.compra_id],
    ) {
        return CompraResponse {
            success: false,
            message: format!("Error al actualizar compra: {}", e),
            compra_id: None,
            folio: None,
        };
    }

    let msg = if total_danados > 0.0 {
        format!(
            "Mercadería {}. {} unidad(es) dañada(s) — recuerda registrar la devolución al proveedor.",
            if nuevo_estado == "RECIBIDA" { "recibida completamente" } else { "recibida parcialmente" },
            total_danados
        )
    } else {
        format!(
            "Mercadería {}. Stock actualizado automáticamente.",
            if nuevo_estado == "RECIBIDA" { "recibida completamente" } else { "recibida parcialmente" }
        )
    };

    CompraResponse {
        success: true,
        message: msg,
        compra_id: Some(request.compra_id),
        folio: None,
    }
}

#[tauri::command]
pub fn registrar_pago_compra(
    db: tauri::State<'_, DatabasePool>,
    request: RegistrarPagoRequest,
    usuario_id: i32,
) -> CompraResponse {
    let conn = db.get_conn();

    let saldo: f64 = conn.query_row(
        "SELECT saldo_pendiente FROM compras WHERE id = ?",
        params![request.compra_id],
        |row| row.get(0),
    ).unwrap_or(0.0);

    if request.monto > saldo + 0.01 {
        return CompraResponse {
            success: false,
            message: format!(
                "El monto S/ {:.2} supera el saldo pendiente S/ {:.2}",
                request.monto, saldo
            ),
            compra_id: None,
            folio: None,
        };
    }

    // El trigger trg_actualizar_saldo_compra actualiza el saldo automáticamente
    match conn.execute(
        r"INSERT INTO pagos_compra
            (compra_id, monto, metodo_pago, referencia, notas, usuario_id)
          VALUES (?,?,?,?,?,?)",
        params![
            request.compra_id,
            request.monto,
            &request.metodo_pago,
            &request.referencia,
            &request.notas,
            usuario_id,
        ],
    ) {
        Ok(_) => CompraResponse {
            success: true,
            message: format!("Pago de S/ {:.2} registrado. Saldo actualizado.", request.monto),
            compra_id: Some(request.compra_id),
            folio: None,
        },
        Err(e) => CompraResponse {
            success: false,
            message: format!("Error al registrar pago: {}", e),
            compra_id: None,
            folio: None,
        },
    }
}

#[tauri::command]
pub fn cancelar_compra(
    db: tauri::State<'_, DatabasePool>,
    compra_id: i32,
) -> CompraResponse {
    let conn = db.get_conn();

    let estado: Option<String> = conn.query_row(
        "SELECT estado FROM compras WHERE id = ?",
        params![compra_id],
        |row| row.get(0),
    ).optional().unwrap_or(None);

    match estado.as_deref() {
        Some("PENDIENTE") => {},
        Some(e) => return CompraResponse {
            success: false,
            message: format!("No se puede cancelar una compra en estado '{}'", e),
            compra_id: None,
            folio: None,
        },
        None => return CompraResponse {
            success: false,
            message: "Compra no encontrada".to_string(),
            compra_id: None,
            folio: None,
        },
    }

    match conn.execute(
        "UPDATE compras SET estado = 'CANCELADA', fecha_actualizacion = datetime('now','localtime') WHERE id = ?",
        params![compra_id],
    ) {
        Ok(_) => CompraResponse {
            success: true,
            message: "Compra cancelada".to_string(),
            compra_id: Some(compra_id),
            folio: None,
        },
        Err(e) => CompraResponse {
            success: false,
            message: format!("Error: {}", e),
            compra_id: None,
            folio: None,
        },
    }
}

// =====================================================
// DEVOLUCIONES A PROVEEDOR 🆕 v1.5
// =====================================================

#[tauri::command]
pub fn registrar_devolucion_proveedor(
    db: tauri::State<'_, DatabasePool>,
    request: RegistrarDevolucionProveedorRequest,
    usuario_id: i32,
) -> DevolucionProveedorResponse {
    let conn = db.get_conn();

    // Validar que la compra existe y está RECIBIDA o PARCIAL
    let estado_compra: Option<String> = conn.query_row(
        "SELECT estado FROM compras WHERE id = ?",
        params![request.compra_id],
        |row| row.get(0),
    ).optional().unwrap_or(None);

    match estado_compra.as_deref() {
        Some("RECIBIDA") | Some("PARCIAL") => {},
        Some(e) => return DevolucionProveedorResponse {
            success: false,
            message: format!("Solo se puede devolver de compras RECIBIDA o PARCIAL. Estado actual: {}", e),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        },
        None => return DevolucionProveedorResponse {
            success: false,
            message: "Compra no encontrada".to_string(),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        },
    }

    // Validar items y calcular monto total
    if request.items.is_empty() {
        return DevolucionProveedorResponse {
            success: false,
            message: "Debes indicar al menos un producto a devolver".to_string(),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        };
    }

    let monto_total: f64 = request.items.iter()
        .map(|i| i.precio_compra * i.cantidad_devuelta as f64)
        .sum();

    // Generar folio DP-YYYYMMDD-####
    let fecha = chrono::Local::now().format("%Y%m%d").to_string();
    let siguiente: i32 = conn.query_row(
        &format!(
            "SELECT COALESCE(MAX(CAST(substr(folio,-4) AS INTEGER)),0)+1
             FROM devoluciones_proveedor WHERE folio LIKE 'DP-{}%'",
            fecha
        ),
        [],
        |row| row.get(0),
    ).unwrap_or(1);
    let folio = format!("DP-{}-{:04}", fecha, siguiente);

    // Obtener proveedor_id de la compra
    let proveedor_id: i32 = match conn.query_row(
        "SELECT proveedor_id FROM compras WHERE id = ?",
        params![request.compra_id],
        |row| row.get(0),
    ) {
        Ok(id) => id,
        Err(e) => return DevolucionProveedorResponse {
            success: false,
            message: format!("Error al obtener proveedor: {}", e),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        },
    };

    // Insertar devolución cabecera
    if let Err(e) = conn.execute(
        r"INSERT INTO devoluciones_proveedor
            (compra_id, proveedor_id, folio, motivo, detalle_motivo,
             monto_devolucion, estado, usuario_id, notas)
          VALUES (?,?,?,?,?,?,?,?,?)",
        params![
            request.compra_id,
            proveedor_id,
            &folio,
            &request.motivo,
            &request.detalle_motivo,
            monto_total,
            "PENDIENTE",
            usuario_id,
            &request.notas,
        ],
    ) {
        return DevolucionProveedorResponse {
            success: false,
            message: format!("Error al registrar devolución: {}", e),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        };
    }

    let devolucion_id = conn.last_insert_rowid() as i32;

    // Insertar items de la devolución
    for item in &request.items {
        let subtotal_item = item.precio_compra * item.cantidad_devuelta as f64;
        if let Err(e) = conn.execute(
            r"INSERT INTO detalles_devolucion_proveedor
                (devolucion_proveedor_id, detalle_compra_id, producto_id,
                 variante_id, talla, cantidad_devuelta, precio_compra,
                 subtotal, motivo_item)
              VALUES (?,?,?,?,?,?,?,?,?)",
            params![
                devolucion_id,
                item.detalle_compra_id,
                item.producto_id,
                item.variante_id,
                &item.talla,
                item.cantidad_devuelta,
                item.precio_compra,
                subtotal_item,
                &item.motivo_item,
            ],
        ) {
            return DevolucionProveedorResponse {
                success: false,
                message: format!("Error al insertar item: {}", e),
                devolucion_id: None,
                folio: None,
                credito_disponible: None,
            };
        }
    }

    DevolucionProveedorResponse {
        success: true,
        message: format!(
            "Devolución {} registrada por S/ {:.2}. Queda PENDIENTE hasta que el proveedor confirme.",
            folio, monto_total
        ),
        devolucion_id: Some(devolucion_id),
        folio: Some(folio),
        credito_disponible: None,
    }
}

#[tauri::command]
pub fn resolver_devolucion_proveedor(
    db: tauri::State<'_, DatabasePool>,
    request: ResolverDevolucionRequest,
) -> DevolucionProveedorResponse {
    let conn = db.get_conn();

    // Validar que existe y está PENDIENTE
    let estado_actual: Option<String> = conn.query_row(
        "SELECT estado FROM devoluciones_proveedor WHERE id = ?",
        params![request.devolucion_id],
        |row| row.get(0),
    ).optional().unwrap_or(None);

    match estado_actual.as_deref() {
        Some("PENDIENTE") => {},
        Some(e) => return DevolucionProveedorResponse {
            success: false,
            message: format!("Esta devolución ya fue resuelta (estado: {})", e),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        },
        None => return DevolucionProveedorResponse {
            success: false,
            message: "Devolución no encontrada".to_string(),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        },
    }

    // Si se acepta con crédito, tipo_resolucion es obligatorio
    if request.estado == "ACEPTADA" && request.tipo_resolucion.is_none() {
        return DevolucionProveedorResponse {
            success: false,
            message: "Debes indicar el tipo de resolución (CREDITO, REEMBOLSO o CAMBIO)".to_string(),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        };
    }

    // Actualizar — si estado=ACEPTADA y tipo=CREDITO,
    // el trigger trg_credito_proveedor_devolucion suma el crédito automáticamente
    if let Err(e) = conn.execute(
        r"UPDATE devoluciones_proveedor
          SET estado = ?, tipo_resolucion = ?,
              notas = COALESCE(?, notas),
              fecha_resolucion = datetime('now', 'localtime')
          WHERE id = ?",
        params![
            &request.estado,
            &request.tipo_resolucion,
            &request.notas,
            request.devolucion_id,
        ],
    ) {
        return DevolucionProveedorResponse {
            success: false,
            message: format!("Error al resolver devolución: {}", e),
            devolucion_id: None,
            folio: None,
            credito_disponible: None,
        };
    }

    // Obtener crédito actualizado del proveedor
    let credito: f64 = conn.query_row(
        r"SELECT p.credito_disponible
          FROM proveedores p
          JOIN devoluciones_proveedor d ON d.proveedor_id = p.id
          WHERE d.id = ?",
        params![request.devolucion_id],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let msg = match request.estado.as_str() {
        "ACEPTADA" => match request.tipo_resolucion.as_deref() {
            Some("CREDITO") => format!(
                "Devolución aceptada. Se acreditaron S/ {:.2} como saldo a favor para próximas compras.",
                credito
            ),
            Some("REEMBOLSO") => "Devolución aceptada. El proveedor realizará el reembolso.".to_string(),
            Some("CAMBIO") => "Devolución aceptada. El proveedor enviará mercadería de reemplazo.".to_string(),
            _ => "Devolución aceptada.".to_string(),
        },
        "RECHAZADA" => "Devolución rechazada por el proveedor.".to_string(),
        _ => "Estado actualizado.".to_string(),
    };

    DevolucionProveedorResponse {
        success: true,
        message: msg,
        devolucion_id: Some(request.devolucion_id),
        folio: None,
        credito_disponible: Some(credito),
    }
}

#[tauri::command]
pub fn obtener_devoluciones_proveedor(
    db: tauri::State<'_, DatabasePool>,
    compra_id: Option<i32>,
    proveedor_id: Option<i32>,
) -> DevolucionesProveedorResponse {
    let conn = db.get_conn();

    let mut query = String::from(r"
        SELECT d.id, d.compra_id, d.proveedor_id, p.nombre,
               d.folio, d.fecha, d.motivo, d.detalle_motivo,
               d.monto_devolucion, d.estado, d.tipo_resolucion,
               d.notas, d.fecha_resolucion
        FROM devoluciones_proveedor d
        JOIN proveedores p ON d.proveedor_id = p.id
        WHERE 1=1
    ");

    if let Some(cid) = compra_id {
        query.push_str(&format!(" AND d.compra_id = {}", cid));
    }
    if let Some(pid) = proveedor_id {
        query.push_str(&format!(" AND d.proveedor_id = {}", pid));
    }
    query.push_str(" ORDER BY d.fecha DESC");

    let mut stmt = match conn.prepare(&query) {
        Ok(s) => s,
        Err(_) => return DevolucionesProveedorResponse { success: false, devoluciones: vec![] },
    };

    let devs_base: Vec<(i32, DevolucionProveedor)> = match stmt.query_map([], |row| {
        let id: i32 = row.get(0)?;
        Ok((id, DevolucionProveedor {
            id,
            compra_id:        row.get(1)?,
            proveedor_id:     row.get(2)?,
            proveedor_nombre: row.get(3)?,
            folio:            row.get(4)?,
            fecha:            row.get(5)?,
            motivo:           row.get(6)?,
            detalle_motivo:   row.get(7)?,
            monto_devolucion: row.get(8)?,
            estado:           row.get(9)?,
            tipo_resolucion:  row.get(10)?,
            notas:            row.get(11)?,
            fecha_resolucion: row.get(12)?,
            items: vec![],
        }))
    }) {
        Ok(r) => r.filter_map(|r| r.ok()).collect::<Vec<_>>(),
        Err(_) => return DevolucionesProveedorResponse { success: false, devoluciones: vec![] },
    };

    // Cargar items para cada devolución
    let devoluciones: Vec<DevolucionProveedor> = devs_base.into_iter().map(|(id, mut d)| {
        d.items = cargar_items_devolucion(&conn, id);
        d
    }).collect();

    DevolucionesProveedorResponse { success: true, devoluciones }
}

// =====================================================
// HELPERS INTERNOS
// =====================================================

fn row_to_compra(row: &rusqlite::Row) -> rusqlite::Result<Compra> {
    Ok(Compra {
        id:                     row.get(0)?,
        folio:                  row.get(1)?,
        proveedor_id:           row.get(2)?,
        proveedor_nombre:       row.get(3)?,
        fecha_compra:           row.get(4)?,
        fecha_recepcion:        row.get(5)?,
        subtotal:               row.get(6)?,
        descuento:              row.get(7)?,
        credito_aplicado:       row.get(8)?,
        total:                  row.get(9)?,
        tipo_pago:              row.get(10)?,
        monto_pagado:           row.get(11)?,
        saldo_pendiente:        row.get(12)?,
        fecha_vencimiento_pago: row.get(13)?,
        estado:                 row.get(14)?,
        estado_pago:            row.get(15)?,
        factura_numero:         row.get(16)?,
        notas:                  row.get(17)?,
        notas_recepcion:        row.get(18)?,
        usuario_id:             row.get(19)?,
    })
}

fn cargar_devoluciones_de_compra(conn: &rusqlite::Connection, compra_id: i32) -> Vec<DevolucionProveedor> {
    let mut stmt = match conn.prepare(r"
        SELECT d.id, d.compra_id, d.proveedor_id, p.nombre,
               d.folio, d.fecha, d.motivo, d.detalle_motivo,
               d.monto_devolucion, d.estado, d.tipo_resolucion,
               d.notas, d.fecha_resolucion
        FROM devoluciones_proveedor d
        JOIN proveedores p ON d.proveedor_id = p.id
        WHERE d.compra_id = ?
        ORDER BY d.fecha DESC
    ") {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    let devs: Vec<(i32, DevolucionProveedor)> = match stmt.query_map(params![compra_id], |row| {
        let id: i32 = row.get(0)?;
        Ok((id, DevolucionProveedor {
            id,
            compra_id:        row.get(1)?,
            proveedor_id:     row.get(2)?,
            proveedor_nombre: row.get(3)?,
            folio:            row.get(4)?,
            fecha:            row.get(5)?,
            motivo:           row.get(6)?,
            detalle_motivo:   row.get(7)?,
            monto_devolucion: row.get(8)?,
            estado:           row.get(9)?,
            tipo_resolucion:  row.get(10)?,
            notas:            row.get(11)?,
            fecha_resolucion: row.get(12)?,
            items: vec![],
        }))
    }) {
        Ok(r) => r.filter_map(|r| r.ok()).collect(),
        Err(_) => return vec![],
    };

    devs.into_iter().map(|(id, mut d)| {
        d.items = cargar_items_devolucion(conn, id);
        d
    }).collect()
}

fn cargar_items_devolucion(conn: &rusqlite::Connection, devolucion_id: i32) -> Vec<DetalleDevolucionProveedor> {
    let mut stmt = match conn.prepare(r"
        SELECT dd.id, dd.devolucion_proveedor_id, dd.detalle_compra_id,
               dd.producto_id, pr.nombre, dd.variante_id, dd.talla,
               dd.cantidad_devuelta, dd.precio_compra, dd.subtotal, dd.motivo_item
        FROM detalles_devolucion_proveedor dd
        JOIN productos pr ON dd.producto_id = pr.id
        WHERE dd.devolucion_proveedor_id = ?
    ") {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    // Fix E0597: recolectar dentro del bloque antes de que stmt se destruya
    let resultado = match stmt.query_map(params![devolucion_id], |row| {
        Ok(DetalleDevolucionProveedor {
            id:                      row.get(0)?,
            devolucion_proveedor_id: row.get(1)?,
            detalle_compra_id:       row.get(2)?,
            producto_id:             row.get(3)?,
            producto_nombre:         row.get(4)?,
            variante_id:             row.get(5)?,
            talla:                   row.get(6)?,
            cantidad_devuelta:       row.get(7)?,
            precio_compra:           row.get(8)?,
            subtotal:                row.get(9)?,
            motivo_item:             row.get(10)?,
        })
    }) {
        Ok(r) => r.filter_map(|r| r.ok()).collect::<Vec<_>>(),
        Err(_) => vec![],
    };
    resultado
}