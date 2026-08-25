-- =====================================================
-- SISTEMA DE GESTIÓN DE TIENDA - VERSIÓN SQLite
-- Base de Datos: SQLite 3
-- Fecha: Febrero 2026
-- Versión: 1.5 - Devoluciones a Proveedor + Crédito Disponible
-- =====================================================

PRAGMA foreign_keys = OFF;

-- =====================================================
-- TABLA: roles
-- =====================================================
DROP TABLE IF EXISTS roles;
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  permisos TEXT,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_roles_nombre ON roles(nombre);
CREATE INDEX idx_roles_activo ON roles(activo);

-- =====================================================
-- TABLA: usuarios
-- =====================================================
DROP TABLE IF EXISTS usuarios;
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre_completo TEXT NOT NULL,
  email TEXT,
  rol_id INTEGER NOT NULL,
  activo INTEGER DEFAULT 1,
  intentos_fallidos INTEGER DEFAULT 0,
  bloqueado_hasta TEXT,
  ultimo_acceso TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (rol_id) REFERENCES roles(id)
);

CREATE INDEX idx_usuarios_username ON usuarios(username);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);
CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);

-- =====================================================
-- TABLA: sesiones_log
-- =====================================================
DROP TABLE IF EXISTS sesiones_log;
CREATE TABLE sesiones_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
  ip_address TEXT,
  user_agent TEXT,
  resultado TEXT NOT NULL CHECK(resultado IN ('EXITOSO', 'FALLIDO', 'BLOQUEADO')),
  motivo_fallo TEXT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX idx_sesiones_usuario ON sesiones_log(usuario_id);
CREATE INDEX idx_sesiones_fecha ON sesiones_log(fecha_hora);

-- =====================================================
-- TABLA: categorias
-- =====================================================
DROP TABLE IF EXISTS categorias;
CREATE TABLE categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  tipo_talla TEXT DEFAULT 'ROPA' CHECK(tipo_talla IN ('ROPA', 'CALZADO', 'NINGUNA')),
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_categorias_nombre ON categorias(nombre);
CREATE INDEX idx_categorias_activo ON categorias(activo);

-- =====================================================
-- TABLA: productos
-- =====================================================
DROP TABLE IF EXISTS productos;
CREATE TABLE productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  precio REAL NOT NULL CHECK (precio > 0),
  stock REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo REAL DEFAULT 5,
  unidad_medida TEXT NOT NULL DEFAULT 'UNIDAD' CHECK (unidad_medida IN ('UNIDAD', 'KG', 'GRAMO', 'LITRO', 'ML', 'GALON')),
  viscosidad TEXT, -- Grado de viscosidad SAE del producto (ej. '20W-50'). Opcional, solo aplica a aceites/lubricantes.
  categoria_id INTEGER NOT NULL,
  descuento_porcentaje REAL DEFAULT 0,
  tiene_variantes INTEGER DEFAULT 0,
  lleva_vencimiento INTEGER DEFAULT 0, -- 🆕 solo productos perecibles (Lubricentro) — nunca aplica a ropa
  imagen_url TEXT,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE INDEX idx_productos_codigo ON productos(codigo);
CREATE INDEX idx_productos_nombre ON productos(nombre);

-- =====================================================
-- 🆕 TABLA: lotes_producto — control de vencimiento por lote
-- Solo se usa en productos con lleva_vencimiento = 1 (Lubricentro).
-- El stock total del producto es la suma de sus lotes activos con
-- cantidad > 0. Al vender, se descuenta del lote que vence más
-- pronto primero (FEFO), vía trigger.
-- =====================================================
CREATE TABLE lotes_producto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL,
  cantidad REAL NOT NULL CHECK (cantidad >= 0),
  fecha_vencimiento TEXT NOT NULL,
  fecha_ingreso TEXT DEFAULT (datetime('now', 'localtime')),
  compra_id INTEGER, -- de qué compra vino este lote, si aplica
  numero_lote TEXT,  -- código de lote del fabricante, opcional
  activo INTEGER DEFAULT 1,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  FOREIGN KEY (compra_id) REFERENCES compras(id)
);

CREATE INDEX idx_lotes_producto ON lotes_producto(producto_id);
CREATE INDEX idx_lotes_vencimiento ON lotes_producto(fecha_vencimiento);

-- 🆕 Mantener productos.stock = suma de sus lotes activos, siempre
CREATE TRIGGER trg_sync_stock_lote_insert
AFTER INSERT ON lotes_producto
BEGIN
  UPDATE productos SET stock = (
    SELECT COALESCE(SUM(cantidad), 0) FROM lotes_producto
    WHERE producto_id = NEW.producto_id AND activo = 1
  )
  WHERE id = NEW.producto_id;
END;

CREATE TRIGGER trg_sync_stock_lote_update
AFTER UPDATE OF cantidad, activo ON lotes_producto
BEGIN
  UPDATE productos SET stock = (
    SELECT COALESCE(SUM(cantidad), 0) FROM lotes_producto
    WHERE producto_id = NEW.producto_id AND activo = 1
  )
  WHERE id = NEW.producto_id;
END;


CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_activo ON productos(activo);

-- =====================================================
-- TABLA: producto_variantes
-- =====================================================
DROP TABLE IF EXISTS producto_variantes;
CREATE TABLE producto_variantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL,
  talla TEXT NOT NULL,
  stock REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
  stock_minimo REAL DEFAULT 2,
  precio REAL, -- 🆕 precio propio de esta talla. NULL = usa el precio del producto (comportamiento de siempre)
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(producto_id, talla),
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

CREATE INDEX idx_variantes_producto ON producto_variantes(producto_id);
CREATE INDEX idx_variantes_talla ON producto_variantes(talla);
CREATE INDEX idx_variantes_activo ON producto_variantes(activo);

CREATE TRIGGER trg_actualizar_stock_producto_on_update
AFTER UPDATE OF stock ON producto_variantes
FOR EACH ROW
BEGIN
  UPDATE productos
  SET stock = (SELECT COALESCE(SUM(stock), 0) FROM producto_variantes WHERE producto_id = NEW.producto_id AND activo = 1),
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.producto_id;
END;

CREATE TRIGGER trg_actualizar_stock_producto_on_insert
AFTER INSERT ON producto_variantes
FOR EACH ROW
BEGIN
  UPDATE productos
  SET stock = (SELECT COALESCE(SUM(stock), 0) FROM producto_variantes WHERE producto_id = NEW.producto_id AND activo = 1),
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.producto_id;
END;

