// commands/cajas.rs
// Sistema de control de cajas - Solo 1 caja abierta a la vez
// 🆕 Ya NO hay turnos ni restricción de horario: el negocio trabaja un solo
// horario (8am-8pm) y la caja se puede abrir y cerrar en cualquier momento.
// Tampoco se calcula puntualidad ("llegó tarde"): ya no aplica.

use crate::database::DatabasePool;
use crate::models::caja::*;
use rusqlite::{params, OptionalExtension};
use serde_json;

// =====================================================
// COMANDO 1: ABRIR CAJA (solo 1 a la vez, sin restricción de horario)
// =====================================================
#[tauri::command]
pub fn abrir_caja(
    db: tauri::State<DatabasePool>,
    request: AbrirCajaRequest,
) -> Result<CajaResponse, String> {
    let conn = db.get_conn();

    // 1. Verificar que NO haya NINGUNA caja abierta en el sistema (solo hay una caja)
    let caja_abierta_sistema: Option<(i32, String)> = conn
        .query_row(
            "SELECT id, (SELECT nombre_completo FROM usuarios WHERE id = cajas.usuario_id) as cajero 
             FROM cajas 
             WHERE estado = 'ABIERTA'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("Error al verificar cajas abiertas: {}", e))?;

    if let Some((_, cajero)) = caja_abierta_sistema {
        return Err(format!("Ya hay una caja abierta en el sistema (cajero: {}). Debe cerrarse primero.", cajero));
    }

    // 2. Validar monto inicial
    if request.monto_inicial < 0.0 {
        return Err("El monto inicial no puede ser negativo".to_string());
    }

    // 3. Insertar caja — 🆕 sin turno real ni restricción de horario. El
    // campo `turno` se guarda fijo en 'GENERAL' (ya no se valida contra
    // `turnos_configuracion` ni se bloquea según la hora actual).
    let query = r"
        INSERT INTO cajas (
            usuario_id, numero_caja, turno, monto_inicial,
            observaciones_apertura,
            fecha_apertura, hora_apertura
        ) VALUES (?, ?, 'GENERAL', ?, ?,
            datetime('now', 'localtime'),
            strftime('%H:%M:%S', 'now', 'localtime'))
    ";

    conn.execute(
        query,
        params![
            request.usuario_id,
            request.numero_caja,
            request.monto_inicial,
            &request.observaciones,
        ],
    )
    .map_err(|e| format!("Error al abrir caja: {}", e))?;

    let caja_id = conn.last_insert_rowid() as i32;

    // 4. Obtener la caja creada
    let caja = obtener_caja_por_id(&conn, caja_id)?;

    Ok(CajaResponse {
        success: true,
        message: "Caja abierta exitosamente.".to_string(),
        caja: Some(caja),
    })
}

