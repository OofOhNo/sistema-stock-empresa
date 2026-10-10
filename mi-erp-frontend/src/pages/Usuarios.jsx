import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  Users, Shield, ShieldAlert, UserCheck, Briefcase, Lock, 
  FileText, ShieldCheck, History, Eye, RefreshCw, Filter, X 
} from 'lucide-react';
import toast from 'react-hot-toast';
import PermisosGrid from '../components/PermisosGrid';

export default function Usuarios({ usuarioLogueado }) {
  const [tabActual, setTabActual] = useState('personal'); // 'personal', 'permisos', 'auditoria'
  const [usuarios, setUsuarios] = useState([]);
  const [auditorias, setAuditorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoAuditoria, setCargandoAuditoria] = useState(false);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(null);

  // Filtro de auditoría
  const [filtroEntidad, setFiltroEntidad] = useState('todas');
  const [detalleModal, setDetalleModal] = useState(null);

  // Jerarquía de roles
  const rolesDisponibles = [
    {
      id: 1,
      nombre: 'Admin Central',
      icono: <ShieldAlert size={16} className="text-red-500" />,
      color: 'bg-red-100 text-red-700 border-red-200',
      descripcion: 'Acceso total. Puede ver todas las ubicaciones, anular movimientos y gestionar roles.'
    },
    {
      id: 2, 
      nombre: 'Administrador', // actúa como gerente de área
      icono: <Shield size={16} className="text-indigo-500" />,
      color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      descripcion: 'Gestión completa de su área. Puede anular movimientos pasados los 10 mins.'
    },
    {
      id: 3,
      nombre: 'Jefe de División',
      icono: <Briefcase size={16} className="text-blue-500" />,
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      descripcion: 'Puede aprobar pedidos y ver reportes del personal a su cargo.'
    },
    {
      id: 4,
      nombre: 'Vendedor', // empleado Normal
      icono: <UserCheck size={16} className="text-emerald-500" />,
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      descripcion: 'Operaciones básicas. Factura, registra stock y tiene 10 mins para correcciones.'
    }
  ];

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      const res = await api.get('/usuarios');
      setUsuarios(res.data.datos || []);
    } catch (err) {
      setError('Error al cargar la lista de personal.');
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
    cargarUsuarios();
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
      cargarUsuarios();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setActualizando(null);
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

  if (cargando) return <div className="text-slate-500 p-8 font-medium">Cargando directorio de personal...</div>;
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
            <h1 className="text-2xl font-bold text-slate-900">Personal, Permisos y Auditoría</h1>
            <p className="text-slate-500 text-sm">Control jerárquico de roles, matriz de permisos y trazabilidad de quién hizo qué</p>
          </div>
        </div>

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

      {/* Tabs */}
      <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
        <button
          onClick={() => setTabActual('personal')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${
            tabActual === 'personal' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users size={16} />
          <span>Personal y Roles</span>
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
                  <th className="p-4 font-semibold">Rol Actual</th>
                  <th className="p-4 font-semibold text-center">Asignar Nuevo Rol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {usuarios.map((user) => {
                  const rolActual = rolesDisponibles.find(r => r.id === user.rol_id) || rolesDisponibles[3];
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
                      <td className="p-4">
                        <div className="flex items-center space-x-2" title={rolActual.descripcion}>
                          {rolActual.icono}
                          <span className={`px-2 py-1 rounded-md text-xs font-bold border ${rolActual.color}`}>
                            {user.nombre_rol}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center">
                          <select
                            disabled={actualizando === user.id_usuario || esYoMismo}
                            value={user.rol_id}
                            onChange={(e) => cambiarRol(user.id_usuario, Number(e.target.value))}
                            className="bg-white border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-100 cursor-pointer"
                            title={esYoMismo ? "No puedes cambiar tu propio rol por seguridad." : "Selecciona para cambiar permisos"}
                          >
                            {rolesDisponibles.map(rol => (
                              <option key={rol.id} value={rol.id}>{rol.nombre}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Diccionario de Roles */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <h3 className="text-xs font-bold text-slate-700 mb-4 uppercase tracking-wider">Diccionario de Roles y Jerarquía</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rolesDisponibles.map(rol => (
                <div key={rol.id} className="flex items-start space-x-3 bg-white p-3 rounded-xl border border-slate-100">
                  <div className="mt-0.5">{rol.icono}</div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{rol.nombre}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{rol.descripcion}</p>
                  </div>
                </div>
              ))}
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
    </div>
  );
}