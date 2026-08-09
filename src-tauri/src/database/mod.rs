// database/mod.rs
// Módulo de base de datos

pub mod connection;

pub use connection::{DatabasePool, default_database_path, database_exists, initialize_database, test_connection};