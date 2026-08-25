// database/connection.rs
use rusqlite::{Connection, Result, params};
use std::sync::{Arc, Mutex};
use std::path::{Path, PathBuf};
use std::fs;

pub struct DatabasePool {
    conn: Arc<Mutex<Connection>>,
}

impl DatabasePool {
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        Ok(DatabasePool {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn get_conn(&self) -> std::sync::MutexGuard<Connection> {
        self.conn.lock().unwrap()
    }
}

pub fn get_database_path() -> PathBuf {
    let app_data_dir = if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let mut path = std::env::var("USERPROFILE")
                    .map(PathBuf::from)
                    .unwrap_or_else(|_| PathBuf::from("."));
                path.push("AppData");
                path.push("Roaming");
                path
            })
           .join("Lubricentro-Car")
    } else if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("Library")
            .join("Application Support")
            .join("Lubricentro-Car")
    } else {
        std::env::var("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".local")
            .join("share")
            .join("lubricentro-car")
    };

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).ok();
        println!("Directorio de datos creado: {:?}", app_data_dir);
    }

    app_data_dir.join("lubricentro.db")
}

pub fn migrate_database_if_needed() -> bool {
    let new_path = get_database_path();
    
    if new_path.exists() {
        println!("Base de datos ya esta en AppData");
        return true;
    }

    let old_path = std::env::current_dir()
        .ok()
        .map(|mut p| { p.push("lubricentro.db"); p });

    if let Some(old_path) = old_path {
        if old_path.exists() {
            match fs::copy(&old_path, &new_path) {
                Ok(_) => {
                    println!("Base de datos migrada a AppData");
                    return true;
                }
                Err(e) => {
                    eprintln!("Error al migrar BD: {}", e);
                    return false;
                }
            }
        }
    }

    println!("No hay base de datos para migrar");
    false
}

pub fn initialize_database(db_path: &str) -> Result<()> {
    println!("Inicializando base de datos en: {}", db_path);
    let conn = Connection::open(db_path)?;
    let schema = include_str!("../../schema_sqlite.sql");
    conn.execute_batch(schema)?;
    println!("Base de datos inicializada correctamente");
    Ok(())
}

pub fn database_exists(db_path: &str) -> bool {
    if !Path::new(db_path).exists() {
        return false;
    }
    if let Ok(conn) = Connection::open(db_path) {
        // 🩹 A propósito MUY conservador: si el archivo ya tiene aunque sea
        // una sola tabla creada, se trata como base de datos EXISTENTE y
        // jamás se reinicializa con el schema completo (schema_sqlite.sql
        // empieza cada tabla con "DROP TABLE IF EXISTS ... ; CREATE TABLE
        // ..." — eso borra TODO, incluidos productos/ventas/clientes
        // reales). Antes este chequeo solo miraba si existía la tabla
        // 'usuarios': si una instalación vieja no la tenía por el motivo
        // que sea, el sistema la trataba como "base nueva" y corría el
        // schema completo encima, dejando en blanco el inventario de un
        // negocio que ya estaba trabajando. Bug reportado 2026-08-24 — ver
        // la migración de abajo en run_migrations() que crea 'usuarios' /
        // 'roles' / 'sesiones_log' de forma aditiva si llegaran a faltar.
        if let Ok(mut stmt) = conn.prepare(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ) {
            let total_tablas: i64 = stmt.query_row([], |row| row.get(0)).unwrap_or(0);
            return total_tablas > 0;
        }
    }
    false
}

