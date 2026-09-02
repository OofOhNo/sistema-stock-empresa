import React, { useState, useEffect } from 'react';
import api from '../api';
import { Users, Shield, ShieldAlert, UserCheck, Briefcase, Lock } from 'lucide-react';

export default function Usuarios({ usuarioLogueado }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [actualizando, setActualizando] = useState(null);

  // definimos la jerarquia de roles de la empresa
  const rolesDisponibles = [
    {
      id: 'Admin Central',
      icono: <ShieldAlert size={16} className="text-red-500" />,
      color: 'bg-red-100 text-red-700 border-red-200',
      descripcion: 'Acceso total. Puede ver todas las sucursales, anular movimientos y gestionar roles.'
    },
    {
      id: 'Administrador', // actua como gerente de area
      icono: <Shield size={16} className="text-indigo-500" />,
      color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      descripcion: 'Gestión completa de su área. Puede anular movimientos pasados los 10 mins.'
    },
    {
      id: 'Jefe de División',
      icono: <Briefcase size={16} className="text-blue-500" />,
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      descripcion: 'Puede aprobar pedidos y ver reportes del personal a su cargo.'
    },
    {
      id: 'Vendedor', // empleado Normal
      icono: <UserCheck size={16} className="text-emerald-500" />,
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      descripcion: 'Operaciones básicas. Factura, registra stock y tiene 10 mins para correcciones.'
    }
  ];

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
        const res = await api.get('/usuarios'); // Usa la ruta que tengas configurada
        setUsuarios(res.data.datos); // <--- CAMBIAR res.data.usuarios POR res.data.datos
    } catch (err) {
        setError('Error al cargar la lista de personal.');
    } finally {
        setCargando(false);
  }
};

  const cambiarRol = async (idUsuario, nuevoRol) => {
    if (!window.confirm(`¿Seguro que deseas cambiar el rol a ${nuevoRol}? Esto modificará sus accesos inmediatamente.`)) return;
    
    setActualizando(idUsuario);
    try {
      const res = await api.put(`/usuarios/${idUsuario}/rol`, { nuevo_rol: nuevoRol });
      alert(res.data.mensaje);
      cargarUsuarios(); // recargar la tabla para ver el cambio
    } catch (err) {
      alert('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setActualizando(null);
    }
  };

  // proteccion de la pantalla: si no es Admin Central, no deberia estar aqui
  if (usuarioLogueado?.rol !== 'Administrador' && usuarioLogueado?.rol !== 'Admin Central') {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-full">
        <Lock size={64} className="text-red-400 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800">Acceso Restringido</h2>
        <p className="text-slate-500 mt-2">No tienes los permisos necesarios para gestionar el personal.</p>
      </div>
    );
  }

  if (cargando) return <div className="text-slate-500 p-8 font-medium">Cargando directorio de personal...</div>;
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl m-8">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-slate-800 text-white rounded-xl shadow-lg">
          <Users size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de Personal y Permisos</h1>
          <p className="text-slate-500 text-sm">Otorga y revoca accesos a los módulos del ERP</p>
        </div>
      </div>

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
              const rolActual = rolesDisponibles.find(r => r.id === user.rol) || rolesDisponibles[3];
              const esYoMismo = user.id_usuario === usuarioLogueado.id_usuario;

              return (
                <tr key={user.id_usuario} className={`hover:bg-slate-50 transition-colors ${esYoMismo ? 'bg-indigo-50/20' : ''}`}>
                  <td className="p-4">
                    <div className="font-bold text-slate-900 flex items-center space-x-2">
                      <span>{user.nombre}</span>
                      {esYoMismo && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Tú</span>}
                    </div>
                  </td>
                  <td className="p-4 text-slate-500">{user.email}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-2" title={rolActual.descripcion}>
                      {rolActual.icono}
                      <span className={`px-2 py-1 rounded-md text-xs font-bold border ${rolActual.color}`}>
                        {user.rol}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex justify-center">
                      <select
                        disabled={actualizando === user.id_usuario || esYoMismo}
                        value={user.rol}
                        onChange={(e) => cambiarRol(user.id_usuario, e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-100 cursor-pointer"
                        title={esYoMismo ? "No puedes cambiar tu propio rol por seguridad." : "Selecciona para cambiar permisos"}
                      >
                        {rolesDisponibles.map(rol => (
                          <option key={rol.id} value={rol.id}>{rol.id}</option>
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

      {/* leyenda de roles para el admin */}
      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Diccionario de Permisos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rolesDisponibles.map(rol => (
            <div key={rol.id} className="flex items-start space-x-3">
              <div className="mt-1">{rol.icono}</div>
              <div>
                <p className="font-bold text-slate-700 text-sm">{rol.id}</p>
                <p className="text-slate-500 text-xs mt-0.5">{rol.descripcion}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}