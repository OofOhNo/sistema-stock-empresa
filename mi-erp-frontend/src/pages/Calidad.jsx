import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  ShieldCheck, AlertTriangle, Clock, CheckCircle2, XCircle, 
  Plus, Search, Filter, Calendar, Building, FileText, Trash2, Edit3, X 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Calidad({ usuario }) {
  const [certificados, setCertificados] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  
  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Formulario Nuevo Certificado
  const [form, setForm] = useState({
    codigo_certificado: '',
    tipo_certificado: 'Registro Sanitario de Alimentos',
    lote_o_producto: '',
    entidad_emisora: 'DIGESA',
    fecha_emision: '',
    fecha_vencimiento: '',
    id_ubicacion: '',
    observaciones: '',
    archivo_url: ''
  });

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resCalidad, resUbic] = await Promise.all([
        api.get('/calidad'),
        api.get('/ubicaciones')
      ]);
      setCertificados(resCalidad.data.datos || []);
      const ubs = resUbic.data.ubicaciones || resUbic.data.datos || [];
      setUbicaciones(ubs);
      if (ubs.length > 0 && !form.id_ubicacion) {
        setForm(prev => ({ ...prev, id_ubicacion: ubs[0].id_ubicacion }));
      }
    } catch (error) {
      console.error('Error al cargar calidad:', error);
      toast.error('Error al cargar certificados de calidad');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleCrear = async (e) => {
    e.preventDefault();
    if (!form.tipo_certificado || !form.entidad_emisora || !form.fecha_emision || !form.fecha_vencimiento) {
      return toast.error('Completa los campos obligatorios.');
    }
    setGuardando(true);
    try {
      const res = await api.post('/calidad', form);
      toast.success(res.data.mensaje || 'Certificado registrado exitosamente');
      setModalNuevo(false);
      setForm({
        codigo_certificado: '',
        tipo_certificado: 'Registro Sanitario de Alimentos',
        lote_o_producto: '',
        entidad_emisora: 'DIGESA',
        fecha_emision: '',
        fecha_vencimiento: '',
        id_ubicacion: ubicaciones[0]?.id_ubicacion || '',
        observaciones: '',
        archivo_url: ''
      });
      cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'Error al registrar certificado');
    } finally {
      setGuardando(false);
    }
  };

  const handleActualizar = async (e) => {
    e.preventDefault();
    if (!modalEditar) return;
    setGuardando(true);
    try {
      const res = await api.put(`/calidad/${modalEditar.id_certificado}`, modalEditar);
      toast.success(res.data.mensaje || 'Certificado actualizado');
      setModalEditar(null);
      cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'Error al actualizar certificado');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id, codigo) => {
    if (!window.confirm(`¿Estás seguro de eliminar el certificado ${codigo}?`)) return;
    try {
      await api.delete(`/calidad/${id}`);
      toast.success('Certificado eliminado');
      cargarDatos();
    } catch (error) {
      toast.error('Error al eliminar certificado');
    }
  };

  // Métricas
  const totalCertificados = certificados.length;
  const vigentes = certificados.filter(c => (c.estado_actualizado || c.estado) === 'VIGENTE').length;
  const porVencer = certificados.filter(c => (c.estado_actualizado || c.estado) === 'POR_VENCER').length;
  const vencidos = certificados.filter(c => (c.estado_actualizado || c.estado) === 'VENCIDO').length;

  // Filtrado
  const certificadosFiltrados = certificados.filter(c => {
    const estadoReal = c.estado_actualizado || c.estado;
    if (filtroEstado !== 'TODOS' && estadoReal !== filtroEstado) return false;
    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase();
      const matchCod = c.codigo_certificado?.toLowerCase().includes(q);
      const matchTipo = c.tipo_certificado?.toLowerCase().includes(q);
      const matchLote = c.lote_o_producto?.toLowerCase().includes(q);
      const matchEntidad = c.entidad_emisora?.toLowerCase().includes(q);
      const matchUbic = c.nombre_ubicacion?.toLowerCase().includes(q);
      return matchCod || matchTipo || matchLote || matchEntidad || matchUbic;
    }
    return true;
  });

  const getBadgeEstado = (estado) => {
    switch (estado) {
      case 'VIGENTE':
        return <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} className="mr-1" /> Vigente</span>;
      case 'POR_VENCER':
        return <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle size={12} className="mr-1" /> Por Vencer (&lt;30d)</span>;
      case 'VENCIDO':
        return <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200"><XCircle size={12} className="mr-1" /> Vencido</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{estado}</span>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Calidad y Sanidad</h1>
            <p className="text-slate-500 text-sm">Registro de registros sanitarios, certificaciones BPM, HACCP y control de vencimientos</p>
          </div>
        </div>

        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-600/20"
        >
          <Plus size={16} />
          <span>+ Nuevo Certificado</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Certificados</p>
            <h3 className="text-2xl font-bold text-blue-950 mt-1">{totalCertificados}</h3>
          </div>
          <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
            <FileText size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vigentes Conformes</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{vigentes}</h3>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Por Vencer (&lt; 30 días)</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{porVencer}</h3>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencidos / Vencen Hoy</p>
            <h3 className="text-2xl font-bold text-red-600 mt-1">{vencidos}</h3>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <AlertTriangle size={20} />
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, tipo, entidad (DIGESA/SENASA), lote o producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center space-x-2">
          <Filter size={16} className="text-slate-400" />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl text-sm px-3 py-2 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="VIGENTE">Solo Vigentes</option>
            <option value="POR_VENCER">Solo Por Vencer</option>
            <option value="VENCIDO">Solo Vencidos</option>
          </select>
        </div>
      </div>

      {/* Tabla de Certificados */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando registros sanitarios y certificados...</div>
        ) : certificadosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No se encontraron certificados de calidad con los filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Código Certificado</th>
                  <th className="p-4 font-semibold">Tipo y Alcance</th>
                  <th className="p-4 font-semibold">Entidad Emisora</th>
                  <th className="p-4 font-semibold">Sede / Ubicación</th>
                  <th className="p-4 font-semibold">Vencimiento</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {certificadosFiltrados.map((c) => {
                  const estadoReal = c.estado_actualizado || c.estado;
                  const dias = c.dias_restantes;

                  return (
                    <tr key={c.id_certificado} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-900 font-mono text-xs">{c.codigo_certificado}</div>
                        {c.archivo_url && (
                          <a href={c.archivo_url} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 hover:underline">
                            Ver documento adjunto ↗
                          </a>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-800">{c.tipo_certificado}</div>
                        {c.lote_o_producto && (
                          <div className="text-xs text-slate-500 mt-0.5">Lote / Prod: <span className="font-medium text-slate-700">{c.lote_o_producto}</span></div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800">
                          {c.entidad_emisora}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">
                        {c.nombre_ubicacion || 'General / Todas'}
                      </td>
                      <td className="p-4">
                        <div className="font-mono text-xs text-slate-800 font-semibold">
                          {new Date(c.fecha_vencimiento).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {dias < 0 ? `Venció hace ${Math.abs(dias)} días` : dias === 0 ? 'Vence hoy' : `Quedan ${dias} días`}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {getBadgeEstado(estadoReal)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => setModalEditar(c)}
                            title="Editar certificado"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button
                            onClick={() => handleEliminar(c.id_certificado, c.codigo_certificado)}
                            title="Eliminar"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nuevo Certificado */}
      {modalNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Registrar Certificado de Calidad</h3>
                  <p className="text-xs text-slate-500">Asegura la trazabilidad sanitaria e inocuidad</p>
                </div>
              </div>
              <button onClick={() => setModalNuevo(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Código Certificado</label>
                  <input 
                    type="text"
                    placeholder="Ej: CERT-SAN-2026-01"
                    value={form.codigo_certificado}
                    onChange={(e) => setForm({ ...form, codigo_certificado: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Vacío para código automático</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Entidad Emisora *</label>
                  <input 
                    type="text"
                    required
                    placeholder="DIGESA, SENASA, SGS, etc."
                    value={form.entidad_emisora}
                    onChange={(e) => setForm({ ...form, entidad_emisora: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tipo de Certificación *</label>
                <select
                  value={form.tipo_certificado}
                  onChange={(e) => setForm({ ...form, tipo_certificado: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-white"
                >
                  <option value="Registro Sanitario de Alimentos">Registro Sanitario de Alimentos</option>
                  <option value="Certificación HACCP Inocuidad">Certificación HACCP Inocuidad</option>
                  <option value="Buenas Prácticas de Manufactura (BPM)">Buenas Prácticas de Manufactura (BPM)</option>
                  <option value="Certificado Fitosanitario">Certificado Fitosanitario</option>
                  <option value="Análisis Microbiológico de Lote">Análisis Microbiológico de Lote</option>
                  <option value="Inspección Sanitaria de Almacén">Inspección Sanitaria de Almacén</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Lote o Producto Amparado</label>
                  <input 
                    type="text"
                    placeholder="Ej: Lote 2026-X o Harina Integral"
                    value={form.lote_o_producto}
                    onChange={(e) => setForm({ ...form, lote_o_producto: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Sede / Ubicación</label>
                  <select
                    value={form.id_ubicacion}
                    onChange={(e) => setForm({ ...form, id_ubicacion: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden bg-white"
                  >
                    {ubicaciones.map(u => (
                      <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Fecha Emisión *</label>
                  <input 
                    type="date"
                    required
                    value={form.fecha_emision}
                    onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Fecha Vencimiento *</label>
                  <input 
                    type="date"
                    required
                    value={form.fecha_vencimiento}
                    onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Observaciones / Dictamen</label>
                <textarea 
                  rows={2}
                  placeholder="Observaciones de auditoría o condiciones de almacenamiento..."
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
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
                  className="px-5 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Registrar Certificado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Certificado */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Editar Certificado</h3>
                  <p className="text-xs text-slate-500">{modalEditar.codigo_certificado}</p>
                </div>
              </div>
              <button onClick={() => setModalEditar(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleActualizar} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Tipo de Certificación</label>
                <input 
                  type="text"
                  value={modalEditar.tipo_certificado || ''}
                  onChange={(e) => setModalEditar({ ...modalEditar, tipo_certificado: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Entidad Emisora</label>
                  <input 
                    type="text"
                    value={modalEditar.entidad_emisora || ''}
                    onChange={(e) => setModalEditar({ ...modalEditar, entidad_emisora: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Estado</label>
                  <select
                    value={modalEditar.estado || 'VIGENTE'}
                    onChange={(e) => setModalEditar({ ...modalEditar, estado: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden bg-white"
                  >
                    <option value="VIGENTE">VIGENTE</option>
                    <option value="POR_VENCER">POR_VENCER</option>
                    <option value="VENCIDO">VENCIDO</option>
                    <option value="SUSPENDIDO">SUSPENDIDO</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Observaciones</label>
                <textarea 
                  rows={2}
                  value={modalEditar.observaciones || ''}
                  onChange={(e) => setModalEditar({ ...modalEditar, observaciones: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
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
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Actualizar Certificado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

