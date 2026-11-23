import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  DollarSign, ShoppingCart, Package, ArrowUpRight, Clock,
  BarChart3, TrendingUp, CalendarDays, RefreshCw, ChevronRight,
  BellRing, CheckCircle2, AlertTriangle
} from 'lucide-react';

function GraficoBarras({ titulo, subtitulo, datos, keyEtiqueta, keyTotal, colorPrimario = 'indigo' }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [seleccionadoIdx, setSeleccionadoIdx] = useState(null);

  const valores = (datos || []).map(d => parseFloat(d[keyTotal]) || 0);
  const maxVal = Math.max(...valores, 100);
  const totalSuma = valores.reduce((a, b) => a + b, 0);

  const colorClases = {
    indigo: { bar: 'bg-indigo-600 hover:bg-indigo-500', bg: 'bg-indigo-50 text-indigo-700' },
    emerald: { bar: 'bg-emerald-600 hover:bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
    blue: { bar: 'bg-blue-600 hover:bg-blue-500', bg: 'bg-blue-50 text-blue-700' },
    purple: { bar: 'bg-purple-600 hover:bg-purple-500', bg: 'bg-purple-50 text-purple-700' }
  }[colorPrimario] || { bar: 'bg-indigo-600 hover:bg-indigo-500', bg: 'bg-indigo-50 text-indigo-700' };

  const activo =
    seleccionadoIdx !== null
      ? (datos || [])[seleccionadoIdx]
      : (hoverIdx !== null ? (datos || [])[hoverIdx] : null);

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${colorClases.bg}`}>
            {subtitulo}
          </span>
          <h3 className="text-lg font-bold text-blue-950 mt-1.5">{titulo}</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 font-medium">Total del Período</p>
          <p className="text-base font-bold text-blue-950">
            S/ {totalSuma.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Área de Barras */}
      <div className="h-48 pt-6 pb-2 flex items-end justify-between gap-2 border-b border-slate-100 relative">
        {(datos || []).map((item, idx) => {
          const val = parseFloat(item[keyTotal]) || 0;
          const alturaPct = maxVal > 0 ? Math.max((val / maxVal) * 100, val > 0 ? 8 : 2) : 2;
          const isSelected = seleccionadoIdx === idx || hoverIdx === idx;

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
              onPointerEnter={(e) => { if (e.pointerType !== 'touch') setHoverIdx(idx); }}
              onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHoverIdx(null); }}
              onClick={() => setSeleccionadoIdx(seleccionadoIdx === idx ? null : idx)}
            >
              {val > 0 && (
                <span className="text-[10px] font-extrabold text-blue-950 mb-1 font-mono tracking-tight text-center">
                  S/{val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                </span>
              )}

              {hoverIdx === idx && (
                <div className="absolute -top-12 z-20 bg-slate-900 text-white text-[11px] font-mono py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95">
                  <span className="font-bold">S/ {val.toFixed(2)}</span>
                  {item.cantidad !== undefined && (
                    <span className="text-slate-400 ml-1">({item.cantidad} comp.)</span>
                  )}
                </div>
              )}

              <div
                style={{ height: `${alturaPct}%` }}
                className={`w-full max-w-[36px] rounded-t-lg transition-all duration-300 ${
                  val === 0 ? 'bg-slate-100 hover:bg-slate-200' : `${colorClases.bar} shadow-xs`
                } ${isSelected ? 'ring-2 ring-indigo-500 scale-y-105 shadow-md' : ''}`}
              />
            </div>
          );
        })}
      </div>

      {/* Etiquetas Eje X */}
      <div className="flex items-center justify-between gap-2 pt-2 text-[11px] font-semibold text-slate-500">
        {(datos || []).map((item, idx) => (
          <div
            key={idx}
            onClick={() => setSeleccionadoIdx(seleccionadoIdx === idx ? null : idx)}
            className={`flex-1 text-center truncate cursor-pointer transition-colors ${
              seleccionadoIdx === idx ? 'text-indigo-600 font-bold' : ''
            }`}
            title={item.nombreCompleto || item[keyEtiqueta]}
          >
            {item[keyEtiqueta]}
          </div>
        ))}
      </div>

      {activo ? (
        <div className="mt-4 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
          <div className="truncate pr-2">
            <span className="font-bold text-blue-950">{activo.nombreCompleto || activo[keyEtiqueta]}</span>
            <span className="text-slate-500 ml-2">
              {activo.cantidad !== undefined ? `(${activo.cantidad} comprobante${activo.cantidad === 1 ? '' : 's'})` : ''}
            </span>
          </div>
          <span className="font-bold text-sm text-indigo-700 shrink-0">
            S/ {Number(activo[keyTotal] || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-400 text-center italic">
          Toca cualquier barra para ver el monto exacto
        </p>
      )}
    </div>
  );
}

export default function Dashboard({ usuario, setVistaActual }) {
  const [subTab, setSubTab] = useState('resumen');
  const [resumen, setResumen] = useState({
    pedidosPorAtender: 0,
    pedidosSinFacturar: 0,
    montoTotalVentas: 0,
    productosBajoStock: 0
  });

  const [datosGraficos, setDatosGraficos] = useState(null);
  const [alertasPagos, setAlertasPagos] = useState([]);
  const [alertasPedidos, setAlertasPedidos] = useState([]);
  const [alertasFacturasVencidas, setAlertasFacturasVencidas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoGraficos, setCargandoGraficos] = useState(false);

  const esAdmin = usuario?.rol === 'Admin Central' || usuario?.nombre_rol === 'Admin Central';
  const puedeVerPedidos = esAdmin || Boolean(usuario?.permisos?.pedidos?.puede_ver || usuario?.permisos?.pedidos?.puede_editar);
  const puedeVerStock = esAdmin || Boolean(usuario?.permisos?.stock?.puede_ver || usuario?.permisos?.stock?.puede_editar);
  const puedeVerFacturacion = esAdmin || Boolean(usuario?.permisos?.facturacion?.puede_ver || usuario?.permisos?.facturacion?.puede_editar);
  const puedeVerCalendarioPagos = esAdmin || Boolean(usuario?.permisos?.calendario_pagos?.puede_ver || usuario?.permisos?.calendario_pagos?.puede_editar);
  const puedeEditarCalendarioPagos = esAdmin || Boolean(usuario?.permisos?.calendario_pagos?.puede_editar);

  const cargarResumen = useCallback(async () => {
    try {
      const [resPedidos, resAlertas, resPagos, resVencidas] = await Promise.all([
        puedeVerPedidos
          ? api.get('/pedidos/calendario').catch(() => ({ data: { eventos: [] } }))
          : Promise.resolve({ data: { eventos: [] } }),
        puedeVerStock
          ? api.get('/stock/alertas').catch(() => ({ data: { alertas: [] } }))
          : Promise.resolve({ data: { alertas: [] } }),
        puedeVerCalendarioPagos
          ? api.get('/pagos-calendario/alertas-inicio').catch(() => ({ data: { alertas: [] } }))
          : Promise.resolve({ data: { alertas: [] } }),
        puedeVerFacturacion
          ? api.get('/facturacion/vencidas').catch(() => ({ data: { vencidas: [] } }))
          : Promise.resolve({ data: { vencidas: [] } })
      ]);

      const pedidos = resPedidos.data.eventos || [];
      const alertas = resAlertas.data.alertas || [];
      setAlertasPagos(puedeVerCalendarioPagos ? (resPagos.data?.alertas || []) : []);
      setAlertasFacturasVencidas(puedeVerFacturacion ? (resVencidas.data?.vencidas || []) : []);

      // Filtrar entregas/pedidos urgentes de ayer, hoy y mañana
      const ahoraLima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }));
      ahoraLima.setHours(0, 0, 0, 0);
      const isoDia = (d) => d.toLocaleDateString('en-CA');
      const ayerISO = isoDia(new Date(ahoraLima.getTime() - 86400000));
      const hoyISO = isoDia(ahoraLima);
      const mananaISO = isoDia(new Date(ahoraLima.getTime() + 86400000));

      const pedUrgentes = pedidos
        .filter((p) => {
          if (['CANCELADO', 'ENTREGADO', 'DESPACHADO'].includes(p.estado_pedido)) return false;
          const f = String(p.fecha_entrega_programada || p.fecha_pedido || '').slice(0, 10);
          return f === ayerISO || f === hoyISO || f === mananaISO;
        })
        .map((p) => {
          const f = String(p.fecha_entrega_programada || p.fecha_pedido || '').slice(0, 10);
          const urgencia = f === ayerISO ? 'AYER' : f === hoyISO ? 'HOY' : 'MANANA';
          return { ...p, urgencia, fecha_iso: f };
        });
      setAlertasPedidos(pedUrgentes);

      const porAtender = pedidos.filter(
        p => p.estado_pedido === 'PENDIENTE' || p.estado_pedido === 'LISTO_DESPACHO'
      ).length;

      const sinFacturar = pedidos.filter(
        p => p.estado_pedido !== 'CANCELADO' && !p.tiene_factura && p.estado_pedido !== 'FACTURADO'
      ).length;

      const ventasExitosas = pedidos.filter(
        p => p.estado_pedido === 'FACTURADO' || p.estado_pedido === 'DESPACHADO' || p.tiene_factura
      );
      const montoTotal = ventasExitosas.reduce((acc, p) => acc + (parseFloat(p.monto_total) || 0), 0);

      setResumen({
        pedidosPorAtender: porAtender,
        pedidosSinFacturar: sinFacturar,
        montoTotalVentas: montoTotal,
        productosBajoStock: alertas.length
      });
    } catch (error) {
      console.error('Error al cargar resumen de inicio', error);
    } finally {
      setCargando(false);
    }
  }, [puedeVerPedidos, puedeVerStock, puedeVerCalendarioPagos, puedeVerFacturacion]);

  const cargarGraficos = useCallback(async () => {
    setCargandoGraficos(true);
    try {
      const res = await api.get('/facturacion/graficos');
      setDatosGraficos(res.data);
    } catch (error) {
      console.error('Error al cargar gráficos de facturación', error);
    } finally {
      setCargandoGraficos(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarResumen();
    });
    return () => {
      alive = false;
    };
  }, [cargarResumen]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      if (subTab === 'graficos' && !puedeVerFacturacion) {
        setSubTab('resumen');
        return;
      }
      if (subTab === 'graficos' && puedeVerFacturacion) {
        void cargarGraficos();
      }
    });
    return () => {
      alive = false;
    };
  }, [subTab, puedeVerFacturacion, cargarGraficos]);

  const marcarPagoPagado = async (idPago) => {
    try {
      await api.patch(`/pagos-calendario/${idPago}/estado`, { estado: 'PAGADO' });
      cargarResumen();
    } catch (err) {
      console.error('Error al marcar pago como pagado', err);
    }
  };

  const marcarFacturaCreditoPagada = async (idComprobante) => {
    try {
      const res = await api.patch(`/facturacion/${idComprobante}/estado-pago`, { estado_pago: 'PAGADO' });
      toast.success(res.data?.mensaje || 'Comprobante marcado como Pagado.');
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
      cargarResumen();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el pago del comprobante.');
    }
  };

  if (cargando) return <div className="text-slate-500 font-medium p-4">Cargando resumen...</div>;

  return (
    <div className="space-y-6">

      {/* Bienvenida con selector de pestañas disponibles solo desde Inicio */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-indigo-50/50 to-white">
        <div>
          <h2 className="text-2xl font-bold text-blue-950">¡Hola, {usuario?.nombre || 'Bienvenido'}! 👋</h2>
          <p className="text-slate-500 mt-1 text-sm">
            {puedeVerPedidos ? (
              <>
                Resumen rápido de hoy. Tienes{' '}
                <span className="font-bold text-indigo-600">
                  {resumen.pedidosPorAtender} pedido{resumen.pedidosPorAtender === 1 ? '' : 's'}
                </span>{' '}
                en preparación o listos para entregar.
              </>
            ) : (
              'Selecciona cualquier sección del menú de la izquierda para comenzar.'
            )}
          </p>
        </div>

        {puedeVerFacturacion && (
          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setSubTab('resumen')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'resumen'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShoppingCart size={15} />
              <span>Resumen de Hoy</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('graficos')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                subTab === 'graficos'
                  ? 'bg-white text-blue-950 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 size={15} className="text-indigo-600" />
              <span>Gráficos de Facturación</span>
            </button>
          </div>
        )}
      </div>

      {/* SUB-PESTAÑA 1: RESUMEN GENERAL OPERATIVO */}
      {subTab === 'resumen' && (
        <div className="space-y-6">
          {/* AVISOS DE FACTURAS A CRÉDITO CON PLAZO DE PAGO VENCIDO */}
          {puedeVerFacturacion && alertasFacturasVencidas.length > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-rose-950">
                      Facturas a Crédito Vencidas ({alertasFacturasVencidas.length})
                    </h3>
                    <p className="text-xs text-rose-800">
                      Comprobantes cuyo plazo de pago ya pasó la fecha de vencimiento y siguen pendientes.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.setItem('facturacion_filtro_vencidas', '1');
                    setVistaActual('facturacion');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer self-start sm:self-auto"
                >
                  Ver en Facturación
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {alertasFacturasVencidas.map((f) => (
                  <div
                    key={f.id_comprobante}
                    className="bg-white rounded-xl p-3 border border-rose-200 shadow-2xs flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-extrabold text-rose-900">
                          {f.serie}-{String(f.correlativo).padStart(8, '0')}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700">
                          Vencida hace {f.dias_vencido}d
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 truncate mt-0.5">{f.nombre_cliente}</p>
                      <p className="text-[11px] text-slate-500">
                        Venció: <span className="font-mono font-semibold">{f.fecha_vencimiento_iso}</span> •{' '}
                        <span className="font-mono font-bold text-slate-900">S/ {Number(f.monto_total || 0).toFixed(2)}</span>
                      </p>
                    </div>
                    {(esAdmin || usuario?.permisos?.facturacion?.puede_editar === true) && (
                      <button
                        type="button"
                        onClick={() => marcarFacturaCreditoPagada(f.id_comprobante)}
                        className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer shrink-0"
                      >
                        Marcar Pagada
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RECORDATORIOS Y VENCIMIENTOS DE AYER, HOY Y MAÑANA */}
          {(puedeVerCalendarioPagos || alertasPedidos.length > 0) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                    <BellRing size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-blue-950">Pendientes y Vencimientos (Ayer, Hoy y Mañana)</h3>
                    <p className="text-xs text-slate-500">
                      {puedeVerCalendarioPagos
                        ? 'Tus pagos programados personales y entregas urgentes'
                        : 'Entregas de pedidos urgentes para ayer, hoy o mañana'}
                    </p>
                  </div>
                </div>
                {puedeVerCalendarioPagos && (
                  <button
                    type="button"
                    onClick={() => setVistaActual('calendario_pagos')}
                    className="inline-flex items-center space-x-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl cursor-pointer self-start sm:self-auto"
                  >
                    <CalendarDays size={14} />
                    <span>Ir al Calendario de Pagos</span>
                  </button>
                )}
              </div>

              {alertasPagos.length === 0 && alertasPedidos.length === 0 ? (
                <div className="flex items-center space-x-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 font-medium">
                  <CheckCircle2 size={16} />
                  <span>¡Todo al día! No tienes pagos vencidos ni pendientes para ayer, hoy o mañana.</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { key: 'AYER_ATRASADO', titulo: 'Vencidos / Ayer', match: (u) => u === 'AYER' || u === 'ATRASADO', estilo: 'border-rose-200 bg-rose-50/70', badge: 'bg-rose-600 text-white' },
                    { key: 'HOY', titulo: 'Para Hoy', match: (u) => u === 'HOY', estilo: 'border-amber-300 bg-amber-50/80', badge: 'bg-amber-600 text-white' },
                    { key: 'MANANA', titulo: 'Para Mañana', match: (u) => u === 'MANANA', estilo: 'border-sky-200 bg-sky-50/70', badge: 'bg-sky-600 text-white' },
                  ].map((col) => {
                    const pagosCol = puedeVerCalendarioPagos ? alertasPagos.filter((a) => col.match(a.urgencia)) : [];
                    const pedsCol = puedeVerPedidos ? alertasPedidos.filter((p) => col.match(p.urgencia)) : [];
                    const totalCol = pagosCol.length + pedsCol.length;
                    return (
                      <div key={col.key} className={`rounded-xl border p-3.5 space-y-2 ${col.estilo}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-800">{col.titulo}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badge}`}>{totalCol}</span>
                        </div>
                        {totalCol === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">Sin pendientes</p>
                        ) : (
                          <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                            {pagosCol.map((pago) => (
                              <div key={`pago-${pago.id_pago}`} className="bg-white rounded-lg p-2.5 border border-slate-200 shadow-2xs flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center space-x-1">
                                    <AlertTriangle size={12} className="text-rose-500 shrink-0" />
                                    <span className="text-xs font-bold text-slate-900 truncate">{pago.titulo}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {pago.categoria} • <span className="font-mono font-bold text-slate-800">{pago.moneda === 'USD' ? '$' : 'S/'} {Number(pago.monto).toFixed(2)}</span>
                                  </div>
                                  <div className="text-[10px] text-slate-400">{pago.fecha_vencimiento_iso}</div>
                                </div>
                                {puedeEditarCalendarioPagos && (
                                  <button
                                    type="button"
                                    onClick={() => marcarPagoPagado(pago.id_pago)}
                                    className="text-[10px] font-bold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 cursor-pointer shrink-0"
                                  >
                                    Pagado
                                  </button>
                                )}
                              </div>
                            ))}
                            {pedsCol.map((ped) => (
                              <div
                                key={`ped-${ped.id_pedido}`}
                                onClick={() => setVistaActual('pedidos')}
                                className="bg-white rounded-lg p-2.5 border border-slate-200 shadow-2xs cursor-pointer hover:border-indigo-300"
                              >
                                <div className="text-xs font-bold text-indigo-950 truncate">
                                  Pedido #{ped.id_pedido} — {ped.nombre_cliente || ped.razon_social_o_nombre || 'Cliente'}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5">
                                  Estado: <span className="font-semibold">{ped.estado_pedido}</span> • {ped.fecha_iso}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Tarjeta 1: Ventas */}
            {puedeVerFacturacion || puedeVerPedidos ? (
              <div
                onClick={() => {
                  if (puedeVerFacturacion && setVistaActual) setVistaActual('facturacion');
                  else if (puedeVerPedidos && setVistaActual) setVistaActual('pedidos');
                }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ventas Confirmadas</p>
                    <h3 className="text-3xl font-bold text-blue-950 mt-2">
                      S/ {resumen.montoTotalVentas.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
                    <DollarSign size={24} />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-emerald-600 font-medium">
                  <span className="flex items-center">
                    <ArrowUpRight size={16} className="mr-1" />
                    Pedidos entregados o facturados
                  </span>
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ) : null}

            {/* Tarjeta 2: Pedidos por atender / sin facturar */}
            {puedeVerPedidos ? (
              <div
                onClick={() => setVistaActual?.('pedidos')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {puedeVerFacturacion ? 'Pedidos sin Facturar' : 'Pedidos por Entregar'}
                    </p>
                    <h3 className="text-3xl font-bold text-blue-950 mt-2">
                      {puedeVerFacturacion ? resumen.pedidosSinFacturar : resumen.pedidosPorAtender}
                    </h3>
                  </div>
                  <div className="p-3 bg-yellow-100 text-yellow-600 rounded-xl">
                    <Clock size={24} />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>
                    {resumen.pedidosPorAtender} en preparación / listos para despacho
                  </span>
                  <ChevronRight size={16} className="text-indigo-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ) : null}

            {/* Tarjeta 3: Alertas de Stock */}
            {puedeVerStock ? (
              <div
                onClick={() => setVistaActual?.('stock')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-red-300 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Productos con Poco Stock</p>
                    <h3 className="text-3xl font-bold text-blue-950 mt-2">{resumen.productosBajoStock}</h3>
                  </div>
                  <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                    <Package size={24} />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>Haz clic para revisar el inventario</span>
                  <ChevronRight size={16} className="text-indigo-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ) : null}

          </div>
        </div>
      )}

      {/* SUB-PESTAÑA 2: 4 GRÁFICOS DE FACTURACIÓN */}
      {subTab === 'graficos' && puedeVerFacturacion && (
        <div className="space-y-6">
          {cargandoGraficos || !datosGraficos ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 font-medium">
              Cargando gráficos de facturación semanal, mensual, trimestral y anual...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">
                  Resumen visual de ventas facturadas (no incluye facturas anuladas)
                </span>
                <button
                  type="button"
                  onClick={cargarGraficos}
                  disabled={cargandoGraficos}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  <RefreshCw size={13} className={cargandoGraficos ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
                  <span>Actualizar Gráficos</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Facturado</p>
                    <h3 className="text-2xl font-bold text-blue-950 mt-1">
                      S/ {Number(datosGraficos.resumen?.totalHistorico || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-3 bg-blue-50 text-blue-900 rounded-xl">
                    <TrendingUp size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Promedio por Mes</p>
                    <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                      S/ {Number(datosGraficos.resumen?.promedioMensual || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <CalendarDays size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Facturas y Boletas</p>
                    <h3 className="text-2xl font-bold text-indigo-600 mt-1">
                      {datosGraficos.resumen?.totalComprobantes || 0} emitidas
                    </h3>
                  </div>
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                    <DollarSign size={22} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GraficoBarras
                  titulo="Facturación Semanal"
                  subtitulo="Días en esta semana (Lunes a Domingo)"
                  datos={datosGraficos.graficos?.semanal || []}
                  keyEtiqueta="etiqueta"
                  keyTotal="total"
                  colorPrimario="indigo"
                />

                <GraficoBarras
                  titulo="Facturación Mensual"
                  subtitulo="Semanas en este mes"
                  datos={datosGraficos.graficos?.mensual || []}
                  keyEtiqueta="etiqueta"
                  keyTotal="total"
                  colorPrimario="emerald"
                />

                <GraficoBarras
                  titulo="Facturación Trimestral"
                  subtitulo="Trimestres del Año (T1 a T4)"
                  datos={datosGraficos.graficos?.trimestral || []}
                  keyEtiqueta="trimestre"
                  keyTotal="total"
                  colorPrimario="blue"
                />

                <GraficoBarras
                  titulo="Facturación Anual"
                  subtitulo="Comparación por Año"
                  datos={datosGraficos.graficos?.anual || []}
                  keyEtiqueta="anio"
                  keyTotal="total"
                  colorPrimario="purple"
                />
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
