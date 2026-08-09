// commands/productos.rs
// Comandos de productos con soporte de variantes/tallas

use rusqlite::OptionalExtension;
use crate::database::DatabasePool;
use crate::models::{Producto, ProductoNuevo, ProductoResponse, ProductosResponse};
use crate::models::producto::{ProductoVariante, ProductoConVariantes, VarianteInput};
use rusqlite::params;

// =====================================================
// COMANDO: Obtener todos los productos
// =====================================================
#[tauri::command]
pub fn obtener_productos(db: tauri::State<'_, DatabasePool>) -> ProductosResponse {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            p.id, p.codigo, p.nombre, p.descripcion, p.precio, 
            p.stock, p.stock_minimo, p.unidad_medida, p.categoria_id, c.nombre as categoria_nombre, 
            p.descuento_porcentaje, p.tiene_variantes, p.activo, p.imagen_url, p.lleva_vencimiento, p.viscosidad
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.activo = 1
        ORDER BY p.nombre
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(_) => return ProductosResponse { success: false, productos: vec![] },
    };

    let productos_iter = stmt.query_map([], |row| {
        Ok(Producto {
            id: row.get(0)?,
            codigo: row.get(1)?,
            nombre: row.get(2)?,
            descripcion: row.get(3)?,
            precio: row.get(4)?,
            stock: row.get(5)?,
            stock_minimo: row.get(6)?,
            unidad_medida: row.get(7)?,
            categoria_id: row.get(8)?,
            categoria_nombre: row.get(9)?,
            descuento_porcentaje: row.get(10)?,
            tiene_variantes: row.get::<_, i32>(11)? == 1,
            activo: row.get::<_, i32>(12)? == 1,
            imagen_url: row.get(13)?,
            lleva_vencimiento: row.get::<_, i32>(14)? == 1,
            viscosidad: row.get(15)?,
        })
    });

    match productos_iter {
        Ok(iter) => ProductosResponse {
            success: true,
            productos: iter.filter_map(|r| r.ok()).collect(),
        },
        Err(_) => ProductosResponse { success: false, productos: vec![] },
    }
}

// =====================================================
// COMANDO: Buscar producto por código
// =====================================================
#[tauri::command]
pub fn buscar_producto_por_codigo(
    db: tauri::State<'_, DatabasePool>,
    codigo: String,
) -> ProductoResponse {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            p.id, p.codigo, p.nombre, p.descripcion, p.precio, 
            p.stock, p.stock_minimo, p.unidad_medida, p.categoria_id, c.nombre as categoria_nombre, 
            p.descuento_porcentaje, p.tiene_variantes, p.activo, p.imagen_url, p.lleva_vencimiento, p.viscosidad
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.codigo = ? AND p.activo = 1
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(e) => return ProductoResponse {
            success: false,
            message: format!("Error al preparar consulta: {}", e),
            producto: None,
        },
    };

    let result = stmt.query_row([codigo], |row| {
        Ok(Producto {
            id: row.get(0)?,
            codigo: row.get(1)?,
            nombre: row.get(2)?,
            descripcion: row.get(3)?,
            precio: row.get(4)?,
            stock: row.get(5)?,
            stock_minimo: row.get(6)?,
            unidad_medida: row.get(7)?,
            categoria_id: row.get(8)?,
            categoria_nombre: row.get(9)?,
            descuento_porcentaje: row.get(10)?,
            tiene_variantes: row.get::<_, i32>(11)? == 1,
            activo: row.get::<_, i32>(12)? == 1,
            imagen_url: row.get(13)?,
            lleva_vencimiento: row.get::<_, i32>(14)? == 1,
            viscosidad: row.get(15)?,
        })
    }).optional();

    match result {
        Ok(Some(producto)) => ProductoResponse {
            success: true,
            message: "Producto encontrado".to_string(),
            producto: Some(producto),
        },
        Ok(None) => ProductoResponse {
            success: false,
            message: "Producto no encontrado".to_string(),
            producto: None,
        },
        Err(e) => ProductoResponse {
            success: false,
            message: format!("Error en consulta: {}", e),
            producto: None,
        },
    }
}

