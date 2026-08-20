import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { obtenerFechaLocalISO } from '../../utils/fecha';
import * as XLSX from 'xlsx';
import './Proveedores.css';

const TALLAS_ROPA    = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const TALLAS_CALZADO = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

function Proveedores({ usuario, modoSoloLectura }) {
  const [tabActual, setTabActual] = useState('compras');
  return (
    <div className="proveedores-container">
      <div className="proveedores-header">
        <div className="prov-header-title">
          <h2>Proveedores y Compras</h2>
          <p>Gestión de proveedores, órdenes de compra y recepción de mercadería</p>
        </div>
      </div>
      <div className="prov-tabs">
        <button className={`prov-tab ${tabActual === 'compras' ? 'active' : ''}`} onClick={() => setTabActual('compras')}> Compras</button>
        <button className={`prov-tab ${tabActual === 'proveedores' ? 'active' : ''}`} onClick={() => setTabActual('proveedores')}> Proveedores</button>
      </div>
      <div className="prov-tab-content">
        {tabActual === 'compras'     && <TabCompras     usuario={usuario} modoSoloLectura={modoSoloLectura} />}
        {tabActual === 'proveedores' && <TabProveedores usuario={usuario} modoSoloLectura={modoSoloLectura} />}
      </div>
    </div>
  );
}

