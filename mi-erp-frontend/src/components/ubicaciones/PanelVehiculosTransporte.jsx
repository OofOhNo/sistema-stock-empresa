import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { Truck, Plus, Edit2, Trash2, RefreshCw, X, ShieldCheck } from 'lucide-react';

export default function PanelVehiculosTransporte({ puedeEditar = false }) {
  const [vehiculos, setVehiculos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    placa: '',
    descripcion: '',
    entidad_emisora: '',
    numero_autorizacion: ''
  });

  const cargarVehiculos = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api.get('/facturacion/gre/catalogos');
      setVehiculos(res.data?.vehiculos || []);
    } catch (err) {
      toast.error('Error al cargar vehículos: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarVehiculos();
  }, [cargarVehiculos]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ placa: '', descripcion: '', entidad_emisora: '', numero_autorizacion: '' });
    setModalAbierto(true);
  };

  const abrirEditar = (v) => {
    setEditando(v);
    setForm({
      placa: v.placa || '',
      descripcion: v.descripcion || '',
      entidad_emisora: v.entidad_emisora || '',
      numero_autorizacion: v.numero_autorizacion || ''
    });
    setModalAbierto(true);
  };

  const guardarVehiculo = async (e) => {
    e.preventDefault();
    if (!form.placa.trim()) return toast.error('La placa del vehículo es obligatoria.');
    setGuardando(true);
    try {
      if (editando) {
        await api.put(`/facturacion/gre/vehiculos/${editando.id_vehiculo}`, form);
        toast.success('Vehículo actualizado correctamente.');
      } else {
        await api.post('/facturacion/gre/vehiculos', form);
        toast.success('Vehículo agregado correctamente.');
      }
      setModalAbierto(false);
      cargarVehiculos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el vehículo.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarVehiculo = async (v) => {
    if (!window.confirm(`¿Eliminar el vehículo "${v.placa}" de la flota?`)) return;
    try {
      await api.delete(`/facturacion/gre/vehiculos/${v.id_vehiculo}`);
      toast.success('Vehículo eliminado.');
      cargarVehiculos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo eliminar el vehículo.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-sky-100 text-sky-700 rounded-xl">
            <Truck size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-blue-950">Vehículos y Transporte</h2>
            <p className="text-sm text-slate-500">
              Administra las unidades de despacho con su placa, descripción interna y datos de autorización
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={cargarVehiculos}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Actualizar lista"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          {puedeEditar && (
            <button
              type="button"
              onClick={abrirNuevo}
              className="flex items-center space-x-2 bg-sky-600 hover:bg-sky-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={18} />
              <span>Nuevo Vehículo</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-sky-50 border border-sky-200 text-sky-900 px-4 py-3 rounded-xl text-xs flex items-center space-x-2">
        <ShieldCheck size={16} className="text-sky-600 shrink-0" />
        <span>
          La <strong>Descripción interna</strong> solo se muestra dentro del sistema (por ejemplo en el selector de Facturación/GRE) para identificar fácilmente cada vehículo, y no aparece en la Guía impresa oficial.
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando vehículos...</div>
        ) : vehiculos.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={42} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No hay vehículos registrados todavía.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-6">Placa</th>
                  <th className="py-4 px-6">Descripción Interna (Solo Sistema)</th>
                  <th className="py-4 px-6">Entidad Emisora</th>
                  <th className="py-4 px-6">Nro. Autorización</th>
                  {puedeEditar && <th className="py-4 px-6 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {vehiculos.map((v) => (
                  <tr key={v.id_vehiculo} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6">
                      <span className="font-mono font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg text-xs border border-slate-200">
                        {v.placa}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {v.descripcion ? (
                        <span className="font-medium text-slate-800">{v.descripcion}</span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Sin descripción (haz clic en Editar para agregar)</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-xs">
                      {v.entidad_emisora || <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="py-4 px-6 text-slate-600 text-xs font-mono">
                      {v.numero_autorizacion || <span className="text-slate-400 italic">-</span>}
                    </td>
                    {puedeEditar && (
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => abrirEditar(v)}
                            className="px-2.5 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center space-x-1 text-xs font-semibold cursor-pointer"
                          >
                            <Edit2 size={14} />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarVehiculo(v)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar vehículo"
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

      {modalAbierto && puedeEditar && (
        <div
          onClick={() => !guardando && setModalAbierto(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden my-auto"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Truck className="text-sky-600" size={20} />
                <h3 className="text-lg font-bold text-blue-950">
                  {editando ? 'Editar Vehículo' : 'Agregar Vehículo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={guardarVehiculo} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Número de Placa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: BEG445"
                  value={form.placa}
                  onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Descripción Interna (Solo para nuestro sistema)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Furgón frigorífico blanco 4 TN / Camioneta reparto Arequipa"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Facilita distinguir cuál vehículo es cuál al emitir Guías de Remisión.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Entidad Emisora (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: MTC"
                    value={form.entidad_emisora}
                    onChange={(e) => setForm({ ...form, entidad_emisora: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                    Nro. Autorización (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 150226..."
                    value={form.numero_autorizacion}
                    onChange={(e) => setForm({ ...form, numero_autorizacion: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : (editando ? 'Guardar Cambios' : 'Registrar Vehículo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
