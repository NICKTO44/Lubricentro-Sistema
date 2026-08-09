// Caja/CerrarCaja.jsx
import { useState } from 'react';
import { IconLock, IconCreditCard, IconCash, IconChartBar } from '@tabler/icons-react';
import { cerrarCaja, obtenerReporteCierre, formatearMoneda } from '../../services/cajaService';
import './CerrarCaja.css';

function CerrarCaja({ caja, usuario, onCerrar, onCajaCerrada }) {
  const [montoContado, setMontoContado] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const [paso, setPaso] = useState(1);

  // =====================================================
  // CÁLCULOS DE LAS 3 SECCIONES
  // =====================================================

  // SECCIÓN 1: Dinero Digital (nunca estuvo en caja física)
  const totalDigital = (caja.ventas_tarjeta || 0) + (caja.ventas_transferencia || 0);

  // SECCIÓN 2: Efectivo físico
  // 🆕 FIX: ventas_efectivo ya guarda el precio de venta (no lo pagado por el cliente),
  // así que el vuelto ya está neteado ahí — no se resta cambio_total de nuevo.
  // FIX: devoluciones_monto NO se resta acá — ventas_efectivo ya se descuenta
  // solo cuando la devolución fue en efectivo. Restarlo de nuevo duplicaba el
  // descuento (y restaba también devoluciones de tarjeta/transferencia, que
  // nunca salieron físicamente de la caja).
  const efectivoEntradas = (caja.monto_inicial || 0) + (caja.ventas_efectivo || 0) + (caja.ingresos_total || 0);
  const efectivoSalidas = (caja.retiros_total || 0) + (caja.gastos_total || 0);
  const efectivoEsperado = efectivoEntradas - efectivoSalidas;

  // SECCIÓN 3: Total general
  const totalGeneral = totalDigital + efectivoEsperado;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const monto = parseFloat(montoContado);
    if (isNaN(monto) || monto < 0) {
      setError('El monto contado debe ser un número válido');
      return;
    }

    setProcesando(true);
    try {
      const resultado = await cerrarCaja(
        caja.id, monto, usuario.id, usuario.rol_id, observaciones || null
      );

      if (resultado.success) {
        const reporte = await obtenerReporteCierre(caja.id);
        onCajaCerrada(reporte);
      } else {
        setError(resultado.message);
      }
    } catch (err) {
      setError(err.toString());
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="cerrarcaja-overlay" onClick={onCerrar}>
      <div className="modal-cerrar-caja" onClick={(e) => e.stopPropagation()}>
        <div className="cerrarcaja-header">
          <h2><IconLock size={20} stroke={2} /> Cerrar Caja</h2>
          <button className="cerrarcaja-btn-cerrar" onClick={onCerrar}></button>
        </div>

        {/* ======================== PASO 1: RESUMEN ======================== */}
        {paso === 1 && (
          <div className="resumen-caja">

            {error && <div className="error-message"> {error}</div>}

            <div className="resumen-header">
              <span className="turno-badge">{caja.turno}</span>
              <span className="tiempo-transcurrido">
                {caja.hora_apertura} {new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="stats-mini">
                <span>{caja.numero_transacciones} transacciones</span>
                <span>Ticket prom: {formatearMoneda(caja.ticket_promedio)}</span>
              </div>
            </div>

            {/* SECCIÓN 1: DINERO DIGITAL */}
            <div className="seccion-cuadre digital">
              <div className="seccion-titulo">
                <span className="seccion-icono"><IconCreditCard size={18} stroke={2} /></span>
                <span>Dinero Digital</span>
                <span className="seccion-nota">No requiere conteo físico</span>
              </div>
              <div className="seccion-lineas">
                <div className="linea-item">
                  <span>Tarjeta:</span>
                  <span className="monto-neutral">{formatearMoneda(caja.ventas_tarjeta || 0)}</span>
                </div>
                <div className="linea-item">
                  <span>Transferencia:</span>
                  <span className="monto-neutral">{formatearMoneda(caja.ventas_transferencia || 0)}</span>
                </div>
              </div>
              <div className="seccion-total">
                <span>Total Digital:</span>
                <span className="total-digital">{formatearMoneda(totalDigital)}</span>
              </div>
            </div>

            {/* SECCIÓN 2: EFECTIVO FÍSICO */}
            <div className="seccion-cuadre efectivo">
              <div className="seccion-titulo">
                <span className="seccion-icono"><IconCash size={18} stroke={2} /></span>
                <span>Efectivo Físico</span>
                <span className="seccion-nota">Lo que debe haber en caja</span>
              </div>
              <div className="seccion-lineas">
                <div className="linea-item positivo">
                  <span>Monto inicial:</span>
                  <span>+{formatearMoneda(caja.monto_inicial || 0)}</span>
                </div>
                <div className="linea-item positivo">
                  <span>Ventas en efectivo:</span>
                  <span>+{formatearMoneda(caja.ventas_efectivo || 0)}</span>
                </div>
                {(caja.ingresos_total || 0) > 0 && (
                  <div className="linea-item positivo">
                    <span>Ingresos adicionales:</span>
                    <span>+{formatearMoneda(caja.ingresos_total)}</span>
                  </div>
                )}
                <div className="linea-separador"></div>
                {(caja.cambio_total || 0) > 0 && (
                  <div className="linea-item info">
                    <span>Vuelto entregado en el turno (informativo):</span>
                    <span>{formatearMoneda(caja.cambio_total)}</span>
                  </div>
                )}
                {(caja.retiros_total || 0) > 0 && (
                  <div className="linea-item negativo">
                    <span>Retiros (depósitos externos):</span>
                    <span>-{formatearMoneda(caja.retiros_total)}</span>
                  </div>
                )}
                {(caja.gastos_total || 0) > 0 && (
                  <div className="linea-item negativo">
                    <span>Gastos:</span>
                    <span>-{formatearMoneda(caja.gastos_total)}</span>
                  </div>
                )}
                {(caja.devoluciones_monto || 0) > 0 && (
                  <div className="linea-item info">
                    <span>Devoluciones del turno, todos los métodos (informativo):</span>
                    <span>{formatearMoneda(caja.devoluciones_monto)}</span>
                  </div>
                )}
              </div>
              <div className="seccion-total">
                <span>Efectivo esperado en caja:</span>
                <span className="total-efectivo">{formatearMoneda(efectivoEsperado)}</span>
              </div>
            </div>

            {/* SECCIÓN 3: TOTAL GENERAL */}
            <div className="seccion-cuadre total-general">
              <div className="seccion-titulo">
                <span className="seccion-icono"><IconChartBar size={18} stroke={2} /></span>
                <span>Total Recaudado del Turno</span>
              </div>
              <div className="seccion-lineas">
                <div className="linea-item">
                  <span>Total Digital (tarjeta + transferencia):</span>
                  <span>{formatearMoneda(totalDigital)}</span>
                </div>
                <div className="linea-item">
                  <span>Efectivo en caja:</span>
                  <span>{formatearMoneda(efectivoEsperado)}</span>
                </div>
              </div>
              <div className="seccion-total">
                <span>TOTAL GENERAL:</span>
                <span className="total-general-monto">{formatearMoneda(totalGeneral)}</span>
              </div>
            </div>

            <div className="modal-acciones">
              <button type="button" className="btn-cancelar" onClick={onCerrar}>
                Cancelar
              </button>
              <button type="button" className="btn-continuar" onClick={() => setPaso(2)}>
                Continuar 
              </button>
            </div>
          </div>
        )}

        {/* ======================== PASO 2: CONTEO ======================== */}
        {paso === 2 && (
          <form onSubmit={handleSubmit} className="form-cerrar-caja">
            {error && <div className="error-message"> {error}</div>}

            <div className="instruccion">
              <div className="instruccion-icono"><IconCash size={32} stroke={1.6} /></div>
              <div className="instruccion-texto">
                <h4>Cuenta el efectivo físico en caja</h4>
                <p>Solo debes contar los billetes y monedas. Tarjeta y transferencia no se cuentan.</p>
              </div>
            </div>

            {/* Recordatorio rápido de las 3 secciones */}
            <div className="resumen-mini">
              <div className="mini-item digital">
                <span>Digital (tarjeta + transf.)</span>
                <span>{formatearMoneda(totalDigital)}</span>
              </div>
              <div className="mini-item efectivo">
                <span>Efectivo esperado en caja</span>
                <span>{formatearMoneda(efectivoEsperado)}</span>
              </div>
              <div className="mini-item total">
                <span>Total recaudado</span>
                <span>{formatearMoneda(totalGeneral)}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="montoContado">
                Efectivo Contado <span className="required">*</span>
              </label>
              <div className="input-moneda">
                <span className="simbolo-moneda">S/</span>
                <input
                  id="montoContado"
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoContado}
                  onChange={(e) => setMontoContado(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="observaciones">Observaciones (opcional)</label>
              <textarea
                id="observaciones"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: Todo en orden, turno normal"
                rows="3"
              />
            </div>

            <div className="advertencia">
              <span></span>
              <span>Al cerrar la caja no podrás realizar más ventas hasta abrir una nueva</span>
            </div>

            <div className="modal-acciones">
              <button type="button" className="btn-atras" onClick={() => setPaso(1)} disabled={procesando}>
                 Atrás
              </button>
              <button type="submit" className="btn-cerrar-final" disabled={procesando}>
                {procesando ? 'Cerrando...' : ' Cerrar Caja'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CerrarCaja;