import React, { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

export default function PermisosGrid() {
  const [permisos, setPermisos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarPermisos();
  }, []);

  const cargarPermisos = async () => {
    setCargando(true);
    try {
      const res = await api.get('/usuarios/permisos');
      setPermisos(res.data.datos || res.data.permisos || []);
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

  if (cargando) return <div className="p-4 text-slate-500">Cargando permisos...</div>;

  // Agrupar por rol
  const roles = [...new Set(permisos.map(p => p.nombre_rol))];
  const modulos = [...new Set(permisos.map(p => p.modulo))];

  if (modulos.length === 0) return <div className="p-4 text-slate-500">No hay permisos configurados en la DB.</div>;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-8 overflow-x-auto">
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
  );
}
