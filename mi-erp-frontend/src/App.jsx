import React, { useState, useEffect } from 'react';
import Login from './Login';
import Layout from './components/Layout';
import Stock from './pages/Stock';
import Pedidos from './pages/Pedidos';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import Productos from './pages/Productos';
import Reuniones from './pages/Reuniones';
import Ubicaciones from './pages/Ubicaciones';
import Facturacion from './pages/Facturacion';
import Clientes from './pages/Clientes';
import Despacho from './pages/Despacho';
import Calidad from './pages/Calidad';
import Errores from './pages/Errores';
import Organizacion from './pages/Organizacion';
import api from './api';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  //estado para controlar que pantalla vemos (por defecto 'dashboard')
  const [vistaActual, setVistaActual] = useState('dashboard');

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuario_erp');
    const tokenGuardado = localStorage.getItem('token_erp');
    if (usuarioGuardado && tokenGuardado) {
      const parsed = JSON.parse(usuarioGuardado);
      setUsuario(parsed);

      // Sincronizar perfil actualizado desde el servidor (área, permisos de celular, etc.)
      api.get('/auth/perfil')
        .then(res => {
          if (res.data.exito && res.data.usuario) {
            setUsuario(res.data.usuario);
            localStorage.setItem('usuario_erp', JSON.stringify(res.data.usuario));
          }
        })
        .catch(() => {
          // Si el token expiró, cerrar sesión
        });
    }
  }, []);

  const cerrarSesion = () => {
    localStorage.removeItem('token_erp');
    localStorage.removeItem('usuario_erp');
    setUsuario(null);
  };

  if (!usuario) {
    return <Login onLoginExitoso={(datosUsuario) => setUsuario(datosUsuario)} />;
  }

  //controlador para renderizar la pantalla correcta segun el menu
  const renderizarVista = () => {
    switch (vistaActual) {
      case 'dashboard':
        return <Dashboard usuario={usuario} />; 
      case 'stock':
        return <Stock usuario={usuario} />;
      case 'productos':
        return <Productos usuario={usuario} />;
      case 'clientes':
        return <Clientes usuario={usuario} />;
      case 'pedidos':
        return <Pedidos usuario={usuario} />;
      case 'despacho':
        return <Despacho usuario={usuario} />;
      case 'reuniones':
        return <Reuniones usuario={usuario} />;
      case 'facturacion':
        return <Facturacion usuario={usuario} />;
      case 'calidad':
        return <Calidad usuario={usuario} />;
      case 'errores':
        return <Errores usuario={usuario} />;
      case 'organizacion':
        return <Organizacion usuario={usuario} />;
      case 'usuarios':
        return <Usuarios usuarioLogueado={usuario} />;
      case 'ubicaciones':
        return <Ubicaciones usuario={usuario} />;
      default:
        return <div className="text-slate-500">Módulo en construcción...</div>;
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <Layout 
        usuario={usuario} 
        cerrarSesion={cerrarSesion} 
        vistaActual={vistaActual}
        setVistaActual={setVistaActual}
      >
        {renderizarVista()}
      </Layout>
    </>
  );
}