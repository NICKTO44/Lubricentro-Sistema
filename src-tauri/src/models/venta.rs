// models/venta.rs
// Modelo de Venta

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Venta {
    pub id: i32,
    pub folio: String,
    pub fecha_hora: String,
    pub subtotal: f64,
    pub descuento: f64,
    pub total: f64,
    pub metodo_pago: String,
    pub monto_recibido: Option<f64>,
    pub cambio: Option<f64>,
    pub usuario_id: i32,
    pub estado: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DetalleVenta {
    pub producto_id: i32,
    pub cantidad: f64,
    pub precio_unitario: f64,
    pub subtotal: f64,
    pub descuento_linea: f64,
    pub total_linea: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VentaNueva {
    pub subtotal: f64,
    pub descuento: f64,
    pub total: f64,
    pub metodo_pago: String,
    pub monto_recibido: Option<f64>,
    pub cambio: Option<f64>,
    pub usuario_id: i32,
    pub detalles: Vec<DetalleVenta>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VentaResponse {
    pub success: bool,
    pub message: String,
    pub venta: Option<Venta>,
    pub folio: Option<String>,
}