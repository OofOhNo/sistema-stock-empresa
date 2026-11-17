import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import {
  AlertTriangle, Clock, CheckCircle2, XCircle,
  Plus, Search, Filter, FileText, Trash2, Edit3, X,
  Printer, Eye, Award
} from 'lucide-react';
import toast from 'react-hot-toast';
import { escaparHtml } from '../utils/htmlPrint';

const crearFormularioInicial = (hoyStr, idUbicacion = '') => ({
  codigo_certificado: '',
  tipo_certificado: 'Certificado de Calidad e Inocuidad',
  lote_o_producto: '',
  entidad_emisora: 'SENASA',
  empresa_nombre: 'PROCESOS CARNICOS S.A.C.',
  empresa_ruc: '20608725394',
  id_cliente: '',
  cliente_nombre: '',
  cliente_ruc: '',
  senasa_resolucion: 'N° AUTORIZACIÓN SANITARIA / RESOLUCIÓN',
  ciudad_emision: 'Ciudad',
  fecha_emision: hoyStr,
  fecha_vencimiento: '',
  id_ubicacion: idUbicacion,
  observaciones: '',
  archivo_url: '',
  items_detalle: [
    { producto: '', lote: 'LOTE-001', fecha_produccion: hoyStr, fecha_vencimiento: '', kilos: '50.00' }
  ]
});

