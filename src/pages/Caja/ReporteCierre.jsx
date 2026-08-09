// Caja/ReporteCierre.jsx
import { useRef } from 'react';
import { IconReceipt } from '@tabler/icons-react';
import { formatearMoneda, formatearDuracion } from '../../services/cajaService';
import './ReporteCierre.css';

function ReporteCierre({ reporte, onCerrar }) {
  const reporteRef = useRef(null);

  const handleImprimir = () => window.print();

  const calcularDuracion = () => {
    if (!reporte.caja.fecha_apertura || !reporte.caja.fecha_cierre) return '0min';
    const apertura = new Date(reporte.caja.fecha_apertura);
    const cierre = new Date(reporte.caja.fecha_cierre);
    return formatearDuracion(Math.floor((cierre - apertura) / 60000));
  };

  const formatearFecha = (fechaISO) => {
    if (!fechaISO) return '';
    return new Date(fechaISO).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  };

  // Cálculos de las 3 secciones
  // 🆕 FIX: ventas_efectivo ya guarda el precio de venta (no lo pagado por el cliente),
  // así que el vuelto ya está neteado ahí — no se resta cambio_total de nuevo.
  // FIX: devoluciones_monto NO se resta acá — ventas_efectivo ya se descuenta
  // solo cuando la devolución fue en efectivo. Restarlo de nuevo duplicaba el
  // descuento (y restaba también devoluciones de tarjeta/transferencia).
  const totalDigital = (reporte.caja.ventas_tarjeta || 0) + (reporte.caja.ventas_transferencia || 0);
  const efectivoEsperado =
    (reporte.caja.monto_inicial || 0) +
    (reporte.caja.ventas_efectivo || 0) +
    (reporte.caja.ingresos_total || 0) -
    (reporte.caja.retiros_total || 0) -
    (reporte.caja.gastos_total || 0);
  const totalGeneral = totalDigital + efectivoEsperado;

  return (
    <div className="reportecierre-overlay" onClick={onCerrar}>
      <div className="modal-reporte" onClick={(e) => e.stopPropagation()}>

        <div className="reporte-acciones no-imprimir">
          <button onClick={onCerrar} className="btn-cerrar-reporte">Cerrar</button>
          <button onClick={handleImprimir} className="btn-imprimir">Imprimir</button>
        </div>

        <div ref={reporteRef} className="reporte-contenido">

          {/* HEADER */}
          <div className="reporte-header">
            <div className="reporte-logo"><IconReceipt size={34} stroke={1.6} /></div>
            <h1>REPORTE DE CIERRE DE CAJA</h1>
            <div className="reporte-fecha">{formatearFecha(reporte.caja.fecha_cierre)}</div>
          </div>

          <div className="reporte-divider"></div>

          {/* INFO DEL TURNO */}
          <div className="reporte-seccion">
            <h3>Información del Turno</h3>
            <div className="info-tabla">
              <div className="info-fila">
                <span className="info-label">Cajero:</span>
                <span className="info-valor">{reporte.cajero_nombre}</span>
              </div>
              <div className="info-fila">
                <span className="info-label">Turno:</span>
                <span className="info-valor turno-badge">{reporte.caja.turno}</span>
              </div>
              <div className="info-fila">
                <span className="info-label">Apertura:</span>
                <span className="info-valor">
                  {reporte.caja.hora_apertura}
                  {reporte.resumen_puntualidad.llego_tarde
                    ? <span className="badge-tarde"> {reporte.resumen_puntualidad.mensaje}</span>
                    : <span className="badge-puntual">A tiempo</span>
                  }
                </span>
              </div>
              <div className="info-fila">
                <span className="info-label">Cierre:</span>
                <span className="info-valor">{reporte.caja.hora_cierre}</span>
              </div>
              <div className="info-fila">
                <span className="info-label">Duración:</span>
                <span className="info-valor">{calcularDuracion()}</span>
              </div>
              <div className="info-fila">
                <span className="info-label">Transacciones:</span>
                <span className="info-valor">{reporte.caja.numero_transacciones}</span>
              </div>
              <div className="info-fila">
                <span className="info-label">Ticket promedio:</span>
                <span className="info-valor">{formatearMoneda(reporte.caja.ticket_promedio)}</span>
              </div>
            </div>
          </div>

          <div className="reporte-divider"></div>

          {/* SECCIÓN 1: DINERO DIGITAL */}
          <div className="reporte-seccion reporte-digital">
            <h3>Dinero Digital</h3>
            <p className="seccion-subtitulo">Pagos registrados automáticamente — no requiere conteo físico</p>
            <div className="ventas-tabla">
              <div className="venta-fila">
                <span className="venta-metodo">Tarjeta</span>
                <span className="venta-monto">{formatearMoneda(reporte.caja.ventas_tarjeta || 0)}</span>
              </div>
              <div className="venta-fila">
                <span className="venta-metodo">Transferencia</span>
                <span className="venta-monto">{formatearMoneda(reporte.caja.ventas_transferencia || 0)}</span>
              </div>
              <div className="venta-fila subtotal-digital">
                <span className="venta-metodo"><strong>Total Digital</strong></span>
                <span className="venta-monto"><strong>{formatearMoneda(totalDigital)}</strong></span>
              </div>
            </div>
          </div>

          <div className="reporte-divider"></div>

          {/* SECCIÓN 2: EFECTIVO FÍSICO */}
          <div className="reporte-seccion reporte-efectivo">
            <h3>Efectivo Físico</h3>
            <p className="seccion-subtitulo">Movimientos que afectan el dinero físico en caja</p>
            <div className="calculo-tabla">
              <div className="calculo-fila positivo">
                <span>Monto inicial (fondo de cambio)</span>
                <span>+{formatearMoneda(reporte.caja.monto_inicial || 0)}</span>
              </div>
              <div className="calculo-fila positivo">
                <span>Ventas cobradas en efectivo</span>
                <span>+{formatearMoneda(reporte.caja.ventas_efectivo || 0)}</span>
              </div>
              {(reporte.caja.ingresos_total || 0) > 0 && (
                <div className="calculo-fila positivo">
                  <span>Ingresos adicionales</span>
                  <span>+{formatearMoneda(reporte.caja.ingresos_total)}</span>
                </div>
              )}
              <div className="calculo-separador"></div>
              {(reporte.caja.cambio_total || 0) > 0 && (
                <div className="calculo-fila info">
                  <span>Vuelto entregado en el turno (informativo)</span>
                  <span>{formatearMoneda(reporte.caja.cambio_total)}</span>
                </div>
              )}
              {(reporte.caja.retiros_total || 0) > 0 && (
                <div className="calculo-fila negativo">
                  <span>Retiros (depósitos externos)</span>
                  <span>-{formatearMoneda(reporte.caja.retiros_total)}</span>
                </div>
              )}
              {(reporte.caja.gastos_total || 0) > 0 && (
                <div className="calculo-fila negativo">
                  <span>Gastos del turno</span>
                  <span>-{formatearMoneda(reporte.caja.gastos_total)}</span>
                </div>
              )}
              {(reporte.caja.devoluciones_monto || 0) > 0 && (
                <div className="calculo-fila info">
                  <span>Devoluciones del turno, todos los métodos (informativo)</span>
                  <span>{formatearMoneda(reporte.caja.devoluciones_monto)}</span>
                </div>
              )}
              <div className="calculo-fila subtotal-efectivo">
                <span><strong>Efectivo esperado en caja</strong></span>
                <span><strong>{formatearMoneda(efectivoEsperado)}</strong></span>
              </div>
            </div>
          </div>

          {/* Movimientos detallados si hay */}
          {reporte.movimientos.length > 0 && (
            <>
              <div className="reporte-divider"></div>
              <div className="reporte-seccion">
                <h3>Detalle de Movimientos</h3>
                <div className="movimientos-tabla">
                  {reporte.movimientos.map((mov) => (
                    <div key={mov.id} className={`movimiento-fila ${mov.tipo.toLowerCase()}`}>
                      <div className="movimiento-info">
                        <span className="movimiento-tipo">{mov.tipo}</span>
                        <span className="movimiento-motivo">{mov.motivo}</span>
                        <span className="movimiento-hora">{mov.hora}</span>
                      </div>
                      <span className={`movimiento-monto ${mov.tipo === 'INGRESO' ? 'positivo' : 'negativo'}`}>
                        {mov.tipo === 'INGRESO' ? '+' : '-'}{formatearMoneda(mov.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="reporte-divider"></div>

          {/* SECCIÓN 3: TOTAL GENERAL */}
          <div className="reporte-seccion reporte-total-general">
            <h3>Resumen Total del Turno</h3>
            <div className="total-general-tabla">
              <div className="total-general-fila">
                <span>Total Digital (tarjeta + transferencia)</span>
                <span>{formatearMoneda(totalDigital)}</span>
              </div>
              <div className="total-general-fila">
                <span>Efectivo en caja</span>
                <span>{formatearMoneda(efectivoEsperado)}</span>
              </div>
              <div className="total-general-fila gran-total">
                <span><strong>TOTAL RECAUDADO</strong></span>
                <span><strong>{formatearMoneda(totalGeneral)}</strong></span>
              </div>
            </div>
          </div>

          <div className="reporte-divider"></div>

          {/* EFECTIVO CONTADO */}
          <div className="reporte-seccion destacada">
            <h3>Efectivo Entregado</h3>
            <div className="efectivo-entregado">
              <div className="entregado-label">Monto contado físicamente:</div>
              <div className="entregado-monto">{formatearMoneda(reporte.caja.monto_final_contado)}</div>
            </div>
          </div>

          {/* FIRMAS */}
          <div className="reporte-footer">
            <div className="firma-seccion">
              <div className="firma-linea"></div>
              <div className="firma-label">Firma del Cajero</div>
            </div>
            <div className="firma-seccion">
              <div className="firma-linea"></div>
              <div className="firma-label">Firma del Supervisor</div>
            </div>
          </div>

          <div className="reporte-pie">
            <p>Sistema de Gestión de Tienda</p>
            <p className="fecha-impresion">Impreso: {new Date().toLocaleString('es-PE')}</p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default ReporteCierre;