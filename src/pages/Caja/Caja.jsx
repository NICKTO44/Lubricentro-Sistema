// Caja/Caja.jsx
// Componente principal de gestión de cajas con historial

import { useState, useEffect } from 'react';
import {
  IconCash,
  IconCreditCard,
  IconArrowsExchange,
  IconTrendingUp,
} from '@tabler/icons-react';
import { 
  obtenerCajaAbierta, 
  verificarCajaAbiertaSistema,
  obtenerHistorialCajas,
  obtenerDetalleCaja,
  calcularEfectivoEsperado,
  formatearDuracion,
  formatearMoneda 
} from '../../services/cajaService';
import AbrirCaja from './AbrirCaja';
import CerrarCaja from './CerrarCaja';
import MovimientoCaja from './MovimientoCaja';
import ReporteCierre from './ReporteCierre';
import './Caja.css';

function Caja({ usuario, onVolver, modoSoloLectura }) {
  // Pestaña activa
  const [pestanaActiva, setPestanaActiva] = useState('mi-caja');

  // Estado caja actual
  const [cajaActual, setCajaActual] = useState(null);
  const [cajaOtraPersona, setCajaOtraPersona] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  // Modales
  const [mostrarModalAbrir, setMostrarModalAbrir] = useState(false);
  const [mostrarModalCerrar, setMostrarModalCerrar] = useState(false);
  const [mostrarModalMovimiento, setMostrarModalMovimiento] = useState(false);
  const [mostrarReporte, setMostrarReporte] = useState(false);
  const [reporteData, setReporteData] = useState(null);

  // Historial
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    turno: '',
  });
  const [detalleModal, setDetalleModal] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const esAdmin = usuario.rol_id === 1;

  useEffect(() => {
    verificarEstadoCaja();
  }, []);

  // Cargar historial al cambiar a esa pestaña
  useEffect(() => {
    if (pestanaActiva === 'historial' && esAdmin) {
      cargarHistorial();
    }
  }, [pestanaActiva]);

  const verificarEstadoCaja = async () => {
    try {
      setCargando(true);
      const miCaja = await obtenerCajaAbierta(usuario.id);
      setCajaActual(miCaja);
      const cajaEnSistema = await verificarCajaAbiertaSistema();
      if (cajaEnSistema && cajaEnSistema.usuario_id !== usuario.id) {
        setCajaOtraPersona(cajaEnSistema);
      } else {
        setCajaOtraPersona(null);
      }
    } catch (error) {
      console.error('Error al verificar caja:', error);
      mostrarMensaje('error', 'Error al verificar estado de caja');
    } finally {
      setCargando(false);
    }
  };

  const cargarHistorial = async (filtrosPersonalizados = null) => {
    try {
      setCargandoHistorial(true);
      const f = filtrosPersonalizados || filtros;
      const data = await obtenerHistorialCajas({
        fechaInicio: f.fechaInicio || null,
        fechaFin: f.fechaFin || null,
        turno: f.turno || null,
        soloCerradas: true,
      });
      setHistorial(data);
    } catch (error) {
      console.error('Error al cargar historial:', error);
      mostrarMensaje('error', 'Error al cargar historial');
    } finally {
      setCargandoHistorial(false);
    }
  };

  const handleVerDetalle = async (cajaId) => {
    try {
      setCargandoDetalle(true);
      const detalle = await obtenerDetalleCaja(cajaId);
      setDetalleModal(detalle);
    } catch (error) {
      console.error('Error al obtener detalle:', error);
      mostrarMensaje('error', 'Error al cargar detalle');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const handleBuscarHistorial = () => {
    cargarHistorial(filtros);
  };

  const handleLimpiarFiltros = () => {
    const filtrosLimpios = { fechaInicio: '', fechaFin: '', turno: '' };
    setFiltros(filtrosLimpios);
    cargarHistorial(filtrosLimpios);
  };

  const handleCajaAbierta = async () => {
    await verificarEstadoCaja();
    setMostrarModalAbrir(false);
    mostrarMensaje('success', ' Caja abierta exitosamente');
  };

  const handleCajaCerrada = async (reporte) => {
    setReporteData(reporte);
    setMostrarModalCerrar(false);
    setMostrarReporte(true);
    await verificarEstadoCaja();
  };

  const handleMovimientoRegistrado = async () => {
    await verificarEstadoCaja();
    setMostrarModalMovimiento(false);
    mostrarMensaje('success', ' Movimiento registrado');
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 4000);
  };

  const calcularTiempoTranscurrido = () => {
    if (!cajaActual?.fecha_apertura) return '0min';
    const ahora = new Date();
    const apertura = new Date(cajaActual.fecha_apertura);
    const diffMs = ahora - apertura;
    const diffMins = Math.floor(diffMs / 60000);
    return formatearDuracion(diffMins);
  };

  const getBadgeDiferencia = (estadoDif) => {
    if (!estadoDif) return null;
    const config = {
      SIN_DIFERENCIA: { clase: 'badge-ok', texto: ' Cuadre exacto' },
      ACEPTABLE: { clase: 'badge-warn', texto: ' Diferencia mínima' },
      SIGNIFICATIVA: { clase: 'badge-error', texto: ' Diferencia significativa' },
    };
    return config[estadoDif] || null;
  };

  if (cargando) {
    return (
      <div className="caja-container">
        <div className="caja-loading">
          <div className="loading-spinner"></div>
          <p>Verificando estado de caja...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="caja-container">
      {/* Header */}
      <div className="caja-header">
        
        <h2>Control de Caja</h2>
        <div className="caja-usuario">{usuario.nombre_completo}</div>
        <button onClick={verificarEstadoCaja} className="btn-refresh" title="Actualizar datos">
          Actualizar
        </button>
      </div>

      {/* Mensaje */}
      {mensaje.texto && (
        <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
      )}

      {/* Banner modo lectura */}
      {modoSoloLectura && (
        <div className="modo-lectura-banner">
          <span className="icono-lectura"></span>
          <span className="texto-lectura">
            Modo Solo Lectura - Activa tu licencia para usar el sistema de cajas
          </span>
        </div>
      )}

      {/* Pestañas — historial solo para admin */}
      <div className="caja-tabs">
        <button
          className={`tab-btn ${pestanaActiva === 'mi-caja' ? 'activa' : ''}`}
          onClick={() => setPestanaActiva('mi-caja')}
        >
           Mi Caja
        </button>
        {esAdmin && (
          <button
            className={`tab-btn ${pestanaActiva === 'historial' ? 'activa' : ''}`}
            onClick={() => setPestanaActiva('historial')}
          >
             Historial
          </button>
        )}
      </div>

      {/* ======================== PESTAÑA MI CAJA ======================== */}
      {pestanaActiva === 'mi-caja' && (
        <div className="caja-content">

          {/* Caja ocupada por otra persona */}
          {cajaOtraPersona && !cajaActual && (
            <div className="caja-bloqueada">
              <div className="icono-bloqueado"></div>
              <h3>Caja Ocupada</h3>
              <p>Ya hay una caja abierta en el sistema</p>
              <div className="info-caja-ocupada">
                <div className="info-item">
                  <span className="label">Turno:</span>
                  <span className="value">{cajaOtraPersona.turno}</span>
                </div>
                <div className="info-item">
                  <span className="label">Hora de apertura:</span>
                  <span className="value">{cajaOtraPersona.hora_apertura}</span>
                </div>
                <div className="info-item">
                  <span className="label">Total vendido:</span>
                  <span className="value">{formatearMoneda(cajaOtraPersona.total_ventas)}</span>
                </div>
              </div>
              <p className="nota-bloqueada">
                Solo puede haber una caja abierta a la vez. Espera a que se cierre o contacta al administrador.
              </p>
            </div>
          )}

          {/* Sin caja abierta */}
          {!cajaActual && !cajaOtraPersona && (
            <div className="caja-sin-abrir">
              <div className="icono-sin-caja"></div>
              <h3>No tienes caja abierta</h3>
              <p>Abre una caja para comenzar a trabajar</p>
              <button
                className="btn-abrir-caja-principal"
                onClick={() => setMostrarModalAbrir(true)}
                disabled={modoSoloLectura}
              >
                {modoSoloLectura ? ' Licencia Expirada' : ' Abrir Caja'}
              </button>
            </div>
          )}

          {/* Caja activa */}
          {cajaActual && (
            <div className="caja-activa">
              <div className="caja-info-card">
                <div className="card-header">
                  <h3>Estado de Caja</h3>
                  <span className={`badge-estado ${cajaActual.llego_tarde ? 'tarde' : 'puntual'}`}>
                    {cajaActual.llego_tarde ? ' Llegó tarde' : ' Puntual'}
                  </span>
                </div>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="label">Turno:</span>
                    <span className="value turno">{cajaActual.turno}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Apertura:</span>
                    <span className="value">{cajaActual.hora_apertura}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Tiempo transcurrido:</span>
                    <span className="value">{calcularTiempoTranscurrido()}</span>
                  </div>
                  <div className="info-item">
                    <span className="label">Monto inicial:</span>
                    <span className="value">{formatearMoneda(cajaActual.monto_inicial)}</span>
                  </div>
                </div>
              </div>

              <div className="caja-ventas-card">
                <h3>Ventas del Turno</h3>
                <div className="ventas-grid">
                  <div className="caja-venta-item efectivo">
                    <div className="venta-icono"><IconCash size={20} stroke={2} /></div>
                    <div className="venta-info">
                      <span className="venta-label">Efectivo</span>
                      <span className="venta-monto">{formatearMoneda(cajaActual.ventas_efectivo)}</span>
                    </div>
                  </div>
                  <div className="caja-venta-item tarjeta">
                    <div className="venta-icono"><IconCreditCard size={20} stroke={2} /></div>
                    <div className="venta-info">
                      <span className="venta-label">Yape</span>
                      <span className="venta-monto">{formatearMoneda(cajaActual.ventas_tarjeta)}</span>
                    </div>
                  </div>
                  <div className="caja-venta-item transferencia">
                    <div className="venta-icono"><IconArrowsExchange size={20} stroke={2} /></div>
                    <div className="venta-info">
                      <span className="venta-label">Transferencia</span>
                      <span className="venta-monto">{formatearMoneda(cajaActual.ventas_transferencia)}</span>
                    </div>
                  </div>
                  <div className="caja-venta-item total">
                    <div className="venta-icono"><IconTrendingUp size={20} stroke={2} /></div>
                    <div className="venta-info">
                      <span className="venta-label">Total Ventas</span>
                      <span className="venta-monto total-destacado">
                        {formatearMoneda(cajaActual.total_ventas)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="ventas-stats">
                  <span> {cajaActual.numero_transacciones} transacciones</span>
                  <span>Ticket promedio: {formatearMoneda(cajaActual.ticket_promedio)}</span>
                </div>
              </div>

              <div className="caja-movimientos-card">
                <h3>Movimientos de Efectivo</h3>
                <div className="movimientos-grid">
                  <div className="movimiento-item retiros">
                    <span className="movimiento-label">Retiros</span>
                    <span className="movimiento-monto negativo">-{formatearMoneda(cajaActual.retiros_total)}</span>
                  </div>
                  <div className="movimiento-item gastos">
                    <span className="movimiento-label">Gastos</span>
                    <span className="movimiento-monto negativo">-{formatearMoneda(cajaActual.gastos_total)}</span>
                  </div>
                  <div className="movimiento-item ingresos">
                    <span className="movimiento-label">Ingresos</span>
                    <span className="movimiento-monto positivo">+{formatearMoneda(cajaActual.ingresos_total)}</span>
                  </div>
                </div>
                <button
                  className="btn-nuevo-movimiento"
                  onClick={() => setMostrarModalMovimiento(true)}
                  disabled={modoSoloLectura}
                >
                   Registrar Movimiento
                </button>
              </div>

              <div className="caja-efectivo-card">
                <h3>Efectivo en Caja</h3>
                <div className="efectivo-calculo">
                  <div className="efectivo-item">
                    <span>Monto inicial:</span>
                    <span>+{formatearMoneda(cajaActual.monto_inicial)}</span>
                  </div>
                  <div className="efectivo-item">
                    <span>Ventas en efectivo:</span>
                    <span>+{formatearMoneda(cajaActual.ventas_efectivo)}</span>
                  </div>
                  <div className="efectivo-item">
                    <span>Ingresos adicionales:</span>
                    <span>+{formatearMoneda(cajaActual.ingresos_total)}</span>
                  </div>
                  <div className="efectivo-item negativo">
                    <span>Retiros:</span>
                    <span>-{formatearMoneda(cajaActual.retiros_total)}</span>
                  </div>
                  <div className="efectivo-item negativo">
                    <span>Gastos:</span>
                    <span>-{formatearMoneda(cajaActual.gastos_total)}</span>
                  </div>
                  <div className="efectivo-item info">
                    <span>Devoluciones del turno, todos los métodos (informativo):</span>
                    <span>{formatearMoneda(cajaActual.devoluciones_monto)}</span>
                  </div>
                  <div className="efectivo-item info">
                    <span>Vuelto entregado (informativo):</span>
                    <span>{formatearMoneda(cajaActual.cambio_total || 0)}</span>
                  </div>
                  <div className="efectivo-total">
                    <span>Efectivo esperado:</span>
                    <span className="total-efectivo">
                      {formatearMoneda(calcularEfectivoEsperado(cajaActual))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="caja-acciones">
                <button
                  className="btn-cerrar-caja"
                  onClick={() => setMostrarModalCerrar(true)}
                  disabled={modoSoloLectura}
                >
                  {modoSoloLectura ? ' Licencia Expirada' : ' Cerrar Caja'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================== PESTAÑA HISTORIAL ======================== */}
      {pestanaActiva === 'historial' && esAdmin && (
        <div className="historial-content">

          {/* Filtros */}
          <div className="historial-filtros">
            <div className="filtro-grupo">
              <label>Desde</label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={e => setFiltros(f => ({ ...f, fechaInicio: e.target.value }))}
                className="filtro-input"
              />
            </div>
            <div className="filtro-grupo">
              <label>Hasta</label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={e => setFiltros(f => ({ ...f, fechaFin: e.target.value }))}
                className="filtro-input"
              />
            </div>
            <div className="filtro-grupo">
              <label>Turno</label>
              <select
                value={filtros.turno}
                onChange={e => setFiltros(f => ({ ...f, turno: e.target.value }))}
                className="filtro-input"
              >
                <option value="">Todos</option>
                <option value="MAÑANA">Mañana</option>
                <option value="TARDE">Tarde</option>
                <option value="NOCHE">Noche</option>
              </select>
            </div>
            <div className="filtro-acciones">
              <button className="btn-buscar" onClick={handleBuscarHistorial}>
                 Buscar
              </button>
              <button className="btn-limpiar" onClick={handleLimpiarFiltros}>
                 Limpiar
              </button>
            </div>
          </div>

          {/* Tabla */}
          {cargandoHistorial ? (
            <div className="historial-loading">
              <div className="loading-spinner"></div>
              <p>Cargando historial...</p>
            </div>
          ) : historial.length === 0 ? (
            <div className="historial-vacio">
              <div className="icono-vacio"></div>
              <p>No hay registros con los filtros seleccionados</p>
            </div>
          ) : (
            <div className="historial-tabla-wrapper">
              <table className="historial-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cajero</th>
                    <th>Turno</th>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th>Duración</th>
                    <th>Ventas</th>
                    <th>Efectivo</th>
                    <th>Yape</th>
                    <th>Transfer.</th>
                    <th>Puntualidad</th>
                    <th>Cuadre</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map(item => {
                    const badge = getBadgeDiferencia(item.estado_diferencia);
                    return (
                      <tr key={item.id} className="historial-fila">
                        <td>{item.fecha_apertura?.split(' ')[0] || '—'}</td>
                        <td className="cajero-nombre">{item.cajero_nombre}</td>
                        <td>
                          <span className={`badge-turno ${item.turno?.toLowerCase()}`}>
                            {item.turno}
                          </span>
                        </td>
                        <td>{item.hora_apertura || '—'}</td>
                        <td>{item.hora_cierre || '—'}</td>
                        <td>{formatearDuracion(item.duracion_turno_minutos)}</td>
                        <td className="monto-destacado">{formatearMoneda(item.total_ventas)}</td>
                        <td>{formatearMoneda(item.ventas_efectivo)}</td>
                        <td>{formatearMoneda(item.ventas_tarjeta)}</td>
                        <td>{formatearMoneda(item.ventas_transferencia)}</td>
                      <td>
                        {item.llego_tarde
                          ? <span className="badge-tarde"> {formatearDuracion(item.minutos_retraso)}</span>
                          : <span className="badge-puntual">Puntual</span>
                        }
                      </td>
                        <td>
                          {badge
                            ? <span className={badge.clase}>{badge.texto}</span>
                            : '—'
                          }
                        </td>
                        <td>
                          <button
                            className="btn-ver-detalle"
                            onClick={() => handleVerDetalle(item.id)}
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen totales */}
          {historial.length > 0 && (
            <div className="historial-resumen">
              <div className="resumen-item">
                <span className="resumen-label">Total registros</span>
                <span className="resumen-valor">{historial.length}</span>
              </div>
              <div className="resumen-item">
                <span className="resumen-label">Total vendido</span>
                <span className="resumen-valor destacado">
                  {formatearMoneda(historial.reduce((s, i) => s + (i.total_ventas || 0), 0))}
                </span>
              </div>
              <div className="resumen-item">
                <span className="resumen-label">Total efectivo</span>
                <span className="resumen-valor">
                  {formatearMoneda(historial.reduce((s, i) => s + (i.ventas_efectivo || 0), 0))}
                </span>
              </div>
              <div className="resumen-item">
                <span className="resumen-label">Total tarjeta</span>
                <span className="resumen-valor">
                  {formatearMoneda(historial.reduce((s, i) => s + (i.ventas_tarjeta || 0), 0))}
                </span>
              </div>
              <div className="resumen-item">
                <span className="resumen-label">Total transferencia</span>
                <span className="resumen-valor">
                  {formatearMoneda(historial.reduce((s, i) => s + (i.ventas_transferencia || 0), 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================== MODAL DETALLE CAJA ======================== */}
      {detalleModal && (
        <div className="modal-overlay" onClick={() => setDetalleModal(null)}>
          <div className="modal-detalle" onClick={e => e.stopPropagation()}>
            <div className="modal-detalle-header">
              <h3>Detalle de Caja</h3>
              <button className="btn-cerrar-modal" onClick={() => setDetalleModal(null)}></button>
            </div>
            <div className="modal-detalle-body">
              {/* Info general */}
              <div className="detalle-seccion">
                <h4>Información General</h4>
                <div className="detalle-grid">
                  <div className="detalle-item">
                    <span className="det-label">Cajero</span>
                    <span className="det-value">{detalleModal.cajero_nombre}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Turno</span>
                    <span className="det-value">{detalleModal.caja.turno}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Fecha</span>
                    <span className="det-value">{detalleModal.caja.fecha_apertura?.split(' ')[0]}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Apertura</span>
                    <span className="det-value">{detalleModal.caja.hora_apertura}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Cierre</span>
                    <span className="det-value">{detalleModal.caja.hora_cierre || '—'}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Duración</span>
                    <span className="det-value">{formatearDuracion(detalleModal.caja.duracion_turno_minutos)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Puntualidad</span>
                    <span className="det-value">
                      {detalleModal.resumen_puntualidad.mensaje}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ventas */}
              <div className="detalle-seccion">
                <h4>Ventas del Turno</h4>
                <div className="detalle-grid">
                  <div className="detalle-item">
                    <span className="det-label">Efectivo</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.ventas_efectivo)}</span>
                  </div>
                  <div className="detalle-item">
                   <span className="det-label">Yape</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.ventas_tarjeta)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Transferencia</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.ventas_transferencia)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Total ventas</span>
                    <span className="det-value destacado">{formatearMoneda(detalleModal.caja.total_ventas)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Transacciones</span>
                    <span className="det-value">{detalleModal.caja.numero_transacciones}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Ticket promedio</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.ticket_promedio)}</span>
                  </div>
                </div>
              </div>

              {/* Cuadre de efectivo */}
              <div className="detalle-seccion">
                <h4>Cuadre de Efectivo</h4>
                <div className="detalle-grid">
                  <div className="detalle-item">
                    <span className="det-label">Monto inicial</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.monto_inicial)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Efectivo esperado</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.efectivo_esperado || 0)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Efectivo contado</span>
                    <span className="det-value">{formatearMoneda(detalleModal.caja.monto_final_contado || 0)}</span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Diferencia</span>
                    <span className={`det-value ${(detalleModal.caja.diferencia || 0) < 0 ? 'negativo' : 'positivo'}`}>
                      {formatearMoneda(detalleModal.caja.diferencia || 0)}
                    </span>
                  </div>
                  <div className="detalle-item">
                    <span className="det-label">Estado</span>
                    <span className="det-value">
                      {detalleModal.resumen_financiero.estado || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Movimientos */}
              {detalleModal.movimientos?.length > 0 && (
                <div className="detalle-seccion">
                  <h4>Movimientos de Efectivo ({detalleModal.movimientos.length})</h4>
                  <div className="movimientos-lista">
                    {detalleModal.movimientos.map(mov => (
                      <div key={mov.id} className={`movimiento-row ${mov.tipo.toLowerCase()}`}>
                        <span className="mov-hora">{mov.hora}</span>
                        <span className={`mov-tipo badge-${mov.tipo.toLowerCase()}`}>{mov.tipo}</span>
                        <span className="mov-motivo">{mov.motivo}</span>
                        <span className="mov-monto">{formatearMoneda(mov.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modales existentes */}
      {mostrarModalAbrir && (
        <AbrirCaja
          usuario={usuario}
          onCerrar={() => setMostrarModalAbrir(false)}
          onCajaAbierta={handleCajaAbierta}
        />
      )}
      {mostrarModalCerrar && cajaActual && (
        <CerrarCaja
          caja={cajaActual}
          usuario={usuario}
          onCerrar={() => setMostrarModalCerrar(false)}
          onCajaCerrada={handleCajaCerrada}
        />
      )}
      {mostrarModalMovimiento && cajaActual && (
        <MovimientoCaja
          cajaId={cajaActual.id}
          onCerrar={() => setMostrarModalMovimiento(false)}
          onMovimientoRegistrado={handleMovimientoRegistrado}
        />
      )}
      {mostrarReporte && reporteData && (
        <ReporteCierre
          reporte={reporteData}
          onCerrar={() => {
            setMostrarReporte(false);
            setReporteData(null);
          }}
        />
      )}
    </div>
  );
}

export default Caja;