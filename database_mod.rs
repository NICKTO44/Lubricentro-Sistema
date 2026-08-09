// database/mod.rs
// Módulo de base de datos

pub mod connection;

pub use connection::{DatabasePool, create_database_url, default_database_url, test_connection};