-- =====================================================
-- TABLA: ventas
-- =====================================================
DROP TABLE IF EXISTS ventas;
CREATE TABLE ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  descuento REAL DEFAULT 0 CHECK (descuento >= 0),
  total REAL NOT NULL CHECK (total >= 0),
  metodo_pago TEXT NOT NULL CHECK(metodo_pago IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO')),
  monto_recibido REAL,
  cambio REAL,
  usuario_id INTEGER NOT NULL,
  estado TEXT DEFAULT 'COMPLETADA' CHECK(estado IN ('COMPLETADA', 'CANCELADA', 'PENDIENTE')),
  motivo_cancelacion TEXT,
  notas TEXT,
  licencia_tipo TEXT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_ventas_folio ON ventas(folio);
CREATE INDEX idx_ventas_fecha ON ventas(fecha_hora);
CREATE INDEX idx_ventas_usuario ON ventas(usuario_id);
CREATE INDEX idx_ventas_estado ON ventas(estado);
CREATE INDEX idx_ventas_metodo ON ventas(metodo_pago);

-- =====================================================
-- TABLA: detalles_venta
-- =====================================================
DROP TABLE IF EXISTS detalles_venta;
CREATE TABLE detalles_venta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  variante_id INTEGER,
  talla TEXT,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  precio_unitario REAL NOT NULL CHECK (precio_unitario >= 0),
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  descuento_linea REAL DEFAULT 0,
  total_linea REAL NOT NULL CHECK (total_linea >= 0),
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (variante_id) REFERENCES producto_variantes(id)
);

CREATE INDEX idx_detalles_venta ON detalles_venta(venta_id);
CREATE INDEX idx_detalles_producto ON detalles_venta(producto_id);
CREATE INDEX idx_detalles_variante ON detalles_venta(variante_id);

-- =====================================================
-- 🆕 TRIGGERS: mantener productos.precio sincronizado con el
-- precio más bajo entre sus tallas activas — sin importar si el
-- cambio vino de Inventario, de una compra, o de agregar una talla
-- nueva. Así la tarjeta del producto nunca muestra un número viejo.
-- =====================================================
CREATE TRIGGER trg_sync_precio_producto_insert
AFTER INSERT ON producto_variantes
WHEN NEW.precio IS NOT NULL
BEGIN
  UPDATE productos SET precio = (
    SELECT MIN(precio) FROM producto_variantes
    WHERE producto_id = NEW.producto_id AND activo = 1 AND precio IS NOT NULL
  )
  WHERE id = NEW.producto_id;
END;

CREATE TRIGGER trg_sync_precio_producto_update
AFTER UPDATE OF precio ON producto_variantes
WHEN NEW.precio IS NOT NULL
BEGIN
  UPDATE productos SET precio = (
    SELECT MIN(precio) FROM producto_variantes
    WHERE producto_id = NEW.producto_id AND activo = 1 AND precio IS NOT NULL
  )
  WHERE id = NEW.producto_id;
END;

-- =====================================================
-- 🆕 TABLA: clientes
-- Clientes fijos del lubricentro — se guardan sus datos para no
-- tener que volver a escribirlos cada vez que se emite una boleta,
-- factura o comprobante de venta.
-- =====================================================
DROP TABLE IF EXISTS clientes;
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,           -- nombre completo (DNI) o razón social (RUC)
  tipo_documento TEXT DEFAULT 'DNI' CHECK(tipo_documento IN ('DNI', 'RUC', 'NINGUNO')),
  numero_documento TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  placa TEXT,                     -- placa del vehículo del cliente (lubricentro)
  notas TEXT,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_clientes_nombre ON clientes(nombre);
CREATE INDEX idx_clientes_documento ON clientes(numero_documento);
CREATE INDEX idx_clientes_activo ON clientes(activo);

-- =====================================================
-- 🆕 TABLA: comprobantes_electronicos (boletas/facturas vía FacturaLibre)
-- =====================================================
DROP TABLE IF EXISTS comprobantes_electronicos;
CREATE TABLE comprobantes_electronicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  cliente_id INTEGER,             -- 🆕 referencia opcional al cliente guardado, si se eligió uno
  tipo TEXT NOT NULL CHECK (tipo IN ('BOLETA', 'FACTURA')),
  serie TEXT,
  numero INTEGER,
  cliente_documento TEXT,        -- DNI (boleta) o RUC (factura), opcional
  cliente_nombre TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'ERROR')),
  mensaje_sunat TEXT,            -- respuesta/motivo de rechazo u observación, si aplica
  enlace_pdf TEXT,
  enlace_xml TEXT,
  enlace_cdr TEXT,               -- 🆕 constancia de recepción de SUNAT (CDR)
  external_id TEXT,              -- 🆕 id único que asigna FacturaLibre — se usa para reenvíos/consultas
  hash TEXT,                     -- 🆕 hash del comprobante que devuelve FacturaLibre
  fecha_emision TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (venta_id) REFERENCES ventas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE INDEX idx_comprobantes_venta ON comprobantes_electronicos(venta_id);
CREATE INDEX idx_comprobantes_cliente ON comprobantes_electronicos(cliente_id);

-- =====================================================
-- TABLA: devoluciones (clientes)
-- =====================================================
DROP TABLE IF EXISTS devoluciones;
CREATE TABLE devoluciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_original_id INTEGER NOT NULL,
  folio_devolucion TEXT NOT NULL UNIQUE,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
  usuario_id INTEGER NOT NULL,
  monto_reembolsado REAL NOT NULL CHECK (monto_reembolsado >= 0),
  metodo_reembolso TEXT NOT NULL CHECK(metodo_reembolso IN ('EFECTIVO', 'TARJETA', 'VALE', 'CREDITO')),
  motivo TEXT NOT NULL,
  estado TEXT DEFAULT 'PROCESADA' CHECK(estado IN ('PROCESADA', 'PENDIENTE', 'RECHAZADA')),
  notas TEXT,
  FOREIGN KEY (venta_original_id) REFERENCES ventas(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_devoluciones_venta ON devoluciones(venta_original_id);
CREATE INDEX idx_devoluciones_folio ON devoluciones(folio_devolucion);
CREATE INDEX idx_devoluciones_fecha ON devoluciones(fecha_hora);

-- =====================================================
-- TABLA: detalles_devolucion (clientes)
-- =====================================================
DROP TABLE IF EXISTS detalles_devolucion;
CREATE TABLE detalles_devolucion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucion_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  variante_id INTEGER,
  talla TEXT,
  detalle_venta_id INTEGER, -- 🆕 referencia a la línea exacta de la venta (el mismo producto puede aparecer 2 veces, con tallas distintas)
  venta_id INTEGER NOT NULL,
  cantidad_devuelta INTEGER NOT NULL CHECK (cantidad_devuelta > 0),
  precio_unitario REAL NOT NULL,
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  condicion TEXT NOT NULL CHECK(condicion IN ('REVENTA', 'DEFECTUOSO', 'VENCIDO')),
  FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (variante_id) REFERENCES producto_variantes(id)
);

