import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  FileText, Plus, AlertCircle, RefreshCw, XCircle,
  Search, ShieldCheck, DollarSign, Receipt,
  X, Printer, Eye, Loader2
} from 'lucide-react';

export default function Facturacion({ usuario }) {
  const [comprobantes, setComprobantes] = useState([]);
  const [pedidosFacturables, setPedidosFacturables] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos', '01', '03', '07'
  const [busqueda, setBusqueda] = useState('');

  // Modal Emitir
  const [modalEmitir, setModalEmitir] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('01'); // '01' Factura, '03' Boleta
  const [formaPago, setFormaPago] = useState('CONTADO'); // 'CONTADO' o 'CREDITO'
  const [diasCredito, setDiasCredito] = useState(30);
  const [procesando, setProcesando] = useState(false);

  // Modal Anular
  const [modalAnular, setModalAnular] = useState(false);
  const [comprobanteAAnular, setComprobanteAAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  // Modal Ver / Imprimir Comprobante A4
  const [modalPdf, setModalPdf] = useState(null); // { comprobante, items }
  const [cargandoPdf, setCargandoPdf] = useState(false);

  const esAdminCentral = usuario?.rol === 'Admin Central';
  const puedeEditarFacturacion =
    esAdminCentral || usuario?.permisos?.facturacion?.puede_editar === true;

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalPdf(null);
        setModalEmitir(false);
        setModalAnular(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resComp, resPed] = await Promise.all([
        api.get('/facturacion'),
        api.get('/pedidos/calendario').catch(() => ({ data: { eventos: [] } }))
      ]);

      setComprobantes(resComp.data.comprobantes || []);
      // Permitir facturar pedidos en preparación, listos para despacho o ya despachados que aún no tengan factura activa
      const disponibles = (resPed.data.eventos || []).filter(
        p => p.estado_pedido !== 'CANCELADO' && !p.tiene_factura && p.estado_pedido !== 'FACTURADO'
      );
      setPedidosFacturables(disponibles);
      setPedidoSeleccionado(disponibles[0] || null);
    } catch (error) {
      toast.error('No se pudieron cargar los comprobantes: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setCargando(false);
    }
  };

  const abrirModalEmitir = () => {
    if (pedidosFacturables.length === 0) {
      toast.error('No hay pedidos sin facturar en este momento. Crea primero un pedido en la pestaña Pedidos.');
      return;
    }
    setPedidoSeleccionado(pedidosFacturables[0]);
    setTipoComprobante('01');
    setFormaPago('CONTADO');
    setDiasCredito(30);
    setModalEmitir(true);
  };

  const handleEmitir = async (e) => {
    e.preventDefault();
    if (!pedidoSeleccionado) {
      toast.error('Elige un pedido para emitir su comprobante.');
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/emitir', {
        id_pedido: pedidoSeleccionado.id_pedido,
        tipo_comprobante: tipoComprobante,
        forma_pago: formaPago,
        dias_credito: formaPago === 'CREDITO' ? parseInt(diasCredito, 10) : 0
      });
      toast.success(res.data.mensaje || '¡Comprobante emitido con éxito!');
      setModalEmitir(false);
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo emitir el comprobante.');
    } finally {
      setProcesando(false);
    }
  };

  const abrirModalAnular = (comp) => {
    setComprobanteAAnular(comp);
    setMotivoAnulacion('');
    setModalAnular(true);
  };

  const handleAnular = async (e) => {
    e.preventDefault();
    if (!motivoAnulacion.trim()) {
      toast.error('Escribe por qué vas a anular este comprobante.');
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/anular', {
        id_comprobante: comprobanteAAnular.id_comprobante,
        motivo: motivoAnulacion.trim()
      });
      toast.success(res.data.mensaje || 'Comprobante anulado y stock devuelto al inventario.');
      setModalAnular(false);
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo anular el comprobante.');
    } finally {
      setProcesando(false);
    }
  };

  const abrirVisorPdf = async (comp) => {
    setCargandoPdf(true);
    try {
      const res = await api.get(`/facturacion/${comp.id_comprobante}/detalle`);
      setModalPdf({
        comprobante: res.data.comprobante,
        items: res.data.items || []
      });
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo abrir el comprobante.');
    } finally {
      setCargandoPdf(false);
    }
  };

  const nombreTipo = (tipo) => {
    switch (tipo) {
      case '01': return 'Factura Electrónica';
      case '03': return 'Boleta de Venta';
      case '07': return 'Nota de Crédito';
      default: return `Comprobante (${tipo})`;
    }
  };

  const badgeTipo = (tipo) => {
    switch (tipo) {
      case '01': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case '03': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case '07': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const etiquetaEstadoPedido = (estado) => {
    switch (estado) {
      case 'PENDIENTE': return 'En preparación';
      case 'LISTO_DESPACHO': return 'Listo para despacho';
      case 'DESPACHADO': return 'Ya despachado';
      default: return estado;
    }
  };

  const imprimirComprobanteActual = () => {
    if (!modalPdf?.comprobante) return;
    const c = modalPdf.comprobante;
    const items = modalPdf.items || [];
    const numero = `${c.serie}-${String(c.correlativo).padStart(8, '0')}`;
    const titulo = nombreTipo(c.tipo_comprobante).toUpperCase();
    const fechaEmision = new Date(c.fecha_emision).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const filasHtml = items.length > 0
      ? items.map((it, idx) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${idx + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.sku || '-'}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.descripcion}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.cantidad} ${it.unidad_medida || ''}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">S/ ${parseFloat(it.precio_unitario || 0).toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">S/ ${parseFloat(it.subtotal || (it.cantidad * it.precio_unitario) || 0).toFixed(2)}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="6" style="padding:12px;text-align:center;color:#64748b;">Detalle de Pedido #${c.id_pedido || '-'}</td></tr>`;

    const ventana = window.open('', '_blank', 'width=860,height=900');
    if (!ventana) {
      window.print();
      return;
    }

    ventana.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${titulo} ${numero}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e1b4b; padding-bottom: 16px; margin-bottom: 18px; }
          .box-num { border: 2px solid #1e1b4b; border-radius: 10px; padding: 12px 20px; text-align: center; min-width: 220px; }
          .box-num h2 { margin: 4px 0; font-size: 15px; color: #1e1b4b; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 18px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
          th { background: #1e1b4b; color: white; padding: 9px 8px; font-size: 11px; text-transform: uppercase; }
          .totales { width: 280px; margin-left: auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
          .totales div { display: flex; justify-content: space-between; padding: 4px 0; }
          .total-final { border-top: 2px solid #1e1b4b; margin-top: 6px; padding-top: 8px !important; font-weight: bold; font-size: 16px; color: #1e1b4b; }
          .anulado { color: #dc2626; font-weight: bold; border: 2px solid #dc2626; display: inline-block; padding: 4px 10px; border-radius: 6px; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 style="margin:0;color:#1e1b4b;font-size:22px;">${c.nombre_ubicacion || 'EMPRESA ERP'}</h1>
            <p style="margin:4px 0;color:#475569;">${c.direccion_ubicacion || 'Sede Operativa'}</p>
            ${c.telefono_ubicacion ? `<p style="margin:2px 0;color:#475569;">Tel: ${c.telefono_ubicacion}</p>` : ''}
          </div>
          <div class="box-num">
            <h2>${titulo}</h2>
            <div style="font-family:monospace;font-size:17px;font-weight:bold;">${numero}</div>
            ${c.estado_sunat === 'ANULADO' ? '<div class="anulado">ANULADO</div>' : ''}
          </div>
        </div>

        <div class="info-grid">
          <div><strong>Cliente:</strong> ${c.nombre_cliente || 'Cliente General'}</div>
          <div><strong>Fecha de Emisión:</strong> ${fechaEmision}</div>
          <div><strong>Documento (${c.cliente_tipo_doc || 'RUC/DNI'}):</strong> ${c.cliente_documento || '-'}</div>
          <div><strong>Condición de Pago:</strong> ${c.forma_pago === 'CREDITO' ? `Al Crédito (${c.dias_credito || 30} días)` : 'Al Contado'}</div>
          <div><strong>Dirección:</strong> ${c.cliente_direccion || '-'}</div>
          <div><strong>Pedido N°:</strong> #${c.id_pedido || '-'} · Moneda: Soles (S/)</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th style="text-align:left;">Código</th>
              <th style="text-align:left;">Descripción</th>
              <th>Cantidad</th>
              <th style="text-align:right;">Precio Unit.</th>
              <th style="text-align:right;">Importe</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>

        <div class="totales">
          <div><span>Monto sin IGV:</span><span>S/ ${parseFloat(c.monto_subtotal || 0).toFixed(2)}</span></div>
          <div><span>IGV (18%):</span><span>S/ ${parseFloat(c.monto_igv || 0).toFixed(2)}</span></div>
          <div class="total-final"><span>TOTAL:</span><span>S/ ${parseFloat(c.monto_total || 0).toFixed(2)}</span></div>
        </div>

        ${c.mensaje_cdr ? `<p style="margin-top:18px;font-size:11px;color:#64748b;">Observación: ${c.mensaje_cdr}</p>` : ''}
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    ventana.document.close();
  };

  // Estadísticas
  const totalFacturas = comprobantes.filter(c => c.tipo_comprobante === '01').length;
  const totalBoletas = comprobantes.filter(c => c.tipo_comprobante === '03').length;
  const totalNotas = comprobantes.filter(c => c.tipo_comprobante === '07').length;
  const totalMonto = comprobantes
    .filter(c => c.estado_sunat === 'ACEPTADO' && c.tipo_comprobante !== '07')
    .reduce((acc, c) => acc + parseFloat(c.monto_total || 0), 0);

  const comprobantesFiltrados = comprobantes.filter(c => {
    if (filtroTipo !== 'todos' && c.tipo_comprobante !== filtroTipo) return false;
    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase();
      const serieCorr = `${c.serie}-${c.correlativo}`.toLowerCase();
      const serieCorrPadded = `${c.serie}-${String(c.correlativo).padStart(8, '0')}`.toLowerCase();
      const cliente = (c.nombre_cliente || '').toLowerCase();
      return serieCorr.includes(q) || serieCorrPadded.includes(q) || cliente.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl shadow-xs">
            <Receipt size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Facturación y Boletas</h1>
            <p className="text-sm text-slate-500">
              Emite facturas o boletas al contado o a crédito, imprímelas y anúlalas si hubo un error
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Actualizar lista"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          {puedeEditarFacturacion && (
            <button
              onClick={abrirModalEmitir}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={18} />
              <span>Emitir Factura o Boleta</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Facturas</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">{totalFacturas}</span>
            <span className="text-xs text-slate-400">Empresas (RUC)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Boletas</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Receipt size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">{totalBoletas}</span>
            <span className="text-xs text-slate-400">Personas (DNI)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anulaciones</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><AlertCircle size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">{totalNotas}</span>
            <span className="text-xs text-slate-400">Notas de Crédito</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Facturado</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg"><DollarSign size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">S/ {totalMonto.toFixed(2)}</span>
            <span className="text-xs text-emerald-600 font-semibold">Vigente</span>
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroTipo('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({comprobantes.length})
          </button>
          <button
            onClick={() => setFiltroTipo('01')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === '01' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Facturas ({totalFacturas})
          </button>
          <button
            onClick={() => setFiltroTipo('03')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === '03' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Boletas ({totalBoletas})
          </button>
          <button
            onClick={() => setFiltroTipo('07')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === '07' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Notas de Crédito ({totalNotas})
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número o nombre del cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Tabla de Comprobantes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando comprobantes...</div>
        ) : comprobantesFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No hay comprobantes para mostrar.</p>
            {puedeEditarFacturacion && (
              <p className="text-slate-400 text-sm mt-1">Haz clic en "Emitir Factura o Boleta" arriba a la derecha para crear uno.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-5">Tipo</th>
                  <th className="py-4 px-5">Número</th>
                  <th className="py-4 px-5">Cliente / Pedido</th>
                  <th className="py-4 px-5 text-center">Forma de Pago</th>
                  <th className="py-4 px-5">Fecha</th>
                  <th className="py-4 px-5 text-right">Sin IGV</th>
                  <th className="py-4 px-5 text-right">IGV (18%)</th>
                  <th className="py-4 px-5 text-right">Total</th>
                  <th className="py-4 px-5 text-center">Estado</th>
                  <th className="py-4 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {comprobantesFiltrados.map((comp) => {
                  const serieCorr = `${comp.serie}-${String(comp.correlativo).padStart(8, '0')}`;
                  const esAnulado = comp.estado_sunat === 'ANULADO';
                  const esNotaCredito = comp.tipo_comprobante === '07';

                  return (
                    <tr key={comp.id_comprobante} className={`hover:bg-slate-50/60 transition-colors ${esAnulado ? 'bg-red-50/30' : ''}`}>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${badgeTipo(comp.tipo_comprobante)}`}>
                          {nombreTipo(comp.tipo_comprobante)}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-mono font-bold text-slate-900">
                        {serieCorr}
                      </td>
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-800">{comp.nombre_cliente || 'Cliente General'}</div>
                        <div className="text-xs text-slate-400">Pedido #{comp.id_pedido} · {comp.nombre_ubicacion || 'Central'}</div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        {comp.forma_pago === 'CREDITO' ? (
                          <div>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Crédito ({comp.dias_credito || 30} días)
                            </span>
                            {comp.fecha_vencimiento_cuota && (
                              <div className="text-[10px] text-purple-600 font-mono mt-0.5">
                                Vence: {new Date(comp.fecha_vencimiento_cuota).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Contado
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-slate-600 text-xs font-medium">
                        {new Date(comp.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-4 px-5 text-right text-slate-600 font-mono text-xs">
                        S/ {parseFloat(comp.monto_subtotal || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-right text-slate-600 font-mono text-xs">
                        S/ {parseFloat(comp.monto_igv || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-right font-bold text-slate-900 font-mono">
                        S/ {parseFloat(comp.monto_total || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          esAnulado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {esAnulado ? <XCircle size={12} className="mr-1" /> : <ShieldCheck size={12} className="mr-1" />}
                          {esAnulado ? 'Anulado' : 'Vigente'}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            disabled={cargandoPdf}
                            onClick={() => abrirVisorPdf(comp)}
                            className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center space-x-1 text-xs font-bold cursor-pointer"
                            title="Ver e imprimir comprobante"
                          >
                            <Eye size={13} />
                            <span>Ver / PDF</span>
                          </button>

                          {puedeEditarFacturacion && !esAnulado && !esNotaCredito && (
                            <button
                              type="button"
                              onClick={() => abrirModalAnular(comp)}
                              className="px-2.5 py-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors text-xs font-bold cursor-pointer"
                              title="Anular este comprobante"
                            >
                              Anular
                            </button>
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

      {/* MODAL VER / IMPRIMIR COMPROBANTE EN FORMATO A4 */}
      {modalPdf?.comprobante && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setModalPdf(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra superior del visor */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <FileText size={18} className="text-indigo-400" />
                <span className="text-sm font-bold">
                  {nombreTipo(modalPdf.comprobante.tipo_comprobante)} · {modalPdf.comprobante.serie}-{String(modalPdf.comprobante.correlativo).padStart(8, '0')}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={imprimirComprobanteActual}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalPdf(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X size={15} />
                  <span>Cerrar</span>
                </button>
              </div>
            </div>

            {/* Hoja del Comprobante */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-blue-950">
                <div>
                  <h2 className="text-xl font-extrabold text-blue-950">
                    {modalPdf.comprobante.nombre_ubicacion || 'SEDE CENTRAL'}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {modalPdf.comprobante.direccion_ubicacion || 'Dirección de sede registrada'}
                  </p>
                  {modalPdf.comprobante.telefono_ubicacion && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Teléfono: {modalPdf.comprobante.telefono_ubicacion}
                    </p>
                  )}
                </div>

                <div className="border-2 border-blue-950 rounded-xl px-5 py-3 text-center shrink-0">
                  <p className="text-xs font-extrabold text-blue-950 uppercase tracking-wider">
                    {nombreTipo(modalPdf.comprobante.tipo_comprobante)}
                  </p>
                  <p className="font-mono text-base font-black text-slate-900 mt-1">
                    {modalPdf.comprobante.serie}-{String(modalPdf.comprobante.correlativo).padStart(8, '0')}
                  </p>
                  {modalPdf.comprobante.estado_sunat === 'ANULADO' && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded text-[10px] font-black">
                      ANULADO
                    </span>
                  )}
                </div>
              </div>

              {/* Datos del Cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold">Cliente: </span>
                  <strong className="text-slate-900">{modalPdf.comprobante.nombre_cliente || 'Cliente General'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Fecha de Emisión: </span>
                  <strong className="text-slate-900">
                    {new Date(modalPdf.comprobante.fecha_emision).toLocaleDateString('es-PE', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">{modalPdf.comprobante.cliente_tipo_doc || 'RUC / DNI'}: </span>
                  <strong className="text-slate-900 font-mono">{modalPdf.comprobante.cliente_documento || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Forma de Pago: </span>
                  <strong className="text-slate-900">
                    {modalPdf.comprobante.forma_pago === 'CREDITO'
                      ? `Al Crédito (${modalPdf.comprobante.dias_credito || 30} días)`
                      : 'Al Contado'}
                  </strong>
                </div>
                {modalPdf.comprobante.cliente_direccion && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 font-semibold">Dirección: </span>
                    <span className="text-slate-800">{modalPdf.comprobante.cliente_direccion}</span>
                  </div>
                )}
              </div>

              {/* Tabla de Productos */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-blue-950 text-white uppercase">
                      <th className="p-3">Código</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-center">Cantidad</th>
                      <th className="p-3 text-right">Precio Unit.</th>
                      <th className="p-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalPdf.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">
                          Pedido #{modalPdf.comprobante.id_pedido}
                        </td>
                      </tr>
                    ) : (
                      modalPdf.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-mono text-slate-600">{it.sku || '-'}</td>
                          <td className="p-3 font-semibold text-slate-900">{it.descripcion}</td>
                          <td className="p-3 text-center font-bold text-slate-800">
                            {it.cantidad} {it.unidad_medida}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600">
                            S/ {parseFloat(it.precio_unitario || 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            S/ {parseFloat(it.subtotal || (it.cantidad * it.precio_unitario) || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="text-xs text-slate-500 max-w-sm">
                  {modalPdf.comprobante.mensaje_cdr && (
                    <p>Detalle: {modalPdf.comprobante.mensaje_cdr}</p>
                  )}
                </div>

                <div className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Monto sin IGV:</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IGV (18%):</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_igv || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-300 text-base font-extrabold text-blue-950">
                    <span>TOTAL:</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Emitir Comprobante */}
      {modalEmitir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Receipt className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-blue-950">Emitir Factura o Boleta</h3>
              </div>
              <button onClick={() => setModalEmitir(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEmitir} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. ¿Qué comprobante necesitas?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('01')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      tipoComprobante === '01'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">Factura</span>
                    <span className="text-xs text-slate-500">Para empresas con RUC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('03')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      tipoComprobante === '03'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">Boleta de Venta</span>
                    <span className="text-xs text-slate-500">Para clientes con DNI</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Elige el Pedido a Facturar
                </label>
                <select
                  value={pedidoSeleccionado?.id_pedido || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const encontrado = pedidosFacturables.find(p => p.id_pedido === id);
                    setPedidoSeleccionado(encontrado);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 bg-white"
                >
                  {pedidosFacturables.map((p) => (
                    <option key={p.id_pedido} value={p.id_pedido}>
                      Pedido #{p.id_pedido} · {p.cliente} · S/ {parseFloat(p.monto_total).toFixed(2)} ({etiquetaEstadoPedido(p.estado_pedido)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  3. ¿Cómo se pagará? *
                </label>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => setFormaPago('CONTADO')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      formaPago === 'CONTADO'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">💵 Al Contado</span>
                    <span className="text-xs text-slate-500">Pago en el momento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormaPago('CREDITO')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      formaPago === 'CREDITO'
                        ? 'border-purple-600 bg-purple-50/50 text-purple-950 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">🗓️ Al Crédito</span>
                    <span className="text-xs text-slate-500">Pago en plazo acordado</span>
                  </button>
                </div>

                {formaPago === 'CREDITO' && (
                  <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-900">Días de plazo:</span>
                      <select
                        value={diasCredito}
                        onChange={(e) => setDiasCredito(Number(e.target.value))}
                        className="bg-white border border-purple-300 rounded-lg px-3 py-1 font-bold text-purple-950 text-xs focus:outline-none focus:border-purple-500"
                      >
                        <option value={15}>15 días</option>
                        <option value={30}>30 días</option>
                        <option value={45}>45 días</option>
                        <option value={60}>60 días</option>
                        <option value={90}>90 días</option>
                      </select>
                    </div>
                    <div className="text-purple-800 font-medium pt-1 border-t border-purple-200/60">
                      📅 Fecha límite de pago: <strong className="font-mono">
                        {(() => {
                          const d = new Date();
                          d.setDate(d.getDate() + Number(diasCredito));
                          return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                        })()}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {pedidoSeleccionado && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cliente:</span>
                    <span className="font-bold text-slate-800">{pedidoSeleccionado.cliente}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Monto sin IGV:</span>
                    <span className="font-mono text-slate-800">S/ {(parseFloat(pedidoSeleccionado.monto_total) / 1.18).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IGV (18%):</span>
                    <span className="font-mono text-slate-800">S/ {(parseFloat(pedidoSeleccionado.monto_total) - (parseFloat(pedidoSeleccionado.monto_total) / 1.18)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                    <span className="text-slate-900">Total a cobrar:</span>
                    <span className="text-indigo-600 font-mono">S/ {parseFloat(pedidoSeleccionado.monto_total).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEmitir(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando || !pedidoSeleccionado}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {procesando && <Loader2 size={15} className="animate-spin" />}
                  <span>{procesando ? 'Emitiendo...' : 'Emitir Comprobante'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Anular Comprobante */}
      {modalAnular && comprobanteAAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-red-600">Anular Comprobante</h3>
              <button onClick={() => setModalAnular(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAnular} className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 space-y-1">
                <p>
                  Se anulará el comprobante <strong className="font-mono">{comprobanteAAnular.serie}-{String(comprobanteAAnular.correlativo).padStart(8, '0')}</strong> generando una Nota de Crédito.
                </p>
                <p className="font-semibold">
                  📦 Los productos de este comprobante volverán a sumarse automáticamente al inventario.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  ¿Por qué se anula? *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej: Error en los datos del cliente o devolución de mercadería..."
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-red-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAnular(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {procesando ? 'Anulando...' : 'Sí, Anular Comprobante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
