import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  IconShoppingBag,
  IconShoppingCart,
  IconWallet,
  IconPackage,
  IconPackageImport,
  IconReportAnalytics,
  IconReplace,
  IconSettings2,
  IconChevronLeft,
  IconChevronRight,
  IconLogout,
  IconUsers,
} from '@tabler/icons-react';
import './sidebar.css';

function Sidebar({ 
  moduloActual, 
  cambiarModulo, 
  usuario, 
  cerrarSesion, 
  colapsado, 
  toggleColapsar 
}) {
  const [modoNegocio, setModoNegocio] = useState('LUBRICENTRO');

  useEffect(() => {
    invoke('obtener_configuracion_tienda')
      .then(config => setModoNegocio(config.modo_negocio || 'LUBRICENTRO'))
      .catch(err => console.error('Error al cargar modo de negocio:', err));
  }, []);
  
  // Definir todos los módulos con sus permisos
  const todosLosModulos = [
    {
      id: 'pos',
      nombre: 'Punto de Venta',
      icono: IconShoppingBag,
      descripcion: 'Ventas',
      roles: [1, 2] // Administrador y Cajero
    },
    {
      id: 'caja',
      nombre: 'Caja',
      icono: IconWallet,
      descripcion: 'Control de caja',
      roles: [1, 2] // Administrador y Cajero
    },
    {
      id: 'clientes',
      nombre: 'Clientes',
      icono: IconUsers,
      descripcion: 'Registro de clientes',
      roles: [1, 2] // Administrador y Cajero
    },
    {
      id: 'inventario',
      nombre: 'Inventario',
      icono: IconPackage,
      descripcion: 'Gestión de productos',
      roles: [1, 3] // Administrador y Almacenista
    },
    {
      id: 'proveedores',
      nombre: 'Proveedores',
      icono: IconPackageImport,
      descripcion: 'Compras y proveedores',
      roles: [1, 3] // Administrador y Almacenista
    },
    {
      id: 'reportes',
      nombre: 'Reportes',
      icono: IconReportAnalytics,
      descripcion: 'Análisis de ventas',
      roles: [1, 2] // Administrador y Cajero
    },
    {
      id: 'devoluciones',
      nombre: 'Devoluciones',
      icono: IconReplace,
      descripcion: 'Procesar devoluciones',
      roles: [1] // Solo Administrador
    },
    {
      id: 'configuracion',
      nombre: 'Configuración',
      icono: IconSettings2,
      descripcion: 'Ajustes del sistema',
      roles: [1] // Solo Administrador
    }
  ];

  // Filtrar módulos según el rol del usuario
  let modulosPermitidos = todosLosModulos.filter(modulo => 
    modulo.roles.includes(usuario?.rol_id)
  );

  // En Lubricentro, las devoluciones son poco frecuentes: se mueven al final del menú (sin ocultarlas)
  if (modoNegocio === 'LUBRICENTRO') {
    const devoluciones = modulosPermitidos.find(m => m.id === 'devoluciones');
    if (devoluciones) {
      modulosPermitidos = [
        ...modulosPermitidos.filter(m => m.id !== 'devoluciones'),
        devoluciones,
      ];
    }
  }

  return (
    <div className={`sidebar ${colapsado ? 'colapsado' : ''}`}>
      {/* Header con logo y toggle */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <IconShoppingCart size={24} stroke={2} />
          </div>
          {!colapsado && (
            <div className="logo-text">
              <h2>M. Beltrán</h2>
              <p>Lubricentro</p>
            </div>
          )}
        </div>
        <button 
          className="btn-toggle-sidebar" 
          onClick={toggleColapsar}
          title={colapsado ? 'Expandir' : 'Colapsar'}
        >
          {colapsado ? <IconChevronRight size={18} stroke={2} /> : <IconChevronLeft size={18} stroke={2} />}
        </button>
      </div>

      {/* Navegación - Solo muestra módulos permitidos */}
      <nav className="sidebar-nav">
        {modulosPermitidos.map(modulo => {
          const IconoModulo = modulo.icono;
          return (
            <button
              key={modulo.id}
              className={`nav-item ${moduloActual === modulo.id ? 'active' : ''}`}
              onClick={() => cambiarModulo(modulo.id)}
              title={colapsado ? modulo.nombre : ''}
            >
              <span className="nav-icon">
                <IconoModulo size={21} stroke={2} />
              </span>
              {!colapsado && (
                <div className="nav-text">
                  <span className="nav-nombre">{modulo.nombre}</span>
                  <span className="nav-descripcion">{modulo.descripcion}</span>
                </div>
              )}
              {!colapsado && moduloActual === modulo.id && (
                <div className="active-indicator"></div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Cerrar sesión */}
      <div className="sidebar-footer">
        <button 
          className="btn-cerrar-sesion" 
          onClick={cerrarSesion}
          title="Cerrar Sesión"
        >
          <IconLogout size={18} stroke={2} />
          {!colapsado && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </div>
  );
}

export default Sidebar;