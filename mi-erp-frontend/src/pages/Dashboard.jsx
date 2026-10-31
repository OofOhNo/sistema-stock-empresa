import React, { useState, useEffect } from 'react';
import api from '../api';
import {
  DollarSign, ShoppingCart, Package, ArrowUpRight, Clock,
  BarChart3, TrendingUp, CalendarDays, RefreshCw, ChevronRight
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
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
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
  const [cargando, setCargando] = useState(true);
  const [cargandoGraficos, setCargandoGraficos] = useState(false);

  const esAdmin = usuario?.rol === 'Admin Central';
  const puedeVerPedidos = esAdmin || usuario?.permisos?.pedidos?.puede_ver !== false;
  const puedeVerStock = esAdmin || usuario?.permisos?.stock?.puede_ver !== false;
  const puedeVerFacturacion = esAdmin || usuario?.permisos?.facturacion?.puede_ver !== false;

  useEffect(() => {
    cargarResumen();
  }, [puedeVerPedidos, puedeVerStock]);

  useEffect(() => {
    if (subTab === 'graficos' && !puedeVerFacturacion) {
      setSubTab('resumen');
      return;
    }
    if (subTab === 'graficos' && puedeVerFacturacion) {
      cargarGraficos();
    }
  }, [subTab, puedeVerFacturacion]);

  const cargarResumen = async () => {
    try {
      const [resPedidos, resAlertas] = await Promise.all([
        puedeVerPedidos
          ? api.get('/pedidos/calendario').catch(() => ({ data: { eventos: [] } }))
          : Promise.resolve({ data: { eventos: [] } }),
        puedeVerStock
          ? api.get('/stock/alertas').catch(() => ({ data: { alertas: [] } }))
          : Promise.resolve({ data: { alertas: [] } })
      ]);

      const pedidos = resPedidos.data.eventos || [];
      const alertas = resAlertas.data.alertas || [];

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
  };

  const cargarGraficos = async () => {
    setCargandoGraficos(true);
    try {
      const res = await api.get('/facturacion/graficos');
      setDatosGraficos(res.data);
    } catch (error) {
      console.error('Error al cargar gráficos de facturación', error);
    } finally {
      setCargandoGraficos(false);
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
