import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { 
  FileText, Plus, CheckCircle, AlertCircle, RefreshCw, XCircle, 
  ExternalLink, Search, Filter, ShieldCheck, DollarSign, Receipt,
  Building, User, Calendar, X
} from 'lucide-react';

export default function Facturacion({ usuario }) {
  const [comprobantes, setComprobantes] = useState([]);
  const [pedidosPendientes, setPedidosPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos', '01', '03', '07'
  const [busqueda, setBusqueda] = useState('');

  // Modal Emitir
  const [modalEmitir, setModalEmitir] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('01'); // '01' Factura, '03' Boleta
  const [procesando, setProcesando] = useState(false);

  // Modal Anular
  const [modalAnular, setModalAnular] = useState(false);
  const [comprobanteAAnular, setComprobanteAAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resComp, resPed] = await Promise.all([
        api.get('/facturacion'),
        api.get('/pedidos/calendario')
      ]);

      setComprobantes(resComp.data.comprobantes || []);
      const pendientes = (resPed.data.eventos || []).filter(p => p.estado_pedido === 'PENDIENTE');
      setPedidosPendientes(pendientes);
      if (pendientes.length > 0 && !pedidoSeleccionado) {
        setPedidoSeleccionado(pendientes[0]);
      }
    } catch (error) {
      toast.error('Error al cargar datos de facturación: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setCargando(false);
    }
  };

  const abrirModalEmitir = () => {
    if (pedidosPendientes.length === 0) {
      toast.error('No hay pedidos pendientes listos para facturar.');
      return;
    }
    setPedidoSeleccionado(pedidosPendientes[0]);
    setTipoComprobante('01');
    setModalEmitir(true);
  };

  const handleEmitir = async (e) => {
    e.preventDefault();
    if (!pedidoSeleccionado) {
      toast.error('Selecciona un pedido para facturar.');
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/emitir', {
        id_pedido: pedidoSeleccionado.id_pedido,
        tipo_comprobante: tipoComprobante
      });
      toast.success(res.data.mensaje || 'Comprobante emitido con éxito ante la SUNAT.');
      setModalEmitir(false);
      cargarDatos();
    } catch (error) {
      toast.error('Error al emitir: ' + (error.response?.data?.mensaje || error.message));
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
      toast.error('Debes especificar el motivo legal de la anulación.');
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/anular', {
        id_comprobante: comprobanteAAnular.id_comprobante,
        motivo: motivoAnulacion.trim()
      });
      toast.success(res.data.mensaje || 'Nota de crédito generada. Comprobante anulado.');
      setModalAnular(false);
      cargarDatos();
    } catch (error) {
      toast.error('Error al anular: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setProcesando(false);
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

  // Cálculos estadísticos
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
      const cliente = (c.nombre_cliente || '').toLowerCase();
      return serieCorr.includes(q) || cliente.includes(q);
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
            <h1 className="text-2xl font-bold text-blue-950">Facturación Electrónica SUNAT</h1>
            <p className="text-sm text-slate-500">
              Emisión de Facturas (01), Boletas (03) y Notas de Crédito (07) integradas con OSE/SUNAT
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="Recargar comprobantes"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={abrirModalEmitir}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-colors"
          >
            <Plus size={18} />
            <span>Emitir Comprobante</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Facturas (01)</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalFacturas}</span>
            <span className="text-xs text-slate-400">RUC Empresa</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Boletas (03)</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Receipt size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalBoletas}</span>
            <span className="text-xs text-slate-400">DNI Consumidor</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notas Crédito (07)</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><AlertCircle size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">{totalNotas}</span>
            <span className="text-xs text-slate-400">Anulaciones</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Facturado</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg"><DollarSign size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900">${totalMonto.toFixed(2)}</span>
            <span className="text-xs text-emerald-600 font-semibold">SUNAT OK</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroTipo('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filtroTipo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({comprobantes.length})
          </button>
          <button
            onClick={() => setFiltroTipo('01')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filtroTipo === '01' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Facturas ({totalFacturas})
          </button>
          <button
            onClick={() => setFiltroTipo('03')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              filtroTipo === '03' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Boletas ({totalBoletas})
          </button>
          <button
            onClick={() => setFiltroTipo('07')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
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
            placeholder="Buscar por serie, número o cliente..."
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
            <p className="text-slate-600 font-medium">No se encontraron comprobantes registrados.</p>
            <p className="text-slate-400 text-sm mt-1">Emite una Factura o Boleta desde un pedido pendiente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-6">Comprobante</th>
                  <th className="py-4 px-6">Serie - Correlativo</th>
                  <th className="py-4 px-6">Cliente / Pedido</th>
                  <th className="py-4 px-6">Fecha Emisión</th>
                  <th className="py-4 px-6 text-right">Subtotal</th>
                  <th className="py-4 px-6 text-right">IGV (18%)</th>
                  <th className="py-4 px-6 text-right">Total</th>
                  <th className="py-4 px-6 text-center">Estado SUNAT</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {comprobantesFiltrados.map((comp) => {
                  const serieCorr = `${comp.serie}-${String(comp.correlativo).padStart(8, '0')}`;
                  const esAnulado = comp.estado_sunat === 'ANULADO';
                  const esNotaCredito = comp.tipo_comprobante === '07';

                  return (
                    <tr key={comp.id_comprobante} className={`hover:bg-slate-50/60 transition-colors ${esAnulado ? 'bg-red-50/30' : ''}`}>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${badgeTipo(comp.tipo_comprobante)}`}>
                          {nombreTipo(comp.tipo_comprobante)}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-slate-900">
                        {serieCorr}
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-semibold text-slate-800">{comp.nombre_cliente || 'Consumidor Final'}</div>
                        <div className="text-xs text-slate-400">Pedido #{comp.id_pedido} · {comp.nombre_ubicacion || 'Central'}</div>
                      </td>
                      <td className="py-4 px-6 text-slate-600 text-xs font-medium">
                        {new Date(comp.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-4 px-6 text-right text-slate-600 font-mono text-xs">
                        ${parseFloat(comp.monto_subtotal || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-right text-slate-600 font-mono text-xs">
                        ${parseFloat(comp.monto_igv || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-right font-bold text-slate-900 font-mono">
                        ${parseFloat(comp.monto_total || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex flex-col items-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            esAnulado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {esAnulado ? <XCircle size={12} className="mr-1" /> : <ShieldCheck size={12} className="mr-1" />}
                            {comp.estado_sunat}
                          </span>
                          {comp.codigo_hash && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5" title={comp.codigo_hash}>
                              {comp.codigo_hash.substring(0, 12)}...
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <a
                            href={`https://api.nubefact.com/pdf/${comp.serie}-${comp.correlativo}.pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center space-x-1 text-xs font-semibold"
                            title="Ver PDF Oficial OSE/SUNAT"
                          >
                            <ExternalLink size={14} />
                            <span>PDF</span>
                          </a>

                          {!esAnulado && !esNotaCredito && (
                            <button
                              onClick={() => abrirModalAnular(comp)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs font-semibold"
                              title="Anular comprobante emitiendo Nota de Crédito"
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

      {/* Modal Emitir Comprobante */}
      {modalEmitir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Receipt className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-slate-900">Emitir Comprobante SUNAT</h3>
              </div>
              <button onClick={() => setModalEmitir(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEmitir} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Tipo de Comprobante
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('01')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      tipoComprobante === '01'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">Factura Electrónica (01)</span>
                    <span className="text-xs text-slate-500">Serie F001 · RUC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('03')}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      tipoComprobante === '03'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">Boleta de Venta (03)</span>
                    <span className="text-xs text-slate-500">Serie B001 · DNI</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Seleccionar Pedido Pendiente
                </label>
                <select
                  value={pedidoSeleccionado?.id_pedido || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const encontrado = pedidosPendientes.find(p => p.id_pedido === id);
                    setPedidoSeleccionado(encontrado);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500"
                >
                  {pedidosPendientes.map((p) => (
                    <option key={p.id_pedido} value={p.id_pedido}>
                      Pedido #{p.id_pedido} · {p.cliente} · Total: ${parseFloat(p.monto_total).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {pedidoSeleccionado && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cliente Facturable:</span>
                    <span className="font-bold text-slate-800">{pedidoSeleccionado.cliente}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Creado por:</span>
                    <span className="font-medium text-slate-800">{pedidoSeleccionado.creador || 'Sistema'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Monto Subtotal (Base Gravada):</span>
                    <span className="font-mono text-slate-800">${(parseFloat(pedidoSeleccionado.monto_total) / 1.18).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IGV (18%):</span>
                    <span className="font-mono text-slate-800">${(parseFloat(pedidoSeleccionado.monto_total) - (parseFloat(pedidoSeleccionado.monto_total) / 1.18)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                    <span className="text-slate-900">Monto Total:</span>
                    <span className="text-indigo-600 font-mono">${parseFloat(pedidoSeleccionado.monto_total).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800">
                ⚠️ Al emitir este comprobante, se generará automáticamente la <b>SALIDA física en el Kardex</b> y se liberará la reserva del stock.
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEmitir(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando || !pedidoSeleccionado}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {procesando ? 'Procesando con SUNAT...' : 'Emitir y Declarar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Anular Comprobante */}
      {modalAnular && comprobanteAAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-red-600">Anular Comprobante Electrónico</h3>
              <button onClick={() => setModalAnular(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAnular} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Se emitirá una <b>Nota de Crédito (Tipo 07)</b> ante la SUNAT para anular formalmente el comprobante 
                <span className="font-mono font-bold text-slate-900 ml-1">{comprobanteAAnular.serie}-{comprobanteAAnular.correlativo}</span>.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Motivo de Anulación *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej: Error en datos del cliente / Devolución de mercadería / Anulación de operación..."
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
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {procesando ? 'Anulando...' : 'Confirmar Anulación (NC 07)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