pub fn run_migrations(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path)?;

    // 🩹 Migración de seguridad (2026-08-24): red de contención para el bug
    // de reinicio de datos descrito arriba en database_exists(). Si por
    // cualquier motivo una base de datos existente (con productos/ventas
    // reales) nunca tuvo las tablas de usuarios/roles, se crean acá de
    // forma ADITIVA — CREATE TABLE IF NOT EXISTS, nunca DROP — para no
    // tocar nada de lo demás. Si hay que crear 'usuarios' desde cero, se
    // siembra con los mismos 3 usuarios por defecto (admin/cajero/
    // almacenista) que trae una instalación nueva, para no dejar al
    // negocio sin forma de entrar al sistema.
    let has_roles: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='roles'")?
        .exists([])?;
    if !has_roles {
        println!("Migracion de seguridad: creando tabla roles (faltaba)...");
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS roles (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              nombre TEXT NOT NULL UNIQUE,
              descripcion TEXT,
              permisos TEXT,
              activo INTEGER DEFAULT 1,
              fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
              fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_roles_nombre ON roles(nombre);
            CREATE INDEX IF NOT EXISTS idx_roles_activo ON roles(activo);
            INSERT INTO roles (nombre, descripcion, permisos, activo) VALUES
            ('Administrador', 'Acceso total al sistema', '{"ventas": true, "inventario": true, "reportes": true, "usuarios": true}', 1),
            ('Cajero',        'Procesar ventas',          '{"ventas": true, "inventario": false}', 1),
            ('Almacenista',   'Gestionar inventario',     '{"ventas": false, "inventario": true}', 1);
        "#)?;
    }

    let has_usuarios: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'")?
        .exists([])?;
    if !has_usuarios {
        println!("Migracion de seguridad: creando tabla usuarios (faltaba)...");
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS usuarios (
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
            CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
            CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios(activo);
            CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol_id);
            INSERT INTO usuarios (username, password_hash, nombre_completo, email, rol_id, activo) VALUES
            ('admin',       '$2b$12$mGLz/PA90wpJCJq.nFrBUeDhHFzjFdZE5bGanh/YGoKxBjDJbJbpC', 'Administrador General', 'admin@sistema.com',       1, 1),
            ('cajero',      '$2b$12$4HKxiG5rPcijikGrlyc2qOdRvlLsn7GNClq1FpXuNZOx8C.a3Ne.C', 'Cajero Principal',      'cajero@sistema.com',      2, 1),
            ('almacenista', '$2b$12$oWJoeuWj3BvBwu20koXzXOqFGccaMduytF03Q1812mPeg60q/1HQC', 'Almacenista',           'almacenista@sistema.com', 3, 1);
        "#)?;
    }

    let has_sesiones_log: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sesiones_log'")?
        .exists([])?;
    if !has_sesiones_log {
        println!("Migracion de seguridad: creando tabla sesiones_log (faltaba)...");
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS sesiones_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              usuario_id INTEGER NOT NULL,
              fecha_hora TEXT DEFAULT (datetime('now', 'localtime')),
              ip_address TEXT,
              user_agent TEXT,
              resultado TEXT NOT NULL CHECK(resultado IN ('EXITOSO', 'FALLIDO', 'BLOQUEADO')),
              motivo_fallo TEXT,
              FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_log(usuario_id);
            CREATE INDEX IF NOT EXISTS idx_sesiones_fecha ON sesiones_log(fecha_hora);
        "#)?;
    }

    // Migración: tabla licencias
    let has_licencias: bool = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='licencias'")?
        .exists([])?;

    if !has_licencias {
        println!("Ejecutando migracion: Agregar sistema de licencias...");
        conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS licencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_licencia TEXT NOT NULL DEFAULT 'TRIAL',
                estado TEXT NOT NULL DEFAULT 'ACTIVO',
                fecha_instalacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_expiracion TIMESTAMP,
                codigo_activacion TEXT,
                fecha_ultima_activacion TIMESTAMP,
                intentos_activacion INTEGER DEFAULT 0,
                primera_vez_mostrado INTEGER DEFAULT 0
            );

            INSERT INTO licencias (tipo_licencia, estado, fecha_expiracion)
            SELECT 'TRIAL', 'ACTIVO', datetime('now', '+5 days')
            WHERE NOT EXISTS (SELECT 1 FROM licencias WHERE id = 1);

            CREATE TABLE IF NOT EXISTS historial_licencias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo_licencia TEXT NOT NULL,
                codigo_activacion TEXT,
                fecha_activacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                fecha_expiracion TIMESTAMP,
                estado TEXT,
                notas TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_licencias_estado ON licencias(estado);
            CREATE INDEX IF NOT EXISTS idx_licencias_codigo ON licencias(codigo_activacion);
            CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_licencias(fecha_activacion);
        "#)?;
        println!("Migracion completada: Sistema de licencias agregado");
    } else {
        // Migración: columna primera_vez_mostrado
        let has_primera_vez: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('licencias') WHERE name='primera_vez_mostrado'",
                [],
                |row| Ok(row.get::<_, i32>(0)? > 0),
            )
            .unwrap_or(false);

        if !has_primera_vez {
            println!("Agregando columna primera_vez_mostrado...");
            conn.execute("ALTER TABLE licencias ADD COLUMN primera_vez_mostrado INTEGER DEFAULT 0", [])?;
            println!("Columna primera_vez_mostrado agregada");
        }
    }

    // 🆕 Migración: columnas de impresora en configuracion_tienda
    let has_impresora_ip: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='impresora_ip'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_impresora_ip {
        println!("Agregando columnas de impresora...");
        conn.execute_batch(r#"
            ALTER TABLE configuracion_tienda ADD COLUMN impresora_ip TEXT DEFAULT '';
            ALTER TABLE configuracion_tienda ADD COLUMN impresora_tipo TEXT DEFAULT 'TERMICA';
            ALTER TABLE configuracion_tienda ADD COLUMN impresora_puerto INTEGER DEFAULT 9100;
        "#)?;
        println!("Columnas de impresora agregadas");
    }

    // 🆕 Migración: columna imagen_url en productos
    let has_imagen_url: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('productos') WHERE name='imagen_url'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_imagen_url {
        println!("Agregando columna imagen_url a productos...");
        conn.execute("ALTER TABLE productos ADD COLUMN imagen_url TEXT", [])?;
        println!("Columna imagen_url agregada");
    }

    // 🆕 Migración: columna unidad_medida en productos (venta por unidad, kilo, gramo, litro, mL)
    // Nota: no hace falta migrar el TIPO de las columnas stock/cantidad (INTEGER → REAL) —
    // SQLite guarda decimales igual en columnas declaradas INTEGER gracias a su sistema de
    // "type affinity", así que instalaciones viejas ya pueden guardar decimales sin drama.
    let has_unidad_medida: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('productos') WHERE name='unidad_medida'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_unidad_medida {
        println!("Agregando columna unidad_medida a productos...");
        conn.execute(
            "ALTER TABLE productos ADD COLUMN unidad_medida TEXT NOT NULL DEFAULT 'UNIDAD'",
            [],
        )?;
        println!("Columna unidad_medida agregada (productos existentes quedan como 'UNIDAD')");
    }

    // 🆕 Migración: columna nubefact_token en configuracion_tienda
    let has_nubefact_token: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='nubefact_token'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_nubefact_token {
        println!("Agregando columna nubefact_token a configuracion_tienda...");
        conn.execute("ALTER TABLE configuracion_tienda ADD COLUMN nubefact_token TEXT", [])?;
        println!("Columna nubefact_token agregada");
    }

    // 🆕 Migración: columna nubefact_ruta en configuracion_tienda
    let has_nubefact_ruta: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='nubefact_ruta'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_nubefact_ruta {
        println!("Agregando columna nubefact_ruta a configuracion_tienda...");
        conn.execute("ALTER TABLE configuracion_tienda ADD COLUMN nubefact_ruta TEXT", [])?;
        println!("Columna nubefact_ruta agregada");
    }

    // 🆕 Migración: columna facturalibre_token en configuracion_tienda
    // (reemplaza a NubeFacT como proveedor de facturación electrónica — las
    // columnas nubefact_token/nubefact_ruta de arriba se dejan intactas, sin
    // usarse, para no romper instalaciones que ya tenían datos ahí)
    let has_facturalibre_token: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='facturalibre_token'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_facturalibre_token {
        println!("Agregando columna facturalibre_token a configuracion_tienda...");
        conn.execute("ALTER TABLE configuracion_tienda ADD COLUMN facturalibre_token TEXT", [])?;
        println!("Columna facturalibre_token agregada");
    }

    // 🆕 Migración: columna facturalibre_ruta en configuracion_tienda
    let has_facturalibre_ruta: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='facturalibre_ruta'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_facturalibre_ruta {
        println!("Agregando columna facturalibre_ruta a configuracion_tienda...");
        conn.execute("ALTER TABLE configuracion_tienda ADD COLUMN facturalibre_ruta TEXT", [])?;
        println!("Columna facturalibre_ruta agregada");
    }

    // 🆕 Migración: columna precio en producto_variantes (precio propio por talla)
    let has_precio_variante: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('producto_variantes') WHERE name='precio'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_precio_variante {
        println!("Agregando columna precio a producto_variantes...");
        conn.execute("ALTER TABLE producto_variantes ADD COLUMN precio REAL", [])?;
        println!("Columna precio agregada (tallas existentes quedan en NULL = usan el precio del producto)");
    }

    // 🆕 Migración: columna detalle_venta_id en detalles_devolucion
    // (faltaba en la tabla, aunque el código ya la necesitaba — por eso
    // fallaban las devoluciones de productos con talla)
    let has_detalle_venta_id: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('detalles_devolucion') WHERE name='detalle_venta_id'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_detalle_venta_id {
        println!("Agregando columna detalle_venta_id a detalles_devolucion...");
        conn.execute("ALTER TABLE detalles_devolucion ADD COLUMN detalle_venta_id INTEGER", [])?;
        println!("Columna detalle_venta_id agregada");
    }

    // 🆕 Migración: corregir trigger de devolución en caja — antes solo
    // descontaba de "ventas efectivo", nunca de tarjeta/transferencia,
    // dejando esos totales inflados cuando el reembolso no era en efectivo.
    // Usamos un marcador propio (no se puede leer el SQL de un trigger ya
    // creado de forma simple), así que lo recreamos siempre que falte ese marcador.
    let trigger_devolucion_actualizado: bool = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_actualizar_caja_devolucion'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|sql| sql.contains("ventas_tarjeta"))
        .unwrap_or(false);

    if !trigger_devolucion_actualizado {
        println!("Actualizando trigger de devolución en caja (tarjeta/transferencia)...");
        conn.execute_batch(
            "DROP TRIGGER IF EXISTS trg_actualizar_caja_devolucion;
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
             END;"
        )?;
        println!("Trigger de devolución actualizado");
    }

    // =====================================================
    // 🆕 Migración: control de vencimiento por lotes (minimarket)
    // =====================================================
    let has_lleva_vencimiento: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('productos') WHERE name='lleva_vencimiento'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_lleva_vencimiento {
        println!("Agregando columna lleva_vencimiento a productos...");
        conn.execute("ALTER TABLE productos ADD COLUMN lleva_vencimiento INTEGER DEFAULT 0", [])?;
        println!("Columna lleva_vencimiento agregada");
    }

    let has_tabla_lotes: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='lotes_producto'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_tabla_lotes {
        println!("Creando tabla lotes_producto...");
        conn.execute_batch(
            "CREATE TABLE lotes_producto (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                producto_id INTEGER NOT NULL,
                cantidad REAL NOT NULL CHECK (cantidad >= 0),
                fecha_vencimiento TEXT NOT NULL,
                fecha_ingreso TEXT DEFAULT (datetime('now', 'localtime')),
                compra_id INTEGER,
                numero_lote TEXT,
                activo INTEGER DEFAULT 1,
                FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
                FOREIGN KEY (compra_id) REFERENCES compras(id)
             );
             CREATE INDEX idx_lotes_producto ON lotes_producto(producto_id);
             CREATE INDEX idx_lotes_vencimiento ON lotes_producto(fecha_vencimiento);

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
             END;"
        )?;
        println!("Tabla lotes_producto y triggers de sincronización creados");
    }

    // 🔧 Actualizar trg_after_venta_insert para que no descuente doble en
    // productos con lotes (el stock de esos lo maneja el código Rust)
    let trigger_venta_actualizado: bool = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_after_venta_insert'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|sql| sql.contains("lleva_vencimiento"))
        .unwrap_or(false);

    if !trigger_venta_actualizado {
        println!("Actualizando trigger de venta (compatibilidad con lotes)...");
        conn.execute_batch(
            "DROP TRIGGER IF EXISTS trg_after_venta_insert;
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
                 AND lleva_vencimiento = 0;

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
             END;"
        )?;
        println!("Trigger de venta actualizado");
    }

    // 🆕 Migración: triggers que mantienen productos.precio sincronizado
    // con el precio más bajo de sus tallas activas
    let has_trigger_sync: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='trg_sync_precio_producto_update'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_trigger_sync {
        println!("Creando triggers de sincronización de precio por talla...");
        conn.execute_batch(
            "CREATE TRIGGER trg_sync_precio_producto_insert
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
             END;"
        )?;
        println!("Triggers creados");

        // 🔧 Arreglo único: recalcular ya mismo el precio de productos con
        // tallas que hayan quedado desincronizados de antes (como pasaba
        // hasta ahora, antes de que existieran estos triggers)
        let corregidos = conn.execute(
            "UPDATE productos SET precio = (
                SELECT MIN(precio) FROM producto_variantes
                WHERE producto_id = productos.id AND activo = 1 AND precio IS NOT NULL
             )
             WHERE tiene_variantes = 1
               AND EXISTS (
                 SELECT 1 FROM producto_variantes
                 WHERE producto_id = productos.id AND activo = 1 AND precio IS NOT NULL
               )",
            [],
        ).unwrap_or(0);
        if corregidos > 0 {
            println!("Se corrigió el precio desincronizado de {} producto(s)", corregidos);
        }
    }

    // 🆕 Migración: tabla comprobantes_electronicos (boletas/facturas vía NubeFacT)
    let has_comprobantes: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='comprobantes_electronicos'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_comprobantes {
        println!("Creando tabla comprobantes_electronicos...");
        conn.execute(
            "CREATE TABLE comprobantes_electronicos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                venta_id INTEGER NOT NULL,
                tipo TEXT NOT NULL CHECK (tipo IN ('BOLETA', 'FACTURA')),
                serie TEXT,
                numero INTEGER,
                cliente_documento TEXT,
                cliente_nombre TEXT,
                estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'ERROR')),
                mensaje_sunat TEXT,
                enlace_pdf TEXT,
                enlace_xml TEXT,
                enlace_cdr TEXT,
                external_id TEXT,
                hash TEXT,
                fecha_emision TEXT DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (venta_id) REFERENCES ventas(id)
            )",
            [],
        )?;
        conn.execute("CREATE INDEX idx_comprobantes_venta ON comprobantes_electronicos(venta_id)", [])?;
        println!("Tabla comprobantes_electronicos creada");
    }

    // 🆕 Migración: columna modo_negocio en configuracion_tienda (ROPA / MINIMARKET)
    let has_modo_negocio: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='modo_negocio'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_modo_negocio {
        println!("Agregando columna modo_negocio...");
        // DEFAULT 'MINIMARKET': el sistema opera con un único rubro (Lubricentro), que
        // reutiliza internamente la lógica de "MINIMARKET" (venta por unidad/medida, sin tallas)
                conn.execute("ALTER TABLE configuracion_tienda ADD COLUMN modo_negocio TEXT DEFAULT 'LUBRICENTRO'", [])?;
        println!("Columna modo_negocio agregada");
    }

    // Migración: columna viscosidad en productos (grado SAE, ej. '20W-50'). Solo aplica a
    // aceites/lubricantes; el resto de productos la dejan vacía.
    let has_viscosidad: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('productos') WHERE name='viscosidad'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_viscosidad {
        println!("Agregando columna viscosidad...");
        conn.execute("ALTER TABLE productos ADD COLUMN viscosidad TEXT", [])?;
        println!("Columna viscosidad agregada");
    }

    // 🆕 Migración: columna modo_negocio_configurado (para el wizard de primer arranque)
    let has_modo_negocio_configurado: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('configuracion_tienda') WHERE name='modo_negocio_configurado'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_modo_negocio_configurado {
        println!("Agregando columna modo_negocio_configurado...");
        // DEFAULT 1: instalaciones que ya existían antes de este cambio no deben ver el wizard
        // (ya estaban operando; solo las instalaciones 100% nuevas, creadas vía schema_sqlite.sql, arrancan en 0)
        conn.execute("ALTER TABLE configuracion_tienda ADD COLUMN modo_negocio_configurado INTEGER DEFAULT 1", [])?;
        println!("Columna modo_negocio_configurado agregada");
    }

    // 🆕 Migración: sincronizar horarios de turnos_configuracion con lo que muestra
    // el modal "Abrir Caja" en el frontend (antes estaban desincronizados: la base
    // tenía Mañana 07-12/Tarde 12-17/Noche 17-22, mientras la pantalla mostraba
    // Mañana 08-14/Tarde 14-22/Noche 22-06 — por eso marcaba "llegó tarde" mal).
    // Se actualiza siempre (no solo en instalaciones nuevas) porque son horarios
    // de fábrica, no datos que el usuario haya personalizado.
    let turnos_desincronizados: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM turnos_configuracion WHERE nombre = 'NOCHE' AND hora_inicio_esperada != '22:00:00'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if turnos_desincronizados {
        println!("Sincronizando horarios de turnos con el frontend...");
        conn.execute_batch(r#"
            UPDATE turnos_configuracion SET hora_inicio_esperada = '08:00:00', hora_fin_esperada = '14:00:00' WHERE nombre = 'MAÑANA';
            UPDATE turnos_configuracion SET hora_inicio_esperada = '14:00:00', hora_fin_esperada = '22:00:00' WHERE nombre = 'TARDE';
            UPDATE turnos_configuracion SET hora_inicio_esperada = '22:00:00', hora_fin_esperada = '06:00:00' WHERE nombre = 'NOCHE';
        "#)?;
        println!("Horarios de turnos sincronizados");
    }

    // 🆕 Migración: cerrar el hueco 06:00-08:00 que quedaba sin cubrir por ningún
    // turno (necesario para poder bloquear "solo se puede abrir el turno que
    // corresponde a la hora actual" sin dejar horas muertas sin turno válido).
    let manana_con_hueco: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM turnos_configuracion WHERE nombre = 'MAÑANA' AND hora_inicio_esperada = '08:00:00'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if manana_con_hueco {
        println!("Cerrando hueco horario 06:00-08:00...");
        conn.execute(
            "UPDATE turnos_configuracion SET hora_inicio_esperada = '06:00:00' WHERE nombre = 'MAÑANA'",
            [],
        )?;
        println!("Hueco horario cerrado");
    }

    // 🔒 Migración de seguridad: los hashes sembrados originalmente eran de
    // relleno (no correspondían a ninguna contraseña real) porque el login
    // nunca validó la contraseña hasta ahora. Si una instalación existente
    // todavía tiene ese hash exacto (o sea, nunca cambió la contraseña desde
    // Configuración), se reemplaza por uno real y verificado.
    let migraciones_password: [(&str, &str, &str); 3] = [
        ("admin",       "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5aeP7QX2zKxJa", "$2b$12$mGLz/PA90wpJCJq.nFrBUeDhHFzjFdZE5bGanh/YGoKxBjDJbJbpC"),
        ("cajero",      "$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", "$2b$12$4HKxiG5rPcijikGrlyc2qOdRvlLsn7GNClq1FpXuNZOx8C.a3Ne.C"),
        ("almacenista", "$2b$12$VXB9VGFclb2Zr7zRvfVUJOWvH5m.RLqTl/xkX0Vr7Q8RJ0KRQ7v0K", "$2b$12$oWJoeuWj3BvBwu20koXzXOqFGccaMduytF03Q1812mPeg60q/1HQC"),
    ];
    for (username, hash_viejo, hash_nuevo) in migraciones_password.iter() {
        let actualizado = conn.execute(
            "UPDATE usuarios SET password_hash = ? WHERE username = ? AND password_hash = ?",
            params![hash_nuevo, username, hash_viejo],
        ).unwrap_or(0);
        if actualizado > 0 {
            println!("Contraseña de fábrica de '{}' actualizada a un hash real", username);
        }
    }

    // =====================================================
    // Migración: agregar 'GALON' y 'METRO' al CHECK de unidad_medida
    // en productos. SQLite no permite modificar un CHECK existente con
    // ALTER TABLE, así que hay que recrear la tabla completa,
    // preservando todos los productos ya guardados.
    // =====================================================
    let sql_productos: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='productos'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_default();

if !sql_productos.contains("'METRO'") {
        println!("Actualizando restricción de unidad_medida en productos (agregando GALON y METRO)...");

        // Guardamos el SQL exacto de TODOS los triggers que existan ahora mismo,
        // sean los que sean — así no hace falta saber de antemano cuáles
        // mencionan "productos". Los recreamos tal cual, al final.
        let triggers_sql: Vec<String> = {
            let mut stmt = conn.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL")?;
            let filas = stmt.query_map([], |row| row.get::<_, String>(0))?;
            filas.filter_map(|r| r.ok()).collect()
        };
        let triggers_nombres: Vec<String> = {
            let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='trigger'")?;
            let filas = stmt.query_map([], |row| row.get::<_, String>(0))?;
            filas.filter_map(|r| r.ok()).collect()
        };

        conn.execute_batch("PRAGMA foreign_keys=OFF; BEGIN TRANSACTION;")?;

        for nombre in &triggers_nombres {
            conn.execute(&format!("DROP TRIGGER IF EXISTS {}", nombre), [])?;
        }

        conn.execute_batch(
            "CREATE TABLE productos_nueva (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               codigo TEXT NOT NULL UNIQUE,
               nombre TEXT NOT NULL,
               descripcion TEXT,
               precio REAL NOT NULL CHECK (precio > 0),
               stock REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
               stock_minimo REAL DEFAULT 5,
               unidad_medida TEXT NOT NULL DEFAULT 'UNIDAD' CHECK (unidad_medida IN ('UNIDAD', 'KG', 'GRAMO', 'LITRO', 'ML', 'GALON', 'METRO')),
               viscosidad TEXT,
               categoria_id INTEGER NOT NULL,
               descuento_porcentaje REAL DEFAULT 0,
               tiene_variantes INTEGER DEFAULT 0,
               lleva_vencimiento INTEGER DEFAULT 0,
               imagen_url TEXT,
               activo INTEGER DEFAULT 1,
               fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
               fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime')),
               FOREIGN KEY (categoria_id) REFERENCES categorias(id)
             );

             INSERT INTO productos_nueva (
               id, codigo, nombre, descripcion, precio, stock, stock_minimo,
               unidad_medida, viscosidad, categoria_id, descuento_porcentaje,
               tiene_variantes, lleva_vencimiento, imagen_url, activo,
               fecha_creacion, fecha_actualizacion
             )
             SELECT
               id, codigo, nombre, descripcion, precio, stock, stock_minimo,
               unidad_medida, viscosidad, categoria_id, descuento_porcentaje,
               tiene_variantes, lleva_vencimiento, imagen_url, activo,
               fecha_creacion, fecha_actualizacion
             FROM productos;

             DROP TABLE productos;
             ALTER TABLE productos_nueva RENAME TO productos;

             CREATE INDEX idx_productos_codigo ON productos(codigo);
             CREATE INDEX idx_productos_nombre ON productos(nombre);"
        )?;

        // Recrear cada trigger, exactamente con el mismo SQL que tenía antes
        for trigger_sql in &triggers_sql {
            conn.execute(trigger_sql, [])?;
        }

     conn.execute_batch("COMMIT; PRAGMA foreign_keys=ON;")?;
        println!("Restricción de unidad_medida actualizada (GALON y METRO agregados) — {} triggers restaurados", triggers_sql.len());
    }

    // =====================================================
    // 🆕 Migración: columna precio_compra en productos
    // Guarda el costo de compra del producto — se puede editar a mano
    // desde Inventario, pero al confirmar la recepción de una compra real
    // desde Proveedores, ese valor manda y sobreescribe lo que hubiera.
    // =====================================================
    let has_precio_compra: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('productos') WHERE name='precio_compra'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_precio_compra {
        println!("Agregando columna precio_compra a productos...");
        conn.execute("ALTER TABLE productos ADD COLUMN precio_compra REAL DEFAULT 0", [])?;
        println!("Columna precio_compra agregada");
    }

    // =====================================================
    // 🆕 Migración: quitar el CHECK de turnos fijos en `cajas`
    // Antes: turno solo podía ser 'MAÑANA' / 'TARDE' / 'NOCHE', ligado a
    // horarios fijos. Ahora el negocio trabaja un solo horario (8am-8pm)
    // y la caja se abre/cierra en cualquier momento — `turno` pasa a
    // guardarse fijo como 'GENERAL', sin restricción de valor.
    //
    // No hay ningún trigger definido directamente ON cajas (los que la
    // tocan están en ventas, devoluciones y movimientos_caja, y solo la
    // referencian por nombre — no hace falta tocarlos).
    // =====================================================
    if let Err(e) = crate::commands::cajas::migrar_cajas_sin_turno_fijo(&conn) {
        // 🆕 Bloqueante a propósito: si esta migración falla, la app NO debe
        // arrancar con el esquema a medio migrar (eso generaría errores
        // confusos más tarde, en pleno uso, al intentar abrir caja). Mejor
        // que falle fuerte y claro acá mismo, al inicio.
        panic!("Migración crítica de cajas falló, la app no puede continuar: {}", e);
    }

    // =====================================================
    // 🆕 Migración: tabla clientes
    // Registro de clientes fijos del lubricentro, para reutilizar sus
    // datos al emitir boleta/factura/comprobante sin volver a escribirlos.
    // =====================================================
    let has_clientes: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='clientes'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_clientes {
        println!("Creando tabla clientes...");
        conn.execute_batch(
            "CREATE TABLE clientes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                tipo_documento TEXT DEFAULT 'DNI' CHECK(tipo_documento IN ('DNI', 'RUC', 'NINGUNO')),
                numero_documento TEXT,
                telefono TEXT,
                email TEXT,
                direccion TEXT,
                placa TEXT,
                notas TEXT,
                activo INTEGER DEFAULT 1,
                fecha_creacion TEXT DEFAULT (datetime('now', 'localtime')),
                fecha_actualizacion TEXT DEFAULT (datetime('now', 'localtime'))
             );
             CREATE INDEX idx_clientes_nombre ON clientes(nombre);
             CREATE INDEX idx_clientes_documento ON clientes(numero_documento);
             CREATE INDEX idx_clientes_activo ON clientes(activo);"
        )?;
        println!("Tabla clientes creada");
    }

    // 🆕 Migración: columna placa en clientes (placa del vehículo del cliente,
    // para no tener que volver a escribirla cada vez que vuelve al lubricentro
    // y se le emite boleta/factura). Additive — instalaciones que ya tenían la
    // tabla clientes (sin esta columna) la reciben acá.
    let has_placa_cliente: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('clientes') WHERE name='placa'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_placa_cliente {
        println!("Agregando columna placa a clientes...");
        conn.execute("ALTER TABLE clientes ADD COLUMN placa TEXT", [])?;
        println!("Columna placa agregada");
    }

    // 🆕 Migración: columna cliente_id en comprobantes_electronicos (referencia
    // opcional al cliente guardado que se usó para emitir el comprobante)
    let has_cliente_id_comprobante: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('comprobantes_electronicos') WHERE name='cliente_id'",
            [],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if !has_cliente_id_comprobante {
        println!("Agregando columna cliente_id a comprobantes_electronicos...");
        conn.execute("ALTER TABLE comprobantes_electronicos ADD COLUMN cliente_id INTEGER", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_comprobantes_cliente ON comprobantes_electronicos(cliente_id)", [])?;
        println!("Columna cliente_id agregada");
    }

    // 🆕 Migración: columnas de la respuesta de FacturaLibre en comprobantes_electronicos
    // (external_id para reenvíos/consultas, hash del comprobante, y el link al CDR)
    for (columna, tipo) in [("external_id", "TEXT"), ("hash", "TEXT"), ("enlace_cdr", "TEXT")] {
        let existe: bool = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM pragma_table_info('comprobantes_electronicos') WHERE name='{}'", columna),
                [],
                |row| Ok(row.get::<_, i32>(0)? > 0),
            )
            .unwrap_or(false);

        if !existe {
            println!("Agregando columna {} a comprobantes_electronicos...", columna);
            conn.execute(
                &format!("ALTER TABLE comprobantes_electronicos ADD COLUMN {} {}", columna, tipo),
                [],
            )?;
            println!("Columna {} agregada", columna);
        }
    }

    println!("Base de datos actualizada");
    Ok(())
}

pub fn default_database_path() -> String {
    get_database_path().to_str().unwrap().to_string()
}

pub fn test_connection(db_path: &str) -> Result<bool> {
    let conn = Connection::open(db_path)?;
    let result: i32 = conn.query_row("SELECT 1", [], |row| row.get(0))?;
    Ok(result == 1)
}

pub fn setup_database() -> Result<String> {
    println!("Configurando base de datos...");
    migrate_database_if_needed();
    let db_path = get_database_path();
    let db_path_str = db_path.to_str().unwrap();
    println!("Ruta de base de datos: {}", db_path_str);

    if !database_exists(db_path_str) {
        println!("Base de datos no existe, inicializando...");
        initialize_database(db_path_str)?;
    } else {
        println!("Base de datos encontrada");
        run_migrations(db_path_str)?;
    }

    match test_connection(db_path_str) {
        Ok(true) => println!("Conexion a base de datos exitosa"),
        Ok(false) => eprintln!("Advertencia: Prueba de conexion fallo"),
        Err(e) => eprintln!("Error de conexion: {}", e),
    }

    Ok(db_path_str.to_string())
}