CREATE INDEX idx_detalles_devolucion ON detalles_devolucion(devolucion_id);
CREATE INDEX idx_detalles_devolucion_producto ON detalles_devolucion(producto_id);

-- =====================================================
-- TABLA: movimientos_inventario
-- =====================================================
DROP TABLE IF EXISTS movimientos_inventario;
CREATE TABLE movimientos_inventario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL,
  variante_id INTEGER,
  talla TEXT,
  tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN ('VENTA', 'DEVOLUCION', 'ENTRADA', 'SALIDA', 'AJUSTE', 'MERMA')),
  cantidad REAL NOT NULL,
  stock_anterior REAL NOT NULL,
  stock_nuevo REAL NOT NULL,
  venta_id INTEGER,
  devolucion_id INTEGER,
  compra_id INTEGER,
  usuario_id INTEGER,
  referencia TEXT,
  motivo TEXT,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (variante_id) REFERENCES producto_variantes(id),
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL,
  FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE SET NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_movimientos_inventario_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_movimientos_inventario_tipo ON movimientos_inventario(tipo_movimiento);
CREATE INDEX idx_movimientos_inventario_fecha ON movimientos_inventario(fecha_hora);

-- =====================================================
-- TABLA: proveedores
-- 🆕 v1.5: credito_disponible
-- =====================================================
DROP TABLE IF EXISTS proveedores;
CREATE TABLE proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  tipo_documento TEXT DEFAULT 'RUC' CHECK(tipo_documento IN ('RUC', 'DNI', 'NINGUNO')),
  numero_documento TEXT,
  banco TEXT,
  numero_cuenta TEXT,
  notas TEXT,
  total_compras REAL DEFAULT 0,
  credito_disponible REAL DEFAULT 0 CHECK (credito_disponible >= 0), -- 🆕 saldo a favor por devoluciones
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_proveedores_nombre ON proveedores(nombre);
CREATE INDEX idx_proveedores_activo ON proveedores(activo);
CREATE INDEX idx_proveedores_documento ON proveedores(numero_documento);

-- =====================================================
-- TABLA: compras
-- 🆕 v1.5: credito_aplicado
-- =====================================================
DROP TABLE IF EXISTS compras;
CREATE TABLE compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  proveedor_id INTEGER NOT NULL,
  fecha_compra TEXT NOT NULL,
  fecha_recepcion TEXT,
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  descuento REAL DEFAULT 0 CHECK (descuento >= 0),
  credito_aplicado REAL DEFAULT 0 CHECK (credito_aplicado >= 0), -- 🆕 crédito descontado al crear
  total REAL NOT NULL CHECK (total >= 0),
  tipo_pago TEXT DEFAULT 'EFECTIVO' CHECK(tipo_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'CREDITO', 'MIXTO')),
  monto_pagado REAL DEFAULT 0 CHECK (monto_pagado >= 0),
  saldo_pendiente REAL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  fecha_vencimiento_pago TEXT,
  estado TEXT DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'RECIBIDA', 'PARCIAL', 'CANCELADA')),
  estado_pago TEXT DEFAULT 'PENDIENTE' CHECK(estado_pago IN ('PENDIENTE', 'PARCIAL', 'PAGADO')),
  usuario_id INTEGER NOT NULL,
  factura_numero TEXT,
  notas TEXT,
  notas_recepcion TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_compras_folio ON compras(folio);
CREATE INDEX idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX idx_compras_fecha ON compras(fecha_compra);
CREATE INDEX idx_compras_estado ON compras(estado);
CREATE INDEX idx_compras_estado_pago ON compras(estado_pago);

-- =====================================================
-- TABLA: detalles_compra
-- 🆕 v1.5: cantidad_conforme (lo que llegó sano → entra al stock)
-- =====================================================
DROP TABLE IF EXISTS detalles_compra;
CREATE TABLE detalles_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  variante_id INTEGER,
  talla TEXT,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  cantidad_recibida REAL DEFAULT 0 CHECK (cantidad_recibida >= 0),  -- llegó físicamente
  cantidad_conforme REAL DEFAULT 0 CHECK (cantidad_conforme >= 0),  -- 🆕 llegó sano → sube stock
  precio_compra REAL NOT NULL CHECK (precio_compra >= 0),
  precio_venta_sugerido REAL,
  subtotal REAL NOT NULL CHECK (subtotal >= 0),
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (variante_id) REFERENCES producto_variantes(id)
);

CREATE INDEX idx_detalles_compra ON detalles_compra(compra_id);
CREATE INDEX idx_detalles_compra_producto ON detalles_compra(producto_id);
CREATE INDEX idx_detalles_compra_variante ON detalles_compra(variante_id);

-- =====================================================
-- TABLA: pagos_compra
-- =====================================================
DROP TABLE IF EXISTS pagos_compra;
CREATE TABLE pagos_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  monto REAL NOT NULL CHECK (monto > 0),
  fecha_pago TEXT DEFAULT (datetime('now', 'localtime')),
  metodo_pago TEXT NOT NULL CHECK(metodo_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'OTRO')),
  referencia TEXT,
  notas TEXT,
  usuario_id INTEGER NOT NULL,
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_pagos_compra ON pagos_compra(compra_id);
CREATE INDEX idx_pagos_compra_fecha ON pagos_compra(fecha_pago);

-- =====================================================
-- TABLA: devoluciones_proveedor 🆕 v1.5
-- Mercadería recibida dañada o incorrecta
-- =====================================================
DROP TABLE IF EXISTS devoluciones_proveedor;
CREATE TABLE devoluciones_proveedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL,
  proveedor_id INTEGER NOT NULL,
  folio TEXT NOT NULL UNIQUE,              -- DP-YYYYMMDD-####
  fecha TEXT DEFAULT (datetime('now', 'localtime')),
  motivo TEXT NOT NULL CHECK(motivo IN (
    'DAÑADO', 'DEFECTUOSO', 'PRODUCTO_INCORRECTO',
    'TALLA_INCORRECTA', 'VENCIDO', 'OTRO'
  )),
  detalle_motivo TEXT,
  monto_devolucion REAL NOT NULL CHECK (monto_devolucion > 0),
  estado TEXT DEFAULT 'PENDIENTE' CHECK(estado IN (
    'PENDIENTE',  -- registrada, esperando respuesta proveedor
    'ACEPTADA',   -- proveedor aceptó → crédito aplicado
    'RECHAZADA'   -- proveedor no aceptó
  )),
  tipo_resolucion TEXT CHECK(tipo_resolucion IN (
    'CREDITO',    -- descuento en próxima compra
    'REEMBOLSO',  -- devuelve el dinero
    'CAMBIO'      -- manda mercadería de reemplazo
  )),
  usuario_id INTEGER NOT NULL,
  notas TEXT,
  fecha_resolucion TEXT,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (compra_id)    REFERENCES compras(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)
);