// =====================================================
// COMANDO: Agregar nuevo producto (con o sin variantes)
// =====================================================
#[tauri::command]
pub fn agregar_producto(
    db: tauri::State<'_, DatabasePool>,
    producto: ProductoNuevo,
) -> ProductoResponse {
    let conn = db.get_conn();

    let tiene_variantes = producto.tiene_variantes.unwrap_or(false);

    // Si tiene variantes el stock inicial es 0 (lo calculan los triggers)
    let stock_inicial = if tiene_variantes { 0.0 } else { producto.stock };

    let query = r"
        INSERT INTO productos (codigo, nombre, descripcion, precio, stock, stock_minimo, unidad_medida, categoria_id, descuento_porcentaje, tiene_variantes, imagen_url, lleva_vencimiento, viscosidad)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ";

    let result = conn.execute(
        query,
        params![
            &producto.codigo,
            &producto.nombre,
            &producto.descripcion,
            producto.precio,
            stock_inicial,
            producto.stock_minimo,
            &producto.unidad_medida,
            producto.categoria_id,
            producto.descuento_porcentaje.unwrap_or(0.0),
            if tiene_variantes { 1 } else { 0 },
            &producto.imagen_url,
            if producto.lleva_vencimiento { 1 } else { 0 },
            &producto.viscosidad,
        ],
    );

    match result {
        Ok(_) => {
            let producto_id = conn.last_insert_rowid() as i32;

            // Si tiene variantes, insertarlas
            if tiene_variantes {
                if let Some(variantes) = &producto.variantes {
                    if let Err(e) = insertar_variantes(&conn, producto_id, variantes) {
                        return ProductoResponse {
                            success: false,
                            message: format!("Producto creado pero error al insertar tallas: {}", e),
                            producto: None,
                        };
                    }
                }
            }

            ProductoResponse {
                success: true,
                message: "Producto agregado exitosamente".to_string(),
                producto: None,
            }
        }
        Err(e) => ProductoResponse {
            success: false,
            message: format!("Error al agregar producto: {}", e),
            producto: None,
        },
    }
}

// =====================================================
// 🆕 COMANDO: Eliminar un producto recién creado, solo si nunca se usó
// (pensado para cuando se crea un producto desde "Nueva Compra" y
// después se cancela esa compra sin llegar a registrarla)
// =====================================================
#[tauri::command]
pub fn eliminar_producto_si_sin_uso(
    db: tauri::State<DatabasePool>,
    producto_id: i32,
) -> Result<bool, String> {
    let conn = db.get_conn();

    let usado_en_ventas: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM detalles_venta WHERE producto_id = ?",
            params![producto_id],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(true); // ante la duda, no borrar

    let usado_en_compras: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM detalles_compra WHERE producto_id = ?",
            params![producto_id],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(true);

    if usado_en_ventas || usado_en_compras {
        return Ok(false); // ya tiene historial real, no se toca
    }

    conn.execute("DELETE FROM producto_variantes WHERE producto_id = ?", params![producto_id]).ok();
    let borrado = conn.execute("DELETE FROM productos WHERE id = ?", params![producto_id]);

    Ok(borrado.is_ok())
}

// =====================================================
// COMANDO: Actualizar producto (con o sin variantes)
// =====================================================
// =====================================================
// 🆕 COMANDO: Agregar una talla nueva a un producto que ya existe
// (sin tocar ni desactivar las tallas que ya tenía — útil desde
// Proveedores, cuando llega una talla nueva que antes no se manejaba)
// =====================================================
#[tauri::command]
pub fn agregar_talla_a_producto(
    db: tauri::State<DatabasePool>,
    producto_id: i32,
    talla: String,
    stock_inicial: f64,
    stock_minimo: Option<f64>,
    precio: Option<f64>,
) -> ProductoResponse {
    let conn = db.get_conn();

    let ya_existe: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM producto_variantes WHERE producto_id = ? AND talla = ? AND activo = 1",
            params![producto_id, &talla],
            |row| Ok(row.get::<_, i32>(0)? > 0),
        )
        .unwrap_or(false);

    if ya_existe {
        return ProductoResponse {
            success: false,
            message: format!("La talla {} ya existe para este producto", talla),
            producto: None,
        };
    }

    let resultado = conn.execute(
        "INSERT INTO producto_variantes (producto_id, talla, stock, stock_minimo, precio)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(producto_id, talla) DO UPDATE SET
           stock = excluded.stock,
           stock_minimo = excluded.stock_minimo,
           precio = excluded.precio,
           activo = 1,
           fecha_actualizacion = datetime('now', 'localtime')",
        params![producto_id, &talla, stock_inicial, stock_minimo.unwrap_or(2.0), precio],
    );

    match resultado {
        Ok(_) => ProductoResponse {
            success: true,
            message: format!("Talla {} agregada correctamente", talla),
            producto: None,
        },
        Err(e) => ProductoResponse {
            success: false,
            message: format!("Error al agregar la talla: {}", e),
            producto: None,
        },
    }
}

