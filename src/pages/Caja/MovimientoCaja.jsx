// Caja/MovimientoCaja.jsx
// Modal para registrar retiros, ingresos y gastos

import { useState } from 'react';
import { registrarMovimiento } from '../../services/cajaService';
import './MovimientoCaja.css';

function MovimientoCaja({ cajaId, onCerrar, onMovimientoRegistrado }) {
  const [tipo, setTipo] = useState('RETIRO');
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const tiposMovimiento = [
    {
      id: 'RETIRO',
      nombre: 'Retiro',
      icono: '',
      descripcion: 'Sacar dinero de caja',
      color: '#dc3545',
      ejemplos: ['Depósito bancario', 'Envío a caja fuerte', 'Retiro de seguridad']
    },
    {
      id: 'GASTO',
      nombre: 'Gasto',
      icono: '',
      descripcion: 'Compras menores',
      color: '#fd7e14',
      ejemplos: ['Compra de bolsas', 'Suministros', 'Gastos varios']
    },
    {
      id: 'INGRESO',
      nombre: 'Ingreso',
      icono: '',
      descripcion: 'Agregar dinero a caja',
      color: '#28a745',
      ejemplos: ['Cambio adicional', 'Fondeo extra', 'Devolución de préstamo']
    }
  ];

  const tipoActual = tiposMovimiento.find(t => t.id === tipo);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const montoNum = parseFloat(monto);

    if (isNaN(montoNum) || montoNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }

    if (!motivo.trim()) {
      setError('Debes especificar el motivo');
      return;
    }

    setProcesando(true);

    try {
      await registrarMovimiento(
        cajaId,
        tipo,
        montoNum,
        motivo.trim(),
        null, // autorizado_por
        null  // nombre_autorizador
      );

      onMovimientoRegistrado();
    } catch (err) {
      console.error('Error:', err);
      setError(err.toString());
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-movimiento-caja" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Registrar Movimiento</h2>
          <button className="btn-cerrar-modal" onClick={onCerrar}></button>
        </div>

        <form onSubmit={handleSubmit} className="form-movimiento">
          {error && (
            <div className="error-message">
               {error}
            </div>
          )}

          {/* Selección de tipo */}
          <div className="form-group">
            <label>Tipo de Movimiento <span className="required">*</span></label>
            <div className="tipos-grid">
              {tiposMovimiento.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`btn-tipo ${tipo === t.id ? 'active' : ''}`}
                  onClick={() => setTipo(t.id)}
                  style={{
                    borderColor: tipo === t.id ? t.color : '#e0e0e0',
                    background: tipo === t.id ? `${t.color}15` : 'white'
                  }}
                >
                  <div className="tipo-icono">{t.icono}</div>
                  <div className="tipo-info">
                    <span className="tipo-nombre">{t.nombre}</span>
                    <span className="tipo-descripcion">{t.descripcion}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Monto */}
          <div className="form-group">
            <label htmlFor="monto">
              Monto <span className="required">*</span>
            </label>
            <div className="input-moneda">
              <span className="simbolo-moneda">S/</span>
              <input
                id="monto"
                type="number"
                step="0.01"
                min="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Motivo */}
          <div className="form-group">
            <label htmlFor="motivo">
              Motivo <span className="required">*</span>
            </label>
            <textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={`Ej: ${tipoActual?.ejemplos[0] || 'Describe el motivo'}`}
              rows="3"
              required
            />
            {tipoActual && (
              <div className="ejemplos-motivos">
                <span className="ejemplos-label">Ejemplos:</span>
                <div className="ejemplos-lista">
                  {tipoActual.ejemplos.map((ejemplo, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="btn-ejemplo"
                      onClick={() => setMotivo(ejemplo)}
                    >
                      {ejemplo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advertencia según tipo */}
          <div className="info-movimiento" style={{ borderLeftColor: tipoActual?.color }}>
            <span className="info-icono">{tipoActual?.icono}</span>
            <div className="info-texto">
              {tipo === 'RETIRO' && (
                <>
                  <strong>Retiro de efectivo</strong>
                  <p>El efectivo en caja disminuirá. Asegúrate de llevarlo a un lugar seguro.</p>
                </>
              )}
              {tipo === 'GASTO' && (
                <>
                  <strong>Gasto de caja</strong>
                  <p>Se restará del efectivo disponible. Guarda el comprobante si es posible.</p>
                </>
              )}
              {tipo === 'INGRESO' && (
                <>
                  <strong>Ingreso a caja</strong>
                  <p>Se sumará al efectivo disponible. Verifica que el monto sea correcto.</p>
                </>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="modal-acciones">
            <button 
              type="button" 
              className="btn-cancelar"
              onClick={onCerrar}
              disabled={procesando}
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="btn-registrar"
              disabled={procesando}
              style={{ background: tipoActual?.color }}
            >
              {procesando ? 'Registrando...' : `${tipoActual?.icono} Registrar ${tipoActual?.nombre}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MovimientoCaja;