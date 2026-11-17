import { useState, useEffect, useCallback } from 'react';
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
import CalendarioPagos from './pages/CalendarioPagos';
import api from './api';
import toast, { Toaster } from 'react-hot-toast';

export default function App() {
  const [usuario, setUsuario] = useState(() => {
    try {
      const usuarioGuardado = localStorage.getItem('usuario_erp');
      const tokenGuardado = localStorage.getItem('token_erp');
      if (!usuarioGuardado || !tokenGuardado) {
        localStorage.removeItem('usuario_erp');
        localStorage.removeItem('token_erp');
        return null;
      }
      const parsed = JSON.parse(usuarioGuardado);
      if (!parsed || !parsed.id_usuario || !parsed.email) {
        localStorage.removeItem('usuario_erp');
        localStorage.removeItem('token_erp');
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem('usuario_erp');
      localStorage.removeItem('token_erp');
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
    let alive = true;
    if (localStorage.getItem('token_erp')) {
      Promise.resolve().then(() => {
        if (alive) void sincronizarPerfil();
      });
    }
    return () => {
      alive = false;
    };
  }, [sincronizarPerfil]);

  // Refrescar permisos al volver a la pestaña del navegador para aplicar cambios de rol al instante
  useEffect(() => {
    const onFocus = () => {
      if (localStorage.getItem('token_erp')) {
        sincronizarPerfil();
      }
    };
    const onSesionExpirada = (e) => {
      cerrarSesion();
      const msg = e?.detail?.mensaje;
      toast.error(msg || 'Tu sesión terminó. Por favor vuelve a entrar con tu correo y contraseña.');
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('sesion_expirada', onSesionExpirada);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('sesion_expirada', onSesionExpirada);
    };
  }, [cerrarSesion, sincronizarPerfil]);

  // Cierre automático exacto cuando el rol tiene un límite fijo de sesión
  useEffect(() => {
    if (!usuario?.sesion_expira_en) return;
    const restanteMs = Number(usuario.sesion_expira_en) - Date.now();
    const timer = setTimeout(() => {
      cerrarSesion();
      toast.error('Tu sesión expiró según el tiempo límite configurado para tu rol. Vuelve a iniciar sesión.');
    }, Math.max(0, Math.min(restanteMs, 2147483640)));
    return () => clearTimeout(timer);
  }, [usuario?.sesion_expira_en, cerrarSesion]);

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
      case 'calendario_pagos':
        return <CalendarioPagos usuario={usuario} />;
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
