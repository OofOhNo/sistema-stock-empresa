import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { 
  ShoppingCart, Calendar, CheckCircle, FileText, Plus, ArrowLeft, 
  Trash2, XCircle, User, Filter, Tag, ShieldCheck, PackageCheck, Truck, Clock 
} from 'lucide-react';

export default function Pedidos({ usuario }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [facturando, setFacturando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [procesandoDespacho, setProcesandoDespacho] = useState(null);

  const [vista, setVista] = useState('lista');
  const [filtro, setFiltro] = useState('todos'); // 'todos', 'semana', 'listos'
  
  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [clientesDisponibles, setClientesDisponibles] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [items, setItems] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [solicitadoPor, setSolicitadoPor] = useState('');
  const [etiquetado, setEtiquetado] = useState(false);
  const [selladoVacio, setSelladoVacio] = useState(false);
  const [guardandoPedido, setGuardandoPedido] = useState(false);

  useEffect(() => {
    cargarPedidos();
  }, []);

  const cargarPedidos = async () => {
    setCargando(true);
    try {
      const respuesta = await api.get('/pedidos/calendario');
      setPedidos(respuesta.data.eventos || []);
    } catch (err) {
      setError('No se pudieron cargar los pedidos.');
    } finally {
      setCargando(false);
    }
  };

  const abrirFormularioNuevo = async () => {
    setVista('nuevo');
    try {
      // Cargar productos con stock disponible
      const [resStock, resClientes] = await Promise.all([
        api.get('/stock'),
        api.get('/clientes')
      ]);

      const productosUnicos = (resStock.data.datos || []).filter(
        (v, i, a) => a.findIndex(t => t.id_producto === v.id_producto) === i
      );
      setProductosDisponibles(productosUnicos);
      if (productosUnicos.length > 0 && !productoSeleccionado) {
        setProductoSeleccionado(productosUnicos[0].id_producto);
      }

      const clientes = resClientes.data.datos || [];
      setClientesDisponibles(clientes);
      if (clientes.length > 0 && !clienteSeleccionado) {
        setClienteSeleccionado(clientes[0].id_cliente);
      }
    } catch (err) {
      console.error("Error cargando datos para el formulario de pedidos", err);
      toast.error('Error al cargar catálogo de productos o clientes.');
    }
  };

  const agregarAlCarrito = () => {
    const producto = productosDisponibles.find(p => p.id_producto.toString() === productoSeleccionado.toString());
    if (!producto) return;

    const disponible = producto.cantidad_disponible ?? producto.total_disponible ?? 0;
    if (disponible < parseInt(cantidad)) {
      return toast.error(`Stock insuficiente. Solo hay ${disponible} unidades disponibles para este producto.`);
    }

    const nuevoItem = {
      id_producto: producto.id_producto,
      nombre: producto.nombre_producto || producto.nombre,
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
    if (items.length === 0) return toast.error('Debes agregar al menos un producto al pedido.');
    if (!clienteSeleccionado) return toast.error('Debes seleccionar un cliente.');

    setGuardandoPedido(true);
    try {
      await api.post('/pedidos', {
        id_cliente: Number(clienteSeleccionado),
        id_ubicacion: usuario?.id_ubicacion || 1, 
        id_usuario: usuario?.id_usuario, 
        fecha_limite_despacho: fechaLimite,
        items: items,
        solicitado_por: solicitadoPor || null,
        etiquetado: Boolean(etiquetado),
        sellado_vacio: Boolean(selladoVacio)
      });
      toast.success('¡Pedido creado y stock reservado con éxito!');
      setItems([]);
      setFechaLimite('');
      setSolicitadoPor('');
      setEtiquetado(false);
      setSelladoVacio(false);
      setVista('lista');
      cargarPedidos(); 
    } catch (err) {
      toast.error('Error al crear el pedido: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardandoPedido(false);
    }
  };

  const marcarListoDespacho = async (idPedido) => {
    setProcesandoDespacho(idPedido);
    try {
      await api.put(`/pedidos/${idPedido}/listo-despacho`);
      toast.success('Pedido marcado como listo para despacho.');
      cargarPedidos();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesandoDespacho(null);
    }
  };

  const emitirFactura = async (idPedido) => {
    setFacturando(idPedido);
    try {
      const respuesta = await api.post('/facturacion/emitir', { id_pedido: idPedido, tipo_comprobante: '01' });
      if (respuesta.data.exito) {
        toast.success('¡Factura emitida exitosamente!');
        cargarPedidos();
      }
    } catch (err) {
      toast.error('Error al emitir: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setFacturando(null);
    }
  };

  const cancelarPedido = async (idPedido) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium">¿Estás segura de que deseas cancelar este pedido? Se liberará el stock reservado.</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => { toast.dismiss(t.id); ejecutarCancelacion(idPedido); }}
            className="bg-red-500 text-white px-3 py-1 rounded-lg text-xs font-bold"
          >
            Sí, cancelar
          </button>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="bg-slate-200 text-slate-800 px-3 py-1 rounded-lg text-xs font-bold"
          >
            No
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const ejecutarCancelacion = async (idPedido) => {
    setCancelando(idPedido);
    try {
      const respuesta = await api.put(`/pedidos/${idPedido}/cancelar`);
      if (respuesta.data.exito) {
        toast.success('Pedido cancelado exitosamente.');
        cargarPedidos();
      }
    } catch (err) {
      toast.error('Error al cancelar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCancelando(null);
    }
  };

  const esProduccion = usuario?.area === 'PRODUCCION';

  const formatearFechaYHoraDespacho = (fechaISO) => {
    if (!fechaISO) return { fechaStr: '-', horaStr: null, esProduccion };
    const dateObj = new Date(fechaISO);
    
    // Regla de Negocio: Personal de producción ve 1 hora menos para despacho
    const fechaAjustada = esProduccion 
      ? new Date(dateObj.getTime() - 60 * 60 * 1000) 
      : dateObj;

    const fechaStr = fechaAjustada.toLocaleDateString('es-ES', { 
      day: '2-digit', month: 'short', year: 'numeric' 
    });

    const tieneHora = !(dateObj.getUTCHours() === 0 && dateObj.getUTCMinutes() === 0 && dateObj.getUTCSeconds() === 0);
    const horaStr = fechaAjustada.toLocaleTimeString('es-ES', { 
      hour: '2-digit', minute: '2-digit' 
    });

    return {
      fechaStr,
      horaStr: tieneHora ? horaStr : null,
      esProduccion
    };
  };

  const colorEstado = (estado) => {
    switch (estado) {
      case 'PENDIENTE': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'LISTO_DESPACHO': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'FACTURADO': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DESPACHADO': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'CANCELADO': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const pedidosMostrados = pedidos.filter(pedido => {
    if (filtro === 'todos') return true;
    if (filtro === 'listos') return pedido.estado_pedido === 'LISTO_DESPACHO';
    
    // Filtro 'semana': pedidos pendientes cuya fecha cae en esta semana
    if (pedido.estado_pedido !== 'PENDIENTE') return false;
    const fechaPedido = new Date(pedido.fecha_limite_despacho);
    const hoy = new Date();
    const diaSemana = hoy.getDay() || 7; 
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1);
    lunes.setHours(0,0,0,0);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23,59,59,999);
    return fechaPedido >= lunes && fechaPedido <= domingo;
  });

  const totalMontoCarrito = items.reduce((acc, it) => acc + (it.cantidad * parseFloat(it.precio_unitario)), 0);

  if (cargando && vista === 'lista' && pedidos.length === 0) {
    return <div className="text-slate-500 font-medium p-8">Cargando pedidos...</div>;
  }
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl m-8">{error}</div>;

  return (
    <div className="space-y-6">
      
      {/* CABECERA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">
              {vista === 'lista' ? 'Calendario y Gestión de Pedidos' : 'Crear Nuevo Pedido'}
            </h1>
            <p className="text-slate-500 text-sm">
              {vista === 'lista' ? 'Control de órdenes, etiquetado, sellado al vacío y despacho' : 'Registra un pedido a tu nombre y reserva el stock'}
            </p>
          </div>
        </div>

        {vista === 'lista' ? (
          <button 
            onClick={abrirFormularioNuevo} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition-colors"
          >
            <Plus size={18} />
            <span>Nuevo Pedido</span>
          </button>
        ) : (
          <button 
            onClick={() => setVista('lista')} 
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Volver a la lista</span>
          </button>
        )}
      </div>

      {/* VISTA 1: FORMULARIO NUEVO PEDIDO */}
      {vista === 'nuevo' && (
        <form onSubmit={enviarNuevoPedido} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6 max-w-4xl">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Selección de Cliente */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Cliente *</label>
              <select
                required
                value={clienteSeleccionado}
                onChange={(e) => setClienteSeleccionado(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500"
              >
                {clientesDisponibles.map(c => (
                  <option key={c.id_cliente} value={c.id_cliente}>
                    {c.razon_social_o_nombre} ({c.numero_documento})
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha y Hora límite de despacho */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Fecha y Hora de Despacho *
              </label>
              <input 
                type="datetime-local" 
                required 
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500 font-mono" 
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Hora de entrega pactada (Producción ve 1h previa).
              </span>
            </div>

            {/* Solicitado por */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Solicitado por (Opcional)</label>
              <input 
                type="text" 
                placeholder="Persona o vendedor solicitante"
                value={solicitadoPor}
                onChange={(e) => setSolicitadoPor(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500" 
              />
            </div>

          </div>

          {/* REGLAS DE NEGOCIO: CHECK ETIQUETADO Y SELLADO AL VACIO */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Especificaciones de Producción y Empaque
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <label className={`flex items-center space-x-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                etiquetado ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-white border-slate-200 text-slate-700'
              }`}>
                <input 
                  type="checkbox" 
                  checked={etiquetado} 
                  onChange={(e) => setEtiquetado(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div className="flex items-center space-x-2">
                  <Tag size={18} className={etiquetado ? 'text-emerald-600' : 'text-slate-400'} />
                  <div>
                    <span className="font-bold text-sm">Requiere Etiquetado</span>
                    <p className="text-xs text-slate-500">Colocar etiquetas de lote y marca del cliente</p>
                  </div>
                </div>
              </label>

              <label className={`flex items-center space-x-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                selladoVacio ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-white border-slate-200 text-slate-700'
              }`}>
                <input 
                  type="checkbox" 
                  checked={selladoVacio} 
                  onChange={(e) => setSelladoVacio(e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <div className="flex items-center space-x-2">
                  <ShieldCheck size={18} className={selladoVacio ? 'text-blue-600' : 'text-slate-400'} />
                  <div>
                    <span className="font-bold text-sm">Requiere Sellado al Vacío</span>
                    <p className="text-xs text-slate-500">Empaque hermético para preservación extendida</p>
                  </div>
                </div>
              </label>

            </div>
          </div>

          {/* SECCIÓN DE PRODUCTOS */}
          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Productos a Solicitar</h3>
            
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
              <div className="flex-1">
                <select 
                  value={productoSeleccionado} 
                  onChange={(e) => setProductoSeleccionado(e.target.value)} 
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                >
                  {productosDisponibles.map(p => (
                    <option key={p.id_producto} value={p.id_producto}>
                      {p.nombre_producto || p.nombre} - S/ {parseFloat(p.precio_venta).toFixed(2)} (Stock disp: {p.cantidad_disponible ?? p.total_disponible ?? 0})
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-full sm:w-32">
                <input 
                  type="number" 
                  min="1" 
                  value={cantidad} 
                  onChange={(e) => setCantidad(e.target.value)} 
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 text-center font-bold" 
                />
              </div>

              <button 
                type="button" 
                onClick={agregarAlCarrito} 
                className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
              >
                Agregar
              </button>
            </div>

            {items.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left bg-slate-50">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200">
                      <th className="p-3 font-semibold">Producto</th>
                      <th className="p-3 font-semibold text-center">Cant.</th>
                      <th className="p-3 font-semibold text-right">P. Unit.</th>
                      <th className="p-3 font-semibold text-right">Subtotal</th>
                      <th className="p-3 font-semibold text-center">Quitar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {items.map((item, index) => (
                      <tr key={index} className="bg-white">
                        <td className="p-3 font-medium text-slate-800">{item.nombre}</td>
                        <td className="p-3 text-center font-bold">{item.cantidad}</td>
                        <td className="p-3 text-right font-mono text-slate-600">S/ {parseFloat(item.precio_unitario).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          S/ {(item.cantidad * parseFloat(item.precio_unitario)).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            type="button" 
                            onClick={() => quitarDelCarrito(index)} 
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 text-sm border-t border-slate-200">
                      <td colSpan="3" className="p-3 text-right uppercase tracking-wider text-xs">Total del Pedido:</td>
                      <td className="p-3 text-right font-mono text-base text-indigo-700">
                        S/ {totalMontoCarrito.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-6 border-2 border-dashed border-slate-200 rounded-xl text-sm">
                Aún no has agregado productos al pedido.
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button 
              type="submit" 
              disabled={guardandoPedido || items.length === 0} 
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow-md transition-all"
            >
              {guardandoPedido ? 'Guardando...' : 'Crear y Reservar Stock'}
            </button>
          </div>

        </form>
      )}

      {/* VISTA 2: LISTA DE PEDIDOS */}
      {vista === 'lista' && (
        <div className="space-y-4">
          
          {/* SELECTOR DE PESTAÑAS Y FILTROS */}
          <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl w-max">
            <button 
              onClick={() => setFiltro('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filtro === 'todos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Todos los pedidos ({pedidos.length})
            </button>
            <button 
              onClick={() => setFiltro('semana')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${
                filtro === 'semana' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Filter size={14} className="mr-1" />
              Pendientes de la semana
            </button>
            <button 
              onClick={() => setFiltro('listos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${
                filtro === 'listos' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <PackageCheck size={14} className="mr-1" />
              Listos para despacho
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">ID</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold">Vendedor / Solicitado</th>
                  <th className="p-4 font-semibold">Día Despacho</th>
                  <th className="p-4 font-semibold text-center">Empaque</th>
                  <th className="p-4 font-semibold text-right">Total</th>
                  <th className="p-4 font-semibold text-center">Estado</th>
                  <th className="p-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pedidosMostrados.map((pedido) => (
                  <tr key={pedido.id_pedido} className="hover:bg-slate-50 transition-colors">
                    
                    {/* ID */}
                    <td className="p-4 font-bold text-slate-900 font-mono">#{pedido.id_pedido}</td>
                    
                    {/* Cliente */}
                    <td className="p-4 font-medium text-slate-800">
                      <div>{pedido.cliente}</div>
                      {pedido.nombre_comercial && (
                        <div className="text-xs text-indigo-600 font-normal">{pedido.nombre_comercial}</div>
                      )}
                    </td>
                    
                    {/* Creador y solicitado por */}
                    <td className="p-4 text-slate-600">
                      <div className="flex flex-col space-y-0.5">
                        <div className="flex items-center space-x-1.5" title="Usuario Creador">
                          <User size={14} className="text-slate-400" />
                          <span className="text-xs font-medium">{pedido.creador || 'Sistema'}</span>
                        </div>
                        {pedido.solicitado_por && (
                          <span className="text-[11px] text-slate-500 italic">Sol: {pedido.solicitado_por}</span>
                        )}
                      </div>
                    </td>

                    {/* Fecha y Hora de despacho */}
                    <td className="p-4 text-slate-700">
                      {(() => {
                        const { fechaStr, horaStr, esProduccion: prod } = formatearFechaYHoraDespacho(pedido.fecha_limite_despacho);
                        return (
                          <div>
                            <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-700">
                              <Calendar size={14} className="text-slate-400" />
                              <span>{fechaStr}</span>
                            </div>
                            {horaStr ? (
                              <div className="flex items-center space-x-1.5 mt-1 font-semibold text-xs">
                                <Clock size={12} className={prod ? "text-amber-600" : "text-blue-600"} />
                                <span className={prod ? "text-amber-700 font-mono" : "text-blue-700 font-mono"}>{horaStr}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                                  prod ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
                                }`}>
                                  {prod ? "Planta (-1h)" : "Hora Real"}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Checks Etiquetado y Sellado */}
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center space-y-1">
                        {pedido.etiquetado ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Tag size={10} className="mr-1" /> Etiquetado
                          </span>
                        ) : null}
                        {pedido.sellado_vacio ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            <ShieldCheck size={10} className="mr-1" /> Sellado Vacío
                          </span>
                        ) : null}
                        {!pedido.etiquetado && !pedido.sellado_vacio && (
                          <span className="text-[11px] text-slate-400 italic">Estándar</span>
                        )}
                      </div>
                    </td>

                    {/* Total en Soles */}
                    <td className="p-4 text-right font-mono font-bold text-slate-900">
                      S/ {parseFloat(pedido.monto_total).toFixed(2)}
                    </td>

                    {/* Estado */}
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colorEstado(pedido.estado_pedido)}`}>
                        {pedido.estado_pedido}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="p-4 text-center">
                      {pedido.estado_pedido === 'PENDIENTE' ? (
                        <div className="flex items-center justify-center space-x-1.5">
                          <button 
                            onClick={() => marcarListoDespacho(pedido.id_pedido)}
                            disabled={procesandoDespacho === pedido.id_pedido}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center space-x-1"
                            title="Marcar como listo para despacho"
                          >
                            <PackageCheck size={13} />
                            <span>{procesandoDespacho === pedido.id_pedido ? '...' : 'Listo'}</span>
                          </button>

                          <button 
                            onClick={() => emitirFactura(pedido.id_pedido)} 
                            disabled={facturando === pedido.id_pedido || cancelando === pedido.id_pedido} 
                            className="inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            title="Facturar electrónicamente"
                          >
                            <FileText size={13} />
                            <span>{facturando === pedido.id_pedido ? '...' : 'Facturar'}</span>
                          </button>

                          <button 
                            onClick={() => cancelarPedido(pedido.id_pedido)} 
                            disabled={cancelando === pedido.id_pedido || facturando === pedido.id_pedido} 
                            className="inline-flex items-center space-x-1 bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            title="Cancelar pedido"
                          >
                            <XCircle size={13} />
                          </button>
                        </div>
                      ) : pedido.estado_pedido === 'LISTO_DESPACHO' ? (
                        <div className="flex items-center justify-center space-x-1.5">
                          <button 
                            onClick={() => emitirFactura(pedido.id_pedido)} 
                            disabled={facturando === pedido.id_pedido} 
                            className="inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                          >
                            <FileText size={13} />
                            <span>Facturar</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs font-medium">
                          {pedido.estado_pedido === 'CANCELADO' ? 'Cancelado' : 'Procesado'}
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
                <h3 className="text-lg font-bold text-slate-700">Sin pedidos</h3>
                <p className="text-slate-500 mt-1">No hay pedidos que coincidan con este filtro.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}