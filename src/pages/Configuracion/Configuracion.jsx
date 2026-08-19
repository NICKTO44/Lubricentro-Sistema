import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IconAward, IconCalendarTime, IconKey } from '@tabler/icons-react';
import ActivarLicencia from '../ActivarLicencia/ActivarLicencia';
import './Configuracion.css';

function Configuracion({ usuario, onVolver, onLicenciaActualizada }) {
  if (usuario.rol_id !== 1) {
    return (
      <div className="configuracion-container">
        <div className="configuracion-header">
          <button onClick={onVolver} className="btn-volver">Volver</button>
          <h2>Configuracion del Sistema</h2>
        </div>
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <h2>Acceso Denegado</h2>
          <p>Solo los administradores pueden acceder a esta seccion.</p>
          <button onClick={onVolver} style={{ padding: '10px 20px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '20px' }}>
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  const [tabActual, setTabActual] = useState('tienda');
  const [estadoLicenciaLocal, setEstadoLicenciaLocal] = useState(null);
  const [mostrarActivarLicencia, setMostrarActivarLicencia] = useState(false);
  const [nubefactToken, setNubefactToken] = useState('');
  const [nubefactRuta, setNubefactRuta] = useState('');
  const [guardandoNubefact, setGuardandoNubefact] = useState(false);
  const [probandoNubefact, setProbandoNubefact] = useState(false);
  const [resultadoPruebaNubefact, setResultadoPruebaNubefact] = useState(null);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const [configTienda, setConfigTienda] = useState({
    nombre_tienda: '',
    direccion: '',
    telefono: '',
    email: '',
    rfc: '',
    mensaje_recibo: '',
    impresora_ip: '',
    impresora_tipo: 'TERMICA',
    impresora_puerto: 9100,
    modo_negocio: 'ROPA',
  });

  const [categorias, setCategorias] = useState([]);
  const [modalCategoria, setModalCategoria] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState(null);
  const [formCategoria, setFormCategoria] = useState({ nombre: '', descripcion: '', tipo_talla: 'NINGUNA' });

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [modalUsuario, setModalUsuario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [formUsuario, setFormUsuario] = useState({
    username: '', password: '', nombre_completo: '', email: '', rol_id: ''
  });

  const [probandoImpresora, setProbandoImpresora] = useState(false);

  useEffect(() => {
    cargarConfiguracionTienda();
    cargarCategorias();
    cargarUsuarios();
    cargarEstadoLicencia();
    cargarRoles();
  }, []);

  const cargarConfiguracionTienda = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      setConfigTienda({
        ...config,
        impresora_ip: config.impresora_ip || '',
        impresora_tipo: config.impresora_tipo || 'TERMICA',
        impresora_puerto: config.impresora_puerto || 9100,
        modo_negocio: config.modo_negocio || 'ROPA',
      });
      setNubefactToken(config.nubefact_token || '');
      setNubefactRuta(config.nubefact_ruta || '');
    } catch (error) {
      console.error('Error al cargar configuracion:', error);
    }
  };

  // Valida el FORMATO (no llama a NubeFacT) — evita guardar cosas que
  // claramente no son una ruta/token real, como texto vacío o basura.
  const validarFormatoNubefact = () => {
    if (!nubefactRuta.trim() || !nubefactToken.trim()) {
      return 'Completa la ruta y el token.';
    }
    if (!/^https?:\/\/.+/i.test(nubefactRuta.trim())) {
      return 'La ruta debe ser una URL válida (tiene que empezar con http:// o https://).';
    }
    if (nubefactToken.trim().length < 15) {
      return 'El token parece incompleto — revisa que lo copiaste entero desde NubeFacT.';
    }
    return null;
  };

  const facturacionConfigurada = !!(nubefactToken && nubefactRuta) && !validarFormatoNubefact();
  const facturacionVerificada = facturacionConfigurada && resultadoPruebaNubefact?.success === true;

  const guardarNubefact = async () => {
    const errorFormato = validarFormatoNubefact();
    if (errorFormato) {
      alert(errorFormato);
      return;
    }
    setGuardandoNubefact(true);
    try {
      const resultado = await invoke('guardar_token_nubefact', {
        token: nubefactToken,
        ruta: nubefactRuta,
      });
      alert(resultado);
    } catch (error) {
      alert('Error: ' + error);
    } finally {
      setGuardandoNubefact(false);
    }
  };

  const probarConexionNubefact = async () => {
    const errorFormato = validarFormatoNubefact();
    if (errorFormato) {
      setResultadoPruebaNubefact({ success: false, mensaje: errorFormato });
      return;
    }
    setProbandoNubefact(true);
    setResultadoPruebaNubefact(null);
    try {
      const resultado = await invoke('probar_credenciales_nubefact', {
        token: nubefactToken,
        ruta: nubefactRuta,
      });
      setResultadoPruebaNubefact(resultado);
    } catch (error) {
      setResultadoPruebaNubefact({ success: false, mensaje: String(error) });
    } finally {
      setProbandoNubefact(false);
    }
  };

  const guardarConfiguracionTienda = async () => {
    try {
      await invoke('actualizar_configuracion_tienda', {
        nombreTienda: configTienda.nombre_tienda,
        direccion: configTienda.direccion,
        telefono: configTienda.telefono,
        email: configTienda.email,
        rfc: configTienda.rfc,
        mensajeRecibo: configTienda.mensaje_recibo,
        impresoraIp: configTienda.impresora_ip,
        impresoraTipo: configTienda.impresora_tipo,
        impresoraPuerto: parseInt(configTienda.impresora_puerto) || 9100,
      });
      mostrarMensaje('success', 'Configuracion guardada correctamente');
    } catch (error) {
      console.error('Error al guardar configuracion:', error);
      mostrarMensaje('error', 'Error al guardar configuracion');
    }
  };

  // 🩹 FIX: antes llamaba a invoke('probar_impresora') sin mandar nada —
  // el comando de Rust leía la IP directo de la base de datos, así que si
  // el "Guardar" nunca se había completado con éxito (o el campo se llenó
  // por autocompletado del navegador sin disparar onChange), la prueba
  // fallaba con "No hay IP configurada" aunque el campo se viera lleno en
  // pantalla. Ahora se manda explícitamente lo que está en el formulario
  // en este momento, sin depender de que ya esté guardado.
  const probarImpresora = async () => {
    setProbandoImpresora(true);
    try {
      await invoke('probar_impresora', {
        impresoraIp: configTienda.impresora_ip,
        impresoraPuerto: parseInt(configTienda.impresora_puerto) || 9100,
        impresoraTipo: configTienda.impresora_tipo,
      });
      mostrarMensaje('success', 'Prueba enviada correctamente');
    } catch (error) {
      mostrarMensaje('error', 'Error: ' + error);
    } finally {
      setProbandoImpresora(false);
    }
  };

  const cargarCategorias = async () => {
    try {
      const cats = await invoke('obtener_categorias_con_tipo');
      setCategorias(cats.map(([id, nombre, tipo_talla]) => ({ id, nombre, tipo_talla, descripcion: '', activo: true })));
    } catch (error) {
      console.error('Error al cargar categorias:', error);
    }
  };

  const abrirModalCategoria = (categoria = null) => {
    if (categoria) {
      setCategoriaEditando(categoria);
      setFormCategoria({
        nombre: categoria.nombre,
        descripcion: categoria.descripcion || '',
        tipo_talla: categoria.tipo_talla || 'NINGUNA',
      });
    } else {
      setCategoriaEditando(null);
      // En modo MINIMARKET no tiene sentido ofrecer tallas de ropa/calzado por defecto
      setFormCategoria({
        nombre: '',
        descripcion: '',
        tipo_talla: configTienda.modo_negocio === 'MINIMARKET' ? 'NINGUNA' : 'ROPA',
      });
    }
    setModalCategoria(true);
  };

  const guardarCategoria = async () => {
    try {
      if (categoriaEditando) {
        await invoke('actualizar_categoria', {
          categoriaId: categoriaEditando.id,
          nombre: formCategoria.nombre,
          descripcion: formCategoria.descripcion || null,
          tipoTalla: formCategoria.tipo_talla,
        });
        mostrarMensaje('success', 'Categoria actualizada');
      } else {
        await invoke('agregar_categoria', {
          nombre: formCategoria.nombre,
          descripcion: formCategoria.descripcion || null,
          tipoTalla: formCategoria.tipo_talla,
        });
        mostrarMensaje('success', 'Categoria agregada');
      }
      setModalCategoria(false);
      cargarCategorias();
    } catch (error) {
      mostrarMensaje('error', 'Error al guardar categoria');
    }
  };

  const cargarUsuarios = async () => {
    try {
      const users = await invoke('obtener_usuarios');
      setUsuarios(users);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  };

  const cargarEstadoLicencia = async () => {
    try {
      const estado = await invoke('obtener_estado_licencia');
      setEstadoLicenciaLocal(estado);
    } catch (error) {
      console.error('Error al cargar estado de licencia:', error);
    }
  };

  const handleActivacionLicencia = () => {
    setMostrarActivarLicencia(false);
    cargarEstadoLicencia();
    // FIX: antes esto solo actualizaba el estado local de este panel;
    // el resto de la app (botones bloqueados en Caja/POS/Inventario) seguía
    // usando el estado viejo hasta el próximo login. Ahora se avisa también
    // hacia arriba para que se refresque de una en todo el sistema.
    if (onLicenciaActualizada) onLicenciaActualizada();
  };

  const cargarRoles = async () => {
    try {
      const rolesData = await invoke('obtener_roles');
      setRoles(rolesData);
    } catch (error) {
      console.error('Error al cargar roles:', error);
    }
  };

  const abrirModalUsuario = (usr = null) => {
    if (usr) {
      setUsuarioEditando(usr);
      setFormUsuario({
        username: usr.username, password: '',
        nombre_completo: usr.nombre_completo,
        email: usr.email || '', rol_id: usr.rol_id.toString()
      });
    } else {
      setUsuarioEditando(null);
      setFormUsuario({
        username: '', password: '', nombre_completo: '',
        email: '', rol_id: roles.length > 0 ? roles[0].id.toString() : ''
      });
    }
    setModalUsuario(true);
  };

  const guardarUsuario = async () => {
    try {
      if (usuarioEditando) {
        await invoke('actualizar_usuario', {
          usuarioId: usuarioEditando.id,
          username: formUsuario.username,
          nombreCompleto: formUsuario.nombre_completo,
          email: formUsuario.email || null,
          rolId: parseInt(formUsuario.rol_id),
          nuevaPassword: formUsuario.password || null
        });
        mostrarMensaje('success', 'Usuario actualizado');
      } else {
        if (!formUsuario.password) {
          mostrarMensaje('error', 'La contrasena es obligatoria');
          return;
        }
        await invoke('agregar_usuario', {
          username: formUsuario.username,
          password: formUsuario.password,
          nombreCompleto: formUsuario.nombre_completo,
          email: formUsuario.email || null,
          rolId: parseInt(formUsuario.rol_id)
        });
        mostrarMensaje('success', 'Usuario agregado');
      }
      setModalUsuario(false);
      cargarUsuarios();
    } catch (error) {
      mostrarMensaje('error', 'Error al guardar usuario');
    }
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 3000);
  };

  return (
    <div className="configuracion-container">
      <div className="configuracion-header">
        <button onClick={onVolver} className="btn-volver">Volver</button>
        <h2>Configuracion del Sistema</h2>
        <div className="configuracion-usuario">{usuario.nombre_completo}</div>
      </div>

      <div className="configuracion-content">
        <div className="tabs">
          <button className={`tab ${tabActual === 'tienda' ? 'active' : ''}`} onClick={() => setTabActual('tienda')}>
            Datos de la Tienda
          </button>
          <button className={`tab ${tabActual === 'impresora' ? 'active' : ''}`} onClick={() => setTabActual('impresora')}>
            Impresora
          </button>
          <button className={`tab ${tabActual === 'categorias' ? 'active' : ''}`} onClick={() => setTabActual('categorias')}>
            Categorias
          </button>
          <button className={`tab ${tabActual === 'usuarios' ? 'active' : ''}`} onClick={() => setTabActual('usuarios')}>
            Usuarios
          </button>
          <button className={`tab ${tabActual === 'licencia' ? 'active' : ''}`} onClick={() => setTabActual('licencia')}>
            Licencia
          </button>
          <button className={`tab ${tabActual === 'facturacion' ? 'active' : ''}`} onClick={() => setTabActual('facturacion')}>
            Facturación Electrónica
          </button>
        </div>

        {mensaje.texto && (
          <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
        )}

        <div className="tab-content">

          {/* TAB: DATOS DE LA TIENDA */}
          {tabActual === 'tienda' && (
            <div className="panel-tienda">
              <h3>Informacion de la Tienda</h3>
              <form className="form-tienda" onSubmit={(e) => { e.preventDefault(); guardarConfiguracionTienda(); }}>
                {/* Rubro fijo del sistema: Lubricentro. No se puede cambiar desde la
                    interfaz para no desordenar el catálogo de categorías ya en uso. */}
                <div className="form-group">
                  <label>Rubro del Negocio</label>
                  <div className="rubro-info-badge">Lubricentro</div>
                  <small style={{ color: '#666', fontSize: '12px', marginTop: '6px', display: 'block' }}>
                    El rubro del sistema es fijo y no se puede cambiar desde esta pantalla.
                  </small>
                </div>
                <div className="form-group">
                  <label>Nombre de la Tienda *</label>
                  <input type="text" value={configTienda.nombre_tienda}
                    onChange={(e) => setConfigTienda({...configTienda, nombre_tienda: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>RUC</label>
                  <input type="text" value={configTienda.rfc}
                    onChange={(e) => setConfigTienda({...configTienda, rfc: e.target.value})} maxLength="13" />
                </div>
                <div className="form-group">
                  <label>Telefono</label>
                  <input type="text" value={configTienda.telefono}
                    onChange={(e) => setConfigTienda({...configTienda, telefono: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={configTienda.email}
                    onChange={(e) => setConfigTienda({...configTienda, email: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Direccion</label>
                  <textarea value={configTienda.direccion}
                    onChange={(e) => setConfigTienda({...configTienda, direccion: e.target.value})} rows="3" />
                </div>
                <div className="form-group">
                  <label>Mensaje en Recibo</label>
                  <textarea value={configTienda.mensaje_recibo}
                    onChange={(e) => setConfigTienda({...configTienda, mensaje_recibo: e.target.value})} rows="2" />
                </div>
                <button type="submit" className="btn-guardar-config">Guardar Configuracion</button>
              </form>
            </div>
          )}

          {/* TAB: IMPRESORA */}
          {tabActual === 'impresora' && (
            <div className="panel-tienda">
              <h3>Configuracion de Impresora</h3>
              <form className="form-tienda" onSubmit={(e) => { e.preventDefault(); guardarConfiguracionTienda(); }}>
                <div className="form-group">
                  <label>Tipo de Impresora</label>
                  <select value={configTienda.impresora_tipo}
                    onChange={(e) => setConfigTienda({...configTienda, impresora_tipo: e.target.value})}>
                    <option value="TERMICA">Termica (TM-T20, TM-T88, etc.)</option>
                    <option value="MATRICIAL">Matricial (TM-U220, etc.)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>IP de la Impresora</label>
                  <input type="text" value={configTienda.impresora_ip}
                    onChange={(e) => setConfigTienda({...configTienda, impresora_ip: e.target.value})}
                    placeholder="Ej: 192.168.18.50" />
                </div>
                <div className="form-group">
                  <label>Puerto</label>
                  <input type="number" value={configTienda.impresora_puerto}
                    onChange={(e) => setConfigTienda({...configTienda, impresora_puerto: e.target.value})}
                    placeholder="9100" />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" className="btn-guardar-config">Guardar</button>
                  <button type="button" className="btn-guardar-config"
                    style={{ background: '#48bb78' }}
                    onClick={probarImpresora}
                    disabled={probandoImpresora || !configTienda.impresora_ip}>
                    {probandoImpresora ? 'Probando...' : 'Probar Impresora'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB: CATEGORIAS */}
          {tabActual === 'categorias' && (
            <div className="panel-categorias">
              <div className="panel-header">
                <h3>Gestion de Categorias</h3>
                <button onClick={() => abrirModalCategoria()} className="btn-nuevo">Nueva Categoria</button>
              </div>
              <div className="tabla-container">
                <table className="tabla-config">
                  <thead>
                    <tr><th>ID</th><th>Nombre</th><th>Tipo</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {categorias.map(cat => (
                      <tr key={cat.id}>
                        <td>{cat.id}</td>
                        <td>{cat.nombre}</td>
                        <td>
                          {cat.tipo_talla === 'ROPA' && ' Ropa'}
                          {cat.tipo_talla === 'CALZADO' && ' Calzado'}
                          {(!cat.tipo_talla || cat.tipo_talla === 'NINGUNA') && 'Sin tallas'}
                        </td>
                        <td>
                          <button onClick={() => abrirModalCategoria(cat)} className="btn-editar-small">Editar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: USUARIOS */}
          {tabActual === 'usuarios' && (
            <div className="panel-usuarios">
              <div className="panel-header">
                <h3>Gestion de Usuarios</h3>
                <button onClick={() => abrirModalUsuario()} className="btn-nuevo">Nuevo Usuario</button>
              </div>
              <div className="tabla-container">
                <table className="tabla-config">
                  <thead>
                    <tr><th>Usuario</th><th>Nombre Completo</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {usuarios.map(usr => (
                      <tr key={usr.id}>
                        <td>{usr.username}</td>
                        <td>{usr.nombre_completo}</td>
                        <td>{usr.email || '-'}</td>
                        <td><span className="badge-rol">{usr.rol_nombre}</span></td>
                        <td>
                          {usr.activo
                            ? <span className="badge badge-success">Activo</span>
                            : <span className="badge badge-inactive">Inactivo</span>}
                        </td>
                        <td>
                          <button onClick={() => abrirModalUsuario(usr)} className="btn-editar-small">Editar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tabActual === 'licencia' && (
            <div className="panel-licencia">
              <div className="panel-header">
                <h3>Mi Licencia</h3>
              </div>

              {estadoLicenciaLocal ? (
                <div className="licencia-resumen">
                  <div className="licencia-card-icono">
                    <IconAward size={30} stroke={1.8} />
                  </div>
                  <div className="licencia-datos">
                    <div className="licencia-fila">
                      <span className="licencia-label">Tipo de licencia</span>
                      <span className="licencia-valor">{estadoLicenciaLocal.tipo_licencia}</span>
                    </div>
                    <div className="licencia-fila">
                      <span className="licencia-label">Estado</span>
                      <span className={`licencia-badge ${estadoLicenciaLocal.puede_operar ? 'activo' : 'vencido'}`}>
                        {estadoLicenciaLocal.puede_operar ? 'Activa' : 'Vencida'}
                      </span>
                    </div>
                    <div className="licencia-fila">
                      <span className="licencia-label"><IconCalendarTime size={14} stroke={2} /> Días restantes</span>
                      <span className="licencia-valor">{Math.max(0, estadoLicenciaLocal.dias_restantes)}</span>
                    </div>
                  </div>
                  <button className="btn-cambiar-licencia" onClick={() => setMostrarActivarLicencia(true)}>
                    <IconKey size={16} stroke={2} /> Activar / Cambiar Licencia
                  </button>
                </div>
              ) : (
                <p>Cargando estado de licencia...</p>
              )}
            </div>
          )}

          {tabActual === 'facturacion' && (
            <div className="panel-facturacion">
              <div className="panel-header">
                <h3>Facturación Electrónica (SUNAT)</h3>
              </div>

             
              <p className="facturacion-intro">
                Conectá tu cuenta de <strong>NubeFacT</strong> (u otro proveedor compatible) para poder
                emitir boletas y facturas electrónicas válidas ante SUNAT directamente desde el Punto de Venta.{' '}
                {facturacionVerificada ? (
                  <span className="facturacion-estado-badge activo">Configurado y verificado</span>
                ) : facturacionConfigurada ? (
                  <span className="facturacion-estado-badge advertencia">Sin verificar — probá la conexión</span>
                ) : (
                  <span className="facturacion-estado-badge inactivo">No configurado</span>
                )}
              </p>
              {facturacionConfigurada && !facturacionVerificada && !resultadoPruebaNubefact && (
                <div className="facturacion-aviso-sin-probar">
                  El formato de la ruta y el token se ven bien, pero todavía no confirmaste que funcionen de verdad — usa "Probar conexión" antes de dar por hecho que ya puedes emitir boletas o facturas.
                </div>
              )}

              <div className="form-group">
                <label>Ruta de tu cuenta NubeFacT</label>
                <input
                  type="text"
                  value={nubefactRuta}
                  onChange={(e) => { setNubefactRuta(e.target.value); setResultadoPruebaNubefact(null); }}

                  placeholder="https://api.nubefact.com/api/v1/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                />
                <small className="form-hint">La encontrás en tu cuenta de NubeFacT "Api (Integración)"</small>
              </div>

              <div className="form-group">
                <label>Token de tu cuenta NubeFacT</label>
                <input
                  type="password"
                  value={nubefactToken}
                  onChange={(e) => { setNubefactToken(e.target.value); setResultadoPruebaNubefact(null); }}
                  placeholder="Tu token de acceso"
                />
              </div>

              <div className="facturacion-acciones">
                <button
                  className="btn-guardar-nubefact"
                  onClick={guardarNubefact}
                  disabled={guardandoNubefact}
                >
                  {guardandoNubefact ? 'Guardando...' : 'Guardar datos de facturación'}
                </button>
                <button
                  className="btn-probar-nubefact"
                  onClick={probarConexionNubefact}
                  disabled={probandoNubefact}
                >
                  {probandoNubefact ? 'Probando conexión...' : 'Probar conexión'}
                </button>
              </div>

              {resultadoPruebaNubefact && (
                <div className={`facturacion-resultado-prueba ${resultadoPruebaNubefact.success ? 'ok' : 'error'}`}>
                  {resultadoPruebaNubefact.mensaje}
                </div>
              )}

              <p className="facturacion-nota">
                Cada negocio necesita su propia cuenta de NubeFacT (con su propio RUC) — no se comparte
                entre instalaciones distintas. Si todavía no tenés cuenta, podés crear una gratis en{' '}
                <strong>nubefact.com</strong> para empezar a probar sin costo (modo Demo).
              </p>
            </div>
          )}
        </div>
      </div>

      {mostrarActivarLicencia && (
        <ActivarLicencia
          estadoLicencia={estadoLicenciaLocal}
          onActivacionExitosa={handleActivacionLicencia}
        />
      )}

      {/* MODAL CATEGORIA */}
      {modalCategoria && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{categoriaEditando ? 'Editar Categoria' : 'Nueva Categoria'}</h3>
              <button onClick={() => setModalCategoria(false)} className="btn-cerrar-modal">X</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); guardarCategoria(); }} className="form-modal">
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" value={formCategoria.nombre}
                  onChange={(e) => setFormCategoria({...formCategoria, nombre: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Descripcion</label>
                <textarea value={formCategoria.descripcion}
                  onChange={(e) => setFormCategoria({...formCategoria, descripcion: e.target.value})} rows="3" />
              </div>
              {/* 🆕 Tipo de categoría: solo tiene sentido ofrecer tallas de ropa/calzado en modo ROPA */}
              {configTienda.modo_negocio === 'MINIMARKET' ? (
                <div className="form-group">
                  <label>Tipo</label>
                  <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>
                    Sin tallas — este rubro no maneja variantes de talla.
                  </p>
                </div>
              ) : (
                <div className="form-group">
                  <label>Tipo de Categoría *</label>
                  <select
                    value={formCategoria.tipo_talla}
                    onChange={(e) => setFormCategoria({ ...formCategoria, tipo_talla: e.target.value })}
                  >
                    <option value="ROPA">Ropa (tallas S, M, L, XL...)</option>
                    <option value="CALZADO">Calzado (tallas 35-44)</option>
                    <option value="NINGUNA">Sin tallas (accesorios, ofertas, etc.)</option>
                  </select>
                </div>
              )}
              <div className="form-actions">
                <button type="button" onClick={() => setModalCategoria(false)} className="btn-cancelar">Cancelar</button>
                <button type="submit" className="btn-guardar">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL USUARIO */}
      {modalUsuario && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{usuarioEditando ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
              <button onClick={() => setModalUsuario(false)} className="btn-cerrar-modal">X</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); guardarUsuario(); }} className="form-modal">
              <div className="form-group">
                <label>Usuario *</label>
                <input type="text" value={formUsuario.username}
                  onChange={(e) => setFormUsuario({...formUsuario, username: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>{usuarioEditando ? 'Nueva Contrasena (dejar vacio para no cambiar)' : 'Contrasena *'}</label>
                <input type="password" value={formUsuario.password}
                  onChange={(e) => setFormUsuario({...formUsuario, password: e.target.value})}
                  required={!usuarioEditando} />
              </div>
              <div className="form-group">
                <label>Nombre Completo *</label>
                <input type="text" value={formUsuario.nombre_completo}
                  onChange={(e) => setFormUsuario({...formUsuario, nombre_completo: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formUsuario.email}
                  onChange={(e) => setFormUsuario({...formUsuario, email: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Rol *</label>
                <select value={formUsuario.rol_id}
                  onChange={(e) => setFormUsuario({...formUsuario, rol_id: e.target.value})} required>
                  {roles.map(rol => (
                    <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setModalUsuario(false)} className="btn-cancelar">Cancelar</button>
                <button type="submit" className="btn-guardar">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Configuracion;