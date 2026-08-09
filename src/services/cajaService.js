// services/cajaService.js
// Servicios para gestión de cajas

import { invoke } from '@tauri-apps/api/core';

/**
 * Abrir caja para iniciar turno
 */
export async function abrirCaja(usuarioId, numeroCaja, turno, montoInicial, observaciones = null) {
  try {
    const resultado = await invoke('abrir_caja', {
      request: {
        usuario_id: usuarioId,
        numero_caja: numeroCaja,
        turno,
        monto_inicial: montoInicial,
        observaciones,
      },
    });
    return resultado;
  } catch (error) {
    console.error('Error al abrir caja:', error);
    throw error;
  }
}

/**
 * Cerrar caja al finalizar turno
 */
export async function cerrarCaja(cajaId, montoContado, usuarioId, usuarioRolId, observaciones = null) {
  try {
    const resultado = await invoke('cerrar_caja', {
      request: {
        caja_id: cajaId,
        monto_contado: montoContado,
        desglose: null,
        observaciones,
        justificacion_diferencia: null,
      },
      usuarioId,
      usuarioRolId,
    });
    return resultado;
  } catch (error) {
    console.error('Error al cerrar caja:', error);
    throw error;
  }
}

/**
 * Registrar movimiento de efectivo (retiro, ingreso, gasto)
 */
export async function registrarMovimiento(cajaId, tipo, monto, motivo, autorizadoPor = null, nombreAutorizador = null) {
  try {
    const mensaje = await invoke('registrar_movimiento_efectivo', {
      request: {
        caja_id: cajaId,
        tipo,
        monto,
        motivo,
        autorizado_por: autorizadoPor,
        nombre_autorizador: nombreAutorizador,
      },
    });
    return mensaje;
  } catch (error) {
    console.error('Error al registrar movimiento:', error);
    throw error;
  }
}

/**
 * Obtener caja abierta del usuario actual
 */
export async function obtenerCajaAbierta(usuarioId) {
  try {
    const caja = await invoke('obtener_caja_abierta_usuario', { usuarioId });
    return caja;
  } catch (error) {
    console.error('Error al obtener caja abierta:', error);
    throw error;
  }
}

/**
 * Verificar si hay alguna caja abierta en el sistema
 */
export async function verificarCajaAbiertaSistema() {
  try {
    const caja = await invoke('verificar_caja_abierta_sistema');
    return caja;
  } catch (error) {
    console.error('Error al verificar caja del sistema:', error);
    throw error;
  }
}

/**
 * Obtener reporte de cierre de caja
 */
export async function obtenerReporteCierre(cajaId) {
  try {
    const reporte = await invoke('obtener_reporte_cierre', { cajaId });
    return reporte;
  } catch (error) {
    console.error('Error al obtener reporte:', error);
    throw error;
  }
}

/**
 * 🆕 Obtener historial de cajas cerradas (solo admin)
 * @param {Object} filtros - { fecha_inicio, fecha_fin, turno, usuario_id, solo_cerradas }
 */
export async function obtenerHistorialCajas(filtros = {}) {
  try {
    const historial = await invoke('obtener_historial_cajas', {
      filtros: {
        fecha_inicio: filtros.fechaInicio || null,
        fecha_fin: filtros.fechaFin || null,
        turno: filtros.turno || null,
        usuario_id: filtros.usuarioId || null,
        solo_cerradas: filtros.soloCerradas !== undefined ? filtros.soloCerradas : true,
      },
    });
    return historial;
  } catch (error) {
    console.error('Error al obtener historial de cajas:', error);
    throw error;
  }
}

/**
 * 🆕 Obtener detalle completo de una caja (para modal de detalle)
 * @param {number} cajaId - ID de la caja
 */
export async function obtenerDetalleCaja(cajaId) {
  try {
    const detalle = await invoke('obtener_detalle_caja', { cajaId });
    return detalle;
  } catch (error) {
    console.error('Error al obtener detalle de caja:', error);
    throw error;
  }
}

/**
 * Calcular efectivo esperado en caja
 * 🆕 FIX: ventas_efectivo ya guarda el precio de venta (no lo que pagó el cliente),
 * así que el vuelto ya queda neteado ahí — no hay que restar cambio_total de nuevo.
 * 🔧 FIX: tampoco hay que restar devoluciones_monto acá — ventas_efectivo YA se
 * descuenta solo cuando la devolución fue en efectivo. Restarlo de nuevo acá
 * duplicaba el descuento (y de paso restaba devoluciones de tarjeta/transferencia,
 * que nunca salieron físicamente de la caja).
 */
export function calcularEfectivoEsperado(caja) {
  if (!caja) return 0;
  return (
    caja.monto_inicial +
    caja.ventas_efectivo +
    caja.ingresos_total -
    caja.retiros_total -
    caja.gastos_total
  );
}

/**
 * Formatear tiempo de duración
 */
export function formatearDuracion(minutos) {
  if (!minutos) return '0min';
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  if (horas === 0) return `${mins}min`;
  if (mins === 0) return `${horas}h`;
  return `${horas}h ${mins}min`;
}

/**
 * Formatear moneda
 */
export function formatearMoneda(monto) {
  if (monto === null || monto === undefined) return 'S/ 0.00';
  return `S/ ${Number(monto).toFixed(2)}`;
}