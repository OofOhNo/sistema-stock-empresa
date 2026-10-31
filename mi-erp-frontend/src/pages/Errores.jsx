import React, { useState, useEffect } from 'react';
import api from '../api';
import {
  AlertTriangle, Clock, Search, Plus,
  Wrench, X, CheckCircle2, Bug
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Errores({ usuario }) {
  const [errores, setErrores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroSeveridad, setFiltroSeveridad] = useState('TODAS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalResolver, setModalResolver] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const esAdminCentral = usuario?.rol === 'Admin Central';
  const puedeEditarErrores =
    esAdminCentral ||
    usuario?.permisos?.errores?.puede_editar === true ||
    usuario?.permisos?.usuarios?.puede_editar === true;

  const [form, setForm] = useState({
    codigo_incidencia: '',
    titulo: '',
    descripcion: '',
    area_modulo: 'Inventario',
    severidad: 'MEDIA',
    id_usuario_asigna: '',
    id_pedido: ''
  });

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
        api.get('/usuarios').catch(() => ({ data: { datos: [] } }))
      ]);
      const lista = Array.isArray(resErrores.data) ? resErrores.data : (resErrores.data.datos || []);
      setErrores(lista);
      setUsuarios(resUsers.data?.datos || []);
    } catch (err) {
      console.error('Error al cargar problemas reportados:', err);
      toast.error('No se pudieron cargar los problemas reportados.');
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
      return toast.error('Por favor escribe un título corto y cuenta qué ocurrió.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/errores', form);
      toast.success(res.data.mensaje || 'Problema registrado con éxito.');
      setModalNuevo(false);
      setForm({
        codigo_incidencia: '',
        titulo: '',
        descripcion: '',
        area_modulo: 'Inventario',
        severidad: 'MEDIA',
        id_usuario_asigna: '',
        id_pedido: ''
      });
      await cargarDatos();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el reporte.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirModalResolver = (inc) => {
    setModalResolver(inc);
    setFormResolucion({
      estado: inc.estado === 'PENDIENTE' ? 'RESUELTO' : inc.estado,
      id_usuario_asigna: inc.id_usuario_asigna || usuario?.id_usuario || '',
      solucion_adoptada: inc.solucion_adoptada || ''
    });
  };

  const handleResolver = async (e) => {
    e.preventDefault();
    if (!modalResolver) return;
    setGuardando(true);
    try {
      const res = await api.put(`/errores/${modalResolver.id_error}`, formResolucion);
      toast.success(res.data.mensaje || 'Estado actualizado con éxito.');
      setModalResolver(null);
      await cargarDatos();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el cambio.');
    } finally {
      setGuardando(false);
    }
  };

  const total = errores.length;
  const pendientes = errores.filter(e => e.estado === 'PENDIENTE').length;
  const enRevision = errores.filter(e => e.estado === 'EN_REVISION').length;
  const resueltos = errores.filter(e => e.estado === 'RESUELTO').length;

  const erroresFiltrados = errores.filter(e => {
    if (filtroSeveridad !== 'TODAS' && e.severidad !== filtroSeveridad) return false;
    if (filtroEstado !== 'TODOS' && e.estado !== filtroEstado) return false;
    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase();
      return (
        e.codigo_incidencia?.toLowerCase().includes(q) ||
        e.titulo?.toLowerCase().includes(q) ||
        e.descripcion?.toLowerCase().includes(q) ||
        e.area_modulo?.toLowerCase().includes(q) ||
        e.nombre_reporta?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getSeveridadBadge = (sev) => {
    switch (sev) {
      case 'CRITICA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-red-100 text-red-800 border border-red-200">Urgente</span>;
      case 'ALTA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">Alta</span>;
      case 'MEDIA':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Normal</span>;
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
        return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200"><Wrench size={12} className="mr-1" /> En revisión</span>;
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
            <Bug size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Problemas Reportados</h1>
            <p className="text-slate-500 text-sm">Aquí llegan todos los avisos enviados por el personal desde el botón rojo de la esquina</p>
          </div>
        </div>

        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-red-600/20 cursor-pointer"
        >
          <Plus size={16} />
          <span>+ Registrar Problema</span>
        </button>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Recibidos</p>
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">En Revisión</p>
            <h3 className="text-2xl font-bold text-blue-600 mt-1">{enRevision}</h3>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Wrench size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ya Resueltos</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{resueltos}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por descripción, pantalla o nombre de quien avisó..."
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
            <option value="TODAS">Toda importancia</option>
            <option value="CRITICA">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Normal</option>
            <option value="BAJA">Baja</option>
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="EN_REVISION">En revisión</option>
            <option value="RESUELTO">Resueltos</option>
            <option value="DESCARTADO">Descartados</option>
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando problemas reportados...</div>
        ) : erroresFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No hay problemas reportados con esos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Fecha</th>
                  <th className="p-4 font-semibold">¿Qué pasó?</th>
                  <th className="p-4 font-semibold">Pantalla / Área</th>
                  <th className="p-4 font-semibold text-center">Importancia</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold">Enviado por</th>
                  {puedeEditarErrores && (
                    <th className="p-4 font-semibold text-center">Acción</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {erroresFiltrados.map((inc) => (
                  <tr key={inc.id_error} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-slate-900 font-mono text-xs">{inc.codigo_incidencia}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(inc.fecha_reporte).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="p-4 max-w-md">
                      <div className="font-semibold text-slate-900">{inc.titulo}</div>
                      <div className="text-xs text-slate-600 whitespace-pre-line mt-1">{inc.descripcion}</div>
                      {inc.solucion_adoptada && (
                        <div className="mt-2 text-xs bg-emerald-50 text-emerald-900 p-2 rounded-lg border border-emerald-200">
                          <strong>Cómo se resolvió:</strong> {inc.solucion_adoptada}
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
                      <div className="font-semibold text-slate-800 text-xs">{inc.nombre_reporta || 'Empleado'}</div>
                      {inc.nombre_asigna && (
                        <div className="text-[11px] text-indigo-600 mt-0.5">Atiende: {inc.nombre_asigna}</div>
                      )}
                    </td>
                    {puedeEditarErrores && (
                      <td className="p-4 text-center">
                        <button
                          onClick={() => abrirModalResolver(inc)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          {inc.estado === 'RESUELTO' ? 'Ver / Cambiar' : 'Atender'}
                        </button>
                      </td>
                    )}
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
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-950">Registrar un Problema</h3>
                  <p className="text-xs text-slate-500">Anota cualquier falla, faltante o inconveniente de trabajo</p>
                </div>
              </div>
              <button onClick={() => setModalNuevo(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Título corto *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Faltante de cajas en almacén o error al imprimir"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Pantalla / Área *</label>
                  <select
                    value={form.area_modulo}
                    onChange={(e) => setForm({ ...form, area_modulo: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden bg-white"
                  >
                    <option value="Inventario">Inventario</option>
                    <option value="Despacho">Despacho</option>
                    <option value="Facturación">Facturación / Boletas</option>
                    <option value="Pedidos">Pedidos</option>
                    <option value="Empaque / Sellado al Vacío">Empaque / Sellado al Vacío</option>
                    <option value="Etiquetado">Etiquetado</option>
                    <option value="General">General / Sistema</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Importancia *</label>
                  <select
                    value={form.severidad}
                    onChange={(e) => setForm({ ...form, severidad: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden bg-white font-semibold"
                  >
                    <option value="BAJA">Baja</option>
                    <option value="MEDIA">Normal</option>
                    <option value="ALTA">Alta (retrasa pedidos)</option>
                    <option value="CRITICA">Urgente (detiene trabajo)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">¿Qué pasó? *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Cuéntanos con detalle qué ocurrió..."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              {usuarios.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Encargado de revisarlo (Opcional)</label>
                  <select
                    value={form.id_usuario_asigna}
                    onChange={(e) => setForm({ ...form, id_usuario_asigna: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-hidden bg-white"
                  >
                    <option value="">Cualquier encargado</option>
                    {usuarios.map(u => (
                      <option key={u.id_usuario} value={u.id_usuario}>{u.nombre_completo}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevo(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? 'Guardando...' : 'Guardar Reporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Atender / Resolver */}
      {modalResolver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-slate-900 text-white rounded-lg">
                  <Wrench size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-950">Atender Problema</h3>
                  <p className="text-xs text-slate-500">{modalResolver.codigo_incidencia}</p>
                </div>
              </div>
              <button onClick={() => setModalResolver(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleResolver} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nuevo Estado *</label>
                <select
                  value={formResolucion.estado}
                  onChange={(e) => setFormResolucion({ ...formResolucion, estado: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white font-semibold"
                >
                  <option value="RESUELTO">✅ Ya está resuelto</option>
                  <option value="EN_REVISION">🔧 Lo estamos revisando</option>
                  <option value="DESCARTADO">⚪ Descartado (no requiere acción)</option>
                  <option value="PENDIENTE">⏳ Pendiente</option>
                </select>
              </div>

              {usuarios.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Persona que lo atiende</label>
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
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">¿Cómo se solucionó?</label>
                <textarea
                  rows={3}
                  placeholder="Escribe brevemente qué se hizo para resolverlo..."
                  value={formResolucion.solucion_adoptada}
                  onChange={(e) => setFormResolucion({ ...formResolucion, solucion_adoptada: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalResolver(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
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
