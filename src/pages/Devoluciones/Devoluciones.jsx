import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Devoluciones.css';

function Devoluciones({ usuario, onVolver }) {
  const [folio, setFolio]                           = useState('');
  const [ventaEncontrada, setVentaEncontrada]       = useState(null);
  const [productosSeleccionados, setProductosSeleccionados] = useState({});
  // 🆕 clave: detalle_id (no producto_id, para distinguir misma prenda en distinta talla)
  const [motivo, setMotivo]                         = useState('DEFECTUOSO');
  const [buscando, setBuscando]                     = useState(false);
  const [procesando, setProcesando]                 = useState(false);
  const [mensaje, setMensaje]                       = useState({ tipo: '', texto: '' });
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  const buscarVenta = async () => {
    if (!folio.trim()) { mostrarMensaje('error', ' Ingresa un folio'); return; }
    setBuscando(true);
    try {
      const venta = await invoke('buscar_venta_para_devolucion', { folio: folio.trim() });
      setVentaEncontrada(venta);
      setProductosSeleccionados({});
      mostrarMensaje('success', ' Venta encontrada');
    } catch (error) {
      mostrarMensaje('error', ` ${error}`);
      setVentaEncontrada(null);
    } finally {
      setBuscando(false);
    }
  };

  // 🆕 clave = detalle_id (único por fila de venta, aunque sea el mismo producto)
  const toggleProducto = (detalleId, checked) => {
    if (checked) {
      setProductosSeleccionados(prev => ({ ...prev, [detalleId]: 1 }));
    } else {
      setProductosSeleccionados(prev => {
        const nuevo = { ...prev };
        delete nuevo[detalleId];
        return nuevo;
      });
    }
  };

  const cambiarCantidad = (detalleId, cantidad, maxCantidad) => {
    const c = Math.max(1, Math.min(cantidad, maxCantidad));
    setProductosSeleccionados(prev => ({ ...prev, [detalleId]: c }));
  };

  const calcularTotalDevolucion = () => {
    if (!ventaEncontrada) return 0;
    return Object.entries(productosSeleccionados).reduce((total, [detalleId, cantidad]) => {
      // 🆕 Buscar por detalle_id
      const producto = ventaEncontrada.productos.find(p => p.detalle_id === parseInt(detalleId));
      return total + (producto ? producto.precio_unitario * cantidad : 0);
    }, 0);
  };

  const procesarDevolucion = () => {
    if (Object.keys(productosSeleccionados).length === 0) {
      mostrarMensaje('error', ' Selecciona al menos un producto');
      return;
    }
    setMostrarConfirmacion(true);
  };

  const confirmarDevolucion = async () => {
    setMostrarConfirmacion(false);
    setProcesando(true);
    try {
      // 🆕 Enviar detalle_id y variante_id para devoluciones con tallas
      const productos = Object.entries(productosSeleccionados).map(([detalleId, cantidad]) => {
        const prod = ventaEncontrada.productos.find(p => p.detalle_id === parseInt(detalleId));
        return {
          detalle_id:  parseInt(detalleId),
          producto_id: prod.producto_id,
          variante_id: prod.variante_id || null,
          cantidad,
        };
      });

      const resultado = await invoke('procesar_devolucion', {
        ventaId:      ventaEncontrada.venta_id,
        folioVenta:   ventaEncontrada.folio,
        productos,
        motivo,
        usuarioId:    usuario.id,
      });

      mostrarMensaje('success', ` ${resultado.message} — Folio: ${resultado.folio_devolucion}`);
      setFolio('');
      setVentaEncontrada(null);
      setProductosSeleccionados({});
      setMotivo('DEFECTUOSO');
    } catch (error) {
      mostrarMensaje('error', ` ${error}`);
    } finally {
      setProcesando(false);
    }
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 5000);
  };

  const limpiarFormulario = () => {
    setFolio('');
    setVentaEncontrada(null);
    setProductosSeleccionados({});
    setMotivo('DEFECTUOSO');
  };

  return (
    <div className="devoluciones-container">
      <div className="devoluciones-header">
        <button onClick={onVolver} className="btn-volver">Volver</button>
        <h2>Devoluciones</h2>
        <div className="devoluciones-usuario">{usuario.nombre_completo}</div>
      </div>

      <div className="devoluciones-content">

        {/* Buscar venta */}
        <div className="buscar-venta-card">
          <h3>Buscar Venta por Folio</h3>
          <div className="buscar-input-group">
            <input
              type="text"
              value={folio}
              onChange={(e) => setFolio(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === 'Enter' && buscarVenta()}
              placeholder="Ejemplo: V-20260125-0001"
              disabled={buscando}
            />
            <button onClick={buscarVenta} disabled={buscando} className="btn-buscar">
              {buscando ? 'Buscando...' : ' Buscar'}
            </button>
          </div>
        </div>

        {mensaje.texto && (
          <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
        )}

        {/* Detalles de la venta */}
        {ventaEncontrada && (
          <div className="venta-encontrada">

            <div className="venta-info-card">
              <h3>Información de la Venta</h3>
              <div className="venta-info-grid">
                <div className="info-item">
                  <span className="label">Folio:</span>
                  <span className="value">{ventaEncontrada.folio}</span>
                </div>
                <div className="info-item">
                  <span className="label">Fecha:</span>
                  <span className="value">
                    {new Date(ventaEncontrada.fecha_hora).toLocaleString('es-PE')}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Total Original:</span>
                  <span className="value">S/ {ventaEncontrada.total.toFixed(2)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Método Pago:</span>
                  <span className="value">{ventaEncontrada.metodo_pago}</span>
                </div>
              </div>
            </div>

            {/* Productos */}
            <div className="productos-devolucion-card">
              <h3>Productos de la Venta</h3>
              <p className="instruccion">Selecciona los productos a devolver:</p>

              <div className="productos-lista">
                {ventaEncontrada.productos.map(producto => {
                  // 🆕 clave única = detalle_id
                  const seleccionado = !!productosSeleccionados[producto.detalle_id];
                  // 🆕 Productos vendidos por peso (cantidad con decimales, ej: 1.3 kg) no se
                  // pueden devolver desde acá — devolver una fracción de peso no tiene sentido
                  // y forzar un mínimo de "1" terminaría devolviendo más de lo que se vendió.
                  const esFraccionario = producto.cantidad % 1 !== 0;
                  return (
                    <div
                      key={producto.detalle_id}
                      className={`producto-devolucion-item ${seleccionado ? 'seleccionado' : ''} ${esFraccionario ? 'no-devolvible' : ''}`}
                    >
                      <div className="producto-checkbox">
                        <input
                          type="checkbox"
                          checked={seleccionado}
                          disabled={esFraccionario}
                          onChange={(e) => toggleProducto(producto.detalle_id, e.target.checked)}
                        />
                      </div>

                      <div className="producto-info">
                        <div className="producto-nombre">
                          {producto.nombre}
                          {/* 🆕 Mostrar talla si tiene */}
                          {producto.talla && (
                            <span className="talla-badge-dev">Talla {producto.talla}</span>
                          )}
                        </div>
                        <div className="producto-detalles">
                          Cantidad vendida: {producto.cantidad} |
                          Precio unitario: S/ {producto.precio_unitario.toFixed(2)}
                        </div>
                        {esFraccionario && (
                          <div className="producto-nota-no-devolvible">
                             Vendido por peso — contactá al administrador para esta devolución
                          </div>
                        )}
                      </div>

                      {seleccionado && (
                        <div className="cantidad-devolver">
                          <label>Cant. a devolver:</label>
                          <input
                            type="number"
                            min="1"
                            max={producto.cantidad}
                            value={productosSeleccionados[producto.detalle_id]}
                            onChange={(e) => cambiarCantidad(
                              producto.detalle_id,
                              parseInt(e.target.value) || 1,
                              producto.cantidad
                            )}
                          />
                        </div>
                      )}

                      <div className="producto-subtotal">
                        {seleccionado && (
                          <span className="subtotal-devolucion">
                            S/ {(producto.precio_unitario * productosSeleccionados[producto.detalle_id]).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Motivo y total */}
            {Object.keys(productosSeleccionados).length > 0 && (
              <div className="devolucion-footer">
                <div className="motivo-card">
                  <label>Motivo de devolución:</label>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    <option value="DEFECTUOSO">Producto defectuoso</option>
                    <option value="PRODUCTO_NO_COMPATIBLE">No compatible con el vehículo</option>
                    <option value="NO_LE_GUSTO">No le gustó</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>

                <div className="total-devolucion-card">
                  <div className="total-label">Total a Devolver:</div>
                  <div className="total-monto">S/ {calcularTotalDevolucion().toFixed(2)}</div>
                </div>

                <div className="acciones-devolucion">
                  <button onClick={limpiarFormulario} className="btn-cancelar">
                    Cancelar
                  </button>
                  <button
                    onClick={procesarDevolucion}
                    disabled={procesando}
                    className="btn-procesar-devolucion"
                  >
                    {procesando ? 'Procesando...' : ' Procesar Devolución'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal confirmación */}
      {mostrarConfirmacion && (
        <div className="modal-confirmacion-overlay">
          <div className="modal-confirmacion">
            <h3>Confirmar Devolución</h3>
            <p>¿Estás seguro de procesar esta devolución?</p>
            <div className="confirmacion-detalles">
              <strong>Monto a devolver: S/ {calcularTotalDevolucion().toFixed(2)}</strong>
            </div>
            {/* Resumen de productos seleccionados */}
            <ul style={{ textAlign: 'left', margin: '10px 0', fontSize: '13px', color: '#374151' }}>
              {Object.entries(productosSeleccionados).map(([detalleId, cantidad]) => {
                const prod = ventaEncontrada.productos.find(p => p.detalle_id === parseInt(detalleId));
                return (
                  <li key={detalleId}>
                    {prod?.nombre}{prod?.talla ? ` (Talla ${prod.talla})` : ''} × {cantidad}
                  </li>
                );
              })}
            </ul>
            <div className="confirmacion-acciones">
              <button onClick={() => setMostrarConfirmacion(false)} className="btn-cancelar-modal">
                Cancelar
              </button>
              <button onClick={confirmarDevolucion} className="btn-confirmar-modal">
                 Sí, Procesar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Devoluciones;