CREATE INDEX idx_devprov_compra    ON devoluciones_proveedor(compra_id);
CREATE INDEX idx_devprov_proveedor ON devoluciones_proveedor(proveedor_id);
CREATE INDEX idx_devprov_estado    ON devoluciones_proveedor(estado);
CREATE INDEX idx_devprov_fecha     ON devoluciones_proveedor(fecha);

-- =====================================================
-- TABLA: detalles_devolucion_proveedor 🆕 v1.5
-- =====================================================
DROP TABLE IF EXISTS detalles_devolucion_proveedor;
CREATE TABLE detalles_devolucion_proveedor (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucion_proveedor_id INTEGER NOT NULL,
  detalle_compra_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  variante_id INTEGER,
  talla TEXT,
  cantidad_devuelta INTEGER NOT NULL CHECK (cantidad_devuelta > 0),
  precio_compra REAL NOT NULL,
  subtotal REAL NOT NULL,
  motivo_item TEXT,
  FOREIGN KEY (devolucion_proveedor_id) REFERENCES devoluciones_proveedor(id) ON DELETE CASCADE,
  FOREIGN KEY (detalle_compra_id)       REFERENCES detalles_compra(id),
  FOREIGN KEY (producto_id)             REFERENCES productos(id),
  FOREIGN KEY (variante_id)             REFERENCES producto_variantes(id)
);

CREATE INDEX idx_detdevprov_devolucion ON detalles_devolucion_proveedor(devolucion_proveedor_id);
CREATE INDEX idx_detdevprov_producto   ON detalles_devolucion_proveedor(producto_id);

-- =====================================================
-- TABLA: configuracion_tienda
-- =====================================================
-- =====================================================
-- TABLA: configuracion_tienda
-- =====================================================
DROP TABLE IF EXISTS configuracion_tienda;
CREATE TABLE configuracion_tienda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre_tienda TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  rfc TEXT,
  logo_path TEXT,
  mensaje_recibo TEXT,
  moneda TEXT DEFAULT 'PEN',
  formato_folio TEXT DEFAULT 'V-{YYYY}{MM}{DD}-{####}',
  iva_porcentaje REAL DEFAULT 0,
  dias_devolucion INTEGER DEFAULT 7,
  backup_automatico INTEGER DEFAULT 1,
  hora_backup TEXT DEFAULT '23:00:00',
  impresora_ip TEXT DEFAULT '',
  impresora_tipo TEXT DEFAULT 'TERMICA',
  impresora_puerto INTEGER DEFAULT 9100,
  modo_negocio TEXT DEFAULT 'LUBRICENTRO' CHECK(modo_negocio IN ('LUBRICENTRO')), -- Rubro único: Lubricentro (usa la lógica interna "Lubricentro": venta por unidad/medida, sin tallas)
  modo_negocio_configurado INTEGER DEFAULT 1, -- Rubro fijo de fábrica, no requiere wizard de primer arranque
  nubefact_token TEXT, -- (en desuso — se reemplazó por FacturaLibre, se deja la columna para no romper instalaciones migradas)
  nubefact_ruta TEXT, -- (en desuso — ídem)
  facturalibre_token TEXT, -- 🆕 token de la cuenta de FacturaLibre.org del negocio (para boletas/facturas electrónicas)
  facturalibre_ruta TEXT, -- 🆕 URL de la API de la cuenta FacturaLibre del negocio (ej. https://tuempresa.proapi.facturalibre.org/api/documents)
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
);
-- =====================================================
-- TABLA: auditoria
-- =====================================================
DROP TABLE IF EXISTS auditoria;
CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  tabla_afectada TEXT,
  registro_id INTEGER,
  valores_anteriores TEXT,
  valores_nuevos TEXT,
  ip_address TEXT,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_tabla ON auditoria(tabla_afectada);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha_hora);

-- =====================================================
-- SISTEMA DE CONTROL DE CAJAS POR TURNO
-- =====================================================
DROP TABLE IF EXISTS turnos_configuracion;
CREATE TABLE turnos_configuracion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE CHECK(nombre IN ('MAÑANA', 'TARDE', 'NOCHE')),
  hora_inicio_esperada TEXT NOT NULL,
  hora_fin_esperada TEXT NOT NULL,
  tolerancia_minutos INTEGER DEFAULT 15,
  activo INTEGER DEFAULT 1,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime'))
);

INSERT INTO turnos_configuracion (nombre, hora_inicio_esperada, hora_fin_esperada, tolerancia_minutos) VALUES
('MAÑANA', '06:00:00', '14:00:00', 15),
('TARDE',  '14:00:00', '22:00:00', 15),
('NOCHE',  '22:00:00', '06:00:00', 15);

CREATE INDEX idx_turnos_nombre ON turnos_configuracion(nombre);

DROP TABLE IF EXISTS cajas;
CREATE TABLE cajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  numero_caja INTEGER DEFAULT 1,
  turno TEXT NOT NULL CHECK(turno IN ('MAÑANA', 'TARDE', 'NOCHE')),
  fecha_apertura TEXT DEFAULT (datetime('now', 'localtime')),
  hora_apertura TEXT DEFAULT (strftime('%H:%M:%S', 'now', 'localtime')),
  monto_inicial REAL NOT NULL CHECK (monto_inicial >= 0),
  observaciones_apertura TEXT,
  hora_esperada_inicio TEXT,
  minutos_retraso INTEGER DEFAULT 0,
  llego_tarde INTEGER DEFAULT 0,
  fecha_cierre TEXT,
  hora_cierre TEXT,
  hora_esperada_fin TEXT,
  monto_final_contado REAL,
  observaciones_cierre TEXT,
  desglose_efectivo TEXT,
  ventas_efectivo REAL DEFAULT 0,
  ventas_tarjeta REAL DEFAULT 0,
  ventas_transferencia REAL DEFAULT 0,
  total_ventas REAL DEFAULT 0,
  numero_transacciones INTEGER DEFAULT 0,
  ticket_promedio REAL DEFAULT 0,
  devoluciones_monto REAL DEFAULT 0,
  devoluciones_cantidad INTEGER DEFAULT 0,
  retiros_total REAL DEFAULT 0,
  ingresos_total REAL DEFAULT 0,
  gastos_total REAL DEFAULT 0,
  cambio_total REAL DEFAULT 0,
  efectivo_esperado REAL,
  diferencia REAL,
  estado_diferencia TEXT CHECK(estado_diferencia IN ('SIN_DIFERENCIA', 'ACEPTABLE', 'SIGNIFICATIVA')),
  justificacion_diferencia TEXT,
  estado TEXT DEFAULT 'ABIERTA' CHECK(estado IN ('ABIERTA', 'CERRADA')),
  duracion_turno_minutos INTEGER,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE INDEX idx_cajas_usuario ON cajas(usuario_id);
