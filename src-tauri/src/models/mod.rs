// models/mod.rs
// Módulo de modelos

pub mod usuario;
pub mod producto;
pub mod venta;
pub mod caja;
pub mod proveedor; // 🆕

pub use usuario::{Usuario, UsuarioLogin, UsuarioResponse};
pub use producto::{Producto, ProductoNuevo, ProductoResponse, ProductosResponse};
pub use venta::{Venta, DetalleVenta, VentaNueva, VentaResponse};
pub use caja::{
    Caja, AbrirCajaRequest, CerrarCajaRequest, DesgloseDenominaciones,
    MovimientoCaja, RegistrarMovimientoRequest, ReporteCierreCaja,
    ResumenPuntualidad, ResumenFinanciero, CajaResponse,
};
pub use proveedor::{
    Proveedor, ProveedorNuevo, ProveedorResponse, ProveedoresResponse,
    Compra, DetalleCompra, PagoCompra, CompraDetalle,
    NuevaCompraRequest, RecibirMercaderiaRequest,
    RegistrarPagoRequest, CompraResponse, ComprasResponse,
    ItemCompra, ItemRecepcion,
}; // 🆕