import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Recibo from '../../components/Recibo';
import './POS.css';

function POS({ usuario, onVolver, modoSoloLectura }) {
  const [productos, setProductos] = useState([]);
  const [productosFiltrados, setProductosFiltrados] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [codigoBuscar, setCodigoBuscar] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('TODAS');
  const [categorias, setCategorias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [actualizandoProductos, setActualizandoProductos] = useState(false); // 🆕 refresco manual del catálogo
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [mostrarRecibo, setMostrarRecibo] = useState(false);
  const [datosVenta, setDatosVenta] = useState(null);
  const [modalComprobante, setModalComprobante] = useState(null); // { ventaId, items, total }
  const [tipoComprobanteElegido, setTipoComprobanteElegido] = useState(null); // null | 'BOLETA' | 'FACTURA'
  const [documentoCliente, setDocumentoCliente] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [placaVehiculo, setPlacaVehiculo] = useState(''); // 🆕 Placa del vehículo (lubricentro), opcional
  // 🆕 Selector de cliente guardado (para no escribir DNI/RUC a mano cada vez)
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null); // cliente elegido de la lista, o null
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [resultadosClientes, setResultadosClientes] = useState([]);
  const [dropdownClienteVisible, setDropdownClienteVisible] = useState(false);
  const [emitiendoComprobante, setEmitiendoComprobante] = useState(false);
  const [resultadoComprobante, setResultadoComprobante] = useState(null); // { success, mensaje, enlace_pdf }
  const [modalVistaPreviaComprobante, setModalVistaPreviaComprobante] = useState(null); // { dataUri } | 'cargando' | 'error'
  const [mostrarConfirmacionLimpiar, setMostrarConfirmacionLimpiar] = useState(false);
  const [facturacionConfigurada, setFacturacionConfigurada] = useState(true);
  const inputCodigoRef = useRef(null);

  // 🆕 Modal selector de talla
  const [modalTalla, setModalTalla] = useState(null);
  // modalTalla = { producto, variantes: [{id, talla, stock}] }
  const [modalCantidadPeso, setModalCantidadPeso] = useState(null);
  // modalCantidadPeso = { producto }
  const [inputCantidadPeso, setInputCantidadPeso] = useState('');

  // 🆕 Edición manual del precio de un item ya en el carrito (no toca el precio del catálogo)
  const [editandoPrecioClave, setEditandoPrecioClave] = useState(null);
  const [inputPrecioEditado, setInputPrecioEditado] = useState('');

  useEffect(() => {
    cargarProductos();
    cargarCategorias();
    verificarFacturacionConfigurada();
  }, []);

  const verificarFacturacionConfigurada = async () => {
    try {
      const config = await invoke('obtener_configuracion_tienda');
      const tieneCredenciales = !!(config?.facturalibre_token && config.facturalibre_token.trim() && config?.facturalibre_ruta && config.facturalibre_ruta.trim());
      setFacturacionConfigurada(tieneCredenciales);
    } catch (error) {
      console.error('Error al verificar configuración de facturación:', error);
      setFacturacionConfigurada(false);
    }
  };

  const cargarProductos = async () => {
    try {
      const resultado = await invoke('obtener_productos');
      if (resultado.success) {
        setProductos(resultado.productos);
        setProductosFiltrados(resultado.productos);
      }
    } catch (error) {
      console.error('Error al cargar productos:', error);
    }
  };

  const cargarCategorias = async () => {
    try {
      const cats = await invoke('obtener_nombres_categorias');
      setCategorias(['TODAS', ...cats]);
    } catch (error) {
      console.error('Error al cargar categorías:', error);
    }
  };

  // 🆕 Refresco manual del catálogo — vuelve a traer productos y categorías
  // desde la base de datos y limpia la búsqueda/filtro actual, por si el
  // listado quedó desactualizado después de registrar varios productos.
  const actualizarCatalogo = async () => {
    setActualizandoProductos(true);
    setCodigoBuscar('');
    setCategoriaSeleccionada('TODAS');
    try {
      await Promise.all([cargarProductos(), cargarCategorias()]);
      mostrarMensaje('success', 'Catálogo actualizado');
    } catch (error) {
      console.error('Error al actualizar catálogo:', error);
      mostrarMensaje('error', 'No se pudo actualizar el catálogo');
    } finally {
      setActualizandoProductos(false);
      inputCodigoRef.current?.focus();
    }
  };

  useEffect(() => {
    const filtrar = async () => {
      if (codigoBuscar.trim() === '' && categoriaSeleccionada === 'TODAS') {
        setProductosFiltrados(productos);
        return;
      }
      try {
        const resultado = await invoke('buscar_productos_filtrado', {
          termino: codigoBuscar.trim(),
          categoria: categoriaSeleccionada === 'TODAS' ? null : categoriaSeleccionada,
        });
        setProductosFiltrados(resultado);
      } catch {
        setProductosFiltrados([]);
      }
    };
    const t = setTimeout(filtrar, 300);
    return () => clearTimeout(t);
  }, [codigoBuscar, categoriaSeleccionada, productos]);

  const buscarProductoPorCodigo = async () => {
    if (!codigoBuscar.trim()) return;
    if (modoSoloLectura) {
      mostrarMensaje('error', 'Activa tu licencia para procesar ventas');
      return;
    }
    setBuscando(true);
    try {
      const resultadoCodigo = await invoke('buscar_producto_por_codigo', {
        codigo: codigoBuscar.trim(),
      });
      if (resultadoCodigo.success && resultadoCodigo.producto) {
        await manejarAgregarProducto(resultadoCodigo.producto);
        setCodigoBuscar('');
      } else {
        const resultadoFiltrado = await invoke('buscar_productos_filtrado', {
          termino: codigoBuscar.trim(),
          categoria: categoriaSeleccionada === 'TODAS' ? null : categoriaSeleccionada,
        });
        if (resultadoFiltrado.length === 1) {
          await manejarAgregarProducto(resultadoFiltrado[0]);
          setCodigoBuscar('');
        } else if (resultadoFiltrado.length > 1) {
          mostrarMensaje('error', `${resultadoFiltrado.length} productos encontrados. Haz clic en uno.`);
        } else {
          mostrarMensaje('error', 'Producto no encontrado');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      mostrarMensaje('error', 'Error al buscar producto');
    } finally {
      setBuscando(false);
      inputCodigoRef.current?.focus();
    }
  };

const getStockClass = (stock) => {
  if (stock === 0) return 'out';
  if (stock <= 3)  return 'low';
  return 'normal';
};

// 🆕 Redondea a 3 decimales y saca ceros de más — evita mostrar cosas como
// "0.8999999999999999" por errores de punto flotante en productos por peso
const formatearNumero = (n) => {
  const num = Number(n) || 0;
  return (Math.round(num * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '');
};

const getStockTexto = (stock, unidadMedida) => {
  if (stock === 0) return 'Agotado';
    const unidades = { KG: 'kg', GRAMO: 'g', LITRO: 'L', ML: 'mL', GALON: 'gal', METRO: 'm' };
  if (!unidadMedida || unidadMedida === 'UNIDAD') {
    return `Stock: ${Math.round(stock)}`;
  }
  return `Stock: ${formatearNumero(stock)} ${unidades[unidadMedida] || ''}`.trim();
};

  // 🆕 Punto central para agregar producto — decide si pedir talla o no
  const manejarAgregarProducto = async (producto) => {
    if (modoSoloLectura) {
      mostrarMensaje('error', 'Activa tu licencia para agregar productos al carrito');
      return;
    }

    if (producto.tiene_variantes) {
      // Cargar variantes y mostrar modal
      try {
        const variantes = await invoke('obtener_variantes_producto', {
          productoId: producto.id,
        });
        const disponibles = variantes.filter(v => v.stock > 0);
        if (disponibles.length === 0) {
          mostrarMensaje('error', 'Sin stock en ninguna talla');
          return;
        }
        setModalTalla({ producto, variantes: disponibles });
      } catch (e) {
        console.error('Error al cargar variantes:', e);
        mostrarMensaje('error', 'Error al cargar tallas');
      }
    } else if (producto.unidad_medida && producto.unidad_medida !== 'UNIDAD') {
      // 🆕 Producto por peso/volumen: pedir la cantidad a agregar. Si el
      // producto ya está en el carrito, esto se SUMA a lo que ya hay
      // (no reemplaza), igual que pasa con los productos por unidad.
      setInputCantidadPeso('');
      setModalCantidadPeso({ producto });
    } else {
      agregarAlCarrito(producto, null, null);
      // 🆕 Al agregar por clic en la tarjeta (no por código escaneado/escrito),
      // el foco se quedaba en la tarjeta — el cajero tenía que volver a hacer
      // clic en el campo de código para seguir registrando. Ahora el cursor
      // vuelve solo ahí, igual que ya pasa al escanear un código.
      inputCodigoRef.current?.focus();
    }
  };

  // 🆕 Confirmar cantidad exacta de un producto por peso/volumen
  // 🆕 Comprobante electrónico (Boleta/Factura) tras cerrar una venta
  const cerrarModalComprobante = () => {
    // 🆕 Si ya se emitió una Boleta/Factura real con éxito, no hace falta el
    // ticket interno de más — el cliente ya tiene su comprobante real.
    // Solo mostramos el ticket interno si eligió "Sin comprobante" o si la
    // emisión falló (así igual se lleva algún comprobante de la compra).
    const yaTieneComprobanteReal = resultadoComprobante?.success === true;
    setModalComprobante(null);
    setTipoComprobanteElegido(null);
    setDocumentoCliente('');
    setNombreCliente('');
    setPlacaVehiculo('');
    setResultadoComprobante(null);
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setResultadosClientes([]);
    setDropdownClienteVisible(false);
    if (!yaTieneComprobanteReal) {
      setMostrarRecibo(true);
    }
  };

  // 🆕 Buscar clientes guardados por nombre o documento, para autocompletar
  // los datos del comprobante sin tener que escribirlos a mano
  const buscarClientes = async (texto) => {
    setBusquedaCliente(texto);
    setClienteSeleccionado(null);
    if (!texto.trim()) {
      setResultadosClientes([]);
      setDropdownClienteVisible(false);
      return;
    }
    try {
      const res = await invoke('buscar_clientes', { texto });
      setResultadosClientes(res.clientes || []);
      setDropdownClienteVisible(true);
    } catch (error) {
      console.error('Error al buscar clientes:', error);
    }
  };

  const seleccionarClienteComprobante = (cliente) => {
    setClienteSeleccionado(cliente);
    setBusquedaCliente(cliente.nombre);
    setDropdownClienteVisible(false);
    setDocumentoCliente(cliente.numero_documento || '');
    setNombreCliente(cliente.nombre || '');
    setPlacaVehiculo(cliente.placa || ''); // 🆕 autocompleta la placa guardada del cliente
  };

  const quitarClienteSeleccionado = () => {
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setResultadosClientes([]);
    setDocumentoCliente('');
    setNombreCliente('');
    setPlacaVehiculo('');
  };

  // 🆕 La venta recién se guarda acá — cuando el cajero confirma "Continuar"
  // (sin comprobante) o "Emitir Boleta/Factura". Hasta este punto no se tocó
  // la base de datos ni el stock, así que "Editar" y "Cancelar" pueden
  // simplemente descartar todo sin dejar nada a medias.
  const confirmarComprobante = async () => {
    if (!modalComprobante) return;

    if (tipoComprobanteElegido) {
      const doc = documentoCliente.trim();
      if (tipoComprobanteElegido === 'FACTURA' && doc.length !== 11) {
        mostrarMensaje('error', 'La factura necesita un RUC de 11 dígitos');
        return;
      }
      if (tipoComprobanteElegido === 'BOLETA' && doc && doc.length !== 8) {
        mostrarMensaje('error', 'El DNI debe tener 8 dígitos');
        return;
      }
    }

    setEmitiendoComprobante(true);

    // 1. Guardar la venta recién ahora, si todavía no se guardó (por ejemplo,
    // si esto es un reintento tras corregir el documento, la venta ya existe
    // y no hay que volver a crearla)
    let ventaId = modalComprobante.ventaId;
    if (!ventaId) {
      try {
        const resultado = await invoke('procesar_venta', {
          ...modalComprobante.datosVenta,
          usuarioId: usuario.id,
        });
        ventaId = resultado.venta_id;
        setDatosVenta({ ...modalComprobante.ventaParaRecibo, folio: resultado.folio });
        setModalComprobante(prev => (prev ? { ...prev, ventaId } : prev));
        setCarrito([]);
        setMontoRecibido('');
        setCodigoBuscar('');
        cargarProductos();
        mostrarMensaje('success', 'Venta procesada exitosamente');
      } catch (error) {
        console.error('Error al procesar venta:', error);
        mostrarMensaje('error', `${error}`);
        setEmitiendoComprobante(false);
        return; // el carrito sigue intacto — el cajero puede Editar y corregir
      }
    }

    // 2. Si eligió Boleta/Factura, emitir el comprobante contra esa venta
    if (tipoComprobanteElegido) {
      setResultadoComprobante(null);
      try {
        const doc = documentoCliente.trim();
        const resultado = await invoke('emitir_comprobante_electronico', {
          request: {
            venta_id: ventaId,
            tipo: tipoComprobanteElegido,
            cliente_id: clienteSeleccionado?.id || null,
            cliente_documento: doc || null,
            cliente_nombre: nombreCliente.trim() || null,
            placa: placaVehiculo.trim() || null,
            items: modalComprobante.items,
            total: modalComprobante.total,
          },
        });
        setResultadoComprobante(resultado);
      } catch (error) {
        setResultadoComprobante({ success: false, mensaje: String(error) });
      } finally {
        setEmitiendoComprobante(false);
      }
    } else {
      // Sin comprobante: la venta ya quedó guardada, mostramos el recibo interno
      setEmitiendoComprobante(false);
      cerrarModalComprobante();
    }
  };

  // 🆕 "Editar": todavía no se guardó nada en la base de datos — el carrito
  // sigue intacto, así que solo hace falta cerrar el modal y volver al POS.
  const editarVenta = () => {
    if (modalComprobante?.ventaId) return; // salvaguarda: la venta ya se guardó, no corresponde "editar"
    setModalComprobante(null);
    setTipoComprobanteElegido(null);
    setDocumentoCliente('');
    setNombreCliente('');
    setPlacaVehiculo('');
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setResultadosClientes([]);
    setDropdownClienteVisible(false);
    inputCodigoRef.current?.focus();
  };

  // 🆕 "Cancelar": aborta la venta antes de guardarla — como todavía no se
  // tocó la base de datos ni el stock, alcanza con vaciar el carrito.
  const cancelarVenta = () => {
    if (modalComprobante?.ventaId) return; // salvaguarda: la venta ya se guardó, no corresponde cancelarla así
    setCarrito([]);
    setMontoRecibido('');
    setCodigoBuscar('');
    setModalComprobante(null);
    setTipoComprobanteElegido(null);
    setDocumentoCliente('');
    setNombreCliente('');
    setPlacaVehiculo('');
    setClienteSeleccionado(null);
    setBusquedaCliente('');
    setResultadosClientes([]);
    setDropdownClienteVisible(false);
    mostrarMensaje('success', 'Venta cancelada');
    inputCodigoRef.current?.focus();
  };

  const confirmarCantidadPeso = () => {
    if (!modalCantidadPeso) return;
    const cantidad = parseFloat(inputCantidadPeso);
    if (!cantidad || cantidad <= 0) {
      mostrarMensaje('error', 'Ingresa una cantidad válida');
      return;
    }
    const producto = modalCantidadPeso.producto;
    const claveCarrito = `${producto.id}`;
    const yaEnCarrito = carrito.find(item => item.claveCarrito === claveCarrito);
    // 🆕 Si el producto ya está en el carrito, lo ingresado se SUMA a lo que
    // ya hay (no lo reemplaza) — igual que los productos por unidad/talla.
    const cantidadTotal = yaEnCarrito ? yaEnCarrito.cantidad + cantidad : cantidad;
    if (cantidadTotal > producto.stock) {
      mostrarMensaje('error', `Solo hay ${formatearNumero(producto.stock)} ${producto.unidad_medida.toLowerCase()} en stock`);
      return;
    }
    let seAgrego = true;
    if (yaEnCarrito) {
      modificarCantidad(claveCarrito, cantidadTotal);
    } else {
      seAgrego = agregarAlCarrito(producto, null, null, null, cantidadTotal);
    }
    setModalCantidadPeso(null);
    setInputCantidadPeso('');
    if (seAgrego) {
      mostrarMensaje('success', `${producto.nombre}: ${cantidad} ${producto.unidad_medida.toLowerCase()} agregado`);
    }
    inputCodigoRef.current?.focus();
  };

  // 🆕 Confirmar talla seleccionada desde el modal
  const confirmarTalla = (variante) => {
    if (!modalTalla) return;
    const seAgrego = agregarAlCarrito(modalTalla.producto, variante.id, variante.talla, variante.stock, 1, variante.precio);
    setModalTalla(null);
    if (seAgrego) {
      mostrarMensaje('success', `${modalTalla.producto.nombre} talla ${variante.talla} agregado`);
    }
    inputCodigoRef.current?.focus();
  };

  const agregarAlCarrito = (producto, varianteId = null, talla = null, stockVariante = null, cantidadInicial = 1, precioVariante = null) => {
    // Clave única en carrito: producto_id + variante_id (o solo producto_id si no tiene tallas)
    const claveCarrito = varianteId ? `${producto.id}-${varianteId}` : `${producto.id}`;
    const stockReal = stockVariante !== null ? stockVariante : producto.stock;
    // 🆕 Si la talla tiene su propio precio, se usa ese — si no, el del producto (como siempre)
    const precioAUsar = (precioVariante !== null && precioVariante !== undefined) ? precioVariante : producto.precio;

    const existe = carrito.find(item => item.claveCarrito === claveCarrito);

    if (existe) {
      const nuevaCantidad = existe.cantidad + cantidadInicial;
      if (nuevaCantidad <= stockReal) {
        setCarrito(carrito.map(item =>
          item.claveCarrito === claveCarrito
            ? { ...item, cantidad: nuevaCantidad }
            : item
        ));
        return true;
      } else {
        mostrarMensaje('error', `Stock agotado — solo hay ${formatearNumero(stockReal)} disponible${stockReal === 1 ? '' : 's'} de talla ${talla || ''}`);
        return false;
      }
    } else {
      if (stockReal > 0) {
        setCarrito([...carrito, {
          claveCarrito,
          id: producto.id,
          variante_id: varianteId,
          talla,
          codigo: producto.codigo,
          nombre: producto.nombre,
          precio: precioAUsar,
          // 🆕 Precio de catálogo al momento de agregar — solo referencia interna,
          // nunca se muestra ni se usa para el cálculo; el catálogo real vive en `productos`.
          precio_original: precioAUsar,
          cantidad: cantidadInicial,
          stock: stockReal,
          unidad_medida: producto.unidad_medida || 'UNIDAD',
          // 🆕 Descuento por línea en SOLES directos (ya no porcentaje)
          descuento_monto: 0,
        }]);
        return true;
      } else {
        mostrarMensaje('error', 'Producto sin stock');
        return false;
      }
    }
  };

  const modificarCantidad = (claveCarrito, nuevaCantidad) => {
    if (modoSoloLectura) return;
    const producto = carrito.find(item => item.claveCarrito === claveCarrito);
    if (nuevaCantidad <= 0) { eliminarDelCarrito(claveCarrito); return; }
    if (nuevaCantidad > producto.stock) {
      mostrarMensaje('error', `Solo hay ${producto.stock} en stock`);
      return;
    }
    setCarrito(carrito.map(item =>
      item.claveCarrito === claveCarrito ? { ...item, cantidad: nuevaCantidad } : item
    ));
  };

  const eliminarDelCarrito = (claveCarrito) => {
    if (modoSoloLectura) return;
    setCarrito(carrito.filter(item => item.claveCarrito !== claveCarrito));
    if (editandoPrecioClave === claveCarrito) {
      setEditandoPrecioClave(null);
      setInputPrecioEditado('');
    }
  };

  // 🆕 Edición manual del precio de un item ya agregado al carrito.
  // Solo cambia item.precio en el estado del carrito — no toca `productos`
  // ni llama a ningún comando de Rust, así que el precio del catálogo
  // (SQLite) queda exactamente igual después de la venta.
  const iniciarEdicionPrecio = (item) => {
    if (modoSoloLectura) return;
    setEditandoPrecioClave(item.claveCarrito);
    setInputPrecioEditado(item.precio.toString());
  };

  const cancelarEdicionPrecio = () => {
    setEditandoPrecioClave(null);
    setInputPrecioEditado('');
  };

  const confirmarEdicionPrecio = (claveCarrito) => {
    // Si ya se cerró por otro evento (ej. blur tras Enter), no hacer nada
    if (editandoPrecioClave !== claveCarrito) return;

    const nuevoPrecio = parseFloat(inputPrecioEditado);
    if (!nuevoPrecio || nuevoPrecio <= 0) {
      mostrarMensaje('error', 'Precio inválido');
      setEditandoPrecioClave(null);
      setInputPrecioEditado('');
      return;
    }

    setCarrito(carrito.map(item =>
      item.claveCarrito === claveCarrito ? { ...item, precio: nuevoPrecio } : item
    ));
    setEditandoPrecioClave(null);
    setInputPrecioEditado('');
  };

  // 🆕 Descuento por línea en soles directos. Se limita entre 0 y el
  // subtotal de esa línea (precio × cantidad) para nunca dejar un
  // subtotal negativo.
  const aplicarDescuento = (claveCarrito, monto) => {
    if (modoSoloLectura) return;
    setCarrito(carrito.map(item => {
      if (item.claveCarrito !== claveCarrito) return item;
      const subtotalItem = item.precio * item.cantidad;
      const d = Math.min(Math.max(monto, 0), subtotalItem);
      return { ...item, descuento_monto: d };
    }));
  };

  const calcularSubtotalItem = (item) => {
    const sub = item.precio * item.cantidad;
    return sub - (item.descuento_monto || 0);
  };

  const calcularSubtotal    = () => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const calcularDescuentoTotal = () => carrito.reduce((s, i) => s + (i.descuento_monto || 0), 0);
  const calcularTotal = () => carrito.reduce((s, i) => s + calcularSubtotalItem(i), 0);
  const calcularCambio = () => {
    if (metodoPago !== 'EFECTIVO') return 0;
    return (parseFloat(montoRecibido) || 0) - calcularTotal();
  };

  // 🆕 Abre el modal "¿Con qué comprobante?" con una FOTO del carrito y del
  // pago — todavía no se guarda nada en la base de datos ni se toca el
  // stock. Eso recién pasa en confirmarComprobante(), cuando el cajero
  // confirma con "Continuar" o "Emitir Boleta/Factura". Así, mientras tanto,
  // "Editar" y "Cancelar" pueden actuar sin dejar nada a medio guardar.
  const iniciarCheckout = () => {
    if (modoSoloLectura) { mostrarMensaje('error', 'Activa tu licencia para procesar ventas'); return; }
    if (carrito.length === 0) { mostrarMensaje('error', 'El carrito está vacío'); return; }
    if (metodoPago === 'EFECTIVO' && (parseFloat(montoRecibido) || 0) < calcularTotal()) {
      mostrarMensaje('error', 'Monto insuficiente'); return;
    }

    // 🆕 Incluir variante_id y talla en cada producto, y el descuento en soles
    const productosVenta = carrito.map(item => ({
      id: item.id,
      nombre: item.nombre,
      codigo: item.codigo,
      precio: item.precio,
      cantidad: item.cantidad,
      descuentoMonto: item.descuento_monto || 0,
      varianteId: item.variante_id || null,
      talla: item.talla || null,
    }));

    const total = calcularTotal();
    const montoRecibidoNum = metodoPago === 'EFECTIVO' ? parseFloat(montoRecibido) : null;
    const cambio = metodoPago === 'EFECTIVO' ? calcularCambio() : null;

    setModalComprobante({
      ventaId: null, // se completa recién al confirmar
      datosVenta: {
        productos: productosVenta,
        total,
        metodoPago,
        montoRecibido: montoRecibidoNum,
        cambio,
      },
      ventaParaRecibo: {
        subtotal: calcularSubtotal(),
        descuento: calcularDescuentoTotal(),
        total,
        metodoPago,
        montoRecibido: montoRecibidoNum || 0,
        cambio: cambio || 0,
        cajero: usuario.nombre_completo,
        productos: carrito.map(item => ({
          nombre: item.nombre + (item.talla ? ` (${item.talla})` : ''),
          cantidad: item.cantidad,
          unidad_medida: item.unidad_medida || 'UNIDAD',
          precio: item.precio,
          descuento: item.descuento_monto || 0,
        })),
      },
      items: carrito.map(item => ({
        codigo: item.codigo,
        descripcion: item.nombre + (item.talla ? ` (${item.talla})` : ''),
        cantidad: item.cantidad,
        precio_unitario: item.precio,
        unidad_medida: item.unidad_medida || 'UNIDAD',
      })),
      total,
    });
  };

  const mostrarMensaje = (tipo, texto) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 3000);
  };

  const limpiarCarrito = () => {
    if (modoSoloLectura) return;
    setMostrarConfirmacionLimpiar(true);
  };

  const confirmarLimpiarCarrito = () => {
    setCarrito([]);
    setMontoRecibido('');
    setCodigoBuscar('');
    setMostrarConfirmacionLimpiar(false);
    inputCodigoRef.current?.focus();
  };

  return (
    <div className="pos-container">
      <div className="pos-header">
        <h2>Punto de Venta</h2>
        <div className="pos-usuario">{usuario.nombre_completo}</div>
      </div>

      {modoSoloLectura && (
        <div className="modo-lectura-banner">
          <span className="icono-lectura"></span>
          <span className="texto-lectura">
            Modo Solo Lectura - Puedes ver productos pero no procesar ventas
          </span>
        </div>
      )}

      <div className="pos-content">
        {/* ===== IZQUIERDA: Búsqueda y productos ===== */}
        <div className="pos-left">
          <div className="busqueda-rapida">
            <h3>Buscar Producto</h3>
            <div className="input-group">
              <input
                ref={inputCodigoRef}
                type="text"
                value={codigoBuscar}
                onChange={(e) => setCodigoBuscar(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && buscarProductoPorCodigo()}
                placeholder="Escanea código o escribe nombre..."
                disabled={buscando || modoSoloLectura}
                autoFocus
              />
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                className="select-categoria"
                disabled={modoSoloLectura}
              >
                {categorias.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                onClick={buscarProductoPorCodigo}
                disabled={buscando || modoSoloLectura}
              >
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {(codigoBuscar || categoriaSeleccionada !== 'TODAS') && (
              <div className="filtros-activos">
                {codigoBuscar && <span className="badge">"{codigoBuscar}"</span>}
                {categoriaSeleccionada !== 'TODAS' && (
                  <span className="badge">{categoriaSeleccionada}</span>
                )}
              </div>
            )}
          </div>

          <div className="lista-productos">
            <div className="lista-productos-header">
              <h3>Productos Disponibles</h3>
              <button
                type="button"
                onClick={actualizarCatalogo}
                className="btn-actualizar-pos"
                disabled={actualizandoProductos}
                title="Vuelve a cargar productos y categorías desde la base de datos"
              >
                {actualizandoProductos ? 'Actualizando...' : '🔄 Actualizar'}
              </button>
            </div>

          <div className="productos-grid">
            {productosFiltrados.map(producto => {
              const sinStock   = producto.stock === 0;
              const stockClass = getStockClass(producto.stock);

              return (
                <div
                  key={producto.id}
                  className={[
                    'producto-card',
                    modoSoloLectura      ? 'disabled'   : '',
                    sinStock             ? 'sin-stock'  : '',
                    stockClass === 'low' ? 'stock-low'  : '',
                    producto.tiene_variantes ? 'con-tallas' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => !modoSoloLectura && !sinStock && manejarAgregarProducto(producto)}
                >
                  <div className="producto-imagen-box">
                    {producto.imagen_url ? (
                      <img src={producto.imagen_url} alt={producto.nombre} className="producto-imagen" />
                    ) : (
                      <div className="producto-imagen-placeholder"></div>
                    )}
                  </div>
                  <div className="producto-nombre">{producto.nombre}</div>
                  {producto.viscosidad && (
                    <div className="producto-viscosidad">{producto.viscosidad}</div>
                  )}
                  <div className="producto-precio">S/ {producto.precio.toFixed(2)}</div>

                  <div className="producto-stock">
                    <span className={`stock-texto ${stockClass !== 'normal' ? stockClass : ''}`}>
                      {getStockTexto(producto.stock, producto.unidad_medida)}
                    </span>
                  </div>

                  {producto.tiene_variantes && producto.tallas_disponibles && (
                    <div className="tallas-chips">
                      {producto.tallas_disponibles.map(t => (
                        <span key={t} className="talla-chip-card">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* ===== DERECHA: Carrito ===== */}
        <div className="pos-right">
          <div className="carrito">
            <h3>Carrito de Compra</h3>

            {carrito.length === 0 ? (
              <div className="carrito-vacio">
                <p>El carrito está vacío</p>
                <p>{modoSoloLectura ? 'Activa tu licencia para procesar ventas' : 'Escanea un producto para comenzar'}</p>
              </div>
            ) : (
              <div className="carrito-items">
                {carrito.map(item => (
                  <div key={item.claveCarrito} className="carrito-item">
                    <div className="item-info">
                      <div className="item-nombre">
                        {item.nombre}
                        {item.talla && (
                          <span className="item-talla-badge">Talla {item.talla}</span>
                        )}
                      </div>

                      {/* 🆕 Precio editable: clic para cambiar el precio de venta de este item.
                          Solo afecta esta venta — el precio del catálogo no se modifica. */}
                      {editandoPrecioClave === item.claveCarrito ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          autoFocus
                          value={inputPrecioEditado}
                          onChange={(e) => setInputPrecioEditado(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => confirmarEdicionPrecio(item.claveCarrito)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); confirmarEdicionPrecio(item.claveCarrito); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelarEdicionPrecio(); }
                          }}
                          className="input-precio-editable"
                        />
                      ) : (
                        <div
                          className="item-precio item-precio-editable"
                          onClick={() => iniciarEdicionPrecio(item)}
                          title="Clic para modificar el precio de esta venta"
                        >
                          S/ {item.precio.toFixed(2)}
                        </div>
                      )}
                    </div>

                    <div className="item-controles">
                      <div className="cantidad-control">
                        {item.unidad_medida && item.unidad_medida !== 'UNIDAD' ? (
                          // Productos por peso/volumen: se escribe la cantidad exacta, sin +/- de a 1
                          <input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => modificarCantidad(item.claveCarrito, parseFloat(e.target.value) || 0)}
                            className="input-cantidad input-cantidad-peso"
                            step="0.001" min="0.001" max={item.stock}
                            disabled={modoSoloLectura}
                            title={`Cantidad en ${item.unidad_medida.toLowerCase()}`}
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => modificarCantidad(item.claveCarrito, item.cantidad - 1)}
                              className="btn-cantidad"
                              disabled={modoSoloLectura}
                            >−</button>
                            <input
                              type="number"
                              value={item.cantidad}
                              onChange={(e) => modificarCantidad(item.claveCarrito, parseInt(e.target.value) || 1)}
                              className="input-cantidad"
                              min="1" max={item.stock}
                              disabled={modoSoloLectura}
                            />
                            <button
                              onClick={() => modificarCantidad(item.claveCarrito, item.cantidad + 1)}
                              className="btn-cantidad"
                              disabled={modoSoloLectura}
                            >+</button>
                          </>
                        )}
                        {item.unidad_medida && item.unidad_medida !== 'UNIDAD' && (
                          <span className="unidad-label">{item.unidad_medida.toLowerCase()}</span>
                        )}
                      </div>

                      {/* 🆕 Descuento por línea en soles directos (antes era %) */}
                      <div className="descuento-control">
                        <label>Desc S/:</label>
                        <input
                          type="number" min="0" step="0.01"
                          max={item.precio * item.cantidad}
                          value={item.descuento_monto || 0}
                          onChange={(e) => aplicarDescuento(item.claveCarrito, parseFloat(e.target.value) || 0)}
                          className="input-descuento"
                          disabled={modoSoloLectura}
                        />
                      </div>

                      <button
                        onClick={() => eliminarDelCarrito(item.claveCarrito)}
                        className="btn-eliminar"
                        disabled={modoSoloLectura}
                        title="Quitar del carrito"
                      >X</button>
                    </div>

                    <div className="item-subtotal">
                      {item.descuento_monto > 0 && (
                        <div className="item-descuento-aplicado">
                          Descuento: -S/ {item.descuento_monto.toFixed(2)}
                        </div>
                      )}
                      <div className="subtotal-valor">
                        Subtotal: S/ {calcularSubtotalItem(item).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="totales">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>S/ {calcularSubtotal().toFixed(2)}</span>
            </div>
            {calcularDescuentoTotal() > 0 && (
              <div className="total-row descuento">
                <span>Descuento total:</span>
                <span>-S/ {calcularDescuentoTotal().toFixed(2)}</span>
              </div>
            )}
            <div className="total-row total-final">
              <span>TOTAL:</span>
              <span>S/ {calcularTotal().toFixed(2)}</span>
            </div>
          </div>

          <div className="metodo-pago">
            <h4>Método de Pago</h4>
            <div className="metodos">
              {['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].map(m => (
                <button
                  key={m}
                  className={metodoPago === m ? 'active' : ''}
                  onClick={() => !modoSoloLectura && setMetodoPago(m)}
                  disabled={modoSoloLectura}
                >
                 {m === 'EFECTIVO' ? ' Efectivo' : m === 'TARJETA' ? ' Yape' : ' Transferencia'}
                </button>
              ))}
            </div>
          </div>

          {metodoPago === 'EFECTIVO' && carrito.length > 0 && (
            <div className="monto-recibido">
              <label>Monto Recibido:</label>
              <input
                type="number"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                placeholder="0.00"
                step="0.01"
                disabled={modoSoloLectura}
              />
              {montoRecibido && (
                <div className="cambio">
                  <span>Cambio:</span>
                  <span className={calcularCambio() >= 0 ? 'positivo' : 'negativo'}>
                    S/ {calcularCambio().toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {mensaje.texto && (
            <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>
          )}

          <div className="acciones">
            <button
              onClick={limpiarCarrito}
              className="btn-limpiar"
              disabled={carrito.length === 0 || modoSoloLectura}
            >Limpiar</button>
            <button
              onClick={iniciarCheckout}
              className="btn-procesar"
              disabled={carrito.length === 0 || modoSoloLectura}
            >
              {modoSoloLectura ? 'Licencia Expirada' : 'Procesar Venta'}
            </button>
          </div>
        </div>
      </div>

      {/* ======================== MODAL SELECTOR DE TALLA ======================== */}
      {modalTalla && (
        <div className="modal-talla-overlay" onClick={() => setModalTalla(null)}>
          <div className="modal-talla" onClick={e => e.stopPropagation()}>
            <div className="modal-talla-header">
              <div>
                <h3>{modalTalla.producto.nombre}</h3>
                <p className="modal-talla-precio">S/ {modalTalla.producto.precio.toFixed(2)}</p>
              </div>
              <button className="btn-cerrar-modal-talla" onClick={() => setModalTalla(null)}>X</button>
            </div>
            <p className="modal-talla-hint">Selecciona una talla para agregar al carrito:</p>
            <div className="modal-talla-grid">
              {modalTalla.variantes.map(v => {
                const precioMostrar = (v.precio !== null && v.precio !== undefined) ? v.precio : modalTalla.producto.precio;
                return (
                  <button
                    key={v.id}
                    className="talla-opcion"
                    onClick={() => confirmarTalla(v)}
                  >
                    <span className="talla-opcion-nombre">{v.talla}</span>
                    <span className="talla-opcion-precio">S/ {precioMostrar.toFixed(2)}</span>
                    <span className="talla-opcion-stock">{v.stock} disp.</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======================== MODAL CANTIDAD POR PESO/VOLUMEN ======================== */}
      {modalCantidadPeso && (
        <div className="modal-cantidadpeso-overlay" onClick={() => { setModalCantidadPeso(null); setInputCantidadPeso(''); }}>
          <div className="modal-cantidadpeso" onClick={e => e.stopPropagation()}>
            <div className="modal-talla-header">
              <div>
                <h3>{modalCantidadPeso.producto.nombre}</h3>
                <p className="modal-talla-precio">
                  S/ {modalCantidadPeso.producto.precio.toFixed(2)} / {modalCantidadPeso.producto.unidad_medida.toLowerCase()}
                </p>
              </div>
              <button
                className="btn-cerrar-modal-talla"
                onClick={() => { setModalCantidadPeso(null); setInputCantidadPeso(''); }}
              >X</button>
            </div>
            <p className="modal-talla-hint">
              ¿Cuántos {modalCantidadPeso.producto.unidad_medida.toLowerCase()} lleva?
              <span className="modal-cantidadpeso-stock"> (disponible: {formatearNumero(modalCantidadPeso.producto.stock)})</span>
            </p>
            <input
              type="number"
              step="0.001" min="0.001"
              autoFocus
              value={inputCantidadPeso}
              onChange={(e) => setInputCantidadPeso(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarCantidadPeso(); }}
              className="modal-cantidadpeso-input"
              placeholder={`Ej: 1.5`}
            />
            {inputCantidadPeso && !isNaN(parseFloat(inputCantidadPeso)) && (
              <p className="modal-cantidadpeso-subtotal">
                Subtotal: S/ {(modalCantidadPeso.producto.precio * parseFloat(inputCantidadPeso)).toFixed(2)}
              </p>
            )}
            <button className="btn-confirmar-modal modal-cantidadpeso-btn" onClick={confirmarCantidadPeso}>
              Agregar al carrito
            </button>
          </div>
        </div>
      )}

      {/* ======================== MODAL COMPROBANTE ELECTRÓNICO ======================== */}
      {modalComprobante && (
        <div className="modal-comprobante-overlay">
          <div className="modal-comprobante">
            <h3>¿Con qué comprobante?</h3>

            {!resultadoComprobante && (
              <>
                {!facturacionConfigurada && (
                  <div className="comprobante-aviso-config">
                    Todavía no configuraste tu cuenta de facturación electrónica. Ve a Configuración → Facturación Electrónica para poder emitir boleta o factura.
                  </div>
                )}
                <div className="comprobante-opciones">
                  <button
                    className={`comprobante-opcion ${tipoComprobanteElegido === null ? 'activa' : ''}`}
                    onClick={() => setTipoComprobanteElegido(null)}
                  >
                    Sin comprobante
                  </button>
                  <button
                    className={`comprobante-opcion ${tipoComprobanteElegido === 'BOLETA' ? 'activa' : ''}`}
                    onClick={() => { setTipoComprobanteElegido('BOLETA'); setNombreCliente(''); }}
                    disabled={!facturacionConfigurada}
                  >
                    Boleta
                  </button>
                  <button
                    className={`comprobante-opcion ${tipoComprobanteElegido === 'FACTURA' ? 'activa' : ''}`}
                    onClick={() => setTipoComprobanteElegido('FACTURA')}
                    disabled={!facturacionConfigurada}
                  >
                    Factura
                  </button>
                </div>

                {tipoComprobanteElegido && (
                  <div className="comprobante-datos-cliente">
                    {/* 🆕 Buscar un cliente ya registrado, para no escribir sus datos a mano.
                        Diseño a propósito distinto de los campos de relleno de abajo (fondo celeste,
                        ícono de lupa, borde punteado) para que el cajero no lo confunda con un campo
                        más donde "hay que escribir datos nuevos" — este es para BUSCAR, no para llenar. */}
                    <label className="buscador-cliente-label">🔍 Buscar cliente ya registrado</label>
                    <div className="buscador-cliente-wrap">
                      <input
                        type="text"
                        className="buscador-cliente-input"
                        placeholder="Nombre, DNI o RUC..."
                        value={busquedaCliente}
                        onChange={(e) => buscarClientes(e.target.value)}
                        onFocus={() => { if (resultadosClientes.length > 0) setDropdownClienteVisible(true); }}
                      />
                      {clienteSeleccionado && (
                        <button type="button" className="btn-quitar-cliente" onClick={quitarClienteSeleccionado} title="Quitar cliente">×</button>
                      )}
                      {dropdownClienteVisible && resultadosClientes.length > 0 && (
                        <div className="dropdown-clientes">
                          {resultadosClientes.map((c) => (
                            <div key={c.id} className="dropdown-cliente-item" onClick={() => seleccionarClienteComprobante(c)}>
                              <span className="dropdown-cliente-nombre">{c.nombre}</span>
                              <span className="dropdown-cliente-doc">{c.tipo_documento} {c.numero_documento || ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {clienteSeleccionado && (
                        <div className="chip-cliente-elegido">Cliente seleccionado: {clienteSeleccionado.nombre}</div>
                      )}
                    </div>

                    {/* 🆕 A partir de acá, campos normales de RELLENO — solo para cuando el cliente
                        NO está registrado (si ya se eligió uno arriba, sus datos ya están puestos
                        y no hace falta escribirlos de nuevo). */}
                    <input
                      type="text"
                      placeholder={tipoComprobanteElegido === 'FACTURA' ? 'RUC (11 dígitos)' : 'DNI (opcional)'}
                      value={documentoCliente}
                      onChange={(e) => setDocumentoCliente(e.target.value.replace(/\D/g, ''))}
                      maxLength={tipoComprobanteElegido === 'FACTURA' ? 11 : 8}
                    />
                    {/* Nombre (Boleta) / Razón social (Factura): solo si NO hay cliente guardado
                        seleccionado — si ya lo eligió del buscador, mostrarlo sería duplicado.
                        En Factura sigue siendo obligatorio para que sea válida ante SUNAT; en
                        Boleta es opcional (el consumidor final no está obligado a darlo). */}
                    {!clienteSeleccionado && (
                      <input
                        type="text"
                        placeholder={tipoComprobanteElegido === 'FACTURA' ? 'Razón social' : 'Nombre'}
                        value={nombreCliente}
                        onChange={(e) => setNombreCliente(e.target.value)}
                      />
                    )}
                    {/* 🆕 Placa del vehículo (lubricentro) — opcional, se imprime junto a cada producto en el comprobante */}
                    <input
                      type="text"
                      placeholder="Placa del vehículo (opcional)"
                      value={placaVehiculo}
                      onChange={(e) => setPlacaVehiculo(e.target.value.toUpperCase())}
                      maxLength={10}
                    />
                  </div>
                )}

                <div className="comprobante-acciones">
                  {tipoComprobanteElegido ? (
                    <button
                      className="btn-emitir-comprobante"
                      onClick={confirmarComprobante}
                      disabled={emitiendoComprobante}
                    >
                      {emitiendoComprobante ? 'Emitiendo...' : `Emitir ${tipoComprobanteElegido === 'BOLETA' ? 'Boleta' : 'Factura'}`}
                    </button>
                  ) : (
                    <button className="btn-emitir-comprobante" onClick={confirmarComprobante} disabled={emitiendoComprobante}>
                      {emitiendoComprobante ? 'Procesando...' : 'Continuar'}
                    </button>
                  )}
                </div>

                {/* 🆕 Todavía no se guardó la venta en este punto — Editar vuelve
                    al carrito tal cual estaba, Cancelar lo descarta por completo */}
                <div className="comprobante-acciones-secundarias">
                  <button
                    className="btn-editar-venta"
                    onClick={editarVenta}
                    disabled={emitiendoComprobante}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-cancelar-venta"
                    onClick={cancelarVenta}
                    disabled={emitiendoComprobante}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {resultadoComprobante && (
              <div className={`comprobante-resultado ${resultadoComprobante.success ? 'ok' : 'error'}`}>
                <p>{resultadoComprobante.mensaje}</p>
                {resultadoComprobante.enlace_pdf && (
                  <button
                    className="comprobante-link-pdf"
                    onClick={async () => {
                      setModalVistaPreviaComprobante('cargando');
                      try {
                        const base64 = await invoke('descargar_pdf_comprobante', { url: resultadoComprobante.enlace_pdf });
                        setModalVistaPreviaComprobante(`data:application/pdf;base64,${base64}`);
                      } catch (e) {
                        setModalVistaPreviaComprobante('error');
                      }
                    }}
                  >
                    Imprimir
                  </button>
                )}
                {resultadoComprobante.success ? (
                  <button className="btn-emitir-comprobante" onClick={cerrarModalComprobante}>
                    Continuar
                  </button>
                ) : (
                  <>
                    {/* 🆕 Si falló (ej: RUC/DNI mal escrito), corregir sin perder la venta ni la oportunidad de facturar */}
                    <button
                      className="btn-emitir-comprobante"
                      onClick={() => setResultadoComprobante(null)}
                    >
                      Corregir dato y reintentar
                    </button>
                    <button className="btn-cancelar-comprobante" onClick={cerrarModalComprobante}>
                      Cancelar, sin comprobante
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================== MODAL VISTA PREVIA E IMPRESIÓN (Boleta/Factura real) ======================== */}
      {modalVistaPreviaComprobante && (
        <div className="modal-preview-overlay">
          <div className="modal-preview">
            <div className="modal-preview-header no-print">
              <span>Vista previa — Boleta/Factura electrónica</span>
              <div className="modal-preview-acciones">
                <button
                  className="btn-imprimir-preview"
                  onClick={() => window.print()}
                  disabled={modalVistaPreviaComprobante === 'cargando' || modalVistaPreviaComprobante === 'error'}
                >
                  Imprimir
                </button>
                <button className="btn-cerrar-preview" onClick={() => setModalVistaPreviaComprobante(null)}>
                  Cerrar
                </button>
              </div>
            </div>
            {modalVistaPreviaComprobante === 'cargando' && (
              <div className="preview-estado">Cargando comprobante...</div>
            )}
            {modalVistaPreviaComprobante === 'error' && (
              <div className="preview-estado preview-estado-error">
                No se pudo cargar el comprobante. Revisá tu conexión a internet e intentá de nuevo.
              </div>
            )}
            {modalVistaPreviaComprobante !== 'cargando' && modalVistaPreviaComprobante !== 'error' && (
              <iframe
                src={modalVistaPreviaComprobante}
                title="Comprobante electrónico"
                className="iframe-comprobante-preview"
              />
            )}
          </div>
        </div>
      )}

      {/* Modal confirmación limpiar */}
      {mostrarConfirmacionLimpiar && (
        <div className="modal-confirmacion-overlay">
          <div className="modal-confirmacion">
            <h3>Limpiar Carrito</h3>
            <p>¿Estás seguro de que deseas eliminar todos los productos del carrito?</p>
            <div className="confirmacion-acciones">
              <button onClick={() => setMostrarConfirmacionLimpiar(false)} className="btn-cancelar-modal">
                Cancelar
              </button>
              <button onClick={confirmarLimpiarCarrito} className="btn-confirmar-modal">
                Sí, Limpiar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarRecibo && datosVenta && (
        <Recibo
          venta={datosVenta}
          onCerrar={() => {
            setMostrarRecibo(false);
            setDatosVenta(null);
            inputCodigoRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export default POS;