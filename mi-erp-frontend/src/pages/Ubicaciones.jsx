import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { MapPin, Plus, Edit2, Trash2, Building2, Users, Package, RefreshCw, X, Network } from 'lucide-react';
import Organizacion from './Organizacion';

export default function Ubicaciones({ usuario }) {
  const [subTab, setSubTab] = useState('sedes'); // 'sedes' | 'almacenes'
  const [ubicaciones, setUbicaciones] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  const [form, setForm] = useState({
    nombre: '',
    id_division: ''
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resUbicaciones, resDivisiones] = await Promise.all([
        api.get('/ubicaciones'),
        api.get('/ubicaciones/divisiones')
      ]);

      setUbicaciones(resUbicaciones.data.datos || []);
      const divs = resDivisiones.data.datos || [];
      setDivisiones(divs);
      if (divs.length > 0 && !form.id_division) {
        setForm(f => ({ ...f, id_division: divs[0].id_division }));
      }
    } catch (error) {
      toast.error('Error al cargar ubicaciones: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setCargando(false);
    }
  };

  const abrirModalCrear = () => {
    setEditandoId(null);
    setForm({
      nombre: '',
      id_division: divisiones.length > 0 ? divisiones[0].id_division : ''
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (ub) => {
    setEditandoId(ub.id_ubicacion);
    setForm({
      nombre: ub.nombre,
      id_division: ub.id_division || (divisiones.length > 0 ? divisiones[0].id_division : '')
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setEditandoId(null);
    setForm({ nombre: '', id_division: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('El nombre de la ubicación es obligatorio.');
      return;
    }

    setGuardando(true);
    try {
      if (editandoId) {
        await api.put(`/ubicaciones/${editandoId}`, {
          nombre: form.nombre.trim(),
          id_division: Number(form.id_division)
        });
        toast.success('Ubicación actualizada correctamente.');
      } else {
        await api.post('/ubicaciones', {
          nombre: form.nombre.trim(),
          id_division: Number(form.id_division)
        });
        toast.success('Ubicación creada exitosamente.');
      }
      cerrarModal();
      cargarDatos();
    } catch (error) {
      toast.error('Error: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = (ub) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium text-slate-800">
          ¿Eliminar la ubicación <strong className="text-slate-900">{ub.nombre}</strong>?
        </p>
        <p className="text-xs text-slate-500">
          No se podrá eliminar si tiene usuarios, pedidos o stock físico activo asociados.
        </p>
        <div className="flex justify-end space-x-2 pt-1">
          <button
            onClick={() => {
              toast.dismiss(t.id);
              ejecutarEliminar(ub.id_ubicacion);
            }}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            Sí, eliminar
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: 8000 });
  };

  const ejecutarEliminar = async (id) => {
    try {
      await api.delete(`/ubicaciones/${id}`);
      toast.success('Ubicación eliminada con éxito.');
      cargarDatos();
    } catch (error) {
      toast.error('Error al eliminar: ' + (error.response?.data?.mensaje || error.message));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* SELECTOR DE SUB-PESTAÑAS EN UBICACIONES */}
      <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
        <button
          onClick={() => setSubTab('sedes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            subTab === 'sedes' 
              ? 'bg-white text-indigo-600 shadow-xs' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 size={15} />
          <span>Organización y Sedes</span>
        </button>

        <button
          onClick={() => setSubTab('almacenes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            subTab === 'almacenes' 
              ? 'bg-white text-indigo-600 shadow-xs' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin size={15} />
          <span>Gestión de Ubicaciones / Almacenes</span>
        </button>
      </div>

      {subTab === 'sedes' ? (
        <Organizacion usuario={usuario} />
      ) : (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
              <MapPin size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-blue-950">Gestión de Ubicaciones</h2>
              <p className="text-sm text-slate-500">
                Administra almacenes, sucursales y sedes corporativas con sus divisiones asociadas.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="Recargar"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={abrirModalCrear}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-colors"
          >
            <Plus size={18} />
            <span>Nueva Ubicación</span>
          </button>
        </div>
      </div>

      {/* Tabla de Ubicaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">
            Cargando ubicaciones...
          </div>
        ) : ubicaciones.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No se encontraron ubicaciones registradas.</p>
            <p className="text-slate-400 text-sm mt-1">Crea la primera ubicación para comenzar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-6">ID</th>
                  <th className="py-4 px-6">Nombre de Ubicación</th>
                  <th className="py-4 px-6">División Organizacional</th>
                  <th className="py-4 px-6 text-center">Usuarios Asignados</th>
                  <th className="py-4 px-6 text-center">Productos en Stock</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {ubicaciones.map((ub) => (
                  <tr key={ub.id_ubicacion} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-mono text-xs text-slate-400 font-bold">
                      #{ub.id_ubicacion}
                    </td>
                    <td className="py-4 px-6 font-semibold text-slate-900">
                      <div className="flex items-center space-x-2">
                        <MapPin size={16} className="text-indigo-500 shrink-0" />
                        <span>{ub.nombre}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        <Building2 size={12} className="mr-1 text-slate-500" />
                        {ub.nombre_division || 'División General'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center text-xs font-semibold text-slate-600">
                        <Users size={14} className="mr-1 text-slate-400" />
                        {ub.total_usuarios || 0}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="inline-flex items-center text-xs font-semibold text-slate-600">
                        <Package size={14} className="mr-1 text-slate-400" />
                        {ub.total_productos || 0}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => abrirModalEditar(ub)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Editar ubicación"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleEliminar(ub)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar ubicación"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editandoId ? 'Editar Ubicación' : 'Nueva Ubicación'}
              </h3>
              <button
                onClick={cerrarModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Nombre de la Ubicación / Sucursal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Sucursal Central, Almacén Norte..."
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  División Asociada
                </label>
                <select
                  value={form.id_division}
                  onChange={(e) => setForm({ ...form, id_division: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                >
                  {divisiones.map((div) => (
                    <option key={div.id_division} value={div.id_division}>
                      {div.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={cerrarModal}
                  disabled={guardando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Crear Ubicación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

