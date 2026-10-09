import React, { useState, useEffect } from 'react';
import api from '../api';
import { ShoppingCart, Calendar, CheckCircle, FileText, Plus, ArrowLeft, Trash2, XCircle, User, Filter } from 'lucide-react';

export default function Pedidos({ usuario }) { // <--- AHORA RECIBE EL USUARIO
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [facturando, setFacturando] = useState(null);
  const [cancelando, setCancelando] = useState(null);

  const [vista, setVista] = useState('lista');
  const [filtro, setFiltro] = useState('todos'); // NUEVO: 'todos' o 'semana'
  
  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [fechaLimite, setFechaLimite] = useState('');
  const [items, setItems] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [guardandoPedido, setGuardandoPedido] = useState(false);

  useEffect(() => {
    cargarPedidos();
  }, []);

  const cargarPedidos = async () => {
    setCargando(true);
    try {
      const respuesta = await api.get('/pedidos/calendario');
      setPedidos(respuesta.data.eventos);
    } catch (err) {
      setError('No se pudieron cargar los pedidos.');
    } finally {
      setCargando(false);
    }
  };

  const abrirFormularioNuevo = async () => {
    setVista('nuevo');
    if (productosDisponibles.length === 0) {
      try {
        const res = await api.get('/stock');
        const productosUnicos = res.data.datos.filter((v, i, a) => a.findIndex(t => (t.id_producto === v.id_producto)) === i);
        setProductosDisponibles(productosUnicos);
        if (productosUnicos.length > 0) setProductoSeleccionado(productosUnicos[0].id_producto);
      } catch (err) {
        console.error("Error cargando productos", err);
      }
    }
  };

  const agregarAlCarrito = () => {
    const producto = productosDisponibles.find(p => p.id_producto.toString() === productoSeleccionado.toString());
    if (!producto) return;
    const nuevoItem = {
      id_producto: producto.id_producto,
      nombre: producto.nombre_producto,
      precio_unitario: producto.precio_venta,
      cantidad: parseInt(cantidad)
    };
    setItems([...items, nuevoItem]);
    setCantidad(1);
  };

  const quitarDelCarrito = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const enviarNuevoPedido = async (e) => {
    e.preventDefault();
    if (items.length === 0) return alert('Debes agregar al menos un producto al pedido.');
    
    setGuardandoPedido(true);
    try {
      await api.post('/pedidos', {
        id_cliente: 1,
        id_sucursal: usuario?.id_sucursal || 1, 
        id_usuario: usuario?.id_usuario || 1, // <--- REGISTRAMOS QUIEN LO CREO
        fecha_limite_despacho: fechaLimite,   // viene sin hora (YYYY-MM-DD)
        items: items
      });
      alert('¡Pedido creado y stock reservado con éxito!');
      setItems([]);
      setFechaLimite('');
      setVista('lista');
      cargarPedidos(); 
    } catch (err) {
      alert('Error al crear el pedido: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardandoPedido(false);
    }
  };

  const emitirFactura = async (idPedido) => {
    setFacturando(idPedido);
    try {
      const respuesta = await api.post('/facturacion/emitir', { id_pedido: idPedido, tipo_comprobante: '01' });
      if (respuesta.data.exito) {
        alert('¡Factura emitida exitosamente!');
        cargarPedidos();
      }
    } catch (err) {
      alert('Error al emitir: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setFacturando(null);
    }
  };

  const cancelarPedido = async (idPedido) => {
    if (!window.confirm('¿Estás segura de que deseas cancelar este pedido? Se liberará el stock.')) return;
    setCancelando(idPedido);
    try {
      const respuesta = await api.put(`/pedidos/${idPedido}/cancelar`);
      if (respuesta.data.exito) {
        alert('Pedido cancelado exitosamente.');
        cargarPedidos();
      }
    } catch (err) {
      alert('Error al cancelar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCancelando(null);
    }
  };

  // NUEVO: formato de fecha limpio SIN HORA
  const formatearFecha = (fechaISO) => {
    const opciones = { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' };
    return new Date(fechaISO).toLocaleDateString('es-ES', opciones);
  };

  const colorEstado = (estado) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'FACTURADO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'DESPACHADO': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'CANCELADO': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // NUEVO: logica matematica para filtrar por semana actual
  const pedidosMostrados = pedidos.filter(pedido => {
    if (filtro === 'todos') return true;
    
    // si el filtro es 'semana', solo mostrar los PENDIENTES de esta semana
    if (pedido.estado_pedido !== 'PENDIENTE') return false;
    
    const fechaPedido = new Date(pedido.fecha_limite_despacho);
    const hoy = new Date();
    
    //calcular Lunes y Domingo de esta semana
    const diaSemana = hoy.getDay() || 7; 
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1);
    lunes.setHours(0,0,0,0);
    
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23,59,59,999);
    
    return fechaPedido >= lunes && fechaPedido <= domingo;
  });

  if (cargando && vista === 'lista') return <div className="text-slate-500 font-medium">Cargando calendario...</div>;
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl">{error}</div>;

  return (
    <div className="space-y-6">
      
      {/* CABECERA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {vista === 'lista' ? 'Calendario de Pedidos' : 'Crear Nuevo Pedido'}
            </h1>
            <p className="text-slate-500 text-sm">
              {vista === 'lista' ? 'Gestión de despachos y facturación' : 'Registra un pedido a tu nombre'}
            </p>
          </div>
        </div>

        {vista === 'lista' ? (
          <button onClick={abrirFormularioNuevo} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 shadow-lg shadow-indigo-600/30">
            <Plus size={18} />
            <span>Nuevo Pedido</span>
          </button>
        ) : (
          <button onClick={() => setVista('lista')} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2">
            <ArrowLeft size={18} />
            <span>Volver a la lista</span>
          </button>
        )}
      </div>

      {/* VISTA 1: NUEVO PEDIDO */}
      {vista === 'nuevo' && (
        <form onSubmit={enviarNuevoPedido} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Cliente</label>
              <input type="text" disabled value="Empresa Cliente SAC" className="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Día de Despacho (Sin hora)</label>
              {/* NUEVO TIPO DE INPUT: DATE */}
              <input 
                type="date" 
                required 
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500" 
              />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Productos</h3>
            <div className="flex space-x-4 mb-6">
              <div className="flex-1">
                <select value={productoSeleccionado} onChange={(e) => setProductoSeleccionado(e.target.value)} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                  {productosDisponibles.map(p => (
                    <option key={p.id_producto} value={p.id_producto}>{p.nombre_producto} - ${parseFloat(p.precio_venta).toFixed(2)}</option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <button type="button" onClick={agregarAlCarrito} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-medium">
                Agregar
              </button>
            </div>

            {items.length > 0 ? (
              <table className="w-full text-left bg-slate-50 rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-slate-100 text-slate-500 text-xs uppercase border-b border-slate-200">
                    <th className="p-3 font-semibold">Producto</th>
                    <th className="p-3 font-semibold text-center">Cant.</th>
                    <th className="p-3 font-semibold text-right">P. Unit.</th>
                    <th className="p-3 font-semibold text-right">Subtotal</th>
                    <th className="p-3 font-semibold text-center">Quitar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {items.map((item, index) => (
                    <tr key={index}>
                      <td className="p-3 font-medium text-slate-700">{item.nombre}</td>
                      <td className="p-3 text-center">{item.cantidad}</td>
                      <td className="p-3 text-right">${parseFloat(item.precio_unitario).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold">${(item.cantidad * parseFloat(item.precio_unitario)).toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <button type="button" onClick={() => quitarDelCarrito(index)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-slate-400 py-4 text-sm">Aún no has agregado productos.</div>
            )}
          </div>
          <div className="flex justify-end pt-4">
            <button type="submit" disabled={guardandoPedido || items.length === 0} className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-8 py-3 rounded-xl font-bold">
              {guardandoPedido ? 'Guardando...' : 'Guardar Pedido'}
            </button>
          </div>
        </form>
      )}

      {/* VISTA 2: LISTA DE PEDIDOS */}
      {vista === 'lista' && (
        <div className="space-y-4">
          
          {/* NUEVO: SELECTOR DE TABS */}
          <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
            <button 
              onClick={() => setFiltro('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filtro === 'todos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Todos los pedidos
            </button>
            <button 
              onClick={() => setFiltro('semana')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtro === 'semana' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Filter size={14} className="mr-1"/>
              Pendientes de la semana
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">ID</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold">Vendedor</th> {/* NUEVA COLUMNA */}
                  <th className="p-4 font-semibold">Día de Despacho</th>
                  <th className="p-4 font-semibold text-right">Total</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pedidosMostrados.map((pedido) => (
                  <tr key={pedido.id_pedido} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-900">#{pedido.id_pedido}</td>
                    <td className="p-4 font-medium text-slate-700">{pedido.cliente}</td>
                    
                    {/* NUEVO: DATO DEL VENDEDOR */}
                    <td className="p-4 text-slate-600">
                      <div className="flex items-center space-x-2">
                        <User size={14} className="text-slate-400" />
                        <span>{pedido.creador || 'Sistema'}</span>
                      </div>
                    </td>

                    <td className="p-4 text-slate-700">
                      <div className="flex items-center space-x-2">
                        <Calendar size={14} className="text-slate-400" />
                        <span>{formatearFecha(pedido.fecha_limite_despacho)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium text-slate-900">${parseFloat(pedido.monto_total).toFixed(2)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${colorEstado(pedido.estado_pedido)}`}>{pedido.estado_pedido}</span>
                    </td>
                    <td className="p-4 text-center">
                      {pedido.estado_pedido === 'PENDIENTE' ? (
                        <div className="flex items-center justify-center space-x-2">
                          <button onClick={() => emitirFactura(pedido.id_pedido)} disabled={facturando === pedido.id_pedido || cancelando === pedido.id_pedido} className="inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-lg text-xs font-medium">
                            <FileText size={14} />
                            <span>{facturando === pedido.id_pedido ? '...' : 'Facturar'}</span>
                          </button>
                          <button onClick={() => cancelarPedido(pedido.id_pedido)} disabled={cancelando === pedido.id_pedido || facturando === pedido.id_pedido} className="inline-flex items-center space-x-1 bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium">
                            <XCircle size={14} />
                            <span>{cancelando === pedido.id_pedido ? '...' : 'Cancelar'}</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs font-medium">
                          {pedido.estado_pedido === 'CANCELADO' ? 'Cancelado' : 'Ya procesado'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pedidosMostrados.length === 0 && (
              <div className="p-12 text-center flex flex-col items-center">
                <CheckCircle size={48} className="text-emerald-400 mb-4" />
                <h3 className="text-lg font-bold text-slate-700">Todo limpio</h3>
                <p className="text-slate-500 mt-1">No hay pedidos que coincidan con este filtro.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}