function TabCompras({ usuario, modoSoloLectura }) {
  const [compras, setCompras]                   = useState([]);
  const [proveedores, setProveedores]           = useState([]);
  const [cargando, setCargando]                 = useState(true);
  const [filtroEstado, setFiltroEstado]         = useState('TODAS');
  const [filtroProveedor, setFiltroProveedor]   = useState('');
  const [filtroDesde, setFiltroDesde]           = useState('');
  const [filtroHasta, setFiltroHasta]           = useState('');
  const [vistaAgrupada, setVistaAgrupada]       = useState(false);
  const [modalNuevaCompra, setModalNuevaCompra] = useState(false);
  const [modalDetalle, setModalDetalle]         = useState(null);
  const [mensaje, setMensaje]                   = useState({ tipo: '', texto: '' });

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resCompras, resProv] = await Promise.all([
        invoke('obtener_compras', { proveedorId: null, estado: null }),
        invoke('obtener_proveedores'),
      ]);
      setCompras(resCompras.compras || []);
      setProveedores(resProv.proveedores || []);
    } catch (e) {
      mostrarMensaje('error', `Error al cargar: ${e}`);
    } finally {
      setCargando(false);
    }
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 5000);
  };

  const limpiarFiltros = () => {
    setFiltroEstado('TODAS');
    setFiltroProveedor('');
    setFiltroDesde('');
    setFiltroHasta('');
  };

  const comprasFiltradas = compras.filter(c => {
    const okEstado    = filtroEstado === 'TODAS' || c.estado === filtroEstado;
    const okProveedor = !filtroProveedor || c.proveedor_id === parseInt(filtroProveedor);
    const okDesde     = !filtroDesde || c.fecha_compra >= filtroDesde;
    const okHasta     = !filtroHasta || c.fecha_compra <= filtroHasta;
    return okEstado && okProveedor && okDesde && okHasta;
  });

  // Agrupar por proveedor para vista contable
  const comprasAgrupadas = comprasFiltradas.reduce((acc, c) => {
    if (!acc[c.proveedor_nombre]) {
      acc[c.proveedor_nombre] = {
        nombre:        c.proveedor_nombre,
        compras:       [],
        totalCompras:  0,
        totalPagado:   0,
        totalSaldo:    0,
        numOrdenes:    0,
      };
    }
    acc[c.proveedor_nombre].compras.push(c);
    acc[c.proveedor_nombre].totalCompras += c.total;
    acc[c.proveedor_nombre].totalPagado  += c.monto_pagado || 0;
    acc[c.proveedor_nombre].totalSaldo   += c.saldo_pendiente || 0;
    acc[c.proveedor_nombre].numOrdenes   += 1;
    return acc;
  }, {});

  // Totales generales
  const totalGeneral       = comprasFiltradas.reduce((s, c) => s + c.total, 0);
  const totalPagadoGeneral = comprasFiltradas.reduce((s, c) => s + (c.monto_pagado || 0), 0);
  const totalSaldoGeneral  = comprasFiltradas.reduce((s, c) => s + (c.saldo_pendiente || 0), 0);

  // Exportar a Excel usando SheetJS (disponible como XLSX global)
  const exportarExcel = () => {
    try {

      const wb = XLSX.utils.book_new();

      // Hoja 1: Detalle de compras
      const filasCabecera = [['Folio', 'Proveedor', 'Fecha', 'Total S/', 'Pagado S/', 'Saldo S/', 'Estado', 'Estado Pago', 'Crédito Aplicado S/']];
      const filasDetalle = comprasFiltradas.map(c => [
        c.folio,
        c.proveedor_nombre,
        c.fecha_compra,
        c.total,
        c.monto_pagado || 0,
        c.saldo_pendiente || 0,
        c.estado,
        c.estado_pago,
        c.credito_aplicado || 0,
      ]);
      // Fila de totales
      filasDetalle.push([
        'TOTALES', '', '',
        totalGeneral,
        totalPagadoGeneral,
        totalSaldoGeneral,
        '', '', '',
      ]);

      const wsDetalle = XLSX.utils.aoa_to_sheet([...filasCabecera, ...filasDetalle]);
      // Ancho de columnas
      wsDetalle['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Compras');

      // Hoja 2: Resumen por proveedor
      const filasCabResumen = [['Proveedor', 'N° Órdenes', 'Total Comprado S/', 'Total Pagado S/', 'Saldo Pendiente S/']];
      const filasResumen = Object.values(comprasAgrupadas).map(g => [
        g.nombre,
        g.numOrdenes,
        g.totalCompras,
        g.totalPagado,
        g.totalSaldo,
      ]);
      filasResumen.push([
        'TOTALES',
        comprasFiltradas.length,
        totalGeneral,
        totalPagadoGeneral,
        totalSaldoGeneral,
      ]);

      const wsResumen = XLSX.utils.aoa_to_sheet([...filasCabResumen, ...filasResumen]);
      wsResumen['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen por Proveedor');

      // Nombre del archivo con rango de fechas
      const desde = filtroDesde || 'inicio';
      const hasta = filtroHasta || 'hoy';
      const nombreArchivo = `Compras_Proveedores_${desde}_${hasta}.xlsx`;

      XLSX.writeFile(wb, nombreArchivo);
      mostrarMensaje('success', ` Excel exportado: ${nombreArchivo}`);
    } catch (e) {
      mostrarMensaje('error', `Error al exportar: ${e}`);
    }
  };

  const badgeEstado = (estado) => {
    const mapa = { PENDIENTE: 'badge-pendiente', RECIBIDA: 'badge-recibida', PARCIAL: 'badge-parcial', CANCELADA: 'badge-cancelada' };
    return <span className={`badge-estado ${mapa[estado] || ''}`}>{estado}</span>;
  };

  const badgePago = (estado) => {
    const mapa = { PENDIENTE: 'badge-pago-pendiente', PARCIAL: 'badge-pago-parcial', PAGADO: 'badge-pago-ok' };
    return <span className={`badge-pago ${mapa[estado] || ''}`}>{estado}</span>;
  };

  const hayFiltrosActivos = filtroEstado !== 'TODAS' || filtroProveedor || filtroDesde || filtroHasta;

  return (
    <div className="tab-compras">

      {/* Barra de filtros */}
      <div className="filtros-bar-wrap">
        <div className="filtros-fila">
          <div className="filtros-grupo">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="filtro-select">
              <option value="TODAS">Todos los estados</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PARCIAL">Parcial</option>
              <option value="RECIBIDA">Recibida</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
            <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="filtro-select">
              <option value="">Todos los proveedores</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <div className="filtro-fecha-grupo">
              <label className="filtro-fecha-label">Desde</label>
              <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="filtro-fecha" />
            </div>
            <div className="filtro-fecha-grupo">
              <label className="filtro-fecha-label">Hasta</label>
              <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="filtro-fecha" />
            </div>
            {hayFiltrosActivos && (
              <button className="btn-limpiar-filtros" onClick={limpiarFiltros} title="Limpiar filtros">Limpiar</button>
            )}
          </div>
          <div className="filtros-acciones">
            <button
              className={`btn-vista-toggle ${vistaAgrupada ? 'activo' : ''}`}
              onClick={() => setVistaAgrupada(v => !v)}
              title="Agrupar por proveedor"
            >
              {vistaAgrupada ? ' Ver detalle' : ' Agrupar por proveedor'}
            </button>
            <button className="btn-exportar-excel" onClick={exportarExcel} title="Exportar a Excel">
               Excel
            </button>
            {!modoSoloLectura && (
              <button className="btn-nueva-compra" onClick={() => setModalNuevaCompra(true)}>+ Nueva Compra</button>
            )}
          </div>
        </div>

        {/* Resumen rápido de lo filtrado */}
        {comprasFiltradas.length > 0 && (
          <div className="resumen-filtro-bar">
            <span className="resumen-filtro-item">
              <span className="resumen-filtro-label">Órdenes:</span>
              <strong>{comprasFiltradas.length}</strong>
            </span>
            <span className="resumen-filtro-sep">|</span>
            <span className="resumen-filtro-item">
              <span className="resumen-filtro-label">Total comprado:</span>
              <strong>S/ {totalGeneral.toFixed(2)}</strong>
            </span>
            <span className="resumen-filtro-sep">|</span>
            <span className="resumen-filtro-item">
              <span className="resumen-filtro-label">Pagado:</span>
              <strong className="pago-ok">S/ {totalPagadoGeneral.toFixed(2)}</strong>
            </span>
            <span className="resumen-filtro-sep">|</span>
            <span className="resumen-filtro-item">
              <span className="resumen-filtro-label">Saldo pendiente:</span>
              <strong className={totalSaldoGeneral > 0 ? 'saldo-pendiente' : 'pago-ok'}>
                S/ {totalSaldoGeneral.toFixed(2)}
              </strong>
            </span>
          </div>
        )}
      </div>

      {mensaje.texto && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {cargando ? (
        <div className="cargando-centro">Cargando compras...</div>
      ) : comprasFiltradas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"></div>
          <h3>No hay compras {hayFiltrosActivos ? 'con esos filtros' : 'registradas'}</h3>
          <p>{hayFiltrosActivos ? 'Prueba ajustando los filtros' : 'Crea tu primera orden de compra'}</p>
        </div>
      ) : vistaAgrupada ? (

        /* ── VISTA AGRUPADA POR PROVEEDOR ── */
        <div className="vista-agrupada">
          {Object.values(comprasAgrupadas).map(grupo => (
            <div key={grupo.nombre} className="grupo-proveedor-card">
              <div className="grupo-proveedor-header">
                <div className="grupo-proveedor-info">
                  <span className="grupo-proveedor-nombre"> {grupo.nombre}</span>
                  <span className="grupo-proveedor-meta">{grupo.numOrdenes} orden{grupo.numOrdenes !== 1 ? 'es' : ''}</span>
                </div>
                <div className="grupo-proveedor-totales">
                  <div className="grupo-total-item">
                    <span>Total</span>
                    <strong>S/ {grupo.totalCompras.toFixed(2)}</strong>
                  </div>
                  <div className="grupo-total-item">
                    <span>Pagado</span>
                    <strong className="pago-ok">S/ {grupo.totalPagado.toFixed(2)}</strong>
                  </div>
                  <div className="grupo-total-item">
                    <span>Saldo</span>
                    <strong className={grupo.totalSaldo > 0 ? 'saldo-pendiente' : 'pago-ok'}>
                      S/ {grupo.totalSaldo.toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>
              <table className="tabla-compras tabla-compras-grupo">
                <thead>
                  <tr>
                    <th>Folio</th><th>Fecha</th><th>Total</th>
                    <th>Pagado</th><th>Saldo</th><th>Estado</th><th>Pago</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.compras.map(c => (
                    <tr key={c.id}>
                      <td className="folio-cell">{c.folio}</td>
                      <td>{c.fecha_compra}</td>
                      <td className="monto-cell">S/ {c.total.toFixed(2)}</td>
                      <td className="monto-cell pago-ok">S/ {(c.monto_pagado || 0).toFixed(2)}</td>
                      <td className={`monto-cell ${c.saldo_pendiente > 0 ? 'saldo-pendiente' : 'saldo-ok'}`}>
                        S/ {c.saldo_pendiente.toFixed(2)}
                      </td>
                      <td>{badgeEstado(c.estado)}</td>
                      <td>{badgePago(c.estado_pago)}</td>
                      <td><button className="btn-ver-detalle" onClick={() => setModalDetalle(c)}>Ver</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Totales generales */}
          <div className="grupo-totales-generales">
            <span>TOTAL GENERAL — {comprasFiltradas.length} órdenes</span>
            <span>Comprado: <strong>S/ {totalGeneral.toFixed(2)}</strong></span>
            <span>Pagado: <strong className="pago-ok">S/ {totalPagadoGeneral.toFixed(2)}</strong></span>
            <span>Saldo: <strong className={totalSaldoGeneral > 0 ? 'saldo-pendiente' : 'pago-ok'}>S/ {totalSaldoGeneral.toFixed(2)}</strong></span>
          </div>
        </div>

      ) : (

        /* ── VISTA DETALLE NORMAL ── */
        <div className="tabla-wrapper">
          <table className="tabla-compras">
            <thead>
              <tr>
                <th>Folio</th><th>Proveedor</th><th>Fecha</th>
                <th>Total</th><th>Saldo</th><th>Estado</th><th>Pago</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comprasFiltradas.map(c => (
                <tr key={c.id}>
                  <td className="folio-cell">{c.folio}</td>
                  <td>{c.proveedor_nombre}</td>
                  <td>{c.fecha_compra}</td>
                  <td className="monto-cell">S/ {c.total.toFixed(2)}</td>
                  <td className={`monto-cell ${c.saldo_pendiente > 0 ? 'saldo-pendiente' : 'saldo-ok'}`}>
                    S/ {c.saldo_pendiente.toFixed(2)}
                  </td>
                  <td>{badgeEstado(c.estado)}</td>
                  <td>{badgePago(c.estado_pago)}</td>
                  <td><button className="btn-ver-detalle" onClick={() => setModalDetalle(c)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fila-totales-tabla">
                <td colSpan={3}><strong>TOTALES ({comprasFiltradas.length} órdenes)</strong></td>
                <td className="monto-cell"><strong>S/ {totalGeneral.toFixed(2)}</strong></td>
                <td className={`monto-cell ${totalSaldoGeneral > 0 ? 'saldo-pendiente' : 'saldo-ok'}`}>
                  <strong>S/ {totalSaldoGeneral.toFixed(2)}</strong>
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {modalNuevaCompra && (
        <ModalNuevaCompra
          proveedores={proveedores}
          usuario={usuario}
          onClose={() => setModalNuevaCompra(false)}
          onSuccess={() => { setModalNuevaCompra(false); cargarDatos(); mostrarMensaje('success', ' Compra registrada'); }}
          onError={(e) => mostrarMensaje('error', ` ${e}`)}
        />
      )}

      {modalDetalle && (
        <ModalDetalleCompra
          compraResumen={modalDetalle}
          usuario={usuario}
          modoSoloLectura={modoSoloLectura}
          onClose={() => setModalDetalle(null)}
          onRefresh={() => { cargarDatos(); }}
          onSuccess={(msg) => mostrarMensaje('success', ` ${msg}`)}
          onError={(e) => mostrarMensaje('error', ` ${e}`)}
        />
      )}
    </div>
  );
}

function TabProveedores({ usuario, modoSoloLectura }) {
  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [busqueda, setBusqueda]       = useState('');
  const [modalForm, setModalForm]     = useState(false);
  const [provEditar, setProvEditar]   = useState(null);
  const [mensaje, setMensaje]         = useState({ tipo: '', texto: '' });

  useEffect(() => { cargarProveedores(); }, []);

  const cargarProveedores = async () => {
    setCargando(true);
    try {
      const res = await invoke('obtener_proveedores');
      setProveedores(res.proveedores || []);
    } catch (e) {
      mostrarMensaje('error', `Error: ${e}`);
    } finally {
      setCargando(false);
    }
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 5000);
  };

  const eliminarProveedor = async (id, nombre) => {
    if (!confirm(`¿Eliminar proveedor "${nombre}"?`)) return;
    try {
      await invoke('eliminar_proveedor', { proveedorId: id });
      mostrarMensaje('success', ' Proveedor eliminado');
      cargarProveedores();
    } catch (e) {
      mostrarMensaje('error', ` ${e}`);
    }
  };

  const provFiltrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.numero_documento || '').includes(busqueda)
  );

  return (
    <div className="tab-proveedores">
      <div className="filtros-bar">
        <input type="text" placeholder=" Buscar por nombre o RUC..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} className="busqueda-input" />
        {!modoSoloLectura && (
          <button className="btn-nueva-compra" onClick={() => { setProvEditar(null); setModalForm(true); }}>+ Nuevo Proveedor</button>
        )}
      </div>

      {mensaje.texto && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      {cargando ? (
        <div className="cargando-centro">Cargando proveedores...</div>
      ) : provFiltrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"></div>
          <h3>No hay proveedores registrados</h3>
          <p>Agrega tu primer proveedor</p>
        </div>
      ) : (
        <div className="tabla-wrapper">
          <table className="tabla-proveedores">
            <thead>
              <tr>
                <th>Nombre</th><th>RUC / DNI</th><th>Contacto</th>
                <th>Teléfono</th><th>Total Compras</th><th>Crédito</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {provFiltrados.map(p => (
                <tr key={p.id}>
                  <td className="nombre-proveedor">{p.nombre}</td>
                  <td className="doc-cell"><span className="doc-tipo">{p.tipo_documento}</span>{p.numero_documento || '—'}</td>
                  <td>{p.contacto || '—'}</td>
                  <td>{p.telefono || '—'}</td>
                  <td className="monto-cell total-compras">S/ {(p.total_compras || 0).toFixed(2)}</td>
                  <td className="monto-cell">
                    {(p.credito_disponible || 0) > 0
                      ? <span className="credito-chip">S/ {p.credito_disponible.toFixed(2)}</span>
                      : '—'}
                  </td>
                  <td className="acciones-cell">
                    <button className="btn-editar-prov" onClick={() => { setProvEditar(p); setModalForm(true); }}>Editar</button>
                    {!modoSoloLectura && (
                      <button className="btn-eliminar-prov" onClick={() => eliminarProveedor(p.id, p.nombre)}>Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalForm && (
        <ModalFormProveedor
          proveedor={provEditar}
          onClose={() => setModalForm(false)}
          onSuccess={(msg) => { setModalForm(false); cargarProveedores(); mostrarMensaje('success', ` ${msg}`); }}
          onError={(e) => mostrarMensaje('error', ` ${e}`)}
        />
      )}
    </div>
  );
}

function ModalFormProveedor({ proveedor, onClose, onSuccess, onError }) {
  const esEdicion = !!proveedor;
  const [form, setForm] = useState({
    nombre:           proveedor?.nombre || '',
    contacto:         proveedor?.contacto || '',
    telefono:         proveedor?.telefono || '',
    email:            proveedor?.email || '',
    direccion:        proveedor?.direccion || '',
    tipo_documento:   proveedor?.tipo_documento || 'RUC',
    numero_documento: proveedor?.numero_documento || '',
    banco:            proveedor?.banco || '',
    numero_cuenta:    proveedor?.numero_cuenta || '',
    notas:            proveedor?.notas || '',
  });
  const [guardando, setGuardando] = useState(false);

  const handleChange = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    if (!form.nombre.trim()) { onError('El nombre es obligatorio'); return; }
    setGuardando(true);
    try {
      if (esEdicion) {
        await invoke('actualizar_proveedor', { proveedorId: proveedor.id, proveedor: form });
        onSuccess('Proveedor actualizado');
      } else {
        await invoke('agregar_proveedor', { proveedor: form });
        onSuccess('Proveedor agregado');
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-prov" onClick={e => e.stopPropagation()}>
        <div className="modal-prov-header">
          <h3>{esEdicion ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-prov-body">
          <div className="form-grid-2">
            <div className="form-group full">
              <label>Nombre del proveedor *</label>
              <input value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} placeholder="Ej: Textiles Lima SAC" />
            </div>
            <div className="form-group">
              <label>Tipo documento</label>
              <select value={form.tipo_documento} onChange={e => handleChange('tipo_documento', e.target.value)}>
                <option value="RUC">RUC</option>
                <option value="DNI">DNI</option>
                <option value="NINGUNO">Ninguno</option>
              </select>
            </div>
            <div className="form-group">
              <label>Número de documento</label>
              <input value={form.numero_documento} onChange={e => handleChange('numero_documento', e.target.value)} placeholder="20123456789" />
            </div>
            <div className="form-group">
              <label>Contacto (persona)</label>
              <input value={form.contacto} onChange={e => handleChange('contacto', e.target.value)} placeholder="Nombre del vendedor" />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input value={form.telefono} onChange={e => handleChange('telefono', e.target.value)} placeholder="999 888 777" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="ventas@empresa.com" />
            </div>
            <div className="form-group">
              <label>Banco</label>
              <input value={form.banco} onChange={e => handleChange('banco', e.target.value)} placeholder="BCP, BBVA, Interbank..." />
            </div>
            <div className="form-group">
              <label>Número de cuenta</label>
              <input value={form.numero_cuenta} onChange={e => handleChange('numero_cuenta', e.target.value)} placeholder="123-456789-0-12" />
            </div>
            <div className="form-group full">
              <label>Dirección</label>
              <input value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} placeholder="Av. Principal 123, Lima" />
            </div>
            <div className="form-group full">
              <label>Notas</label>
              <textarea value={form.notas} onChange={e => handleChange('notas', e.target.value)} placeholder="Observaciones, condiciones de pago, etc." rows={2} />
            </div>
          </div>
        </div>
        <div className="modal-prov-footer">
          <button className="btn-cancelar-modal" onClick={onClose}>Cancelar</button>
          <button className="btn-guardar-modal" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : esEdicion ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalNuevaCompra({ proveedores, usuario, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    proveedor_id: '',
    fecha_compra: obtenerFechaLocalISO(),
    tipo_pago: 'EFECTIVO',
    fecha_vencimiento_pago: '',
    descuento: '',
    credito_aplicar: '',
    factura_numero: '',
    notas: '',
  });
  const [items, setItems]                       = useState([]);
  const [productos, setProductos]               = useState([]);
  const [variantes, setVariantes]               = useState([]);
  const [busqProd, setBusqProd]                 = useState('');
  const [prodSelec, setProdSelec]               = useState(null);
  const [tallasMulti, setTallasMulti]           = useState({});
  const [mostrarFormTallaNueva, setMostrarFormTallaNueva] = useState(false);
  const [nuevaTallaNombre, setNuevaTallaNombre] = useState('');
  const [nuevaTallaStock, setNuevaTallaStock] = useState('');
  const [nuevaTallaPrecio, setNuevaTallaPrecio] = useState('');
  const [agregandoTallaNueva, setAgregandoTallaNueva] = useState(false);
  const [guardando, setGuardando]               = useState(false);
  const [productosCreadosEnSesion, setProductosCreadosEnSesion] = useState([]); // 🆕
  const [dropdownVisible, setDropdownVisible]   = useState(false);
  const [modalNuevoProd, setModalNuevoProd]     = useState(false);
  const [categorias, setCategorias]             = useState([]);
  const [modoNegocio, setModoNegocio]           = useState('LUBRICENTRO'); // 🆕

  useEffect(() => { cargarProductos(); cargarCategorias(); cargarModoNegocio(); }, []);

  const cargarModoNegocio = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      setModoNegocio(config.modo_negocio || 'LUBRICENTRO');
    } catch (e) { console.error(e); }
  };

  const cargarProductos = async () => {
    try {
      const res = await invoke('obtener_productos');
      setProductos(res.productos || []);
    } catch (e) { console.error(e); }
  };

  const cargarCategorias = async () => {
    try {
      const cats = await invoke('obtener_categorias_con_tipo');
      setCategorias(cats);
    } catch (e) {
      try {
        const cats = await invoke('obtener_categorias');
        setCategorias(cats.map(([id, nombre]) => [id, nombre, 'ROPA']));
      } catch (e2) { console.error(e2); }
    }
  };

  // 🆕 Al cancelar/cerrar sin registrar la compra, borrar los productos que
  // se hayan creado en esta sesión (con " Nuevo") — si nunca se compraron
  // de verdad, no deberían quedar en el inventario con stock en cero.
  const handleCerrarCompra = async () => {
    for (const id of productosCreadosEnSesion) {
      try { await invoke('eliminar_producto_si_sin_uso', { productoId: id }); } catch (e) { /* no crítico */ }
    }
    onClose();
  };

  // FIX: paréntesis corregidos — .catch() fuera del .then()
  const handleProductoCreado = (nuevoProd) => {
    setModalNuevoProd(false);
    cargarProductos();
    setBusqProd(nuevoProd.nombre);
    setProdSelec(nuevoProd);
    setTallasMulti({}); // FIX: limpiar selección vieja de tallas (quedaba pegada de un producto anterior)
    setMostrarFormTallaNueva(false);
    setProductosCreadosEnSesion(prev => [...prev, nuevoProd.id]); // 🆕 para poder deshacerlo si se cancela la compra
    if (nuevoProd.tiene_variantes) {
      invoke('obtener_variantes_producto', { productoId: nuevoProd.id })
        .then(res => setVariantes(res.variantes || res || []))
        .catch(() => setVariantes([]));
    }
  };

  const seleccionarProducto = async (prod) => {
    setProdSelec(prod);
    setTallasMulti({});
    setMostrarFormTallaNueva(false);
    setBusqProd(prod.nombre);
    setDropdownVisible(false);
    if (prod.tiene_variantes) {
      try {
        const res = await invoke('obtener_variantes_producto', { productoId: prod.id });
        setVariantes(res.variantes || res || []);
      } catch (e) { setVariantes([]); }
    } else {
      setVariantes([]);
    }
  };

  const toggleTallaMulti = (talla) => {
    setTallasMulti(prev => {
      if (prev[talla] !== undefined) { const n = { ...prev }; delete n[talla]; return n; }
      return { ...prev, [talla]: 1 };
    });
  };

  const setCantTalla = (talla, cant) => {
    setTallasMulti(prev => ({ ...prev, [talla]: Math.max(1, parseInt(cant) || 1) }));
  };

  // 🆕 Agregar una talla nueva a un producto que ya existe (sin tocar las demás)
  const handleAgregarTallaNueva = async () => {
    const talla = nuevaTallaNombre.trim().toUpperCase();
    if (!talla) { onError('Escribí el nombre de la talla (ej: 3XL)'); return; }
    if (variantes.find(v => v.talla.toUpperCase() === talla)) {
      onError(`La talla ${talla} ya existe para este producto`);
      return;
    }
    setAgregandoTallaNueva(true);
    try {
      const resultado = await invoke('agregar_talla_a_producto', {
        productoId: prodSelec.id,
        talla,
        stockInicial: parseFloat(nuevaTallaStock) || 0,
        stockMinimo: 2,
        precio: nuevaTallaPrecio === '' ? null : parseFloat(nuevaTallaPrecio),
      });
      if (resultado.success) {
        onSuccess(resultado.message);
        const res = await invoke('obtener_variantes_producto', { productoId: prodSelec.id });
        setVariantes(res.variantes || res || []);
        setMostrarFormTallaNueva(false);
        setNuevaTallaNombre(''); setNuevaTallaStock(''); setNuevaTallaPrecio('');
      } else {
        onError(resultado.message);
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setAgregandoTallaNueva(false);
    }
  };

  const agregarItem = () => {
    if (!prodSelec) { onError('Selecciona un producto'); return; }
    if (prodSelec.tiene_variantes) {
      const tallasElegidas = Object.entries(tallasMulti);
      if (tallasElegidas.length === 0) { onError('Selecciona al menos una talla'); return; }
      const nuevos = [], duplicados = [];
      for (const [talla, cantidad] of tallasElegidas) {
        const claveUnica = `${prodSelec.id}-${talla}`;
        if (items.find(i => i._clave === claveUnica)) { duplicados.push(talla); continue; }
        const variante = variantes.find(v => v.talla === talla);
        nuevos.push({
          _clave: claveUnica, producto_id: prodSelec.id, producto_nombre: prodSelec.nombre,
          variante_id: variante?.id || null, talla, cantidad,
          precio_compra: '', precio_venta_sugerido: variante?.precio ?? prodSelec.precio ?? 0, subtotal: 0,
        });
      }
      if (duplicados.length > 0) onError(`Tallas ya en lista: ${duplicados.join(', ')}`);
      if (nuevos.length > 0) setItems(prev => [...prev, ...nuevos]);
    } else {
      const claveUnica = `${prodSelec.id}-SIN`;
      if (items.find(i => i._clave === claveUnica)) { onError('Ese producto ya está en la lista'); return; }
      setItems(prev => [...prev, {
        _clave: claveUnica, producto_id: prodSelec.id, producto_nombre: prodSelec.nombre,
        variante_id: null, talla: null, cantidad: '',
        unidad_medida: prodSelec.unidad_medida || 'UNIDAD',
        precio_compra: prodSelec.precio_compra > 0 ? prodSelec.precio_compra : '', precio_venta_sugerido: prodSelec.precio || 0, subtotal: 0,
      }]);
    }
    setProdSelec(null); setBusqProd(''); setTallasMulti({}); setVariantes([]); setDropdownVisible(false);
  };

  const actualizarItem = (clave, campo, valor) => {
    setItems(prev => prev.map(i => {
      if (i._clave !== clave) return i;
      const upd = { ...i, [campo]: valor };
      // Mientras el campo está vacío (el usuario borrando para escribir un número nuevo),
      // el subtotal se calcula como 0 en vez de NaN — no se traba el campo.
      upd.subtotal = (parseFloat(upd.precio_compra) || 0) * (parseFloat(upd.cantidad) || 0);
      return upd;
    }));
  };

  const quitarItem = (clave) => setItems(prev => prev.filter(i => i._clave !== clave));

  const subtotal       = items.reduce((s, i) => s + i.subtotal, 0);
  const descuento      = parseFloat(form.descuento) || 0;
  const creditoAplicar = parseFloat(form.credito_aplicar) || 0;
  const total          = Math.max(0, subtotal - descuento - creditoAplicar);

  const guardar = async () => {
    if (!form.proveedor_id) { onError('Selecciona un proveedor'); return; }
    if (items.length === 0) { onError('Agrega al menos un producto'); return; }
    if (items.some(i => !i.cantidad || i.cantidad <= 0)) { onError('Todos los productos deben tener una cantidad mayor a 0'); return; }
    if (items.some(i => i.precio_compra <= 0)) { onError('Todos los precios de compra deben ser mayores a 0'); return; }
    if (creditoAplicar > 0) {
      const prov = proveedores.find(p => p.id === parseInt(form.proveedor_id));
      if (creditoAplicar > (prov?.credito_disponible || 0) + 0.01) {
        onError(`El crédito a aplicar S/ ${creditoAplicar.toFixed(2)} supera el disponible S/ ${(prov?.credito_disponible || 0).toFixed(2)}`);
        return;
      }
    }
    setGuardando(true);
    try {
      const request = {
        proveedor_id:           parseInt(form.proveedor_id),
        fecha_compra:           form.fecha_compra,
        tipo_pago:              form.tipo_pago,
        fecha_vencimiento_pago: form.fecha_vencimiento_pago || null,
        descuento:              descuento || null,
        credito_aplicado:       creditoAplicar || null,
        factura_numero:         form.factura_numero || null,
        notas:                  form.notas || null,
        items: items.map(i => ({
          producto_id:           i.producto_id,
          variante_id:           i.variante_id,
          talla:                 i.talla,
          cantidad:              i.cantidad,
          precio_compra:         i.precio_compra,
          precio_venta_sugerido: i.precio_venta_sugerido,
        })),
      };
      await invoke('crear_compra', { request, usuarioId: usuario.id });
      onSuccess();
    } catch (e) {
      onError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const prodsFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqProd.toLowerCase()) ||
    p.codigo.toLowerCase().includes(busqProd.toLowerCase())
  ).slice(0, 8);

  const provSeleccionado = proveedores.find(p => p.id === parseInt(form.proveedor_id));

  return (
    <div className="modal-overlay" onClick={handleCerrarCompra}>
      <div className="modal-compra" onClick={e => e.stopPropagation()}>
        <div className="modal-prov-header">
          <h3>Nueva Orden de Compra</h3>
          <button className="modal-close" onClick={handleCerrarCompra}>×</button>
        </div>

        <div className="modal-compra-body">
          <div className="compra-seccion">
            <h4 className="seccion-titulo">Información General</h4>
            <div className="form-grid-3">
              <div className="form-group">
                <label>Proveedor *</label>
                <select value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value, credito_aplicar: '' }))}>
                  <option value="">Seleccionar...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {provSeleccionado?.credito_disponible > 0 && (
                  <div className="credito-disponible-aviso">
                     Crédito disponible: <strong>S/ {provSeleccionado.credito_disponible.toFixed(2)}</strong>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Fecha compra *</label>
                <input type="date" value={form.fecha_compra} onChange={e => setForm(f => ({ ...f, fecha_compra: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Tipo de pago</label>
                <select value={form.tipo_pago} onChange={e => setForm(f => ({ ...f, tipo_pago: e.target.value }))}>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CREDITO">Crédito</option>
                  <option value="MIXTO">Mixto</option>
                </select>
              </div>
              {form.tipo_pago === 'CREDITO' && (
                <div className="form-group">
                  <label>Fecha vencimiento pago</label>
                  <input type="date" value={form.fecha_vencimiento_pago} onChange={e => setForm(f => ({ ...f, fecha_vencimiento_pago: e.target.value }))} />
                </div>
              )}
              <div className="form-group">
                <label>N° Factura / Boleta</label>
                <input value={form.factura_numero} onChange={e => setForm(f => ({ ...f, factura_numero: e.target.value }))} placeholder="F001-00123" />
              </div>
              <div className="form-group">
                <label>Descuento S/</label>
                <input type="number" onFocus={e => e.target.select()} min="0" value={form.descuento} onChange={e => setForm(f => ({ ...f, descuento: e.target.value }))} placeholder="0.00" />
              </div>
              {provSeleccionado?.credito_disponible > 0 && (
                <div className="form-group">
                  <label>Aplicar crédito S/ <span className="label-max">(máx S/ {provSeleccionado.credito_disponible.toFixed(2)})</span></label>
                  <input type="number" onFocus={e => e.target.select()} min="0" step="0.01"
                    max={provSeleccionado.credito_disponible}
                    value={form.credito_aplicar}
                    onChange={e => setForm(f => ({ ...f, credito_aplicar: e.target.value }))}
                    placeholder="0.00"
                    className="input-credito" />
                </div>
              )}
            </div>
          </div>

          <div className="compra-seccion">
            <h4 className="seccion-titulo">Agregar Productos</h4>
            <div className="agregar-producto-row">
              <div className="busq-producto-wrap">
                <input
                  value={busqProd}
                  onChange={e => { setBusqProd(e.target.value); setProdSelec(null); setDropdownVisible(true); }}
                  onFocus={() => setDropdownVisible(true)}
                  onBlur={() => setTimeout(() => setDropdownVisible(false), 150)}
                  placeholder=" Buscar producto por nombre o código..."
                  className="busq-producto-input"
                  autoComplete="off"
                />
                {busqProd && dropdownVisible && prodsFiltrados.length > 0 && (
                  <div className="busq-dropdown">
                    {prodsFiltrados.map(p => (
                      <div key={p.id} className="busq-item" onMouseDown={() => seleccionarProducto(p)}>
                        <span className="busq-nombre">{p.nombre}</span>
                        <span className="busq-codigo">{p.codigo}</span>
                        {p.tiene_variantes && <span className="busq-tag-talla"> tallas</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn-agregar-item" onClick={agregarItem} disabled={!prodSelec}>
                + Agregar{prodSelec?.tiene_variantes && Object.keys(tallasMulti).length > 0 ? ` (${Object.keys(tallasMulti).length})` : ''}
              </button>
              <button type="button" className="btn-nuevo-prod-compra" onClick={() => setModalNuevoProd(true)} title="Crear producto nuevo">
                 Nuevo
              </button>
            </div>

            {prodSelec?.tiene_variantes && variantes.length > 0 && (
              <div className="panel-multi-talla">
                <div className="panel-multi-talla-titulo">
                  <span>Selecciona tallas y cantidades de <strong>{prodSelec.nombre}</strong></span>
                  <span className="panel-multi-hint">Clic en talla para seleccionar · Ajusta la cantidad</span>
                </div>
                <div className="multi-talla-grid">
                  {variantes.map(v => {
                    const seleccionada = tallasMulti[v.talla] !== undefined;
                    return (
                      <div key={v.talla} className={`multi-talla-chip ${seleccionada ? 'activa' : ''}`} onClick={() => toggleTallaMulti(v.talla)}>
                        <span className="multi-talla-nombre">{v.talla}</span>
                        {seleccionada ? (
                          <input type="number" onFocus={e => e.target.select()} min="1" value={tallasMulti[v.talla]}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setCantTalla(v.talla, e.target.value)}
                            className="multi-talla-cant" autoFocus />
                        ) : (
                          <span className="multi-talla-stock-actual">stock: {v.stock ?? 0}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {Object.keys(tallasMulti).length > 0 && (
                  <div className="multi-talla-resumen">
                     {Object.keys(tallasMulti).length} talla{Object.keys(tallasMulti).length > 1 ? 's' : ''} seleccionada{Object.keys(tallasMulti).length > 1 ? 's' : ''}:
                    {Object.entries(tallasMulti).map(([t, c]) => <span key={t} className="multi-talla-tag">{t} ×{c}</span>)}
                  </div>
                )}

                {/* 🆕 Agregar una talla que este producto todavía no maneja */}
                {!mostrarFormTallaNueva ? (
                  <button
                    type="button"
                    className="btn-agregar-talla-nueva"
                    onClick={() => setMostrarFormTallaNueva(true)}
                  >
                    + Agregar talla nueva
                  </button>
                ) : (
                  <div className="form-talla-nueva">
                    <input
                      type="text"
                      placeholder="Talla (ej: 3XL)"
                      value={nuevaTallaNombre}
                      onChange={e => setNuevaTallaNombre(e.target.value)}
                      className="form-talla-nueva-input"
                      autoFocus
                    />
                    <input
                      type="number" onFocus={e => e.target.select()} min="0"
                      placeholder="Stock inicial"
                      value={nuevaTallaStock}
                      onChange={e => setNuevaTallaStock(e.target.value)}
                      className="form-talla-nueva-input"
                    />
                    <input
                      type="number" onFocus={e => e.target.select()} min="0" step="0.01"
                      placeholder={`Precio (opcional)`}
                      value={nuevaTallaPrecio}
                      onChange={e => setNuevaTallaPrecio(e.target.value)}
                      className="form-talla-nueva-input"
                    />
                    <button
                      type="button"
                      className="btn-confirmar-talla-nueva"
                      onClick={handleAgregarTallaNueva}
                      disabled={agregandoTallaNueva}
                    >
                      {agregandoTallaNueva ? '...' : ''}
                    </button>
                    <button
                      type="button"
                      className="btn-cancelar-talla-nueva"
                      onClick={() => { setMostrarFormTallaNueva(false); setNuevaTallaNombre(''); setNuevaTallaStock(''); setNuevaTallaPrecio(''); }}
                    >
                      
                    </button>
                  </div>
                )}
              </div>
            )}

            {items.length > 0 && (
              <table className="tabla-items-compra">
                <thead>
                  <tr>
                    <th>Producto</th>{modoNegocio !== 'LUBRICENTRO' && <th>Talla</th>}<th>Cantidad</th>
                    <th>Precio compra S/</th><th>P. venta sug. S/</th><th>Subtotal</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item._clave}>
                      <td>{item.producto_nombre}</td>
                      {modoNegocio !== 'LUBRICENTRO' && (
                        <td>{item.talla ? <span className="talla-chip-small">{item.talla}</span> : '—'}</td>
                      )}
                      <td><input type="number" onFocus={e => e.target.select()} min="0.001" step={item.unidad_medida && item.unidad_medida !== 'UNIDAD' ? '0.001' : '1'} value={item.cantidad} placeholder="0"
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '') { actualizarItem(item._clave, 'cantidad', ''); return; }
                          const parsed = item.unidad_medida && item.unidad_medida !== 'UNIDAD' ? parseFloat(raw) : parseInt(raw);
                          actualizarItem(item._clave, 'cantidad', isNaN(parsed) ? '' : parsed);
                        }}
                        className="input-tabla" /></td>
                      <td><input type="number" onFocus={e => e.target.select()} min="0" step="0.01" value={item.precio_compra} placeholder="0.00"
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '') { actualizarItem(item._clave, 'precio_compra', ''); return; }
                          const parsed = parseFloat(raw);
                          actualizarItem(item._clave, 'precio_compra', isNaN(parsed) ? '' : parsed);
                        }}
                        className="input-tabla" /></td>
                      <td><input type="number" onFocus={e => e.target.select()} min="0" step="0.01" value={item.precio_venta_sugerido} placeholder="0.00"
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === '') { actualizarItem(item._clave, 'precio_venta_sugerido', ''); return; }
                          const parsed = parseFloat(raw);
                          actualizarItem(item._clave, 'precio_venta_sugerido', isNaN(parsed) ? '' : parsed);
                        }}
                        className="input-tabla" /></td>
                      <td className="monto-cell">S/ {item.subtotal.toFixed(2)}</td>
                      <td><button className="btn-quitar-item" onClick={() => quitarItem(item._clave)} title="Quitar producto">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {items.length > 0 && (
            <div className="compra-totales">
              <div className="total-row"><span>Subtotal:</span><span>S/ {subtotal.toFixed(2)}</span></div>
              <div className="total-row"><span>Descuento:</span><span>- S/ {descuento.toFixed(2)}</span></div>
              {creditoAplicar > 0 && (
                <div className="total-row total-credito"><span>Crédito aplicado:</span><span>- S/ {creditoAplicar.toFixed(2)}</span></div>
              )}
              <div className="total-row total-final"><span>Total:</span><span>S/ {total.toFixed(2)}</span></div>
            </div>
          )}
        </div>

        <div className="modal-prov-footer">
          <button className="btn-cancelar-modal" onClick={handleCerrarCompra}>Cancelar</button>
          <button className="btn-guardar-modal" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : ' Registrar Compra'}
          </button>
        </div>
      </div>

      {modalNuevoProd && (
        <ModalNuevoProducto
          categorias={categorias}
          modoNegocio={modoNegocio}
          onClose={() => setModalNuevoProd(false)}
          onProductoCreado={handleProductoCreado}
        />
      )}
    </div>
  );
}

function ModalDetalleCompra({ compraResumen, usuario, modoSoloLectura, onClose, onRefresh, onSuccess, onError }) {
  const [detalle, setDetalle]       = useState(null);
  const [cargando, setCargando]     = useState(true);
  const [tabDetalle, setTabDetalle] = useState('items');
  const [procesando, setProcesando] = useState(false);

  const [cantRecibidas,  setCantRecibidas]  = useState({});
  const [cantConformes,  setCantConformes]  = useState({});
  const [fechasVencimiento, setFechasVencimiento] = useState({}); // 🆕 { detalle_id: 'YYYY-MM-DD' }
  const [codigosLote, setCodigosLote] = useState({}); // 🆕 { detalle_id: 'texto libre' }
  const [notasRecepcion, setNotasRecepcion] = useState('');

  const [formPago, setFormPago] = useState({ monto: '', metodo_pago: 'EFECTIVO', referencia: '', notas: '' });

  const [formDevol, setFormDevol] = useState({ motivo: 'DAÑADO', detalle_motivo: '', notas: '' });
  const [itemsDevol, setItemsDevol] = useState({});
  const [modoNegocio, setModoNegocio] = useState('LUBRICENTRO'); // 🆕

  useEffect(() => { cargarDetalle(); cargarModoNegocio(); }, []);

  const cargarModoNegocio = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      setModoNegocio(config.modo_negocio || 'LUBRICENTRO');
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!detalle || !detalle.compra || detalle.compra.estado === 'PENDIENTE') return;
    setItemsDevol(prev => {
      const next = { ...prev };
      detalle.items.forEach(item => {
        if (next[item.id] === undefined) {
          const faltante = Math.max(0, item.cantidad - item.cantidad_recibida);
          const danado = Math.max(0, item.cantidad_recibida - item.cantidad_conforme);
          const sugerido = faltante + danado;
          if (sugerido > 0) next[item.id] = sugerido;
        }
      });
      return next;
    });
  }, [detalle]);

  const cargarDetalle = async () => {
    setCargando(true);
    try {
      const res = await invoke('obtener_detalle_compra', { compraId: compraResumen.id });
      setDetalle(res);
      const initRec = {}, initConf = {};
      res.items.forEach(i => {
        // Si todavía no se registró nada (0), arranca vacío para escribir directo
        // en vez de tener que borrar un "0" fijo primero.
        initRec[i.id]  = i.cantidad_recibida || '';
        initConf[i.id] = i.cantidad_conforme || '';
      });
      setCantRecibidas(initRec);
      setCantConformes(initConf);
    } catch (e) {
      onError(String(e));
    } finally {
      setCargando(false);
    }
  };

  const recibirMercaderia = async () => {
    setProcesando(true);
    try {
      const items = detalle.items.map(i => {
        const recibida = cantRecibidas[i.id] || 0;
        const conforme = Math.min(cantConformes[i.id] ?? recibida, recibida);
        return { detalle_id: i.id, cantidad_recibida: recibida, cantidad_conforme: conforme };
      });
      const res = await invoke('recibir_mercaderia', {
        request: { compra_id: compraResumen.id, items, notas_recepcion: notasRecepcion || null }
      });

      // Crear un lote de vencimiento por cada ítem que tenga fecha cargada
      // (productos perecibles) — así queda registrado FEFO desde el arranque
      for (const i of detalle.items) {
        const fecha = fechasVencimiento[i.id];
        const conforme = Math.min(cantConformes[i.id] ?? cantRecibidas[i.id] ?? 0, cantRecibidas[i.id] ?? 0);
        if (fecha && conforme > 0) {
          try {
            await invoke('agregar_lote_producto', {
              productoId: i.producto_id,
              cantidad: conforme,
              fechaVencimiento: fecha,
              compraId: compraResumen.id,
              numeroLote: codigosLote[i.id] || null,
            });
          } catch (e) {
            console.error('Error al crear lote para', i.producto_nombre, e);
            onError(`No se pudo guardar el lote de "${i.producto_nombre}": ${e}`);
          }
        }
      }

      onSuccess(res.message);
      onRefresh();
      cargarDetalle();
    } catch (e) {
      onError(String(e));
    } finally {
      setProcesando(false);
    }
  };

  const registrarPago = async () => {
    if (!formPago.monto || parseFloat(formPago.monto) <= 0) { onError('Ingresa un monto válido'); return; }
    setProcesando(true);
    try {
      const res = await invoke('registrar_pago_compra', {
        request: {
          compra_id:   compraResumen.id,
          monto:       parseFloat(formPago.monto),
          metodo_pago: formPago.metodo_pago,
          referencia:  formPago.referencia || null,
          notas:       formPago.notas || null,
        },
        usuarioId: usuario.id,
      });
      onSuccess(res.message);
      setFormPago({ monto: '', metodo_pago: 'EFECTIVO', referencia: '', notas: '' });
      onRefresh();
      cargarDetalle();
    } catch (e) {
      onError(String(e));
    } finally {
      setProcesando(false);
    }
  };

  const cancelarCompra = async () => {
    setProcesando(true);
    try {
      await invoke('cancelar_compra', { compraId: compraResumen.id });
      onSuccess('Compra cancelada');
      onRefresh();
      onClose();
    } catch (e) {
      onError(String(e));
    } finally {
      setProcesando(false);
    }
  };

  // resolverDevolucion — sin confirm() que bloquea en Tauri/macOS
  const resolverDevolucion = async (devolucionId, estado, tipoResolucion) => {
    setProcesando(true);
    try {
      const res = await invoke('resolver_devolucion_proveedor', {
        request: {
          devolucion_id:   devolucionId,
          estado,
          tipo_resolucion: tipoResolucion || null,
          notas:           null,
        },
      });
      onSuccess(res.message);
      onRefresh();
      cargarDetalle();
    } catch (e) {
      onError(String(e));
    } finally {
      setProcesando(false);
    }
  };

  const registrarDevolucion = async () => {
    const itemsDev = Object.entries(itemsDevol)
      .filter(([, cant]) => cant > 0)
      .map(([detalleId, cantDevuelta]) => {
        const item = detalle.items.find(i => i.id === parseInt(detalleId));
        return {
          detalle_compra_id: item.id,
          producto_id:       item.producto_id,
          variante_id:       item.variante_id || null,
          talla:             item.talla || null,
          cantidad_devuelta: cantDevuelta,
          precio_compra:     item.precio_compra,
          motivo_item:       null,
        };
      });
    if (itemsDev.length === 0) { onError('Indica la cantidad a devolver de al menos un producto'); return; }
    setProcesando(true);
    try {
      const res = await invoke('registrar_devolucion_proveedor', {
        request: {
          compra_id:      compraResumen.id,
          motivo:         formDevol.motivo,
          detalle_motivo: formDevol.detalle_motivo || null,
          notas:          formDevol.notas || null,
          items:          itemsDev,
        },
        usuarioId: usuario.id,
      });
      onSuccess(res.message);
      setFormDevol({ motivo: 'DAÑADO', detalle_motivo: '', notas: '' });
      setItemsDevol({});
      cargarDetalle();
    } catch (e) {
      onError(String(e));
    } finally {
      setProcesando(false);
    }
  };

  const puedeRecibir = detalle?.compra.estado === 'PENDIENTE' || detalle?.compra.estado === 'PARCIAL';
  const puedePagar   = detalle?.compra.estado_pago !== 'PAGADO' && detalle?.compra.estado !== 'CANCELADA';

  // Cuánto falta reclamar al proveedor (dañado + faltante) vs. cuánto ya se registró en devoluciones
  const totalReclamable = detalle?.items.reduce((s, i) => s + Math.max(0, i.cantidad - i.cantidad_conforme), 0) || 0;
  const totalYaDevuelto = detalle?.devoluciones?.reduce(
    (s, d) => s + d.items.reduce((s2, it) => s2 + it.cantidad_devuelta, 0), 0
  ) || 0;
  // "Cerrada": ya se recibió todo (no quedó PARCIAL) y no queda nada pendiente por reclamar
  const compraCerrada = detalle?.compra.estado === 'RECIBIDA' && totalReclamable <= totalYaDevuelto;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-detalle-compra" onClick={e => e.stopPropagation()}>
        <div className="modal-prov-header">
          <div>
            <h3> {compraResumen.folio}</h3>
            <p className="modal-subtitle">{compraResumen.proveedor_nombre} — {compraResumen.fecha_compra}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {cargando ? (
          <div className="cargando-centro">Cargando detalle...</div>
        ) : detalle && (
          <>
            <div className="detalle-resumen">
              <div className="resumen-item"><span>Total</span><strong>S/ {detalle.compra.total.toFixed(2)}</strong></div>
              <div className="resumen-item"><span>Pagado</span><strong className="pago-ok">S/ {detalle.compra.monto_pagado.toFixed(2)}</strong></div>
              <div className="resumen-item">
                <span>Saldo</span>
                <strong className={detalle.compra.saldo_pendiente > 0 ? 'saldo-pendiente' : 'pago-ok'}>
                  S/ {detalle.compra.saldo_pendiente.toFixed(2)}
                </strong>
              </div>
              <div className="resumen-item"><span>Estado</span><strong>{detalle.compra.estado}</strong></div>
              {compraCerrada && (
                <div className="resumen-item">
                  <span className="badge-compra-cerrada">Compra cerrada — ya no quedan acciones pendientes</span>
                </div>
              )}
            </div>

            <div className="detalle-tabs">
              <button className={`detalle-tab ${tabDetalle === 'items' ? 'active' : ''}`} onClick={() => setTabDetalle('items')}>
                 Productos ({detalle.items.length})
              </button>
              {puedeRecibir && !modoSoloLectura && (
                <button className={`detalle-tab ${tabDetalle === 'recibir' ? 'active' : ''}`} onClick={() => setTabDetalle('recibir')}>
                   Recibir Mercadería
                </button>
              )}
              {puedePagar && !modoSoloLectura && (
                <button className={`detalle-tab ${tabDetalle === 'pagar' ? 'active' : ''}`} onClick={() => setTabDetalle('pagar')}>
                   Registrar Pago
                </button>
              )}
              <button className={`detalle-tab ${tabDetalle === 'pagos' ? 'active' : ''}`} onClick={() => setTabDetalle('pagos')}>
                 Pagos ({detalle.pagos.length})
              </button>
              {(detalle.compra.estado === 'RECIBIDA' || detalle.compra.estado === 'PARCIAL') && !modoSoloLectura && (
                <button className={`detalle-tab tab-devoluciones ${tabDetalle === 'devoluciones' ? 'active' : ''}`} onClick={() => setTabDetalle('devoluciones')}>
                   Devoluciones {detalle.devoluciones?.length > 0 ? `(${detalle.devoluciones.length})` : ''}
                </button>
              )}
            </div>

            <div className="detalle-tab-content">

              {tabDetalle === 'items' && (
                <table className="tabla-items-detalle">
                  <thead>
                    <tr>
                      <th>Producto</th>{modoNegocio !== 'LUBRICENTRO' && <th>Talla</th>}<th>Pedido</th><th>Recibido</th>
                      <th>P. Compra</th><th>P. Venta Sug.</th><th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.items.map(item => (
                      <tr key={item.id}>
                        <td>{item.producto_nombre}</td>
                        {modoNegocio !== 'LUBRICENTRO' && (
                          <td>{item.talla ? <span className="talla-chip-small">{item.talla}</span> : '—'}</td>
                        )}
                        <td className="num-cell">{item.cantidad}</td>
                        <td className={`num-cell ${item.cantidad_recibida >= item.cantidad ? 'recibido-ok' : item.cantidad_recibida > 0 ? 'recibido-parcial' : ''}`}>
                          {item.cantidad_recibida}
                        </td>
                        <td className="monto-cell">S/ {item.precio_compra.toFixed(2)}</td>
                        <td className="monto-cell">{item.precio_venta_sugerido ? `S/ ${item.precio_venta_sugerido.toFixed(2)}` : '—'}</td>
                        <td className="monto-cell">S/ {item.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {tabDetalle === 'recibir' && puedeRecibir && (
                <div className="tab-recibir">
                  <div className="recibir-leyenda">
                    <span className="leyenda-item leyenda-recibida">Recibida = llegó físicamente</span>
                    <span className="leyenda-item leyenda-conforme">Conforme = llegó sano sube stock</span>
                    <span className="leyenda-item leyenda-danado">Dañado = recibida − conforme</span>
                  </div>
                  <table className="tabla-items-detalle tabla-recepcion">
                    <thead>
                      <tr>
                        <th>Producto</th>{modoNegocio !== 'LUBRICENTRO' && <th>Talla</th>}<th>Pedido</th>
                        <th className="col-recibida">Recibida</th>
                        <th className="col-conforme">Conforme</th>
                        <th className="col-danado">Dañado</th>
                        {modoNegocio === 'LUBRICENTRO' && <th>Vencimiento</th>}
                        {modoNegocio === 'LUBRICENTRO' && <th>Código de lote</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.items.map(item => {
                        const recibida = cantRecibidas[item.id] ?? 0;
                        const conforme = cantConformes[item.id] ?? recibida;
                        const danado   = Math.max(0, recibida - conforme);
                        return (
                          <tr key={item.id} className={danado > 0 ? 'fila-tiene-danado' : ''}>
                            <td>{item.producto_nombre}</td>
                            {modoNegocio !== 'LUBRICENTRO' && (
                              <td>{item.talla ? <span className="talla-chip-small">{item.talla}</span> : '—'}</td>
                            )}
                            <td className="num-cell">{item.cantidad}</td>
                            <td>
                              <input type="number" onFocus={e => e.target.select()} min="0" step="0.001" max={item.cantidad} value={recibida} placeholder="0"
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    setCantRecibidas(prev => ({ ...prev, [item.id]: '' }));
                                    setCantConformes(prev => ({ ...prev, [item.id]: '' }));
                                    return;
                                  }
                                  const v = Math.min(item.cantidad, parseFloat(raw) || 0);
                                  setCantRecibidas(prev => ({ ...prev, [item.id]: v }));
                                  setCantConformes(prev => ({ ...prev, [item.id]: Math.min(prev[item.id] || v, v) }));
                                }}
                                className="input-tabla input-recibir" />
                            </td>
                            <td>
                              <input type="number" onFocus={e => e.target.select()} min="0" step="0.001" max={recibida} value={conforme} placeholder="0"
                                onChange={e => {
                                  const raw = e.target.value;
                                  if (raw === '') { setCantConformes(prev => ({ ...prev, [item.id]: '' })); return; }
                                  const v = Math.min(recibida, parseFloat(raw) || 0);
                                  setCantConformes(prev => ({ ...prev, [item.id]: v }));
                                }}
                                className={`input-tabla input-conforme ${danado > 0 ? 'input-conforme-warn' : ''}`} />
                            </td>
                            <td className={`num-cell ${danado > 0 ? 'danado-cell' : 'danado-cero'}`}>
                              {danado > 0 ? ` ${danado}` : '—'}
                            </td>
                            {modoNegocio === 'LUBRICENTRO' && (
                              <td>
                                <input
                                  type="date"
                                  value={fechasVencimiento[item.id] || ''}
                                  onChange={e => setFechasVencimiento(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  className="input-tabla input-vencimiento"
                                  title="Solo si es un producto perecible — dejalo vacío si no vence"
                                />
                              </td>
                            )}
                            {modoNegocio === 'LUBRICENTRO' && (
                              <td>
                                <input
                                  type="text"
                                  value={codigosLote[item.id] || ''}
                                  onChange={e => setCodigosLote(prev => ({ ...prev, [item.id]: e.target.value }))}
                                  className="input-tabla input-vencimiento"
                                  placeholder="Ej: L-2508A (opcional)"
                                  title="El código que trae el paquete del fabricante, si querés poder identificarlo después"
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(() => {
                    let totalDanado = 0;
                    let totalFaltante = 0;
                    detalle.items.forEach(item => {
                      const rec  = cantRecibidas[item.id] || 0;
                      const conf = cantConformes[item.id] ?? rec;
                      totalDanado += Math.max(0, rec - conf);
                      totalFaltante += Math.max(0, item.cantidad - rec);
                    });
                    const totalReclamar = totalDanado + totalFaltante;
                    return totalReclamar > 0 ? (
                      <div className="recibir-aviso recibir-aviso-warn">
                        <strong>{totalReclamar} unidad(es) para reclamar al proveedor</strong> ({totalDanado} dañada(s) + {totalFaltante} faltante(s)) — recuerda registrar la devolución después de confirmar la recepción.
                      </div>
                    ) : null;
                  })()}
                  <div className="form-group" style={{ marginTop: 12 }}>
                    <label>Notas de recepción</label>
                    <textarea value={notasRecepcion} onChange={e => setNotasRecepcion(e.target.value)}
                      placeholder="Observaciones sobre la mercadería recibida..." rows={2} />
                  </div>
                  <div className="recibir-aviso">Solo las unidades <strong>conformes</strong> subirán al stock automáticamente, y el precio de compra del producto en Inventario se actualizará con el precio de esta compra.</div>
                  <button className="btn-confirmar-recepcion" onClick={recibirMercaderia} disabled={procesando}>
                    {procesando ? 'Procesando...' : ' Confirmar Recepción'}
                  </button>
                </div>
              )}

              {tabDetalle === 'pagar' && puedePagar && (
                <div className="tab-pagar">
                  <div className="saldo-info">
                    <span>Saldo pendiente:</span>
                    <strong className="saldo-pendiente">S/ {detalle.compra.saldo_pendiente.toFixed(2)}</strong>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>Monto a pagar S/ *</label>
                      <input type="number" onFocus={e => e.target.select()} min="0.01" step="0.01" max={detalle.compra.saldo_pendiente}
                        value={formPago.monto} onChange={e => setFormPago(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
                    </div>
                    <div className="form-group">
                      <label>Método de pago</label>
                      <select value={formPago.metodo_pago} onChange={e => setFormPago(f => ({ ...f, metodo_pago: e.target.value }))}>
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Referencia / N° operación</label>
                      <input value={formPago.referencia} onChange={e => setFormPago(f => ({ ...f, referencia: e.target.value }))} placeholder="Nro. transferencia, cheque..." />
                    </div>
                    <div className="form-group">
                      <label>Notas</label>
                      <input value={formPago.notas} onChange={e => setFormPago(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
                    </div>
                  </div>
                  <button className="btn-confirmar-recepcion" onClick={registrarPago} disabled={procesando}>
                    {procesando ? 'Registrando...' : ' Registrar Pago'}
                  </button>
                </div>
              )}

              {tabDetalle === 'pagos' && (
                <div className="tab-pagos">
                  {detalle.pagos.length === 0 ? (
                    <p className="sin-pagos">No hay pagos registrados aún.</p>
                  ) : (
                    <table className="tabla-pagos">
                      <thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th>Monto</th></tr></thead>
                      <tbody>
                        {detalle.pagos.map(p => (
                          <tr key={p.id}>
                            <td>{p.fecha_pago}</td><td>{p.metodo_pago}</td>
                            <td>{p.referencia || '—'}</td>
                            <td className="monto-cell pago-ok">S/ {p.monto.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tabDetalle === 'devoluciones' && (
                <div className="tab-devoluciones-contenido">

                  {detalle.devoluciones?.length > 0 && (
                    <div className="devoluciones-lista">
                      <h4 className="devol-seccion-titulo">Devoluciones registradas</h4>
                      {detalle.devoluciones.map(dev => (
                        <div key={dev.id} className={`devol-card devol-estado-${dev.estado.toLowerCase()}`}>
                          <div className="devol-card-header">
                            <div>
                              <span className="devol-folio">{dev.folio}</span>
                              <span className="devol-fecha">{dev.fecha?.substring(0, 10)}</span>
                              <span className={`badge-devol-estado badge-devol-${dev.estado.toLowerCase()}`}>{dev.estado}</span>
                              {dev.tipo_resolucion && <span className="badge-devol-tipo">{dev.tipo_resolucion}</span>}
                            </div>
                            <span className="devol-monto">S/ {dev.monto_devolucion.toFixed(2)}</span>
                          </div>
                          <div className="devol-card-body">
                            <span className="devol-motivo"> {dev.motivo.replace(/_/g, ' ')}</span>
                            {dev.detalle_motivo && <span className="devol-detalle">{dev.detalle_motivo}</span>}
                          </div>
                          {dev.items?.length > 0 && (
                            <div className="devol-items">
                              {dev.items.map(di => (
                                <span key={di.id} className="devol-item-tag">
                                  {di.producto_nombre} {di.talla ? `(${di.talla})` : ''} ×{di.cantidad_devuelta}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Botones de resolución — usan resolverDevolucion correctamente */}
                          {dev.estado === 'PENDIENTE' && (
                            <div className="devol-acciones">
                              <span className="devol-acciones-label">Resolución del proveedor:</span>
                              <button
                                className="btn-devol-aceptar"
                                onClick={() => resolverDevolucion(dev.id, 'ACEPTADA', 'CREDITO')}
                                disabled={procesando}
                              >
                                 Aceptar Crédito
                              </button>
                              <button
                                className="btn-devol-aceptar btn-devol-reembolso"
                                onClick={() => resolverDevolucion(dev.id, 'ACEPTADA', 'REEMBOLSO')}
                                disabled={procesando}
                              >
                                 Aceptar Reembolso
                              </button>
                              <button
                                className="btn-devol-aceptar btn-devol-cambio"
                                onClick={() => resolverDevolucion(dev.id, 'ACEPTADA', 'CAMBIO')}
                                disabled={procesando}
                              >
                                 Aceptar Cambio
                              </button>
                              <button
                                className="btn-devol-rechazar"
                                onClick={() => resolverDevolucion(dev.id, 'RECHAZADA', null)}
                                disabled={procesando}
                              >
                                 Rechazar
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {compraCerrada ? (
                    <div className="recibir-aviso">
                      Esta compra ya está cerrada: se recibió todo lo pedido y ya no queda nada pendiente por reclamar al proveedor.
                    </div>
                  ) : (
                  <div className="devol-form">
                    <h4 className="devol-seccion-titulo">Registrar nueva devolución</h4>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label>Motivo principal</label>
                        <select value={formDevol.motivo} onChange={e => setFormDevol(f => ({ ...f, motivo: e.target.value }))}>
                          <option value="DAÑADO">Dañado</option>
                          <option value="DEFECTUOSO">Defectuoso</option>
                          <option value="PRODUCTO_INCORRECTO">Producto incorrecto</option>
                          <option value="PRODUCTO_NO_COMPATIBLE">No compatible con el vehículo</option>
                          <option value="VENCIDO">Vencido</option>
                          <option value="OTRO">Otro</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Detalle del motivo</label>
                        <input value={formDevol.detalle_motivo}
                          onChange={e => setFormDevol(f => ({ ...f, detalle_motivo: e.target.value }))}
                          placeholder="Descripción específica del problema..." />
                      </div>
                      <div className="form-group full">
                        <label>Notas adicionales</label>
                        <input value={formDevol.notas}
                          onChange={e => setFormDevol(f => ({ ...f, notas: e.target.value }))}
                          placeholder="Referencia de contacto con el proveedor, etc." />
                      </div>
                    </div>

                    <p className="devol-items-titulo">Indica cuántas unidades devuelves por producto:</p>
                    <table className="tabla-items-detalle">
                      <thead>
                        <tr>
                          <th>Producto</th>{modoNegocio !== 'LUBRICENTRO' && <th>Talla</th>}<th>Recibido</th><th>Conforme</th>
                          <th className="col-devolver">A devolver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalle.items.filter(item => item.cantidad > item.cantidad_conforme).map(item => {
                          const maxDevolver = item.cantidad - item.cantidad_conforme;
                          const cantDev = itemsDevol[item.id] ?? 0;
                          return (
                            <tr key={item.id} className={cantDev > 0 ? 'fila-a-devolver' : ''}>
                              <td>{item.producto_nombre}</td>
                              {modoNegocio !== 'LUBRICENTRO' && (
                                <td>{item.talla ? <span className="talla-chip-small">{item.talla}</span> : '—'}</td>
                              )}
                              <td className="num-cell">{item.cantidad_recibida}</td>
                              <td className="num-cell recibido-ok">{item.cantidad_conforme}</td>
                              <td>
                                <input type="number" onFocus={e => e.target.select()} min="0" max={maxDevolver} value={cantDev}
                                  onChange={e => {
                                    const raw = e.target.value;
                                    if (raw === '') { setItemsDevol(prev => ({ ...prev, [item.id]: '' })); return; }
                                    const v = Math.min(maxDevolver, parseInt(raw) || 0);
                                    setItemsDevol(prev => ({ ...prev, [item.id]: v }));
                                  }}
                                  onBlur={e => { if (e.target.value === '') setItemsDevol(prev => ({ ...prev, [item.id]: 0 })); }}
                                  className="input-tabla input-devolver" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {(() => {
                      const totalMonto = detalle.items.reduce((sum, item) =>
                        sum + (itemsDevol[item.id] || 0) * item.precio_compra, 0);
                      const totalUnidades = Object.values(itemsDevol).reduce((s, v) => s + (v || 0), 0);
                      return totalUnidades > 0 ? (
                        <div className="devol-resumen-monto">
                           <strong>{totalUnidades}</strong> unidad(es) a devolver —
                          Monto: <strong>S/ {totalMonto.toFixed(2)}</strong>
                          <span className="devol-nota-credito">Quedará PENDIENTE hasta que el proveedor confirme</span>
                        </div>
                      ) : null;
                    })()}

                    <button
                      className="btn-confirmar-recepcion btn-registrar-devol"
                      onClick={registrarDevolucion}
                      disabled={procesando || Object.values(itemsDevol).every(v => v === 0)}
                    >
                      {procesando ? 'Registrando...' : 'Registrar Devolución al Proveedor'}
                    </button>
                  </div>
                  )}
                </div>
              )}
            </div>

            {detalle.compra.estado === 'PENDIENTE' && !modoSoloLectura && (
              <div className="detalle-footer">
                <button className="btn-cancelar-compra" onClick={cancelarCompra} disabled={procesando}>
                   Cancelar Compra
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ModalNuevoProducto({ categorias, modoNegocio = 'LUBRICENTRO', onClose, onProductoCreado }) {
  const primeraCat = categorias.length > 0 ? categorias[0] : null;
  const [formData, setFormData] = useState({
    codigo: '', nombre: '', descripcion: '', precio: '',
    stock: '0', stock_minimo: '', unidad_medida: 'UNIDAD',
    categoria_id: primeraCat ? primeraCat[0] : '',
    descuento_porcentaje: 0,
    precio_compra: '', // 🆕 costo del producto — opcional, se puede completar después
  });
  const [tieneVariantes, setTieneVariantes]           = useState(false);
  const [tipoTallaCategoria, setTipoTallaCategoria]   = useState(primeraCat ? primeraCat[2] : 'NINGUNA');
  const [tallasSeleccionadas, setTallasSeleccionadas] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState('');

  const handleCategoriaChange = (categoriaId) => {
    setFormData(f => ({ ...f, categoria_id: categoriaId }));
    const cat = categorias.find(([id]) => id.toString() === categoriaId.toString());
    const tipo = cat ? cat[2] : 'NINGUNA';
    setTipoTallaCategoria(tipo);
    if (tipo === 'NINGUNA') { setTieneVariantes(false); setTallasSeleccionadas({}); }
  };

  const handleToggleTalla = (talla) => {
    setTallasSeleccionadas(prev => {
      if (prev[talla]) { const n = { ...prev }; delete n[talla]; return n; }
      return { ...prev, [talla]: { stock: 0, stock_minimo: 2, precio: '' } };
    });
  };

  const handleTallaStock = (talla, campo, valor) => {
    setTallasSeleccionadas(prev => ({
      ...prev,
      [talla]: { ...prev[talla], [campo]: campo === 'precio' ? valor : (parseInt(valor) || 0) },
    }));
  };

  const guardar = async () => {
    setError('');
    if (!formData.nombre.trim())  { setError('El nombre es obligatorio'); return; }
    if (!formData.codigo.trim())  { setError('El código es obligatorio'); return; }
    if (!tieneVariantes && !formData.precio) { setError('El precio es obligatorio'); return; }
    if (!formData.categoria_id)   { setError('Selecciona una categoría'); return; }
    if (tieneVariantes && Object.keys(tallasSeleccionadas).length === 0) {
      setError('Selecciona al menos una talla'); return;
    }
    if (tieneVariantes) {
      const tallaSinPrecio = Object.entries(tallasSeleccionadas).find(
        ([, datos]) => !datos.precio || parseFloat(datos.precio) <= 0
      );
      if (tallaSinPrecio) { setError(`Falta el precio de la talla ${tallaSinPrecio[0]}`); return; }
    }
    const variantesArray = tieneVariantes
      ? Object.entries(tallasSeleccionadas).map(([talla, datos]) => ({
          talla, stock: datos.stock, stock_minimo: datos.stock_minimo, precio: parseFloat(datos.precio),
        }))
      : null;
    // Con tallas, no hay "un precio general" — cada talla tiene el suyo.
    // La base de datos igual necesita un valor interno; usamos el más bajo.
    const precioParaGuardar = tieneVariantes
      ? Math.min(...variantesArray.map(v => v.precio))
      : parseFloat(formData.precio);
    setGuardando(true);
    try {
      const resultado = await invoke('agregar_producto', {
        producto: {
          codigo: formData.codigo, nombre: formData.nombre,
          descripcion: formData.descripcion || null,
          precio: precioParaGuardar,
          stock: tieneVariantes ? 0 : parseFloat(formData.stock) || 0,
          stock_minimo: parseFloat(formData.stock_minimo) || 2,
          unidad_medida: formData.unidad_medida,
          categoria_id: parseInt(formData.categoria_id),
          descuento_porcentaje: 0,
          tiene_variantes: tieneVariantes,
          variantes: variantesArray,
          precio_compra: parseFloat(formData.precio_compra) || 0, // 🆕
        },
      });
      if (resultado.success) {
        const prods = await invoke('obtener_productos');
        const nuevo = (prods.productos || []).find(p => p.codigo === formData.codigo);
        onProductoCreado(nuevo || { id: resultado.producto_id, nombre: formData.nombre, codigo: formData.codigo, precio: precioParaGuardar, tiene_variantes: tieneVariantes });
      } else {
        setError(resultado.message || 'Error al crear producto');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const tallasDisponibles = tipoTallaCategoria === 'CALZADO' ? TALLAS_CALZADO : TALLAS_ROPA;
  const stockTotal = Object.values(tallasSeleccionadas).reduce((s, t) => s + (t.stock || 0), 0);

  return (
    <div className="modal-overlay modal-overlay-top" onClick={onClose}>
      <div className="modal-nuevo-prod" onClick={e => e.stopPropagation()}>
        <div className="modal-prov-header">
          <div>
            <h3>Crear Nuevo Producto</h3>
            <p className="modal-subtitle">Se agregará al inventario y quedará disponible en esta compra</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-prov-body">
          {error && <div className="mensaje error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="form-grid-2">
            <div className="form-group">
              <label>Código *</label>
              <input value={formData.codigo} onChange={e => setFormData(f => ({ ...f, codigo: e.target.value }))} placeholder={modoNegocio === 'LUBRICENTRO' ? 'Ej: ACE-001' : 'Ej: POLO-AZU-001'} autoFocus />
            </div>
            <div className="form-group">
              <label>Categoría *</label>
              <select value={formData.categoria_id} onChange={e => handleCategoriaChange(e.target.value)}>
                {categorias.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
              </select>
            </div>
            <div className="form-group full">
              <label>Nombre del Producto *</label>
              <input value={formData.nombre} onChange={e => setFormData(f => ({ ...f, nombre: e.target.value }))} placeholder={modoNegocio === 'LUBRICENTRO' ? 'Ej: Aceite Mobil 20W-50 4L' : 'Ej: Polo Cuello Redondo Azul'} />
            </div>
            <div className="form-group full">
              <label>Descripción</label>
              <textarea value={formData.descripcion} onChange={e => setFormData(f => ({ ...f, descripcion: e.target.value }))} rows={2} placeholder="Descripción opcional..." />
            </div>
            {!tieneVariantes && (
              <div className="form-group">
                <label>Precio de venta S/ *</label>
                <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={formData.precio}
                  onChange={e => setFormData(f => ({ ...f, precio: e.target.value }))} placeholder="0.00" />
              </div>
            )}
            <div className="form-group">
              <label>Precio de compra S/</label>
              <input type="number" onFocus={e => e.target.select()} step="0.01" min="0" value={formData.precio_compra}
                onChange={e => setFormData(f => ({ ...f, precio_compra: e.target.value }))} placeholder="0.00" />
              <small style={{ color: '#6b7280', fontSize: 11, marginTop: 3, display: 'block' }}>
                Opcional. Se actualiza solo al recibir esta u otra compra real más adelante.
              </small>
            </div>
            <div className="form-group">
              <label>Stock mínimo</label>
              <input type="number" onFocus={e => e.target.select()} step="0.001" min="0" value={formData.stock_minimo}
                onChange={e => setFormData(f => ({ ...f, stock_minimo: e.target.value }))} placeholder="2" />
            </div>
            {modoNegocio !== 'ROPA' && (
              <div className="form-group">
                <label>Unidad de venta</label>
                <select value={formData.unidad_medida}
                  onChange={e => setFormData(f => ({ ...f, unidad_medida: e.target.value }))}>
                  <option value="UNIDAD">Unidad</option>
                  <option value="KG">Kilogramo (kg)</option>
                  <option value="GRAMO">Gramo (g)</option>
                  <option value="LITRO">Litro (L)</option>
                  <option value="ML">Mililitro (mL)</option>
                  <option value="GALON">Galón</option>
                  <option value="METRO">Metro (m)</option>
                </select>
              </div>
            )}
          </div>

          {tipoTallaCategoria !== 'NINGUNA' && modoNegocio !== 'LUBRICENTRO' && (
            <div className="seccion-tallas-compra">
              <div className="tallas-toggle-row">
                <span className="tallas-label-compra">{tipoTallaCategoria === 'CALZADO' ? '' : ''} ¿Maneja tallas?</span>
                <div className="toggle-group">
                  <button type="button" className={`toggle-btn-compra ${!tieneVariantes ? 'activo' : ''}`}
                    onClick={() => { setTieneVariantes(false); setTallasSeleccionadas({}); }}>Sin tallas</button>
                  <button type="button" className={`toggle-btn-compra ${tieneVariantes ? 'activo' : ''}`}
                    onClick={() => setTieneVariantes(true)}>Con tallas</button>
                </div>
              </div>
              {!tieneVariantes && (
                <div className="form-group" style={{ marginTop: 10 }}>
                  <label>Stock inicial</label>
                  <input type="number" onFocus={e => e.target.select()} min="0" step="0.001" value={formData.stock}
                    onChange={e => setFormData(f => ({ ...f, stock: e.target.value }))}
                    placeholder="0" style={{ maxWidth: 120 }} />
                  <small style={{ color: '#6b7280', fontSize: 11, marginTop: 3, display: 'block' }}>
                    El stock real se actualizará al recibir la mercadería
                  </small>
                </div>
              )}
              {tieneVariantes && (
                <div className="tallas-grid-compra">
                  {tallasDisponibles.map(talla => {
                    const sel = !!tallasSeleccionadas[talla];
                    return (
                      <div key={talla} className={`talla-chip-compra ${sel ? 'activa' : ''}`}>
                        <button type="button" onClick={() => handleToggleTalla(talla)} className="talla-chip-btn">{talla}</button>
                        {sel && (
                          <div className="talla-inputs-mini">
                            <input type="number" onFocus={e => e.target.select()} min="0" placeholder="Stock"
                              value={tallasSeleccionadas[talla].stock}
                              onChange={e => handleTallaStock(talla, 'stock', e.target.value)}
                              title="Stock inicial" />
                            <input type="number" onFocus={e => e.target.select()} min="0.01" step="0.01" placeholder="Precio *"
                              value={tallasSeleccionadas[talla].precio}
                              onChange={e => handleTallaStock(talla, 'precio', e.target.value)}
                              title="Precio de venta de esta talla" required />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {Object.keys(tallasSeleccionadas).length > 0 && (
                    <div className="tallas-resumen-compra">
                       {stockTotal} uds — tallas: {Object.keys(tallasSeleccionadas).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
        <div className="modal-prov-footer">
          <button className="btn-cancelar-modal" onClick={onClose}>Cancelar</button>
          <button className="btn-guardar-modal" onClick={guardar} disabled={guardando}>
            {guardando ? 'Creando...' : ' Crear Producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Proveedores;