import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';
import {
  OPCIONES_DURACION_SESION,
  formatearDuracionSesionLegible
} from '../utils/sesionRol';

const INFO_MODULOS = {
  stock: { nombre: 'Inventario', ayuda: 'Ver stock y registrar entradas o salidas' },
  productos: { nombre: 'Productos', ayuda: 'Ver catálogo, crear o cambiar precios' },
  clientes: { nombre: 'Clientes', ayuda: 'Ver lista de clientes y registrar nuevos' },
  pedidos: { nombre: 'Pedidos y Despacho', ayuda: 'Ver calendario, crear pedidos y despachar' },
  facturacion: { nombre: 'Facturación y Boletas', ayuda: 'Ver comprobantes, emitir y anular' },
  calidad: { nombre: 'Calidad y Sanidad', ayuda: 'Ver y emitir certificados de calidad' },
  ubicaciones: { nombre: 'Ubicaciones y Sedes', ayuda: 'Ver sedes y configurar almacenes' },
  organizacion: { nombre: 'Gerentes de Sede', ayuda: 'Ver y asignar encargados por sede' },
  reuniones: { nombre: 'Reuniones', ayuda: 'Ver reuniones, programar actas y acuerdos' },
  usuarios: { nombre: 'Personal, Roles y Claves', ayuda: 'Ver personal, crear usuarios y cambiar contraseñas' },
  errores: { nombre: 'Problemas Reportados', ayuda: 'Ver y resolver avisos enviados con el botón rojo' },
  mensajes: { nombre: 'Chat entre Compañeros', ayuda: 'Enviar y recibir mensajes internos' }
};

