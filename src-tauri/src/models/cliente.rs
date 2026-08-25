// models/cliente.rs
// Modelo de Clientes — clientes fijos del lubricentro, para reutilizar sus
// datos (DNI/RUC, nombre, contacto) al emitir boleta, factura o comprobante
// de venta sin tener que volver a escribirlos cada vez.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Cliente {
    pub id: i32,
    pub nombre: String,
    pub tipo_documento: String,
    pub numero_documento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub notas: Option<String>,
    pub activo: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClienteNuevo {
    pub nombre: String,
    pub tipo_documento: Option<String>,
    pub numero_documento: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClienteResponse {
    pub success: bool,
    pub message: String,
    pub cliente: Option<Cliente>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClientesResponse {
    pub success: bool,
    pub clientes: Vec<Cliente>,
}