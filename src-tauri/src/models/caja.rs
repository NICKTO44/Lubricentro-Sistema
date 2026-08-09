// models/caja.rs
// Modelos para el sistema de control de cajas

use serde::{Deserialize, Serialize};

// =====================================================
// MODELO PRINCIPAL: Caja
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Caja {
    pub id: i32,
    pub usuario_id: i32,
    pub numero_caja: i32,
    pub turno: String,
    
    // Apertura
    pub fecha_apertura: String,
    pub hora_apertura: String,
    pub monto_inicial: f64,
    pub observaciones_apertura: Option<String>,
    
    // Puntualidad
    pub hora_esperada_inicio: String,
    pub minutos_retraso: i32,
    pub llego_tarde: bool,
    
    // Cierre
    pub fecha_cierre: Option<String>,
    pub hora_cierre: Option<String>,
    pub hora_esperada_fin: String,
    pub monto_final_contado: Option<f64>,
    pub observaciones_cierre: Option<String>,
    
    // Totales de ventas
    pub ventas_efectivo: f64,
    pub ventas_tarjeta: f64,
    pub ventas_transferencia: f64,
    pub total_ventas: f64,
    pub numero_transacciones: i32,
    pub ticket_promedio: f64,
    
    // Devoluciones
    pub devoluciones_monto: f64,
    pub devoluciones_cantidad: i32,
    
    // Movimientos de efectivo
    pub retiros_total: f64,
    pub ingresos_total: f64,
    pub gastos_total: f64,
    pub cambio_total: f64,
    
    // Diferencia
    pub efectivo_esperado: Option<f64>,
    pub diferencia: Option<f64>,
    pub estado_diferencia: Option<String>,
    pub justificacion_diferencia: Option<String>,
    
    // Estado y duración
    pub estado: String,
    pub duracion_turno_minutos: Option<i32>,
}

// =====================================================
// REQUEST: Abrir Caja
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct AbrirCajaRequest {
    pub usuario_id: i32,
    pub numero_caja: i32,
    pub turno: String,
    pub monto_inicial: f64,
    pub observaciones: Option<String>,
}

// =====================================================
// REQUEST: Cerrar Caja
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct CerrarCajaRequest {
    pub caja_id: i32,
    pub monto_contado: f64,
    pub desglose: Option<DesgloseDenominaciones>,
    pub observaciones: Option<String>,
    pub justificacion_diferencia: Option<String>,
}

// =====================================================
// MODELO: Desglose de Denominaciones
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DesgloseDenominaciones {
    pub billetes_200: i32,
    pub billetes_100: i32,
    pub billetes_50: i32,
    pub billetes_20: i32,
    pub billetes_10: i32,
    pub monedas_5: i32,
    pub monedas_2: i32,
    pub monedas_1: i32,
    pub otras_monedas: f64,
}

impl DesgloseDenominaciones {
    pub fn calcular_total(&self) -> f64 {
        (self.billetes_200 as f64 * 200.0) +
        (self.billetes_100 as f64 * 100.0) +
        (self.billetes_50 as f64 * 50.0) +
        (self.billetes_20 as f64 * 20.0) +
        (self.billetes_10 as f64 * 10.0) +
        (self.monedas_5 as f64 * 5.0) +
        (self.monedas_2 as f64 * 2.0) +
        (self.monedas_1 as f64 * 1.0) +
        self.otras_monedas
    }
}

// =====================================================
// MODELO: Movimiento de Caja
// =====================================================
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MovimientoCaja {
    pub id: i32,
    pub caja_id: i32,
    pub tipo: String,
    pub monto: f64,
    pub motivo: String,
    pub autorizado_por: Option<i32>,
    pub nombre_autorizador: Option<String>,
    pub fecha_hora: String,
    pub hora: String,
    pub usuario_id: i32,
}

// =====================================================
// REQUEST: Registrar Movimiento
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct RegistrarMovimientoRequest {
    pub caja_id: i32,
    pub tipo: String,
    pub monto: f64,
    pub motivo: String,
    pub autorizado_por: Option<i32>,
    pub nombre_autorizador: Option<String>,
}

// =====================================================
// RESPONSE: Reporte de Cierre
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct ReporteCierreCaja {
    pub caja: Caja,
    pub cajero_nombre: String,
    pub movimientos: Vec<MovimientoCaja>,
    pub resumen_puntualidad: ResumenPuntualidad,
    pub resumen_financiero: ResumenFinanciero,
}

// =====================================================
// MODELO: Resumen de Puntualidad
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct ResumenPuntualidad {
    pub hora_esperada: String,
    pub hora_real: String,
    pub llego_tarde: bool,
    pub minutos_retraso: i32,
    pub mensaje: String,
}

// =====================================================
// MODELO: Resumen Financiero
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct ResumenFinanciero {
    pub efectivo_calculado: f64,
    pub efectivo_contado: f64,
    pub diferencia: f64,
    pub estado: String,
    pub porcentaje_diferencia: f64,
}

// =====================================================
// RESPONSE: Caja Response
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct CajaResponse {
    pub success: bool,
    pub message: String,
    pub caja: Option<Caja>,
}

// =====================================================
// 🆕 MODELO: Item del Historial de Cajas
// (Vista resumida para la tabla del historial)
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct HistorialCajaItem {
    pub id: i32,
    pub cajero_nombre: String,
    pub turno: String,
    pub fecha_apertura: String,
    pub hora_apertura: String,
    pub fecha_cierre: Option<String>,
    pub hora_cierre: Option<String>,
    pub total_ventas: f64,
    pub ventas_efectivo: f64,
    pub ventas_tarjeta: f64,
    pub ventas_transferencia: f64,
    pub numero_transacciones: i32,
    pub monto_inicial: f64,
    pub efectivo_esperado: Option<f64>,
    pub monto_final_contado: Option<f64>,
    pub diferencia: Option<f64>,
    pub estado_diferencia: Option<String>,
    pub llego_tarde: bool,
    pub minutos_retraso: i32,
    pub duracion_turno_minutos: Option<i32>,
    pub estado: String,
}

// =====================================================
// 🆕 REQUEST: Filtros para Historial de Cajas
// =====================================================
#[derive(Debug, Serialize, Deserialize)]
pub struct FiltroCajas {
    pub fecha_inicio: Option<String>,
    pub fecha_fin: Option<String>,
    pub turno: Option<String>,
    pub usuario_id: Option<i32>,
    pub solo_cerradas: Option<bool>,
}