export default function PermisosGrid({ puedeEditar = true, onPermisoCambiado }) {
  const [permisos, setPermisos] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [customRolId, setCustomRolId] = useState(null);
  const [customCantidad, setCustomCantidad] = useState('8');
  const [customUnidad, setCustomUnidad] = useState('horas'); // 'min' | 'horas' | 'dias'

  const cargarPermisos = useCallback(async () => {
    setCargando(true);
    try {
      const [resPermisos, resRoles] = await Promise.all([
        api.get('/usuarios/permisos'),
        api.get('/usuarios/roles')
      ]);
      setPermisos(resPermisos.data.datos || resPermisos.data.permisos || []);
      setRolesList(resRoles.data.datos || []);
    } catch {
      toast.error('No se pudieron cargar los permisos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarPermisos();
    });
    return () => {
      alive = false;
    };
  }, [cargarPermisos]);

  const togglePermiso = async (p, campo) => {
    if (!puedeEditar) return;
    const nuevoValor = !p[campo];
    const payload = {
      rol_id: p.rol_id,
      modulo: p.modulo,
      puede_ver: p.puede_ver,
      puede_editar: p.puede_editar
    };

    if (campo === 'puede_editar') {
      payload.puede_editar = nuevoValor;
      if (nuevoValor) payload.puede_ver = true;
    } else {
      payload.puede_ver = nuevoValor;
      if (!nuevoValor) payload.puede_editar = false;
    }

    try {
      await api.put('/usuarios/permisos', payload);
      toast.success('Permiso guardado.');
      await cargarPermisos();
      onPermisoCambiado?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el permiso.');
    }
  };

  const toggleOtrasUbicaciones = async (rolId, valorActual) => {
    if (!puedeEditar) return;
    try {
      await api.put(`/usuarios/roles/${rolId}/ubicaciones-permiso`, {
        puede_ver_otras_ubicaciones: !valorActual
      });
      toast.success('Acceso a otras sedes actualizado.');
      await cargarPermisos();
      onPermisoCambiado?.();
    } catch (err) {
      toast.error('No se pudo actualizar: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  const guardarDuracionSesionRol = async (rolId, minutos) => {
    if (!puedeEditar) return;
    try {
      const res = await api.put(`/usuarios/roles/${rolId}/duracion-sesion`, {
        duracion_sesion_minutos: minutos
      });
      toast.success(res.data?.mensaje || 'Tiempo de sesión actualizado.');
      setCustomRolId(null);
      await cargarPermisos();
      onPermisoCambiado?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el tiempo de sesión.');
    }
  };

  const handleSelectDuracion = (rol, value) => {
    if (value === 'CUSTOM') {
      setCustomRolId(rol.id_rol);
      setCustomCantidad(rol.duracion_sesion_minutos ? String(rol.duracion_sesion_minutos) : '60');
      setCustomUnidad('min');
      return;
    }
    setCustomRolId(null);
    const minutos = value === '' ? null : parseInt(value, 10);
    void guardarDuracionSesionRol(rol.id_rol, minutos);
  };

  const handleGuardarCustom = (rolId) => {
    const n = parseInt(customCantidad, 10);
    if (Number.isNaN(n) || n < 1) {
      toast.error('Ingresa un número mayor o igual a 1.');
      return;
    }
    const multiplicador = customUnidad === 'dias' ? 1440 : customUnidad === 'horas' ? 60 : 1;
    const totalMin = n * multiplicador;
    if (totalMin > 525600) {
      toast.error('El máximo permitido es 1 año (365 días).');
      return;
    }
    void guardarDuracionSesionRol(rolId, totalMin);
  };

  if (cargando) return <div className="p-6 text-slate-500 font-medium">Cargando tabla de permisos...</div>;

  const roles = rolesList.length > 0
    ? rolesList.map(r => r.nombre)
    : [...new Set(permisos.map(p => p.nombre_rol))];
  const modulos = [...new Set(permisos.map(p => p.modulo))];

  if (modulos.length === 0) {
    return <div className="p-6 text-slate-500">No hay permisos configurados todavía.</div>;
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
      {/* ACCESO MULTI-SEDES POR ROL */}
      <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
        <div className="mb-3">
          <h4 className="text-sm font-bold text-blue-950">
            🏢 ¿Qué roles pueden ver el inventario y los pedidos de TODAS las sedes?
          </h4>
          <p className="text-xs text-slate-600 mt-1">
            Si la casilla está desmarcada, las personas con ese rol <strong>solo verán su propia sede</strong>. Si la marcas, podrán ver todas las sedes.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {rolesList.map(r => {
            const esAdmin = r.nombre === 'Admin Central';
            const tieneAcceso = esAdmin || Boolean(r.puede_ver_otras_ubicaciones);
            return (
              <label
                key={r.id_rol}
                className={`bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs ${
                  esAdmin || !puedeEditar ? 'opacity-80' : 'cursor-pointer hover:border-indigo-300'
                }`}
              >
                <div className="pr-2">
                  <p className="text-xs font-bold text-slate-800">{r.nombre}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {tieneAcceso ? '🟢 Ve todas las sedes' : '🔒 Solo ve su sede'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={tieneAcceso}
                  disabled={esAdmin || !puedeEditar}
                  onChange={() => toggleOtrasUbicaciones(r.id_rol, r.puede_ver_otras_ubicaciones)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* RE-INICIO DE SESIÓN OBLIGATORIO POR ROL */}
      <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200/80">
        <div className="mb-3 flex items-start gap-2.5">
          <Clock size={18} className="text-amber-700 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-blue-950">
              ¿Cada cuánto tiempo cada rol está obligado a volver a iniciar sesión?
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Se cuenta en tiempo fijo desde que el trabajador inicia sesión. Al cumplirse el tiempo, la sesión se cierra automáticamente y debe ingresar de nuevo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rolesList.map(r => {
            const valorActual = r.duracion_sesion_minutos ? String(r.duracion_sesion_minutos) : '';
            const esPreset = OPCIONES_DURACION_SESION.some(o => o.value === valorActual);
            const editandoCustom = customRolId === r.id_rol;

            return (
              <div
                key={r.id_rol}
                className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 truncate">{r.nombre}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                    {formatearDuracionSesionLegible(r.duracion_sesion_minutos)}
                  </span>
                </div>

                <select
                  disabled={!puedeEditar}
                  value={editandoCustom ? 'CUSTOM' : (esPreset ? valorActual : 'CUSTOM')}
                  onChange={(e) => handleSelectDuracion(r, e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-700 focus:outline-hidden focus:border-indigo-500 disabled:opacity-60 cursor-pointer"
                >
                  {OPCIONES_DURACION_SESION.map(opt => (
                    <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                  ))}
                  {!esPreset && !editandoCustom && valorActual && (
                    <option value="CUSTOM">Personalizado ({formatearDuracionSesionLegible(valorActual)})</option>
                  )}
                  <option value="CUSTOM">Personalizado...</option>
                </select>

                {editandoCustom && puedeEditar && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="number"
                      min="1"
                      value={customCantidad}
                      onChange={(e) => setCustomCantidad(e.target.value)}
                      className="w-16 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold"
                    />
                    <select
                      value={customUnidad}
                      onChange={(e) => setCustomUnidad(e.target.value)}
                      className="border border-slate-300 rounded-lg px-1.5 py-1 text-xs bg-white font-semibold"
                    >
                      <option value="min">min</option>
                      <option value="horas">horas</option>
                      <option value="dias">días</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleGuardarCustom(r.id_rol)}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* TABLA DE PERMISOS POR PANTALLA */}
      <div className="overflow-x-auto">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-blue-950">¿Qué pantallas puede ver o modificar cada Rol?</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            <strong>Ver:</strong> permite abrir esa pestaña y mirar los datos. · <strong>Crear / Editar:</strong> permite agregar, cambiar o anular registros (en <em>Personal, Roles y Claves</em> también permite restablecer contraseñas olvidadas).
          </p>
        </div>

        <table className="w-full text-left border-collapse min-w-[650px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
              <th className="p-3.5 font-bold">Pantalla del Sistema</th>
              {roles.map(rol => (
                <th key={rol} className="p-3.5 font-bold text-center">{rol}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {modulos.map(modulo => {
              const info = INFO_MODULOS[modulo] || { nombre: modulo, ayuda: '' };
              return (
                <tr key={modulo} className="hover:bg-slate-50/80">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-800">{info.nombre}</div>
                    {info.ayuda && <div className="text-[11px] text-slate-500">{info.ayuda}</div>}
                  </td>
                  {roles.map(rol => {
                    const p = permisos.find(x => x.nombre_rol === rol && x.modulo === modulo);
                    const esAdmin = rol === 'Admin Central';
                    if (!p && !esAdmin) {
                      return <td key={rol} className="p-3.5 text-center text-slate-300">-</td>;
                    }
                    const puedeVer = esAdmin ? true : Boolean(p?.puede_ver);
                    const puedeEditarMod = esAdmin ? true : Boolean(p?.puede_editar);

                    return (
                      <td key={rol} className="p-3.5 text-center">
                        <div className="inline-flex flex-col items-start space-y-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                          <label className={`flex items-center space-x-2 text-xs font-medium ${esAdmin || !puedeEditar ? 'text-slate-400' : 'text-slate-700 cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={puedeVer}
                              onChange={() => p && togglePermiso(p, 'puede_ver')}
                              disabled={esAdmin || !puedeEditar}
                              className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <span>Ver</span>
                          </label>
                          <label className={`flex items-center space-x-2 text-xs font-medium ${esAdmin || !puedeEditar ? 'text-slate-400' : 'text-slate-700 cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={puedeEditarMod}
                              onChange={() => p && togglePermiso(p, 'puede_editar')}
                              disabled={esAdmin || !puedeEditar}
                              className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <span>Crear / Editar</span>
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
