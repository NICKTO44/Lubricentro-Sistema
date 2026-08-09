import { useState, useEffect } from 'react';
import { IconInfoCircle, IconLock, IconAlertTriangle, IconClock, IconKey, IconX } from '@tabler/icons-react';
import './BannerLicencia.css';

function BannerLicencia({ estadoLicencia, onActivarClick }) {
  const [mostrar, setMostrar] = useState(true);

  // No mostrar banner si está en estado normal (trial activo con más de 3 días)
  if (!estadoLicencia) return null;
  
  const { estado, tipo_licencia, dias_restantes } = estadoLicencia;

  // Si está activo y tiene más de 3 días, no mostrar nada
  if (estado === 'ACTIVO' && dias_restantes > 3) {
    return null;
  }

  // Determinar estilo según estado
  let claseEstado = 'banner-info';
  let Icono = IconInfoCircle;
  let mensaje = '';

  if (estado === 'EXPIRADO') {
    claseEstado = 'banner-error';
    Icono = IconLock;
    mensaje = 'Licencia expirada - Modo Solo Lectura activo';
  } else if (estado === 'GRACIA') {
    claseEstado = 'banner-warning';
    Icono = IconAlertTriangle;
    const diasGracia = Math.abs(dias_restantes);
    mensaje = `Licencia expirada - Período de gracia: ${diasGracia} día${diasGracia !== 1 ? 's' : ''} restante${diasGracia !== 1 ? 's' : ''}`;
  } else if (dias_restantes <= 3) {
    claseEstado = 'banner-warning';
    Icono = IconClock;
    mensaje = `Tu ${tipo_licencia === 'TRIAL' ? 'período de prueba' : 'licencia'} expira en ${dias_restantes} día${dias_restantes !== 1 ? 's' : ''}`;
  }

  if (!mostrar) return null;

  return (
    <div className={`banner-licencia ${claseEstado}`}>
      <div className="banner-contenido">
        <span className="banner-icono"><Icono size={19} stroke={2} /></span>
        <span className="banner-mensaje">{mensaje}</span>
      </div>
      <div className="banner-acciones">
        <button onClick={onActivarClick} className="banner-btn-activar">
          <IconKey size={14} stroke={2} /> Activar Licencia
        </button>
        <button onClick={() => setMostrar(false)} className="banner-btn-cerrar">
          <IconX size={15} stroke={2} />
        </button>
      </div>
    </div>
  );
}

export default BannerLicencia;