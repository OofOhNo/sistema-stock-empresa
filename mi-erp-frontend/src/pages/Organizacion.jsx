import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  Building2, Users, MapPin, Phone, ShieldCheck, UserCheck, 
  Edit3, CheckCircle2, ChevronRight, X, AlertCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Organizacion({ usuario }) {
  const [sedes, setSedes] = useState([]);
  const [todosUsuarios, setTodosUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalEditar, setModalEditar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    id_gerente: '',
    telefono_contacto: '',
    direccion_completa: ''
  });

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const res = await api.get('/organizacion');
      setSedes(res.data.sedes || []);
      setTodosUsuarios(res.data.todosUsuarios || []);
    } catch (err) {
      console.error('Error al cargar organización:', err);
      toast.error('Error al cargar datos de organización y sedes');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const abrirModalEditar = (sede) => {
    setModalEditar(sede);
    setForm({
      id_gerente: sede.id_gerente || '',
      telefono_contacto: sede.telefono_contacto || '',
      direccion_completa: sede.direccion_completa || ''
    });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!modalEditar) return;
    setGuardando(true);
    try {
      const res = await api.put(`/organizacion/gerente/${modalEditar.id_ubicacion}`, form);
      toast.success(res.data.mensaje || 'Gerente de sitio y datos actualizados correctamente');
      setModalEditar(null);
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al actualizar gerente de sitio');
    } finally {
      setGuardando(false);
    }
  };

  const totalSedes = sedes.length;
  const sedesConGerente = sedes.filter(s => s.id_gerente).length;
  const totalPersonal = sedes.reduce((acc, s) => acc + (s.total_personal || 0), 0);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-900 text-white rounded-xl shadow-md shadow-blue-950/20">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Organización y Gerentes de Sitio</h1>
            <p className="text-slate-500 text-sm">Directorio de sedes operativas, asignación de gerentes responsables y personal en planta</p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sedes Operativas</p>
            <h3 className="text-2xl font-bold text-blue-950 mt-1">{totalSedes}</h3>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <Building2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gerentes de Sitio Activos</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{sedesConGerente} / {totalSedes}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <UserCheck size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Personal Asignado</p>
            <h3 className="text-2xl font-bold text-indigo-600 mt-1">{totalPersonal} empleados</h3>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users size={20} />
          </div>
        </div>
      </div>

      {/* Grid de Sedes */}
      {cargando ? (
        <div className="p-12 text-center text-slate-500 font-medium bg-white rounded-2xl border border-slate-200">
          Cargando sedes y estructura organizativa...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {sedes.map((sede) => (
            <div key={sede.id_ubicacion} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
              
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                      {sede.tipo || 'Sede'}
                    </span>
                    <h3 className="text-xl font-bold text-blue-950 mt-2">{sede.nombre_sede}</h3>
                  </div>

                  <button
                    onClick={() => abrirModalEditar(sede)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    <Edit3 size={14} />
                    <span>Configurar Sede</span>
                  </button>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center space-x-2">
                    <MapPin size={16} className="text-slate-400 shrink-0" />
                    <span className="truncate">{sede.direccion_completa || 'Dirección no especificada'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone size={16} className="text-slate-400 shrink-0" />
                    <span>{sede.telefono_contacto || 'Teléfono no asignado'}</span>
                  </div>
                </div>

                {/* Tarjeta del Gerente de Sitio */}
                <div className="mt-6 p-4 rounded-xl border border-slate-100 bg-slate-50/70">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Gerente de Sitio Responsable
                  </div>
                  {sede.id_gerente ? (
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-sm">
                        {sede.nombre_gerente?.substring(0, 2).toUpperCase() || 'GS'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{sede.nombre_gerente}</p>
                        <p className="text-xs text-slate-500">{sede.email_gerente}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-amber-600 text-sm font-medium">
                      <AlertCircle size={16} />
                      <span>Sin gerente de sitio asignado</span>
                    </div>
                  )}
                </div>

                {/* Personal asignado a esta sede */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    <span>Personal Asignado ({sede.total_personal || 0})</span>
                  </div>
                  {sede.personal && sede.personal.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {sede.personal.map(p => (
                        <span key={p.id_usuario} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 shadow-2xs">
                          {p.nombre_completo} <span className="ml-1 text-[10px] text-slate-400 font-normal">({p.nombre_rol})</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No hay empleados asignados a esta sede.</p>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Estado: <strong className="text-emerald-600">Activo</strong></span>
                <span>ID Sede: #{sede.id_ubicacion}</span>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Modal Asignar Gerente y Configurar Sede */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Configurar Sede y Gerente</h3>
                  <p className="text-xs text-slate-500">{modalEditar.nombre_sede}</p>
                </div>
              </div>
              <button onClick={() => setModalEditar(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Gerente de Sitio Responsable</label>
                <select
                  value={form.id_gerente}
                  onChange={(e) => setForm({ ...form, id_gerente: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-hidden bg-white"
                >
                  <option value="">-- Sin Gerente Asignado --</option>
                  {todosUsuarios.map(u => (
                    <option key={u.id_usuario} value={u.id_usuario}>
                      {u.nombre_completo} ({u.nombre_rol})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">El gerente de sitio tiene la supervisión de operaciones e inventario de esta sede.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Teléfono de Contacto</label>
                <input 
                  type="text"
                  placeholder="+51 987 111 222"
                  value={form.telefono_contacto}
                  onChange={(e) => setForm({ ...form, telefono_contacto: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Dirección Completa de la Sede</label>
                <textarea 
                  rows={2}
                  placeholder="Av. Principal 123, Parque Industrial, Lima"
                  value={form.direccion_completa}
                  onChange={(e) => setForm({ ...form, direccion_completa: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEditar(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-blue-900 hover:bg-blue-950 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

