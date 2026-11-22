import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  Users, Shield, ShieldAlert, UserCheck, Briefcase, Lock,
  ShieldCheck, History, Eye, EyeOff, RefreshCw, X,
  UserPlus, ShieldPlus, Phone, Search, Loader2,
  Trash2, AlertTriangle, Layers, KeyRound, Copy, CheckCircle2,
  Clock, Mail, Save, Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import PermisosGrid from '../components/PermisosGrid';
import {
  OPCIONES_DURACION_SESION,
  formatearDuracionSesionLegible
} from '../utils/sesionRol';
import { exportarTablaExcel, fechaHoraLocalTexto } from '../utils/excelExport';
import BotonExportarExcel from '../components/BotonExportarExcel';

const TRADUCCION_ACCION = {
  CREAR_USUARIO: 'Creó un nuevo empleado',
  ELIMINAR_USUARIO: 'Eliminó / desactivó un empleado',
  CAMBIAR_ROL_USUARIO: 'Cambió el rol de un empleado',
  MOVER_SEDE_USUARIO: 'Movió a un empleado de sede',
  ACTUALIZAR_CONFIGURACION_USUARIO: 'Actualizó configuración de un empleado',
  CREAR_DIVISION: 'Creó un área / división',
  ACTUALIZAR_DIVISION: 'Actualizó un área / división',
  ELIMINAR_DIVISION: 'Eliminó un área / división',
  RESTABLECER_PASSWORD_USUARIO: 'Puso una nueva contraseña a un empleado',
  CAMBIAR_PROPIA_PASSWORD: 'Cambió su propia contraseña',
  SOLICITAR_RECUPERACION_PASSWORD: 'Pidió ayuda por contraseña olvidada',
  ACTUALIZAR_PERMISOS: 'Modificó permisos de un rol',
  ACTUALIZAR_PERMISO_UBICACIONES_ROL: 'Cambió acceso a otras sedes de un rol',
  ACTUALIZAR_DURACION_SESION_ROL: 'Cambió el tiempo máximo de sesión de un rol',
  ACTUALIZAR_JERARQUIA_ROL: 'Cambió el nivel jerárquico de un rol',
  CONFIGURAR_LOGIN_GOOGLE: 'Configuró el acceso con correo corporativo (Google)',
  LOGIN_GOOGLE: 'Inició sesión con correo corporativo (Google)',
  CREAR_ROL: 'Creó un nuevo rol',
  CREAR_REUNION: 'Programó una reunión',
  EDITAR_REUNION: 'Editó una reunión',
  ACTUALIZAR_ESTADO_PAGO_COMPROBANTE: 'Actualizó el estado de pago de un comprobante',
  CREAR_PEDIDO: 'Registró un nuevo pedido',
  CAMBIAR_ESTADO_PEDIDO: 'Marcó pedido listo para despacho',
  DESPACHAR_PEDIDO: 'Entregó / despachó un pedido',
  CANCELAR_PEDIDO: 'Canceló un pedido',
  EMITIR_COMPROBANTE: 'Emitió una factura o boleta',
  ANULAR_COMPROBANTE: 'Anuló un comprobante (devolvió stock)',
  REGISTRAR_KARDEX: 'Registró entrada o salida de inventario',
  ANULAR_MOVIMIENTO_KARDEX: 'Anuló un movimiento de inventario',
  CREAR_PRODUCTO: 'Creó un producto',
  ACTUALIZAR_PRODUCTO: 'Modificó un producto',
  ELIMINAR_PRODUCTO: 'Desactivó un producto',
  CREAR_CLIENTE: 'Registró un cliente',
  ACTUALIZAR_CLIENTE: 'Actualizó datos de un cliente'
};

const TRADUCCION_ENTIDAD = {
  movimientos_kardex: 'Inventario',
  comprobantes: 'Facturación',
  pedidos: 'Pedidos',
  usuarios: 'Personal y Roles',
  roles: 'Roles',
  roles_permisos: 'Permisos',
  productos: 'Productos',
  ubicaciones: 'Ubicaciones',
  divisiones: 'Áreas / Divisiones',
  clientes: 'Clientes'
};

