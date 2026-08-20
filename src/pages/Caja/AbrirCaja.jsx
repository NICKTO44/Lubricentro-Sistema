// Caja/AbrirCaja.jsx
// Modal para abrir caja — 🆕 sin turnos ni restricción de horario: el
// negocio trabaja un solo horario y se puede abrir en cualquier momento.

import { useState } from 'react';
import { abrirCaja } from '../../services/cajaService';
import './AbrirCaja.css';

function AbrirCaja({ usuario, onCerrar, onCajaAbierta }) {
  const [montoInicial, setMontoInicial] = useState('200');
  const [observaciones, setObservaciones] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const monto = parseFloat(montoInicial);
    
    if (isNaN(monto) || monto < 0) {
      setError('El monto inicial debe ser un número válido');
      return;
    }

    setProcesando(true);

    try {
      const resultado = await abrirCaja(
        usuario.id,
        1, // Número de caja (siempre 1 porque solo hay una)
        'GENERAL', // 🆕 ya no hay turnos — el backend ignora este valor igual
        monto,
        observaciones || null
      );

      if (resultado.success) {
        onCajaAbierta(resultado.caja);
      } else {
        setError(resultado.message);
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err.toString());
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="abrircaja-overlay" onClick={onCerrar}>
      <div className="modal-abrir-caja" onClick={(e) => e.stopPropagation()}>
        <div className="abrircaja-header">
          <h2>Abrir Caja</h2>
          <button className="abrircaja-btn-cerrar" onClick={onCerrar}></button>
        </div>

        <form onSubmit={handleSubmit} className="form-abrir-caja">
          {error && (
            <div className="error-message">
               {error}
            </div>
          )}

          {/* Información del usuario */}
          <div className="info-usuario">
            <div className="info-item">
              <span className="label">Cajero:</span>
              <span className="value">{usuario.nombre_completo}</span>
            </div>
            <div className="info-item">
              <span className="label">Fecha:</span>
              <span className="value">{new Date().toLocaleDateString('es-PE')}</span>
            </div>
            <div className="info-item">
              <span className="label">Hora:</span>
              <span className="value">{new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          {/* Monto inicial */}
          <div className="form-group">
            <label htmlFor="montoInicial">
              Monto Inicial (Fondo de Cambio) <span className="required">*</span>
            </label>
            <div className="input-moneda">
              <span className="simbolo-moneda">S/</span>
              <input
                id="montoInicial"
                type="number"
                step="0.01"
                min="0"
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                placeholder="200.00"
                required
                autoFocus
              />
            </div>
            <small className="input-hint">
              Cantidad de efectivo con la que inicias la caja
            </small>
          </div>

          {/* Observaciones */}
          <div className="form-group">
            <label htmlFor="observaciones">
              Observaciones (opcional)
            </label>
            <textarea
              id="observaciones"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej: Turno normal, todo en orden"
              rows="3"
            />
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
              className="btn-abrir"
              disabled={procesando}
            >
              {procesando ? 'Abriendo...' : ' Abrir Caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AbrirCaja;