CREATE INDEX idx_cajas_fecha ON cajas(fecha_apertura);
CREATE INDEX idx_cajas_estado ON cajas(estado);
CREATE INDEX idx_cajas_turno ON cajas(turno);

DROP TABLE IF EXISTS movimientos_caja;
CREATE TABLE movimientos_caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caja_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('RETIRO', 'INGRESO', 'GASTO')),
  monto REAL NOT NULL CHECK(monto > 0),
  motivo TEXT NOT NULL,
  autorizado_por INTEGER,
  nombre_autorizador TEXT,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
  hora TEXT DEFAULT (strftime('%H:%M:%S', 'now', 'localtime')),
  usuario_id INTEGER NOT NULL,
  FOREIGN KEY (caja_id) REFERENCES cajas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)
);

CREATE INDEX idx_movimientos_caja_caja_id ON movimientos_caja(caja_id);
CREATE INDEX idx_movimientos_caja_tipo ON movimientos_caja(tipo);
CREATE INDEX idx_movimientos_caja_fecha ON movimientos_caja(fecha_hora);

-- =====================================================
-- TABLA: licencias
-- =====================================================
DROP TABLE IF EXISTS licencias;
CREATE TABLE licencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_instalacion TEXT NOT NULL,
  fecha_primera_activacion TEXT,
  fecha_expiracion TEXT NOT NULL,
  fecha_ultimo_aviso TEXT,
  tipo_licencia TEXT NOT NULL CHECK(tipo_licencia IN ('TRIAL', 'MENSUAL', 'ANUAL', 'PERPETUA')),
  estado TEXT NOT NULL CHECK(estado IN ('ACTIVO', 'GRACIA', 'EXPIRADO', 'SUSPENDIDO')),
  codigo_activacion TEXT UNIQUE,
  codigo_usado INTEGER DEFAULT 0,
  nombre_cliente TEXT,
  email_cliente TEXT,
  telefono_cliente TEXT,
  intentos_activacion INTEGER DEFAULT 0,
  fecha_ultimo_intento TEXT,
  version_app TEXT,
  sistema_operativo TEXT,
  machine_id TEXT,
  total_ventas_realizadas INTEGER DEFAULT 0,
  total_productos_vendidos INTEGER DEFAULT 0,
  avisos_enviados INTEGER DEFAULT 0,
  fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
  fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_licencias_estado ON licencias(estado);
CREATE INDEX idx_licencias_tipo ON licencias(tipo_licencia);
CREATE INDEX idx_licencias_expiracion ON licencias(fecha_expiracion);
CREATE INDEX idx_licencias_codigo ON licencias(codigo_activacion);

DROP TABLE IF EXISTS historial_licencias;
CREATE TABLE historial_licencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  accion TEXT NOT NULL CHECK(accion IN (
    'INSTALACION', 'ACTIVACION', 'RENOVACION', 'EXPIRACION',
    'CAMBIO_ESTADO', 'INTENTO_ACTIVACION_FALLIDO', 'MODO_SOLO_LECTURA'
  )),
  estado_anterior TEXT,
  estado_nuevo TEXT,
  tipo_licencia_anterior TEXT,
  tipo_licencia_nueva TEXT,
  codigo_usado TEXT,
  resultado TEXT NOT NULL CHECK(resultado IN ('EXITOSO', 'FALLIDO')),
  mensaje TEXT,
  dias_agregados INTEGER,
  fecha_expiracion_anterior TEXT,
  fecha_expiracion_nueva TEXT,
  ip_local TEXT,
  usuario_sistema TEXT,
  detalles TEXT,
  fecha_hora TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX idx_historial_accion ON historial_licencias(accion);
CREATE INDEX idx_historial_fecha ON historial_licencias(fecha_hora);
CREATE INDEX idx_historial_codigo ON historial_licencias(codigo_usado);
CREATE INDEX idx_historial_resultado ON historial_licencias(resultado);

PRAGMA foreign_keys = ON;

-- =====================================================
-- DATOS INICIALES
-- =====================================================
INSERT INTO roles (nombre, descripcion, permisos, activo) VALUES
('Administrador', 'Acceso total al sistema', '{"ventas": true, "inventario": true, "reportes": true, "usuarios": true}', 1),
('Cajero',        'Procesar ventas',          '{"ventas": true, "inventario": false}', 1),
('Almacenista',   'Gestionar inventario',     '{"ventas": false, "inventario": true}', 1);

-- 🔒 FIX: los hashes anteriores eran de relleno (no correspondían a ninguna
-- contraseña real) porque el login nunca validó la contraseña hasta ahora.
-- Estos son hashes bcrypt reales, verificados, para las contraseñas indicadas.
INSERT INTO usuarios (username, password_hash, nombre_completo, email, rol_id, activo) VALUES
('admin',       '$2b$12$mGLz/PA90wpJCJq.nFrBUeDhHFzjFdZE5bGanh/YGoKxBjDJbJbpC', 'Administrador General', 'admin@sistema.com',       1, 1),
('cajero',      '$2b$12$4HKxiG5rPcijikGrlyc2qOdRvlLsn7GNClq1FpXuNZOx8C.a3Ne.C', 'Cajero Principal',      'cajero@sistema.com',      2, 1),
('almacenista', '$2b$12$oWJoeuWj3BvBwu20koXzXOqFGccaMduytF03Q1812mPeg60q/1HQC', 'Almacenista',           'almacenista@sistema.com', 3, 1);

-- 🆕 Las categorías ya NO se precargan aquí. Se siembran desde el comando
-- `establecer_modo_negocio` (wizard de primer arranque) según si el negocio
-- elegido es ROPA o Lubricentro, para que una instalación limpia arranque
-- con el set de categorías correcto y no con las 12 de ropa por defecto.

INSERT INTO configuracion_tienda (nombre_tienda, direccion, telefono, email, rfc, mensaje_recibo, moneda, modo_negocio, modo_negocio_configurado) VALUES
('Mi Lubricentro', 'Dirección del establecimiento', '(01) 000-0000', 'contacto@milubricentro.com', '00000000000', 'Gracias por su preferencia. Vuelva pronto.', 'PEN', 'LUBRICENTRO', 1);

