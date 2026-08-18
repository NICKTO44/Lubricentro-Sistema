// main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod models;
mod commands;

use database::{DatabasePool, default_database_path, database_exists, initialize_database};
use commands::*;

fn main() {
    let db_path = match database::connection::setup_database() {
        Ok(path) => path,
        Err(e) => {
            eprintln!("❌ Error al configurar base de datos: {}", e);
            std::process::exit(1);
        }
    };

    if !database_exists(&db_path) {
        println!("📦 Base de datos no encontrada. Creando nueva base de datos...");
        match initialize_database(&db_path) {
            Ok(_) => println!("✅ Base de datos SQLite creada exitosamente en: {}", db_path),
            Err(e) => {
                eprintln!("❌ Error fatal al crear base de datos: {}", e);
                eprintln!("💡 Verifica permisos de escritura en el directorio");
                panic!("No se puede continuar sin base de datos");
            }
        }
    } else {
        println!("✅ Base de datos SQLite encontrada: {}", db_path);
    }

    let db_pool = match DatabasePool::new(&db_path) {
        Ok(pool) => {
            println!("✅ Conexión a SQLite establecida correctamente");
            pool
        }
        Err(e) => {
            eprintln!("❌ Error al conectar a la base de datos: {}", e);
            eprintln!("💡 Verifica que el archivo lubricentro.db no esté corrupto");
            panic!("No se puede continuar sin base de datos");
        }
    };

    tauri::Builder::default()
        .manage(db_pool)
        .invoke_handler(tauri::generate_handler![
            // Autenticación
            login,
            test_database_connection,

            // Productos
            obtener_productos,
            buscar_producto_por_codigo,
            agregar_producto,
            obtener_productos_stock_bajo,
            actualizar_producto,
            obtener_categorias,
            obtener_categorias_con_tipo,
            obtener_nombres_categorias,
            buscar_productos_filtrado,
            obtener_variantes_producto,
            obtener_producto_con_variantes,
            agregar_talla_a_producto,
            eliminar_producto_si_sin_uso,

            // Ventas
            procesar_venta,

            // Reportes
            obtener_ventas_rango,
            obtener_productos_mas_vendidos,
            obtener_estadisticas_ventas,
            obtener_ventas_hoy,
            obtener_estadisticas_con_devoluciones,

            // Configuración
            obtener_configuracion_tienda,
            actualizar_configuracion_tienda,
            guardar_token_nubefact,
            probar_credenciales_nubefact,
            emitir_comprobante_electronico,
            obtener_comprobantes_de_venta,
            abrir_url_externa,
            descargar_pdf_comprobante,
            agregar_lote_producto,
            obtener_lotes_de_producto,
            obtener_lotes_por_vencer,
            descartar_lote,
            agregar_categoria,
            actualizar_categoria,
            obtener_usuarios,
            obtener_roles,
            agregar_usuario,
            actualizar_usuario,
            necesita_elegir_modo_negocio,
            establecer_modo_negocio,

            // Devoluciones de clientes
            buscar_venta_para_devolucion,
            procesar_devolucion,

            // Licencias
            commands::licencias::obtener_estado_licencia,
            commands::licencias::verificar_licencia,
            commands::licencias::activar_licencia,
            commands::licencias::calcular_dias_restantes,
            commands::licencias::validar_codigo_activacion,
            commands::licencias::verificar_primera_vez,
            commands::licencias::marcar_primera_vez_vista,
            commands::licencias::obtener_info_debug_licencia,

            // Cajas
            abrir_caja,
            cerrar_caja,
            registrar_movimiento_efectivo,
            obtener_caja_abierta_usuario,
            verificar_caja_abierta_sistema,
            obtener_reporte_cierre,
            obtener_historial_cajas,
            obtener_detalle_caja,

            // Proveedores y Compras
            obtener_proveedores,
            agregar_proveedor,
            actualizar_proveedor,
            eliminar_proveedor,
            obtener_compras,
            obtener_detalle_compra,
            crear_compra,
            recibir_mercaderia,
            registrar_pago_compra,
            cancelar_compra,

            // Devoluciones a Proveedor
            registrar_devolucion_proveedor,
            resolver_devolucion_proveedor,
            obtener_devoluciones_proveedor,

            // 🆕 Impresora
            imprimir_boleta,
            probar_impresora,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}