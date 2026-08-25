import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Clientes.css';

function Clientes({ usuario, modoSoloLectura }) {
  const [clientes, setClientes]       = useState([]);
  const [cargando, setCargando]       = useState(true);
  const [busqueda, setBusqueda]       = useState('');
  const [modalForm, setModalForm]     = useState(false);
  const [clienteEditar, setClienteEditar] = useState(null);
  const [mensaje, setMensaje]         = useState({ tipo: '', texto: '' });

  useEffect(() => { cargarClientes(); }, []);

  const cargarClientes = async () => {
    setCargando(true);
    try {
      const res = await invoke('obtener_clientes');
      setClientes(res.clientes || []);
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

  const eliminarCliente = async (id, nombre) => {
    if (!confirm(`¿Eliminar cliente "${nombre}"?`)) return;
    try {
      await invoke('eliminar_cliente', { clienteId: id });
      mostrarMensaje('success', 'Cliente eliminado');
      cargarClientes();
    } catch (e) {
      mostrarMensaje('error', `${e}`);
    }
  };

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.numero_documento || '').includes(busqueda) ||
    (c.telefono || '').includes(busqueda)
  );

  return (
    <div className="clientes-container">
      <div className="clientes-header">
        <div className="cli-header-title">
          <h2>Clientes</h2>
          <p>Registro de clientes fijos — sus datos quedan listos para emitir boleta, factura o comprobante de venta</p>
        </div>
      </div>

      <div className="cli-content">
        <div className="filtros-bar">
          <input
            type="text"
            placeholder="Buscar por nombre, DNI/RUC o teléfono..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="busqueda-input"
          />
          {!modoSoloLectura && (
            <button className="btn-nuevo-cliente" onClick={() => { setClienteEditar(null); setModalForm(true); }}>
              + Nuevo Cliente
            </button>
          )}
        </div>

        {mensaje.texto && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

        {cargando ? (
          <div className="cargando-centro">Cargando clientes...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"></div>
            <h3>{busqueda ? 'No se encontraron clientes' : 'No hay clientes registrados'}</h3>
            <p>{busqueda ? 'Prueba con otro nombre, documento o teléfono' : 'Agrega tu primer cliente fijo'}</p>
          </div>
        ) : (
          <div className="tabla-wrapper">
            <table className="tabla-clientes">
              <thead>
                <tr>
                  <th>Nombre / Razón social</th>
                  <th>Documento</th>
                  <th>Teléfono</th>
                  <th>Email</th>
                  <th>Dirección</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id}>
                    <td className="nombre-cliente">{c.nombre}</td>
                    <td className="doc-cell">
                      <span className="doc-tipo">{c.tipo_documento}</span>
                      {c.numero_documento || '—'}
                    </td>
                    <td>{c.telefono || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td className="direccion-cell">{c.direccion || '—'}</td>
                    <td className="acciones-cell">
                      <button className="btn-editar-cli" onClick={() => { setClienteEditar(c); setModalForm(true); }}>Editar</button>
                      {!modoSoloLectura && (
                        <button className="btn-eliminar-cli" onClick={() => eliminarCliente(c.id, c.nombre)}>Eliminar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalForm && (
        <ModalFormCliente
          cliente={clienteEditar}
          onClose={() => setModalForm(false)}
          onSuccess={(msg) => { setModalForm(false); cargarClientes(); mostrarMensaje('success', msg); }}
          onError={(e) => mostrarMensaje('error', `${e}`)}
        />
      )}
    </div>
  );
}

function ModalFormCliente({ cliente, onClose, onSuccess, onError }) {
  const esEdicion = !!cliente;
  const [form, setForm] = useState({
    nombre:           cliente?.nombre || '',
    tipo_documento:   cliente?.tipo_documento || 'DNI',
    numero_documento: cliente?.numero_documento || '',
    telefono:         cliente?.telefono || '',
    email:            cliente?.email || '',
    direccion:        cliente?.direccion || '',
    notas:            cliente?.notas || '',
  });
  const [guardando, setGuardando] = useState(false);

  const handleChange = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const guardar = async () => {
    if (!form.nombre.trim()) { onError('El nombre es obligatorio'); return; }

    const doc = form.numero_documento.trim();
    if (form.tipo_documento === 'DNI' && doc && doc.length !== 8) {
      onError('El DNI debe tener 8 dígitos');
      return;
    }
    if (form.tipo_documento === 'RUC' && doc && doc.length !== 11) {
      onError('El RUC debe tener 11 dígitos');
      return;
    }

    setGuardando(true);
    try {
      if (esEdicion) {
        await invoke('actualizar_cliente', { clienteId: cliente.id, cliente: form });
        onSuccess('Cliente actualizado');
      } else {
        await invoke('agregar_cliente', { cliente: form });
        onSuccess('Cliente agregado');
      }
    } catch (e) {
      onError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-cli" onClick={e => e.stopPropagation()}>
        <div className="modal-cli-header">
          <h3>{esEdicion ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-cli-body">
          <div className="form-grid-2">
            <div className="form-group full">
              <label>Nombre completo / Razón social *</label>
              <input value={form.nombre} onChange={e => handleChange('nombre', e.target.value)} placeholder="Ej: Juan Pérez Ramírez" />
            </div>
            <div className="form-group">
              <label>Tipo de documento</label>
              <select value={form.tipo_documento} onChange={e => handleChange('tipo_documento', e.target.value)}>
                <option value="DNI">DNI</option>
                <option value="RUC">RUC</option>
                <option value="NINGUNO">Ninguno</option>
              </select>
            </div>
            <div className="form-group">
              <label>Número de documento</label>
              <input
                value={form.numero_documento}
                onChange={e => handleChange('numero_documento', e.target.value.replace(/\D/g, ''))}
                placeholder={form.tipo_documento === 'RUC' ? '20123456789' : '12345678'}
                maxLength={form.tipo_documento === 'RUC' ? 11 : 8}
              />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input value={form.telefono} onChange={e => handleChange('telefono', e.target.value)} placeholder="999 888 777" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} placeholder="cliente@correo.com" />
            </div>
            <div className="form-group full">
              <label>Dirección</label>
              <input value={form.direccion} onChange={e => handleChange('direccion', e.target.value)} placeholder="Av. Principal 123, Lima" />
            </div>
            <div className="form-group full">
              <label>Notas</label>
              <textarea value={form.notas} onChange={e => handleChange('notas', e.target.value)} placeholder="Vehículo, preferencias, observaciones..." rows={2} />
            </div>
          </div>
        </div>
        <div className="modal-cli-footer">
          <button className="btn-cancelar-modal" onClick={onClose}>Cancelar</button>
          <button className="btn-guardar-modal" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : esEdicion ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Clientes;