-- =====================================================
-- CATEGORÍAS POR DEFECTO — RUBRO LUBRICENTRO
-- =====================================================
INSERT INTO categorias (nombre, descripcion, tipo_talla) VALUES
('Aceites de Motor',            'Aceites minerales, semisintéticos y sintéticos para motor',   'NINGUNA'),
('Grasas',                      'Grasas lubricantes para chasis, rodajes y uso industrial',     'NINGUNA'),
('Filtros de Aceite',           'Filtros de aceite para distintas marcas y modelos',            'NINGUNA'),
('Filtros de Aire',             'Filtros de aire de motor y habitáculo',                        'NINGUNA'),
('Filtros de Combustible',      'Filtros de gasolina, diésel y GLP/GNV',                        'NINGUNA'),
('Refrigerantes',               'Anticongelantes y refrigerantes para radiador',                'NINGUNA'),
('Líquidos de Frenos',          'Líquidos de frenos DOT 3, DOT 4 y DOT 5.1',                    'NINGUNA'),
('Aditivos',                    'Aditivos para motor, combustible y sistema de transmisión',    'NINGUNA'),
('Productos de Limpieza',       'Limpiadores de motor, tapicería y carrocería',                 'NINGUNA'),
('Siliconas',                   'Siliconas y protectores para tablero, llantas y plásticos',    'NINGUNA'),
('Aromatizantes',               'Aromatizantes y ambientadores para vehículo',                  'NINGUNA'),
('Accesorios para Vehículos',   'Accesorios menores y complementos para el vehículo',           'NINGUNA');

INSERT INTO licencias (fecha_instalacion, fecha_expiracion, tipo_licencia, estado, version_app) VALUES (
  datetime('now', 'localtime'),
  datetime('now', 'localtime', '+5 days'),
  'TRIAL', 'ACTIVO', '1.0.0'
);

INSERT INTO historial_licencias (accion, estado_nuevo, tipo_licencia_nueva, resultado, mensaje, dias_agregados, fecha_expiracion_nueva) VALUES (
  'INSTALACION', 'ACTIVO', 'TRIAL', 'EXITOSO',
  'Licencia trial de 5 días creada automáticamente', 5,
  datetime('now', 'localtime', '+5 days')
);

-- =====================================================
-- TRIGGERS DE STOCK - VENTAS
-- =====================================================
CREATE TRIGGER trg_after_venta_insert
AFTER INSERT ON detalles_venta
FOR EACH ROW
WHEN (SELECT estado FROM ventas WHERE id = NEW.venta_id) = 'COMPLETADA'
BEGIN
  UPDATE producto_variantes
  SET stock = stock - NEW.cantidad,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.variante_id AND NEW.variante_id IS NOT NULL;

  UPDATE productos
  SET stock = stock - NEW.cantidad,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.producto_id AND NEW.variante_id IS NULL
    AND lleva_vencimiento = 0; -- 🆕 si lleva vencimiento, el stock se maneja por lotes (código Rust, FEFO) — acá NO se toca, para no descontar dos veces

  INSERT INTO movimientos_inventario (
    producto_id, variante_id, talla, tipo_movimiento,
    cantidad, stock_anterior, stock_nuevo, venta_id, usuario_id, motivo
  ) VALUES (
    NEW.producto_id, NEW.variante_id, NEW.talla, 'VENTA', -NEW.cantidad,
    CASE WHEN NEW.variante_id IS NOT NULL
      THEN (SELECT stock + NEW.cantidad FROM producto_variantes WHERE id = NEW.variante_id)
      ELSE (SELECT stock + NEW.cantidad FROM productos WHERE id = NEW.producto_id) END,
    CASE WHEN NEW.variante_id IS NOT NULL
      THEN (SELECT stock FROM producto_variantes WHERE id = NEW.variante_id)
      ELSE (SELECT stock FROM productos WHERE id = NEW.producto_id) END,
    NEW.venta_id,
    (SELECT usuario_id FROM ventas WHERE id = NEW.venta_id),
    'Venta - Folio: ' || (SELECT folio FROM ventas WHERE id = NEW.venta_id)
  );
END;

CREATE TRIGGER trg_after_venta_cancelar
AFTER UPDATE ON ventas
FOR EACH ROW
WHEN OLD.estado = 'COMPLETADA' AND NEW.estado = 'CANCELADA'
BEGIN
  UPDATE producto_variantes
  SET stock = stock + (SELECT SUM(cantidad) FROM detalles_venta WHERE venta_id = NEW.id AND variante_id = producto_variantes.id),
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id IN (SELECT variante_id FROM detalles_venta WHERE venta_id = NEW.id AND variante_id IS NOT NULL);

  UPDATE productos
  SET stock = stock + (SELECT SUM(cantidad) FROM detalles_venta WHERE venta_id = NEW.id AND variante_id IS NULL AND producto_id = productos.id),
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id IN (SELECT producto_id FROM detalles_venta WHERE venta_id = NEW.id AND variante_id IS NULL);
END;

CREATE TRIGGER trg_after_devolucion_insert
AFTER INSERT ON detalles_devolucion
FOR EACH ROW
WHEN NEW.condicion = 'REVENTA'
BEGIN
  UPDATE producto_variantes
  SET stock = stock + NEW.cantidad_devuelta,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.variante_id AND NEW.variante_id IS NOT NULL;

  UPDATE productos
  SET stock = stock + NEW.cantidad_devuelta,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.producto_id AND NEW.variante_id IS NULL;

  INSERT INTO movimientos_inventario (
    producto_id, variante_id, talla, tipo_movimiento,
    cantidad, stock_anterior, stock_nuevo, devolucion_id, usuario_id, motivo
  ) VALUES (
    NEW.producto_id, NEW.variante_id, NEW.talla, 'DEVOLUCION', NEW.cantidad_devuelta,
    CASE WHEN NEW.variante_id IS NOT NULL
      THEN (SELECT stock - NEW.cantidad_devuelta FROM producto_variantes WHERE id = NEW.variante_id)
      ELSE (SELECT stock - NEW.cantidad_devuelta FROM productos WHERE id = NEW.producto_id) END,
    CASE WHEN NEW.variante_id IS NOT NULL
      THEN (SELECT stock FROM producto_variantes WHERE id = NEW.variante_id)
      ELSE (SELECT stock FROM productos WHERE id = NEW.producto_id) END,
    NEW.devolucion_id,
    (SELECT usuario_id FROM devoluciones WHERE id = NEW.devolucion_id),
    'Devolución - Condición: REVENTA'
  );
END;

