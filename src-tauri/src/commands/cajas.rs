// commands/cajas.rs
// Sistema de control de cajas - Solo 1 caja abierta a la vez

use crate::database::DatabasePool;
use crate::models::caja::*;
use rusqlite::{params, OptionalExtension};
use serde_json;

// =====================================================
// COMANDO 1: ABRIR CAJA (solo 1 a la vez)
// =====================================================
#[tauri::command]
pub fn abrir_caja(
    db: tauri::State<DatabasePool>,
    request: AbrirCajaRequest,
) -> Result<CajaResponse, String> {
    let conn = db.get_conn();

    // 1. Verificar que NO haya NINGUNA caja abierta en el sistema
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

    // 3. Obtener configuración del turno
    let turno_config: (String, String, i32) = conn
        .query_row(
            "SELECT hora_inicio_esperada, hora_fin_esperada, tolerancia_minutos FROM turnos_configuracion WHERE nombre = ?",
            params![&request.turno],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Turno no válido: {}", e))?;

    let (hora_esperada_inicio, hora_esperada_fin, tolerancia_minutos) = turno_config;

    // 🆕 Bloquear apertura si el turno elegido no es el que corresponde a la hora actual
    // (antes solo se "sugería" visualmente, pero se podía abrir cualquiera igual)
    let turno_actual = turno_actual_segun_hora(&conn)?;
    if turno_actual != request.turno {
        return Err(format!(
            "⏰ Ahora corresponde abrir el turno {} ({} - {}). No podés abrir el turno {} en este horario.",
            turno_actual, hora_esperada_inicio, hora_esperada_fin, request.turno
        ));
    }

    // 4. Calcular si llegó tarde (🆕 respetando los minutos de tolerancia configurados)
    let hora_actual = chrono::Local::now().format("%H:%M:%S").to_string();
    let (llego_tarde, minutos_retraso) = calcular_retraso(&hora_actual, &hora_esperada_inicio, tolerancia_minutos);

    // 5. Insertar caja (usando localtime para las fechas)
    let query = r"
        INSERT INTO cajas (
            usuario_id, numero_caja, turno, monto_inicial, 
            observaciones_apertura, hora_esperada_inicio, hora_esperada_fin,
            minutos_retraso, llego_tarde,
            fecha_apertura, hora_apertura
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 
            datetime('now', 'localtime'),
            strftime('%H:%M:%S', 'now', 'localtime'))
    ";

    conn.execute(
        query,
        params![
            request.usuario_id,
            request.numero_caja,
            &request.turno,
            request.monto_inicial,
            &request.observaciones,
            &hora_esperada_inicio,
            &hora_esperada_fin,
            minutos_retraso,
            if llego_tarde { 1 } else { 0 },
        ],
    )
    .map_err(|e| format!("Error al abrir caja: {}", e))?;

    let caja_id = conn.last_insert_rowid() as i32;

    // 6. Obtener la caja creada
    let caja = obtener_caja_por_id(&conn, caja_id)?;

    Ok(CajaResponse {
        success: true,
        message: if llego_tarde {
            format!(
                "Caja abierta. Llegaste {} minutos tarde.",
                minutos_retraso
            )
        } else {
            "Caja abierta exitosamente. A tiempo.".to_string()
        },
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

    let mensaje_puntualidad = if caja.llego_tarde {
        format!(
            "{}h {}min tarde",
            caja.minutos_retraso / 60,
            caja.minutos_retraso % 60
        )
    } else {
        "A tiempo".to_string()
    };

    let resumen_puntualidad = ResumenPuntualidad {
        hora_esperada: caja.hora_esperada_inicio.clone(),
        hora_real: caja.hora_apertura.clone(),
        llego_tarde: caja.llego_tarde,
        minutos_retraso: caja.minutos_retraso,
        mensaje: mensaje_puntualidad,
    };

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
        resumen_puntualidad,
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

    if let Some(ref turno) = filtros.turno {
        if !turno.is_empty() && turno != "TODOS" {
            condiciones.push(format!("c.turno = '{}'", turno));
        }
    }

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

    let mensaje_puntualidad = if caja.llego_tarde {
        format!(
            "{}h {}min tarde",
            caja.minutos_retraso / 60,
            caja.minutos_retraso % 60
        )
    } else {
        "A tiempo".to_string()
    };

    let resumen_puntualidad = ResumenPuntualidad {
        hora_esperada: caja.hora_esperada_inicio.clone(),
        hora_real: caja.hora_apertura.clone(),
        llego_tarde: caja.llego_tarde,
        minutos_retraso: caja.minutos_retraso,
        mensaje: mensaje_puntualidad,
    };

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
        resumen_puntualidad,
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
                hora_esperada_inicio: row.get(8)?,
                minutos_retraso: row.get(9)?,
                llego_tarde: row.get::<_, i32>(10)? == 1,
                fecha_cierre: row.get(11)?,
                hora_cierre: row.get(12)?,
                hora_esperada_fin: row.get(13)?,
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

// 🆕 Determina qué turno corresponde según la hora actual, recorriendo los
// horarios configurados en `turnos_configuracion`. Maneja turnos que cruzan
// medianoche (ej. Noche 22:00-06:00), donde hora_fin < hora_inicio.
fn turno_actual_segun_hora(conn: &rusqlite::Connection) -> Result<String, String> {
    use chrono::NaiveTime;

    let hora_actual = chrono::Local::now().format("%H:%M:%S").to_string();
    let real = NaiveTime::parse_from_str(&hora_actual, "%H:%M:%S")
        .map_err(|e| format!("Error al parsear hora actual: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT nombre, hora_inicio_esperada, hora_fin_esperada FROM turnos_configuracion")
        .map_err(|e| format!("Error al leer turnos: {}", e))?;

    let turnos = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })
        .map_err(|e| format!("Error al leer turnos: {}", e))?;

    for turno in turnos {
        let (nombre, inicio_str, fin_str) = turno.map_err(|e| format!("Error al leer turno: {}", e))?;
        let inicio = NaiveTime::parse_from_str(&inicio_str, "%H:%M:%S").unwrap();
        let fin = NaiveTime::parse_from_str(&fin_str, "%H:%M:%S").unwrap();

        let dentro_del_rango = if inicio <= fin {
            real >= inicio && real < fin
        } else {
            // El turno cruza medianoche (ej. 22:00 - 06:00)
            real >= inicio || real < fin
        };

        if dentro_del_rango {
            return Ok(nombre);
        }
    }

    Err("No se pudo determinar el turno correspondiente a la hora actual".to_string())
}

fn calcular_retraso(hora_real: &str, hora_esperada: &str, tolerancia_minutos: i32) -> (bool, i32) {
    use chrono::NaiveTime;

    let real = NaiveTime::parse_from_str(hora_real, "%H:%M:%S").unwrap();
    let esperada = NaiveTime::parse_from_str(hora_esperada, "%H:%M:%S").unwrap();

    if real > esperada {
        let diferencia = real.signed_duration_since(esperada);
        let minutos = diferencia.num_minutes() as i32;
        // 🆕 Dentro de la tolerancia configurada (ej. 15 min) no se considera tarde
        (minutos > tolerancia_minutos, minutos)
    } else {
        (false, 0)
    }
}