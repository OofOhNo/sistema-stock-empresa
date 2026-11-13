import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { MapPin, Plus, Edit2, Trash2, Building2, Users, Package, RefreshCw, X, AlertTriangle, Truck } from 'lucide-react';
import Organizacion from './Organizacion';
import PanelVehiculosTransporte from '../components/ubicaciones/PanelVehiculosTransporte';

export default function Ubicaciones({ usuario }) {
  const [subTab, setSubTab] = useState('sedes'); // 'sedes' | 'almacenes'
  const [ubicaciones, setUbicaciones] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [ubicacionAEliminar, setUbicacionAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const puedeEditarUbicaciones =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.ubicaciones?.puede_editar === true;

  const [form, setForm] = useState({
    nombre: '',
    id_division: ''
  });

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [resUbicaciones, resDivisiones] = await Promise.all([
        api.get('/ubicaciones'),
        api.get('/ubicaciones/divisiones')
      ]);

      setUbicaciones(resUbicaciones.data.datos || []);
      const divs = resDivisiones.data.datos || [];
      setDivisiones(divs);
      if (divs.length > 0) {
        setForm(f => (f.id_division ? f : { ...f, id_division: divs[0].id_division }));
      }
    } catch {
      toast.error('No se pudieron cargar las ubicaciones.');
    } finally {
      setCargando(false);
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

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalAbierto(false);
        setUbicacionAEliminar(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      toast.error('Escribe el nombre de la sede o almacén.');
      return;
    }

    setGuardando(true);
    try {
      if (editandoId) {
        await api.put(`/ubicaciones/${editandoId}`, {
          nombre: form.nombre.trim(),
          id_division: Number(form.id_division)
        });
        toast.success('Sede / almacén actualizado con éxito.');
      } else {
        await api.post('/ubicaciones', {
          nombre: form.nombre.trim(),
          id_division: Number(form.id_division)
        });
        toast.success('Nueva sede / almacén creado con éxito.');
      }
      cerrarModal();
      cargarDatos();
    } catch (error) {
      toast.error('No se pudo guardar: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!ubicacionAEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/ubicaciones/${ubicacionAEliminar.id_ubicacion}`);
      toast.success('Sede / almacén eliminado.');
      setUbicacionAEliminar(null);
      cargarDatos();
    } catch (error) {
      toast.error('No se pudo eliminar: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* SELECTOR DE SUB-PESTAÑAS EN UBICACIONES */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl w-full sm:w-max max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab('sedes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'sedes'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 size={15} />
          <span>Sedes y Encargados</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('almacenes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'almacenes'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin size={15} />
          <span>Lista de Almacenes y Sucursales</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('vehiculos')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'vehiculos'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck size={15} />
          <span>Vehículos y Transporte</span>
        </button>
      </div>

      {subTab === 'sedes' ? (
        <Organizacion usuario={usuario} />
      ) : subTab === 'vehiculos' ? (
        <PanelVehiculosTransporte puedeEditar={puedeEditarUbicaciones} />
      ) : (
        <>
          {/* Cabecera */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                <MapPin size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-blue-950">Almacenes y Sucursales</h2>
                <p className="text-sm text-slate-500">
                  Crea o modifica los locales, plantas y almacenes de la empresa
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={cargarDatos}
                disabled={cargando}
                className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Actualizar"
              >
                <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
              </button>
              {puedeEditarUbicaciones && (
                <button
                  type="button"
                  onClick={abrirModalCrear}
                  className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
                >
                  <Plus size={18} />
                  <span>Nueva Sede o Almacén</span>
                </button>
              )}
            </div>
          </div>

          {/* Tabla de Ubicaciones */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {cargando ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                Cargando sedes y almacenes...
              </div>
            ) : ubicaciones.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium">No hay sedes registradas todavía.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-4 px-6">Nombre de Sede / Almacén</th>
                      <th className="py-4 px-6">Área / División</th>
                      <th className="py-4 px-6 text-center">Empleados Asignados</th>
                      <th className="py-4 px-6 text-center">Productos con Stock</th>
                      {puedeEditarUbicaciones && <th className="py-4 px-6 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {ubicaciones.map((ub) => (
                      <tr key={ub.id_ubicacion} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-6 font-semibold text-slate-900">
                          <div className="flex items-center space-x-2">
                            <MapPin size={16} className="text-indigo-500 shrink-0" />
                            <span>{ub.nombre}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                            <Building2 size={12} className="mr-1 text-slate-500" />
                            {ub.nombre_division || 'General'}
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
                        {puedeEditarUbicaciones && (
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                type="button"
                                onClick={() => abrirModalEditar(ub)}
                                className="px-2.5 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center space-x-1 text-xs font-semibold cursor-pointer"
                                title="Cambiar nombre o área"
                              >
                                <Edit2 size={14} />
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setUbicacionAEliminar(ub)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar sede"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Crear / Editar */}
          {modalAbierto && puedeEditarUbicaciones && (
            <div
              onClick={() => !guardando && cerrarModal()}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-blue-950">
                    {editandoId ? 'Modificar Sede o Almacén' : 'Nueva Sede o Almacén'}
                  </h3>
                  <button
                    type="button"
                    onClick={cerrarModal}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Nombre de la Sede o Almacén *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Planta Principal, Almacén Norte..."
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {divisiones.length > 0 && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Área / División
                      </label>
                      <select
                        value={form.id_division}
                        onChange={(e) => setForm({ ...form, id_division: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors bg-white"
                      >
                        {divisiones.map((div) => (
                          <option key={div.id_division} value={div.id_division}>
                            {div.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={cerrarModal}
                      disabled={guardando}
                      className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={guardando}
                      className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {guardando ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Crear Sede'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Confirmar Eliminación */}
          {ubicacionAEliminar && puedeEditarUbicaciones && (
            <div
              onClick={() => !eliminando && setUbicacionAEliminar(null)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-blue-950">¿Eliminar "{ubicacionAEliminar.nombre}"?</h3>
                    <p className="text-xs text-slate-500">Acción permanente</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  Solo se puede eliminar si no tiene empleados asignados, pedidos registrados ni mercadería guardada en su inventario.
                </p>
                <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => setUbicacionAEliminar(null)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={confirmarEliminar}
                    className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