-- =====================================================
-- TRIGGERS DE COMPRAS v1.5
-- =====================================================

-- Recalcular saldo al registrar pago
CREATE TRIGGER trg_actualizar_saldo_compra
AFTER INSERT ON pagos_compra
FOR EACH ROW
BEGIN
  UPDATE compras
  SET
    monto_pagado    = (SELECT COALESCE(SUM(monto), 0) FROM pagos_compra WHERE compra_id = NEW.compra_id),
    saldo_pendiente = total - (SELECT COALESCE(SUM(monto), 0) FROM pagos_compra WHERE compra_id = NEW.compra_id),
    estado_pago     = CASE
      WHEN total <= (SELECT COALESCE(SUM(monto), 0) FROM pagos_compra WHERE compra_id = NEW.compra_id) THEN 'PAGADO'
      WHEN (SELECT COALESCE(SUM(monto), 0) FROM pagos_compra WHERE compra_id = NEW.compra_id) > 0 THEN 'PARCIAL'
      ELSE 'PENDIENTE'
    END,
    fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.compra_id;
END;

-- Actualizar total_compras del proveedor al marcar RECIBIDA
CREATE TRIGGER trg_actualizar_total_proveedor
AFTER UPDATE OF estado ON compras
FOR EACH ROW
WHEN NEW.estado = 'RECIBIDA' AND OLD.estado != 'RECIBIDA'
BEGIN
  UPDATE proveedores
  SET total_compras = total_compras + NEW.total,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.proveedor_id;
END;

-- 🆕 v1.5: Subir stock usando cantidad_conforme (no cantidad_recibida)
-- Se activa cuando la compra pasa a RECIBIDA o PARCIAL
CREATE TRIGGER trg_after_compra_recibida
AFTER UPDATE OF estado ON compras
FOR EACH ROW
WHEN NEW.estado IN ('RECIBIDA', 'PARCIAL') AND OLD.estado = 'PENDIENTE'
BEGIN
  -- Con variantes: sube stock por cantidad_conforme
  UPDATE producto_variantes
  SET stock = stock + (
        SELECT COALESCE(SUM(cantidad_conforme), 0)
        FROM detalles_compra
        WHERE compra_id = NEW.id AND variante_id = producto_variantes.id
      ),
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id IN (
    SELECT variante_id FROM detalles_compra
    WHERE compra_id = NEW.id AND variante_id IS NOT NULL
  );

  -- Sin variantes: sube stock del producto directamente
  UPDATE productos
  SET stock = stock + (
        SELECT COALESCE(SUM(cantidad_conforme), 0)
        FROM detalles_compra
        WHERE compra_id = NEW.id AND producto_id = productos.id AND variante_id IS NULL
      ),
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id IN (
    SELECT producto_id FROM detalles_compra
    WHERE compra_id = NEW.id AND variante_id IS NULL
  );

  -- Registrar movimientos de inventario
  INSERT INTO movimientos_inventario (
    producto_id, variante_id, talla, tipo_movimiento,
    cantidad, stock_anterior, stock_nuevo,
    compra_id, usuario_id, referencia, motivo
  )
  SELECT
    dc.producto_id,
    dc.variante_id,
    dc.talla,
    'ENTRADA',
    dc.cantidad_conforme,
    CASE WHEN dc.variante_id IS NOT NULL
      THEN (SELECT stock - dc.cantidad_conforme FROM producto_variantes WHERE id = dc.variante_id)
      ELSE (SELECT stock - dc.cantidad_conforme FROM productos WHERE id = dc.producto_id)
    END,
    CASE WHEN dc.variante_id IS NOT NULL
      THEN (SELECT stock FROM producto_variantes WHERE id = dc.variante_id)
      ELSE (SELECT stock FROM productos WHERE id = dc.producto_id)
    END,
    NEW.id,
    NEW.usuario_id,
    NEW.folio,
    'Recepción compra - conforme: ' || dc.cantidad_conforme ||
    CASE WHEN dc.cantidad_recibida > dc.cantidad_conforme
      THEN ' / dañado: ' || (dc.cantidad_recibida - dc.cantidad_conforme)
      ELSE ''
    END
  FROM detalles_compra dc
  WHERE dc.compra_id = NEW.id AND dc.cantidad_conforme > 0;
END;

-- 🆕 v1.5: Recalcular total de compra al confirmar recepción
-- El total se ajusta según lo conforme recibido
CREATE TRIGGER trg_recalcular_total_compra
AFTER UPDATE OF estado ON compras
FOR EACH ROW
WHEN NEW.estado IN ('RECIBIDA', 'PARCIAL') AND OLD.estado = 'PENDIENTE'
BEGIN
  UPDATE compras
  SET
    subtotal = (
      SELECT COALESCE(SUM(cantidad_conforme * precio_compra), 0)
      FROM detalles_compra WHERE compra_id = NEW.id
    ),
    total = (
      SELECT COALESCE(SUM(cantidad_conforme * precio_compra), 0)
      FROM detalles_compra WHERE compra_id = NEW.id
    ) - COALESCE(NEW.descuento, 0) - COALESCE(NEW.credito_aplicado, 0),
    saldo_pendiente = CASE
      WHEN (
        SELECT COALESCE(SUM(cantidad_conforme * precio_compra), 0)
        FROM detalles_compra WHERE compra_id = NEW.id
      ) - COALESCE(NEW.descuento, 0) - COALESCE(NEW.credito_aplicado, 0) - NEW.monto_pagado < 0
      THEN 0
      ELSE (
        SELECT COALESCE(SUM(cantidad_conforme * precio_compra), 0)
        FROM detalles_compra WHERE compra_id = NEW.id
      ) - COALESCE(NEW.descuento, 0) - COALESCE(NEW.credito_aplicado, 0) - NEW.monto_pagado
    END,
    estado_pago = CASE
      WHEN NEW.monto_pagado >= (
        SELECT COALESCE(SUM(cantidad_conforme * precio_compra), 0)
        FROM detalles_compra WHERE compra_id = NEW.id
      ) - COALESCE(NEW.descuento, 0) - COALESCE(NEW.credito_aplicado, 0)
      THEN 'PAGADO'
      WHEN NEW.monto_pagado > 0 THEN 'PARCIAL'
      ELSE 'PENDIENTE'
    END,
    fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.id;
END;

-- 🆕 v1.5: Al aceptar devolución a proveedor → sumar crédito
CREATE TRIGGER trg_credito_proveedor_devolucion
AFTER UPDATE OF estado ON devoluciones_proveedor
FOR EACH ROW
WHEN NEW.estado = 'ACEPTADA' AND OLD.estado != 'ACEPTADA'
  AND NEW.tipo_resolucion = 'CREDITO'