#[tauri::command]
pub fn actualizar_producto(
    db: tauri::State<'_, DatabasePool>,
    producto_id: i32,
    codigo: String,
    nombre: String,
    descripcion: Option<String>,
    precio: f64,
    stock: f64,
    stock_minimo: f64,
    unidad_medida: String,
    categoria_id: i32,
    descuento_porcentaje: Option<f64>,
    tiene_variantes: Option<bool>,
    variantes: Option<Vec<VarianteInput>>,
    imagen_url: Option<String>,
    lleva_vencimiento: Option<bool>, // 🆕
    viscosidad: Option<String>,
) -> ProductoResponse {
    let conn = db.get_conn();

    let con_variantes = tiene_variantes.unwrap_or(false);

    // Si tiene variantes el stock lo calculan los triggers automáticamente
    let stock_a_guardar = if con_variantes { 
        // Obtener el stock actual calculado
        conn.query_row(
            "SELECT stock FROM productos WHERE id = ?",
            params![producto_id],
            |row| row.get::<_, f64>(0),
        ).unwrap_or(0.0)
    } else { 
        stock 
    };

    let query = r"
        UPDATE productos 
        SET codigo = ?, nombre = ?, descripcion = ?, precio = ?,
            stock = ?, stock_minimo = ?, unidad_medida = ?, categoria_id = ?,
            descuento_porcentaje = ?, tiene_variantes = ?, imagen_url = ?,
            lleva_vencimiento = ?, viscosidad = ?,
            fecha_actualizacion = datetime('now', 'localtime')
        WHERE id = ?
    ";

    let result = conn.execute(
        query,
        params![
            &codigo, &nombre, &descripcion, precio,
            stock_a_guardar, stock_minimo, &unidad_medida, categoria_id,
            descuento_porcentaje.unwrap_or(0.0),
            if con_variantes { 1 } else { 0 },
            &imagen_url,
            if lleva_vencimiento.unwrap_or(false) { 1 } else { 0 },
            &viscosidad,
            producto_id,
        ],
    );

    match result {
        Ok(_) => {
            // Actualizar variantes si tiene
            if con_variantes {
                if let Some(vars) = &variantes {
                    if let Err(e) = actualizar_variantes(&conn, producto_id, vars) {
                        return ProductoResponse {
                            success: false,
                            message: format!("Producto actualizado pero error en tallas: {}", e),
                            producto: None,
                        };
                    }
                }
            }

            ProductoResponse {
                success: true,
                message: "Producto actualizado exitosamente".to_string(),
                producto: None,
            }
        }
        Err(e) => ProductoResponse {
            success: false,
            message: format!("Error al actualizar producto: {}", e),
            producto: None,
        },
    }
}

// =====================================================
// COMANDO: Obtener productos con stock bajo
// =====================================================
#[tauri::command]
pub fn obtener_productos_stock_bajo(db: tauri::State<'_, DatabasePool>) -> ProductosResponse {
    let conn = db.get_conn();

    let query = r"
        SELECT 
            p.id, p.codigo, p.nombre, p.stock, p.stock_minimo, p.unidad_medida, c.nombre as categoria,
            (p.stock - p.stock_minimo) as diferencia
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.activo = 1 AND p.stock <= p.stock_minimo
        ORDER BY diferencia, p.nombre
    ";

    let mut stmt = match conn.prepare(query) {
        Ok(s) => s,
        Err(_) => return ProductosResponse { success: false, productos: vec![] },
    };

    let productos_iter = stmt.query_map([], |row| {
        Ok(Producto {
            id: row.get(0)?,
            codigo: row.get(1)?,
            nombre: row.get(2)?,
            descripcion: None,
            precio: 0.0,
            stock: row.get(3)?,
            stock_minimo: row.get(4)?,
            unidad_medida: row.get(5)?,
            categoria_id: 0,
            categoria_nombre: row.get::<_, Option<String>>(6)?,
            descuento_porcentaje: 0.0,
            tiene_variantes: false,
             activo: true,
            imagen_url: None,
            lleva_vencimiento: false,
            viscosidad: None,
        })
    });

    match productos_iter {
        Ok(iter) => ProductosResponse {
            success: true,
            productos: iter.filter_map(|r| r.ok()).collect(),
        },
        Err(_) => ProductosResponse { success: false, productos: vec![] },
    }
}

