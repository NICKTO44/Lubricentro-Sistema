import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Inventario.css';

// 🆕 Tamaño del thumbnail que se guarda en la base de datos
const TAMANO_IMAGEN = 200; // px (cuadrado)
const CALIDAD_JPEG = 0.8;

// 🆕 Recorta al centro (cuadrado) + redimensiona + comprime a JPEG.
// Devuelve un data URI base64 listo para guardar en SQLite (columna imagen_url).
function procesarImagen(archivo) {
  return new Promise((resolve, reject) => {
    if (!archivo.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen'));
      return;
    }
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.onload = () => {
        // Recorte al centro para que quede cuadrada (evita deformar la foto)
        const lado = Math.min(img.width, img.height);
        const offsetX = (img.width - lado) / 2;
        const offsetY = (img.height - lado) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = TAMANO_IMAGEN;
        canvas.height = TAMANO_IMAGEN;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(
          img,
          offsetX, offsetY, lado, lado,       // recorte cuadrado de la original
          0, 0, TAMANO_IMAGEN, TAMANO_IMAGEN   // destino ya redimensionado
        );
        resolve(canvas.toDataURL('image/jpeg', CALIDAD_JPEG));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

// Formatea el stock con su unidad: "10" (unidad), "2.5 kg", "500 g", "3 m", etc.
function formatearStock(cantidad, unidadMedida) {
  const num = Number(cantidad) || 0;
  const unidades = { KG: 'kg', GRAMO: 'g', LITRO: 'L', ML: 'mL', GALON: 'gal', METRO: 'm' };
  if (!unidadMedida || unidadMedida === 'UNIDAD') {
    return Number.isInteger(num) ? num.toString() : num.toFixed(2);
  }
  // Para peso/volumen/longitud, mostrar hasta 3 decimales, sin ceros de más
  const texto = num.toFixed(3).replace(/\.?0+$/, '');
  return `${texto} ${unidades[unidadMedida] || ''}`.trim();
}

function Inventario({ usuario, onVolver, modoSoloLectura }) {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]); // [[id, nombre, tipo_talla], ...]
  const [filtro, setFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [mostrarPorVencer, setMostrarPorVencer] = useState(false); // 🆕
  const [idsProductosPorVencer, setIdsProductosPorVencer] = useState(new Set()); // 🆕
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [modalLotes, setModalLotes] = useState(null); // 🆕 { producto, lotes: [] }
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [mostrarStockBajo, setMostrarStockBajo] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [guardando, setGuardando] = useState(false);

  // Form data base
  // 🆕 Ya NO incluye descuento_porcentaje — el descuento se decide en el
  // momento de la venta (en soles, desde el POS), no como propiedad fija
  // del producto en el catálogo.
  const [formData, setFormData] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    precio: '',
    stock: '',
    stock_minimo: '',
    unidad_medida: 'UNIDAD',
    lleva_vencimiento: false,
    fecha_vencimiento_inicial: '',
    categoria_id: '',
    imagen_url: null,
    viscosidad: '',
    precio_compra: '',
  });
  const [procesandoImagen, setProcesandoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState('');
  const [modoNegocio, setModoNegocio] = useState('LUBRICENTRO');

  useEffect(() => {
    cargarProductos();
    cargarCategorias();
    cargarModoNegocio();
  }, []);

  const cargarModoNegocio = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      setModoNegocio(config.modo_negocio || 'LUBRICENTRO');
    } catch (error) {
      console.error('Error al cargar modo de negocio:', error);
    }
  };

  const cargarProductos = async () => {
    try {
      const resultado = await invoke('obtener_productos');
      if (resultado.success) setProductos(resultado.productos);
    } catch (error) {
      console.error('Error al cargar productos:', error);
    }
  };

  const cargarCategorias = async () => {
    try {
      // Usar el nuevo comando que incluye tipo_talla
      const cats = await invoke('obtener_categorias_con_tipo');
      setCategorias(cats); // [[id, nombre, tipo_talla], ...]
    } catch (error) {
      // Fallback al comando anterior si el nuevo no existe aún
      try {
        const cats = await invoke('obtener_categorias');
        setCategorias(cats.map(([id, nombre]) => [id, nombre, 'ROPA']));
      } catch (e) {
        console.error('Error al cargar categorías:', e);
      }
    }
  };

  const cargarProductosStockBajo = async () => {
    try {
      const resultado = await invoke('obtener_productos_stock_bajo');
      if (resultado.success) {
        setProductos(resultado.productos);
        setMostrarStockBajo(true);
      }
    } catch (error) {
      console.error('Error al cargar productos con stock bajo:', error);
    }
  };

  const handleCategoriaChange = (categoriaId) => {
    setFormData(f => ({ ...f, categoria_id: categoriaId }));
  };

  // 🆕 Al seleccionar un archivo de imagen: recortar, redimensionar y comprimir
  const handleImagenChange = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorImagen('');
    setProcesandoImagen(true);
    try {
      const dataUri = await procesarImagen(archivo);
      setFormData(f => ({ ...f, imagen_url: dataUri }));
    } catch (error) {
      console.error('Error al procesar imagen:', error);
      setErrorImagen('No se pudo procesar la imagen. Probá con otro archivo.');
    } finally {
      setProcesandoImagen(false);
      e.target.value = ''; // permite re-seleccionar el mismo archivo si hace falta
    }
  };

  const quitarImagen = () => {
    setFormData(f => ({ ...f, imagen_url: null }));
  };

  const abrirModalNuevo = () => {
    if (modoSoloLectura) {
      mostrarMensaje('error', 'Activa tu licencia para agregar productos');
      return;
    }
    setProductoEditando(null);
    const primeraCat = categorias.length > 0 ? categorias[0] : null;
    setFormData({
      codigo: '',
      nombre: '',
      descripcion: '',
      precio: '',
      stock: '',
      stock_minimo: '',
      unidad_medida: 'UNIDAD',
      lleva_vencimiento: false,
      fecha_vencimiento_inicial: '',
      categoria_id: primeraCat ? primeraCat[0] : '',
      imagen_url: null,
      viscosidad: '',
      precio_compra: '',
    });
    setErrorImagen('');
    setMostrarModal(true);
  };

  // 🆕 Ver los lotes de un producto (cuáles hay, cuánto queda, cuándo vence)
  const abrirModalLotes = async (producto) => {
    setModalLotes({ producto, lotes: [] });
    setCargandoLotes(true);
    try {
      const lotes = await invoke('obtener_lotes_de_producto', { productoId: producto.id });
      setModalLotes({ producto, lotes });
    } catch (e) {
      mostrarMensaje('error', `Error al cargar los lotes: ${e}`);
    } finally {
      setCargandoLotes(false);
    }
  };

  const diasHasta = (fechaStr) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(fechaStr + 'T00:00:00');
    return Math.round((fecha - hoy) / (1000 * 60 * 60 * 24));
  };

  const abrirModalEditar = async (producto) => {
    if (modoSoloLectura) {
      mostrarMensaje('error', 'Activa tu licencia para editar productos');
      return;
    }
    setProductoEditando(producto);
    setFormData({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      precio: producto.precio.toString(),
      stock: producto.stock.toString(),
      stock_minimo: producto.stock_minimo.toString(),
      unidad_medida: producto.unidad_medida || 'UNIDAD',
      lleva_vencimiento: !!producto.lleva_vencimiento,
      categoria_id: producto.categoria_id.toString(),
      imagen_url: producto.imagen_url || null,
      viscosidad: producto.viscosidad || '',
      precio_compra: (producto.precio_compra || 0).toString(),
    });
    setErrorImagen('');
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setProductoEditando(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modoSoloLectura) {
      mostrarMensaje('error', 'Activa tu licencia para guardar cambios');
      cerrarModal();
      return;
    }

    const precioParaGuardar = parseFloat(formData.precio);

    setGuardando(true);
    try {
      if (productoEditando) {
        const resultado = await invoke('actualizar_producto', {
          productoId: productoEditando.id,
          codigo: formData.codigo,
          nombre: formData.nombre,
          descripcion: formData.descripcion || null,
          precio: precioParaGuardar,
          stock: parseFloat(formData.stock),
          stockMinimo: parseFloat(formData.stock_minimo),
          unidadMedida: formData.unidad_medida,
          llevaVencimiento: formData.lleva_vencimiento,
          categoriaId: parseInt(formData.categoria_id),
          // 🆕 El descuento por producto ya no existe en el catálogo — se
          // manda fijo en 0 porque el comando Rust todavía espera este
          // parámetro, pero ya no se usa para nada en la venta.
          descuentoPorcentaje: 0,
          tieneVariantes: false,
          variantes: null,
          imagenUrl: formData.imagen_url || null,
          viscosidad: formData.viscosidad || null,
          precioCompra: parseFloat(formData.precio_compra) || 0,
        });
        if (resultado.success) {
          mostrarMensaje('success', 'Producto actualizado correctamente');
          cerrarModal();
          cargarProductos();
        } else {
          mostrarMensaje('error', `${resultado.message}`);
        }
      } else {
        // 🆕 Si lleva vencimiento, el producto se crea con stock 0 —
        // el stock inicial se agrega aparte, como el primer lote (con su
        // propia fecha), para que nunca quede stock "suelto" fuera de un lote.
        const stockInicialLote = formData.lleva_vencimiento ? parseFloat(formData.stock) || 0 : 0;
        const stockParaProducto = formData.lleva_vencimiento ? 0 : parseFloat(formData.stock);

        const resultado = await invoke('agregar_producto', {
          producto: {
            codigo: formData.codigo,
            nombre: formData.nombre,
            descripcion: formData.descripcion || null,
            precio: precioParaGuardar,
            stock: stockParaProducto,
            stock_minimo: parseFloat(formData.stock_minimo),
            unidad_medida: formData.unidad_medida,
            lleva_vencimiento: formData.lleva_vencimiento,
            categoria_id: parseInt(formData.categoria_id),
            // 🆕 Igual que arriba: se manda fijo en 0, ya no viene del formulario
            descuento_porcentaje: 0,
            tiene_variantes: false,
            variantes: null,
            imagen_url: formData.imagen_url || null,
            viscosidad: formData.viscosidad || null,
            precio_compra: parseFloat(formData.precio_compra) || 0,
          },
        });
        if (resultado.success) {
          // 🆕 Crear el primer lote, si corresponde — buscamos el id real
          // del producto recién creado (por su código, que es único)
          if (formData.lleva_vencimiento && stockInicialLote > 0 && formData.fecha_vencimiento_inicial) {
            try {
              const prods = await invoke('obtener_productos');
              const creado = (prods.productos || []).find(p => p.codigo === formData.codigo);
              if (creado) {
                await invoke('agregar_lote_producto', {
                  productoId: creado.id,
                  cantidad: stockInicialLote,
                  fechaVencimiento: formData.fecha_vencimiento_inicial,
                  compraId: null,
                  numeroLote: formData.numero_lote_inicial || null,
                });
              }
            } catch (e) {
              mostrarMensaje('error', `Producto creado, pero falló el lote inicial: ${e}`);
            }
          }
          mostrarMensaje('success', 'Producto agregado correctamente');
          cerrarModal();
          cargarProductos();
        } else {
          mostrarMensaje('error', `${resultado.message}`);
        }
      }
    } catch (error) {
      console.error('Error al guardar producto:', error);
      mostrarMensaje('error', 'Error al guardar producto');
    } finally {
      setGuardando(false);
    }
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 3000);
  };

  const cargarProductosPorVencer = async () => {
    if (mostrarPorVencer) {
      setMostrarPorVencer(false); // toggle: si ya estaba activo, lo apago
      return;
    }
    try {
      const lotes = await invoke('obtener_lotes_por_vencer', { diasHorizonte: 15 });
      setIdsProductosPorVencer(new Set(lotes.map(l => l.producto_id)));
      setMostrarPorVencer(true);
    } catch (e) {
      mostrarMensaje('error', `Error al cargar productos por vencer: ${e}`);
    }
  };

  const productosFiltrados = productos.filter(producto => {
    const coincideTexto =
      producto.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
      producto.codigo.toLowerCase().includes(filtro.toLowerCase());
    const coincideCategoria =
      categoriaFiltro === '' || producto.categoria_id.toString() === categoriaFiltro;
    const coincidePorVencer =
      !mostrarPorVencer || idsProductosPorVencer.has(producto.id);
    return coincideTexto && coincideCategoria && coincidePorVencer;
  });

  return (
    <div className="inventario-container">
      <div className="inventario-header">
        <h2>Gestión de Inventario</h2>
        <div className="inventario-usuario">{usuario.nombre_completo}</div>
      </div>

      {modoSoloLectura && (
        <div className="modo-lectura-banner">
          <span className="icono-lectura"></span>
          <span className="texto-lectura">
            Modo Solo Lectura - Puedes ver el inventario pero no editarlo
          </span>
        </div>
      )}

      <div className="inventario-content">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-left">
            <input
              type="text"
              placeholder="Buscar producto..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="input-buscar"
            />
            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="select-categoria"
            >
              <option value="">Todas las categorías</option>
              {categorias.map(([id, nombre]) => (
                <option key={id} value={id}>{nombre}</option>
              ))}
            </select>
          </div>
          <div className="toolbar-right">
            <button onClick={() => { setMostrarStockBajo(false); setMostrarPorVencer(false); cargarProductos(); }} className="btn-todos">
              Todos
            </button>
            <button onClick={cargarProductosStockBajo} className="btn-stock-bajo">
              Stock Bajo
            </button>
            {modoNegocio === 'LUBRICENTRO' && (
              <button
                onClick={cargarProductosPorVencer}
                className={`btn-stock-bajo ${mostrarPorVencer ? 'btn-por-vencer-activo' : ''}`}
              >
                Por Vencer
              </button>
            )}
            <button
              onClick={abrirModalNuevo}
              className="btn-nuevo"
              disabled={modoSoloLectura}
              style={{ opacity: modoSoloLectura ? 0.6 : 1, cursor: modoSoloLectura ? 'not-allowed' : 'pointer' }}
            >
              Nuevo Producto
            </button>
          </div>
        </div>

        {mensaje.texto && (
          <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
        )}

        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <div className="stat-number">{productos.length}</div>
            <div className="stat-label">Productos Totales</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">
              {productos.filter(p => p.stock <= p.stock_minimo).length}
            </div>
            <div className="stat-label">Stock Bajo</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{categorias.length}</div>
            <div className="stat-label">Categorías</div>
          </div>
        </div>

        {/* Tabla */}
        <div className="tabla-container">
          <table className="tabla-productos">
            <thead>
              <tr>
                <th></th>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Stock Mín</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="9" className="sin-resultados">
                    {mostrarStockBajo ? 'No hay productos con stock bajo' : 'No se encontraron productos'}
                  </td>
                </tr>
              ) : (
                productosFiltrados.map(producto => (
                  <tr key={producto.id} className={producto.stock <= producto.stock_minimo ? 'stock-bajo-row' : ''}>
                    <td className="thumb-col">
                      {producto.imagen_url ? (
                        <img src={producto.imagen_url} alt={producto.nombre} className="thumb-producto" />
                      ) : (
                        <div className="thumb-placeholder"></div>
                      )}
                    </td>
                    <td>{producto.codigo}</td>
                    <td className="nombre-col">
                      <div className="nombre-producto">
                        {producto.nombre}
                        {producto.viscosidad && (
                          <span className="badge-viscosidad">
                            {producto.viscosidad}
                          </span>
                        )}
                      </div>
                      {producto.descripcion && (
                        <div className="descripcion-producto">{producto.descripcion}</div>
                      )}
                    </td>
                    <td>{producto.categoria_nombre || 'Sin categoría'}</td>
                    <td className="precio-col">S/ {producto.precio.toFixed(2)}</td>
                    <td className="stock-col">
                      <span className={producto.stock <= producto.stock_minimo ? 'stock-bajo' : 'stock-ok'}>
                        {formatearStock(producto.stock, producto.unidad_medida)}
                      </span>
                    </td>
                    <td>{formatearStock(producto.stock_minimo, producto.unidad_medida)}</td>
                    <td>
                      {producto.stock <= producto.stock_minimo ? (
                        <span className="badge badge-warning">Bajo</span>
                      ) : (
                        <span className="badge badge-success">OK</span>
                      )}
                    </td>
                    <td>
                      <div className="celda-acciones">
                        <button
                          onClick={() => abrirModalEditar(producto)}
                          className="btn-editar"
                          disabled={modoSoloLectura}
                          style={{ opacity: modoSoloLectura ? 0.6 : 1, cursor: modoSoloLectura ? 'not-allowed' : 'pointer' }}
                        >
                          Editar
                        </button>
                        {producto.lleva_vencimiento && (
                          <button
                            onClick={() => abrirModalLotes(producto)}
                            className="btn-ver-lotes"
                          >
                            Lotes
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {mostrarModal && !modoSoloLectura && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-grande">
            <div className="modal-header">
              <h3>{productoEditando ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button onClick={cerrarModal} className="btn-cerrar-modal">X</button>
            </div>

            <form onSubmit={handleSubmit} className="form-producto">

              {/* Código + Categoría */}
              <div className="form-row">
                <div className="form-group">
                  <label>Código *</label>
                  <input
                    type="text"
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Categoría *</label>
                  <select
                    value={formData.categoria_id}
                    onChange={(e) => handleCategoriaChange(e.target.value)}
                    required
                  >
                    {categorias.map(([id, nombre]) => (
                      <option key={id} value={id}>{nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nombre */}
              <div className="form-group">
                <label>Nombre del Producto *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  required
                />
              </div>

              {/* 🆕 Imagen del producto */}
              <div className="form-group">
                <label>Imagen del Producto</label>
                <div className="imagen-uploader">
                  <div className="imagen-preview-box">
                    {formData.imagen_url ? (
                      <img src={formData.imagen_url} alt="Vista previa" className="imagen-preview" />
                    ) : (
                      <div className="imagen-placeholder"></div>
                    )}
                  </div>
                  <div className="imagen-uploader-acciones">
                    <label className="btn-subir-imagen">
                      {procesandoImagen ? 'Procesando...' : (formData.imagen_url ? 'Cambiar imagen' : 'Subir imagen')}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImagenChange}
                        disabled={procesandoImagen}
                        hidden
                      />
                    </label>
                    {formData.imagen_url && (
                      <button type="button" onClick={quitarImagen} className="btn-quitar-imagen">
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
                {errorImagen && <small className="imagen-error">{errorImagen}</small>}
                <small style={{ color: '#666', fontSize: '12px', marginTop: '5px', display: 'block' }}>
                  Opcional. Se ajusta automáticamente a miniatura cuadrada.
                </small>
              </div>

              {/* Descripción */}
              <div className="form-group">
                <label>Descripción</label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows="2"
                />
              </div>

              {/* Precio + Stock mínimo + Unidad + Viscosidad + Vencimiento */}
              {/* 🆕 Ya no hay campo de "Descuento %" — el descuento se decide
                  en el momento de la venta, desde el POS, no acá. */}
              <div className="form-row">
                <div className="form-group">
                  <label>Precio de venta *</label>
                  <input
                    type="number" step="0.01"
                    value={formData.precio}
                    onChange={(e) => setFormData({ ...formData, precio: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Precio de compra</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={formData.precio_compra}
                    onChange={(e) => setFormData({ ...formData, precio_compra: e.target.value })}
                    placeholder="0.00"
                  />
                  <small className="form-hint">
                    Se actualiza solo al recibir una compra real desde Proveedores — acá también lo puedes ajustar a mano
                  </small>
                </div>
                <div className="form-group">
                  <label>Stock Mínimo *</label>
                  <input
                    type="number" step="0.001" min="0"
                    value={formData.stock_minimo}
                    onChange={(e) => setFormData({ ...formData, stock_minimo: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Unidad de Venta *</label>
                  <select
                    value={formData.unidad_medida}
                    onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}
                  >
                    <option value="UNIDAD">Unidad</option>
                    <option value="KG">Kilogramo (kg)</option>
                    <option value="GRAMO">Gramo (g)</option>
                    <option value="LITRO">Litro (L)</option>
                    <option value="ML">Mililitro (mL)</option>
                    <option value="GALON">Galón</option>
                    <option value="METRO">Metro (m)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Viscosidad SAE (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: 20W-50"
                    value={formData.viscosidad}
                    onChange={(e) => setFormData({ ...formData, viscosidad: e.target.value })}
                  />
                  <small className="form-hint">Solo aplica a aceites y lubricantes</small>
                </div>
                <div className="form-group">
                  <label>Vencimiento</label>
                  <div className="toggle-vencimiento">
                    <button
                      type="button"
                      className={`toggle-opcion ${!formData.lleva_vencimiento ? 'activo' : ''}`}
                      onClick={() => setFormData({ ...formData, lleva_vencimiento: false })}
                    >
                      No vence
                    </button>
                    <button
                      type="button"
                      className={`toggle-opcion ${formData.lleva_vencimiento ? 'activo' : ''}`}
                      onClick={() => setFormData({ ...formData, lleva_vencimiento: true })}
                    >
                      Lleva vencimiento
                    </button>
                  </div>
                  <small className="form-hint">Ej: aceites, refrigerante, líquido de frenos, aditivos sí — filtros, accesorios no</small>
                </div>
              </div>

              {/* Stock (según si lleva vencimiento o no) */}
              <div className="form-group">
                {formData.lleva_vencimiento && productoEditando ? (
                  <>
                    <label>Stock Actual {formData.unidad_medida !== 'UNIDAD' ? `(${formData.unidad_medida.toLowerCase()})` : ''}</label>
                    <input type="number" value={formData.stock} disabled className="input-solo-lectura" />
                    <small className="form-hint">
                      Este producto controla vencimiento — el stock se calcula solo, según los lotes activos.
                      Para sumar más, recibí una compra en Proveedores (con su fecha de vencimiento).
                    </small>
                  </>
                ) : formData.lleva_vencimiento && !productoEditando ? (
                  <>
                    <label>Stock Inicial {formData.unidad_medida !== 'UNIDAD' ? `(${formData.unidad_medida.toLowerCase()})` : ''}</label>
                    <input
                      type="number" step="0.001" min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    />
                    <label style={{ marginTop: '10px', display: 'block' }}>
                      Vencimiento de este stock inicial {parseFloat(formData.stock) > 0 ? '*' : ''}
                    </label>
                    <input
                      type="date"
                      value={formData.fecha_vencimiento_inicial || ''}
                      onChange={(e) => setFormData({ ...formData, fecha_vencimiento_inicial: e.target.value })}
                      required={parseFloat(formData.stock) > 0}
                    />
                    <label style={{ marginTop: '10px', display: 'block' }}>Código de lote (opcional)</label>
                    <input
                      type="text"
                      value={formData.numero_lote_inicial || ''}
                      onChange={(e) => setFormData({ ...formData, numero_lote_inicial: e.target.value })}
                      placeholder="Ej: L-2508A"
                    />
                    <small className="form-hint">
                      Este stock inicial se va a convertir en el primer lote. Si no tenés stock todavía, dejalo en 0 —
                      vas a poder agregarlo después, con su fecha, al recibir una compra.
                    </small>
                  </>
                ) : (
                  <>
                    <label>Stock Actual {formData.unidad_medida !== 'UNIDAD' ? `(${formData.unidad_medida.toLowerCase()})` : ''} *</label>
                    <input
                      type="number" step="0.001" min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      required
                    />
                  </>
                )}
              </div>

              <div className="form-actions">
                <button type="button" onClick={cerrarModal} className="btn-cancelar">
                  Cancelar
                </button>
                <button type="submit" className="btn-guardar" disabled={guardando}>
                  {guardando ? 'Guardando...' : (productoEditando ? 'Actualizar' : 'Agregar')} Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🆕 Modal: Lotes del producto */}
      {modalLotes && (
        <div className="modal-overlay" onClick={() => setModalLotes(null)}>
          <div className="modal-content modal-lotes" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Lotes — {modalLotes.producto.nombre}</h2>
              <button className="btn-cerrar-modal" onClick={() => setModalLotes(null)}></button>
            </div>

            {cargandoLotes ? (
              <p style={{ padding: '20px' }}>Cargando...</p>
            ) : modalLotes.lotes.length === 0 ? (
              <p style={{ padding: '20px', color: '#6b7280' }}>Este producto no tiene lotes activos.</p>
            ) : (
              <table className="tabla-lotes">
                <thead>
                  <tr>
                    <th>Código de lote</th>
                    <th>Cantidad</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {modalLotes.lotes.map(lote => {
                    const dias = diasHasta(lote.fecha_vencimiento);
                    return (
                      <tr key={lote.id} className={dias < 0 ? 'fila-lote-vencido' : dias <= 3 ? 'fila-lote-urgente' : ''}>
                        <td>{lote.numero_lote || <span style={{ color: '#9ca3af' }}>— sin código —</span>}</td>
                        <td>{lote.cantidad}</td>
                        <td>{lote.fecha_vencimiento}</td>
                        <td>
                          {dias < 0
                            ? `Vencido hace ${Math.abs(dias)} día(s)`
                            : dias === 0
                              ? 'Vence hoy'
                              : dias <= 3
                                ? `Vende primero — ${dias} día(s)`
                                : `${dias} día(s)`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="lotes-hint">
              Los lotes ya están ordenados del que vence antes al que vence después — al vender,
              el sistema descuenta siempre del primero de esta lista.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventario;