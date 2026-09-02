import React, { useState, useEffect } from 'react';
import Login from './Login';
import Layout from './components/Layout';
import Stock from './pages/Stock';
import Pedidos from './pages/Pedidos';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  //estado para controlar que pantalla vemos (por defecto 'dashboard')
  const [vistaActual, setVistaActual] = useState('dashboard');

  useEffect(() => {
    const usuarioGuardado = localStorage.getItem('usuario_erp');
    const tokenGuardado = localStorage.getItem('token_erp');
    if (usuarioGuardado && tokenGuardado) {
      setUsuario(JSON.parse(usuarioGuardado));
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
      case 'stock':
        return <Stock usuario={usuario} />;
      case 'pedidos':
        return <Pedidos usuario={usuario} />;
      case 'dashboard':
        return <Dashboard usuario={usuario} />; // <-- ¡Aquí conectamos el nuevo Dashboard!
      case 'usuarios':
        return <Usuarios usuarioLogueado={usuario} />;
      default:
        return <div className="text-slate-500">Módulo en construcción...</div>;
    }
  };

  return (
    <Layout 
      usuario={usuario} 
      cerrarSesion={cerrarSesion} 
      vistaActual={vistaActual}
      setVistaActual={setVistaActual}
    >
      {renderizarVista()}
    </Layout>
  );
}