function formatearClaveHumana(clave) {
  return String(clave || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function ResumenDatosLegible({ datos, textoVacio }) {
  if (!datos || (typeof datos === 'object' && Object.keys(datos).length === 0)) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 italic">
        {textoVacio}
      </div>
    );
  }
  if (typeof datos !== 'object') {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
        {String(datos)}
      </div>
    );
  }

  const entradas = Object.entries(datos).filter(([k]) => !k.toLowerCase().includes('password_hash'));
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200/70 overflow-hidden">
      {entradas.map(([clave, valor]) => {
        let textoValor;
        if (valor === null || valor === undefined) textoValor = '-';
        else if (typeof valor === 'boolean') textoValor = valor ? 'Sí' : 'No';
        else if (typeof valor === 'object') textoValor = JSON.stringify(valor);
        else textoValor = String(valor);

        return (
          <div key={clave} className="px-3 py-2 flex items-start justify-between gap-3 text-xs">
            <span className="font-semibold text-slate-500">{formatearClaveHumana(clave)}:</span>
            <span className="font-bold text-slate-800 text-right break-all">{textoValor}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Usuarios({ usuarioLogueado, onPermisosActualizados }) {
  const [tabActual, setTabActual] = useState('personal');
  const [usuarios, setUsuarios] = useState([]);
  const [rolesDinamicos, setRolesDinamicos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [auditorias, setAuditorias] = useState([]);
  const [solicitudesRecuperacion, setSolicitudesRecuperacion] = useState([]);
  const [empleadoElegidoPorSolicitud, setEmpleadoElegidoPorSolicitud] = useState({});

  const [cargando, setCargando] = useState(true);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(null);

  const [filtroRolPersonal, setFiltroRolPersonal] = useState('todos');
  const [usuarioAEliminar, setUsuarioAEliminar] = useState(null);
  const [eliminandoUsuario, setEliminandoUsuario] = useState(false);

  const esAdminCentral =
    usuarioLogueado?.rol === 'Admin Central' || usuarioLogueado?.nombre_rol === 'Admin Central';
  const puedeEditarUsuarios =
    esAdminCentral || usuarioLogueado?.permisos?.usuarios?.puede_editar === true;
  const puedeVerUsuarios =
    puedeEditarUsuarios || usuarioLogueado?.permisos?.usuarios?.puede_ver === true;

  // Modales
  const [modalNuevoUsuario, setModalNuevoUsuario] = useState(false);
  const [verPasswordNuevo, setVerPasswordNuevo] = useState(true);
  const [modalNuevoRol, setModalNuevoRol] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Modal Restablecer Contraseña de Empleado (Olvido o cambio por encargado)
  const [modalResetUsuario, setModalResetUsuario] = useState(null); // { usuario, id_solicitud? }
  const [nuevaClaveReset, setNuevaClaveReset] = useState('');
  const [verClaveReset, setVerClaveReset] = useState(true);
  const [guardandoReset, setGuardandoReset] = useState(false);

  // Modal de cambio de rol con confirmación clara
  const [cambioRolPendiente, setCambioRolPendiente] = useState(null); // { user, nuevoRolId, nombreNuevoRol }

  // Modal de Asignación de Teléfonos por Cliente
  const [modalCelularesUsuario, setModalCelularesUsuario] = useState(null);
  const [todosClientes, setTodosClientes] = useState([]);
  const [clientesSeleccionados, setClientesSeleccionados] = useState([]);
  const [filtroClienteBusqueda, setFiltroClienteBusqueda] = useState('');
  const [cargandoPermisosCel, setCargandoPermisosCel] = useState(false);
  const [guardandoPermisosCel, setGuardandoPermisosCel] = useState(false);

  const [formUsuario, setFormUsuario] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    rol_id: '',
    id_ubicacion: '',
    area: 'ADMINISTRACION',
    puede_ver_celulares: false,
    seccion_facturacion: 'AMBAS',
    telefono_whatsapp: ''
  });

  const [formRol, setFormRol] = useState({
    nombre: '',
    descripcion: '',
    duracion_sesion_minutos: '',
    nivel_jerarquia: 4
  });

  const [editandoWhatsappUser, setEditandoWhatsappUser] = useState(null); // { id_usuario, telefono }
  const [configGoogle, setConfigGoogle] = useState({
    google_habilitado: false,
    google_client_id: '',
    dominios_corporativos: ''
  });
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  const [guardandoGoogle, setGuardandoGoogle] = useState(false);

  const [filtroEntidad, setFiltroEntidad] = useState('todas');
  const [detalleModal, setDetalleModal] = useState(null);

  const estiloRolMap = {
    1: { icono: <ShieldAlert size={16} className="text-red-500" />, color: 'bg-red-100 text-red-700 border-red-200' },
    2: { icono: <Shield size={16} className="text-indigo-500" />, color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    3: { icono: <Briefcase size={16} className="text-blue-500" />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    4: { icono: <UserCheck size={16} className="text-emerald-500" />, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  };

  const cargarSolicitudesRecuperacion = async () => {
    if (!puedeEditarUsuarios) return;
    try {
      const res = await api.get('/usuarios/recuperaciones');
      setSolicitudesRecuperacion(res.data?.solicitudes || []);
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      // Silencioso si no hay permisos
    }
  };

  const cargarDatos = useCallback(async (silencioso = false) => {
    if (!puedeVerUsuarios) {
      setCargando(false);
      return;
    }
    if (!silencioso) setCargando(true);
    try {
      const promesas = [
        api.get('/usuarios'),
        api.get('/usuarios/roles'),
        api.get('/ubicaciones')
      ];
      if (puedeEditarUsuarios) {
        promesas.push(api.get('/usuarios/recuperaciones').catch(() => ({ data: { solicitudes: [] } })));
      }

      const [resUsers, resRoles, resUbic, resRecup] = await Promise.all(promesas);

      setUsuarios(resUsers.data.datos || []);
      const rolesList = resRoles.data.datos || [];
      setRolesDinamicos(rolesList);
      const ubList = resUbic.data.ubicaciones || resUbic.data.datos || [];
      setUbicaciones(ubList);
      if (resRecup) {
        setSolicitudesRecuperacion(resRecup.data?.solicitudes || []);
      }

      const rolesPermitidosParaCrear = esAdminCentral
        ? rolesList
        : rolesList.filter(r => r.nombre !== 'Admin Central');
      const rolDefault = rolesPermitidosParaCrear[rolesPermitidosParaCrear.length - 1] || rolesPermitidosParaCrear[0];

      setFormUsuario(prev => ({
        ...prev,
        rol_id: prev.rol_id || rolDefault?.id_rol || '',
        id_ubicacion: prev.id_ubicacion || ubList[0]?.id_ubicacion || ''
      }));
    } catch {
      if (!silencioso) {
        setError('No se pudo cargar la lista de personal y roles.');
      }
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [puedeVerUsuarios, puedeEditarUsuarios, esAdminCentral]);

  const cargarAuditorias = useCallback(async () => {
    setCargandoAuditoria(true);
    try {
      const res = await api.get('/auditoria');
      setAuditorias(res.data.datos || []);
    } catch (err) {
      toast.error('No se pudo cargar el historial: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargandoAuditoria(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarDatos();
    });
    return () => {
      alive = false;
    };
  }, [cargarDatos]);

  const cargarConfigGoogle = useCallback(async () => {
    if (!esAdminCentral) return;
    setCargandoGoogle(true);
    try {
      const res = await api.get('/auth/config-corporativa');
      const cfg = res.data?.config;
      if (cfg) {
        setConfigGoogle({
          google_habilitado: Boolean(cfg.google_habilitado),
          google_client_id: cfg.google_client_id || '',
          dominios_corporativos: cfg.dominios_corporativos || ''
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cargar la configuración de correo corporativo.');
    } finally {
      setCargandoGoogle(false);
    }
  }, [esAdminCentral]);

  useEffect(() => {
    let alive = true;
    if (tabActual === 'auditoria') {
      Promise.resolve().then(() => {
        if (alive) void cargarAuditorias();
      });
    } else if (tabActual === 'correo_corporativo' && esAdminCentral) {
      Promise.resolve().then(() => {
        if (alive) void cargarConfigGoogle();
      });
    }
    return () => {
      alive = false;
    };
  }, [tabActual, esAdminCentral, cargarAuditorias, cargarConfigGoogle]);

  const guardarConfigGoogle = async (e) => {
    e.preventDefault();
    if (!esAdminCentral) return;
    setGuardandoGoogle(true);
    try {
      const res = await api.put('/auth/config-corporativa', configGoogle);
      toast.success(res.data?.mensaje || 'Configuración guardada correctamente.');
      const cfg = res.data?.config;
      if (cfg) {
        setConfigGoogle({
          google_habilitado: Boolean(cfg.google_habilitado),
          google_client_id: cfg.google_client_id || '',
          dominios_corporativos: cfg.dominios_corporativos || ''
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la configuración.');
    } finally {
      setGuardandoGoogle(false);
    }
  };

  const solicitarCambioRol = (user, nuevoRolId) => {
    const rolDestino = rolesDinamicos.find(r => r.id_rol === nuevoRolId);
    setCambioRolPendiente({
      user,
      nuevoRolId,
      nombreNuevoRol: rolDestino?.nombre || 'Nuevo rol'
    });
  };

  const ejecutarCambioRol = async () => {
    if (!cambioRolPendiente) return;
    const { user, nuevoRolId } = cambioRolPendiente;
    setActualizando(user.id_usuario);
    try {
      const res = await api.put(`/usuarios/${user.id_usuario}/rol`, { nuevo_rol: nuevoRolId });
      toast.success(res.data.mensaje);
      setCambioRolPendiente(null);
      await cargarDatos();
      onPermisosActualizados?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cambiar el rol.');
    } finally {
      setActualizando(null);
    }
  };

  const moverUsuarioDeSede = async (user, nuevoIdUbicacion) => {
    if (!nuevoIdUbicacion || Number(nuevoIdUbicacion) === Number(user.id_ubicacion)) return;
    setActualizando(user.id_usuario);
    try {
      const res = await api.put(`/usuarios/${user.id_usuario}/ubicacion`, {
        id_ubicacion: Number(nuevoIdUbicacion)
      });
      toast.success(res.data?.mensaje || 'Sede actualizada correctamente.');
      await cargarDatos(true);
      if (user.id_usuario === usuarioLogueado?.id_usuario) {
        onPermisosActualizados?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo mover al empleado de sede.');
    } finally {
      setActualizando(null);
    }
  };

  const actualizarConfiguracion = async (
    idUsuario,
    puede_ver_celulares,
    area,
    seccion_facturacion,
    telefono_whatsapp = undefined
  ) => {
    setActualizando(idUsuario);
    try {
      const payload = { puede_ver_celulares, area, seccion_facturacion };
      if (telefono_whatsapp !== undefined) {
        payload.telefono_whatsapp = telefono_whatsapp;
      }
      const res = await api.put(`/usuarios/${idUsuario}/configuracion`, payload);
      toast.success(res.data.mensaje);
      if (telefono_whatsapp !== undefined) {
        setEditandoWhatsappUser(null);
      }
      await cargarDatos();
      if (idUsuario === usuarioLogueado?.id_usuario) {
        onPermisosActualizados?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el cambio.');
    } finally {
      setActualizando(null);
    }
  };

  // Abrir Modal para Restablecer Contraseña de un Empleado
  const abrirModalResetPassword = (empleado, idSolicitud = null) => {
    setModalResetUsuario({ usuario: empleado, id_solicitud: idSolicitud });
    setNuevaClaveReset('');
    setVerClaveReset(true);
  };

  const handleGuardarResetPassword = async (e) => {
    e.preventDefault();
    if (!modalResetUsuario?.usuario) return;
    if (!nuevaClaveReset || nuevaClaveReset.trim().length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setGuardandoReset(true);
    try {
      const res = await api.put(
        `/usuarios/${modalResetUsuario.usuario.id_usuario}/restablecer-password`,
        { nueva_password: nuevaClaveReset }
      );

      // Si venía de una solicitud donde el nombre no había coincidido automáticamente, marcarla descartada/atendida
      if (modalResetUsuario.id_solicitud) {
        await api.put(`/usuarios/recuperaciones/${modalResetUsuario.id_solicitud}/descartar`).catch(() => {});
      }

      toast.success(
        res.data?.mensaje ||
        `¡Contraseña cambiada para ${modalResetUsuario.usuario.nombre_completo}!`
      );
      setModalResetUsuario(null);
      setNuevaClaveReset('');
      await cargarSolicitudesRecuperacion();
      await cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la nueva contraseña.');
    } finally {
      setGuardandoReset(false);
    }
  };

  const handleDescartarSolicitud = async (idSolicitud) => {
    try {
      await api.put(`/usuarios/recuperaciones/${idSolicitud}/descartar`);
      toast.success('Aviso quitado de la lista.');
      await cargarSolicitudesRecuperacion();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo quitar el aviso.');
    }
  };

  const copiarTexto = async (texto) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Contraseña copiada para que puedas enviársela.');
    } catch {
      toast.error('No se pudo copiar automáticamente.');
    }
  };

  // Permisos de Celular por Cliente
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
      toast.error('No se pudieron cargar los clientes: ' + (err.response?.data?.mensaje || err.message));
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
      toast.error('No se pudo guardar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardandoPermisosCel(false);
    }
  };

  const confirmarEliminarUsuario = (user) => {
    if (user.id_usuario === usuarioLogueado?.id_usuario) {
      return toast.error('No puedes eliminar tu propia cuenta.');
    }
    setUsuarioAEliminar(user);
  };

  const ejecutarEliminacionUsuario = async () => {
    if (!usuarioAEliminar) return;
    setEliminandoUsuario(true);
    try {
      const res = await api.delete(`/usuarios/${usuarioAEliminar.id_usuario}`);
      toast.success(res.data.mensaje || 'Empleado eliminado correctamente.');
      setUsuarioAEliminar(null);
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo eliminar al empleado.');
    } finally {
      setEliminandoUsuario(false);
    }
  };

  const abrirModalNuevoUsuario = () => {
    const rolesPermitidos = esAdminCentral
      ? rolesDinamicos
      : rolesDinamicos.filter(r => r.nombre !== 'Admin Central');
    const rolInicial = rolesPermitidos[rolesPermitidos.length - 1] || rolesPermitidos[0];
    setFormUsuario({
      nombre_completo: '',
      email: '',
      password: '',
      rol_id: rolInicial?.id_rol || '',
      id_ubicacion: ubicaciones[0]?.id_ubicacion || '',
      area: 'ADMINISTRACION',
      puede_ver_celulares: false,
      seccion_facturacion: 'AMBAS',
      telefono_whatsapp: ''
    });
    setVerPasswordNuevo(true);
    setModalNuevoUsuario(true);
  };

  const handleCrearUsuario = async (e) => {
    e.preventDefault();
    if (!formUsuario.nombre_completo.trim() || !formUsuario.email.trim() || !formUsuario.password) {
      return toast.error('Completa el nombre, el correo y la contraseña del nuevo empleado.');
    }
    if (formUsuario.password.trim().length < 8) {
      return toast.error('La contraseña debe tener al menos 8 caracteres.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/usuarios', formUsuario);
      toast.success(res.data.mensaje || '¡Empleado creado con éxito!');
      setModalNuevoUsuario(false);
      await cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo registrar al empleado.');
    } finally {
      setGuardando(false);
    }
  };

  const handleCrearRol = async (e) => {
    e.preventDefault();
    if (!formRol.nombre.trim()) {
      return toast.error('Escribe un nombre para el nuevo rol.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/usuarios/roles', {
        ...formRol,
        duracion_sesion_minutos: formRol.duracion_sesion_minutos
          ? parseInt(formRol.duracion_sesion_minutos, 10)
          : null,
        nivel_jerarquia: Number(formRol.nivel_jerarquia || 4)
      });
      toast.success(res.data.mensaje || 'Rol creado con éxito.');
      setModalNuevoRol(false);
      setFormRol({ nombre: '', descripcion: '', duracion_sesion_minutos: '', nivel_jerarquia: 4 });
      await cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo crear el rol.');
    } finally {
      setGuardando(false);
    }
  };

  const handleTogglePermisoOtrasUbicaciones = async (rolId, valorActual) => {
    if (!puedeEditarUsuarios) return;
    try {
      await api.put(`/usuarios/roles/${rolId}/ubicaciones-permiso`, {
        puede_ver_otras_ubicaciones: !valorActual
      });
      toast.success('Acceso a otras sedes actualizado.');
      await cargarDatos();
      onPermisosActualizados?.();
    } catch (err) {
      toast.error('No se pudo actualizar: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  if (!puedeVerUsuarios) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full bg-white rounded-2xl border border-slate-200">
        <Lock size={56} className="text-red-400 mb-4" />
        <h2 className="text-2xl font-bold text-blue-950">Sin permiso para esta pantalla</h2>
        <p className="text-slate-500 mt-2 max-w-md text-sm">
          Tu rol actual no tiene permiso para ver ni modificar el personal y los roles.
        </p>
      </div>
    );
  }

  if (cargando) return <div className="text-slate-500 p-8 font-medium">Cargando lista de personal y roles...</div>;
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl m-8">{error}</div>;

  const auditoriasFiltradas = auditorias.filter(a => {
    if (filtroEntidad === 'todas') return true;
    return a.entidad === filtroEntidad;
  });

  const empleadosRestablecibles = usuarios.filter(
    u => esAdminCentral || u.nombre_rol !== 'Admin Central'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-md">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Personal, Roles y Contraseñas</h1>
            <p className="text-slate-500 text-sm">Crea empleados, organiza roles, restablece contraseñas olvidadas y decide qué puede ver cada uno</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabActual === 'personal' && puedeEditarUsuarios && (
            <>
              <button
                onClick={() => setModalNuevoRol(true)}
                className="flex items-center space-x-2 px-3.5 py-2.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-xl text-sm font-semibold transition-all shadow-xs cursor-pointer"
              >
                <ShieldPlus size={16} />
                <span>+ Crear Rol</span>
              </button>

              <button
                onClick={abrirModalNuevoUsuario}
                className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                <UserPlus size={16} />
                <span>+ Nuevo Empleado</span>
              </button>
            </>
          )}

          {tabActual === 'auditoria' && (
            <button
              onClick={cargarAuditorias}
              disabled={cargandoAuditoria}
              className="flex items-center space-x-2 px-3 py-2 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm font-medium transition-colors cursor-pointer"
            >
              <RefreshCw size={16} className={cargandoAuditoria ? 'animate-spin' : ''} />
              <span>Actualizar historial</span>
            </button>
          )}
        </div>
      </div>

      {/* PANEL DESTACADO: AVISOS DE CONTRASEÑAS OLVIDADAS */}
      {puedeEditarUsuarios && solicitudesRecuperacion.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-amber-400 text-slate-950 rounded-xl shrink-0">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-amber-950">
                Hay {solicitudesRecuperacion.length} persona{solicitudesRecuperacion.length > 1 ? 's' : ''} que olvidó su contraseña
              </h2>
              <p className="text-xs text-amber-900 mt-0.5">
                Presiona <strong>"Poner nueva contraseña"</strong>, escribe una clave fácil para esa persona y avísale cuál le pusiste.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {solicitudesRecuperacion.map((sol) => {
              const empleadoCoincidente = sol.id_usuario
                ? usuarios.find(u => u.id_usuario === sol.id_usuario) || {
                    id_usuario: sol.id_usuario,
                    nombre_completo: sol.nombre_completo || sol.identificador_ingresado,
                    email: sol.email || '',
                    nombre_rol: sol.nombre_rol || ''
                  }
                : null;

              const bloqueadoPorAdmin =
                !esAdminCentral && empleadoCoincidente?.nombre_rol === 'Admin Central';

              const idSeleccionadoManual = empleadoElegidoPorSolicitud[sol.id_solicitud] || '';
              const empleadoManual = idSeleccionadoManual
                ? empleadosRestablecibles.find(u => u.id_usuario === Number(idSeleccionadoManual))
                : null;

              return (
                <div
                  key={sol.id_solicitud}
                  className="bg-white border border-amber-200 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    {empleadoCoincidente ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-blue-950">
                          {empleadoCoincidente.nombre_completo}
                        </span>
                        {empleadoCoincidente.email && (
                          <span className="text-xs font-mono text-slate-500">
                            ({empleadoCoincidente.email})
                          </span>
                        )}
                        {sol.nombre_ubicacion && (
                          <span className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                            📍 {sol.nombre_ubicacion}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-blue-950">
                        Escribió en el inicio: <span className="text-amber-800">"{sol.identificador_ingresado}"</span>
                      </div>
                    )}

                    {sol.mensaje && (
                      <p className="text-xs text-slate-600">
                        Nota que dejó: <em>"{sol.mensaje}"</em>
                      </p>
                    )}

                    <p className="text-[11px] text-slate-400">
                      Pedido el {new Date(sol.creado_en).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {empleadoCoincidente ? (
                      bloqueadoPorAdmin ? (
                        <span className="text-xs text-slate-500 italic">Solo un Admin Central puede cambiar esta cuenta</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirModalResetPassword(empleadoCoincidente, sol.id_solicitud)}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <KeyRound size={14} />
                          <span>Poner nueva contraseña</span>
                        </button>
                      )
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={idSeleccionadoManual}
                          onChange={(e) => setEmpleadoElegidoPorSolicitud({
                            ...empleadoElegidoPorSolicitud,
                            [sol.id_solicitud]: e.target.value
                          })}
                          className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white font-medium"
                        >
                          <option value="">Elegir quién es...</option>
                          {empleadosRestablecibles.map(emp => (
                            <option key={emp.id_usuario} value={emp.id_usuario}>
                              {emp.nombre_completo} ({emp.email})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!empleadoManual}
                          onClick={() => empleadoManual && abrirModalResetPassword(empleadoManual, sol.id_solicitud)}
                          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <KeyRound size={14} />
                          <span>Poner nueva contraseña</span>
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDescartarSolicitud(sol.id_solicitud)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Quitar aviso
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pestañas */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl w-max max-w-full">
        <button
          onClick={() => setTabActual('personal')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
            tabActual === 'personal' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} />
          <span>Lista de Personal ({usuarios.length})</span>
        </button>
        <button
          onClick={() => setTabActual('permisos')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
            tabActual === 'permisos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldCheck size={16} />
          <span>Permisos por Rol</span>
        </button>
        <button
          onClick={() => setTabActual('auditoria')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
            tabActual === 'auditoria' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={16} />
          <span>Historial ("Quién hizo qué")</span>
        </button>
        {esAdminCentral && (
          <button
            onClick={() => setTabActual('correo_corporativo')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
              tabActual === 'correo_corporativo' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Mail size={16} />
            <span>Correo Corporativo (Google)</span>
          </button>
        )}
      </div>

      {/* TAB 1: PERSONAL Y ROLES */}
      {tabActual === 'personal' && (
        <div className="space-y-6">
          {/* Filtro por Rol + Exportar Excel */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">
                <Layers size={14} className="text-indigo-600" />
                <span>Ver por Rol:</span>
              </div>
              <button
                type="button"
                onClick={() => setFiltroRolPersonal('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filtroRolPersonal === 'todos'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos ({usuarios.length})
              </button>
              {rolesDinamicos.map(rol => {
                const cant = usuarios.filter(u => u.rol_id === rol.id_rol).length;
              const activo = filtroRolPersonal === rol.id_rol;
              return (
                <button
                  key={rol.id_rol}
                  type="button"
                  onClick={() => setFiltroRolPersonal(rol.id_rol)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                    activo
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{rol.nombre}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    activo ? 'bg-indigo-500 text-white' : 'bg-white text-slate-600 border border-slate-200'
                  }`}>
                    {cant}
                  </span>
                </button>
              );
            })}
            </div>
            <BotonExportarExcel
              onClick={() =>
                exportarTablaExcel({
                  nombreArchivo: 'personal_usuarios',
                  nombreHoja: 'Personal',
                  filas: usuarios,
                  columnas: [
                    { header: 'ID', key: 'id_usuario' },
                    { header: 'Nombre Completo', key: 'nombre_completo' },
                    { header: 'Correo', key: 'email' },
                    { header: 'Rol', key: 'nombre_rol' },
                    { header: 'Nivel Jerarquía', value: (r) => Number(r.nivel_jerarquia || (r.nombre_rol === 'Admin Central' ? 1 : 4)) },
                    { header: 'Sede / Ubicación', value: (r) => r.nombre_ubicacion || 'Sede Central' },
                    { header: 'Área', value: (r) => r.area || 'ADMINISTRACION' },
                    { header: 'WhatsApp', value: (r) => r.telefono_whatsapp || '' },
                    { header: 'Estado', value: (r) => (r.activo === false ? 'Inactivo' : 'Activo') }
                  ]
                })
              }
              label="Exportar Excel (Personal)"
              cantidad={usuarios.length}
            />
          </div>

          {/* Lista de Empleados Separada por Rol */}
          <div className="space-y-6">
            {(filtroRolPersonal === 'todos'
              ? rolesDinamicos
              : rolesDinamicos.filter(r => r.id_rol === filtroRolPersonal)
            ).map(rol => {
              const empleadosDelRol = usuarios.filter(u => u.rol_id === rol.id_rol);
              const estilo = estiloRolMap[rol.id_rol] || {
                icono: <Shield size={16} className="text-purple-500" />,
                color: 'bg-purple-100 text-purple-700 border-purple-200'
              };

              return (
                <div key={rol.id_rol} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                        {estilo.icono}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-bold text-blue-950 text-base">{rol.nombre}</h3>
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${estilo.color}`}>
                            {empleadosDelRol.length} {empleadosDelRol.length === 1 ? 'persona' : 'personas'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {rol.descripcion || 'Puedes elegir qué pantallas ve este rol en la pestaña "Permisos por Rol".'}
                        </p>
                      </div>
                    </div>
                    {(rol.nombre === 'Admin Central' || rol.puede_ver_otras_ubicaciones) && (
                      <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 w-max">
                        🏢 Puede ver todas las sedes
                      </span>
                    )}
                  </div>

                  {empleadosDelRol.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 italic">
                      No hay ninguna persona asignada a este rol todavía.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                            <th className="p-4 font-semibold">Nombre</th>
                            <th className="p-4 font-semibold">Correo para entrar</th>
                            <th className="p-4 font-semibold">Sede</th>
                            <th className="p-4 font-semibold text-center">Rol</th>
                            <th className="p-4 font-semibold text-center">Área (Hora de pedidos)</th>
                            <th className="p-4 font-semibold text-center">Facturación</th>
                            <th className="p-4 font-semibold text-center">📱 Teléfonos de Clientes</th>
                            {puedeEditarUsuarios && (
                              <th className="p-4 font-semibold text-center">Contraseña y Acciones</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {empleadosDelRol.map((user) => {
                            const esYoMismo = user.id_usuario === usuarioLogueado?.id_usuario;
                            const esCuentaAdminCentral = user.nombre_rol === 'Admin Central';
                            const noPuedoModificarEsteAdmin = !esAdminCentral && esCuentaAdminCentral;

                            return (
                              <tr key={user.id_usuario} className={`hover:bg-slate-50 transition-colors ${esYoMismo ? 'bg-indigo-50/20' : ''}`}>
                                <td className="p-4">
                                  <div className="font-bold text-slate-900 flex items-center space-x-2">
                                    <span>{user.nombre_completo}</span>
                                    {esYoMismo && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Tú</span>}
                                  </div>
                                </td>
                                <td className="p-4 text-slate-600 text-xs">
                                  <div className="font-mono">{user.email}</div>
                                  {editandoWhatsappUser?.id_usuario === user.id_usuario ? (
                                    <div className="mt-1.5 flex items-center gap-1">
                                      <input
                                        type="text"
                                        placeholder="+51 999888777"
                                        value={editandoWhatsappUser.telefono}
                                        onChange={(e) => setEditandoWhatsappUser({
                                          ...editandoWhatsappUser,
                                          telefono: e.target.value
                                        })}
                                        className="w-32 border border-indigo-300 rounded-lg px-2 py-1 text-[11px] font-sans focus:outline-hidden"
                                      />
                                      <button
                                        type="button"
                                        disabled={actualizando === user.id_usuario}
                                        onClick={() => actualizarConfiguracion(
                                          user.id_usuario,
                                          user.puede_ver_celulares,
                                          user.area,
                                          user.seccion_facturacion,
                                          editandoWhatsappUser.telefono
                                        )}
                                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                      >
                                        OK
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditandoWhatsappUser(null)}
                                        className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold cursor-pointer"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="mt-1 flex items-center gap-1.5 font-sans">
                                      {user.telefono_whatsapp ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                          <Phone size={10} />
                                          {user.telefono_whatsapp}
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-slate-400">Sin WhatsApp</span>
                                      )}
                                      {puedeEditarUsuarios && !noPuedoModificarEsteAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => setEditandoWhatsappUser({
                                            id_usuario: user.id_usuario,
                                            telefono: user.telefono_whatsapp || ''
                                          })}
                                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                                        >
                                          {user.telefono_whatsapp ? 'Editar' : '+ Agregar'}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4 text-slate-600 font-medium">
                                  <select
                                    disabled={!puedeEditarUsuarios || actualizando === user.id_usuario || noPuedoModificarEsteAdmin || ubicaciones.length === 0}
                                    value={user.id_ubicacion || ''}
                                    onChange={(e) => moverUsuarioDeSede(user, Number(e.target.value))}
                                    className="bg-white border border-slate-300 rounded-lg text-xs px-2.5 py-1.5 focus:outline-hidden focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-100 cursor-pointer font-medium max-w-[180px]"
                                    title="Mover empleado a otra sede"
                                  >
                                    {ubicaciones.map(ub => (
                                      <option key={ub.id_ubicacion} value={ub.id_ubicacion}>
                                        {ub.nombre}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                {/* Rol */}
                                <td className="p-4 text-center">
                                  <div className="flex justify-center">
                                    <select
                                      disabled={!puedeEditarUsuarios || actualizando === user.id_usuario || esYoMismo || noPuedoModificarEsteAdmin}
                                      value={user.rol_id}
                                      onChange={(e) => solicitarCambioRol(user, Number(e.target.value))}
                                      className="bg-white border border-slate-300 rounded-lg text-xs px-2.5 py-1.5 focus:outline-hidden focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-100 cursor-pointer font-medium"
                                      title={esYoMismo ? 'No puedes cambiar tu propio rol' : 'Cambiar rol'}
                                    >
                                      {rolesDinamicos
                                        .filter(rOpt => esAdminCentral || rOpt.nombre !== 'Admin Central' || rOpt.id_rol === user.rol_id)
                                        .map(rOpt => (
                                          <option key={rOpt.id_rol} value={rOpt.id_rol}>{rOpt.nombre}</option>
                                        ))}
                                    </select>
                                  </div>
                                </td>

                                {/* Área */}
                                <td className="p-4 text-center">
                                  <div className="flex justify-center">
                                    <select
                                      disabled={!puedeEditarUsuarios || actualizando === user.id_usuario || noPuedoModificarEsteAdmin}
                                      value={user.area || 'ADMINISTRACION'}
                                      onChange={(e) => actualizarConfiguracion(user.id_usuario, user.puede_ver_celulares, e.target.value, user.seccion_facturacion)}
                                      className="bg-white border border-slate-300 rounded-lg text-xs px-2.5 py-1.5 focus:outline-hidden focus:border-indigo-500 font-semibold disabled:opacity-50 cursor-pointer"
                                    >
                                      <option value="ADMINISTRACION">Administración</option>
                                      <option value="PRODUCCION">Producción (-1 hora)</option>
                                    </select>
                                  </div>
                                </td>

                                {/* Acceso a Facturación */}
                                <td className="p-4 text-center">
                                  <div className="flex justify-center">
                                    <select
                                      disabled={!puedeEditarUsuarios || actualizando === user.id_usuario || noPuedoModificarEsteAdmin}
                                      value={user.seccion_facturacion || 'AMBAS'}
                                      onChange={(e) => actualizarConfiguracion(user.id_usuario, user.puede_ver_celulares, user.area, e.target.value)}
                                      className="bg-white border border-slate-300 rounded-lg text-xs px-2 py-1.5 focus:outline-hidden focus:border-indigo-500 font-semibold disabled:opacity-50 cursor-pointer"
                                    >
                                      <option value="AMBAS">Ambas (Pedidos y Manual)</option>
                                      <option value="PEDIDOS">Solo Pedidos</option>
                                      <option value="MANUAL">Solo Manual</option>
                                    </select>
                                  </div>
                                </td>

                                {/* Teléfonos por Cliente */}
                                <td className="p-4 text-center">
                                  {esCuentaAdminCentral ? (
                                    <span className="inline-flex items-center space-x-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                      <ShieldCheck size={14} />
                                      <span>Ve todos</span>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!puedeEditarUsuarios}
                                      onClick={() => abrirModalPermisosCelular(user)}
                                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                                      title="Elegir de qué clientes puede ver el número de celular"
                                    >
                                      <Phone size={13} />
                                      <span>
                                        {user.total_clientes_autorizados > 0
                                          ? `${user.total_clientes_autorizados} cliente(s)`
                                          : 'Elegir clientes'}
                                      </span>
                                    </button>
                                  )}
                                </td>

                                {/* Acciones: Cambiar Contraseña y Eliminar */}
                                {puedeEditarUsuarios && (
                                  <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {!noPuedoModificarEsteAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => abrirModalResetPassword(user)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-amber-900 hover:bg-amber-200 bg-amber-100 border border-amber-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                          title={`Poner nueva contraseña a ${user.nombre_completo}`}
                                        >
                                          <KeyRound size={13} />
                                          <span>Cambiar Clave</span>
                                        </button>
                                      )}

                                      {esAdminCentral && !esYoMismo && (
                                        <button
                                          type="button"
                                          onClick={() => confirmarEliminarUsuario(user)}
                                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-red-600 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                          title={`Eliminar a ${user.nombre_completo}`}
                                        >
                                          <Trash2 size={13} />
                                          <span>Eliminar</span>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Catálogo de Roles */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Roles creados en la empresa ({rolesDinamicos.length})
              </h3>
              {puedeEditarUsuarios && (
                <button
                  onClick={() => setModalNuevoRol(true)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  + Crear otro rol
                </button>
              )}
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
                        {rol.descripcion || 'Permisos ajustables en la pestaña "Permisos por Rol".'}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-500 flex items-center gap-1">
                          <Clock size={11} className="text-amber-600" />
                          Re-login:
                        </span>
                        <span className="font-bold text-slate-700">
                          {formatearDuracionSesionLegible(rol.duracion_sesion_minutos)}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500">🏢 Ver otras sedes</span>
                        <label className="flex items-center space-x-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rol.nombre === 'Admin Central' || Boolean(rol.puede_ver_otras_ubicaciones)}
                            disabled={rol.nombre === 'Admin Central' || !puedeEditarUsuarios}
                            onChange={() => handleTogglePermisoOtrasUbicaciones(rol.id_rol, rol.puede_ver_otras_ubicaciones)}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 disabled:opacity-50 cursor-pointer"
                          />
                          <span className="text-[10px] text-slate-600 font-medium">
                            {rol.nombre === 'Admin Central' || Boolean(rol.puede_ver_otras_ubicaciones) ? 'Sí' : 'No'}
                          </span>
                        </label>
                      </div>
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
        <PermisosGrid
          puedeEditar={puedeEditarUsuarios}
          usuarioLogueado={usuarioLogueado}
          onPermisoCambiado={() => {
            void cargarDatos(true);
            onPermisosActualizados?.();
          }}
        />
      )}

      {/* TAB: ACCESO CON CORREO CORPORATIVO GOOGLE WORKSPACE */}
      {tabActual === 'correo_corporativo' && esAdminCentral && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 max-w-3xl">
          <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Globe size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-blue-950">
                Inicio de Sesión con Correos Corporativos (Google Workspace)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Permite que los trabajadores entren con su correo corporativo de Gmail / Google Workspace sin recordar otra contraseña, siempre que su correo exista en Lista de Personal.
              </p>
            </div>
          </div>

          {cargandoGoogle ? (
            <div className="text-xs text-slate-500 py-4">Cargando configuración...</div>
          ) : (
            <form onSubmit={guardarConfigGoogle} className="space-y-4">
              <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(configGoogle.google_habilitado)}
                  onChange={(e) => setConfigGoogle({ ...configGoogle, google_habilitado: e.target.checked })}
                  className="mt-0.5 rounded text-indigo-600 w-4 h-4"
                />
                <div>
                  <span className="text-sm font-bold text-slate-800 block">
                    Habilitar botón "Iniciar sesión con Google" en la pantalla de Login
                  </span>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    El login normal con correo y contraseña seguirá funcionando igual.
                  </span>
                </div>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Google Client ID (OAuth 2.0 Web) *
                </label>
                <input
                  type="text"
                  placeholder="Ej: 1234567890-abcdefg.apps.googleusercontent.com"
                  value={configGoogle.google_client_id}
                  onChange={(e) => setConfigGoogle({ ...configGoogle, google_client_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Dominios corporativos permitidos (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: procesoscarnicos.com, otraempresa.pe (vacío = cualquier usuario registrado)"
                  value={configGoogle.dominios_corporativos}
                  onChange={(e) => setConfigGoogle({ ...configGoogle, dominios_corporativos: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Si pones el dominio de la empresa, rechazará cuentas personales @gmail.com incluso si intentan entrar.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
                <p className="font-bold text-slate-800">Guía rápida en Google Cloud Console:</p>
                <p>1. Crea una credencial tipo <strong>ID de cliente de OAuth 2.0 (Aplicación web)</strong>.</p>
                <p>
                  2. En <strong>Orígenes de JavaScript autorizados</strong>, agrega esta dirección:{' '}
                  <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-bold text-indigo-700">
                    {typeof window !== 'undefined' ? window.location.origin : 'http://localhost'}
                  </code>
                </p>
                <p>3. Pega el <strong>Client ID</strong> arriba, guarda, y asegúrate de crear cada empleado con su correo corporativo en <strong>Lista de Personal</strong>.</p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={guardandoGoogle}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save size={16} />
                  <span>{guardandoGoogle ? 'Guardando...' : 'Guardar Configuración Corporativa'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: HISTORIAL LEGIBLE */}
      {tabActual === 'auditoria' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'todas', label: `Todo (${auditorias.length})` },
                { id: 'movimientos_kardex', label: 'Inventario' },
                { id: 'comprobantes', label: 'Facturación' },
                { id: 'pedidos', label: 'Pedidos' },
                { id: 'usuarios', label: 'Personal y Claves' },
                { id: 'productos', label: 'Productos' },
                { id: 'ubicaciones', label: 'Ubicaciones' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFiltroEntidad(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    filtroEntidad === f.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <BotonExportarExcel
              onClick={() =>
                exportarTablaExcel({
                  nombreArchivo: 'historial_auditoria',
                  nombreHoja: 'Auditoría',
                  filas: auditorias,
                  columnas: [
                    { header: 'Fecha y Hora', value: (r) => fechaHoraLocalTexto(r.fecha || r.creado_en) },
                    { header: 'Usuario', value: (r) => r.usuario_nombre || 'Aviso desde Inicio de Sesión' },
                    { header: 'Correo', value: (r) => r.usuario_email || '-' },
                    { header: 'Rol', value: (r) => r.usuario_rol || '-' },
                    { header: 'Acción', value: (r) => TRADUCCION_ACCION[r.accion] || formatearClaveHumana(r.accion) },
                    { header: 'Sección', value: (r) => TRADUCCION_ENTIDAD[r.entidad] || formatearClaveHumana(r.entidad) },
                    { header: 'ID Registro', key: 'id_entidad' },
                    { header: 'Detalle Nuevo', value: (r) => (r.despues ? JSON.stringify(r.despues) : '') }
                  ]
                })
              }
              label="Exportar Excel (Historial)"
              cantidad={auditorias.length}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {cargandoAuditoria ? (
              <div className="p-12 text-center text-slate-500 font-medium">Cargando historial de acciones...</div>
            ) : auditoriasFiltradas.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                No hay movimientos registrados en esta sección.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-semibold">Fecha y Hora</th>
                      <th className="p-4 font-semibold">¿Quién lo hizo?</th>
                      <th className="p-4 font-semibold">¿Qué hizo?</th>
                      <th className="p-4 font-semibold">Sección</th>
                      <th className="p-4 font-semibold text-center">Detalles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {auditoriasFiltradas.map((aud) => {
                      const accionLegible =
                        TRADUCCION_ACCION[aud.accion] || formatearClaveHumana(aud.accion);
                      const seccionLegible =
                        TRADUCCION_ENTIDAD[aud.entidad] || formatearClaveHumana(aud.entidad);
                      return (
                        <tr key={aud.id_auditoria} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-slate-600 text-xs">
                            {new Date(aud.fecha).toLocaleDateString('es-ES', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-slate-900">{aud.usuario_nombre || 'Aviso desde Inicio de Sesión'}</div>
                            <div className="text-xs text-slate-400">
                              {aud.usuario_email || '-'} {aud.usuario_rol ? `· ${aud.usuario_rol}` : ''}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-100">
                              {accionLegible}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-slate-800 text-xs">{seccionLegible}</div>
                            {aud.id_entidad && (
                              <span className="text-[11px] text-slate-400">Registro #{aud.id_entidad}</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setDetalleModal(aud)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-800 transition-colors cursor-pointer"
                            >
                              <Eye size={14} />
                              <span>Ver detalle</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CREAR NUEVO EMPLEADO (PROTEGIDO CONTRA AUTOCOMPLETADO DEL NAVEGADOR) */}
      {modalNuevoUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-950">Registrar Nuevo Empleado</h3>
                  <p className="text-xs text-slate-500">Tu propia contraseña no se modifica: aquí creas la cuenta para otra persona</p>
                </div>
              </div>
              <button onClick={() => setModalNuevoUsuario(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearUsuario} autoComplete="off" className="p-6 space-y-4">
              {/* Campos ocultos anti-autocompletado para que el navegador no guarde ni reemplace la clave del administrador */}
              <input type="text" name="fake_user_prevent_autofill" autoComplete="username" tabIndex={-1} aria-hidden="true" className="hidden" />
              <input type="password" name="fake_pass_prevent_autofill" autoComplete="current-password" tabIndex={-1} aria-hidden="true" className="hidden" />

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nombre completo del empleado *</label>
                <input
                  type="text"
                  name="nombre_nuevo_empleado_erp"
                  autoComplete="off"
                  required
                  placeholder="Ej: Roberto Gómez"
                  value={formUsuario.nombre_completo}
                  onChange={(e) => setFormUsuario({ ...formUsuario, nombre_completo: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Correo del empleado *</label>
                  <input
                    type="email"
                    name="correo_nuevo_empleado_erp"
                    autoComplete="off"
                    required
                    placeholder="empleado@empresa.com"
                    value={formUsuario.email}
                    onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Contraseña para este empleado *</label>
                  <div className="relative">
                    <input
                      type={verPasswordNuevo ? 'text' : 'password'}
                      name="clave_inicial_nuevo_empleado_erp"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Mínimo 8 caracteres"
                      value={formUsuario.password}
                      onChange={(e) => setFormUsuario({ ...formUsuario, password: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setVerPasswordNuevo(!verPasswordNuevo)}
                      title={verPasswordNuevo ? 'Ocultar' : 'Mostrar'}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {verPasswordNuevo ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Rol *</label>
                  <select
                    value={formUsuario.rol_id}
                    onChange={(e) => setFormUsuario({ ...formUsuario, rol_id: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                  >
                    {rolesDinamicos
                      .filter(r => esAdminCentral || r.nombre !== 'Admin Central')
                      .map(r => (
                        <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Sede donde trabaja *</label>
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Área de trabajo</label>
                <select
                  value={formUsuario.area}
                  onChange={(e) => setFormUsuario({ ...formUsuario, area: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                >
                  <option value="ADMINISTRACION">Administración (ve la hora de entrega normal)</option>
                  <option value="PRODUCCION">Producción / Planta (ve la hora de entrega 1 hora antes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Acceso a Facturación</label>
                <select
                  value={formUsuario.seccion_facturacion || 'AMBAS'}
                  onChange={(e) => setFormUsuario({ ...formUsuario, seccion_facturacion: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                >
                  <option value="AMBAS">Ambas (Facturación por Pedidos y Manual)</option>
                  <option value="PEDIDOS">Solo Facturación por Pedidos</option>
                  <option value="MANUAL">Solo Facturación Manual (Sin pedidos previos)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Celular / WhatsApp para Mensajería <span className="text-slate-400 font-normal normal-case">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: 999888777 o +51 999 888 777"
                  value={formUsuario.telefono_whatsapp || ''}
                  onChange={(e) => setFormUsuario({ ...formUsuario, telefono_whatsapp: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                💡 Si tu navegador te pregunta <em>"¿Guardar contraseña?"</em> al terminar, elige <strong>"Nunca"</strong> o ciérralo, porque esta contraseña es del nuevo empleado y no la tuya.
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevoUsuario(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? 'Guardando...' : 'Registrar Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESTABLECER / CAMBIAR CONTRASEÑA DE UN EMPLEADO */}
      {modalResetUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-900 text-white">
              <div className="flex items-center space-x-2.5">
                <KeyRound size={20} className="text-amber-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Asignar Nueva Contraseña</h3>
                  <p className="text-[11px] text-slate-300">Quedará activa al instante para esta persona</p>
                </div>
              </div>
              <button onClick={() => setModalResetUsuario(null)} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGuardarResetPassword} autoComplete="off" className="p-6 space-y-4">
              <input type="text" name="fake_reset_user" autoComplete="username" tabIndex={-1} aria-hidden="true" className="hidden" />

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5">
                <p className="text-[11px] font-bold text-indigo-600 uppercase">Empleado al que le cambiarás la clave:</p>
                <p className="text-sm font-extrabold text-blue-950 mt-0.5">
                  {modalResetUsuario.usuario.nombre_completo}
                </p>
                {modalResetUsuario.usuario.email && (
                  <p className="text-xs font-mono text-slate-600">{modalResetUsuario.usuario.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Escribe la nueva contraseña *
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={verClaveReset ? 'text' : 'password'}
                      name="reset_clave_empleado_erp"
                      autoComplete="new-password"
                      required
                      minLength={4}
                      placeholder="Ej: clave2026"
                      value={nuevaClaveReset}
                      onChange={(e) => setNuevaClaveReset(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setVerClaveReset(!verClaveReset)}
                      title={verClaveReset ? 'Ocultar' : 'Mostrar'}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {verClaveReset ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>

                  {nuevaClaveReset && (
                    <button
                      type="button"
                      onClick={() => copiarTexto(nuevaClaveReset)}
                      title="Copiar contraseña"
                      className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy size={14} />
                      <span>Copiar</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Mínimo 8 caracteres. Esta contraseña ya quedará fija para que entre sin problemas (y cerrará sesiones anteriores del usuario).
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalResetUsuario(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoReset}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 size={15} />
                  <span>{guardandoReset ? 'Guardando...' : 'Guardar Nueva Contraseña'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR CAMBIO DE ROL */}
      {cambioRolPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-lg font-bold text-blue-950">¿Cambiar rol de este empleado?</h3>
            <p className="text-sm text-slate-600">
              Vas a cambiar a <strong>{cambioRolPendiente.user.nombre_completo}</strong> al rol de <strong>{cambioRolPendiente.nombreNuevoRol}</strong>. Sus permisos cambiarán enseguida.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCambioRolPendiente(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarCambioRol}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
              >
                Sí, cambiar rol
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear Nuevo Rol */}
      {modalNuevoRol && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <ShieldPlus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-950">Crear Nuevo Rol</h3>
                  <p className="text-xs text-slate-500">Luego podrás elegir qué pantallas puede ver</p>
                </div>
              </div>
              <button onClick={() => setModalNuevoRol(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearRol} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nombre del Rol *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Encargado de Almacén, Cajero, Supervisor"
                  value={formRol.nombre}
                  onChange={(e) => setFormRol({ ...formRol, nombre: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">¿De qué se encarga? (Opcional)</label>
                <textarea
                  rows={3}
                  placeholder="Ej: Registra entradas de mercadería y revisa pedidos..."
                  value={formRol.descripcion}
                  onChange={(e) => setFormRol({ ...formRol, descripcion: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nivel jerárquico (Reuniones)
                </label>
                <select
                  value={formRol.nivel_jerarquia}
                  onChange={(e) => setFormRol({ ...formRol, nivel_jerarquia: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                >
                  <option value={1}>Nivel 1 — Máxima jerarquía</option>
                  <option value={2}>Nivel 2 — Gerencia / Subgerencia</option>
                  <option value={3}>Nivel 3 — Jefatura / Supervisión</option>
                  <option value={4}>Nivel 4 — Operativo / Base</option>
                  <option value={5}>Nivel 5 — Apoyo / Auxiliar</option>
                  <option value={6}>Nivel 6 — Externo / Prácticas</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tiempo obligatorio para volver a iniciar sesión
                </label>
                <select
                  value={formRol.duracion_sesion_minutos}
                  onChange={(e) => setFormRol({ ...formRol, duracion_sesion_minutos: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                >
                  {OPCIONES_DURACION_SESION.map(opt => (
                    <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="bg-purple-50 p-3 rounded-xl border border-purple-100 text-xs text-purple-800">
                Al guardarlo, ve a la pestaña <strong>Permisos por Rol</strong> para marcar con un clic qué pantallas puede ver o editar.
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevoRol(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? 'Guardando...' : 'Crear Rol'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalle de Historial Legible */}
      {detalleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          onClick={() => setDetalleModal(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-blue-950">
                  {TRADUCCION_ACCION[detalleModal.accion] || formatearClaveHumana(detalleModal.accion)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Realizado por <strong className="text-slate-800">{detalleModal.usuario_nombre || 'Sistema'}</strong> en <strong className="text-slate-800">{TRADUCCION_ENTIDAD[detalleModal.entidad] || detalleModal.entidad}</strong>
                </p>
              </div>
              <button onClick={() => setDetalleModal(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Cómo estaba antes
                  </h4>
                  <ResumenDatosLegible datos={detalleModal.antes} textoVacio="No existía antes (es un registro nuevo)" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">
                    Cómo quedó después
                  </h4>
                  <ResumenDatosLegible datos={detalleModal.despues} textoVacio="Se eliminó el registro" />
                </div>
              </div>
            </div>

            <div className="flex justify-end p-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setDetalleModal(null)}
                className="px-5 py-2 text-sm font-semibold bg-slate-800 hover:bg-slate-900 text-white rounded-xl cursor-pointer"
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
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                  <Phone size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-blue-950">
                    ¿De qué clientes puede ver el celular?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Empleado: <strong className="text-slate-800">{modalCelularesUsuario.nombre_completo}</strong> ({modalCelularesUsuario.nombre_rol})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalCelularesUsuario(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-white space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Marca los clientes cuyo número de celular sí puede ver esta persona. Los demás le aparecerán ocultos.
              </p>

              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre o RUC..."
                    value={filtroClienteBusqueda}
                    onChange={(e) => setFiltroClienteBusqueda(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <button
                  type="button"
                  onClick={seleccionarTodosClientes}
                  className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl whitespace-nowrap transition-colors cursor-pointer"
                >
                  {clientesSeleccionados.length === todosClientes.length ? 'Quitar todos' : 'Marcar todos'}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>
                  Permitidos: <strong className="text-indigo-600 font-bold">{clientesSeleccionados.length}</strong> de {todosClientes.length} clientes
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-100">
              {cargandoPermisosCel ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <Loader2 size={24} className="animate-spin text-indigo-600" />
                  <span className="text-xs">Cargando clientes...</span>
                </div>
              ) : todosClientes.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Todavía no hay clientes registrados.
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

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setModalCelularesUsuario(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoPermisosCel || cargandoPermisosCel}
                onClick={guardarPermisosCelular}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {guardandoPermisosCel ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Cambios</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACIÓN DE ELIMINAR EMPLEADO */}
      {usuarioAEliminar && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-5">
            <div className="flex items-center space-x-3.5">
              <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                <AlertTriangle size={28} />
              </div>
              <div>
                <h3 className="text-lg font-black text-blue-950">¿Eliminar empleado?</h3>
                <p className="text-xs text-slate-500">Solo Admin Central puede hacer esto</p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-200 rounded-2xl p-4 space-y-2.5 text-xs text-red-950">
              <p className="font-semibold text-slate-800">
                ¿Estás seguro de quitar a esta persona del sistema?
              </p>
              <div className="bg-white p-3 rounded-xl border border-red-200 space-y-1">
                <div className="font-bold text-slate-900 text-sm">{usuarioAEliminar.nombre_completo}</div>
                <div className="text-slate-600 text-xs font-mono">{usuarioAEliminar.email}</div>
                <div className="text-slate-500 text-[11px]">
                  Rol: <span className="font-bold text-indigo-700">{usuarioAEliminar.nombre_rol}</span> · Sede: {usuarioAEliminar.nombre_ubicacion || 'Central'}
                </div>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Ya no podrá entrar al sistema. Sus pedidos o facturas anteriores se conservarán para no perder el historial.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setUsuarioAEliminar(null)}
                disabled={eliminandoUsuario}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarEliminacionUsuario}
                disabled={eliminandoUsuario}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all shadow-md shadow-red-600/30 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {eliminandoUsuario ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Sí, Eliminar Empleado</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
