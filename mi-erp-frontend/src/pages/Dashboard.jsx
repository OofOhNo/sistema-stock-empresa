import React, { useState, useEffect } from 'react';
import api from '../api';
import { 
  DollarSign, ShoppingCart, Package, ArrowUpRight, Clock, 
  BarChart3, TrendingUp, Calendar, CalendarDays, PieChart, RefreshCw 
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

  const activo = seleccionadoIdx !== null ? (datos || [])[seleccionadoIdx] : (hoverIdx !== null ? (datos || [])[hoverIdx] : null);

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
          <p className="text-xs text-slate-400 font-medium">Total Período</p>
          <p className="text-base font-bold text-blue-950">
            S/ {totalSuma.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Área del Gráfico SVG / Barras */}
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
              {/* Monto directo visible arriba de la barra para móviles */}
              {val > 0 && (
                <span className="text-[10px] font-extrabold text-blue-950 mb-1 font-mono tracking-tight text-center">
                  S/{val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
                </span>
              )}

              {/* Tooltip flotante */}
              {hoverIdx === idx && (
                <div className="absolute -top-12 z-20 bg-slate-900 text-white text-[11px] font-mono py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95">
                  <span className="font-bold">S/ {val.toFixed(2)}</span>
                  {item.cantidad !== undefined && (
                    <span className="text-slate-400 ml-1">({item.cantidad} doc{item.cantidad === 1 ? '' : 's'})</span>
                  )}
                </div>
              )}

              {/* Barra */}
              <div 
                style={{ height: `${alturaPct}%` }}
                className={`w-full max-w-[36px] rounded-t-lg transition-all duration-300 ${
                  val === 0 
                    ? 'bg-slate-100 hover:bg-slate-200' 
                    : `${colorClases.bar} shadow-xs`
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

      {/* Detalle interactivo para Móvil / Táctil al tocar una barra */}
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
          Toca cualquier barra para ver el detalle
        </p>
      )}
    </div>
  );
}

export default function Dashboard({ usuario }) {
  const [subTab, setSubTab] = useState('resumen'); // 'resumen' o 'graficos'
  const [resumen, setResumen] = useState({
    pedidosPendientes: 0,
    montoTotalVentas: 0,
    productosBajoStock: 0
  });

  const [datosGraficos, setDatosGraficos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoGraficos, setCargandoGraficos] = useState(false);

  useEffect(() => {
    cargarResumen();
  }, []);

  useEffect(() => {
    if (subTab === 'graficos') {
      cargarGraficos();
    }
  }, [subTab]);

  const cargarResumen = async () => {
    try {
      const [resPedidos, resAlertas] = await Promise.all([
        api.get('/pedidos/calendario'),
        api.get('/stock/alertas')
      ]);

      const pedidos = resPedidos.data.eventos || [];
      const alertas = resAlertas.data.alertas || [];

      const pendientes = pedidos.filter(p => p.estado_pedido === 'PENDIENTE').length;
      const ventasExitosas = pedidos.filter(p => p.estado_pedido === 'FACTURADO' || p.estado_pedido === 'DESPACHADO');
      const montoTotal = ventasExitosas.reduce((acc, p) => acc + parseFloat(p.monto_total), 0);
      const bajoStock = alertas.length;

      setResumen({
        pedidosPendientes: pendientes,
        montoTotalVentas: montoTotal,
        productosBajoStock: bajoStock
      });

    } catch (error) {
      console.error("Error al cargar el resumen del dashboard", error);
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
      console.error("Error al cargar gráficos de facturación", error);
    } finally {
      setCargandoGraficos(false);
    }
  };

  if (cargando) return <div className="text-slate-500 font-medium">Cargando métricas de la empresa...</div>;

  return (
    <div className="space-y-6">
      
      {/* Mensaje de bienvenida con selector de pestañas internas */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-indigo-50/50 to-white">
        <div>
          <h2 className="text-2xl font-bold text-blue-950">¡Hola de nuevo, {usuario.nombre}! 👋</h2>
          <p className="text-slate-500 mt-1 text-sm">
            Panel de control ejecutivo y análisis de ventas. Tienes <span className="font-bold text-indigo-600">{resumen.pedidosPendientes} pedidos</span> esperando atención.
          </p>
        </div>

        {/* Pestañas disponibles solo desde esta pantalla */}
        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setSubTab('resumen')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'resumen' 
                ? 'bg-white text-indigo-600 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingCart size={15} />
            <span>Resumen Operativo</span>
          </button>

          <button
            onClick={() => setSubTab('graficos')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              subTab === 'graficos' 
                ? 'bg-white text-blue-950 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 size={15} className="text-indigo-600" />
            <span>Gráficos de Facturación</span>
          </button>
        </div>
      </div>

      {/* SUB-PESTAÑA 1: RESUMEN GENERAL OPERATIVO */}
      {subTab === 'resumen' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Tarjeta 1: Ventas */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
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
              <div className="mt-4 flex items-center text-sm text-emerald-600 font-medium">
                <ArrowUpRight size={16} className="mr-1" />
                <span>Basado en pedidos facturados</span>
              </div>
            </div>

            {/* Tarjeta 2: Pedidos Pendientes */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pendientes de Facturar</p>
                  <h3 className="text-3xl font-bold text-blue-950 mt-2">{resumen.pedidosPendientes}</h3>
                </div>
                <div className="p-3 bg-yellow-100 text-yellow-600 rounded-xl">
                  <Clock size={24} />
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-500">
                Requieren atención inmediata
              </div>
            </div>

            {/* Tarjeta 3: Alertas de Stock */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alertas de Stock</p>
                  <h3 className="text-3xl font-bold text-blue-950 mt-2">{resumen.productosBajoStock}</h3>
                </div>
                <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                  <Package size={24} />
                </div>
              </div>
              <div className="mt-4 text-sm text-slate-500">
                Productos por debajo de su stock mínimo
              </div>
            </div>

          </div>
        </div>
      )}

      {/* SUB-PESTAÑA 2: 4 GRÁFICOS DE FACTURACIÓN (Semanal, Mensual, Trimestral, Anual) */}
      {subTab === 'graficos' && (
        <div className="space-y-6">

          {cargandoGraficos || !datosGraficos ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 font-medium">
              Cargando series de facturación semanal, mensual, trimestral y anual...
            </div>
          ) : (
            <>
              {/* Banner de Resumen de Facturación */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">Métricas consolidadas de facturación y evolución de ventas</span>
                <button
                  onClick={cargarGraficos}
                  disabled={cargandoGraficos}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs"
                >
                  <RefreshCw size={13} className={cargandoGraficos ? 'animate-spin text-indigo-600' : 'text-slate-500'} />
                  <span>Actualizar Gráficos</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Facturado Histórico</p>
                    <h3 className="text-2xl font-bold text-blue-950 mt-1">
                      S/ {datosGraficos.resumen.totalHistorico.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-3 bg-blue-50 text-blue-900 rounded-xl">
                    <TrendingUp size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Promedio Mensual Estimado</p>
                    <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                      S/ {Number(datosGraficos.resumen.promedioMensual).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <CalendarDays size={22} />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comprobantes Electrónicos</p>
                    <h3 className="text-2xl font-bold text-indigo-600 mt-1">
                      {datosGraficos.resumen.totalComprobantes} emitidos
                    </h3>
                  </div>
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                    <DollarSign size={22} />
                  </div>
                </div>
              </div>

              {/* Grid con los 4 Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Facturación Semanal */}
                <GraficoBarras 
                  titulo="Facturación Semanal"
                  subtitulo="Días en esta semana (Lunes a Domingo)"
                  datos={datosGraficos.graficos.semanal}
                  keyEtiqueta="etiqueta"
                  keyTotal="total"
                  colorPrimario="indigo"
                />

                {/* 2. Facturación Mensual */}
                <GraficoBarras 
                  titulo="Facturación Mensual"
                  subtitulo="Semanas en este mes"
                  datos={datosGraficos.graficos.mensual}
                  keyEtiqueta="etiqueta"
                  keyTotal="total"
                  colorPrimario="emerald"
                />

                {/* 3. Facturación Trimestral */}
                <GraficoBarras 
                  titulo="Facturación Trimestral"
                  subtitulo="Trimestres del Año (T1 a T4)"
                  datos={datosGraficos.graficos.trimestral}
                  keyEtiqueta="trimestre"
                  keyTotal="total"
                  colorPrimario="blue"
                />

                {/* 4. Facturación Anual */}
                <GraficoBarras 
                  titulo="Facturación Anual"
                  subtitulo="Evolución Interanual"
                  datos={datosGraficos.graficos.anual}
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