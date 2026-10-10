import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  AlertTriangle, CheckCircle, Clock, Search, Filter, Plus, 
  MessageSquare, User, Wrench, X, ShieldAlert, CheckCircle2 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Errores({ usuario }) {
  const [errores, setErrores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroSeveridad, setFiltroSeveridad] = useState('TODAS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalResolver, setModalResolver] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Form Nuevo
  const [form, setForm] = useState({
    codigo_incidencia: '',
    titulo: '',
    descripcion: '',
    area_modulo: 'Stock / Kardex',
    severidad: 'MEDIA',
    id_usuario_asigna: '',
    id_pedido: ''
  });

  // Form Resolver
  const [formResolucion, setFormResolucion] = useState({
    estado: 'RESUELTO',
    id_usuario_asigna: '',
    solucion_adoptada: ''
  });

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resErrores, resUsers] = await Promise.all([
        api.get('/errores'),
        api.get('/usuarios')
      ]);
      setErrores(resErrores.data.datos || []);
      setUsuarios(resUsers.data.datos || []);
    } catch (err) {
      console.error('Error al cargar incidencias:', err);
      toast.error('Error al cargar reporte de errores');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleCrear = async (e) => {
    e.preventDefault();
    if (!form.titulo || !form.descripcion) {
      return toast.error('El título y descripción son obligatorios.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/errores', form);
      toast.success(res.data.mensaje || 'Incidencia reportada correctamente');
      setModalNuevo(false);
      setForm({
        codigo_incidencia: '',
        titulo: '',
        descripcion: '',
        area_modulo: 'Stock / Kardex',
        severidad: 'MEDIA',
        id_usuario_asigna: '',
        id_pedido: ''
      });
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al reportar incidencia');
    } finally {
      setGuardando(false);
    }
  };

  const abrirModalResolver = (inc) => {
    setModalResolver(inc);
    setFormResolucion({
      estado: inc.estado === 'PENDIENTE' ? 'EN_REVISION' : inc.estado,
      id_usuario_asigna: inc.id_usuario_asigna || usuario.id_usuario,
      solucion_adoptada: inc.solucion_adoptada || ''
    });
  };

  const handleResolver = async (e) => {
    e.preventDefault();
    if (!modalResolver) return;
    setGuardando(true);
    try {
      const res = await api.put(`/errores/${modalResolver.id_error}`, formResolucion);
      toast.success(res.data.mensaje || 'Incidencia actualizada con éxito');
      setModalResolver(null);
      cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al actualizar incidencia');
    } finally {
      setGuardando(false);
    }
  };

  // Métricas
  const total = errores.length;
  const pendientes = errores.filter(e => e.estado === 'PENDIENTE').length;
  const enRevision = errores.filter(e => e.estado === 'EN_REVISION').length;
  const resueltos = errores.filter(e => e.estado === 'RESUELTO').length;

  // Filtrado
  const erroresFiltrados = errores.filter(e => {
    if (filtroSeveridad !== 'TODAS' && e.severidad !== filtroSeveridad) return false;
    if (filtroEstado !== 'TODOS' && e.estado !== filtroEstado) return false;
    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase();
      const matchCod = e.codigo_incidencia?.toLowerCase().includes(q);
      const matchTit = e.titulo?.toLowerCase().includes(q);
      const matchDesc = e.descripcion?.toLowerCase().includes(q);
      const matchArea = e.area_modulo?.toLowerCase().includes(q);
      const matchRep = e.nombre_reporta?.toLowerCase().includes(q);
      return matchCod || matchTit || matchDesc || matchArea || matchRep;
    }
    return true;
  });

  const getSeveridadBadge = (sev) => {
    switch (sev) {
      case 'CRITICA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200">Crítica</span>;
      case 'ALTA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">Alta</span>;
      case 'MEDIA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Media</span>;
      case 'BAJA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">Baja</span>;
      default:
        return <span>{sev}</span>;
    }
  };

  const getEstadoBadge = (est) => {
    switch (est) {
      case 'PENDIENTE':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock size={12} className="mr-1" /> Pendiente</span>;
      case 'EN_REVISION':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200"><Wrench size={12} className="mr-1" /> En Revisión</span>;
      case 'RESUELTO':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} className="mr-1" /> Resuelto</span>;
      case 'DESCARTADO':
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">Descartado</span>;
      default:
        return <span>{est}</span>;
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-red-600 text-white rounded-xl shadow-md shadow-red-600/20">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Reporte de Errores e Incidencias</h1>
            <p className="text-slate-500 text-sm">Registro, seguimiento y resolución de anomalías operativas y de sistemas</p>
          </div>
        </div>

        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-red-600/20"
        >
          <Plus size={16} />
          <span>+ Reportar Incidencia</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Reportes</p>
            <h3 className="text-2xl font-bold text-blue-950 mt-1">{total}</h3>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pendientes</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{pendientes}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">En Revisión / Diagnóstico</p>
            <h3 className="text-2xl font-bold text-blue-600 mt-1">{enRevision}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Wrench size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Resueltas y Cerradas</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{resueltos}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, título, área, persona que reportó..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={filtroSeveridad}
            onChange={(e) => setFiltroSeveridad(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
          >
            <option value="TODAS">Toda Severidad</option>
            <option value="CRITICA">Crítica</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Media</option>
            <option value="BAJA">Baja</option>
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="EN_REVISION">En Revisión</option>
            <option value="RESUELTO">Resueltos</option>
            <option value="DESCARTADO">Descartados</option>
          </select>
        </div>
      </div>

      {/* Tabla de Incidencias */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando incidencias y reportes...</div>
        ) : erroresFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No se encontraron incidencias con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Código / Fecha</th>
                  <th className="p-4 font-semibold">Título e Incidencia</th>
                  <th className="p-4 font-semibold">Área / Módulo</th>
                  <th className="p-4 font-semibold text-center">Severidad</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold">Reportado Por</th>
                  <th className="p-4 font-semibold text-center">Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {erroresFiltrados.map((inc) => (
                  <tr key={inc.id_error} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 font-mono text-xs">{inc.codigo_incidencia}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(inc.fecha_reporte).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="p-4 max-w-sm">
                      <div className="font-semibold text-slate-900">{inc.titulo}</div>
                      <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{inc.descripcion}</div>
                      {inc.solucion_adoptada && (
                        <div className="mt-1 text-[11px] bg-emerald-50 text-emerald-800 p-1.5 rounded-lg border border-emerald-100">
                          <strong>Solución:</strong> {inc.solucion_adoptada}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md text-xs">
                        {inc.area_modulo}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      {getSeveridadBadge(inc.severidad)}
                    </td>
                    <td className="p-4 text-center">
                      {getEstadoBadge(inc.estado)}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-800 text-xs">{inc.nombre_reporta || 'Mariana'}</div>
                      {inc.nombre_asigna && (
                        <div className="text-[11px] text-indigo-600 mt-0.5">Asignado: {inc.nombre_asigna}</div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => abrirModalResolver(inc)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors"
                      >
                        Gestionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo Reporte */}
      {modalNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Reportar Error o Incidencia</h3>
                  <p className="text-xs text-slate-500">Deja constancia de fallos, mermas o demoras</p>
                </div>
              </div>
              <button onClick={() => setModalNuevo(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Título de la Incidencia *</label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: Faltante de mercadería en tarima 3"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Área / Proceso *</label>
                  <select
                    value={form.area_modulo}
                    onChange={(e) => setForm({ ...form, area_modulo: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden bg-white"
                  >
                    <option value="Stock / Kardex">Stock / Kardex</option>
                    <option value="Despacho">Despacho</option>
                    <option value="Facturación SUNAT">Facturación SUNAT</option>
                    <option value="Pedidos">Pedidos</option>
                    <option value="Empaque / Envasado al Vacío">Empaque / Envasado al Vacío</option>
                    <option value="Etiquetado">Etiquetado</option>
                    <option value="Sistema / Software">Sistema / Software</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Severidad *</label>
                  <select
                    value={form.severidad}
                    onChange={(e) => setForm({ ...form, severidad: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden bg-white font-semibold"
                  >
                    <option value="BAJA">Baja (Sin impacto operativo)</option>
                    <option value="MEDIA">Media (Afecta parcialmente)</option>
                    <option value="ALTA">Alta (Retrasa pedidos)</option>
                    <option value="CRITICA">Crítica (Operación detenida)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Descripción Detallada *</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="Explica qué ocurrió, qué lote o producto fue afectado, y las circunstancias..."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Asignar Responsable</label>
                  <select
                    value={form.id_usuario_asigna}
                    onChange={(e) => setForm({ ...form, id_usuario_asigna: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden bg-white"
                  >
                    <option value="">Sin asignar (Cualquiera)</option>
                    {usuarios.map(u => (
                      <option key={u.id_usuario} value={u.id_usuario}>{u.nombre_completo}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">N° Pedido (Opcional)</label>
                  <input 
                    type="number"
                    placeholder="Ej: 15"
                    value={form.id_pedido}
                    onChange={(e) => setForm({ ...form, id_pedido: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevo(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Reportar Incidencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Resolver / Actualizar */}
      {modalResolver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-slate-900 text-white rounded-lg">
                  <Wrench size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Gestionar Incidencia</h3>
                  <p className="text-xs text-slate-500">{modalResolver.codigo_incidencia}</p>
                </div>
              </div>
              <button onClick={() => setModalResolver(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleResolver} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Estado de Resolución *</label>
                <select
                  value={formResolucion.estado}
                  onChange={(e) => setFormResolucion({ ...formResolucion, estado: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white font-semibold"
                >
                  <option value="EN_REVISION">En Revisión (En investigación)</option>
                  <option value="RESUELTO">Resuelto (Acción correctiva aplicada)</option>
                  <option value="DESCARTADO">Descartado (Sin acción necesaria)</option>
                  <option value="PENDIENTE">Pendiente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Responsable Asignado</label>
                <select
                  value={formResolucion.id_usuario_asigna}
                  onChange={(e) => setFormResolucion({ ...formResolucion, id_usuario_asigna: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                >
                  <option value="">Sin asignar</option>
                  {usuarios.map(u => (
                    <option key={u.id_usuario} value={u.id_usuario}>{u.nombre_completo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Solución o Acción Adoptada</label>
                <textarea 
                  rows={3}
                  placeholder="Detalla cómo se solucionó la incidencia para el registro histórico..."
                  value={formResolucion.solucion_adoptada}
                  onChange={(e) => setFormResolucion({ ...formResolucion, solucion_adoptada: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalResolver(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar Gestión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

