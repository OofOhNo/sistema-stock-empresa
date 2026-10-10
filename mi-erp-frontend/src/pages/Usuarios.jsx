import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  Users, Shield, ShieldAlert, UserCheck, Briefcase, Lock, 
  FileText, ShieldCheck, History, Eye, RefreshCw, Filter, X, 
  UserPlus, ShieldPlus, CheckCircle, Phone, Search, Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';
import PermisosGrid from '../components/PermisosGrid';

export default function Usuarios({ usuarioLogueado }) {
  const [tabActual, setTabActual] = useState('personal'); // 'personal', 'permisos', 'auditoria'
  const [usuarios, setUsuarios] = useState([]);
  const [rolesDinamicos, setRolesDinamicos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [auditorias, setAuditorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(null);

  // Modales
  const [modalNuevoUsuario, setModalNuevoUsuario] = useState(false);
  const [modalNuevoRol, setModalNuevoRol] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Modal de Asignación de Teléfonos por Cliente
  const [modalCelularesUsuario, setModalCelularesUsuario] = useState(null);
  const [todosClientes, setTodosClientes] = useState([]);
  const [clientesSeleccionados, setClientesSeleccionados] = useState([]);
  const [filtroClienteBusqueda, setFiltroClienteBusqueda] = useState('');
  const [cargandoPermisosCel, setCargandoPermisosCel] = useState(false);
  const [guardandoPermisosCel, setGuardandoPermisosCel] = useState(false);

  // Form Nuevo Usuario
  const [formUsuario, setFormUsuario] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    rol_id: '',
    id_ubicacion: '',
    area: 'ADMINISTRACION',
    puede_ver_celulares: false
  });

  // Form Nuevo Rol
  const [formRol, setFormRol] = useState({
    nombre: '',
    descripcion: ''
  });

  // Filtro de auditoría
  const [filtroEntidad, setFiltroEntidad] = useState('todas');
  const [detalleModal, setDetalleModal] = useState(null);

  // Roles base con estilos e iconos
  const estiloRolMap = {
    1: { icono: <ShieldAlert size={16} className="text-red-500" />, color: 'bg-red-100 text-red-700 border-red-200' },
    2: { icono: <Shield size={16} className="text-indigo-500" />, color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    3: { icono: <Briefcase size={16} className="text-blue-500" />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    4: { icono: <UserCheck size={16} className="text-emerald-500" />, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  };

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resUsers, resRoles, resUbic] = await Promise.all([
        api.get('/usuarios'),
        api.get('/usuarios/roles'),
        api.get('/ubicaciones')
      ]);

      setUsuarios(resUsers.data.datos || []);
      const rolesList = resRoles.data.datos || [];
      setRolesDinamicos(rolesList);
      setUbicaciones(resUbic.data.ubicaciones || resUbic.data.datos || []);

      if (rolesList.length > 0 && !formUsuario.rol_id) {
        setFormUsuario(prev => ({ ...prev, rol_id: rolesList[0].id_rol }));
      }
      const ubList = resUbic.data.ubicaciones || resUbic.data.datos || [];
      if (ubList.length > 0 && !formUsuario.id_ubicacion) {
        setFormUsuario(prev => ({ ...prev, id_ubicacion: ubList[0].id_ubicacion }));
      }
    } catch (err) {
      setError('Error al cargar la lista de personal y configuración.');
    } finally {
      setCargando(false);
    }
  };

  const cargarAuditorias = async () => {
    setCargandoAuditoria(true);
    try {
      const res = await api.get('/auditoria');
      setAuditorias(res.data.datos || []);
    } catch (err) {
      toast.error('Error al cargar logs de auditoría: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargandoAuditoria(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    if (tabActual === 'auditoria') {
      cargarAuditorias();
    }
  }, [tabActual]);

  const cambiarRol = async (idUsuario, nuevoRol) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium">¿Seguro que deseas cambiar el rol a este usuario? Esto modificará sus accesos inmediatamente.</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => { toast.dismiss(t.id); ejecutarCambioRol(idUsuario, nuevoRol); }}
            className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold"
          >
            Sí, cambiar
          </button>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="bg-slate-200 text-slate-800 px-3 py-1 rounded text-xs font-bold"
          >
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const ejecutarCambioRol = async (idUsuario, nuevoRol) => {
    setActualizando(idUsuario);
    try {
      const res = await api.put(`/usuarios/${idUsuario}/rol`, { nuevo_rol: nuevoRol });
      toast.success(res.data.mensaje);
      cargarDatos();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setActualizando(null);
    }
  };

  const actualizarConfiguracion = async (idUsuario, puede_ver_celulares, area) => {
    setActualizando(idUsuario);
    try {
      const res = await api.put(`/usuarios/${idUsuario}/configuracion`, { puede_ver_celulares, area });
      toast.success(res.data.mensaje);
      cargarDatos();
      if (idUsuario === usuarioLogueado.id_usuario) {
        const actualizado = { ...usuarioLogueado, puede_ver_celulares, area };
        localStorage.setItem('usuario_erp', JSON.stringify(actualizado));
      }
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setActualizando(null);
    }
  };

  // Abrir Modal de Permisos de Celular por Cliente
  const abrirModalPermisosCelular = async (user) => {
    setModalCelularesUsuario(user);
    setCargandoPermisosCel(true);
    setFiltroClienteBusqueda('');
    try {
      const [resClientes, resPermisos] = await Promise.all([
        api.get('/clientes'),
        api.get(`/clientes/permisos-usuario/${user.id_usuario}`)
      ]);
      setTodosClientes(resClientes.data.datos || resClientes.data || []);
      setClientesSeleccionados(resPermisos.data.clientes_permitidos || []);
    } catch (err) {
      toast.error('Error al cargar clientes y permisos: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargandoPermisosCel(false);
    }
  };

  const toggleClientePermiso = (idCliente) => {
    setClientesSeleccionados(prev => 
      prev.includes(idCliente)
        ? prev.filter(id => id !== idCliente)
        : [...prev, idCliente]
    );
  };

  const seleccionarTodosClientes = () => {
    if (clientesSeleccionados.length === todosClientes.length) {
      setClientesSeleccionados([]);
    } else {
      setClientesSeleccionados(todosClientes.map(c => c.id_cliente));
    }
  };

  const guardarPermisosCelular = async () => {
    if (!modalCelularesUsuario) return;
    setGuardandoPermisosCel(true);
    try {
      await api.put(`/clientes/permisos-usuario/${modalCelularesUsuario.id_usuario}`, {
        clientes_ids: clientesSeleccionados
      });
      toast.success(`Teléfonos autorizados guardados para ${modalCelularesUsuario.nombre_completo}`);
      setModalCelularesUsuario(null);
      cargarDatos();
    } catch (err) {
      toast.error('Error al guardar permisos: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardandoPermisosCel(false);
    }
  };

  // Guardar Nuevo Usuario
  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    if (!formUsuario.nombre_completo || !formUsuario.email || !formUsuario.password) {
      return toast.error('Completa los campos obligatorios.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/usuarios', formUsuario);
      toast.success(res.data.mensaje || 'Usuario creado exitosamente');
      setModalNuevoUsuario(false);
      setFormUsuario({
        nombre_completo: '',
        email: '',
        password: '',
        rol_id: rolesDinamicos[0]?.id_rol || 4,
        id_ubicacion: ubicaciones[0]?.id_ubicacion || 1,
        area: 'ADMINISTRACION',
        puede_ver_celulares: false
      });
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al crear usuario');
    } finally {
      setGuardando(false);
    }
  };

  // Guardar Nuevo Rol
  const handleCrearRol = async (e) => {
    e.preventDefault();
    if (!formRol.nombre.trim()) {
      return toast.error('El nombre del rol es obligatorio.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/usuarios/roles', formRol);
      toast.success(res.data.mensaje || 'Rol creado exitosamente');
      setModalNuevoRol(false);
      setFormRol({ nombre: '', descripcion: '' });
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al crear rol');
    } finally {
      setGuardando(false);
    }
  };

  // Protección de la pantalla
  if (usuarioLogueado?.rol !== 'Admin Central' && usuarioLogueado?.rol !== 'Administrador') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <Lock size={64} className="text-red-400 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Acceso Restringido</h2>
        <p className="text-slate-500 mt-2">No tienes los permisos necesarios para gestionar el personal ni la auditoría.</p>
      </div>
    );
  }

  if (cargando) return <div className="text-slate-500 p-8 font-medium">Cargando directorio de personal y roles...</div>;
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl m-8">{error}</div>;

  const auditoriasFiltradas = auditorias.filter(a => {
    if (filtroEntidad === 'todas') return true;
    return a.entidad === filtroEntidad;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-md">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Personal, Permisos y Roles</h1>
            <p className="text-slate-500 text-sm">Gestión de usuarios manual, creación de roles ilimitados, matriz de accesos y auditoría</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabActual === 'personal' && (
            <>
              <button
                onClick={() => setModalNuevoRol(true)}
                className="flex items-center space-x-2 px-3.5 py-2.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-xl text-sm font-semibold transition-all shadow-xs"
              >
                <ShieldPlus size={16} />
                <span>+ Nuevo Rol</span>
              </button>

              <button
                onClick={() => setModalNuevoUsuario(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-600/20"
              >
                <UserPlus size={16} />
                <span>+ Crear Usuario</span>
              </button>
            </>
          )}

          {tabActual === 'auditoria' && (
            <button
              onClick={cargarAuditorias}
              disabled={cargandoAuditoria}
              className="flex items-center space-x-2 px-3 py-2 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-colors"
            >
              <RefreshCw size={16} className={cargandoAuditoria ? 'animate-spin' : ''} />
              <span>Actualizar Logs</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
        <button
          onClick={() => setTabActual('personal')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${
            tabActual === 'personal' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} />
          <span>Personal y Roles ({usuarios.length})</span>
        </button>
        <button
          onClick={() => setTabActual('permisos')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${
            tabActual === 'permisos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck size={16} />
          <span>Matriz de Permisos</span>
        </button>
        <button
          onClick={() => setTabActual('auditoria')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${
            tabActual === 'auditoria' ? 'bg-white text-red-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={16} />
          <span>Auditoría ("Quién Hizo Qué")</span>
          {auditorias.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
              {auditorias.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PERSONAL Y ROLES */}
      {tabActual === 'personal' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Nombre del Empleado</th>
                  <th className="p-4 font-semibold">Email (Usuario)</th>
                  <th className="p-4 font-semibold">Sede / Ubicación</th>
                  <th className="p-4 font-semibold">Rol Actual</th>
                  <th className="p-4 font-semibold text-center">Asignar Rol</th>
                  <th className="p-4 font-semibold text-center">Área (Horario)</th>
                  <th className="p-4 font-semibold text-center">📱 Teléfonos por Cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {usuarios.map((user) => {
                  const estilo = estiloRolMap[user.rol_id] || { 
                    icono: <Shield size={16} className="text-purple-500" />, 
                    color: 'bg-purple-100 text-purple-700 border-purple-200' 
                  };
                  const esYoMismo = user.id_usuario === usuarioLogueado.id_usuario;

                  return (
                    <tr key={user.id_usuario} className={`hover:bg-slate-50 transition-colors ${esYoMismo ? 'bg-indigo-50/20' : ''}`}>
                      <td className="p-4">
                        <div className="font-bold text-slate-900 flex items-center space-x-2">
                          <span>{user.nombre_completo}</span>
                          {esYoMismo && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Tú</span>}
                        </div>
                      </td>
                      <td className="p-4 text-slate-500">{user.email}</td>
                      <td className="p-4 text-slate-600 font-medium">
                        {user.nombre_ubicacion || 'Sede Central'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          {estilo.icono}
                          <span className={`px-2 py-1 rounded-md text-xs font-bold border ${estilo.color}`}>
                            {user.nombre_rol}
                          </span>
                        </div>
                      </td>
                      
                      {/* Asignar Rol */}
                      <td className="p-4 text-center">
                        <div className="flex justify-center">
                          <select
                            disabled={actualizando === user.id_usuario || esYoMismo}
                            value={user.rol_id}
                            onChange={(e) => cambiarRol(user.id_usuario, Number(e.target.value))}
                            className="bg-white border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-100 cursor-pointer"
                            title={esYoMismo ? "No puedes cambiar tu propio rol por seguridad." : "Selecciona para cambiar permisos"}
                          >
                            {rolesDinamicos.map(rol => (
                              <option key={rol.id_rol} value={rol.id_rol}>{rol.nombre}</option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Área: Administración vs Producción */}
                      <td className="p-4 text-center">
                        <div className="flex justify-center">
                          <select
                            disabled={actualizando === user.id_usuario}
                            value={user.area || 'ADMINISTRACION'}
                            onChange={(e) => actualizarConfiguracion(user.id_usuario, user.puede_ver_celulares, e.target.value)}
                            className="bg-white border border-slate-300 rounded-lg text-xs px-2.5 py-1.5 focus:outline-hidden focus:border-indigo-500 font-semibold cursor-pointer"
                          >
                            <option value="ADMINISTRACION">Administración (Hora Real)</option>
                            <option value="PRODUCCION">Producción (1h Menos)</option>
                          </select>
                        </div>
                      </td>

                      {/* Permiso Celulares Clientes */}
                      <td className="p-4 text-center">
                        {user.nombre_rol === 'Admin Central' ? (
                          <span className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                            <ShieldCheck size={14} />
                            <span>Todos (Admin)</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => abrirModalPermisosCelular(user)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                            title="Asignar de qué clientes puede ver los teléfonos"
                          >
                            <Phone size={13} />
                            <span>
                              {user.total_clientes_autorizados > 0 
                                ? `${user.total_clientes_autorizados} cliente(s)` 
                                : '0 clientes (Asignar)'}
                            </span>
                          </button>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Diccionario de Roles */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Catálogo de Roles Disponibles ({rolesDinamicos.length})
              </h3>
              <button 
                onClick={() => setModalNuevoRol(true)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                + Añadir otro rol
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {rolesDinamicos.map(rol => {
                const estilo = estiloRolMap[rol.id_rol] || { 
                  icono: <Shield size={16} className="text-purple-500" />, 
                  color: 'bg-purple-100 text-purple-700 border-purple-200' 
                };
                return (
                  <div key={rol.id_rol} className="flex items-start space-x-3 bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs">
                    <div className="mt-0.5">{estilo.icono}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-slate-800 text-sm truncate">{rol.nombre}</p>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          {rol.total_usuarios || 0} pers.
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1 line-clamp-2">
                        {rol.descripcion || 'Rol personalizado con permisos ajustables en matriz.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MATRIZ DE PERMISOS */}
      {tabActual === 'permisos' && (
        <PermisosGrid />
      )}

      {/* TAB 3: AUDITORÍA INMUTABLE */}
      {tabActual === 'auditoria' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setFiltroEntidad('todas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'todas' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todas las tablas ({auditorias.length})
            </button>
            <button
              onClick={() => setFiltroEntidad('movimientos_kardex')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'movimientos_kardex' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Stock / Kardex
            </button>
            <button
              onClick={() => setFiltroEntidad('comprobantes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'comprobantes' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Facturación SUNAT
            </button>
            <button
              onClick={() => setFiltroEntidad('pedidos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'pedidos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Pedidos
            </button>
            <button
              onClick={() => setFiltroEntidad('usuarios')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'usuarios' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Usuarios / Roles
            </button>
            <button
              onClick={() => setFiltroEntidad('productos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'productos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Productos
            </button>
            <button
              onClick={() => setFiltroEntidad('ubicaciones')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filtroEntidad === 'ubicaciones' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Ubicaciones
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {cargandoAuditoria ? (
              <div className="p-12 text-center text-slate-500 font-medium">Cargando trazabilidad de auditoría...</div>
            ) : auditoriasFiltradas.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No se registraron eventos de auditoría para este filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-semibold">ID</th>
                      <th className="p-4 font-semibold">Fecha / Hora</th>
                      <th className="p-4 font-semibold">Usuario Responsable</th>
                      <th className="p-4 font-semibold">Acción</th>
                      <th className="p-4 font-semibold">Entidad / Registro</th>
                      <th className="p-4 font-semibold text-center">Snapshot JSON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {auditoriasFiltradas.map((aud) => (
                      <tr key={aud.id_auditoria} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-mono text-xs text-slate-400 font-bold">
                          #{aud.id_auditoria}
                        </td>
                        <td className="p-4 text-slate-600 text-xs font-mono">
                          {new Date(aud.fecha).toLocaleDateString('es-ES', { 
                            day: '2-digit', month: 'short', year: 'numeric', 
                            hour: '2-digit', minute: '2-digit', second: '2-digit' 
                          })}
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-slate-900">{aud.usuario_nombre || 'Sistema / Automático'}</div>
                          <div className="text-xs text-slate-400">{aud.usuario_email || '-'} · <span className="font-bold text-slate-600">{aud.usuario_rol || 'Sistema'}</span></div>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-slate-900 text-white font-mono">
                            {aud.accion}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-slate-800 text-xs capitalize">{aud.entidad}</div>
                          {aud.id_entidad && (
                            <span className="text-xs text-slate-400 font-mono">ID: {aud.id_entidad}</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setDetalleModal(aud)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            <Eye size={14} />
                            <span>Ver Datos</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Crear Usuario Manualmente */}
      {modalNuevoUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Registrar Nuevo Usuario</h3>
                  <p className="text-xs text-slate-500">Añadir usuario con rol, sede y accesos asignados</p>
                </div>
              </div>
              <button onClick={() => setModalNuevoUsuario(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearUsuario} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nombre Completo *</label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: Roberto Gómez"
                  value={formUsuario.nombre_completo}
                  onChange={(e) => setFormUsuario({ ...formUsuario, nombre_completo: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Email / Usuario *</label>
                  <input 
                    type="email"
                    required
                    placeholder="correo@empresa.com"
                    value={formUsuario.email}
                    onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contraseña *</label>
                  <input 
                    type="password"
                    required
                    placeholder="••••••••"
                    value={formUsuario.password}
                    onChange={(e) => setFormUsuario({ ...formUsuario, password: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Rol *</label>
                  <select 
                    value={formUsuario.rol_id}
                    onChange={(e) => setFormUsuario({ ...formUsuario, rol_id: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                  >
                    {rolesDinamicos.map(r => (
                      <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Sede / Ubicación *</label>
                  <select 
                    value={formUsuario.id_ubicacion}
                    onChange={(e) => setFormUsuario({ ...formUsuario, id_ubicacion: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                  >
                    {ubicaciones.map(u => (
                      <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Área Funcional</label>
                <select 
                  value={formUsuario.area}
                  onChange={(e) => setFormUsuario({ ...formUsuario, area: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                >
                  <option value="ADMINISTRACION">Administración (Horario Real)</option>
                  <option value="PRODUCCION">Producción (Horario con -1h)</option>
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input 
                    type="checkbox"
                    checked={formUsuario.puede_ver_celulares}
                    onChange={(e) => setFormUsuario({ ...formUsuario, puede_ver_celulares: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-800">Permitir ver teléfonos de clientes</span>
                    <p className="text-xs text-slate-500">Si está desactivado, los números se mostrarán como confidenciales.</p>
                  </div>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevoUsuario(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear Nuevo Rol */}
      {modalNuevoRol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <ShieldPlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Crear Nuevo Rol</h3>
                  <p className="text-xs text-slate-500">Se registrará en la matriz de permisos para su personalización</p>
                </div>
              </div>
              <button onClick={() => setModalNuevoRol(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearRol} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nombre del Rol *</label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: Supervisor de Calidad, Auditor Externo"
                  value={formRol.nombre}
                  onChange={(e) => setFormRol({ ...formRol, nombre: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Descripción de Funciones</label>
                <textarea 
                  rows={3}
                  placeholder="Detalla las responsabilidades o alcance de este rol en la empresa..."
                  value={formRol.descripcion}
                  onChange={(e) => setFormRol({ ...formRol, descripcion: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              <div className="bg-purple-50 p-3 rounded-xl border border-purple-100 text-xs text-purple-700">
                Al crear el rol, aparecerá de inmediato en la <strong>Matriz de Permisos</strong> para que actives individualmente sus privilegios de lectura o edición.
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevoRol(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Crear Rol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalle Snapshot JSON */}
      {detalleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Detalle de Auditoría #{detalleModal.id_auditoria}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Acción: <strong className="text-slate-800">{detalleModal.accion}</strong> · Entidad: <strong className="text-slate-800">{detalleModal.entidad}</strong>
                </p>
              </div>
              <button onClick={() => setDetalleModal(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Estado Anterior
                  </h4>
                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                    {detalleModal.antes ? JSON.stringify(detalleModal.antes, null, 2) : 'null (Creación inicial)'}
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Estado Posterior
                  </h4>
                  <pre className="p-3 bg-slate-900 text-emerald-300 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-60">
                    {detalleModal.despues ? JSON.stringify(detalleModal.despues, null, 2) : 'null (Eliminación)'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex justify-end p-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setDetalleModal(null)}
                className="px-5 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Asignar Permisos de Teléfonos por Cliente */}
      {modalCelularesUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            
            {/* Header del modal */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                  <Phone size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-blue-950">
                    Visibilidad de Teléfonos de Clientes
                  </h3>
                  <p className="text-xs text-slate-500">
                    Usuario: <strong className="text-slate-800">{modalCelularesUsuario.nombre_completo}</strong> ({modalCelularesUsuario.nombre_rol})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setModalCelularesUsuario(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Sub-header con buscador y botones rápidos */}
            <div className="p-4 border-b border-slate-100 bg-white space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Selecciona específicamente qué clientes podrá ver el celular este usuario. Para los clientes no seleccionados, el teléfono se mostrará protegido como <em>(Oculto por permisos)</em>.
              </p>

              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por nombre comercial, razón social o RUC..."
                    value={filtroClienteBusqueda}
                    onChange={(e) => setFiltroClienteBusqueda(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={seleccionarTodosClientes}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl whitespace-nowrap transition-colors"
                >
                  {clientesSeleccionados.length === todosClientes.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>
                  Autorizados: <strong className="text-indigo-600 font-bold">{clientesSeleccionados.length}</strong> de {todosClientes.length} clientes
                </span>
                {filtroClienteBusqueda && (
                  <span className="text-[11px] text-slate-400">Filtrando por "{filtroClienteBusqueda}"</span>
                )}
              </div>
            </div>

            {/* Lista con checkboxes */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
              {cargandoPermisosCel ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 size={24} className="animate-spin text-indigo-600" />
                  <span className="text-xs">Cargando directorio de clientes...</span>
                </div>
              ) : todosClientes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No hay clientes registrados en el sistema.
                </div>
              ) : (
                todosClientes
                  .filter((c) => {
                    if (!filtroClienteBusqueda.trim()) return true;
                    const b = filtroClienteBusqueda.toLowerCase();
                    return (
                      (c.razon_social_o_nombre && c.razon_social_o_nombre.toLowerCase().includes(b)) ||
                      (c.nombre_comercial && c.nombre_comercial.toLowerCase().includes(b)) ||
                      (c.numero_documento && c.numero_documento.includes(b))
                    );
                  })
                  .map((c) => {
                    const seleccionado = clientesSeleccionados.includes(c.id_cliente);
                    return (
                      <label 
                        key={c.id_cliente}
                        className={`flex items-center justify-between py-2.5 px-3 rounded-xl cursor-pointer transition-colors ${
                          seleccionado ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 pr-3">
                          <input 
                            type="checkbox"
                            checked={seleccionado}
                            onChange={() => toggleClientePermiso(c.id_cliente)}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-blue-950 truncate">
                              {c.nombre_comercial || c.razon_social_o_nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">
                              RUC: {c.numero_documento || '-'} {c.contacto ? `· Contacto: ${c.contacto}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                            seleccionado 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' 
                              : 'bg-slate-100 text-slate-400 border-slate-200'
                          }`}>
                            {c.celular || 'Sin cel.'}
                          </span>
                        </div>
                      </label>
                    );
                  })
              )}
            </div>

            {/* Footer con botones de acción */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setModalCelularesUsuario(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoPermisosCel || cargandoPermisosCel}
                onClick={guardarPermisosCelular}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 disabled:opacity-50"
              >
                {guardandoPermisosCel ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Permisos</span>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}