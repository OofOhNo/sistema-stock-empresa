import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

export default function PermisosGrid() {
  const [permisos, setPermisos] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarPermisos();
  }, []);

  const cargarPermisos = async () => {
    setCargando(true);
    try {
      const [resPermisos, resRoles] = await Promise.all([
        api.get('/usuarios/permisos'),
        api.get('/usuarios/roles')
      ]);
      setPermisos(resPermisos.data.datos || resPermisos.data.permisos || []);
      setRolesList(resRoles.data.datos || []);
    } catch (err) {
      toast.error('Error al cargar permisos.');
    } finally {
      setCargando(false);
    }
  };

  const togglePermiso = async (rolId, modulo, campo, valorActual) => {
    try {
      await api.put('/usuarios/permisos', {
        rol_id: rolId,
        modulo: modulo,
        [campo]: !valorActual
      });
      toast.success('Permiso actualizado.');
      cargarPermisos();
    } catch (err) {
      toast.error('Error al actualizar permiso.');
    }
  };

  const toggleOtrasUbicaciones = async (rolId, valorActual) => {
    try {
      await api.put(`/usuarios/roles/${rolId}/ubicaciones-permiso`, {
        puede_ver_otras_ubicaciones: !valorActual
      });
      toast.success('Permiso de multi-sede actualizado.');
      cargarPermisos();
    } catch (err) {
      toast.error('Error al actualizar permiso de multi-sede: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  if (cargando) return <div className="p-4 text-slate-500">Cargando permisos...</div>;

  // Agrupar por rol
  const roles = [...new Set(permisos.map(p => p.nombre_rol))];
  const modulos = [...new Set(permisos.map(p => p.modulo))];

  if (modulos.length === 0) return <div className="p-4 text-slate-500">No hay permisos configurados en la DB.</div>;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-8 overflow-x-auto space-y-6">
      {/* SECCIÓN ESPECIAL: ACCESO MULTI-SEDES POR ROL */}
      <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-sm font-bold text-indigo-950 flex items-center space-x-2">
              <span>🏢 Acceso Multi-Sedes por Rol (Inventario y Pedidos)</span>
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Si está desactivado, los usuarios de este rol <b>solo pueden ver su sede asignada</b>. Si está activado, pueden ver el stock y pedidos de otras sedes.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {rolesList.map(r => {
            const esAdmin = r.nombre === 'Admin Central';
            const tieneAcceso = esAdmin || Boolean(r.puede_ver_otras_ubicaciones);
            return (
              <div key={r.id_rol} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
                <div>
                  <p className="text-xs font-bold text-slate-800">{r.nombre}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {tieneAcceso ? '🟢 Ver todas las sedes' : '🔒 Solo sede asignada'}
                  </p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tieneAcceso}
                    disabled={esAdmin}
                    onChange={() => toggleOtrasUbicaciones(r.id_rol, r.puede_ver_otras_ubicaciones)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Matriz de Permisos por Rol</h3>
      <table className="w-full text-left border-collapse min-w-[600px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
            <th className="p-3 font-semibold">Módulo</th>
            {roles.map(rol => (
              <th key={rol} className="p-3 font-semibold text-center">{rol}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm">
          {modulos.map(modulo => (
            <tr key={modulo} className="hover:bg-slate-50">
              <td className="p-3 font-bold text-slate-700 capitalize">{modulo}</td>
              {roles.map(rol => {
                const p = permisos.find(x => x.nombre_rol === rol && x.modulo === modulo);
                if (!p) return <td key={rol} className="p-3 text-center text-slate-300">-</td>;
                const esAdmin = rol === 'Admin Central';
                return (
                  <td key={rol} className="p-3 text-center">
                    <div className="flex flex-col items-center space-y-2">
                      <label className="flex items-center space-x-2 text-xs cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={p.puede_ver} 
                          onChange={() => togglePermiso(p.rol_id, p.modulo, 'puede_ver', p.puede_ver)} 
                          disabled={esAdmin} 
                          className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <span>Ver</span>
                      </label>
                      <label className="flex items-center space-x-2 text-xs cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={p.puede_editar} 
                          onChange={() => togglePermiso(p.rol_id, p.modulo, 'puede_editar', p.puede_editar)} 
                          disabled={esAdmin} 
                          className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <span>Editar</span>
                      </label>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

