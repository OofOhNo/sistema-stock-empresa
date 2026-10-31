import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  Truck, CheckCircle, Clock, PackageCheck, Tag, ShieldCheck,
  Search, RefreshCw, Calendar, User, Phone
} from 'lucide-react';

export default function Despacho({ usuario }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('LISTO_DESPACHO');
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState(null);

  const esAdminCentral = usuario?.rol === 'Admin Central';
  const puedeEditarPedidos =
    esAdminCentral || usuario?.permisos?.pedidos?.puede_editar === true;
  const esProduccion = usuario?.area === 'PRODUCCION';

  useEffect(() => {
    cargarPedidos();
  }, []);

  const cargarPedidos = async () => {
    setCargando(true);
    try {
      const res = await api.get('/pedidos/calendario');
      setPedidos((res.data.eventos || []).filter(p => p.estado_pedido !== 'CANCELADO'));
    } catch (err) {
      toast.error('No se pudieron cargar los pedidos: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargando(false);
    }
  };

  const marcarListo = async (idPedido) => {
    setProcesando(idPedido);
    try {
      const res = await api.put(`/pedidos/${idPedido}/listo-despacho`);
      toast.success(res.data.mensaje || '¡Pedido marcado como listo para salir!');
      cargarPedidos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cambiar el estado.');
    } finally {
      setProcesando(null);
    }
  };

  const marcarDespachado = async (idPedido) => {
    setProcesando(idPedido);
    try {
      const res = await api.put(`/pedidos/${idPedido}/despachar`);
      toast.success(res.data.mensaje || '¡Pedido entregado / despachado con éxito!');
      cargarPedidos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo marcar como despachado.');
    } finally {
      setProcesando(null);
    }
  };

  const formatearFechaYHoraDespacho = (fechaISO) => {
    if (!fechaISO) return { fechaStr: '-', horaStr: null };
    const dateObj = new Date(fechaISO);
    const fechaAjustada = esProduccion
      ? new Date(dateObj.getTime() - 60 * 60 * 1000)
      : dateObj;

    const fechaStr = fechaAjustada.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const tieneHora = !(dateObj.getUTCHours() === 0 && dateObj.getUTCMinutes() === 0 && dateObj.getUTCSeconds() === 0);
    const horaStr = fechaAjustada.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      fechaStr,
      horaStr: tieneHora ? horaStr : null
    };
  };

  const esListoParaSalir = (p) =>
    p.estado_pedido === 'LISTO_DESPACHO' || (p.estado_pedido === 'FACTURADO' && !p.despachado_en);
  const esYaEntregado = (p) =>
    p.estado_pedido === 'DESPACHADO' || Boolean(p.despachado_en);

  const pedidosFiltrados = pedidos.filter(p => {
    if (filtroEstado === 'LISTO_DESPACHO' && !esListoParaSalir(p)) return false;
    if (filtroEstado === 'PENDIENTE' && p.estado_pedido !== 'PENDIENTE') return false;
    if (filtroEstado === 'DESPACHADO' && !esYaEntregado(p)) return false;

    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase();
      return (
        String(p.id_pedido).includes(q) ||
        (p.cliente || '').toLowerCase().includes(q) ||
        (p.ruc_cliente || '').toLowerCase().includes(q) ||
        (p.contacto || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalListos = pedidos.filter(esListoParaSalir).length;
  const totalPendientes = pedidos.filter(p => p.estado_pedido === 'PENDIENTE').length;
  const totalDespachados = pedidos.filter(esYaEntregado).length;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
            <Truck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Pedidos Listos para Despacho</h1>
            <p className="text-sm text-slate-500">
              Revisa qué pedidos ya están terminados para salir y márcalos cuando se entreguen
            </p>
          </div>
        </div>

        <button
          onClick={cargarPedidos}
          disabled={cargando}
          className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer w-max"
          title="Actualizar lista"
        >
          <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Listos para Salir</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{totalListos}</h3>
            <span className="text-[11px] text-slate-400">Terminados esperando entrega</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <PackageCheck size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">En Preparación</p>
            <h3 className="text-2xl font-bold text-blue-950 mt-1">{totalPendientes}</h3>
            <span className="text-[11px] text-slate-400">Falta empacar o etiquetar</span>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
            <Clock size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ya Entregados</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{totalDespachados}</h3>
            <span className="text-[11px] text-slate-400">Despachados con éxito</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle size={24} />
          </div>
        </div>
      </div>

      {/* FILTROS Y BUSCADOR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroEstado('LISTO_DESPACHO')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
              filtroEstado === 'LISTO_DESPACHO'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <PackageCheck size={14} />
            <span>Listos para salir ({totalListos})</span>
          </button>
          <button
            onClick={() => setFiltroEstado('PENDIENTE')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
              filtroEstado === 'PENDIENTE'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock size={14} />
            <span>En preparación ({totalPendientes})</span>
          </button>
          <button
            onClick={() => setFiltroEstado('DESPACHADO')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer ${
              filtroEstado === 'DESPACHADO'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Truck size={14} />
            <span>Entregados ({totalDespachados})</span>
          </button>
          <button
            onClick={() => setFiltroEstado('TODOS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              filtroEstado === 'TODOS'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({pedidos.length})
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número o cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando pedidos...</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No hay pedidos en esta sección</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-5">Pedido</th>
                  <th className="py-4 px-5">Cliente y Contacto</th>
                  <th className="py-4 px-5">Fecha y Hora</th>
                  <th className="py-4 px-5 text-center">Etiquetado</th>
                  <th className="py-4 px-5 text-center">Sellado al Vacío</th>
                  <th className="py-4 px-5 text-right">Total</th>
                  <th className="py-4 px-5 text-center">Estado</th>
                  {puedeEditarPedidos && (
                    <th className="py-4 px-5 text-right">Acción</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pedidosFiltrados.map((pedido) => {
                  const listo = esListoParaSalir(pedido);
                  const entregado = esYaEntregado(pedido);
                  return (
                    <tr
                      key={pedido.id_pedido}
                      className={`transition-colors ${
                        listo ? 'bg-amber-50/70 hover:bg-amber-100/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-4 px-5">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-xs">
                          #{pedido.id_pedido}
                        </span>
                      </td>

                      <td className="py-4 px-5">
                        <div className="font-bold text-slate-800">{pedido.cliente}</div>
                        {pedido.nombre_comercial && (
                          <div className="text-xs text-indigo-600 font-medium">{pedido.nombre_comercial}</div>
                        )}
                        <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1">
                          {pedido.contacto && (
                            <span className="flex items-center space-x-1">
                              <User size={12} />
                              <span>{pedido.contacto}</span>
                            </span>
                          )}
                          {pedido.celular && (
                            <span className="flex items-center space-x-1 font-mono text-slate-600">
                              <Phone size={12} className="text-emerald-600" />
                              <span>{pedido.celular}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-5 text-slate-600 text-xs">
                        {(() => {
                          const { fechaStr, horaStr } = formatearFechaYHoraDespacho(pedido.fecha_limite_despacho);
                          return (
                            <div>
                              <div className="flex items-center space-x-1.5 font-medium text-slate-700">
                                <Calendar size={14} className="text-slate-400" />
                                <span>{fechaStr}</span>
                              </div>
                              {horaStr && (
                                <div className="flex items-center space-x-1.5 mt-1 font-bold text-slate-900">
                                  <Clock size={13} className="text-indigo-500" />
                                  <span className="font-mono">{horaStr}</span>
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400 mt-0.5">Sede: {pedido.ubicacion || 'Central'}</div>
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-4 px-5 text-center">
                        {pedido.etiquetado ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Tag size={12} className="mr-1" />
                            Sí
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-slate-400 bg-slate-100">
                            No
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-center">
                        {pedido.sellado_vacio ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            <ShieldCheck size={12} className="mr-1" />
                            Sí (Al Vacío)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-slate-400 bg-slate-100">
                            Normal
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-right font-mono font-bold text-slate-900">
                        S/ {parseFloat(pedido.monto_total || 0).toFixed(2)}
                      </td>

                      <td className="py-4 px-5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                            entregado
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : listo
                                ? 'bg-amber-300 text-amber-950 border-amber-500'
                                : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          }`}>
                            {entregado ? 'Entregado' : listo ? 'Listo para salir' : 'En preparación'}
                          </span>
                          {pedido.tiene_factura && (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                              Facturado
                            </span>
                          )}
                        </div>
                      </td>

                      {puedeEditarPedidos && (
                        <td className="py-4 px-5 text-right">
                          {pedido.estado_pedido === 'PENDIENTE' && (
                            <button
                              onClick={() => marcarListo(pedido.id_pedido)}
                              disabled={procesando === pedido.id_pedido}
                              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-colors inline-flex items-center space-x-1 cursor-pointer"
                            >
                              <PackageCheck size={14} />
                              <span>{procesando === pedido.id_pedido ? '...' : 'Marcar Listo'}</span>
                            </button>
                          )}

                          {listo && !entregado && (
                            <button
                              onClick={() => marcarDespachado(pedido.id_pedido)}
                              disabled={procesando === pedido.id_pedido}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-colors inline-flex items-center space-x-1 cursor-pointer"
                            >
                              <Truck size={14} />
                              <span>{procesando === pedido.id_pedido ? '...' : 'Entregar Ahora'}</span>
                            </button>
                          )}

                          {entregado && (
                            <span className="text-emerald-600 text-xs font-bold inline-flex items-center space-x-1">
                              <CheckCircle size={14} />
                              <span>Ya entregado</span>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