// =====================================================
// COMANDO: Obtener categorías
// =====================================================
#[tauri::command]
pub fn obtener_categorias(db: tauri::State<'_, DatabasePool>) -> Result<Vec<(i32, String)>, String> {
    let conn = db.get_conn();

    let mut stmt = conn
        .prepare("SELECT id, nombre FROM categorias WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let categorias_iter = stmt
        .query_map([], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| format!("Error al obtener categorías: {}", e))?;

    Ok(categorias_iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// COMANDO: Obtener categorías con tipo_talla
// 🆕 Necesario para mostrar tallas correctas según categoría
// =====================================================
#[tauri::command]
pub fn obtener_categorias_con_tipo(db: tauri::State<'_, DatabasePool>) -> Result<Vec<(i32, String, String)>, String> {
    let conn = db.get_conn();

    let mut stmt = conn
        .prepare("SELECT id, nombre, tipo_talla FROM categorias WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let iter = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("Error: {}", e))?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// COMANDO: Obtener solo nombres de categorías
// =====================================================
#[tauri::command]
pub fn obtener_nombres_categorias(db: tauri::State<'_, DatabasePool>) -> Result<Vec<String>, String> {
    let conn = db.get_conn();

    let mut stmt = conn
        .prepare("SELECT nombre FROM categorias WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let iter = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Error al obtener categorías: {}", e))?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// COMANDO: Buscar productos con filtros
// =====================================================
#[tauri::command]
pub fn buscar_productos_filtrado(
    db: tauri::State<'_, DatabasePool>,
    termino: String,
    categoria: Option<String>,
) -> Result<Vec<Producto>, String> {
    let conn = db.get_conn();

    let mut query = String::from(r"
        SELECT 
            p.id, p.codigo, p.nombre, p.descripcion, p.precio, 
            p.stock, p.stock_minimo, p.unidad_medida, p.categoria_id, c.nombre as categoria_nombre, 
            p.descuento_porcentaje, p.tiene_variantes, p.activo, p.imagen_url, p.lleva_vencimiento, p.viscosidad
        FROM productos p
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE p.activo = 1 AND p.stock > 0
    ");

    let mut conditions = Vec::new();

    if !termino.is_empty() {
        conditions.push(format!(
            "(p.nombre LIKE '%{}%' OR p.codigo LIKE '%{}%')",
            termino, termino
        ));
    }

    if let Some(cat) = categoria {
        if !cat.is_empty() && cat != "TODAS" {
            conditions.push(format!("c.nombre = '{}'", cat));
        }
    }

    if !conditions.is_empty() {
        query.push_str(" AND ");
        query.push_str(&conditions.join(" AND "));
    }

    query.push_str(" ORDER BY p.nombre LIMIT 100");

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Error al preparar consulta: {}", e))?;

    let iter = stmt
        .query_map([], |row| {
            Ok(Producto {
                id: row.get(0)?,
                codigo: row.get(1)?,
                nombre: row.get(2)?,
                descripcion: row.get(3)?,
                precio: row.get(4)?,
                stock: row.get(5)?,
                stock_minimo: row.get(6)?,
                unidad_medida: row.get(7)?,
                categoria_id: row.get(8)?,
                categoria_nombre: row.get(9)?,
                descuento_porcentaje: row.get(10)?,
                tiene_variantes: row.get::<_, i32>(11)? == 1,
                activo: row.get::<_, i32>(12)? == 1,
                imagen_url: row.get(13)?,
                lleva_vencimiento: row.get::<_, i32>(14)? == 1,
            viscosidad: row.get(15)?,
            })
        })
        .map_err(|e| format!("Error al ejecutar consulta: {}", e))?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// 🆕 COMANDO: Obtener variantes de un producto
// =====================================================
#[tauri::command]
pub fn obtener_variantes_producto(
    db: tauri::State<'_, DatabasePool>,
    producto_id: i32,
) -> Result<Vec<ProductoVariante>, String> {
    let conn = db.get_conn();

    let mut stmt = conn
        .prepare(
            r"SELECT id, producto_id, talla, stock, stock_minimo, precio, activo
              FROM producto_variantes
              WHERE producto_id = ? AND activo = 1
              ORDER BY talla"
        )
        .map_err(|e| format!("Error: {}", e))?;

    let iter = stmt
        .query_map(params![producto_id], |row| {
            Ok(ProductoVariante {
                id: row.get(0)?,
                producto_id: row.get(1)?,
                talla: row.get(2)?,
                stock: row.get(3)?,
                stock_minimo: row.get(4)?,
                precio: row.get(5)?,
                activo: row.get::<_, i32>(6)? == 1,
            })
        })
        .map_err(|e| format!("Error al obtener variantes: {}", e))?;

    Ok(iter.filter_map(|r| r.ok()).collect())
}

// =====================================================
// 🆕 COMANDO: Obtener producto con sus variantes
// =====================================================
#[tauri::command]
pub fn obtener_producto_con_variantes(
    db: tauri::State<'_, DatabasePool>,
    producto_id: i32,
) -> Result<ProductoConVariantes, String> {
    let conn = db.get_conn();

    let producto = conn.query_row(
        r"SELECT p.id, p.codigo, p.nombre, p.descripcion, p.precio,
                 p.stock, p.stock_minimo, p.unidad_medida, p.categoria_id, c.nombre,
                 p.descuento_porcentaje, p.tiene_variantes, p.activo, p.imagen_url, p.lleva_vencimiento, p.viscosidad
          FROM productos p
          LEFT JOIN categorias c ON c.id = p.categoria_id
          WHERE p.id = ?",
        params![producto_id],
        |row| {
            Ok(Producto {
                id: row.get(0)?,
                codigo: row.get(1)?,
                nombre: row.get(2)?,
                descripcion: row.get(3)?,
                precio: row.get(4)?,
                stock: row.get(5)?,
                stock_minimo: row.get(6)?,
                unidad_medida: row.get(7)?,
                categoria_id: row.get(8)?,
                categoria_nombre: row.get(9)?,
                descuento_porcentaje: row.get(10)?,
                tiene_variantes: row.get::<_, i32>(11)? == 1,
                activo: row.get::<_, i32>(12)? == 1,
                imagen_url: row.get(13)?,
                lleva_vencimiento: row.get::<_, i32>(14)? == 1,
            viscosidad: row.get(15)?,
            })
        },
    )
    .map_err(|e| format!("Producto no encontrado: {}", e))?;

    let mut stmt = conn
        .prepare(
            r"SELECT id, producto_id, talla, stock, stock_minimo, precio, activo
              FROM producto_variantes
              WHERE producto_id = ? AND activo = 1
              ORDER BY talla"
        )
        .map_err(|e| format!("Error: {}", e))?;

    let variantes: Vec<ProductoVariante> = stmt
        .query_map(params![producto_id], |row| {
            Ok(ProductoVariante {
                id: row.get(0)?,
                producto_id: row.get(1)?,
                talla: row.get(2)?,
                stock: row.get(3)?,
                stock_minimo: row.get(4)?,
                precio: row.get(5)?,
                activo: row.get::<_, i32>(6)? == 1,
            })
        })
        .map_err(|e| format!("Error al obtener variantes: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(ProductoConVariantes { producto, variantes })
}

// =====================================================
// FUNCIONES AUXILIARES (internas, no comandos Tauri)
// =====================================================

fn insertar_variantes(
    conn: &rusqlite::Connection,
    producto_id: i32,
    variantes: &[VarianteInput],
) -> Result<(), String> {
    for v in variantes {
        conn.execute(
            r"INSERT INTO producto_variantes (producto_id, talla, stock, stock_minimo, precio)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(producto_id, talla) DO UPDATE SET
                stock = excluded.stock,
                stock_minimo = excluded.stock_minimo,
                precio = excluded.precio,
                activo = 1,
                fecha_actualizacion = datetime('now', 'localtime')",
            params![
                producto_id,
                &v.talla,
                v.stock,
                v.stock_minimo.unwrap_or(2),
                v.precio,
            ],
        )
        .map_err(|e| format!("Error al insertar talla {}: {}", v.talla, e))?;
    }
    Ok(())
}

fn actualizar_variantes(
    conn: &rusqlite::Connection,
    producto_id: i32,
    variantes: &[VarianteInput],
) -> Result<(), String> {
    // Desactivar todas las variantes actuales primero
    conn.execute(
        "UPDATE producto_variantes SET activo = 0 WHERE producto_id = ?",
        params![producto_id],
    )
    .map_err(|e| format!("Error al desactivar variantes: {}", e))?;

    // Reinsertar/actualizar las que vienen en el request
    insertar_variantes(conn, producto_id, variantes)
}