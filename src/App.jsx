import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Login from './pages/Login/Login';
import Sidebar from './components/sidebar';
import POS from './pages/POS/POS';
import Caja from './pages/Caja/Caja';
import Inventario from './pages/Inventario/Inventario';
import Reportes from './pages/Reportes/Reportes';
import Configuracion from './pages/Configuracion/Configuracion';
import Devoluciones from './pages/Devoluciones/Devoluciones';
import Proveedores from './pages/Proveedores/Proveedores';
import Clientes from './pages/Clientes/Clientes';
import ActivarLicencia from './pages/ActivarLicencia/ActivarLicencia';
import BannerLicencia from './components/BannerLicencia';
import SplashScreen from './pages/SplashScreen/SplashScreen';
import ModalBienvenida from './components/ModalBienvenida';
import './App.css';

function App() {
  const [usuario, setUsuario] = useState(null);
  const [vistaActual, setVistaActual] = useState('pos');
  const [sidebarColapsado, setSidebarColapsado] = useState(false);
  const [estadoLicencia, setEstadoLicencia] = useState(null);
  const [modoSoloLectura, setModoSoloLectura] = useState(false);
  const [mostrarActivacion, setMostrarActivacion] = useState(false);
  const [cargandoLicencia, setCargandoLicencia] = useState(true);
  const [mostrarSplash, setMostrarSplash] = useState(false);
  const [tipoSplash, setTipoSplash] = useState('');
  const [mostrarModalBienvenida, setMostrarModalBienvenida] = useState(false);
  const [esPrimeraVez, setEsPrimeraVez] = useState(false);

  useEffect(() => { inicializarApp(); }, []);

  useEffect(() => {
    const interval = setInterval(() => { verificarLicencia(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (usuario && esPrimeraVez && !mostrarModalBienvenida) {
      setTimeout(() => setMostrarModalBienvenida(true), 500);
    }
  }, [usuario, esPrimeraVez]);

  const inicializarApp = async () => {
    await inicializarLicenciaYSplash();
  };

  // 🆕 Separado de inicializarApp para poder llamarlo también justo después
  // de que el usuario elija el tipo de negocio en el primer arranque
  const inicializarLicenciaYSplash = async () => {
    setCargandoLicencia(true);
    try {
      await invoke('verificar_licencia');
      const estado = await invoke('obtener_estado_licencia');
      setEstadoLicencia(estado);

      const primeraVez = await invoke('verificar_primera_vez');
      setEsPrimeraVez(primeraVez);

      const diasRestantes = estado.dias_restantes || 0;
      const esExpirado = !estado.puede_operar;
      setModoSoloLectura(esExpirado);

      if (primeraVez) {
        setTipoSplash('bienvenida');
        setMostrarSplash(true);
      } else if (diasRestantes === 7) {
        setTipoSplash('recordatorio');
        setMostrarSplash(true);
      } else if (diasRestantes === 3 || diasRestantes === 2) {
        setTipoSplash('urgente');
        setMostrarSplash(true);
      } else if (diasRestantes === 1) {
        setTipoSplash('ultimo');
        setMostrarSplash(true);
      } else if (esExpirado) {
        setTipoSplash('expirado');
        setMostrarSplash(true);
      }
    } catch (error) {
      console.error('Error al inicializar app:', error);
    } finally {
      setCargandoLicencia(false);
    }
  };

  const verificarLicencia = async () => {
    try {
      await invoke('verificar_licencia');
      const estado = await invoke('obtener_estado_licencia');
      setEstadoLicencia(estado);
      setModoSoloLectura(!estado.puede_operar);
    } catch (error) {
      console.error('Error al verificar licencia:', error);
    }
  };

  const handleCerrarSplash = () => {
    setMostrarSplash(false);
    if (tipoSplash === 'expirado') {
      setModoSoloLectura(true);
    }
  };

  const handleComprarDesdeSplash = () => {
    setMostrarSplash(false);
    setMostrarActivacion(true);
  };

  const handleCerrarModalBienvenida = async (noMostrarMas) => {
    setMostrarModalBienvenida(false);
    // FIX: Siempre marcar como vista, sin importar el checkbox
    try {
      await invoke('marcar_primera_vez_vista');
      setEsPrimeraVez(false);
    } catch (error) {
      console.error('Error al marcar primera vez:', error);
    }
  };

  const handleVerPlanesDesdeModal = () => {
    setMostrarModalBienvenida(false);
    // También marcar como vista al ir a planes
    invoke('marcar_primera_vez_vista').catch(() => {});
    setEsPrimeraVez(false);
    setMostrarActivacion(true);
  };

  const handleActivacionExitosa = async (esModoLectura = false) => {
    if (esModoLectura) {
      setModoSoloLectura(true);
      setMostrarActivacion(false);
      return;
    }
    setMostrarActivacion(false);
    await verificarLicencia();
  };

  const handleAbrirActivacion = () => setMostrarActivacion(true);

  const handleLoginSuccess = (user) => {
    setUsuario(user);
    setVistaActual('pos');
  };

  const handleLogout = () => {
    setUsuario(null);
    setVistaActual('pos');
  };

  const cambiarModulo = (modulo) => {
    if (tienePermiso(modulo)) setVistaActual(modulo);
  };

  const toggleSidebar = () => setSidebarColapsado(!sidebarColapsado);

  const tienePermiso = (modulo) => {
    if (!usuario) return false;
    const permisos = {
      1: { pos: true, caja: true, inventario: true, reportes: true, configuracion: true, devoluciones: true, proveedores: true, clientes: true },
      2: { pos: true, caja: true, inventario: false, reportes: true, configuracion: false, devoluciones: false, proveedores: false, clientes: true },
      3: { pos: false, caja: false, inventario: true, reportes: false, configuracion: false, devoluciones: false, proveedores: true, clientes: false },
    };
    return permisos[usuario.rol_id]?.[modulo] || false;
  };

  const renderContenido = () => {
    if (!tienePermiso(vistaActual)) {
      return (
        <div className="acceso-denegado">
          <h2>Acceso Denegado</h2>
          <p>No tienes permisos para acceder a este módulo</p>
          <button onClick={() => setVistaActual('pos')} className="btn-volver">Ir al inicio</button>
        </div>
      );
    }
    switch (vistaActual) {
      case 'pos':          return <POS           usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      case 'caja':         return <Caja          usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      case 'inventario':   return <Inventario    usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      case 'reportes':     return <Reportes      usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      case 'devoluciones': return <Devoluciones  usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      case 'configuracion':return <Configuracion usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} onLicenciaActualizada={verificarLicencia} />;
      case 'proveedores':  return <Proveedores   usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      case 'clientes':     return <Clientes      usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
      default:             return <POS           usuario={usuario} onVolver={() => setVistaActual('pos')} modoSoloLectura={modoSoloLectura} />;
    }
  };

  const tieneBanner = estadoLicencia && (
    estadoLicencia.estado === 'EXPIRADO' || estadoLicencia.dias_restantes <= 3
  );

  if (cargandoLicencia) {
    return (
      <div className="app-loading">
        <div className="loading-spinner">
          <div className="spinner-ring"></div>
          <p>Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (mostrarSplash && !usuario) {
    return (
      <SplashScreen
        diasRestantes={estadoLicencia?.dias_restantes || 0}
        tipoLicencia={estadoLicencia?.tipo_licencia}
        tipo={tipoSplash}
        onContinuar={handleCerrarSplash}
        onComprar={handleComprarDesdeSplash}
        autoCerrar={false}
        duracion={3000}
      />
    );
  }

  if (mostrarActivacion && !usuario) {
    return (
      <ActivarLicencia
        estadoLicencia={estadoLicencia}
        onActivacionExitosa={handleActivacionExitosa}
      />
    );
  }

  if (!usuario) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (mostrarActivacion && usuario) {
    return (
      <ActivarLicencia
        estadoLicencia={estadoLicencia}
        onActivacionExitosa={handleActivacionExitosa}
      />
    );
  }

  return (
    <div className="app-layout">
      <BannerLicencia
        estadoLicencia={estadoLicencia}
        onActivarClick={handleAbrirActivacion}
      />
      <Sidebar
        moduloActual={vistaActual}
        cambiarModulo={cambiarModulo}
        usuario={usuario}
        cerrarSesion={handleLogout}
        colapsado={sidebarColapsado}
        toggleColapsar={toggleSidebar}
      />
      <main className="app-content">
        <div className={tieneBanner ? 'content-with-banner' : ''}>
          {renderContenido()}
        </div>
      </main>
      {mostrarModalBienvenida && (
        <ModalBienvenida
          diasRestantes={estadoLicencia?.dias_restantes || 15}
          onCerrar={handleCerrarModalBienvenida}
          onVerPlanes={handleVerPlanesDesdeModal}
        />
      )}
    </div>
  );
}

export default App;