export default function Calidad({ usuario }) {
  const [certificados, setCertificados] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productosLista, setProductosLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  const puedeEditarCalidad =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.calidad?.puede_editar === true;

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState(null);
  const [modalVerOficial, setModalVerOficial] = useState(null);
  const [certificadoAEliminar, setCertificadoAEliminar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const hoyStr = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState(() => crearFormularioInicial(hoyStr));

  // Cerrar cualquier modal con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (modalVerOficial) setModalVerOficial(null);
        if (modalNuevo) setModalNuevo(false);
        if (modalEditar) setModalEditar(null);
        if (certificadoAEliminar) setCertificadoAEliminar(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalVerOficial, modalNuevo, modalEditar, certificadoAEliminar]);

  const cargarDatos = useCallback(async () => {
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

      if (ubs.length > 0) {
        setForm(prev => (prev.id_ubicacion ? prev : { ...prev, id_ubicacion: ubs[0].id_ubicacion }));
      }
    } catch (error) {
      console.error('Error al cargar calidad:', error);
      toast.error('No se pudieron cargar los certificados de calidad.');
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

  const imprimirCertificadoA4 = (cert) => {
    if (!cert) return;
    const empNombre = cert.empresa_nombre || 'PROCESOS CARNICOS S.A.C.';
    const empRuc = cert.empresa_ruc || '20608725394';
    const cliNombre = cert.cliente_nombre || '[NOMBRE DEL CLIENTE]';
    const cliRuc = cert.cliente_ruc || '[RUC DEL CLIENTE]';
    const resolucion = cert.senasa_resolucion || '[N° DE RESOLUCIÓN / AUTORIZACIÓN SANITARIA]';
    const ciudad = cert.ciudad_emision || 'Ciudad';
    const fechaLarga = formatearFechaOficial(cert.fecha_emision || new Date());

    const items = Array.isArray(cert.items_detalle) && cert.items_detalle.length > 0
      ? cert.items_detalle
      : [{
          producto: cert.lote_o_producto || '[PRODUCTO DE EJEMPLO]',
          lote: cert.codigo_certificado || 'LOTE-001',
          fecha_produccion: cert.fecha_emision,
          fecha_vencimiento: cert.fecha_vencimiento,
          kilos: '50.00'
        }];

    const filasHtml = items.map(it => `
      <tr>
        <td style="text-align:left; font-weight:600; text-transform:uppercase;">${escaparHtml(it.producto || '[PRODUCTO]')}</td>
        <td style="font-family:monospace; text-transform:uppercase;">${escaparHtml(it.lote || '[LOTE]')}</td>
        <td style="font-family:monospace;">${escaparHtml(formatearFechaCorta(it.fecha_produccion))}</td>
        <td style="font-family:monospace;">${escaparHtml(formatearFechaCorta(it.fecha_vencimiento))}</td>
        <td style="font-family:monospace; font-weight:700;">${Number(it.kilos || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const win = window.open('', '_blank', 'width=880,height=960');
    if (!win) {
      window.print();
      return;
    }

    const baseUrl = window.location.origin;
    win.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Certificado ${escaparHtml(cert.codigo_certificado || '')}</title>
        <style>
          @font-face {
            font-family: 'Berg Regular';
            src: url('${baseUrl}/fonts/Berg_Regular_400.ttf') format('truetype');
            font-weight: 400;
            font-style: normal;
          }
          @page { size: A4; margin: 18mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; margin: 0; padding: 12px; font-size: 13px; line-height: 1.6; }
          .header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
          .emp-title { font-family: 'Berg Regular', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 400; letter-spacing: 0.5px; color: #172554; text-transform: uppercase; }
          .emp-ruc { font-size: 11px; color: #475569; font-family: monospace; font-weight: 700; }
          h1 { text-align: center; font-size: 20px; text-decoration: underline; margin: 22px 0; }
          table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 12px; text-align: center; }
          th, td { border: 1.5px solid #000; padding: 8px 6px; }
          th { font-size: 11px; font-weight: 700; background: #f8fafc; }
          .firma { margin-top: 34px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${baseUrl}/brand/logo-color-claro.png" alt="PROCESOS CÁRNICOS S.A.C." style="height: 68px; width: auto; object-fit: contain;" />
          <div>
            <div class="emp-title">${escaparHtml(empNombre)}</div>
            <div class="emp-ruc">RUC: ${escaparHtml(empRuc)}</div>
          </div>
        </div>
        <h1>Certificado de calidad</h1>
        <p>La que suscribe la empresa <strong>${escaparHtml(empNombre)}</strong> con RUC <strong>${escaparHtml(empRuc)}</strong></p>
        <p style="margin-top:12px;">
          <strong>CLIENTE: ${escaparHtml(cliNombre)}</strong><br/>
          <strong>RUC: ${escaparHtml(cliRuc)}</strong>
        </p>
        <p style="margin-top:12px;">
          <strong>CERTIFICA QUE:</strong><br/>
          <strong>${escaparHtml(resolucion)}</strong>
        </p>
        <p>El despacho del producto consta de los siguientes datos:</p>
        <table>
          <thead>
            <tr>
              <th>PRODUCTO</th>
              <th>LOTE</th>
              <th>FECHA DE PRODUCCIÓN</th>
              <th>FECHA DE VENCIMIENTO</th>
              <th>KILOS</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>
        <p style="text-align:justify;">Así mismo certifico. Que se han inspeccionado las condiciones de producción y almacenamiento, la cual consta de su producción bajo condiciones higiénico-sanitarias.</p>
        <p style="text-align:justify;">Se expide el siguiente certificado, para la verificación de las autoridades pertinentes.</p>
        <div class="firma">
          <p>Atentamente,</p>
          <p><strong>${escaparHtml(empNombre)}</strong></p>
          <p style="margin-top:24px;">${escaparHtml(ciudad)}, ${escaparHtml(fechaLarga)}</p>
        </div>
        <script>
          window.onload = async function() { try { await document.fonts.ready; } catch(e) {} setTimeout(function() { window.print(); }, 150); };
        </script>
      </body>
      </html>
    `);
    win.document.close();
  };

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
      return toast.error('Debe haber al menos un producto en el certificado.');
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
      return toast.error('Selecciona o escribe el nombre del cliente y su RUC.');
    }
    if (!form.fecha_emision) {
      return toast.error('La fecha de emisión es obligatoria.');
    }

    let fVenc = form.fecha_vencimiento;
    if (!fVenc && form.items_detalle.length > 0) {
      const fechasVenc = form.items_detalle.map(i => i.fecha_vencimiento).filter(Boolean);
      if (fechasVenc.length > 0) {
        fechasVenc.sort();
        fVenc = fechasVenc[fechasVenc.length - 1];
      }
    }
    if (!fVenc) {
      const d = new Date(form.fecha_emision);
      d.setMonth(d.getMonth() + 6);
      fVenc = d.toISOString().split('T')[0];
    }

    const prodsTexto = form.items_detalle.map(i => i.producto || 'Producto').filter(Boolean).join(', ');

    setGuardando(true);
    try {
      const payload = {
        ...form,
        empresa_nombre: form.empresa_nombre?.trim() || undefined,
        empresa_ruc: form.empresa_ruc?.trim() || undefined,
        fecha_vencimiento: fVenc,
        lote_o_producto: prodsTexto || form.lote_o_producto || 'Mercadería general',
        items_detalle: form.items_detalle
      };

      const res = await api.post('/calidad', payload);
      toast.success(res.data.mensaje || 'Certificado emitido con éxito.');
      setModalNuevo(false);
      setForm(crearFormularioInicial(hoyStr, ubicaciones[0]?.id_ubicacion || ''));
      cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo emitir el certificado.');
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
      toast.success(res.data.mensaje || 'Certificado actualizado.');
      setModalEditar(null);
      cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo actualizar el certificado.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!certificadoAEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/calidad/${certificadoAEliminar.id_certificado}`);
      toast.success('Certificado eliminado.');
      setCertificadoAEliminar(null);
      cargarDatos();
    } catch {
      toast.error('No se pudo eliminar el certificado.');
    } finally {
      setEliminando(false);
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
      return (
        c.codigo_certificado?.toLowerCase().includes(q) ||
        c.tipo_certificado?.toLowerCase().includes(q) ||
        c.lote_o_producto?.toLowerCase().includes(q) ||
        c.entidad_emisora?.toLowerCase().includes(q) ||
        c.nombre_ubicacion?.toLowerCase().includes(q) ||
        c.cliente_nombre?.toLowerCase().includes(q) ||
        c.cliente_ruc?.includes(q)
      );
    }
    return true;
  });

  const getBadgeEstado = (estado) => {
    switch (estado) {
      case 'VIGENTE':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} className="mr-1" /> Vigente
          </span>
        );
      case 'POR_VENCER':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle size={12} className="mr-1" /> Por Vencer
          </span>
        );
      case 'VENCIDO':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
            <XCircle size={12} className="mr-1" /> Vencido
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
            {estado}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-600/20">
            <Award size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Calidad y Sanidad</h1>
            <p className="text-slate-500 text-sm">
              Certificados de calidad e higiene listos para ver, imprimir o guardar en PDF
            </p>
          </div>
        </div>

        {puedeEditarCalidad && (
          <button
            type="button"
            onClick={() => setModalNuevo(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <Plus size={16} />
            <span>Crear Certificado</span>
          </button>
        )}
      </div>

      {/* Tarjetas Resumen */}
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vigentes</p>
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
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencidos</p>
            <h3 className="text-2xl font-bold text-red-600 mt-1">{vencidos}</h3>
          </div>
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <AlertTriangle size={20} />
          </div>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtro */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, RUC, número de certificado o producto..."
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
          <div className="p-12 text-center text-slate-500 font-medium">Cargando certificados...</div>
        ) : certificadosFiltrados.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No se encontraron certificados de calidad.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">N° Certificado</th>
                  <th className="p-4 font-semibold">Cliente y RUC</th>
                  <th className="p-4 font-semibold">Productos / Lotes</th>
                  <th className="p-4 font-semibold">Autorización</th>
                  <th className="p-4 font-semibold">Fechas</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {certificadosFiltrados.map((c) => {
                  const estadoReal = c.estado_actualizado || c.estado;

                  return (
                    <tr key={c.id_certificado} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-900 font-mono text-xs">{c.codigo_certificado}</div>
                        <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          FORMATO A4
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{c.cliente_nombre || 'Cliente General'}</div>
                        <div className="text-xs text-slate-500 font-mono">RUC: {c.cliente_ruc || '-'}</div>
                      </td>
                      <td className="p-4 max-w-xs truncate">
                        <div className="font-medium text-slate-700 truncate">{c.lote_o_producto || 'Producto'}</div>
                        {Array.isArray(c.items_detalle) && c.items_detalle.length > 0 && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {c.items_detalle.length} producto(s) incluido(s)
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800">
                          {c.entidad_emisora || 'SENASA'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                          {c.senasa_resolucion || 'Autorización sanitaria'}
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
                            type="button"
                            onClick={() => setModalVerOficial(c)}
                            title="Ver documento completo"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Ver Oficial</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => imprimirCertificadoA4(c)}
                            title="Imprimir o guardar en PDF"
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                          >
                            <Printer size={14} />
                          </button>
                          {puedeEditarCalidad && (
                            <>
                              <button
                                type="button"
                                onClick={() => setModalEditar(c)}
                                title="Editar certificado"
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setCertificadoAEliminar(c)}
                                title="Eliminar certificado"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
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
            {/* Barra Superior Fija */}
            <div className="sticky top-0 z-30 flex items-center justify-between p-3.5 sm:p-4 bg-slate-900 text-white border-b border-slate-800 shadow-md">
              <div className="flex items-center space-x-2">
                <Award size={20} className="text-emerald-400" />
                <span className="font-bold text-sm">Vista Previa — Certificado de Calidad</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => imprimirCertificadoA4(modalVerOficial)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalVerOficial(null)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm ml-2 cursor-pointer"
                >
                  <X size={15} />
                  <span>Cerrar</span>
                </button>
              </div>
            </div>

            {/* Cuerpo A4 con scroll independiente */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100/60">
              <div
                className="p-8 sm:p-14 bg-white text-black font-sans max-w-2xl mx-auto shadow-sm border border-slate-200"
                style={{ minHeight: '780px', color: '#000', backgroundColor: '#fff' }}
              >
                <div className="flex items-start mb-4">
                  <div className="flex items-center space-x-3.5">
                    <img
                      src="/brand/logo-color-claro.png"
                      alt="PROCESOS CÁRNICOS S.A.C."
                      className="h-16 w-auto object-contain shrink-0"
                    />
                    <div>
                      <div className="text-base font-brand tracking-wide text-blue-950 uppercase">
                        {modalVerOficial.empresa_nombre || 'PROCESOS CARNICOS S.A.C.'}
                      </div>
                      <div className="text-[11px] text-slate-600 font-semibold font-mono">
                        RUC: {modalVerOficial.empresa_ruc || '20608725394'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-center my-6">
                  <h2 className="text-xl font-bold underline underline-offset-4 tracking-tight" style={{ fontFamily: 'Arial, sans-serif' }}>
                    Certificado de calidad
                  </h2>
                </div>

                <div className="space-y-4 text-xs leading-relaxed" style={{ fontFamily: 'Arial, sans-serif', fontSize: '13px', lineHeight: '1.6' }}>
                  <p>
                    La que suscribe la empresa <strong>{modalVerOficial.empresa_nombre || 'PROCESOS CARNICOS S.A.C.'}</strong> con RUC <strong>{modalVerOficial.empresa_ruc || '20608725394'}</strong>
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

                  <p className="pt-2">El despacho del producto consta de los siguientes datos:</p>

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
                          <td className="border border-black p-2 font-mono font-semibold">50.00</td>
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
                    <p className="font-semibold">{modalVerOficial.empresa_nombre || 'PROCESOS CARNICOS S.A.C.'}</p>
                    <p className="pt-6">
                      {modalVerOficial.ciudad_emision || '[Ciudad]'}, {formatearFechaOficial(modalVerOficial.fecha_emision || new Date())}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Barra Inferior Fija */}
            <div className="p-3 sm:p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 hidden sm:inline">
                Presiona <b>ESC</b> o haz clic fuera para cerrar
              </span>
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => imprimirCertificadoA4(modalVerOficial)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Imprimir / PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalVerOficial(null)}
                  className="px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cerrar Vista Previa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Emitir Certificado */}
      {modalNuevo && puedeEditarCalidad && (
        <div
          onClick={() => !guardando && setModalNuevo(false)}
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
                  <h3 className="text-lg font-bold text-blue-950">Crear Certificado de Calidad</h3>
                  <p className="text-xs text-slate-500">Completa los datos para generar el documento oficial en formato A4</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalNuevo(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrear} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* DATOS DE TU EMPRESA EMISORA (OPCIONAL) */}
              <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-3">
                <label className="text-xs font-bold text-blue-950 uppercase tracking-wider block">
                  Datos de tu Empresa Emisora (Opcional — puedes personalizarlo)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nombre o Razón Social de tu Empresa</label>
                    <input
                      type="text"
                      placeholder="Ej: Mi Empresa S.A.C."
                      value={form.empresa_nombre}
                      onChange={(e) => setForm({ ...form, empresa_nombre: e.target.value })}
                      className="w-full border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">RUC de tu Empresa</label>
                    <input
                      type="text"
                      placeholder="Ej: 20100000001"
                      value={form.empresa_ruc}
                      onChange={(e) => setForm({ ...form, empresa_ruc: e.target.value })}
                      className="w-full border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN CLIENTE */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Datos del Cliente Destinatario *
                  </label>
                </div>

                {clientes.length > 0 && (
                  <div>
                    <select
                      value={form.id_cliente}
                      onChange={handleClienteChange}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="">-- Elegir un cliente registrado (o escribir abajo) --</option>
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
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nombre / Razón Social del Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Comercial Ejemplo S.A.C."
                      value={form.cliente_nombre}
                      onChange={(e) => setForm({ ...form, cliente_nombre: e.target.value })}
                      className="w-full border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">RUC del Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: 20123456789"
                      value={form.cliente_ruc}
                      onChange={(e) => setForm({ ...form, cliente_ruc: e.target.value })}
                      className="w-full border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* RESOLUCIÓN Y CIUDAD */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    N° de Autorización / Resolución *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: N° 0001-AUTORIZACION-SANITARIA"
                    value={form.senasa_resolucion}
                    onChange={(e) => setForm({ ...form, senasa_resolucion: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Ciudad de Emisión *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Lima"
                    value={form.ciudad_emision}
                    onChange={(e) => setForm({ ...form, ciudad_emision: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Fecha de Emisión *</label>
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
                    Productos Incluidos ({form.items_detalle.length})
                  </label>
                  <button
                    type="button"
                    onClick={agregarFilaItem}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>+ Añadir otro producto</span>
                  </button>
                </div>

                {productosLista.length > 0 && (
                  <datalist id="lista-productos-calidad">
                    {productosLista.map(p => (
                      <option key={p.id_producto} value={p.nombre} />
                    ))}
                  </datalist>
                )}

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
                              list="lista-productos-calidad"
                              placeholder="Ej: Producto A"
                              value={item.producto}
                              onChange={(e) => actualizarItem(idx, 'producto', e.target.value)}
                              className="w-full min-w-[130px] border border-slate-300 rounded px-2 py-1 text-xs uppercase"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              required
                              placeholder="LOTE-001"
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
                              step="any"
                              min="0"
                              required
                              placeholder="50.00"
                              value={item.kilos}
                              onChange={(e) => actualizarItem(idx, 'kilos', e.target.value)}
                              className="w-20 border border-slate-300 rounded px-2 py-1 text-xs font-mono font-bold"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => quitarFilaItem(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded cursor-pointer"
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
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Observaciones (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionales sobre el transporte o almacenamiento..."
                  value={form.observaciones}
                  onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNuevo(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? 'Guardando...' : '✓ Guardar Certificado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Certificado */}
      {modalEditar && puedeEditarCalidad && (
        <div
          onClick={() => !guardando && setModalEditar(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Edit3 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-950">Modificar Certificado</h3>
                  <p className="text-xs text-slate-500">{modalEditar.codigo_certificado}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalEditar(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleActualizar} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Empresa Emisora</label>
                  <input
                    type="text"
                    value={modalEditar.empresa_nombre || ''}
                    onChange={(e) => setModalEditar({ ...modalEditar, empresa_nombre: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">RUC Empresa</label>
                  <input
                    type="text"
                    value={modalEditar.empresa_ruc || ''}
                    onChange={(e) => setModalEditar({ ...modalEditar, empresa_ruc: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

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
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">RUC Cliente</label>
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
                    <option value="VIGENTE">Vigente</option>
                    <option value="POR_VENCER">Por Vencer</option>
                    <option value="VENCIDO">Vencido</option>
                    <option value="SUSPENDIDO">Suspendido</option>
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

      {/* Modal Confirmar Eliminación */}
      {certificadoAEliminar && puedeEditarCalidad && (
        <div
          onClick={() => !eliminando && setCertificadoAEliminar(null)}
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
                <h3 className="text-lg font-bold text-blue-950">¿Eliminar este certificado?</h3>
                <p className="text-xs text-slate-500 font-mono">{certificadoAEliminar.codigo_certificado}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Se eliminará el certificado de <strong>{certificadoAEliminar.cliente_nombre || 'este cliente'}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={eliminando}
                onClick={() => setCertificadoAEliminar(null)}
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

    </div>
  );
}
