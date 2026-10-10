import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  ShieldCheck, AlertTriangle, Clock, CheckCircle2, XCircle, 
  Plus, Search, Filter, Calendar, Building, FileText, Trash2, Edit3, X,
  Printer, Eye, Award, Check
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Calidad({ usuario }) {
  const [certificados, setCertificados] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productosLista, setProductosLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  
  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [modalVerOficial, setModalVerOficial] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Formulario Nuevo Certificado Oficial
  const hoyStr = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    codigo_certificado: '',
    tipo_certificado: 'Certificado de Calidad e Inocuidad',
    lote_o_producto: '',
    entidad_emisora: 'SENASA',
    id_cliente: '',
    cliente_nombre: '',
    cliente_ruc: '',
    senasa_resolucion: 'N° AUTORIZACIÓN SANITARIA / RESOLUCIÓN',
    ciudad_emision: 'Ciudad',
    fecha_emision: hoyStr,
    fecha_vencimiento: '',
    id_ubicacion: '',
    observaciones: '',
    archivo_url: '',
    items_detalle: [
      { producto: 'PRODUCTO DE EJEMPLO', lote: 'LOTE-001', fecha_produccion: hoyStr, fecha_vencimiento: '', kilos: '50.00' }
    ]
  });

  // Cerrar cualquier modal con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (modalVerOficial) setModalVerOficial(null);
        if (modalNuevo) setModalNuevo(false);
        if (modalEditar) setModalEditar(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalVerOficial, modalNuevo, modalEditar]);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resCalidad, resUbic, resClientes, resProds] = await Promise.all([
        api.get('/calidad'),
        api.get('/ubicaciones').catch(() => ({ data: { datos: [] } })),
        api.get('/clientes').catch(() => ({ data: { datos: [] } })),
        api.get('/productos').catch(() => ({ data: [] }))
      ]);

      setCertificados(resCalidad.data.datos || []);
      const ubs = resUbic.data.ubicaciones || resUbic.data.datos || [];
      setUbicaciones(ubs);

      const clis = resClientes.data.datos || resClientes.data || [];
      setClientes(clis);

      const prods = Array.isArray(resProds.data) ? resProds.data : (resProds.data?.datos || []);
      setProductosLista(prods);

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

  const handleClienteChange = (e) => {
    const val = e.target.value;
    if (!val) {
      setForm(prev => ({ ...prev, id_cliente: '', cliente_nombre: '', cliente_ruc: '' }));
      return;
    }
    const cli = clientes.find(c => String(c.id_cliente) === String(val));
    if (cli) {
      setForm(prev => ({
        ...prev,
        id_cliente: cli.id_cliente,
        cliente_nombre: cli.razon_social_o_nombre || cli.nombre_comercial || '',
        cliente_ruc: cli.numero_documento || ''
      }));
    }
  };

  const agregarFilaItem = () => {
    setForm(prev => ({
      ...prev,
      items_detalle: [
        ...prev.items_detalle,
        { producto: '', lote: '', fecha_produccion: hoyStr, fecha_vencimiento: '', kilos: '' }
      ]
    }));
  };

  const quitarFilaItem = (idx) => {
    if (form.items_detalle.length <= 1) {
      return toast.error('Debe haber al menos un producto en el certificado');
    }
    setForm(prev => ({
      ...prev,
      items_detalle: prev.items_detalle.filter((_, i) => i !== idx)
    }));
  };

  const actualizarItem = (idx, campo, valor) => {
    setForm(prev => {
      const items = [...prev.items_detalle];
      items[idx] = { ...items[idx], [campo]: valor };
      return { ...prev, items_detalle: items };
    });
  };

  const handleCrear = async (e) => {
    e.preventDefault();
    if (!form.cliente_nombre.trim() || !form.cliente_ruc.trim()) {
      return toast.error('Ingresa o selecciona el Cliente y su RUC.');
    }
    if (!form.fecha_emision) {
      return toast.error('La fecha de emisión es obligatoria.');
    }

    // Calcular fecha_vencimiento global a partir de items si no se especificó
    let fVenc = form.fecha_vencimiento;
    if (!fVenc && form.items_detalle.length > 0) {
      const fechasVenc = form.items_detalle.map(i => i.fecha_vencimiento).filter(Boolean);
      if (fechasVenc.length > 0) {
        fechasVenc.sort();
        fVenc = fechasVenc[fechasVenc.length - 1]; // Mayor fecha de vencimiento
      }
    }
    if (!fVenc) {
      // Default: 6 meses desde emisión
      const d = new Date(form.fecha_emision);
      d.setMonth(d.getMonth() + 6);
      fVenc = d.toISOString().split('T')[0];
    }

    // Generar resumen de productos / lotes
    const prodsTexto = form.items_detalle.map(i => i.producto || 'Producto').filter(Boolean).join(', ');

    setGuardando(true);
    try {
      const payload = {
        ...form,
        fecha_vencimiento: fVenc,
        lote_o_producto: prodsTexto || form.lote_o_producto || 'Productos Cárnicos',
        items_detalle: form.items_detalle
      };

      const res = await api.post('/calidad', payload);
      toast.success(res.data.mensaje || 'Certificado oficial emitido exitosamente');
      setModalNuevo(false);
      setForm({
        codigo_certificado: '',
        tipo_certificado: 'Certificado de Calidad (SENASA)',
        lote_o_producto: '',
        entidad_emisora: 'SENASA',
        id_cliente: '',
        cliente_nombre: '',
        cliente_ruc: '',
        senasa_resolucion: 'N° 000111-MINAGRI-SENASA-AREQUIPA',
        ciudad_emision: 'Arequipa',
        fecha_emision: hoyStr,
        fecha_vencimiento: '',
        id_ubicacion: ubicaciones[0]?.id_ubicacion || '',
        observaciones: '',
        archivo_url: '',
        items_detalle: [
          { producto: 'PULPA DE PIERNA DE CERDO', lote: 'PP ' + new Date().toISOString().slice(0, 10).replace(/-/g, ''), fecha_produccion: hoyStr, fecha_vencimiento: '', kilos: '30.00' }
        ]
      });
      cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'Error al emitir certificado');
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
      const matchCli = c.cliente_nombre?.toLowerCase().includes(q) || c.cliente_ruc?.includes(q);
      return matchCod || matchTipo || matchLote || matchEntidad || matchUbic || matchCli;
    }
    return true;
  });

  const getBadgeEstado = (estado) => {
    switch (estado) {
      case 'VIGENTE':
        return <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 size={12} className="mr-1" /> Vigente</span>;
      case 'POR_VENCER':
        return <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200"><AlertTriangle size={12} className="mr-1" /> Por Vencer</span>;
      case 'VENCIDO':
        return <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200"><XCircle size={12} className="mr-1" /> Vencido</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{estado}</span>;
    }
  };

  // Formato español de fecha: "Arequipa, 9 de octubre del 2026"
  const formatearFechaOficial = (fechaStr) => {
    if (!fechaStr) return '';
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const dia = d.getUTCDate();
    const mes = meses[d.getUTCMonth()];
    const anio = d.getUTCFullYear();
    return `${dia} de ${mes} del ${anio}`;
  };

  const formatearFechaCorta = (fechaStr) => {
    if (!fechaStr) return '-';
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) return fechaStr;
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const anio = d.getUTCFullYear();
    return `${dia}/${mes}/${anio}`;
  };

  return (
    <div className="space-y-6">
      
      {/* CSS para Impresión Oficial limpia */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #certificado-imprimible, #certificado-imprimible * {
            visibility: visible !important;
          }
          #certificado-imprimible {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 20mm 20mm !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
            <Award size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Calidad y Sanidad</h1>
            <p className="text-slate-500 text-sm">Emisión de certificados oficiales SENASA / Procesos Cárnicos S.A.C. y control de inocuidad</p>
          </div>
        </div>

        <button
          onClick={() => setModalNuevo(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-600/20"
        >
          <Plus size={16} />
          <span>+ Emitir Certificado Oficial</span>
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
            placeholder="Buscar por cliente, RUC, código, SENASA o producto..."
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
                  <th className="p-4 font-semibold">N° Certificado</th>
                  <th className="p-4 font-semibold">Cliente y RUC</th>
                  <th className="p-4 font-semibold">Productos / Lotes</th>
                  <th className="p-4 font-semibold">Entidad / Resolución</th>
                  <th className="p-4 font-semibold">Emisión / Vencimiento</th>
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
                        <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          FORMATO OFICIAL
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{c.cliente_nombre || 'Cliente General'}</div>
                        <div className="text-xs text-slate-500 font-mono">RUC: {c.cliente_ruc || '-'}</div>
                      </td>
                      <td className="p-4 max-w-xs truncate">
                        <div className="font-medium text-slate-700 truncate">{c.lote_o_producto || 'Cárnicos'}</div>
                        {Array.isArray(c.items_detalle) && c.items_detalle.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.items_detalle.length} producto(s) amparado(s)
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800">
                          {c.entidad_emisora}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                          {c.senasa_resolucion || 'SENASA AREQUIPA'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="font-mono text-xs text-slate-800 font-semibold">
                          Vence: {formatearFechaCorta(c.fecha_vencimiento)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Emitido: {formatearFechaCorta(c.fecha_emision)}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {getBadgeEstado(estadoReal)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => setModalVerOficial(c)}
                            title="Ver Certificado Oficial (Formato A4)"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                          >
                            <Eye size={13} />
                            <span>Ver Oficial</span>
                          </button>
                          <button
                            onClick={() => {
                              setModalVerOficial(c);
                              setTimeout(() => window.print(), 300);
                            }}
                            title="Imprimir / Exportar a PDF"
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200"
                          >
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => setModalEditar(c)}
                            title="Editar certificado"
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleEliminar(c.id_certificado, c.codigo_certificado)}
                            title="Eliminar"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
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

      {/* MODAL DOCUMENTO OFICIAL A4 (GENÉRICO Y FÁCILMENTE CERRABLE) */}
      {modalVerOficial && (
        <div 
          onClick={() => setModalVerOficial(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Barra Superior Fija (SIEMPRE VISIBLE / NUNCA SE DESAPARECE AL HACER SCROLL) */}
            <div className="no-print sticky top-0 z-30 flex items-center justify-between p-3.5 sm:p-4 bg-slate-900 text-white border-b border-slate-800 shadow-md">
              <div className="flex items-center space-x-2">
                <Award size={20} className="text-emerald-400" />
                <span className="font-bold text-sm">Vista Previa — Certificado de Calidad</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  <Printer size={14} />
                  <span>🖨️ Imprimir / Guardar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalVerOficial(null)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm ml-2"
                >
                  <X size={15} />
                  <span>Cerrar</span>
                </button>
              </div>
            </div>

            {/* CUERPO DEL DOCUMENTO CON SCROLL INDEPENDIENTE */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100/60">
              {/* DOCUMENTO OFICIAL IMPRIMIBLE A4 */}
              <div 
                id="certificado-imprimible" 
                className="p-10 sm:p-14 bg-white text-black font-sans max-w-2xl mx-auto shadow-sm border border-slate-200" 
                style={{ minHeight: '850px', color: '#000', backgroundColor: '#fff' }}
              >
                {/* LOGO SUPERIOR IZQUIERDA (EMBLEMA GENÉRICO) */}
                <div className="flex items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-blue-900">
                      <svg viewBox="0 0 100 100" className="w-16 h-16" fill="none">
                        <circle cx="50" cy="50" r="44" stroke="#1e3a8a" strokeWidth="4" strokeDasharray="4 2" />
                        <circle cx="50" cy="50" r="35" stroke="#1e3a8a" strokeWidth="2" />
                        <path d="M 32 50 L 45 63 L 70 38" stroke="#1e3a8a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                        <text x="50" y="85" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1e3a8a" fontFamily="Arial, sans-serif">
                          CALIDAD
                        </text>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-black tracking-wider text-blue-950 uppercase" style={{ fontFamily: 'Arial, sans-serif' }}>
                        {modalVerOficial.empresa_nombre || '[NOMBRE DE LA EMPRESA / RAZÓN SOCIAL]'}
                      </div>
                      <div className="text-[10px] text-slate-600 font-semibold font-mono">
                        RUC: {modalVerOficial.empresa_ruc || '[RUC DE LA EMPRESA]'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* TÍTULO SUBRAYADO Y CENTRADO */}
                <div className="text-center my-6">
                  <h2 className="text-xl font-bold underline underline-offset-4 tracking-tight" style={{ fontFamily: 'Arial, sans-serif' }}>
                    Certificado de calidad
                  </h2>
                </div>

                {/* CUERPO DEL DOCUMENTO */}
                <div className="space-y-4 text-xs leading-relaxed" style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: '1.6' }}>
                  <p>
                    La que suscribe la empresa <strong>{modalVerOficial.empresa_nombre || '[NOMBRE DE LA EMPRESA / RAZÓN SOCIAL]'}</strong> con RUC <strong>{modalVerOficial.empresa_ruc || '[RUC DE LA EMPRESA]'}</strong>
                  </p>

                  <div className="pt-2">
                    <p><strong>CLIENTE: {modalVerOficial.cliente_nombre || '[NOMBRE DEL CLIENTE]'}</strong></p>
                    <p><strong>RUC: {modalVerOficial.cliente_ruc || '[RUC DEL CLIENTE]'}</strong></p>
                  </div>

                  <div className="pt-2">
                    <p className="font-bold">CERTIFICA QUE:</p>
                    <p className="mt-1 font-semibold text-black">
                      {modalVerOficial.senasa_resolucion || '[N° DE RESOLUCIÓN / AUTORIZACIÓN SANITARIA]'}
                    </p>
                  </div>

                  <p className="pt-2">
                    El despacho del producto consta de los siguientes datos:
                  </p>

                  {/* TABLA CON BORDES COMPLETOS NEGROS */}
                  <table className="w-full border-collapse border border-black my-5 text-xs text-center" style={{ border: '1.5px solid black' }}>
                    <thead>
                      <tr className="border-b border-black font-bold">
                        <th className="border border-black p-2.5 text-center text-[11px]">PRODUCTO</th>
                        <th className="border border-black p-2.5 text-center text-[11px]">LOTE</th>
                        <th className="border border-black p-2.5 text-center text-[11px]">FECHA DE PRODUCCIÓN</th>
                        <th className="border border-black p-2.5 text-center text-[11px]">FECHA DE VENCIMIENTO</th>
                        <th className="border border-black p-2.5 text-center text-[11px]">KILOS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(modalVerOficial.items_detalle) && modalVerOficial.items_detalle.length > 0 ? (
                        modalVerOficial.items_detalle.map((it, idx) => (
                          <tr key={idx} className="border-b border-black">
                            <td className="border border-black p-2 text-left font-medium uppercase">{it.producto || '[PRODUCTO]'}</td>
                            <td className="border border-black p-2 font-mono uppercase">{it.lote || '[LOTE]'}</td>
                            <td className="border border-black p-2 font-mono">{formatearFechaCorta(it.fecha_produccion)}</td>
                            <td className="border border-black p-2 font-mono">{formatearFechaCorta(it.fecha_vencimiento)}</td>
                            <td className="border border-black p-2 font-mono font-semibold">{Number(it.kilos || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="border-b border-black">
                          <td className="border border-black p-2 text-left font-medium uppercase">{modalVerOficial.lote_o_producto || '[PRODUCTO DE EJEMPLO]'}</td>
                          <td className="border border-black p-2 font-mono uppercase">{modalVerOficial.codigo_certificado || '[LOTE-001]'}</td>
                          <td className="border border-black p-2 font-mono">{formatearFechaCorta(modalVerOficial.fecha_emision)}</td>
                          <td className="border border-black p-2 font-mono">{formatearFechaCorta(modalVerOficial.fecha_vencimiento)}</td>
                          <td className="border border-black p-2 font-mono font-semibold">100.00</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  <p className="mt-4 text-justify">
                    Así mismo certifico. Que se han inspeccionado las condiciones de producción y almacenamiento, la cual consta de su producción bajo condiciones higiénico-sanitarias.
                  </p>

                  <p className="mt-3 text-justify">
                    Se expide el siguiente certificado, para la verificación de las autoridades pertinentes.
                  </p>

                  <div className="pt-8 space-y-4">
                    <p>Atentamente,</p>
                    <p className="font-semibold">{modalVerOficial.empresa_nombre || '[NOMBRE DE LA EMPRESA / RAZÓN SOCIAL]'}</p>
                    <p className="pt-6">
                      {modalVerOficial.ciudad_emision || '[Ciudad]'}, {formatearFechaOficial(modalVerOficial.fecha_emision || new Date())}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra Inferior Fija de Cierre y Acciones */}
            <div className="no-print p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 hidden sm:inline">
                Presiona <b>ESC</b> o haz clic fuera para cerrar
              </span>
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5"
                >
                  <Printer size={14} />
                  <span>Imprimir / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalVerOficial(null)}
                  className="px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded-xl text-xs font-bold transition-colors"
                >
                  Cerrar Vista Previa
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal Emitir Certificado Oficial */}
      {modalNuevo && (
        <div 
          onClick={() => setModalNuevo(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
                  <Award size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Emitir Certificado de Calidad</h3>
                  <p className="text-xs text-slate-500">Plantilla oficial de certificación sanitaria e inocuidad</p>
                </div>
              </div>
              <button type="button" onClick={() => setModalNuevo(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              
              {/* SECCIÓN CLIENTE */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Datos del Cliente Destinatario *
                  </label>
                  {clientes.length > 0 && (
                    <span className="text-[11px] text-indigo-600 font-medium">Seleccionar de la lista de clientes</span>
                  )}
                </div>

                {clientes.length > 0 && (
                  <div>
                    <select
                      value={form.id_cliente}
                      onChange={handleClienteChange}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Seleccionar de clientes existentes --</option>
                      {clientes.map(c => (
                        <option key={c.id_cliente} value={c.id_cliente}>
                          {c.razon_social_o_nombre || c.nombre_comercial} (RUC: {c.numero_documento})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Razón Social / Cliente</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ej: GILMA DISTRIBUCIONES S.A.C."
                      value={form.cliente_nombre}
                      onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">RUC del Cliente</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ej: 20607411311"
                      value={form.cliente_ruc}
                      onChange={(e) => setForm({ ...form, cliente_ruc: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* RESOLUCIÓN Y CIUDAD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Certifica Que (SENASA) *</label>
                  <input 
                    type="text"
                    required
                    value={form.senasa_resolucion}
                    onChange={(e) => setForm({ ...form, senasa_resolucion: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Ciudad de Emisión *</label>
                  <input 
                    type="text"
                    required
                    value={form.ciudad_emision}
                    onChange={(e) => setForm({ ...form, ciudad_emision: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Fecha Emisión *</label>
                  <input 
                    type="date"
                    required
                    value={form.fecha_emision}
                    onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Sede / Ubicación</label>
                  <select
                    value={form.id_ubicacion}
                    onChange={(e) => setForm({ ...form, id_ubicacion: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {ubicaciones.map(u => (
                      <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* TABLA DINÁMICA DE ITEMS / PRODUCTOS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Despacho de Productos Amparados ({form.items_detalle.length})
                  </label>
                  <button
                    type="button"
                    onClick={agregarFilaItem}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>+ Añadir Producto</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Producto</th>
                        <th className="p-2.5">Lote</th>
                        <th className="p-2.5">F. Producción</th>
                        <th className="p-2.5">F. Vencimiento</th>
                        <th className="p-2.5">Kilos</th>
                        <th className="p-2.5 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {form.items_detalle.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              placeholder="Ej: PULPA DE CERDO"
                              value={item.producto}
                              onChange={(e) => actualizarItem(idx, 'producto', e.target.value)}
                              className="w-full min-w-[130px] border border-slate-300 rounded px-2 py-1 text-xs uppercase"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              placeholder="PP 20260928"
                              value={item.lote}
                              onChange={(e) => actualizarItem(idx, 'lote', e.target.value)}
                              className="w-full min-w-[90px] border border-slate-300 rounded px-2 py-1 text-xs font-mono uppercase"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="date"
                              required
                              value={item.fecha_produccion}
                              onChange={(e) => actualizarItem(idx, 'fecha_produccion', e.target.value)}
                              className="border border-slate-300 rounded px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="date"
                              required
                              value={item.fecha_vencimiento}
                              onChange={(e) => actualizarItem(idx, 'fecha_vencimiento', e.target.value)}
                              className="border border-slate-300 rounded px-2 py-1 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder="30.00"
                              value={item.kilos}
                              onChange={(e) => actualizarItem(idx, 'kilos', e.target.value)}
                              className="w-20 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => quitarFilaItem(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Observaciones / Dictamen Opcional</label>
                <textarea 
                  rows={2}
                  placeholder="Observaciones adicionales de inocuidad o transporte..."
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevo(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Emitiendo...' : '✓ Emitir Certificado Oficial'}
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Cliente</label>
                <input 
                  type="text"
                  value={modalEditar.cliente_nombre || ''}
                  onChange={(e) => setModalEditar({ ...modalEditar, cliente_nombre: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">RUC</label>
                  <input 
                    type="text"
                    value={modalEditar.cliente_ruc || ''}
                    onChange={(e) => setModalEditar({ ...modalEditar, cliente_ruc: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Estado</label>
                  <select
                    value={modalEditar.estado || 'VIGENTE'}
                    onChange={(e) => setModalEditar({ ...modalEditar, estado: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
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
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
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
