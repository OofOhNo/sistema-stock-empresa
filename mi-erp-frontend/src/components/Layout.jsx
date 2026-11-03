import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  LayoutDashboard, Package, ShoppingCart, FileText, Calendar,
  LogOut, Users, MapPin, Building2, Search,
  ShieldCheck, X, Loader2, ArrowRight, Bug, MessageSquare,
  KeyRound, ChevronDown, Eye, EyeOff, CheckCircle2, AlertCircle, Tag
} from 'lucide-react';
import api from '../api';

export default function Layout({ usuario, cerrarSesion, vistaActual, setVistaActual, children }) {
  // Buscador General Rápido
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState(null);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [mostrarModalBusqueda, setMostrarModalBusqueda] = useState(false);
  const [tabResultados, setTabResultados] = useState('facturas');
  const buscadorTimeout = useRef(null);

  // Menú desplegable de Usuario ("Mi Cuenta")
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const menuUsuarioRef = useRef(null);

  // Modal para cambiar la propia contraseña estando iniciado sesión
  const [modalPassword, setModalPassword] = useState(false);
  const [formPassword, setFormPassword] = useState({
    actual: '',
    nueva: '',
    confirmar: ''
  });
  const [verPass, setVerPass] = useState({ actual: false, nueva: false, confirmar: false });
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  // Modal Rápido de Reporte de Problemas
  const [modalBug, setModalBug] = useState(false);
  const [formBug, setFormBug] = useState({
    modulo: 'General',
    queHacia: '',
    descripcion: ''
  });
  const [enviandoBug, setEnviandoBug] = useState(false);

  // Contadores de avisos en vivo
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [pendientesRecuperacion, setPendientesRecuperacion] = useState(0);
  const [pendientesErrores, setPendientesErrores] = useState(0);

  const esProduccion = usuario?.area === 'PRODUCCION';
  const esAdminCentral = usuario?.rol === 'Admin Central';

  const tienePermisoVer = (modulo) => {
    if (esAdminCentral) return true;
    if (!usuario?.permisos) return modulo !== 'usuarios' && modulo !== 'errores';
    const perm = usuario.permisos[modulo];
    return Boolean(perm?.puede_ver || perm?.puede_editar);
  };

  const puedeEditarUsuarios = esAdminCentral || usuario?.permisos?.usuarios?.puede_editar === true;
  const puedeVerUsuarios = puedeEditarUsuarios || usuario?.permisos?.usuarios?.puede_ver === true;
  const puedeVerErrores =
    esAdminCentral ||
    usuario?.permisos?.errores?.puede_ver === true ||
    usuario?.permisos?.errores?.puede_editar === true ||
    puedeEditarUsuarios;
  const puedeUsarMensajes =
    esAdminCentral || usuario?.permisos?.mensajes?.puede_ver !== false;

  const cargarContadores = useCallback(async () => {
    if (!localStorage.getItem('token_erp')) return;

    if (puedeUsarMensajes) {
      api.get('/mensajes/no-leidos')
        .then(res => setMensajesNoLeidos(Number(res.data?.no_leidos || 0)))
        .catch(() => {});
    }

    if (puedeEditarUsuarios) {
      api.get('/usuarios/recuperaciones')
        .then(res => setPendientesRecuperacion(Number(res.data?.total_pendientes || 0)))
        .catch(() => {});
    } else {
      setPendientesRecuperacion(0);
    }

    if (puedeVerErrores) {
      api.get('/errores')
        .then(res => {
          const lista = Array.isArray(res.data) ? res.data : (res.data?.datos || []);
          const abiertos = lista.filter(e => e.estado !== 'RESUELTO' && e.estado !== 'CERRADO').length;
          setPendientesErrores(abiertos);
        })
        .catch(() => {});
    } else {
      setPendientesErrores(0);
    }
  }, [puedeUsarMensajes, puedeEditarUsuarios, puedeVerErrores]);

  useEffect(() => {
    cargarContadores();
    const intervalo = setInterval(cargarContadores, 25000);
    const listener = () => cargarContadores();
    window.addEventListener('actualizar_alertas_layout', listener);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener('actualizar_alertas_layout', listener);
    };
  }, [cargarContadores, vistaActual]);

  // Cerrar menú de usuario al hacer clic fuera y cerrar modales con tecla Escape
  useEffect(() => {
    const manejarClickFuera = (e) => {
      if (menuUsuarioRef.current && !menuUsuarioRef.current.contains(e.target)) {
        setMenuUsuarioAbierto(false);
      }
    };
    const manejarEscape = (e) => {
      if (e.key === 'Escape') {
        setMenuUsuarioAbierto(false);
        setMostrarModalBusqueda(false);
        setModalBug(false);
        setModalPassword(false);
      }
    };
    document.addEventListener('mousedown', manejarClickFuera);
    document.addEventListener('keydown', manejarEscape);
    return () => {
      document.removeEventListener('mousedown', manejarClickFuera);
      document.removeEventListener('keydown', manejarEscape);
    };
  }, []);

  const abrirModalCambiarPassword = () => {
    setMenuUsuarioAbierto(false);
    setFormPassword({ actual: '', nueva: '', confirmar: '' });
    setVerPass({ actual: false, nueva: false, confirmar: false });
    setModalPassword(true);
  };

  const handleGuardarMiPassword = async (e) => {
    e.preventDefault();
    if (!formPassword.actual) {
      toast.error('Escribe tu contraseña actual.');
      return;
    }
    if (!formPassword.nueva || formPassword.nueva.trim().length < 4) {
      toast.error('La nueva contraseña debe tener al menos 4 letras o números.');
      return;
    }
    if (formPassword.nueva !== formPassword.confirmar) {
      toast.error('Las dos contraseñas nuevas no son iguales. Revísalas con el botón del ojito.');
      return;
    }

    setGuardandoPassword(true);
    try {
      const res = await api.put('/auth/cambiar-password', {
        password_actual: formPassword.actual,
        password_nueva: formPassword.nueva
      });
      toast.success(res.data?.mensaje || '¡Tu contraseña se cambió con éxito!');
      setModalPassword(false);
      setFormPassword({ actual: '', nueva: '', confirmar: '' });
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cambiar la contraseña.');
    } finally {
      setGuardandoPassword(false);
    }
  };

  // Ejecutar búsqueda global con debounce
  const ejecutarBusqueda = async (query) => {
    if (!query) {
      setResultadosBusqueda(null);
      return;
    }
    const cleanQ = query.trim();
    if (cleanQ === '*7777#' || cleanQ === '*7777' || cleanQ.toLowerCase() === '*desbloqueo#') {
      localStorage.removeItem('erp_modo_emergencia');
      window.dispatchEvent(new Event('restaurar_modo_emergencia'));
      setTerminoBusqueda('');
      toast.success('🔓 Código de desbloqueo aceptado. Modo normal restaurado.');
      return;
    }
    if (cleanQ.length < 2) {
      setResultadosBusqueda(null);
      return;
    }
    setCargandoBusqueda(true);
    try {
      const res = await api.get(`/busqueda/global?q=${encodeURIComponent(query)}`);
      setResultadosBusqueda(res.data);
      setMostrarModalBusqueda(true);
      if (res.data.facturas?.length > 0) {
        setTabResultados('facturas');
      } else if (res.data.pedidos?.length > 0) {
        setTabResultados('pedidos');
      }
    } catch (err) {
      console.error('Error en búsqueda global:', err);
    } finally {
      setCargandoBusqueda(false);
    }
  };

  const handleInputBusqueda = (val) => {
    setTerminoBusqueda(val);
    if (buscadorTimeout.current) clearTimeout(buscadorTimeout.current);
    buscadorTimeout.current = setTimeout(() => {
      ejecutarBusqueda(val);
    }, 350);
  };

  const handleEnviarBug = async (e) => {
    e.preventDefault();
    if (!formBug.descripcion.trim()) {
      toast.error('Por favor cuéntanos qué problema ocurrió.');
      return;
    }
    setEnviandoBug(true);
    try {
      await api.post('/errores', {
        titulo: `Problema en ${formBug.modulo}: ${formBug.descripcion.slice(0, 45)}`,
        descripcion: `¿Qué estaba intentando hacer?: ${formBug.queHacia || 'No especificado'}\n¿Qué ocurrió?: ${formBug.descripcion}`,
        area_modulo: formBug.modulo,
        severidad: 'MEDIA'
      });
      toast.success('¡Gracias por avisar! Tu reporte quedó guardado.');
      setModalBug(false);
      setFormBug({ modulo: 'General', queHacia: '', descripcion: '' });
      cargarContadores();
    } catch (err) {
      toast.error('No se pudo enviar el reporte: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setEnviandoBug(false);
    }
  };

  const todosLosModulos = [
    { id: 'dashboard', nombre: 'Inicio', icono: <LayoutDashboard size={20} />, visible: true },
    { id: 'stock', nombre: 'Inventario', icono: <Package size={20} />, visible: tienePermisoVer('stock') },
    { id: 'productos', nombre: 'Productos', icono: <Tag size={20} />, visible: tienePermisoVer('productos') },
    { id: 'clientes', nombre: 'Clientes', icono: <Building2 size={20} />, visible: tienePermisoVer('clientes') },
    { id: 'pedidos', nombre: 'Pedidos', icono: <ShoppingCart size={20} />, visible: tienePermisoVer('pedidos') },
    { id: 'facturacion', nombre: 'Facturación', icono: <FileText size={20} />, visible: tienePermisoVer('facturacion') },
    { id: 'calidad', nombre: 'Calidad y Sanidad', icono: <ShieldCheck size={20} />, visible: tienePermisoVer('calidad') },
    { id: 'ubicaciones', nombre: 'Ubicaciones y Sedes', icono: <MapPin size={20} />, visible: tienePermisoVer('ubicaciones') || tienePermisoVer('organizacion') },
    { id: 'reuniones', nombre: 'Reuniones', icono: <Calendar size={20} />, visible: tienePermisoVer('reuniones') },
    {
      id: 'usuarios',
      nombre: 'Personal y Roles',
      icono: <Users size={20} />,
      visible: puedeVerUsuarios,
      badge: pendientesRecuperacion,
      badgeColor: 'bg-amber-400 text-slate-950'
    },
    {
      id: 'errores',
      nombre: 'Problemas Reportados',
      icono: <Bug size={20} />,
      visible: puedeVerErrores,
      badge: pendientesErrores,
      badgeColor: 'bg-red-500 text-white'
    }
  ];

  const menu = todosLosModulos.filter(m => m.visible);

  const inicialesUsuario = (usuario?.nombre || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');

  const tituloActivo =
    vistaActual === 'mensajes'
      ? 'Mensajes Internos'
      : (todosLosModulos.find(m => m.id === vistaActual)?.nombre || 'Inicio');

  const coincidenNuevas =
    formPassword.confirmar.length > 0 && formPassword.nueva === formPassword.confirmar;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* MENÚ LATERAL */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 pb-4">
          <h2 className="text-2xl font-bold !text-white tracking-tight" style={{ color: '#ffffff' }}>Mi ERP</h2>
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <span className="text-xs text-indigo-400 font-semibold">{usuario.rol}</span>
            <span className="text-slate-600">·</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              esProduccion ? 'bg-amber-400/20 text-amber-300' : 'bg-indigo-400/20 text-indigo-300'
            }`}>
              {esProduccion ? 'Producción' : 'Administración'}
            </span>
          </div>
          {usuario.nombre_ubicacion && (
            <p className="text-[11px] text-slate-400 mt-1 truncate">
              📍 {usuario.nombre_ubicacion}
            </p>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-1.5 mt-1 overflow-y-auto pb-4">
          {menu.map((item) => (
            <button
              key={item.id}
              onClick={() => setVistaActual(item.id)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                vistaActual === item.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3 truncate">
                {item.icono}
                <span className="font-medium text-sm truncate">{item.nombre}</span>
              </div>
              {item.badge > 0 && (
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* BARRA SUPERIOR */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between shrink-0 shadow-xs gap-4">
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:inline">
              Pantalla:
            </span>
            <span className="text-sm font-bold text-blue-950">
              {tituloActivo}
            </span>
          </div>

          {/* BUSCADOR GENERAL RÁPIDO PARA FACTURAS Y PEDIDOS */}
          <div className="relative flex-1 max-w-lg mx-2">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar pedidos o facturas (ej: 5 de noviembre, cliente: vikingos)..."
                value={terminoBusqueda}
                onChange={(e) => handleInputBusqueda(e.target.value)}
                onFocus={() => { if (resultadosBusqueda) setMostrarModalBusqueda(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ejecutarBusqueda(terminoBusqueda);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition-all shadow-2xs"
              />
              {cargandoBusqueda && (
                <Loader2 size={15} className="absolute right-3 top-2.5 text-indigo-500 animate-spin" />
              )}
              {terminoBusqueda && !cargandoBusqueda && (
                <button
                  onClick={() => { setTerminoBusqueda(''); setResultadosBusqueda(null); }}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* MENÚ DE USUARIO ("MI CUENTA") */}
          <div className="flex items-center space-x-3 shrink-0" ref={menuUsuarioRef}>
            {puedeEditarUsuarios && pendientesRecuperacion > 0 && (
              <button
                type="button"
                onClick={() => setVistaActual('usuarios')}
                title="Hay empleados que olvidaron su contraseña"
                className="hidden md:flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <KeyRound size={14} />
                <span>{pendientesRecuperacion} clave{pendientesRecuperacion > 1 ? 's' : ''} por restablecer</span>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
                className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 transition-all cursor-pointer"
                title="Abrir menú de mi cuenta"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {inicialesUsuario}
                </div>
                <div className="text-left hidden sm:block max-w-[150px]">
                  <p className="text-xs font-bold text-blue-950 truncate leading-tight">
                    {usuario.nombre}
                  </p>
                  <p className="text-[10px] font-semibold text-slate-500 truncate leading-tight">
                    {esProduccion ? 'Producción / Planta' : 'Administración'}
                  </p>
                </div>
                <ChevronDown size={15} className={`text-slate-500 transition-transform ${menuUsuarioAbierto ? 'rotate-180' : ''}`} />
              </button>

              {menuUsuarioAbierto && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                    <p className="text-sm font-bold text-blue-950 truncate">{usuario.nombre}</p>
                    <p className="text-xs text-slate-500 truncate">{usuario.email}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-md">
                        {usuario.rol}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        esProduccion
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {esProduccion ? 'Área: Producción' : 'Área: Administración'}
                      </span>
                    </div>
                    {usuario.nombre_ubicacion && (
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        📍 Sede: <strong className="text-slate-700">{usuario.nombre_ubicacion}</strong>
                      </p>
                    )}
                  </div>

                  <div className="py-1.5">
                    <button
                      type="button"
                      onClick={abrirModalCambiarPassword}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <KeyRound size={16} className="text-indigo-600" />
                      <span>Cambiar mi contraseña</span>
                    </button>

                    {puedeUsarMensajes && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuUsuarioAbierto(false);
                          setVistaActual('mensajes');
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <MessageSquare size={16} className="text-indigo-600" />
                          <span>Mis mensajes</span>
                        </span>
                        {mensajesNoLeidos > 0 && (
                          <span className="bg-indigo-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                            {mensajesNoLeidos}
                          </span>
                        )}
                      </button>
                    )}

                    {puedeEditarUsuarios && pendientesRecuperacion > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuUsuarioAbierto(false);
                          setVistaActual('usuarios');
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <AlertCircle size={16} className="text-amber-600" />
                          <span>Contraseñas olvidadas</span>
                        </span>
                        <span className="bg-amber-400 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          {pendientesRecuperacion}
                        </span>
                      </button>
                    )}

                    {puedeVerErrores && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuUsuarioAbierto(false);
                          setVistaActual('errores');
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Bug size={16} className="text-red-500" />
                          <span>Ver problemas reportados</span>
                        </span>
                        {pendientesErrores > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                            {pendientesErrores}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuUsuarioAbierto(false);
                        cerrarSesion();
                      }}
                      className="w-full px-4 py-2.5 text-left text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <LogOut size={16} />
                      <span>Cerrar sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ÁREA DE CONTENIDO */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          {children}
        </main>
      </div>

      {/* MODAL PARA CAMBIAR LA PROPIA CONTRASEÑA */}
      {modalPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setModalPassword(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyRound size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>Cambiar mi contraseña</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalPassword(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGuardarMiPassword} autoComplete="off" className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Escribe primero tu contraseña actual y luego la nueva contraseña que quieras usar (debe tener al menos <strong>4 letras o números</strong>).
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Tu contraseña actual *
                </label>
                <div className="relative">
                  <input
                    type={verPass.actual ? 'text' : 'password'}
                    name="mi_clave_actual"
                    autoComplete="current-password"
                    required
                    value={formPassword.actual}
                    onChange={(e) => setFormPassword({ ...formPassword, actual: e.target.value })}
                    placeholder="Escribe la contraseña con la que entraste"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass({ ...verPass, actual: !verPass.actual })}
                    title="Mostrar u ocultar"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {verPass.actual ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Tu nueva contraseña *
                </label>
                <div className="relative">
                  <input
                    type={verPass.nueva ? 'text' : 'password'}
                    name="mi_nueva_clave"
                    autoComplete="new-password"
                    required
                    minLength={4}
                    value={formPassword.nueva}
                    onChange={(e) => setFormPassword({ ...formPassword, nueva: e.target.value })}
                    placeholder="Mínimo 4 letras o números"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass({ ...verPass, nueva: !verPass.nueva })}
                    title="Mostrar u ocultar"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {verPass.nueva ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  3. Repite tu nueva contraseña *
                </label>
                <div className="relative">
                  <input
                    type={verPass.confirmar ? 'text' : 'password'}
                    name="mi_nueva_clave_repetir"
                    autoComplete="new-password"
                    required
                    minLength={4}
                    value={formPassword.confirmar}
                    onChange={(e) => setFormPassword({ ...formPassword, confirmar: e.target.value })}
                    placeholder="Vuelve a escribir la nueva contraseña"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass({ ...verPass, confirmar: !verPass.confirmar })}
                    title="Mostrar u ocultar"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {verPass.confirmar ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {formPassword.confirmar.length > 0 && (
                  <p className={`text-xs font-bold mt-1.5 flex items-center gap-1 ${
                    coincidenNuevas ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {coincidenNuevas ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>Las dos contraseñas nuevas son iguales</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} />
                        <span>Las contraseñas nuevas todavía no coinciden</span>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalPassword(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoPassword}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {guardandoPassword ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar mi nueva contraseña</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE RESULTADOS DE BÚSQUEDA GENERAL */}
      {mostrarModalBusqueda && resultadosBusqueda && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs pt-16 p-4"
          onClick={() => setMostrarModalBusqueda(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center space-x-2">
                  <Search size={18} className="text-indigo-600" />
                  <h3 className="text-base font-bold text-blue-950">
                    Resultados de Búsqueda Rápida
                  </h3>
                  <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">
                    {resultadosBusqueda.total} encontrados
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                  <span>Buscaste: <strong className="text-slate-800">"{resultadosBusqueda.consulta}"</strong></span>
                  {resultadosBusqueda.criterios?.dia && (
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      📅 Día: {resultadosBusqueda.criterios.dia}
                    </span>
                  )}
                  {resultadosBusqueda.criterios?.mes && (
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      📅 Mes: {resultadosBusqueda.criterios.mes}
                    </span>
                  )}
                  {resultadosBusqueda.criterios?.cliente && (
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      🏢 Cliente: {resultadosBusqueda.criterios.cliente}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setMostrarModalBusqueda(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex border-b border-slate-200 bg-white px-5 pt-3 space-x-4">
              <button
                onClick={() => setTabResultados('facturas')}
                className={`pb-2.5 text-xs font-bold transition-all flex items-center space-x-1.5 border-b-2 cursor-pointer ${
                  tabResultados === 'facturas'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText size={15} />
                <span>Facturas y Boletas ({resultadosBusqueda.facturas?.length || 0})</span>
              </button>

              <button
                onClick={() => setTabResultados('pedidos')}
                className={`pb-2.5 text-xs font-bold transition-all flex items-center space-x-1.5 border-b-2 cursor-pointer ${
                  tabResultados === 'pedidos'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShoppingCart size={15} />
                <span>Pedidos ({resultadosBusqueda.pedidos?.length || 0})</span>
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 divide-y divide-slate-100">
              {tabResultados === 'facturas' && (
                resultadosBusqueda.facturas?.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No se encontraron facturas ni boletas con esa búsqueda.
                  </div>
                ) : (
                  resultadosBusqueda.facturas.map((f) => (
                    <div
                      key={f.id_comprobante}
                      onClick={() => {
                        setMostrarModalBusqueda(false);
                        setVistaActual('facturacion');
                      }}
                      className="py-3 px-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <FileText size={18} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{f.codigo_formateado}</span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold border border-emerald-200">
                              {f.estado_sunat}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-blue-950 mt-0.5">{f.cliente_nombre || 'Cliente General'}</p>
                          <p className="text-xs text-slate-500">
                            RUC: {f.cliente_ruc || '-'} · Fecha: {new Date(f.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-blue-950 block">
                          S/ {parseFloat(f.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-indigo-600 font-semibold group-hover:underline flex items-center justify-end mt-0.5">
                          Abrir Facturación <ArrowRight size={12} className="ml-1" />
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}

              {tabResultados === 'pedidos' && (
                resultadosBusqueda.pedidos?.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No se encontraron pedidos con esa búsqueda.
                  </div>
                ) : (
                  resultadosBusqueda.pedidos.map((p) => (
                    <div
                      key={p.id_pedido}
                      onClick={() => {
                        setMostrarModalBusqueda(false);
                        setVistaActual('pedidos');
                      }}
                      className="py-3 px-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
                          <ShoppingCart size={18} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">Pedido #{p.id_pedido}</span>
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-200">
                              {p.estado_pedido}
                            </span>
                            {p.etiquetado && <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded">Etiquetado</span>}
                            {p.sellado_vacio && <span className="text-[9px] bg-cyan-50 text-cyan-700 px-1 rounded">Al Vacío</span>}
                          </div>
                          <p className="text-sm font-bold text-blue-950 mt-0.5">{p.cliente_nombre || 'Cliente General'}</p>
                          <p className="text-xs text-slate-500">
                            Creado por: {p.solicitado_por || p.usuario_creador || '-'} · Fecha: {new Date(p.creado_en).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-blue-950 block">
                          S/ {parseFloat(p.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-amber-600 font-semibold group-hover:underline flex items-center justify-end mt-0.5">
                          Abrir Pedidos <ArrowRight size={12} className="ml-1" />
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Haz clic fuera o presiona <strong>Esc</strong> para cerrar</span>
              <button
                onClick={() => setMostrarModalBusqueda(false)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTÓN FLOTANTE EN LA ESQUINA PARA MENSAJES INTERNOS (TODOS LOS EMPLEADOS) */}
      {puedeUsarMensajes && (
        <button
          onClick={() => setVistaActual('mensajes')}
          className="fixed bottom-5 right-20 z-40 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center gap-2 group cursor-pointer"
          title="Abrir chat con compañeros"
        >
          <MessageSquare size={20} />
          {mensajesNoLeidos > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-950 text-[10px] font-extrabold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center border-2 border-white">
              {mensajesNoLeidos}
            </span>
          )}
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out text-xs font-bold pr-1">
            Mensajes
          </span>
        </button>
      )}

      {/* BOTÓN FLOTANTE EN LA ESQUINA PARA REPORTAR PROBLEMAS */}
      <button
        onClick={() => setModalBug(true)}
        className="fixed bottom-5 right-5 z-40 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center gap-2 group cursor-pointer"
        title="Avisar de un problema o falla"
      >
        <Bug size={20} />
        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out text-xs font-bold pr-1">
          Reportar problema
        </span>
      </button>

      {/* MODAL SIMPLE DE REPORTE DE PROBLEMAS */}
      {modalBug && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setModalBug(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bug size={18} className="text-red-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>¿Algo no funcionó bien?</h3>
              </div>
              <button
                onClick={() => setModalBug(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEnviarBug} className="p-5 space-y-4">
              {puedeVerErrores && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-medium">
                    Pendientes por revisar: <strong>{pendientesErrores}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModalBug(false);
                      setVistaActual('errores');
                    }}
                    className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    Ver bandeja →
                  </button>
                </div>
              )}

              <p className="text-xs text-slate-500">
                Cuéntanos qué falló con tus propias palabras para poder ayudarte rápido.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ¿En qué pantalla estabas?
                </label>
                <select
                  value={formBug.modulo}
                  onChange={(e) => setFormBug({ ...formBug, modulo: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                >
                  <option value="General">General / No estoy seguro</option>
                  <option value="Inventario">Inventario</option>
                  <option value="Productos">Productos</option>
                  <option value="Pedidos">Pedidos</option>
                  <option value="Facturación">Facturación / Boletas</option>
                  <option value="Clientes">Clientes</option>
                  <option value="Ubicaciones">Ubicaciones y Sedes</option>
                  <option value="Calidad">Calidad y Sanidad</option>
                  <option value="Reuniones">Reuniones</option>
                  <option value="Personal y Roles">Personal y Roles</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ¿Qué querías hacer? <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Quise guardar un pedido nuevo"
                  value={formBug.queHacia}
                  onChange={(e) => setFormBug({ ...formBug, queHacia: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ¿Qué pasó? <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ej: Salió un cartel rojo o el botón no hizo nada..."
                  value={formBug.descripcion}
                  onChange={(e) => setFormBug({ ...formBug, descripcion: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalBug(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviandoBug}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 shadow-md shadow-red-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {enviandoBug ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <span>Enviar aviso</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
