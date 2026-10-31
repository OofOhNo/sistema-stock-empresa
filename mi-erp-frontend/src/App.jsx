import React, { useState, useEffect, useCallback } from 'react';
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
import Mensajes from './pages/Mensajes';
import api from './api';
import toast, { Toaster } from 'react-hot-toast';

export default function App() {
  const [usuario, setUsuario] = useState(() => {
    try {
      const usuarioGuardado = localStorage.getItem('usuario_erp');
      const tokenGuardado = localStorage.getItem('token_erp');
      return usuarioGuardado && tokenGuardado ? JSON.parse(usuarioGuardado) : null;
    } catch {
      return null;
    }
  });
  const [vistaActual, setVistaActual] = useState('dashboard');

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem('token_erp');
    localStorage.removeItem('usuario_erp');
    setUsuario(null);
    setVistaActual('dashboard');
  }, []);

  const sincronizarPerfil = useCallback(async () => {
    const tokenGuardado = localStorage.getItem('token_erp');
    if (!tokenGuardado) return;
    try {
      const res = await api.get('/auth/perfil');
      if (res.data?.exito && res.data?.usuario) {
        if (res.data.token) {
          localStorage.setItem('token_erp', res.data.token);
        }
        localStorage.setItem('usuario_erp', JSON.stringify(res.data.usuario));
        setUsuario(res.data.usuario);
      }
    } catch {
      // El interceptor de api.js se encarga si la sesión expiró
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem('token_erp')) {
      sincronizarPerfil();
    }
  }, [sincronizarPerfil]);

  // Refrescar permisos al volver a la pestaña del navegador para aplicar cambios de rol al instante
  useEffect(() => {
    const onFocus = () => {
      if (localStorage.getItem('token_erp')) {
        sincronizarPerfil();
      }
    };
    const onSesionExpirada = () => {
      cerrarSesion();
      toast.error('Tu sesión terminó. Por favor vuelve a entrar con tu correo y contraseña.');
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('sesion_expirada', onSesionExpirada);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('sesion_expirada', onSesionExpirada);
    };
  }, [cerrarSesion, sincronizarPerfil]);

  const cambiarVista = (nuevaVista) => {
    setVistaActual(nuevaVista);
    sincronizarPerfil();
  };

  if (!usuario) {
    return (
      <>
        <Toaster position="top-right" />
        <Login onLoginExitoso={(datosUsuario) => {
          setVistaActual('dashboard');
          setUsuario(datosUsuario);
        }} />
      </>
    );
  }

  const renderizarVista = () => {
    switch (vistaActual) {
      case 'dashboard':
        return <Dashboard usuario={usuario} setVistaActual={cambiarVista} />;
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
        return <Usuarios usuarioLogueado={usuario} onPermisosActualizados={sincronizarPerfil} />;
      case 'ubicaciones':
        return <Ubicaciones usuario={usuario} />;
      case 'mensajes':
        return <Mensajes usuario={usuario} />;
      default:
        return <Dashboard usuario={usuario} setVistaActual={cambiarVista} />;
    }
  };

  return (
    <>
      <Toaster position="top-right" />
      <Layout
        usuario={usuario}
        cerrarSesion={cerrarSesion}
        vistaActual={vistaActual}
        setVistaActual={cambiarVista}
      >
        {renderizarVista()}
      </Layout>
    </>
  );
}