BEGIN
  UPDATE proveedores
  SET credito_disponible  = credito_disponible + NEW.monto_devolucion,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.proveedor_id;

  UPDATE devoluciones_proveedor
  SET fecha_resolucion = datetime('now', 'localtime')
  WHERE id = NEW.id;
END;

-- 🆕 v1.5: Al crear compra con crédito aplicado → descontar del proveedor
CREATE TRIGGER trg_descontar_credito_proveedor
AFTER INSERT ON compras
FOR EACH ROW
WHEN NEW.credito_aplicado > 0
BEGIN
  UPDATE proveedores
  SET credito_disponible  = credito_disponible - NEW.credito_aplicado,
      fecha_actualizacion = datetime('now', 'localtime')
  WHERE id = NEW.proveedor_id;
END;

-- Triggers de licencias
CREATE TRIGGER trg_licencias_update
AFTER UPDATE ON licencias
FOR EACH ROW
BEGIN
  UPDATE licencias SET fecha_actualizacion = datetime('now', 'localtime') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_licencias_historial
AFTER UPDATE ON licencias
FOR EACH ROW
WHEN OLD.estado != NEW.estado OR OLD.tipo_licencia != NEW.tipo_licencia
BEGIN
  INSERT INTO historial_licencias (
    accion, estado_anterior, estado_nuevo,
    tipo_licencia_anterior, tipo_licencia_nueva,
    resultado, mensaje, fecha_expiracion_anterior, fecha_expiracion_nueva
  ) VALUES (
    CASE
      WHEN NEW.tipo_licencia != OLD.tipo_licencia THEN 'ACTIVACION'
      WHEN NEW.estado = 'EXPIRADO' THEN 'EXPIRACION'
      ELSE 'CAMBIO_ESTADO'
    END,
    OLD.estado, NEW.estado, OLD.tipo_licencia, NEW.tipo_licencia,
    'EXITOSO', 'Cambio automático de estado o tipo de licencia',
    OLD.fecha_expiracion, NEW.fecha_expiracion
  );
END;

-- Triggers de caja
DROP TRIGGER IF EXISTS trg_actualizar_caja_venta;
CREATE TRIGGER trg_actualizar_caja_venta
AFTER INSERT ON ventas
FOR EACH ROW
WHEN NEW.estado = 'COMPLETADA'
BEGIN
  UPDATE cajas
  SET
    ventas_efectivo      = ventas_efectivo      + CASE WHEN NEW.metodo_pago = 'EFECTIVO'      THEN NEW.total ELSE 0 END,
    ventas_tarjeta       = ventas_tarjeta       + CASE WHEN NEW.metodo_pago = 'TARJETA'       THEN NEW.total ELSE 0 END,
    ventas_transferencia = ventas_transferencia + CASE WHEN NEW.metodo_pago = 'TRANSFERENCIA' THEN NEW.total ELSE 0 END,
    total_ventas         = total_ventas         + NEW.total,
    numero_transacciones = numero_transacciones + 1,
    cambio_total         = cambio_total         + COALESCE(NEW.cambio, 0),
    ticket_promedio      = CASE WHEN numero_transacciones + 1 > 0
                           THEN (total_ventas + NEW.total) / (numero_transacciones + 1) ELSE 0 END
  WHERE usuario_id = NEW.usuario_id AND estado = 'ABIERTA'
    AND date(fecha_apertura) = date(NEW.fecha_hora);
END;

DROP TRIGGER IF EXISTS trg_actualizar_caja_devolucion;
CREATE TRIGGER trg_actualizar_caja_devolucion
AFTER INSERT ON devoluciones
FOR EACH ROW
WHEN NEW.estado = 'PROCESADA'
BEGIN
  UPDATE cajas
  SET
    devoluciones_monto    = devoluciones_monto + NEW.monto_reembolsado,
    devoluciones_cantidad = devoluciones_cantidad + 1,
    ventas_efectivo       = ventas_efectivo       - CASE WHEN NEW.metodo_reembolso = 'EFECTIVO'      THEN NEW.monto_reembolsado ELSE 0 END,
    ventas_tarjeta        = ventas_tarjeta        - CASE WHEN NEW.metodo_reembolso = 'TARJETA'       THEN NEW.monto_reembolsado ELSE 0 END,
    ventas_transferencia  = ventas_transferencia  - CASE WHEN NEW.metodo_reembolso = 'TRANSFERENCIA' THEN NEW.monto_reembolsado ELSE 0 END
  WHERE usuario_id = NEW.usuario_id AND estado = 'ABIERTA'
    AND date(fecha_apertura) = date(NEW.fecha_hora);
END;

DROP TRIGGER IF EXISTS trg_actualizar_movimientos_caja;
CREATE TRIGGER trg_actualizar_movimientos_caja
AFTER INSERT ON movimientos_caja
FOR EACH ROW
BEGIN
  UPDATE cajas
  SET
    retiros_total  = retiros_total  + CASE WHEN NEW.tipo = 'RETIRO'  THEN NEW.monto ELSE 0 END,
    ingresos_total = ingresos_total + CASE WHEN NEW.tipo = 'INGRESO' THEN NEW.monto ELSE 0 END,
    gastos_total   = gastos_total   + CASE WHEN NEW.tipo = 'GASTO'   THEN NEW.monto ELSE 0 END
  WHERE id = NEW.caja_id;
END;

DROP TRIGGER IF EXISTS trg_actualizar_caja_cancelar_venta;
CREATE TRIGGER trg_actualizar_caja_cancelar_venta
AFTER UPDATE ON ventas
FOR EACH ROW
WHEN OLD.estado = 'COMPLETADA' AND NEW.estado = 'CANCELADA'
BEGIN
  UPDATE cajas
  SET
    ventas_efectivo      = ventas_efectivo      - CASE WHEN NEW.metodo_pago = 'EFECTIVO'      THEN NEW.total ELSE 0 END,
    ventas_tarjeta       = ventas_tarjeta       - CASE WHEN NEW.metodo_pago = 'TARJETA'       THEN NEW.total ELSE 0 END,
    ventas_transferencia = ventas_transferencia - CASE WHEN NEW.metodo_pago = 'TRANSFERENCIA' THEN NEW.total ELSE 0 END,
    total_ventas         = total_ventas         - NEW.total,
    numero_transacciones = numero_transacciones - 1,
    ticket_promedio      = CASE WHEN numero_transacciones - 1 > 0
                           THEN (total_ventas - NEW.total) / (numero_transacciones - 1) ELSE 0 END
  WHERE usuario_id = NEW.usuario_id AND estado = 'ABIERTA'
    AND date(fecha_apertura) = date(NEW.fecha_hora);
END;