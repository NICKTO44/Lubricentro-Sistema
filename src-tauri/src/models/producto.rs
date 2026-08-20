// models/producto.rs
// Modelo de Producto con soporte de variantes/tallas

use serde::{Deserialize, Serialize};

// =====================================================
// MODELO PRINCIPAL: Producto
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Producto {
    pub id: i32,
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub precio: f64,
    pub stock: f64,
    pub stock_minimo: f64,
    pub unidad_medida: String,  // 🆕 UNIDAD | KG | GRAMO | LITRO | ML
    pub categoria_id: i32,
    pub categoria_nombre: Option<String>,
    pub descuento_porcentaje: f64,
    pub tiene_variantes: bool,  // 🆕
    pub activo: bool,
    pub imagen_url: Option<String>,  // 🆕 imagen en base64 (data URI), thumbnail comprimido
    pub lleva_vencimiento: bool, // 🆕 solo productos perecibles de minimarket
    pub viscosidad: Option<String>, // Grado SAE (ej. '20W-50'). Solo aplica a aceites/lubricantes.
    // 🆕 Precio de compra (costo). Se edita a mano desde Inventario, pero
    // Proveedores "manda": al confirmar la recepción de una compra real,
    // este valor se sobreescribe con el precio de compra de esa línea.
    pub precio_compra: f64,
}

// =====================================================
// 🆕 MODELO: Variante de producto (talla)
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProductoVariante {
    pub id: i32,
    pub producto_id: i32,
    pub talla: String,
    pub stock: f64,
    pub stock_minimo: f64,
    pub precio: Option<f64>, // 🆕 NULL = usa el precio del producto
    pub activo: bool,
}

// =====================================================
// 🆕 REQUEST: Variante al crear/editar producto
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VarianteInput {
    pub talla: String,
    pub stock: i32,
    pub stock_minimo: Option<i32>,
    pub precio: Option<f64>, // 🆕 NULL = usa el precio del producto
}

// =====================================================
// REQUEST: Nuevo producto
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct ProductoNuevo {
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub precio: f64,
    pub stock: f64,           // Solo usado si tiene_variantes = false
    pub stock_minimo: f64,
    #[serde(default = "default_unidad_medida")]  // 🆕 si el frontend no lo manda, asume UNIDAD
    pub unidad_medida: String,
    pub categoria_id: i32,
    pub descuento_porcentaje: Option<f64>,
    pub tiene_variantes: Option<bool>,      // 🆕
    pub variantes: Option<Vec<VarianteInput>>, // 🆕
    #[serde(default)]  // 🆕 si el frontend no manda el campo (ej. alta rápida desde Proveedores), no falla
    pub imagen_url: Option<String>,
    #[serde(default)] // 🆕 default false — solo productos perecibles de minimarket lo activan
    pub lleva_vencimiento: bool,
    #[serde(default)] // Grado SAE (ej. '20W-50'). Opcional, solo aplica a aceites/lubricantes.
    pub viscosidad: Option<String>,
    // 🆕 Precio de compra inicial (costo) — opcional; si no se manda, queda en 0
    // hasta que se registre una compra real o se edite a mano desde Inventario.
    #[serde(default)]
    pub precio_compra: Option<f64>,
}

fn default_unidad_medida() -> String {
    "UNIDAD".to_string()
}

// =====================================================
// RESPONSES
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct ProductoResponse {
    pub success: bool,
    pub message: String,
    pub producto: Option<Producto>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductosResponse {
    pub success: bool,
    pub productos: Vec<Producto>,
}

// =====================================================
// 🆕 RESPONSE: Producto con sus variantes
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct ProductoConVariantes {
    pub producto: Producto,
    pub variantes: Vec<ProductoVariante>,
}