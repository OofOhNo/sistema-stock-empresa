import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Calendar, Plus, ArrowLeft, Users, AlertTriangle, Clock, RefreshCw, Filter } from 'lucide-react';

export default function Reuniones({ usuario }) {
  const [reuniones, setReuniones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  
  const [vista, setVista] = useState('lista');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos', 'reunion', 'imprevisto'
  const [guardando, setGuardando] = useState(false);
  
  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_hora_inicio: '',
    fecha_hora_fin: '',
    id_sala: '',
    alcance: 'general',
    id_ubicacion: '',
    enlace_videollamada: '',
    tipo_evento: 'reunion' // 'reunion' o 'imprevisto'
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
      // Si es imprevisto, agregamos tag en la descripción o título para persistencia transparente
      const tituloFinal = form.tipo_evento === 'imprevisto' && !form.titulo.startsWith('[IMPREVISTO]')
        ? `[IMPREVISTO] ${form.titulo}`
        : form.titulo;

      await api.post('/reuniones', {
        ...form,
        titulo: tituloFinal,
        id_organizador: usuario.id_usuario,
        id_sala: form.id_sala || null,
        id_ubicacion: form.id_ubicacion || null
      });
      toast.success(form.tipo_evento === 'imprevisto' ? '¡Fecha imprevista registrada con éxito!' : '¡Reunión programada con éxito!');
      setForm({
        titulo: '', descripcion: '', fecha_hora_inicio: '', fecha_hora_fin: '', 
        id_sala: '', alcance: 'general', id_ubicacion: '', enlace_videollamada: '',
        tipo_evento: 'reunion'
      });
      setVista('lista');
      cargarReuniones();
    } catch (err) {
      toast.error('Error al registrar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardando(false);
    }
  };

  const formatearFechaHora = (fechaISO) => {
    const opciones = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(fechaISO).toLocaleDateString('es-ES', opciones);
  };

  const eventosFiltrados = reuniones.filter((r) => {
    const esImprevisto = r.titulo.startsWith('[IMPREVISTO]');
    if (filtroTipo === 'reunion') return !esImprevisto;
    if (filtroTipo === 'imprevisto') return esImprevisto;
    return true;
  });

  const totalImprevistos = reuniones.filter(r => r.titulo.startsWith('[IMPREVISTO]')).length;
  const totalReuniones = reuniones.length - totalImprevistos;

  if (cargando && vista === 'lista') return <div className="text-slate-500 font-medium p-8">Cargando calendario de reuniones...</div>;
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl">{error}</div>;

  return (
    <div className="space-y-6">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">
              {vista === 'lista' ? 'Calendario de Reuniones y Fechas Imprevistas' : 'Programar Evento o Fecha Imprevista'}
            </h1>
            <p className="text-slate-500 text-sm">
              {vista === 'lista' ? 'Reuniones de empleados, auditorías internas y fechas extraordinarias imprevistas' : 'Crea un nuevo evento corporativo en el calendario'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {vista === 'lista' ? (
            <>
              <button
                onClick={cargarReuniones}
                disabled={cargando}
                className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
                title="Recargar eventos"
              >
                <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setVista('nuevo')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 shadow-sm transition-colors">
                <Plus size={18} />
                <span>Nuevo Evento</span>
              </button>
            </>
          ) : (
            <button onClick={() => setVista('lista')} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 transition-colors">
              <ArrowLeft size={18} />
              <span>Volver a la lista</span>
            </button>
          )}
        </div>
      </div>

      {vista === 'nuevo' && (
        <form onSubmit={enviarNuevaReunion} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-3xl space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Tipo de Evento
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo_evento: 'reunion' })}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    form.tipo_evento === 'reunion'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="block font-bold text-sm">Reunión de Empleados</span>
                  <span className="text-xs text-slate-500">Sesión programada, auditoría o coordinación</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo_evento: 'imprevisto' })}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    form.tipo_evento === 'imprevisto'
                      ? 'border-amber-600 bg-amber-50/50 text-amber-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="block font-bold text-sm">Fecha Imprevista / Incidencia</span>
                  <span className="text-xs text-slate-500">Evento imprevisto, corte o contingencia</span>
                </button>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Título del Evento *
              </label>
              <input 
                type="text" 
                required 
                value={form.titulo} 
                onChange={(e) => setForm({...form, titulo: e.target.value})} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500" 
                placeholder={form.tipo_evento === 'imprevisto' ? 'Ej: Mantenimiento urgente de servidores' : 'Ej: Coordinación semanal de ventas'} 
              />
            </div>
            
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Descripción
              </label>
              <textarea 
                value={form.descripcion} 
                onChange={(e) => setForm({...form, descripcion: e.target.value})} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500 h-24" 
                placeholder="Detalles del evento o imprevisto..." 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Fecha / Hora de Inicio *
              </label>
              <input 
                type="datetime-local" 
                required 
                value={form.fecha_hora_inicio} 
                onChange={(e) => setForm({...form, fecha_hora_inicio: e.target.value})} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Fecha / Hora de Fin *
              </label>
              <input 
                type="datetime-local" 
                required 
                value={form.fecha_hora_fin} 
                onChange={(e) => setForm({...form, fecha_hora_fin: e.target.value})} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Alcance
              </label>
              <select 
                value={form.alcance} 
                onChange={(e) => setForm({...form, alcance: e.target.value})} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
              >
                <option value="general">General (Toda la empresa)</option>
                <option value="ubicacion">Por Ubicación / Sucursal</option>
                <option value="privada">Privada</option>
              </select>
            </div>

            {form.alcance === 'ubicacion' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  ID Ubicación
                </label>
                <input 
                  type="number" 
                  required 
                  value={form.id_ubicacion} 
                  onChange={(e) => setForm({...form, id_ubicacion: e.target.value})} 
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500" 
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Enlace Videollamada (opcional)
              </label>
              <input 
                type="url" 
                value={form.enlace_videollamada} 
                onChange={(e) => setForm({...form, enlace_videollamada: e.target.value})} 
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500" 
                placeholder="https://meet.google.com/..." 
              />
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
            <button 
              type="button" 
              onClick={() => setVista('lista')} 
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={guardando} 
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-xs"
            >
              {guardando ? 'Guardando...' : 'Programar Evento'}
            </button>
          </div>
        </form>
      )}

      {vista === 'lista' && (
        <div className="space-y-4">
          {/* Selector de Filtros */}
          <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
            <button 
              onClick={() => setFiltroTipo('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filtroTipo === 'todos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Todos los eventos ({reuniones.length})
            </button>
            <button 
              onClick={() => setFiltroTipo('reunion')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtroTipo === 'reunion' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users size={14} className="mr-1"/>
              Reuniones ({totalReuniones})
            </button>
            <button 
              onClick={() => setFiltroTipo('imprevisto')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtroTipo === 'imprevisto' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <AlertTriangle size={14} className="mr-1"/>
              Fechas Imprevistas ({totalImprevistos})
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Tipo</th>
                  <th className="p-4 font-semibold">Título del Evento</th>
                  <th className="p-4 font-semibold">Organizador</th>
                  <th className="p-4 font-semibold">Alcance</th>
                  <th className="p-4 font-semibold">Inicio</th>
                  <th className="p-4 font-semibold">Fin</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {eventosFiltrados.map((reunion) => {
                  const esImprevisto = reunion.titulo.startsWith('[IMPREVISTO]');
                  const tituloLimpio = esImprevisto ? reunion.titulo.replace('[IMPREVISTO] ', '') : reunion.titulo;

                  return (
                    <tr key={reunion.id_reunion} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        {esImprevisto ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            <AlertTriangle size={12} className="mr-1" /> Imprevisto
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            <Users size={12} className="mr-1" /> Reunión
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {tituloLimpio}
                        {reunion.descripcion && (
                          <span className="block text-xs font-normal text-slate-400 mt-0.5 truncate max-w-sm">
                            {reunion.descripcion}
                          </span>
                        )}
                      </td>
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
                        <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                          {reunion.estado || 'PROGRAMADA'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {eventosFiltrados.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                No hay eventos programados en este filtro.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
