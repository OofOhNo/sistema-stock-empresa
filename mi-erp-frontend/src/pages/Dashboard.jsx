import React, { useState, useEffect } from 'react';
import api from '../api';
import { DollarSign, ShoppingCart, Package, ArrowUpRight, Clock } from 'lucide-react';

export default function Dashboard({ usuario }) {
  const [resumen, setResumen] = useState({
    pedidosPendientes: 0,
    montoTotalVentas: 0,
    productosBajoStock: 0
  });
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarResumen();
  }, []);

  const cargarResumen = async () => {
    try {
      //como esto es un resumen, hacemos 2 llamadas rapidas en paralelo
      const [resPedidos, resStock] = await Promise.all([
        api.get('/pedidos/calendario'),
        api.get('/stock')
      ]);

      const pedidos = resPedidos.data.eventos;
      const stock = resStock.data.datos;

      //calculamos las estadisticas
      const pendientes = pedidos.filter(p => p.estado_pedido === 'PENDIENTE').length;
      
      //sumamos el monto total de los pedidos facturados o despachados
      const ventasExitosas = pedidos.filter(p => p.estado_pedido === 'FACTURADO' || p.estado_pedido === 'DESPACHADO');
      const montoTotal = ventasExitosas.reduce((acc, p) => acc + parseFloat(p.monto_total), 0);

      //calculamos si hay productos con bajo stock disponible (menos de 5 unidades)
      const bajoStock = stock.filter(item => {
        const disponible = item.cantidad_disponible ?? item.total_disponible;
        return disponible < 5; //consideramos "bajo stock" si hay menos de 5 disponibles
      }).length;

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

  if (cargando) return <div className="text-slate-500 font-medium">Cargando métricas de la empresa...</div>;

  return (
    <div className="space-y-6">
      
      {/* mensaje de bienvenida */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">¡Hola de nuevo, {usuario.nombre}! 👋</h2>
          <p className="text-slate-500 mt-2">Aquí tienes el resumen operativo de hoy. Tienes <span className="font-bold text-indigo-600">{resumen.pedidosPendientes} pedidos</span> esperando para ser facturados.</p>
        </div>
        <div className="hidden md:block">
           <div className="bg-white p-3 rounded-full shadow-sm border border-slate-100">
             <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-lg uppercase">
               {usuario.nombre.substring(0, 2)}
             </div>
           </div>
        </div>
      </div>

      {/* tarjetas de metricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* tarjeta 1: ventas */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Ventas Confirmadas</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">${resumen.montoTotalVentas.toFixed(2)}</h3>
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

        {/* tarjeta 2: pedidos pendientes */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Pendientes de Facturar</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">{resumen.pedidosPendientes}</h3>
            </div>
            <div className="p-3 bg-yellow-100 text-yellow-600 rounded-xl">
              <Clock size={24} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            Requieren atención inmediata
          </div>
        </div>

        {/* tarjeta 3: alertas de stock */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Alertas de Stock</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">{resumen.productosBajoStock}</h3>
            </div>
            <div className="p-3 bg-red-100 text-red-600 rounded-xl">
              <Package size={24} />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            Productos con menos de 5 disponibles
          </div>
        </div>

      </div>
    </div>
  );
}