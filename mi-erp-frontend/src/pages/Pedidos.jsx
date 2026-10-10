import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { 
  ShoppingCart, Calendar, CheckCircle, FileText, Plus, ArrowLeft, 
  Trash2, XCircle, User, Filter, Tag, ShieldCheck, PackageCheck, Truck, Clock, Info,
  Camera, Image, Upload, Eye, X, Loader2, CalendarDays, List, AlertCircle,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import Despacho from './Despacho';

export default function Pedidos({ usuario }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [facturando, setFacturando] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [procesandoDespacho, setProcesandoDespacho] = useState(null);

  const [pestanaModulo, setPestanaModulo] = useState('pedidos'); // 'pedidos', 'despacho'
  const [vista, setVista] = useState('lista');
  const [filtro, setFiltro] = useState('todos'); // 'todos', 'semana', 'listos'
  const [modoVista, setModoVista] = useState('calendario'); // 'calendario', 'tabla'
  const [semanaOffset, setSemanaOffset] = useState(0);
  
  // Estado para fotos y evidencias adjuntas (soporte para celulares)
  const [pedidoFotosModal, setPedidoFotosModal] = useState(null);
  const [fotosPedido, setFotosPedido] = useState([]);
  const [cargandoFotos, setCargandoFotos] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [previewFoto, setPreviewFoto] = useState(null);
  const [descripcionFoto, setDescripcionFoto] = useState('');
  const [fotoEnGrande, setFotoEnGrande] = useState(null);

  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [clientesDisponibles, setClientesDisponibles] = useState([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [fechaDespacho, setFechaDespacho] = useState('');
  const [horaDespacho, setHoraDespacho] = useState('10:00');
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

  // Métodos para Fotos / Evidencias desde el Celular
  const abrirModalFotos = async (pedido) => {
    setPedidoFotosModal(pedido);
    setArchivoSeleccionado(null);
    setPreviewFoto(null);
    setDescripcionFoto('');
    setCargandoFotos(true);
    try {
      const res = await api.get(`/pedidos/${pedido.id_pedido}/fotos`);
      setFotosPedido(res.data.fotos || []);
    } catch (err) {
      toast.error('Error al cargar fotos del pedido: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargandoFotos(false);
    }
  };

  const comprimirImagen = (file) => {
    return new Promise((resolve) => {
      if (file.size <= 1024 * 1024) return resolve(file);
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        const maxDim = 1920;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  };

  const handleSeleccionarArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileProcesado = await comprimirImagen(file);
    setArchivoSeleccionado(fileProcesado);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewFoto(reader.result);
    };
    reader.readAsDataURL(fileProcesado);
  };

  const handleSubirFoto = async (e) => {
    e.preventDefault();
    if (!archivoSeleccionado) {
      return toast.error('Por favor selecciona o toma una foto desde tu dispositivo.');
    }
    if (!descripcionFoto.trim()) {
      return toast.error('Por favor escribe una descripción para la foto.');
    }

    setSubiendoFoto(true);
    const formData = new FormData();
    formData.append('foto', archivoSeleccionado);
    formData.append('descripcion', descripcionFoto.trim());

    try {
      const res = await api.post(`/pedidos/${pedidoFotosModal.id_pedido}/fotos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data.mensaje || '¡Foto subida con éxito!');
      setArchivoSeleccionado(null);
      setPreviewFoto(null);
      setDescripcionFoto('');
      // Recargar fotos
      const resFotos = await api.get(`/pedidos/${pedidoFotosModal.id_pedido}/fotos`);
      setFotosPedido(resFotos.data.fotos || []);
      // Recargar pedidos para actualizar el contador de fotos
      cargarPedidos();
    } catch (err) {
      toast.error('Error al subir foto: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setSubiendoFoto(false);
    }
  };

  const handleEliminarFoto = async (id_foto) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta foto?')) return;
    try {
      await api.delete(`/pedidos/fotos/${id_foto}`);
      toast.success('Foto eliminada correctamente.');
      setFotosPedido(prev => prev.filter(f => f.id_foto !== id_foto));
      cargarPedidos();
    } catch (err) {
      toast.error('Error al eliminar foto: ' + (err.response?.data?.mensaje || err.message));
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
      const fechaLimiteCompleta = fechaDespacho ? `${fechaDespacho}T${horaDespacho || '10:00'}:00` : null;

      await api.post('/pedidos', {
        id_cliente: Number(clienteSeleccionado),
        id_ubicacion: usuario?.id_ubicacion || 1, 
        id_usuario: usuario?.id_usuario, 
        fecha_limite_despacho: fechaLimiteCompleta,
        items: items,
        solicitado_por: solicitadoPor || null,
        etiquetado: Boolean(etiquetado),
        sellado_vacio: Boolean(selladoVacio)
      });
      toast.success('¡Pedido creado y stock reservado con éxito!');
      setItems([]);
      setFechaDespacho('');
      setHoraDespacho('10:00');
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
      case 'LISTO_DESPACHO': return 'bg-amber-300 text-amber-950 border-amber-500 font-bold shadow-xs';
      case 'FACTURADO': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DESPACHADO': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'CANCELADO': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const pedidosMostrados = pedidos.filter(pedido => {
    if (filtro === 'listos') {
      return pedido.estado_pedido === 'LISTO_DESPACHO';
    }
    if (filtro === 'todos') return true;
    
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

  const obtenerUrlImagen = (urlRelativa) => {
    if (!urlRelativa) return '';
    if (urlRelativa.startsWith('http://') || urlRelativa.startsWith('https://')) return urlRelativa;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    if (baseUrl.startsWith('http')) {
      const origin = new URL(baseUrl).origin;
      return `${origin}${urlRelativa.startsWith('/') ? '' : '/'}${urlRelativa}`;
    }
    return urlRelativa;
  };

  const obtenerDiasSemana = () => {
    const hoy = new Date();
    const diaSemana = hoy.getDay() || 7; // 1 = Lunes, 7 = Domingo
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1 + (semanaOffset * 7));
    lunes.setHours(0, 0, 0, 0);

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      dias.push(d);
    }
    return dias;
  };

  const diasDeLaSemana = obtenerDiasSemana();
  const primerDiaSemana = diasDeLaSemana[0];
  const ultimoDiaSemana = diasDeLaSemana[6];
  const etiquetaRangoSemana = `${primerDiaSemana.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} - ${ultimoDiaSemana.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const obtenerPedidosDelDia = (diaObj) => {
    const diaKey = diaObj.toDateString();
    return pedidosMostrados.filter(p => {
      if (!p.fecha_limite_despacho) return false;
      const fechaP = new Date(p.fecha_limite_despacho);
      return fechaP.toDateString() === diaKey;
    });
  };

  if (cargando && vista === 'lista' && pedidos.length === 0) {
    return <div className="text-slate-500 font-medium p-8">Cargando pedidos...</div>;
  }
  if (error) return <div className="text-red-500 bg-red-50 p-4 rounded-xl m-8">{error}</div>;

  return (
    <div className="space-y-6">
      
      {/* SELECTOR DE SUB-PESTAÑAS DENTRO DE PEDIDOS */}
      <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
        <button
          onClick={() => setPestanaModulo('pedidos')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            pestanaModulo === 'pedidos' 
              ? 'bg-white text-indigo-600 shadow-xs' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingCart size={15} />
          <span>Gestión de Pedidos</span>
        </button>

        <button
          onClick={() => setPestanaModulo('despacho')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            pestanaModulo === 'despacho' 
              ? 'bg-white text-amber-600 shadow-xs' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck size={15} />
          <span>Listos para Despacho</span>
        </button>
      </div>

      {pestanaModulo === 'despacho' ? (
        <Despacho usuario={usuario} />
      ) : (
        <>
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

            {/* Fecha de Entrega */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Fecha de Entrega al Cliente *
              </label>
              <input 
                type="date" 
                required 
                value={fechaDespacho}
                onChange={(e) => setFechaDespacho(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500 font-medium" 
              />
            </div>

            {/* Hora de Entrega */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Hora de Entrega al Cliente *
              </label>
              <input 
                type="time" 
                required 
                value={horaDespacho}
                onChange={(e) => setHoraDespacho(e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500 font-mono font-bold" 
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00'].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHoraDespacho(h)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                      horaDespacho === h ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
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

            {/* Banner aclaratorio de la hora */}
            <div className="md:col-span-3 bg-blue-50/70 border border-blue-200 p-3.5 rounded-xl flex items-start space-x-2 text-xs text-blue-900">
              <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Coordinación de horario:</span> Al pactar la entrega a las <b className="font-mono">{horaDespacho || '10:00'}</b> con el cliente, el personal de producción lo visualizará automáticamente programado para las <b className="font-mono">{(() => { const [h, m] = (horaDespacho || '10:00').split(':').map(Number); const hPlanta = (h - 1 + 24) % 24; return `${String(hPlanta).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`; })()}</b> para contar con 1 hora de margen de preparación en planta.
              </div>
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

      {/* VISTA 2: LISTA / CALENDARIO DE PEDIDOS */}
      {vista === 'lista' && (
        <div className="space-y-4">
          
          {/* BARRA DE HERRAMIENTAS: FILTROS Y CONMUTADOR CALENDARIO / TABLA */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            {/* SELECTOR DE FILTROS */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setFiltro('todos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filtro === 'todos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos ({pedidos.length})
                </button>
                <button 
                  onClick={() => setFiltro('semana')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                    filtro === 'semana' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Filter size={13} className="mr-0.5" />
                  <span>Pendientes semana</span>
                </button>
                <button 
                  onClick={() => setFiltro('listos')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                    filtro === 'listos' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Truck size={13} className="mr-0.5" />
                  <span>Listos para despacho ({pedidos.filter(p => p.estado_pedido === 'LISTO_DESPACHO').length})</span>
                </button>
              </div>

              {/* Indicador de sede del empleado */}
              {usuario?.rol !== 'Admin Central' && !usuario?.puede_ver_otras_ubicaciones && (
                <div className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-xl flex items-center space-x-1">
                  <span>📍 Mostrando pedidos de tu ubicación</span>
                </div>
              )}
            </div>

            {/* CONMUTADOR CALENDARIO SEMANAL VS TABLA */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setModoVista('calendario')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  modoVista === 'calendario'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarDays size={14} />
                <span>Calendario Semanal</span>
              </button>
              <button
                onClick={() => setModoVista('tabla')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  modoVista === 'tabla'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List size={14} />
                <span>Tabla</span>
              </button>
            </div>
          </div>

          {/* VISTA A: CALENDARIO SEMANAL DE PEDIDOS */}
          {modoVista === 'calendario' && (
            <div className="space-y-4">
              
              {/* Barra de navegación de la semana */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setSemanaOffset(prev => prev - 1)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    title="Semana anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="font-bold text-slate-800 text-sm">
                    Semana: <strong className="text-indigo-600">{etiquetaRangoSemana}</strong>
                  </span>
                  <button
                    onClick={() => setSemanaOffset(prev => prev + 1)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    title="Semana siguiente"
                  >
                    <ChevronRight size={18} />
                  </button>
                  {semanaOffset !== 0 && (
                    <button
                      onClick={() => setSemanaOffset(0)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg ml-2 transition-colors"
                    >
                      Ir a esta semana
                    </button>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  📱 Toca <span className="font-bold text-indigo-600">📷 Fotos</span> en cualquier pedido para usar la cámara de tu celular.
                </div>
              </div>

              {/* Cuadrícula de 7 Días */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
                {diasDeLaSemana.map((dia, idx) => {
                  const pedidosDelDia = obtenerPedidosDelDia(dia);
                  const esHoy = dia.toDateString() === new Date().toDateString();
                  const nombreDia = dia.toLocaleDateString('es-ES', { weekday: 'short' });
                  const fechaDia = dia.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

                  return (
                    <div 
                      key={idx}
                      className={`rounded-2xl border flex flex-col min-h-[220px] transition-all ${
                        esHoy 
                          ? 'bg-indigo-50/30 border-indigo-300 ring-2 ring-indigo-500/20 shadow-sm' 
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* Cabecera del día */}
                      <div className={`p-3 border-b flex items-center justify-between rounded-t-2xl ${
                        esHoy ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-700'
                      }`}>
                        <div>
                          <span className="capitalize font-bold text-xs block">{nombreDia}</span>
                          <span className={`text-[11px] font-semibold ${esHoy ? 'text-indigo-100' : 'text-slate-500'}`}>{fechaDia}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                          pedidosDelDia.length > 0 
                            ? (esHoy ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-700')
                            : (esHoy ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-500')
                        }`}>
                          {pedidosDelDia.length}
                        </span>
                      </div>

                      {/* Tarjetas de pedidos para este día */}
                      <div className="p-2 space-y-2.5 flex-1">
                        {pedidosDelDia.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-[11px] text-slate-400 italic py-6">
                            Sin pedidos
                          </div>
                        ) : (
                          pedidosDelDia.map(pedido => {
                            const { horaStr } = formatearFechaYHoraDespacho(pedido.fecha_limite_despacho);
                            const esRealizado = pedido.estado_pedido === 'DESPACHADO' || pedido.estado_pedido === 'FACTURADO';
                            const esListoDespacho = pedido.estado_pedido === 'LISTO_DESPACHO';

                            return (
                              <div 
                                key={pedido.id_pedido}
                                className={`rounded-xl p-3 space-y-2.5 transition-all text-xs ${
                                  esListoDespacho
                                    ? 'bg-amber-100 border-2 border-amber-500 ring-2 ring-amber-400/40 shadow-md text-amber-950'
                                    : esRealizado
                                      ? 'bg-emerald-50/80 border-2 border-emerald-400 ring-2 ring-emerald-500/20 shadow-sm'
                                      : pedido.estado_pedido === 'CANCELADO'
                                        ? 'bg-slate-100 border border-slate-200 opacity-60'
                                        : 'bg-white border border-slate-200 hover:border-indigo-400 shadow-xs'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-mono font-bold text-slate-900 text-xs">#{pedido.id_pedido}</span>
                                  {esListoDespacho ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-400 text-amber-950 border border-amber-500 shadow-xs inline-flex items-center space-x-1">
                                      <Truck size={10} className="mr-0.5" />
                                      <span>LISTO DESPACHO</span>
                                    </span>
                                  ) : esRealizado ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-600 text-white shadow-xs inline-flex items-center space-x-1">
                                      <CheckCircle size={10} className="mr-0.5" />
                                      <span>YA SE HIZO</span>
                                    </span>
                                  ) : (
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${colorEstado(pedido.estado_pedido)}`}>
                                      {pedido.estado_pedido}
                                    </span>
                                  )}
                                </div>

                                <div>
                                  <div className="font-bold text-slate-800 line-clamp-1" title={pedido.cliente}>{pedido.cliente}</div>
                                  {pedido.nombre_comercial && (
                                    <div className="text-[11px] text-indigo-600 line-clamp-1">{pedido.nombre_comercial}</div>
                                  )}
                                </div>

                                {/* BADGE DE HORA DE ENTREGA DESTACADO */}
                                <div className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold border ${
                                  esListoDespacho
                                    ? 'bg-amber-200 text-amber-950 border-amber-300 shadow-xs'
                                    : esRealizado 
                                      ? 'bg-emerald-100/90 text-emerald-950 border-emerald-300' 
                                      : 'bg-indigo-50 text-indigo-950 border border-indigo-200 shadow-xs'
                                }`}>
                                  <div className="flex items-center space-x-1.5">
                                    <Clock size={14} className={esListoDespacho ? 'text-amber-800' : esRealizado ? 'text-emerald-700' : 'text-indigo-600'} />
                                    <span className="text-[10px] uppercase tracking-wider">Hora Entrega:</span>
                                  </div>
                                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-white text-slate-900 shadow-xs">
                                    {horaStr || 'Por definir'}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                                  <span className="text-slate-500">Total:</span>
                                  <span className="font-mono font-bold text-slate-900">S/ {parseFloat(pedido.monto_total).toFixed(2)}</span>
                                </div>

                                {/* Badges de etiquetado y sellado */}
                                {(pedido.etiquetado || pedido.sellado_vacio) && (
                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {pedido.etiquetado && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                        <Tag size={9} className="mr-0.5" /> Etiquetado
                                      </span>
                                    )}
                                    {pedido.sellado_vacio && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                                        <ShieldCheck size={9} className="mr-0.5" /> Sellado Vacío
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* BOTÓN FOTOS / EVIDENCIAS DESDE EL CELULAR */}
                                <button
                                  type="button"
                                  onClick={() => abrirModalFotos(pedido)}
                                  className="w-full flex items-center justify-center space-x-1.5 py-2 px-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition-colors shadow-xs"
                                  title="Subir o ver fotos de este pedido desde el celular"
                                >
                                  <Camera size={14} className="text-indigo-600" />
                                  <span>📷 Fotos ({pedido.total_fotos || 0})</span>
                                </button>

                                {/* Acciones del pedido en tarjeta */}
                                {pedido.estado_pedido === 'PENDIENTE' && (
                                  <div className="grid grid-cols-2 gap-1 pt-1">
                                    <button
                                      onClick={() => marcarListoDespacho(pedido.id_pedido)}
                                      disabled={procesandoDespacho === pedido.id_pedido}
                                      className="py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold transition-colors text-center"
                                    >
                                      {procesandoDespacho === pedido.id_pedido ? '...' : 'Listo'}
                                    </button>
                                    <button
                                      onClick={() => emitirFactura(pedido.id_pedido)}
                                      disabled={facturando === pedido.id_pedido}
                                      className="py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-colors text-center"
                                    >
                                      {facturando === pedido.id_pedido ? '...' : 'Facturar'}
                                    </button>
                                  </div>
                                )}
                                {pedido.estado_pedido === 'LISTO_DESPACHO' && (
                                  <button
                                    onClick={() => emitirFactura(pedido.id_pedido)}
                                    disabled={facturando === pedido.id_pedido}
                                    className="w-full py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold transition-colors text-center"
                                  >
                                    Facturar
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pedidos fuera de la semana seleccionada */}
              {(() => {
                const pedidosFueraDeSemana = pedidosMostrados.filter(p => {
                  if (!p.fecha_limite_despacho) return true;
                  const f = new Date(p.fecha_limite_despacho);
                  return f < primerDiaSemana || f > ultimoDiaSemana;
                });

                if (pedidosFueraDeSemana.length === 0) return null;

                return (
                  <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                        <Calendar size={14} className="text-slate-400" />
                        <span>Otros pedidos fuera de esta semana ({pedidosFueraDeSemana.length})</span>
                      </h4>
                      <button
                        onClick={() => setModoVista('tabla')}
                        className="text-xs text-indigo-600 font-bold hover:underline"
                      >
                        Ver en tabla completa →
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {pedidosFueraDeSemana.slice(0, 8).map(pedido => {
                        const { fechaStr, horaStr } = formatearFechaYHoraDespacho(pedido.fecha_limite_despacho);
                        const esListoDespacho = pedido.estado_pedido === 'LISTO_DESPACHO';
                        return (
                          <div key={pedido.id_pedido} className={`rounded-xl border p-3 text-xs space-y-2 shadow-xs transition-all ${
                            esListoDespacho 
                              ? 'bg-amber-100 border-2 border-amber-500 ring-2 ring-amber-400/40 text-amber-950'
                              : 'bg-white border-slate-200'
                          }`}>
                            <div className="flex justify-between items-center">
                              <span className="font-mono font-bold text-slate-900">#{pedido.id_pedido}</span>
                              {esListoDespacho ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-amber-950 border border-amber-500 shadow-xs inline-flex items-center space-x-1">
                                  <Truck size={10} className="mr-0.5" />
                                  <span>LISTO DESPACHO</span>
                                </span>
                              ) : (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorEstado(pedido.estado_pedido)}`}>
                                  {pedido.estado_pedido}
                                </span>
                              )}
                            </div>
                            <div className="font-semibold text-slate-800 line-clamp-1">{pedido.cliente}</div>
                            <div className="text-[11px] text-slate-500">📅 {fechaStr} {horaStr ? `• ⏰ ${horaStr}` : ''}</div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="font-bold text-slate-900">S/ {parseFloat(pedido.monto_total).toFixed(2)}</span>
                              <button
                                type="button"
                                onClick={() => abrirModalFotos(pedido)}
                                className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] flex items-center space-x-1"
                              >
                                <Camera size={12} />
                                <span>Fotos ({pedido.total_fotos || 0})</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* VISTA B: TABLA DETALLADA DE PEDIDOS */}
          {modoVista === 'tabla' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
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
                      <th className="p-4 font-semibold text-center">Fotos</th>
                      <th className="p-4 font-semibold text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {pedidosMostrados.map((pedido) => {
                      const esRealizado = pedido.estado_pedido === 'DESPACHADO' || pedido.estado_pedido === 'FACTURADO';
                      const esListoDespacho = pedido.estado_pedido === 'LISTO_DESPACHO';
                      return (
                      <tr 
                        key={pedido.id_pedido} 
                        className={`transition-colors ${
                          esListoDespacho
                            ? 'bg-amber-100/90 hover:bg-amber-200/90 border-l-4 border-l-amber-500 font-medium'
                            : esRealizado 
                              ? 'bg-emerald-50/50 hover:bg-emerald-100/50' 
                              : pedido.estado_pedido === 'CANCELADO'
                                ? 'bg-slate-50/50 hover:bg-slate-100/50 opacity-60'
                                : 'hover:bg-slate-50'
                        }`}
                      >
                        
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
                            const { fechaStr, horaStr } = formatearFechaYHoraDespacho(pedido.fecha_limite_despacho);
                            return (
                              <div>
                                <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-700">
                                  <Calendar size={14} className="text-slate-400" />
                                  <span>{fechaStr}</span>
                                </div>
                                {horaStr ? (
                                  <div className={`flex items-center space-x-1.5 mt-1 font-bold text-xs px-2 py-0.5 rounded-md w-max ${
                                    esRealizado ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-800'
                                  }`}>
                                    <Clock size={12} className={esRealizado ? 'text-emerald-700' : 'text-slate-500'} />
                                    <span className="font-mono">{horaStr}</span>
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
                          {esListoDespacho ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-400 text-amber-950 border border-amber-500 shadow-xs inline-flex items-center space-x-1">
                              <Truck size={12} className="mr-0.5" />
                              <span>LISTO DESPACHO</span>
                            </span>
                          ) : esRealizado ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs inline-flex items-center space-x-1">
                              <CheckCircle size={11} className="mr-0.5" />
                              <span>YA SE HIZO ({pedido.estado_pedido})</span>
                            </span>
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colorEstado(pedido.estado_pedido)}`}>
                              {pedido.estado_pedido}
                            </span>
                          )}
                        </td>

                        {/* Columna Fotos desde Celular */}
                        <td className="p-4 text-center">
                          <button 
                            type="button"
                            onClick={() => abrirModalFotos(pedido)}
                            className="inline-flex items-center space-x-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            title="Subir o ver fotos de este pedido desde el celular"
                          >
                            <Camera size={13} className="text-indigo-600" />
                            <span>{pedido.total_fotos || 0}</span>
                          </button>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pedidosMostrados.length === 0 && (
                <div className="p-12 text-center flex flex-col items-center">
                  <CheckCircle size={48} className="text-emerald-400 mb-4" />
                  <h3 className="text-lg font-bold text-slate-700">Sin pedidos</h3>
                  <p className="text-slate-500 mt-1">No hay pedidos que coincidan con este filtro.</p>
                </div>
              )}
            </div>
          )}

          {/* MODAL PARA SUBIR Y VER FOTOS DE EVIDENCIA DESDE EL CELULAR */}
          {pedidoFotosModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
                
                {/* Cabecera del modal */}
                <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                      <Camera size={22} />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-slate-900">
                        Fotos y Evidencias - Pedido #{pedidoFotosModal.id_pedido}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Cliente: <strong className="text-slate-700">{pedidoFotosModal.cliente}</strong> • Total: <strong className="text-slate-700 font-mono">S/ {parseFloat(pedidoFotosModal.monto_total).toFixed(2)}</strong>
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPedidoFotosModal(null)} 
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
                  
                  {/* AVISO DE VIGENCIA DE 2 MESES */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-amber-900">
                    <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-950">Vigencia y Eliminación Automática:</p>
                      <p className="mt-0.5 text-amber-800">
                        Las fotos subidas a este pedido se conservan durante <strong>2 meses</strong> como evidencia y luego se borran automáticamente para optimizar el almacenamiento del sistema.
                      </p>
                    </div>
                  </div>

                  {/* FORMULARIO DE SUBIDA (OPTIMIZADO PARA SMARTPHONES) */}
                  <form onSubmit={handleSubirFoto} className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                      <Upload size={14} className="text-indigo-600" />
                      <span>Subir Nueva Foto / Evidencia</span>
                    </h4>

                    {/* Botón de Cámara para Celular */}
                    <div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        id="input-camara-celular" 
                        onChange={handleSeleccionarArchivo} 
                        className="hidden" 
                      />
                      
                      {!previewFoto ? (
                        <label 
                          htmlFor="input-camara-celular"
                          className="cursor-pointer border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/40 rounded-xl p-4 sm:p-6 flex flex-col items-center justify-center text-center transition-all group"
                        >
                          <div className="p-3 bg-indigo-100 group-hover:bg-indigo-200 text-indigo-600 rounded-full mb-2 transition-colors">
                            <Camera size={26} />
                          </div>
                          <span className="text-sm font-bold text-indigo-700">
                            📱 Tomar Foto con Cámara o Elegir de Galería
                          </span>
                          <span className="text-xs text-slate-500 mt-1">
                            En celular se abrirá la cámara o la galería directamente
                          </span>
                        </label>
                      ) : (
                        <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
                          <div className="relative rounded-lg overflow-hidden bg-slate-900 max-h-56 flex items-center justify-center">
                            <img 
                              src={previewFoto} 
                              alt="Vista previa" 
                              className="max-h-56 object-contain"
                            />
                            <button 
                              type="button" 
                              onClick={() => { setArchivoSeleccionado(null); setPreviewFoto(null); }}
                              className="absolute top-2 right-2 bg-red-600/90 text-white p-1.5 rounded-full hover:bg-red-700 transition-colors shadow-md"
                              title="Eliminar selección"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">
                            Archivo seleccionado: <span className="font-semibold text-slate-700">{archivoSeleccionado?.name}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Campo Descripción Obligatorio */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Descripción de la Foto *
                      </label>
                      <input 
                        type="text" 
                        required
                        placeholder="Ej: Guía de remisión firmada, Producto sellado al vacío, Estado en despacho..."
                        value={descripcionFoto}
                        onChange={(e) => setDescripcionFoto(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {/* Botón de envío */}
                    <div className="flex justify-end">
                      <button 
                        type="submit" 
                        disabled={subiendoFoto || !archivoSeleccionado || !descripcionFoto.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors flex items-center space-x-2 shadow-md"
                      >
                        {subiendoFoto ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            <span>Subiendo evidencia...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={15} />
                            <span>Guardar Evidencia</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* GALERÍA DE FOTOS REGISTRADAS */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <Image size={14} className="text-indigo-600" />
                        <span>Evidencias Adjuntas ({fotosPedido.length})</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-normal">
                        Haz clic en una imagen para agrandarla
                      </span>
                    </h4>

                    {cargandoFotos ? (
                      <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
                        <Loader2 size={24} className="animate-spin text-indigo-600" />
                        <span className="text-xs font-medium">Cargando fotos del pedido...</span>
                      </div>
                    ) : fotosPedido.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                        <Camera size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-600">Aún no hay fotos registradas para este pedido.</p>
                        <p className="mt-0.5">Puedes tomar una foto ahora con la cámara de tu celular.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {fotosPedido.map((f) => {
                          const urlCompleta = obtenerUrlImagen(f.url_foto);
                          const fechaSubida = new Date(f.creado_en).toLocaleDateString('es-ES', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          });
                          const fechaExpira = new Date(f.expira_en).toLocaleDateString('es-ES', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          });

                          return (
                            <div 
                              key={f.id_foto} 
                              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:border-indigo-300 transition-all flex flex-col"
                            >
                              <div 
                                onClick={() => setFotoEnGrande({ ...f, urlCompleta })}
                                className="relative h-44 bg-slate-900 cursor-pointer group flex items-center justify-center overflow-hidden"
                              >
                                <img 
                                  src={urlCompleta} 
                                  alt={f.descripcion} 
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Eye size={24} />
                                </div>
                              </div>
                              
                              <div className="p-3 space-y-2 flex-1 flex flex-col justify-between text-xs">
                                <div>
                                  <p className="font-bold text-slate-800 line-clamp-2" title={f.descripcion}>
                                    {f.descripcion}
                                  </p>
                                  <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                                    <div>📅 {fechaSubida} {f.nombre_usuario ? `• 👤 ${f.nombre_usuario}` : ''}</div>
                                    <div className="text-amber-700 font-medium">⏳ Se borra el: {fechaExpira}</div>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => setFotoEnGrande({ ...f, urlCompleta })}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                                  >
                                    <Eye size={12} />
                                    <span>Ver grande</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEliminarFoto(f.id_foto)}
                                    className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center space-x-1 p-1 hover:bg-red-50 rounded"
                                    title="Eliminar foto"
                                  >
                                    <Trash2 size={12} />
                                    <span>Eliminar</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>

                {/* Pie del modal */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button 
                    onClick={() => setPedidoFotosModal(null)} 
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                  >
                    Cerrar
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* LIGHTBOX PARA VER FOTO EN TAMAÑO COMPLETO */}
          {fotoEnGrande && (
            <div 
              onClick={() => setFotoEnGrande(null)}
              className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            >
              <div 
                onClick={(e) => e.stopPropagation()} 
                className="relative max-w-4xl w-full max-h-[92vh] flex flex-col items-center"
              >
                <button 
                  onClick={() => setFotoEnGrande(null)} 
                  className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Cerrar (Esc)"
                >
                  <X size={26} />
                </button>
                <img 
                  src={fotoEnGrande.urlCompleta} 
                  alt={fotoEnGrande.descripcion} 
                  className="max-h-[80vh] w-auto max-w-full rounded-xl object-contain shadow-2xl" 
                />
                <div className="mt-3 text-center text-white bg-slate-900/80 px-4 py-2 rounded-xl text-xs font-medium max-w-xl">
                  <p className="font-bold text-sm">{fotoEnGrande.descripcion}</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    ⏳ Vence el: {new Date(fotoEnGrande.expira_en).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
        </>
      )}
    </div>
  );
}