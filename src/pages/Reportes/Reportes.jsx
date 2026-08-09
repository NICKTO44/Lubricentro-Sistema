import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  IconShoppingBag,
  IconReplace,
  IconReportMoney,
  IconReceipt,
  IconTrophy,
  IconUser,
  IconCalendarEvent,
  IconSearch,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { obtenerFechaLocalISO } from '../../utils/fecha';
import './Reportes.css';

function Reportes({ usuario, onVolver }) {
  const [ventas, setVentas] = useState([]);
  const [estadisticas, setEstadisticas] = useState(null);
  const [productosVendidos, setProductosVendidos] = useState([]);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [cargando, setCargando] = useState(false);
  const [vistaActual, setVistaActual] = useState('hoy'); // hoy, rango
  const [modoNegocio, setModoNegocio] = useState('LUBRICENTRO'); // 🆕
  const [lotesPorVencer, setLotesPorVencer] = useState([]); // 🆕

  useEffect(() => {
    // Cargar ventas de hoy por defecto
    cargarVentasHoy();
    cargarModoYVencimientos(); // 🆕

    // Establecer fechas por defecto (hoy)
    const hoy = obtenerFechaLocalISO();
    setFechaInicio(hoy);
    setFechaFin(hoy);
  }, []);

  // 🆕 Solo aplica a Lubricentro — productos perecibles próximos a vencer
  const cargarModoYVencimientos = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      const modo = config.modo_negocio || 'ROPA';
      setModoNegocio(modo);
      if (modo === 'LUBRICENTRO') {
        const lotes = await invoke('obtener_lotes_por_vencer', { diasHorizonte: 15 });
        setLotesPorVencer(lotes);
      }
    } catch (e) {
      console.error('Error al cargar vencimientos:', e);
    }
  };

  const cargarVentasHoy = async () => {
    setCargando(true);
    try {
      const ventasHoy = await invoke('obtener_ventas_hoy');
      setVentas(ventasHoy);

      const hoy = obtenerFechaLocalISO();
      const stats = await invoke('obtener_estadisticas_con_devoluciones', {
        fechaInicio: hoy,
        fechaFin: hoy
      });
      setEstadisticas(stats);

      const productos = await invoke('obtener_productos_mas_vendidos', {
        fechaInicio: hoy,
        fechaFin: hoy,
        limite: 10
      });
      setProductosVendidos(productos);

      setVistaActual('hoy');
    } catch (error) {
      console.error('Error al cargar ventas de hoy:', error);
    } finally {
      setCargando(false);
    }
  };

  const cargarVentasRango = async () => {
    if (!fechaInicio || !fechaFin) {
      alert('Selecciona ambas fechas');
      return;
    }

    setCargando(true);
    try {
      const ventasRango = await invoke('obtener_ventas_rango', {
        fechaInicio,
        fechaFin
      });
      setVentas(ventasRango);

      const stats = await invoke('obtener_estadisticas_con_devoluciones', {
        fechaInicio,
        fechaFin
      });
      setEstadisticas(stats);

      const productos = await invoke('obtener_productos_mas_vendidos', {
        fechaInicio,
        fechaFin,
        limite: 10
      });
      setProductosVendidos(productos);

      setVistaActual('rango');
    } catch (error) {
      console.error('Error al cargar ventas por rango:', error);
    } finally {
      setCargando(false);
    }
  };

  const formatearFecha = (fechaStr) => {
    const fecha = new Date(fechaStr + 'T00:00:00');
    return fecha.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="reportes-container">
      <div className="reportes-header">
       
        <h2>Reportes de Ventas</h2>
        <div className="reportes-usuario"> {usuario.nombre_completo}</div>
      </div>

      <div className="reportes-content">
        {/* Filtros */}
        <div className="filtros-panel">
          <div className="filtros-left">
            <button 
              onClick={cargarVentasHoy}
              className={`btn-filtro ${vistaActual === 'hoy' ? 'active' : ''}`}
            >
              <IconCalendarEvent size={17} stroke={2} /> Ventas de Hoy
            </button>
            <div className="rango-fechas">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
              <span>hasta</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
              <button 
                onClick={cargarVentasRango}
                className="btn-buscar"
              >
                <IconSearch size={16} stroke={2} /> Buscar
              </button>
            </div>
          </div>
        </div>

        {cargando ? (
          <div className="cargando">
            <div className="spinner"></div>
            <p>Cargando datos...</p>
          </div>
        ) : (
          <>
            {/* Estadísticas con Devoluciones */}
            {estadisticas && (
              <div className="estadisticas-grid-devoluciones">
                <div className="stat-card-dev ventas">
                  <div className="stat-icono"><IconShoppingBag size={26} stroke={1.8} /></div>
                  <div className="stat-info">
                    <div className="stat-label">VENTAS</div>
                    <div className="stat-valor">S/ {estadisticas.ventas.total.toFixed(2)}</div>
                    <div className="stat-detalle">
                      {estadisticas.ventas.cantidad} ventas | 
                      Ticket promedio: S/ {estadisticas.ventas.ticket_promedio.toFixed(2)}
                    </div>
                  </div>
                </div>

                {estadisticas.devoluciones.cantidad > 0 && (
                  <div className="stat-card-dev devoluciones">
                    <div className="stat-icono"><IconReplace size={26} stroke={1.8} /></div>
                    <div className="stat-info">
                      <div className="stat-label">DEVOLUCIONES</div>
                      <div className="stat-valor">-S/ {estadisticas.devoluciones.total.toFixed(2)}</div>
                      <div className="stat-detalle">
                        {estadisticas.devoluciones.cantidad} devoluciones realizadas
                      </div>
                    </div>
                  </div>
                )}

                <div className="stat-card-dev total-neto">
                  <div className="stat-icono"><IconReportMoney size={26} stroke={1.8} /></div>
                  <div className="stat-info">
                    <div className="stat-label">TOTAL NETO</div>
                    <div className="stat-valor grande">S/ {estadisticas.total_neto.toFixed(2)}</div>
                    <div className="stat-detalle">
                      Ventas - Devoluciones
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="reportes-grid">
              {/* Lista de Ventas */}
              <div className="panel ventas-panel">
                <h3><IconReceipt size={18} stroke={2} /> Lista de Ventas</h3>
                {ventas.length === 0 ? (
                  <div className="sin-datos">
                    <p>No hay ventas en este período</p>
                  </div>
                ) : (
                  <div className="ventas-lista">
                    {ventas.map(venta => (
                      <div key={venta.id} className="venta-item">
                        <div className="venta-header">
                          <span className="venta-folio">
                            {venta.folio}
                            {venta.comprobante_numero && (
                              <span className={`venta-badge-comprobante ${venta.comprobante_tipo === 'FACTURA' ? 'factura' : 'boleta'}`}>
                                 {venta.comprobante_tipo === 'FACTURA' ? 'FACTURA' : 'BOLETA'} {venta.comprobante_numero}
                              </span>
                            )}
                          </span>
                          <span className="venta-total">S/ {venta.total.toFixed(2)}</span>
                        </div>
                        <div className="venta-detalles">
                          <span className="venta-fecha">{venta.fecha_hora}</span>
                          <span className="venta-metodo">{venta.metodo_pago}</span>
                          <span className="venta-cajero"><IconUser size={13} stroke={2} /> {venta.cajero}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Productos Más Vendidos */}
              <div className="panel productos-panel">
                <h3><IconTrophy size={18} stroke={2} /> Top 10 Productos Más Vendidos</h3>
                {productosVendidos.length === 0 ? (
                  <div className="sin-datos">
                    <p>No hay datos disponibles</p>
                  </div>
                ) : (
                  <div className="productos-lista">
                    {productosVendidos.map((producto, index) => (
                      <div key={index} className="producto-item">
                        <div className="producto-ranking">#{index + 1}</div>
                        <div className="producto-info">
                          <div className="producto-nombre">{producto.producto_nombre}</div>
                          <div className="producto-stats">
                            <span>Vendidos: <strong>{producto.cantidad_vendida}</strong></span>
                            <span className="producto-total">S/ {producto.total_vendido.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 🆕 Productos por vencer — solo Lubricentro */}
              {modoNegocio === 'LUBRICENTRO' && (
                <div className="panel productos-panel">
                  <h3><IconAlertTriangle size={18} stroke={2} /> Productos Por Vencer (15 días)</h3>
                  {lotesPorVencer.length === 0 ? (
                    <div className="sin-datos">
                      <p>Nada por vencer en los próximos 15 días</p>
                    </div>
                  ) : (
                    <div className="productos-lista">
                      {lotesPorVencer.map(lote => (
                        <div key={lote.lote_id} className={`producto-item ${lote.dias_restantes < 0 ? 'lote-vencido' : lote.dias_restantes <= 3 ? 'lote-urgente' : ''}`}>
                          <div className="producto-info">
                            <div className="producto-nombre">{lote.producto_nombre}</div>
                            <div className="producto-stats">
                              <span>Cantidad: <strong>{lote.cantidad} {lote.unidad_medida !== 'UNIDAD' ? lote.unidad_medida.toLowerCase() : ''}</strong></span>
                              <span className="producto-total">
                                {lote.dias_restantes < 0
                                  ? ` Vencido hace ${Math.abs(lote.dias_restantes)} día(s)`
                                  : lote.dias_restantes === 0
                                    ? ' Vence hoy'
                                    : `⏳ Vence en ${lote.dias_restantes} día(s)`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Reportes;