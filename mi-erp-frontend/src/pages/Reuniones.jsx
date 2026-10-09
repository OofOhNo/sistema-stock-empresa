import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Calendar, Plus, ArrowLeft, Users, MapPin, Target } from 'lucide-react';

export default function Reuniones({ usuario }) {
  const [reuniones, setReuniones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  
  const [vista, setVista] = useState('lista');
  const [guardando, setGuardando] = useState(false);
  
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_hora_inicio: '',
    fecha_hora_fin: '',
    id_sala: '',
    alcance: 'general',
    id_ubicacion: '',
    enlace_videollamada: ''
  });

  useEffect(() => {
    cargarReuniones();
  }, []);

  const cargarReuniones = async () => {
    setCargando(true);
    try {
      const respuesta = await api.get('/reuniones');
      setReuniones(respuesta.data.eventos || []);
    } catch (err) {
      setError('No se pudieron cargar las reuniones.');
    } finally {
      setCargando(false);
    }
  };

  const enviarNuevaReunion = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post('/reuniones', {
        ...form,
        id_organizador: usuario.id_usuario,
        id_sala: form.id_sala || null,
        id_ubicacion: form.id_ubicacion || null
      });
      toast.success('¡Reunión programada con éxito!');
      setForm({
        titulo: '', descripcion: '', fecha_hora_inicio: '', fecha_hora_fin: '', 
        id_sala: '', alcance: 'general', id_ubicacion: '', enlace_videollamada: ''
      });
      setVista('lista');
      cargarReuniones();
    } catch (err) {
      toast.error('Error al programar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardando(false);
    }
  };

  const formatearFechaHora = (fechaISO) => {
    const opciones = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(fechaISO).toLocaleDateString('es-ES', opciones);
  };

  if (cargando && vista === 'lista') return <div className="text-slate-500 font-medium">Cargando calendario de reuniones...</div>;
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl">{error}</div>;

  return (
    <div className="space-y-6">
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {vista === 'lista' ? 'Calendario de Reuniones' : 'Programar Reunión'}
            </h1>
            <p className="text-slate-500 text-sm">
              {vista === 'lista' ? 'Eventos, auditorías y reuniones' : 'Crea un nuevo evento corporativo'}
            </p>
          </div>
        </div>

        {vista === 'lista' ? (
          <button onClick={() => setVista('nuevo')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 shadow-lg shadow-indigo-600/30">
            <Plus size={18} />
            <span>Nueva Reunión</span>
          </button>
        ) : (
          <button onClick={() => setVista('lista')} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2">
            <ArrowLeft size={18} />
            <span>Volver a la lista</span>
          </button>
        )}
      </div>

      {vista === 'nuevo' && (
        <form onSubmit={enviarNuevaReunion} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Título de la reunión</label>
              <input type="text" required value={form.titulo} onChange={(e) => setForm({...form, titulo: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" placeholder="Ej. Auditoría de inventario Q3" />
            </div>
            
            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Descripción</label>
              <textarea value={form.descripcion} onChange={(e) => setForm({...form, descripcion: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 h-24" placeholder="Detalles de la reunión..." />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Inicio</label>
              <input type="datetime-local" required value={form.fecha_hora_inicio} onChange={(e) => setForm({...form, fecha_hora_inicio: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Fin</label>
              <input type="datetime-local" required value={form.fecha_hora_fin} onChange={(e) => setForm({...form, fecha_hora_fin: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Alcance</label>
              <select value={form.alcance} onChange={(e) => setForm({...form, alcance: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                <option value="general">General (Toda la empresa)</option>
                <option value="ubicacion">Por Ubicación / Ubicación</option>
                <option value="privada">Privada</option>
              </select>
            </div>

            {form.alcance === 'ubicacion' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ID Ubicación</label>
                <input type="number" required value={form.id_ubicacion} onChange={(e) => setForm({...form, id_ubicacion: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Enlace Videollamada (opcional)</label>
              <input type="url" value={form.enlace_videollamada} onChange={(e) => setForm({...form, enlace_videollamada: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" placeholder="https://meet.google.com/..." />
            </div>
          </div>
          
          <div className="flex justify-end pt-4">
            <button type="submit" disabled={guardando} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-8 py-3 rounded-xl font-bold">
              {guardando ? 'Guardando...' : 'Programar'}
            </button>
          </div>
        </form>
      )}

      {vista === 'lista' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-semibold">Reunión</th>
                <th className="p-4 font-semibold">Organizador</th>
                <th className="p-4 font-semibold">Alcance</th>
                <th className="p-4 font-semibold">Inicio</th>
                <th className="p-4 font-semibold">Fin</th>
                <th className="p-4 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {reuniones.map((reunion) => (
                <tr key={reunion.id_reunion} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-slate-900">{reunion.titulo}</td>
                  <td className="p-4 text-slate-700">
                    <div className="flex items-center space-x-2">
                      <Users size={14} className="text-slate-400" />
                      <span>{reunion.organizador || 'Sistema'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-700 uppercase text-xs font-bold">
                    {reunion.alcance || 'GENERAL'}
                  </td>
                  <td className="p-4 text-slate-700">{formatearFechaHora(reunion.fecha_hora_inicio)}</td>
                  <td className="p-4 text-slate-700">{formatearFechaHora(reunion.fecha_hora_fin)}</td>
                  <td className="p-4 text-center">
                    <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">{reunion.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reuniones.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              No hay reuniones programadas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
