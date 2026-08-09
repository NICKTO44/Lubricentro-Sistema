// ModalBienvenida.jsx
// Modal educativo que se muestra solo la primera vez que el usuario abre el sistema

import { useState } from 'react';
import {
  IconSparkles,
  IconPackage,
  IconShoppingBag,
  IconReportAnalytics,
  IconUsers,
  IconReplace,
  IconInfinity,
  IconCalendarMonth,
  IconCalendarStar,
  IconCreditCard,
  IconBulb,
} from '@tabler/icons-react';
import './ModalBienvenida.css';

function ModalBienvenida({ diasRestantes, onCerrar, onVerPlanes }) {
  const [noMostrarMas, setNoMostrarMas] = useState(false);

  const handleCerrar = () => {
    onCerrar(noMostrarMas);
  };

  const handleVerPlanes = () => {
    onVerPlanes();
    // No cerrar el modal, dejar que el componente padre lo maneje
  };

  return (
    <div className="modal-bienvenida-overlay">
      <div className="modal-bienvenida-container">
        {/* Header con animación */}
        <div className="modal-bienvenida-header">
          
          <h1 className="modal-titulo">
            ¡Bienvenido a Sistema de Gestión POS!
          </h1>
          <p className="modal-subtitulo">
            Gracias por instalar nuestro sistema de gestión
          </p>
        </div>

        {/* Información del trial */}
        <div className="modal-trial-info">
          <div className="trial-badge">
            <span className="badge-icon"><IconSparkles size={26} stroke={1.8} /></span>
            <div className="badge-content">
              <h3>Prueba Gratuita Activada</h3>
              <p><strong>{diasRestantes} días</strong> de acceso completo</p>
            </div>
          </div>
        </div>

        {/* Lista de beneficios */}
        <div className="modal-beneficios">
          <h3 className="beneficios-titulo">¿Qué incluye tu prueba gratuita?</h3>
          <div className="beneficios-grid">
            <div className="beneficio-item">
              <span className="beneficio-icono"><IconPackage size={22} stroke={1.8} /></span>
              <div className="beneficio-texto">
                <h4>Gestión de Inventario</h4>
                <p>Control completo de productos, stock y categorías</p>
              </div>
            </div>

            <div className="beneficio-item">
              <span className="beneficio-icono"><IconShoppingBag size={22} stroke={1.8} /></span>
              <div className="beneficio-texto">
                <h4>Sistema de Ventas</h4>
                <p>Registro rápido de ventas con cálculo automático</p>
              </div>
            </div>

            <div className="beneficio-item">
              <span className="beneficio-icono"><IconReportAnalytics size={22} stroke={1.8} /></span>
              <div className="beneficio-texto">
                <h4>Reportes Detallados</h4>
                <p>Análisis de ventas, ganancias y productos más vendidos</p>
              </div>
            </div>

            <div className="beneficio-item">
              <span className="beneficio-icono"><IconUsers size={22} stroke={1.8} /></span>
              <div className="beneficio-texto">
                <h4>Gestión de Clientes</h4>
                <p>Base de datos de clientes y historial de compras</p>
              </div>
            </div>

            <div className="beneficio-item">
              <span className="beneficio-icono"><IconReplace size={22} stroke={1.8} /></span>
              <div className="beneficio-texto">
                <h4>Devoluciones</h4>
                <p>Manejo completo de devoluciones y reembolsos</p>
              </div>
            </div>

            <div className="beneficio-item">
              <span className="beneficio-icono"><IconInfinity size={22} stroke={1.8} /></span>
              <div className="beneficio-texto">
                <h4>Sin Límites</h4>
                <p>Productos, ventas y usuarios ilimitados</p>
              </div>
            </div>
          </div>
        </div>

        {/* Información de planes */}
        <div className="modal-planes-preview">
          <h3 className="planes-preview-titulo">Después del trial:</h3>
          <div className="planes-preview-grid">
            <div className="plan-preview-card">
              <span className="plan-preview-icono"><IconCalendarMonth size={20} stroke={1.8} /></span>
              <div className="plan-preview-info">
                <h4>Mensual</h4>
                <p className="plan-preview-precio">S/40<span>/mes</span></p>
              </div>
            </div>

            <div className="plan-preview-card plan-preview-destacado">
              <div className="plan-preview-badge">Ahorra 20%</div>
              <span className="plan-preview-icono"><IconCalendarStar size={20} stroke={1.8} /></span>
              <div className="plan-preview-info">
                <h4>Anual</h4>
                <p className="plan-preview-precio">S/384<span>/año</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* Checkbox no mostrar más */}
        <div className="modal-checkbox">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={noMostrarMas}
              onChange={(e) => setNoMostrarMas(e.target.checked)}
            />
            <span className="checkbox-checkmark"></span>
            <span className="checkbox-label">No mostrar este mensaje nuevamente</span>
          </label>
        </div>

        {/* Botones de acción */}
        <div className="modal-acciones">
          <button 
            className="modal-btn modal-btn-planes"
            onClick={handleVerPlanes}
          >
            <IconCreditCard size={17} stroke={2} /> Ver Planes y Precios
          </button>
          
          <button 
            className="modal-btn modal-btn-continuar"
            onClick={handleCerrar}
          >
            Comenzar a Usar el Sistema
          </button>
        </div>

        {/* Footer con tip */}
        <div className="modal-footer">
          <div className="modal-tip">
            <span className="tip-icono"><IconBulb size={20} stroke={1.8} /></span>
            <p>
              <strong>Tip:</strong>Puedes activar tu licencia en cualquier momento desde el menú superior
            </p>
          </div>
        </div>

        {/* Botón de cerrar (X) */}
        <button className="modal-cerrar-x" onClick={handleCerrar} aria-label="Cerrar">
          ×
        </button>
      </div>
    </div>
  );
}

export default ModalBienvenida;