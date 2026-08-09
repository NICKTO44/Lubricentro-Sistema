// models/proveedor.rs
// Modelos de Proveedores y Compras - v1.5

use serde::{Deserialize, Serialize};

// =====================================================
// PROVEEDOR
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Proveedor {
    pub id: i32,
    pub nombre: String,
    pub contacto: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub tipo_documento: String,
    pub numero_documento: Option<String>,
    pub banco: Option<String>,
    pub numero_cuenta: Option<String>,
    pub notas: Option<String>,
    pub total_compras: f64,
    pub credito_disponible: f64, // 🆕 v1.5 saldo a favor por devoluciones
    pub activo: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProveedorNuevo {
    pub nombre: String,
    pub contacto: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub direccion: Option<String>,
    pub tipo_documento: Option<String>,
    pub numero_documento: Option<String>,
    pub banco: Option<String>,
    pub numero_cuenta: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProveedorResponse {
    pub success: bool,
    pub message: String,
    pub proveedor: Option<Proveedor>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProveedoresResponse {
    pub success: bool,
    pub proveedores: Vec<Proveedor>,
}

// =====================================================
// COMPRA
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Compra {
    pub id: i32,
    pub folio: String,
    pub proveedor_id: i32,
    pub proveedor_nombre: Option<String>,
    pub fecha_compra: String,
    pub fecha_recepcion: Option<String>,
    pub subtotal: f64,
    pub descuento: f64,
    pub credito_aplicado: f64, // 🆕 v1.5
    pub total: f64,
    pub tipo_pago: String,
    pub monto_pagado: f64,
    pub saldo_pendiente: f64,
    pub fecha_vencimiento_pago: Option<String>,
    pub estado: String,
    pub estado_pago: String,
    pub factura_numero: Option<String>,
    pub notas: Option<String>,
    pub notas_recepcion: Option<String>,
    pub usuario_id: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetalleCompra {
    pub id: i32,
    pub compra_id: i32,
    pub producto_id: i32,
    pub producto_nombre: Option<String>,
    pub producto_codigo: Option<String>,
    pub variante_id: Option<i32>,
    pub talla: Option<String>,
    pub cantidad: f64,
    pub cantidad_recibida: f64,
    pub cantidad_conforme: f64,  // 🆕 v1.5 — llegó sano, sube stock
    pub precio_compra: f64,
    pub precio_venta_sugerido: Option<f64>,
    pub subtotal: f64,
}

// Request para crear nueva compra
#[derive(Debug, Serialize, Deserialize)]
pub struct NuevaCompraRequest {
    pub proveedor_id: i32,
    pub fecha_compra: String,
    pub tipo_pago: String,
    pub fecha_vencimiento_pago: Option<String>,
    pub descuento: Option<f64>,
    pub credito_aplicado: Option<f64>, // 🆕 v1.5
    pub factura_numero: Option<String>,
    pub notas: Option<String>,
    pub items: Vec<ItemCompra>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ItemCompra {
    pub producto_id: i32,
    pub variante_id: Option<i32>,
    pub talla: Option<String>,
    pub cantidad: f64,
    pub precio_compra: f64,
    pub precio_venta_sugerido: Option<f64>,
}

// Request para recibir mercadería
#[derive(Debug, Serialize, Deserialize)]
pub struct RecibirMercaderiaRequest {
    pub compra_id: i32,
    pub items: Vec<ItemRecepcion>,
    pub notas_recepcion: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ItemRecepcion {
    pub detalle_id: i32,
    pub cantidad_recibida: f64,
    pub cantidad_conforme: f64, // 🆕 v1.5 — lo sano que entra al stock
}

// Request para registrar pago
#[derive(Debug, Serialize, Deserialize)]
pub struct RegistrarPagoRequest {
    pub compra_id: i32,
    pub monto: f64,
    pub metodo_pago: String,
    pub referencia: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PagoCompra {
    pub id: i32,
    pub compra_id: i32,
    pub monto: f64,
    pub fecha_pago: String,
    pub metodo_pago: String,
    pub referencia: Option<String>,
    pub notas: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompraResponse {
    pub success: bool,
    pub message: String,
    pub compra_id: Option<i32>,
    pub folio: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ComprasResponse {
    pub success: bool,
    pub compras: Vec<Compra>,
}

// Detalle completo de una compra
#[derive(Debug, Serialize, Deserialize)]
pub struct CompraDetalle {
    pub compra: Compra,
    pub items: Vec<DetalleCompra>,
    pub pagos: Vec<PagoCompra>,
    pub devoluciones: Vec<DevolucionProveedor>, // 🆕 v1.5
}

// =====================================================
// DEVOLUCIONES A PROVEEDOR 🆕 v1.5
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevolucionProveedor {
    pub id: i32,
    pub compra_id: i32,
    pub proveedor_id: i32,
    pub proveedor_nombre: Option<String>,
    pub folio: String,
    pub fecha: String,
    pub motivo: String,
    pub detalle_motivo: Option<String>,
    pub monto_devolucion: f64,
    pub estado: String,
    pub tipo_resolucion: Option<String>,
    pub notas: Option<String>,
    pub fecha_resolucion: Option<String>,
    pub items: Vec<DetalleDevolucionProveedor>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DetalleDevolucionProveedor {
    pub id: i32,
    pub devolucion_proveedor_id: i32,
    pub detalle_compra_id: i32,
    pub producto_id: i32,
    pub producto_nombre: Option<String>,
    pub variante_id: Option<i32>,
    pub talla: Option<String>,
    pub cantidad_devuelta: i32,
    pub precio_compra: f64,
    pub subtotal: f64,
    pub motivo_item: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RegistrarDevolucionProveedorRequest {
    pub compra_id: i32,
    pub motivo: String,
    pub detalle_motivo: Option<String>,
    pub notas: Option<String>,
    pub items: Vec<ItemDevolucionProveedor>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ItemDevolucionProveedor {
    pub detalle_compra_id: i32,
    pub producto_id: i32,
    pub variante_id: Option<i32>,
    pub talla: Option<String>,
    pub cantidad_devuelta: i32,
    pub precio_compra: f64,
    pub motivo_item: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ResolverDevolucionRequest {
    pub devolucion_id: i32,
    pub estado: String,                  // ACEPTADA o RECHAZADA
    pub tipo_resolucion: Option<String>, // CREDITO, REEMBOLSO, CAMBIO
    pub notas: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DevolucionProveedorResponse {
    pub success: bool,
    pub message: String,
    pub devolucion_id: Option<i32>,
    pub folio: Option<String>,
    pub credito_disponible: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DevolucionesProveedorResponse {
    pub success: bool,
    pub devoluciones: Vec<DevolucionProveedor>,
}