// =====================================================
// COMANDO 2: CERRAR CAJA (solo dueño o admin)
// =====================================================
#[tauri::command]
pub fn cerrar_caja(
    db: tauri::State<DatabasePool>,
    request: CerrarCajaRequest,
    usuario_id: i32,
    usuario_rol_id: i32, // 1 = Admin
) -> Result<CajaResponse, String> {
    let conn = db.get_conn();

    // 1. Verificar que la caja exista y esté abierta
    let caja_info: Option<(i32, f64, f64, f64, f64, f64, f64, f64, String)> = conn
        .query_row(
            r"SELECT usuario_id, monto_inicial, ventas_efectivo, retiros_total, 
                     gastos_total, ingresos_total, devoluciones_monto, cambio_total, fecha_apertura
              FROM cajas 
              WHERE id = ? AND estado = 'ABIERTA'",
            params![request.caja_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error al buscar caja: {}", e))?;

    let (
        caja_usuario_id,
        monto_inicial,
        ventas_efectivo,
        retiros_total,
        gastos_total,
        ingresos_total,
        devoluciones_monto,
        cambio_total,
        fecha_apertura,
    ) = match caja_info {
        Some(c) => c,
        None => return Err("Caja no encontrada o ya está cerrada".to_string()),
    };

    // 2. Verificar permisos: Solo el dueño o admin pueden cerrar
    if caja_usuario_id != usuario_id && usuario_rol_id != 1 {
        return Err("Solo el cajero que abrió la caja o un administrador pueden cerrarla".to_string());
    }

    // 3. Calcular efectivo esperado
    // 🆕 FIX: ventas_efectivo ya guarda el PRECIO de venta (no lo que pagó el cliente),
    // así que el efecto neto en caja de una venta con cambio ya queda correcto sin
    // restar cambio_total de nuevo (si no, se descuenta el vuelto dos veces y el
    // cajero aparece con un "faltante" que en realidad no existe).
    // 🔧 FIX: tampoco hay que restar devoluciones_monto acá — ventas_efectivo YA
    // se descuenta solo cuando la devolución fue en efectivo (ver trigger
    // trg_actualizar_caja_devolucion). Restarlo de nuevo acá duplicaba el
    // descuento de las devoluciones en efectivo, y de paso restaba también
    // las devoluciones por tarjeta/transferencia — plata que nunca salió
    // físicamente de la caja, pero igual aparecía como "faltante".
    let efectivo_esperado = monto_inicial + ventas_efectivo + ingresos_total
        - retiros_total
        - gastos_total;
    let _ = cambio_total; // se sigue guardando como dato informativo, pero no resta del cuadre
    let _ = devoluciones_monto; // informativo — ya está reflejado dentro de ventas_efectivo cuando corresponde
    let _ = fecha_apertura; // ya no se usa para calcular puntualidad

    // 4. Calcular diferencia (guardado internamente, NO se muestra al cajero)
    let diferencia = request.monto_contado - efectivo_esperado;

    // 5. Determinar estado de la diferencia
    let estado_diferencia = if diferencia.abs() < 0.01 {
        "SIN_DIFERENCIA"
    } else if diferencia.abs() <= 10.0 {
        "ACEPTABLE"
    } else {
        "SIGNIFICATIVA"
    };

    // 6. Calcular duración del turno en minutos usando SQLite
    let duracion_minutos: i32 = conn
        .query_row(
            "SELECT CAST((julianday(datetime('now', 'localtime')) - julianday(fecha_apertura)) * 1440 AS INTEGER) FROM cajas WHERE id = ?",
            params![request.caja_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // 7. Convertir desglose a JSON si existe
    let desglose_json = if let Some(desglose) = &request.desglose {
        Some(serde_json::to_string(desglose).unwrap_or_default())
    } else {
        None
    };

    // 8. Actualizar caja (usando localtime)
    let query = r"
        UPDATE cajas
        SET 
            fecha_cierre = datetime('now', 'localtime'),
            hora_cierre = strftime('%H:%M:%S', 'now', 'localtime'),
            monto_final_contado = ?,
            desglose_efectivo = ?,
            observaciones_cierre = ?,
            efectivo_esperado = ?,
            diferencia = ?,
            estado_diferencia = ?,
            justificacion_diferencia = ?,
            duracion_turno_minutos = ?,
            estado = 'CERRADA'
        WHERE id = ?
    ";

    conn.execute(
        query,
        params![
            request.monto_contado,
            desglose_json,
            &request.observaciones,
            efectivo_esperado,
            diferencia,
            estado_diferencia,
            &request.justificacion_diferencia,
            duracion_minutos,
            request.caja_id,
        ],
    )
    .map_err(|e| format!("Error al cerrar caja: {}", e))?;

    // 9. Obtener caja cerrada
    let caja = obtener_caja_por_id(&conn, request.caja_id)?;

    Ok(CajaResponse {
        success: true,
        message: "Caja cerrada exitosamente".to_string(),
        caja: Some(caja),
    })
}

// =====================================================
// COMANDO 3: REGISTRAR MOVIMIENTO DE EFECTIVO
// =====================================================
#[tauri::command]
pub fn registrar_movimiento_efectivo(
    db: tauri::State<DatabasePool>,
    request: RegistrarMovimientoRequest,
) -> Result<String, String> {
    let conn = db.get_conn();

    // 1. Verificar que la caja esté abierta
    let caja_abierta: Option<i32> = conn
        .query_row(
            "SELECT id FROM cajas WHERE id = ? AND estado = 'ABIERTA'",
            params![request.caja_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Error al verificar caja: {}", e))?;

    if caja_abierta.is_none() {
        return Err("La caja no existe o ya está cerrada".to_string());
    }

    // 2. Validar tipo
    if !["RETIRO", "INGRESO", "GASTO"].contains(&request.tipo.as_str()) {
        return Err("Tipo de movimiento no válido".to_string());
    }

    // 3. Validar monto
    if request.monto <= 0.0 {
        return Err("El monto debe ser mayor a 0".to_string());
    }

    // 4. Obtener usuario_id de la caja
    let usuario_id: i32 = conn
        .query_row(
            "SELECT usuario_id FROM cajas WHERE id = ?",
            params![request.caja_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Error al obtener usuario: {}", e))?;

    // 5. Insertar movimiento (usando localtime)
    let query = r"
        INSERT INTO movimientos_caja (
            caja_id, tipo, monto, motivo, 
            autorizado_por, nombre_autorizador, usuario_id,
            fecha_hora, hora
        ) VALUES (?, ?, ?, ?, ?, ?, ?,
            datetime('now', 'localtime'),
            strftime('%H:%M:%S', 'now', 'localtime'))
    ";

    conn.execute(
        query,
        params![
            request.caja_id,
            &request.tipo,
            request.monto,
            &request.motivo,
            &request.autorizado_por,
            &request.nombre_autorizador,
            usuario_id,
        ],
    )
    .map_err(|e| format!("Error al registrar movimiento: {}", e))?;

    Ok(format!(
        "{} de S/ {:.2} registrado exitosamente",
        request.tipo, request.monto
    ))
}

// =====================================================
// COMANDO 4: OBTENER CAJA ABIERTA DEL USUARIO
// =====================================================
#[tauri::command]
pub fn obtener_caja_abierta_usuario(
    db: tauri::State<DatabasePool>,
    usuario_id: i32,
) -> Result<Option<Caja>, String> {
    let conn = db.get_conn();

    let caja_id: Option<i32> = conn
        .query_row(
            "SELECT id FROM cajas WHERE usuario_id = ? AND estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1",
            params![usuario_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Error al buscar caja abierta: {}", e))?;

    match caja_id {
        Some(id) => Ok(Some(obtener_caja_por_id(&conn, id)?)),
        None => Ok(None),
    }
}

// =====================================================
// COMANDO 5: VERIFICAR SI HAY CAJA ABIERTA EN EL SISTEMA
// =====================================================
#[tauri::command]
pub fn verificar_caja_abierta_sistema(
    db: tauri::State<DatabasePool>,
) -> Result<Option<Caja>, String> {
    let conn = db.get_conn();

    let caja_id: Option<i32> = conn
        .query_row(
            "SELECT id FROM cajas WHERE estado = 'ABIERTA' LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Error: {}", e))?;

    match caja_id {
        Some(id) => Ok(Some(obtener_caja_por_id(&conn, id)?)),
        None => Ok(None),
    }
}

// =====================================================
// COMANDO 6: OBTENER REPORTE DE CIERRE
// 🆕 Ya no incluye resumen de puntualidad (no hay turnos ni horario fijo)
// =====================================================
#[tauri::command]
pub fn obtener_reporte_cierre(
    db: tauri::State<DatabasePool>,
    caja_id: i32,
) -> Result<ReporteCierreCaja, String> {
    let conn = db.get_conn();

    let caja = obtener_caja_por_id(&conn, caja_id)?;

    let cajero_nombre: String = conn
        .query_row(
            "SELECT nombre_completo FROM usuarios WHERE id = ?",
            params![caja.usuario_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Error al obtener cajero: {}", e))?;

    let mut stmt = conn
        .prepare(
            r"SELECT id, caja_id, tipo, monto, motivo, autorizado_por, 
                     nombre_autorizador, fecha_hora, hora, usuario_id
              FROM movimientos_caja 
              WHERE caja_id = ? 
              ORDER BY fecha_hora",
        )
        .map_err(|e| format!("Error: {}", e))?;

    let movimientos_iter = stmt
        .query_map(params![caja_id], |row| {
            Ok(MovimientoCaja {
                id: row.get(0)?,
                caja_id: row.get(1)?,
                tipo: row.get(2)?,
                monto: row.get(3)?,
                motivo: row.get(4)?,
                autorizado_por: row.get(5)?,
                nombre_autorizador: row.get(6)?,
                fecha_hora: row.get(7)?,
                hora: row.get(8)?,
                usuario_id: row.get(9)?,
            })
        })
        .map_err(|e| format!("Error: {}", e))?;

    let movimientos: Vec<MovimientoCaja> = movimientos_iter.filter_map(|r| r.ok()).collect();

    let efectivo_calculado = caja.efectivo_esperado.unwrap_or(0.0);
    let efectivo_contado = caja.monto_final_contado.unwrap_or(0.0);
    let diferencia = caja.diferencia.unwrap_or(0.0);

    let resumen_financiero = ResumenFinanciero {
        efectivo_calculado,
        efectivo_contado,
        diferencia,
        estado: caja.estado_diferencia.clone().unwrap_or_default(),
        porcentaje_diferencia: if efectivo_calculado > 0.0 {
            (diferencia / efectivo_calculado) * 100.0
        } else {
            0.0
        },
    };

    Ok(ReporteCierreCaja {
        caja,
        cajero_nombre,
        movimientos,
        resumen_financiero,
    })
}

// =====================================================
// 🆕 COMANDO 7: OBTENER HISTORIAL DE CAJAS (Solo Admin)
// =====================================================
#[tauri::command]
pub fn obtener_historial_cajas(
    db: tauri::State<'_, DatabasePool>,
    filtros: FiltroCajas,
) -> Result<Vec<HistorialCajaItem>, String> {
    let conn = db.get_conn();

    // Construir query dinámico según filtros
    let mut condiciones: Vec<String> = Vec::new();
    
    // Por defecto solo traer cerradas, a menos que se indique lo contrario
    if filtros.solo_cerradas.unwrap_or(true) {
        condiciones.push("c.estado = 'CERRADA'".to_string());
    }

    if let Some(ref fecha_inicio) = filtros.fecha_inicio {
        condiciones.push(format!("date(c.fecha_apertura) >= '{}'", fecha_inicio));
    }

    if let Some(ref fecha_fin) = filtros.fecha_fin {
        condiciones.push(format!("date(c.fecha_apertura) <= '{}'", fecha_fin));
    }

    // 🆕 El filtro de turno ya no se usa (siempre es 'GENERAL'), pero se deja
    // el campo en FiltroCajas por compatibilidad — si llega algo, se ignora.
    let _ = &filtros.turno;

    if let Some(uid) = filtros.usuario_id {
        condiciones.push(format!("c.usuario_id = {}", uid));
    }

    let where_clause = if condiciones.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", condiciones.join(" AND "))
    };

    let query = format!(
        r"SELECT 
            c.id,
            u.nombre_completo as cajero_nombre,
            c.turno,
            c.fecha_apertura,
            c.hora_apertura,
            c.fecha_cierre,
            c.hora_cierre,
            c.total_ventas,
            c.ventas_efectivo,
            c.ventas_tarjeta,
            c.ventas_transferencia,
            c.numero_transacciones,
            c.monto_inicial,
            c.efectivo_esperado,
            c.monto_final_contado,
            c.diferencia,
            c.estado_diferencia,
            c.llego_tarde,
            c.minutos_retraso,
            c.duracion_turno_minutos,
            c.estado
          FROM cajas c
          INNER JOIN usuarios u ON u.id = c.usuario_id
          {}
          ORDER BY c.fecha_apertura DESC",
        where_clause
    );

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Error al preparar query historial: {}", e))?;

    let items_iter = stmt
        .query_map([], |row| {
            Ok(HistorialCajaItem {
                id: row.get(0)?,
                cajero_nombre: row.get(1)?,
                turno: row.get(2)?,
                fecha_apertura: row.get(3)?,
                hora_apertura: row.get(4)?,
                fecha_cierre: row.get(5)?,
                hora_cierre: row.get(6)?,
                total_ventas: row.get(7)?,
                ventas_efectivo: row.get(8)?,
                ventas_tarjeta: row.get(9)?,
                ventas_transferencia: row.get(10)?,
                numero_transacciones: row.get(11)?,
                monto_inicial: row.get(12)?,
                efectivo_esperado: row.get(13)?,
                monto_final_contado: row.get(14)?,
                diferencia: row.get(15)?,
                estado_diferencia: row.get(16)?,
                llego_tarde: row.get::<_, i32>(17)? == 1,
                minutos_retraso: row.get(18)?,
                duracion_turno_minutos: row.get(19)?,
                estado: row.get(20)?,
            })
        })
        .map_err(|e| format!("Error al obtener historial: {}", e))?;

    let items: Vec<HistorialCajaItem> = items_iter.filter_map(|r| r.ok()).collect();

    Ok(items)
}

// =====================================================
// 🆕 COMANDO 8: OBTENER DETALLE COMPLETO DE UNA CAJA
// (Para cuando admin hace clic en un registro del historial)
// 🆕 Ya no incluye resumen de puntualidad
// =====================================================
#[tauri::command]
pub fn obtener_detalle_caja(
    db: tauri::State<DatabasePool>,
    caja_id: i32,
) -> Result<ReporteCierreCaja, String> {
    // Reutiliza exactamente la misma lógica que obtener_reporte_cierre
    // pero funciona tanto para cajas abiertas como cerradas
    let conn = db.get_conn();

    let caja = obtener_caja_por_id(&conn, caja_id)?;

    let cajero_nombre: String = conn
        .query_row(
            "SELECT nombre_completo FROM usuarios WHERE id = ?",
            params![caja.usuario_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Error al obtener cajero: {}", e))?;

    let mut stmt = conn
        .prepare(
            r"SELECT id, caja_id, tipo, monto, motivo, autorizado_por, 
                     nombre_autorizador, fecha_hora, hora, usuario_id
              FROM movimientos_caja 
              WHERE caja_id = ? 
              ORDER BY fecha_hora",
        )
        .map_err(|e| format!("Error: {}", e))?;

    let movimientos_iter = stmt
        .query_map(params![caja_id], |row| {
            Ok(MovimientoCaja {
                id: row.get(0)?,
                caja_id: row.get(1)?,
                tipo: row.get(2)?,
                monto: row.get(3)?,
                motivo: row.get(4)?,
                autorizado_por: row.get(5)?,
                nombre_autorizador: row.get(6)?,
                fecha_hora: row.get(7)?,
                hora: row.get(8)?,
                usuario_id: row.get(9)?,
            })
        })
        .map_err(|e| format!("Error: {}", e))?;

    let movimientos: Vec<MovimientoCaja> = movimientos_iter.filter_map(|r| r.ok()).collect();

    let efectivo_calculado = caja.efectivo_esperado.unwrap_or(0.0);
    let efectivo_contado = caja.monto_final_contado.unwrap_or(0.0);
    let diferencia = caja.diferencia.unwrap_or(0.0);

    let resumen_financiero = ResumenFinanciero {
        efectivo_calculado,
        efectivo_contado,
        diferencia,
        estado: caja.estado_diferencia.clone().unwrap_or_default(),
        porcentaje_diferencia: if efectivo_calculado > 0.0 {
            (diferencia / efectivo_calculado) * 100.0
        } else {
            0.0
        },
    };

    Ok(ReporteCierreCaja {
        caja,
        cajero_nombre,
        movimientos,
        resumen_financiero,
    })
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

fn obtener_caja_por_id(conn: &rusqlite::Connection, caja_id: i32) -> Result<Caja, String> {
    conn.query_row(
        r"SELECT 
            id, usuario_id, numero_caja, turno,
            fecha_apertura, hora_apertura, monto_inicial, observaciones_apertura,
            hora_esperada_inicio, minutos_retraso, llego_tarde,
            fecha_cierre, hora_cierre, hora_esperada_fin, 
            monto_final_contado, observaciones_cierre,
            ventas_efectivo, ventas_tarjeta, ventas_transferencia, 
            total_ventas, numero_transacciones, ticket_promedio,
            devoluciones_monto, devoluciones_cantidad,
            retiros_total, ingresos_total, gastos_total, cambio_total,
            efectivo_esperado, diferencia, estado_diferencia, 
            justificacion_diferencia, estado, duracion_turno_minutos
          FROM cajas WHERE id = ?",
        params![caja_id],
        |row| {
            Ok(Caja {
                id: row.get(0)?,
                usuario_id: row.get(1)?,
                numero_caja: row.get(2)?,
                turno: row.get(3)?,
                fecha_apertura: row.get(4)?,
                hora_apertura: row.get(5)?,
                monto_inicial: row.get(6)?,
                observaciones_apertura: row.get(7)?,
                hora_esperada_inicio: row.get(8)?, // 🆕 ahora Option<String> — puede venir NULL
                minutos_retraso: row.get(9)?,
                llego_tarde: row.get::<_, i32>(10)? == 1,
                fecha_cierre: row.get(11)?,
                hora_cierre: row.get(12)?,
                hora_esperada_fin: row.get(13)?, // 🆕 ahora Option<String>
                monto_final_contado: row.get(14)?,
                observaciones_cierre: row.get(15)?,
                ventas_efectivo: row.get(16)?,
                ventas_tarjeta: row.get(17)?,
                ventas_transferencia: row.get(18)?,
                total_ventas: row.get(19)?,
                numero_transacciones: row.get(20)?,
                ticket_promedio: row.get(21)?,
                devoluciones_monto: row.get(22)?,
                devoluciones_cantidad: row.get(23)?,
                retiros_total: row.get(24)?,
                ingresos_total: row.get(25)?,
                gastos_total: row.get(26)?,
                cambio_total: row.get(27)?,
                efectivo_esperado: row.get(28)?,
                diferencia: row.get(29)?,
                estado_diferencia: row.get(30)?,
                justificacion_diferencia: row.get(31)?,
                estado: row.get(32)?,
                duracion_turno_minutos: row.get(33)?,
            })
        },
    )
    .map_err(|e| format!("Error al obtener caja: {}", e))
}

// =====================================================
// 🆕 MIGRACIÓN: quitar el CHECK de turnos fijos en `cajas`
//
// Antes: `turno` solo podía ser 'MAÑANA' / 'TARDE' / 'NOCHE', ligado a
// horarios fijos en `turnos_configuracion`. Ahora el negocio trabaja un
// solo horario (8am-8pm) y la caja se abre/cierra en cualquier momento —
// `turno` pasa a guardarse fijo como 'GENERAL', sin restricción de valor.
//
// 🔧 FIX: aunque ningún trigger está definido "ON cajas", SQLite sí
// revisa/recompila internamente cualquier trigger cuyo CUERPO mencione
// el nombre "cajas" (como trg_actualizar_caja_venta, que está ON ventas
// pero hace UPDATE cajas...) en el momento del ALTER TABLE ... RENAME TO.
// Si la tabla vieja ya fue eliminada un paso antes en la misma transacción,
// esa recompilación falla con "no such table: main.cajas". La solución,
// igual que ya se aplica en la migración de productos (GALON/METRO), es
// sacar TODOS los triggers de la base antes de tocar la tabla, y
// recrearlos exactamente igual al final.
//
// Idempotente: revisa el SQL de creación de la tabla en sqlite_master y,
// si ya no tiene el CHECK viejo, no hace nada.
//
// IMPORTANTE: llamar esta función UNA VEZ al iniciar la app, junto a las
// demás migraciones idempotentes (después de abrir la conexión a SQLite).
// =====================================================
pub fn migrar_cajas_sin_turno_fijo(conn: &rusqlite::Connection) -> Result<(), String> {
    let sql_actual: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='cajas'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Error al leer esquema de cajas: {}", e))?;

    let necesita_migrar = match &sql_actual {
        Some(sql) => sql.contains("CHECK(turno IN"),
        None => false, // la tabla no existe todavía — nada que migrar
    };

    if !necesita_migrar {
        return Ok(());
    }

    // 🔧 Guardamos el SQL exacto de TODOS los triggers que existan ahora
    // mismo (no solo los que mencionan "cajas") — mismo patrón ya probado
    // en la migración de productos. Los recreamos tal cual al final.
    let triggers_sql: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")
            .map_err(|e| format!("Error al leer triggers: {}", e))?;
        let filas = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Error al leer triggers: {}", e))?;
        filas.filter_map(|r| r.ok()).collect()
    };
    let triggers_nombres: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
            .map_err(|e| format!("Error al leer nombres de triggers: {}", e))?;
        let filas = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Error al leer nombres de triggers: {}", e))?;
        filas.filter_map(|r| r.ok()).collect()
    };

    conn.execute("PRAGMA foreign_keys = OFF", [])
        .map_err(|e| format!("Error al desactivar foreign_keys: {}", e))?;

    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Error al iniciar migración de cajas: {}", e))?;

    let resultado: Result<(), rusqlite::Error> = (|| {
        for nombre in &triggers_nombres {
            conn.execute(&format!("DROP TRIGGER IF EXISTS {}", nombre), [])?;
        }

        conn.execute_batch(
            r#"
            CREATE TABLE cajas_nueva (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              usuario_id INTEGER NOT NULL,
              numero_caja INTEGER DEFAULT 1,
              turno TEXT NOT NULL DEFAULT 'GENERAL',
              fecha_apertura TEXT DEFAULT (datetime('now', 'localtime')),
              hora_apertura TEXT DEFAULT (strftime('%H:%M:%S', 'now', 'localtime')),
              monto_inicial REAL NOT NULL CHECK (monto_inicial >= 0),
              observaciones_apertura TEXT,
              hora_esperada_inicio TEXT,
              minutos_retraso INTEGER DEFAULT 0,
              llego_tarde INTEGER DEFAULT 0,
              fecha_cierre TEXT,
              hora_cierre TEXT,
              hora_esperada_fin TEXT,
              monto_final_contado REAL,
              observaciones_cierre TEXT,
              desglose_efectivo TEXT,
              ventas_efectivo REAL DEFAULT 0,
              ventas_tarjeta REAL DEFAULT 0,
              ventas_transferencia REAL DEFAULT 0,
              total_ventas REAL DEFAULT 0,
              numero_transacciones INTEGER DEFAULT 0,
              ticket_promedio REAL DEFAULT 0,
              devoluciones_monto REAL DEFAULT 0,
              devoluciones_cantidad INTEGER DEFAULT 0,
              retiros_total REAL DEFAULT 0,
              ingresos_total REAL DEFAULT 0,
              gastos_total REAL DEFAULT 0,
              cambio_total REAL DEFAULT 0,
              efectivo_esperado REAL,
              diferencia REAL,
              estado_diferencia TEXT CHECK(estado_diferencia IN ('SIN_DIFERENCIA', 'ACEPTABLE', 'SIGNIFICATIVA')),
              justificacion_diferencia TEXT,
              estado TEXT DEFAULT 'ABIERTA' CHECK(estado IN ('ABIERTA', 'CERRADA')),
              duracion_turno_minutos INTEGER,
              FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
            );

            INSERT INTO cajas_nueva (
              id, usuario_id, numero_caja, turno, fecha_apertura, hora_apertura,
              monto_inicial, observaciones_apertura, hora_esperada_inicio,
              minutos_retraso, llego_tarde, fecha_cierre, hora_cierre,
              hora_esperada_fin, monto_final_contado, observaciones_cierre,
              desglose_efectivo, ventas_efectivo, ventas_tarjeta, ventas_transferencia,
              total_ventas, numero_transacciones, ticket_promedio,
              devoluciones_monto, devoluciones_cantidad, retiros_total,
              ingresos_total, gastos_total, cambio_total, efectivo_esperado,
              diferencia, estado_diferencia, justificacion_diferencia, estado,
              duracion_turno_minutos
            )
            SELECT
              id, usuario_id, numero_caja, turno, fecha_apertura, hora_apertura,
              monto_inicial, observaciones_apertura, hora_esperada_inicio,
              minutos_retraso, llego_tarde, fecha_cierre, hora_cierre,
              hora_esperada_fin, monto_final_contado, observaciones_cierre,
              desglose_efectivo, ventas_efectivo, ventas_tarjeta, ventas_transferencia,
              total_ventas, numero_transacciones, ticket_promedio,
              devoluciones_monto, devoluciones_cantidad, retiros_total,
              ingresos_total, gastos_total, cambio_total, efectivo_esperado,
              diferencia, estado_diferencia, justificacion_diferencia, estado,
              duracion_turno_minutos
            FROM cajas;

            DROP TABLE cajas;
            ALTER TABLE cajas_nueva RENAME TO cajas;

            CREATE INDEX idx_cajas_usuario ON cajas(usuario_id);
            CREATE INDEX idx_cajas_fecha ON cajas(fecha_apertura);
            CREATE INDEX idx_cajas_estado ON cajas(estado);
            CREATE INDEX idx_cajas_turno ON cajas(turno);
            "#,
        )?;

        // Recrear cada trigger, exactamente con el mismo SQL que tenía antes
        for trigger_sql in &triggers_sql {
            conn.execute(trigger_sql, [])?;
        }

        Ok(())
    })();

    if let Err(e) = resultado {
        let _ = conn.execute("ROLLBACK", []);
        let _ = conn.execute("PRAGMA foreign_keys = ON", []);
        return Err(format!("Error en migración de cajas: {}", e));
    }

    conn.execute("COMMIT", [])
        .map_err(|e| format!("Error al confirmar migración de cajas: {}", e))?;

    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Error al reactivar foreign_keys: {}", e))?;

    Ok(())
}