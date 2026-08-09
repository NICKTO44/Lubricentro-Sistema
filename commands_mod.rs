// commands/mod.rs
// Módulo de comandos Tauri

pub mod auth;
pub mod productos;

pub use auth::{login, test_database_connection};
pub use productos::{
    obtener_productos, 
    buscar_producto_por_codigo, 
    agregar_producto,
    obtener_productos_stock_bajo
};
