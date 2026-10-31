import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Calendar, Plus, ArrowLeft, Users, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

export default function Reuniones({ usuario }) {
  const [reuniones, setReuniones] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [vista, setVista] = useState('lista');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos', 'reunion', 'imprevisto'
  const [guardando, setGuardando] = useState(false);

  const puedeEditarReuniones =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.reuniones?.puede_editar === true;

  const [form, setForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_hora_inicio: '',
    fecha_hora_fin: '',
    id_sala: '',
    alcance: 'general',
    id_ubicacion: usuario?.id_ubicacion || '',
    enlace_videollamada: '',
    tipo_evento: 'reunion'
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    if (vista === 'nuevo' && !puedeEditarReuniones) {
      setVista('lista');
    }
  }, [vista, puedeEditarReuniones]);

  const cargarDatos = async () => {
    setCargando(true);
    setError('');
    try {
      const [resReuniones, resUbic] = await Promise.all([
        api.get('/reuniones'),
        api.get('/ubicaciones').catch(() => ({ data: { datos: [] } }))
      ]);
      setReuniones(resReuniones.data.eventos || []);
      const ubs = resUbic.data.ubicaciones || resUbic.data.datos || [];
      setUbicaciones(ubs);
      if (ubs.length > 0 && !form.id_ubicacion) {
        setForm(f => ({ ...f, id_ubicacion: usuario?.id_ubicacion || ubs[0].id_ubicacion }));
      }
    } catch (err) {
      setError('No se pudieron cargar las reuniones.');
    } finally {
      setCargando(false);
    }
  };

  const handleInicioChange = (valorInicio) => {
    let nuevoFin = form.fecha_hora_fin;
    if (valorInicio && (!nuevoFin || nuevoFin < valorInicio)) {
      const d = new Date(valorInicio);
      if (!isNaN(d.getTime())) {
        d.setHours(d.getHours() + 1);
        const pad = (n) => String(n).padStart(2, '0');
        nuevoFin = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
    }
    setForm({ ...form, fecha_hora_inicio: valorInicio, fecha_hora_fin: nuevoFin });
  };

  const enviarNuevaReunion = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.error('Por favor escribe el título de la reunión o aviso.');
      return;
    }
    if (form.fecha_hora_fin && form.fecha_hora_inicio && form.fecha_hora_fin < form.fecha_hora_inicio) {
      toast.error('La fecha y hora de fin no puede ser anterior a la de inicio.');
      return;
    }

    setGuardando(true);
    try {
      const tituloBase = form.titulo.trim();
      const tituloFinal =
        form.tipo_evento === 'imprevisto' && !tituloBase.startsWith('[IMPREVISTO]')
          ? `[IMPREVISTO] ${tituloBase}`
          : tituloBase;

      await api.post('/reuniones', {
        ...form,
        titulo: tituloFinal,
        id_organizador: usuario.id_usuario,
        id_sala: form.id_sala || null,
        id_ubicacion: form.alcance === 'ubicacion' ? (form.id_ubicacion || null) : null
      });
      toast.success(
        form.tipo_evento === 'imprevisto'
          ? '¡Aviso imprevisto registrado con éxito!'
          : '¡Reunión programada con éxito!'
      );
      setForm({
        titulo: '',
        descripcion: '',
        fecha_hora_inicio: '',
        fecha_hora_fin: '',
        id_sala: '',
        alcance: 'general',
        id_ubicacion: usuario?.id_ubicacion || ubicaciones[0]?.id_ubicacion || '',
        enlace_videollamada: '',
        tipo_evento: 'reunion'
      });
      setVista('lista');
      cargarDatos();
    } catch (err) {
      toast.error('No se pudo guardar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardando(false);
    }
  };

  const formatearFechaHora = (fechaISO) => {
    if (!fechaISO) return '-';
    const d = new Date(fechaISO);
    if (isNaN(d.getTime())) return fechaISO;
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const esEventoImprevisto = (r) => String(r?.titulo || '').startsWith('[IMPREVISTO]');

  const obtenerNombreSede = (idUbic) => {
    if (!idUbic) return '';
    const u = ubicaciones.find(x => String(x.id_ubicacion) === String(idUbic));
    return u ? u.nombre : '';
  };

  const eventosFiltrados = reuniones.filter((r) => {
    const esImp = esEventoImprevisto(r);
    if (filtroTipo === 'reunion') return !esImp;
    if (filtroTipo === 'imprevisto') return esImp;
    return true;
  });

  const totalImprevistos = reuniones.filter(esEventoImprevisto).length;
  const totalReuniones = reuniones.length - totalImprevistos;

  if (cargando && vista === 'lista') {
    return <div className="text-slate-500 font-medium p-8">Cargando agenda de reuniones...</div>;
  }

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
              {vista === 'lista' ? 'Reuniones y Avisos Importantes' : 'Agendar Reunión o Aviso'}
            </h1>
            <p className="text-slate-500 text-sm">
              {vista === 'lista'
                ? 'Consulta las próximas reuniones del equipo y fechas especiales o imprevistos'
                : 'Completa los datos para avisar al equipo en el calendario'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {vista === 'lista' ? (
            <>
              <button
                type="button"
                onClick={cargarDatos}
                disabled={cargando}
                className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Actualizar lista"
              >
                <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
              </button>
              {puedeEditarReuniones && (
                <button
                  type="button"
                  onClick={() => setVista('nuevo')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-sm transition-colors cursor-pointer"
                >
                  <Plus size={18} />
                  <span>Agendar Evento</span>
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setVista('lista')}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <ArrowLeft size={18} />
              <span>Volver a la lista</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-red-700 bg-red-50 border border-red-200 p-4 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {vista === 'nuevo' && puedeEditarReuniones && (
        <form onSubmit={enviarNuevaReunion} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-3xl space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                ¿Qué deseas agendar?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo_evento: 'reunion' })}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    form.tipo_evento === 'reunion'
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="block font-bold text-sm">👥 Reunión de Equipo</span>
                  <span className="text-xs text-slate-500">Coordinación, capacitación o charla programada</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, tipo_evento: 'imprevisto' })}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    form.tipo_evento === 'imprevisto'
                      ? 'border-amber-600 bg-amber-50/50 text-amber-900'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="block font-bold text-sm">⚠️ Fecha Imprevista / Aviso</span>
                  <span className="text-xs text-slate-500">Mantenimiento, feriado, corte o cambio de horario</span>
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Título *
              </label>
              <input
                type="text"
                required
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
                placeholder={
                  form.tipo_evento === 'imprevisto'
                    ? 'Ej: Limpieza general de almacén'
                    : 'Ej: Reunión semanal de coordinación'
                }
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Detalles (Opcional)
              </label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500 h-24"
                placeholder="Escribe aquí de qué tratará o qué deben tener en cuenta..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Fecha y Hora de Inicio *
              </label>
              <input
                type="datetime-local"
                required
                value={form.fecha_hora_inicio}
                onChange={(e) => handleInicioChange(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Fecha y Hora de Fin *
              </label>
              <input
                type="datetime-local"
                required
                min={form.fecha_hora_inicio || undefined}
                value={form.fecha_hora_fin}
                onChange={(e) => setForm({ ...form, fecha_hora_fin: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                ¿Para quiénes es?
              </label>
              <select
                value={form.alcance}
                onChange={(e) => setForm({ ...form, alcance: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
              >
                <option value="general">Toda la empresa</option>
                <option value="ubicacion">Solo una Sede / Almacén</option>
                <option value="privada">Privada / Solo encargados</option>
              </select>
            </div>

            {form.alcance === 'ubicacion' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Elegir Sede *
                </label>
                <select
                  required
                  value={form.id_ubicacion}
                  onChange={(e) => setForm({ ...form, id_ubicacion: e.target.value })}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="">-- Selecciona una sede --</option>
                  {ubicaciones.map(u => (
                    <option key={u.id_ubicacion} value={u.id_ubicacion}>
                      📍 {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Enlace de Videollamada (Opcional — Zoom / Google Meet)
              </label>
              <input
                type="url"
                value={form.enlace_videollamada}
                onChange={(e) => setForm({ ...form, enlace_videollamada: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500"
                placeholder="https://meet.google.com/..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setVista('lista')}
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-xs cursor-pointer"
            >
              {guardando ? 'Guardando...' : 'Guardar en el Calendario'}
            </button>
          </div>
        </form>
      )}

      {vista === 'lista' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl w-max max-w-full">
            <button
              type="button"
              onClick={() => setFiltroTipo('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                filtroTipo === 'todos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Todos ({reuniones.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo('reunion')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 cursor-pointer ${
                filtroTipo === 'reunion' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users size={14} className="mr-1" />
              Reuniones ({totalReuniones})
            </button>
            <button
              type="button"
              onClick={() => setFiltroTipo('imprevisto')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 cursor-pointer ${
                filtroTipo === 'imprevisto' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <AlertTriangle size={14} className="mr-1" />
              Avisos / Imprevistos ({totalImprevistos})
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Tipo</th>
                    <th className="p-4 font-semibold">Evento</th>
                    <th className="p-4 font-semibold">Organizado por</th>
                    <th className="p-4 font-semibold">Para</th>
                    <th className="p-4 font-semibold">Inicio</th>
                    <th className="p-4 font-semibold">Fin</th>
                    <th className="p-4 font-semibold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {eventosFiltrados.map((reunion) => {
                    const esImp = esEventoImprevisto(reunion);
                    const tituloRaw = String(reunion.titulo || 'Sin título');
                    const tituloLimpio = esImp ? tituloRaw.replace(/^\[IMPREVISTO\]\s*/, '') : tituloRaw;
                    const nombreSede = reunion.nombre_ubicacion || obtenerNombreSede(reunion.id_ubicacion);

                    return (
                      <tr key={reunion.id_reunion} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          {esImp ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle size={12} className="mr-1" /> Aviso
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                              <Users size={12} className="mr-1" /> Reunión
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-bold text-slate-900">
                          <div>{tituloLimpio}</div>
                          {reunion.descripcion && (
                            <span className="block text-xs font-normal text-slate-500 mt-0.5 max-w-sm">
                              {reunion.descripcion}
                            </span>
                          )}
                          {reunion.enlace_videollamada && (
                            <a
                              href={reunion.enlace_videollamada}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-xs text-indigo-600 hover:underline mt-1 font-semibold"
                            >
                              <ExternalLink size={12} />
                              <span>Abrir videollamada</span>
                            </a>
                          )}
                        </td>
                        <td className="p-4 text-slate-700">
                          <div className="flex items-center space-x-2">
                            <Users size={14} className="text-slate-400" />
                            <span>{reunion.organizador || 'Administración'}</span>
                          </div>
                        </td>
                        <td className="p-4 text-slate-700 text-xs font-semibold">
                          {reunion.alcance === 'ubicacion'
                            ? `📍 ${nombreSede || 'Sede específica'}`
                            : reunion.alcance === 'privada'
                            ? '🔒 Privada'
                            : '🏢 Toda la empresa'}
                        </td>
                        <td className="p-4 text-slate-700 text-xs">{formatearFechaHora(reunion.fecha_hora_inicio)}</td>
                        <td className="p-4 text-slate-700 text-xs">{formatearFechaHora(reunion.fecha_hora_fin)}</td>
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
            </div>
            {eventosFiltrados.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                No hay reuniones ni avisos programados en esta vista.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
