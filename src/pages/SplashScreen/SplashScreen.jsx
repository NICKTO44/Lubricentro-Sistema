// SplashScreen.jsx
// Pantalla de bienvenida que se muestra en momentos clave del trial

import React, { useEffect } from 'react';
import {
  IconSparkles,
  IconClock,
  IconAlertTriangle,
  IconAlertOctagon,
  IconLock,
  IconCreditCard,
} from '@tabler/icons-react';
import './SplashScreen.css';

const SplashScreen = ({ 
  diasRestantes, 
  tipoLicencia,
  tipo, 
  onContinuar, 
  onComprar,
  autoCerrar = false,
  duracion = 3000
}) => {
  
  useEffect(() => {
    // Auto-cerrar después de X segundos (solo para tipo "bienvenida")
    if (autoCerrar && tipo === 'bienvenida') {
      const timer = setTimeout(() => {
        onContinuar();
      }, duracion);
      
      return () => clearTimeout(timer);
    }
  }, [autoCerrar, tipo, duracion, onContinuar]);

  // Configuración según tipo de splash
  const getConfig = () => {
    switch(tipo) {
      case 'bienvenida':
        return {
          icono: IconSparkles,
          titulo: '¡Bienvenido a Sistema de Gestión POS!',
          mensaje: `Tienes ${diasRestantes} días de prueba gratuita`,
          submensaje: 'Acceso completo a todas las funcionalidades',
          colorClass: 'splash-bienvenida',
          mostrarBotonComprar: true,
          botonPrincipalTexto: 'Comenzar',
          autoCierra: false
        };
      
      case 'recordatorio':
        return {
          icono: IconClock,
          titulo: 'Recordatorio de Prueba',
          mensaje: `Quedan ${diasRestantes} días de tu prueba gratuita`,
          submensaje: '¿Te está gustando el sistema?',
          colorClass: 'splash-recordatorio',
          mostrarBotonComprar: true,
          botonPrincipalTexto: 'Continuar',
          autoCierra: false
        };
      
      case 'urgente':
        return {
          icono: IconAlertTriangle,
          titulo: '¡Solo quedan 3 días!',
          mensaje: `Tu prueba expira en ${diasRestantes} días`,
          submensaje: 'No pierdas acceso a todas tus ventas y productos',
          colorClass: 'splash-urgente',
          mostrarBotonComprar: true,
          botonPrincipalTexto: 'Recordar después',
          autoCierra: false
        };
      
      case 'ultimo':
        return {
          icono: IconAlertOctagon,
          titulo: '¡ÚLTIMO DÍA de Prueba!',
          mensaje: 'Tu prueba expira HOY',
          submensaje: 'Mañana solo podrás ver tus datos (modo solo lectura)',
          colorClass: 'splash-ultimo',
          mostrarBotonComprar: true,
          botonPrincipalTexto: 'Entiendo',
          autoCierra: false
        };
      
      case 'expirado':
        return {
          icono: IconLock,
          titulo: tipoLicencia === 'TRIAL' ? 'Prueba Expirada' : 'Licencia Vencida',
          mensaje: tipoLicencia === 'TRIAL'
            ? 'Tu período de prueba ha finalizado'
            : `Tu licencia ${tipoLicencia === 'ANUAL' ? 'anual' : 'mensual'} ha vencido`,
          submensaje: 'Activa una licencia para continuar usando todas las funciones',
          colorClass: 'splash-expirado',
          mostrarBotonComprar: true,
          botonPrincipalTexto: 'Modo Solo Lectura',
          autoCierra: false
        };
      
      default:
        return {
          icono: IconSparkles,
          titulo: 'Sistema de Gestión POS',
          mensaje: `${diasRestantes} días de prueba`,
          submensaje: '',
          colorClass: 'splash-default',
          mostrarBotonComprar: true,
          botonPrincipalTexto: 'Continuar',
          autoCierra: false
        };
    }
  };

  const config = getConfig();

  const handleComprar = () => {
    onComprar();
  };

  const handleContinuar = () => {
    onContinuar();
  };

  return (
    <div className={`splash-overlay ${config.colorClass}`}>
      <div className="splash-container">
        <div className="splash-content">
          {/* Icono */}
          <div className="splash-icon">
            <config.icono size={34} stroke={1.8} />
          </div>

          {/* Título */}
          <h1 className="splash-titulo">
            {config.titulo}
          </h1>

          {/* Mensaje principal */}
          <p className="splash-mensaje">
            {config.mensaje}
          </p>

          {/* Submensaje */}
          {config.submensaje && (
            <p className="splash-submensaje">
              {config.submensaje}
            </p>
          )}

          {/* Botones */}
          <div className="splash-botones">
            {config.mostrarBotonComprar && (
              <button 
                className="splash-btn splash-btn-comprar"
                onClick={handleComprar}
              >
                <IconCreditCard size={17} stroke={2} /> Comprar Licencia
              </button>
            )}
            
            <button 
              className="splash-btn splash-btn-continuar"
              onClick={handleContinuar}
            >
              {config.botonPrincipalTexto}
            </button>
          </div>

          {/* Indicador de auto-cierre */}
          {config.autoCierra && autoCerrar && (
            <div className="splash-auto-cierre">
              <div className="splash-progress-bar">
                <div 
                  className="splash-progress-fill"
                  style={{ animationDuration: `${duracion}ms` }}
                ></div>
              </div>
              <p className="splash-auto-cierre-texto">
                Cerrando automáticamente...
              </p>
            </div>
          )}

          {/* Versión del sistema */}
          <div className="splash-version">
            Sistema de Gestión POS v1.1.2
          </div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;