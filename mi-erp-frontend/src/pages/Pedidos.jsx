import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  ShoppingCart, Calendar, CheckCircle, FileText, Plus, ArrowLeft,
  Trash2, XCircle, User, Filter, Tag, ShieldCheck, PackageCheck, Truck, Clock, Info,
  Camera, Image, Upload, Eye, X, Loader2, CalendarDays, List,
  ChevronLeft, ChevronRight, AlertTriangle
} from 'lucide-react';
import Despacho from './Despacho';

export default function Pedidos({ usuario }) {
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modalPesoListo, setModalPesoListo] = useState({ abierto: false, idPedido: null, peso: '' });
  const [cancelando, setCancelando] = useState(null);
  const [procesandoDespacho, setProcesandoDespacho] = useState(null);

  const [pestanaModulo, setPestanaModulo] = useState('pedidos'); // 'pedidos', 'despacho'
  const [vista, setVista] = useState('lista');
  const [filtro, setFiltro] = useState('todos'); // 'todos', 'semana', 'listos'
  const [modoVista, setModoVista] = useState('calendario'); // 'calendario', 'tabla'
  const [semanaOffset, setSemanaOffset] = useState(0);

  // Confirmación amigable para cancelar pedido
  const [pedidoACancelar, setPedidoACancelar] = useState(null);
  const [fotoAEliminar, setFotoAEliminar] = useState(null);

  // Estado para fotos y evidencias adjuntas
  const [pedidoFotosModal, setPedidoFotosModal] = useState(null);
  const [fotosPedido, setFotosPedido] = useState([]);
  const [cargandoFotos, setCargandoFotos] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState(null);
  const [previewFoto, setPreviewFoto] = useState(null);
  const [descripcionFoto, setDescripcionFoto] = useState('');
  const [fotoEnGrande, setFotoEnGrande] = useState(null);

  // Estado para formulario de nuevo pedido
  const [stockPorSede, setStockPorSede] = useState([]);
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [ubicacionPedido, setUbicacionPedido] = useState(usuario?.id_ubicacion || 1);
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

  const esAdminCentral = usuario?.rol === 'Admin Central';
  const puedeEditarPedidos =
    esAdminCentral || usuario?.permisos?.pedidos?.puede_editar === true;
  const puedeEditarFacturacion =
    esAdminCentral || usuario?.permisos?.facturacion?.puede_editar === true;
  const puedeElegirOtraSede =
    esAdminCentral || Boolean(usuario?.puede_ver_otras_ubicaciones);
  const esProduccion = usuario?.area === 'PRODUCCION';

  useEffect(() => {
    cargarPedidos();
  }, []);

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        if (fotoEnGrande) setFotoEnGrande(null);
        else if (fotoAEliminar) setFotoAEliminar(null);
        else if (pedidoFotosModal) setPedidoFotosModal(null);
        else if (pedidoACancelar) setPedidoACancelar(null);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [fotoEnGrande, fotoAEliminar, pedidoFotosModal, pedidoACancelar]);

  const cargarPedidos = async () => {
    setCargando(true);
    try {
      const respuesta = await api.get('/pedidos/calendario');
      setPedidos(respuesta.data.eventos || []);
    } catch {
      setError('No se pudieron cargar los pedidos.');
    } finally {
      setCargando(false);
    }
  };

  // Fotos / Evidencias
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
      toast.error('No se pudieron cargar las fotos: ' + (err.response?.data?.mensaje || err.message));
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
      return toast.error('Primero toma o elige una foto.');
    }
    if (!descripcionFoto.trim()) {
      return toast.error('Escribe una breve descripción de la foto.');
    }

    setSubiendoFoto(true);
    const formData = new FormData();
    formData.append('foto', archivoSeleccionado);
    formData.append('descripcion', descripcionFoto.trim());

    try {
      const res = await api.post(`/pedidos/${pedidoFotosModal.id_pedido}/fotos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success(res.data.mensaje || '¡Foto guardada con éxito!');
      setArchivoSeleccionado(null);
      setPreviewFoto(null);
      setDescripcionFoto('');
      const resFotos = await api.get(`/pedidos/${pedidoFotosModal.id_pedido}/fotos`);
      setFotosPedido(resFotos.data.fotos || []);
      cargarPedidos();
    } catch (err) {
      toast.error('No se pudo subir la foto: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setSubiendoFoto(false);
    }
  };

  const confirmarEliminarFoto = async () => {
    if (!fotoAEliminar) return;
    try {
      await api.delete(`/pedidos/fotos/${fotoAEliminar}`);
      toast.success('Foto eliminada.');
      setFotosPedido(prev => prev.filter(f => f.id_foto !== fotoAEliminar));
      setFotoAEliminar(null);
      cargarPedidos();
    } catch (err) {
      toast.error('No se pudo borrar la foto: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  const abrirFormularioNuevo = async () => {
    setVista('nuevo');
    setItems([]);
    const sedeInicial = usuario?.id_ubicacion || 1;
    setUbicacionPedido(sedeInicial);
    try {
      const [resStockSede, resClientes, resUbic] = await Promise.all([
        api.get('/stock?vista=sede'),
        api.get('/clientes'),
        api.get('/ubicaciones').catch(() => ({ data: { ubicaciones: [] } }))
      ]);

      const registrosSede = resStockSede.data.datos || [];
      setStockPorSede(registrosSede);

      const sedes = resUbic.data.ubicaciones || resUbic.data.datos || [];
      setUbicacionesDisponibles(sedes);

      const deSedeActual = registrosSede.filter(s => Number(s.id_ubicacion) === Number(sedeInicial));
      if (deSedeActual.length > 0) {
        setProductoSeleccionado(deSedeActual[0].id_producto);
      } else {
        setProductoSeleccionado('');
      }

      const clientes = resClientes.data.datos || [];
      setClientesDisponibles(clientes);
      if (clientes.length > 0) {
        setClienteSeleccionado(clientes[0].id_cliente);
      }
    } catch (err) {
      console.error('Error cargando datos para nuevo pedido:', err);
      toast.error('No se pudieron cargar los productos o clientes.');
    }
  };

  // Productos disponibles exclusivamente en la sede elegida para este pedido
  const productosDeLaSede = stockPorSede.filter(
    s => Number(s.id_ubicacion) === Number(ubicacionPedido)
  );

  const stockRestanteProducto = (prod) => {
    const base = Number(prod.cantidad_disponible ?? prod.total_disponible ?? 0);
    const enCarrito = items
      .filter(it => Number(it.id_producto) === Number(prod.id_producto))
      .reduce((acc, it) => acc + Number(it.cantidad), 0);
    return Math.max(0, base - enCarrito);
  };

  const handleCambiarSedePedido = (nuevaSedeId) => {
    const idNum = Number(nuevaSedeId);
    setUbicacionPedido(idNum);
    setItems([]);
    const disponiblesEnNueva = stockPorSede.filter(s => Number(s.id_ubicacion) === idNum);
    setProductoSeleccionado(disponiblesEnNueva[0]?.id_producto || '');
  };

  const agregarAlCarrito = () => {
    const cantNum = parseInt(cantidad, 10);
    if (!cantNum || cantNum <= 0) {
      return toast.error('La cantidad debe ser mayor a cero.');
    }

    const producto = productosDeLaSede.find(
      p => String(p.id_producto) === String(productoSeleccionado)
    );
    if (!producto) {
      return toast.error('Elige un producto con stock en esta sede.');
    }

    const restante = stockRestanteProducto(producto);
    if (restante < cantNum) {
      return toast.error(`No alcanza el stock en esta sede. Quedan ${restante} disponibles.`);
    }

    const idxExistente = items.findIndex(it => Number(it.id_producto) === Number(producto.id_producto));
    if (idxExistente >= 0) {
      const copia = [...items];
      copia[idxExistente] = {
        ...copia[idxExistente],
        cantidad: copia[idxExistente].cantidad + cantNum
      };
      setItems(copia);
    } else {
      setItems([
        ...items,
        {
          id_producto: producto.id_producto,
          nombre: producto.nombre_producto || producto.nombre,
          precio_unitario: producto.precio_venta,
          cantidad: cantNum
        }
      ]);
    }
    setCantidad(1);
  };

  const quitarDelCarrito = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const enviarNuevoPedido = async (e) => {
    e.preventDefault();
    if (items.length === 0) return toast.error('Agrega al menos un producto al pedido.');
    if (!clienteSeleccionado) return toast.error('Selecciona un cliente.');

    setGuardandoPedido(true);
    try {
      const fechaLimiteCompleta = fechaDespacho ? `${fechaDespacho}T${horaDespacho || '10:00'}:00` : null;

      await api.post('/pedidos', {
        id_cliente: Number(clienteSeleccionado),
        id_ubicacion: Number(ubicacionPedido) || usuario?.id_ubicacion || 1,
        id_usuario: usuario?.id_usuario,
        fecha_limite_despacho: fechaLimiteCompleta,
        items: items,
        solicitado_por: solicitadoPor || null,
        etiquetado: Boolean(etiquetado),
        sellado_vacio: Boolean(selladoVacio)
      });
      toast.success('¡Pedido guardado y stock reservado con éxito!');
      setItems([]);
      setFechaDespacho('');
      setHoraDespacho('10:00');
      setSolicitadoPor('');
      setEtiquetado(false);
      setSelladoVacio(false);
      setVista('lista');
      cargarPedidos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el pedido.');
    } finally {
      setGuardandoPedido(false);
    }
  };

  const abrirModalPesoListo = (idPedido) => {
    setModalPesoListo({ abierto: true, idPedido, peso: '' });
  };

  const confirmarListoDespacho = async (e) => {
    e?.preventDefault();
    if (!modalPesoListo.idPedido) return;
    setProcesandoDespacho(modalPesoListo.idPedido);
    try {
      const pesoVal = modalPesoListo.peso ? parseFloat(modalPesoListo.peso) : null;
      await api.put(`/pedidos/${modalPesoListo.idPedido}/listo-despacho`, {
        peso_total: pesoVal
      });
      toast.success('¡Pedido marcado como listo para despacho!');
      setModalPesoListo({ abierto: false, idPedido: null, peso: '' });
      cargarPedidos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el pedido.');
    } finally {
      setProcesandoDespacho(null);
    }
  };

  const ejecutarCancelacion = async () => {
    if (!pedidoACancelar) return;
    const idPedido = pedidoACancelar.id_pedido;
    setCancelando(idPedido);
    try {
      const respuesta = await api.put(`/pedidos/${idPedido}/cancelar`);
      if (respuesta.data.exito) {
        toast.success('Pedido cancelado y stock liberado.');
        setPedidoACancelar(null);
        cargarPedidos();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cancelar el pedido.');
    } finally {
      setCancelando(null);
    }
  };

  const formatearFechaYHoraDespacho = (fechaISO) => {
    if (!fechaISO) return { fechaStr: '-', horaStr: null, esProduccion };
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

  const textoEstadoAmigable = (estado) => {
    switch (estado) {
      case 'PENDIENTE': return 'En preparación';
      case 'LISTO_DESPACHO': return 'LISTO DESPACHO';
      case 'FACTURADO': return 'Facturado';
      case 'DESPACHADO': return 'Entregado';
      case 'CANCELADO': return 'Cancelado';
      default: return estado;
    }
  };

  const pedidosMostrados = pedidos.filter(pedido => {
    if (filtro === 'listos') {
      return pedido.estado_pedido === 'LISTO_DESPACHO';
    }
    if (filtro === 'todos') return true;

    if (pedido.estado_pedido !== 'PENDIENTE') return false;
    const fechaPedido = new Date(pedido.fecha_limite_despacho);
    const hoy = new Date();
    const diaSemana = hoy.getDay() || 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diaSemana + 1);
    lunes.setHours(0, 0, 0, 0);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);
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
    const diaSemana = hoy.getDay() || 7;
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
      {/* SUB-PESTAÑAS DENTRO DE PEDIDOS */}
      <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
        <button
          onClick={() => setPestanaModulo('pedidos')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                  {vista === 'lista'
                    ? 'Organiza las entregas por día y hora, sube fotos y marca los pedidos listos para salir'
                    : 'Completa los datos de entrega y elige los productos disponibles en almacén'}
                </p>
              </div>
            </div>

            {vista === 'lista' ? (
              puedeEditarPedidos && (
                <button
                  onClick={abrirFormularioNuevo}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-lg shadow-indigo-600/30 transition-colors cursor-pointer"
                >
                  <Plus size={18} />
                  <span>Nuevo Pedido</span>
                </button>
              )
            ) : (
              <button
                onClick={() => setVista('lista')}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold flex items-center space-x-2 transition-colors cursor-pointer"
              >
                <ArrowLeft size={18} />
                <span>Volver al calendario</span>
              </button>
            )}
          </div>

          {/* VISTA 1: FORMULARIO NUEVO PEDIDO */}
          {vista === 'nuevo' && (
            <form onSubmit={enviarNuevoPedido} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6 max-w-4xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Cliente */}
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
                        {c.nombre_comercial || c.razon_social_o_nombre} ({c.numero_documento})
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
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                          horaDespacho === h ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sede desde donde saldrá el pedido (si tiene acceso multi-sede) */}
                {puedeElegirOtraSede && ubicacionesDisponibles.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Sede que despachará *
                    </label>
                    <select
                      value={ubicacionPedido}
                      onChange={(e) => handleCambiarSedePedido(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500 font-semibold"
                    >
                      {ubicacionesDisponibles.map(u => (
                        <option key={u.id_ubicacion} value={u.id_ubicacion}>
                          {u.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Solicitado por */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">¿Quién lo pidió? (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Nombre del contacto o vendedor"
                    value={solicitadoPor}
                    onChange={(e) => setSolicitadoPor(e.target.value)}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-700 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Banner aclaratorio de la hora */}
                <div className="md:col-span-3 bg-blue-50/70 border border-blue-200 p-3.5 rounded-xl flex items-start space-x-2 text-xs text-blue-900">
                  <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Cómo verán la hora:</span> Si acuerdas entregar al cliente a las <strong className="font-mono">{horaDespacho || '10:00'}</strong>, al personal de Producción le aparecerá a las <strong className="font-mono">{(() => { const [h, m] = (horaDespacho || '10:00').split(':').map(Number); const hPlanta = (h - 1 + 24) % 24; return `${String(hPlanta).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`; })()}</strong> (1 hora antes para que lo tengan listo a tiempo).
                  </div>
                </div>
              </div>

              {/* CHECK ETIQUETADO Y SELLADO AL VACIO */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                  ¿Cómo debe prepararse este pedido?
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
                        <span className="font-bold text-sm">Lleva Etiquetado</span>
                        <p className="text-xs text-slate-500">Colocar etiquetas al producto</p>
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
                        <span className="font-bold text-sm">Lleva Sellado al Vacío</span>
                        <p className="text-xs text-slate-500">Empacar sellado al vacío</p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* PRODUCTOS */}
              <div className="border-t border-slate-200 pt-6">
                <h3 className="text-lg font-bold text-blue-950 mb-4">Productos del Pedido</h3>

                {productosDeLaSede.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 mb-4">
                    No hay productos con stock registrado en esta sede todavía. Registra primero una entrada en la pestaña <strong>Inventario</strong>.
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
                    <div className="flex-1">
                      <select
                        value={productoSeleccionado}
                        onChange={(e) => setProductoSeleccionado(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                      >
                        {productosDeLaSede.map(p => (
                          <option key={p.id_producto} value={p.id_producto}>
                            {p.nombre_producto || p.nombre} · S/ {parseFloat(p.precio_venta).toFixed(2)} (Disponible: {stockRestanteProducto(p)})
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
                      className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                    >
                      + Agregar
                    </button>
                  </div>
                )}

                {items.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left bg-slate-50">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 text-xs uppercase border-b border-slate-200">
                          <th className="p-3 font-semibold">Producto</th>
                          <th className="p-3 font-semibold text-center">Cantidad</th>
                          <th className="p-3 font-semibold text-right">Precio Unit.</th>
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
                                className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
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
                    Todavía no agregaste productos. Elige uno arriba y presiona "+ Agregar".
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={guardandoPedido || items.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-8 py-3.5 rounded-xl font-bold text-sm shadow-md transition-all cursor-pointer"
                >
                  {guardandoPedido ? 'Guardando...' : 'Guardar Pedido'}
                </button>
              </div>
            </form>
          )}

          {/* VISTA 2: LISTA / CALENDARIO DE PEDIDOS */}
          {vista === 'lista' && (
            <div className="space-y-4">
              {/* BARRA DE HERRAMIENTAS */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setFiltro('todos')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        filtro === 'todos' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Todos ({pedidos.length})
                    </button>
                    <button
                      onClick={() => setFiltro('semana')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                        filtro === 'semana' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Filter size={13} className="mr-0.5" />
                      <span>Por preparar esta semana</span>
                    </button>
                    <button
                      onClick={() => setFiltro('listos')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                        filtro === 'listos' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Truck size={13} className="mr-0.5" />
                      <span>Listos para despacho ({pedidos.filter(p => p.estado_pedido === 'LISTO_DESPACHO').length})</span>
                    </button>
                  </div>

                  {!puedeElegirOtraSede && (
                    <div className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-xl flex items-center space-x-1">
                      <span>📍 Pedidos de tu sede</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => setModoVista('calendario')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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

              {/* VISTA CALENDARIO SEMANAL */}
              {modoVista === 'calendario' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSemanaOffset(prev => prev - 1)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        title="Semana anterior"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="font-bold text-slate-800 text-sm">
                        Semana: <strong className="text-indigo-600">{etiquetaRangoSemana}</strong>
                      </span>
                      <button
                        onClick={() => setSemanaOffset(prev => prev + 1)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                        title="Semana siguiente"
                      >
                        <ChevronRight size={18} />
                      </button>
                      {semanaOffset !== 0 && (
                        <button
                          onClick={() => setSemanaOffset(0)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-lg ml-2 transition-colors cursor-pointer"
                        >
                          Volver a esta semana
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-medium">
                      📱 Toca <span className="font-bold text-indigo-600">📷 Fotos</span> en cualquier pedido para subir o mirar fotos.
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
                                const yaFacturado = Boolean(pedido.tiene_factura || pedido.estado_pedido === 'FACTURADO');

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
                                          {textoEstadoAmigable(pedido.estado_pedido)}
                                        </span>
                                      )}
                                    </div>

                                    <div>
                                      <div className="font-bold text-slate-800 line-clamp-1" title={pedido.cliente}>{pedido.cliente}</div>
                                      {pedido.peso_total && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 mt-1">
                                          ⚖️ {Number(pedido.peso_total).toFixed(2)} kg
                                        </span>
                                      )}
                                    </div>

                                    <div className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold border ${
                                      esListoDespacho
                                        ? 'bg-amber-200 text-amber-950 border-amber-300 shadow-xs'
                                        : esRealizado
                                          ? 'bg-emerald-100/90 text-emerald-950 border-emerald-300'
                                          : 'bg-indigo-50 text-indigo-950 border-indigo-200 shadow-xs'
                                    }`}>
                                      <div className="flex items-center space-x-1.5">
                                        <Clock size={14} className={esListoDespacho ? 'text-amber-800' : esRealizado ? 'text-emerald-700' : 'text-indigo-600'} />
                                        <span className="text-[10px] uppercase tracking-wider">Hora:</span>
                                      </div>
                                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-white text-slate-900 shadow-xs">
                                        {horaStr || 'Por definir'}
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                                      <span className="text-slate-500">Total:</span>
                                      <span className="font-mono font-bold text-slate-900">S/ {parseFloat(pedido.monto_total).toFixed(2)}</span>
                                    </div>

                                    {(pedido.etiquetado || pedido.sellado_vacio) && (
                                      <div className="flex flex-wrap gap-1 pt-1">
                                        {pedido.etiquetado && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                            <Tag size={9} className="mr-0.5" /> Etiquetado
                                          </span>
                                        )}
                                        {pedido.sellado_vacio && (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800">
                                            <ShieldCheck size={9} className="mr-0.5" /> Al Vacío
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => abrirModalFotos(pedido)}
                                      className="w-full flex items-center justify-center space-x-1.5 py-2 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs transition-colors shadow-xs cursor-pointer"
                                    >
                                      <Camera size={14} className="text-indigo-600" />
                                      <span>📷 Fotos ({pedido.total_fotos || 0})</span>
                                    </button>

                                    {pedido.estado_pedido === 'PENDIENTE' && puedeEditarPedidos && (
                                      <div className="flex gap-1 pt-1">
                                        <button
                                          onClick={() => abrirModalPesoListo(pedido.id_pedido)}
                                          disabled={procesandoDespacho === pedido.id_pedido}
                                          className="w-full py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold transition-colors text-center cursor-pointer"
                                        >
                                          {procesandoDespacho === pedido.id_pedido ? '...' : 'Listo'}
                                        </button>
                                      </div>
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
                            <span>Pedidos de otras semanas ({pedidosFueraDeSemana.length})</span>
                          </h4>
                          <button
                            onClick={() => setModoVista('tabla')}
                            className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                          >
                            Ver todos en tabla →
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
                                      {textoEstadoAmigable(pedido.estado_pedido)}
                                    </span>
                                  )}
                                </div>
                                <div className="font-semibold text-slate-800 line-clamp-1">{pedido.cliente}</div>
                                <div className="text-[11px] text-slate-500">📅 {fechaStr} {horaStr ? `· ⏰ ${horaStr}` : ''}</div>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                  <span className="font-bold text-slate-900">S/ {parseFloat(pedido.monto_total).toFixed(2)}</span>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalFotos(pedido)}
                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] flex items-center space-x-1 cursor-pointer"
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

              {/* VISTA TABLA DETALLADA */}
              {modoVista === 'tabla' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                          <th className="p-4 font-semibold">Pedido</th>
                          <th className="p-4 font-semibold">Cliente</th>
                          <th className="p-4 font-semibold">Registrado por</th>
                          <th className="p-4 font-semibold">Día y Hora</th>
                          <th className="p-4 font-semibold text-center">Preparación</th>
                          <th className="p-4 font-semibold text-right">Total</th>
                          <th className="p-4 font-semibold text-center">Estado</th>
                          <th className="p-4 font-semibold text-center">Fotos</th>
                          {(puedeEditarPedidos || puedeEditarFacturacion) && (
                            <th className="p-4 font-semibold text-center">Acciones</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {pedidosMostrados.map((pedido) => {
                          const esRealizado = pedido.estado_pedido === 'DESPACHADO' || pedido.estado_pedido === 'FACTURADO';
                          const esListoDespacho = pedido.estado_pedido === 'LISTO_DESPACHO';
                          const yaFacturado = Boolean(pedido.tiene_factura || pedido.estado_pedido === 'FACTURADO');

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
                              <td className="p-4 font-bold text-slate-900 font-mono">#{pedido.id_pedido}</td>

                              <td className="p-4 font-medium text-slate-800">
                                <div>{pedido.cliente}</div>
                                {pedido.peso_total && (
                                  <span className="inline-block text-[11px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 mt-1">
                                    ⚖️ {Number(pedido.peso_total).toFixed(2)} kg
                                  </span>
                                )}
                              </td>

                              <td className="p-4 text-slate-600">
                                <div className="flex flex-col space-y-0.5">
                                  <div className="flex items-center space-x-1.5">
                                    <User size={14} className="text-slate-400" />
                                    <span className="text-xs font-medium">{pedido.creador || 'Sistema'}</span>
                                  </div>
                                  {pedido.solicitado_por && (
                                    <span className="text-[11px] text-slate-500 italic">Pidió: {pedido.solicitado_por}</span>
                                  )}
                                </div>
                              </td>

                              <td className="p-4 text-slate-700">
                                {(() => {
                                  const { fechaStr, horaStr } = formatearFechaYHoraDespacho(pedido.fecha_limite_despacho);
                                  return (
                                    <div>
                                      <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-700">
                                        <Calendar size={14} className="text-slate-400" />
                                        <span>{fechaStr}</span>
                                      </div>
                                      {horaStr && (
                                        <div className={`flex items-center space-x-1.5 mt-1 font-bold text-xs px-2 py-0.5 rounded-md w-max ${
                                          esRealizado ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-800'
                                        }`}>
                                          <Clock size={12} className={esRealizado ? 'text-emerald-700' : 'text-slate-500'} />
                                          <span className="font-mono">{horaStr}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>

                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center space-y-1">
                                  {pedido.etiquetado && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <Tag size={10} className="mr-1" /> Etiquetado
                                    </span>
                                  )}
                                  {pedido.sellado_vacio && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                      <ShieldCheck size={10} className="mr-1" /> Al Vacío
                                    </span>
                                  )}
                                  {!pedido.etiquetado && !pedido.sellado_vacio && (
                                    <span className="text-[11px] text-slate-400 italic">Normal</span>
                                  )}
                                </div>
                              </td>

                              <td className="p-4 text-right font-mono font-bold text-slate-900">
                                S/ {parseFloat(pedido.monto_total).toFixed(2)}
                              </td>

                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  {esListoDespacho ? (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-400 text-amber-950 border border-amber-500 shadow-xs inline-flex items-center space-x-1">
                                      <Truck size={12} className="mr-0.5" />
                                      <span>LISTO DESPACHO</span>
                                    </span>
                                  ) : esRealizado ? (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs inline-flex items-center space-x-1">
                                      <CheckCircle size={11} className="mr-0.5" />
                                      <span>YA SE HIZO ({textoEstadoAmigable(pedido.estado_pedido)})</span>
                                    </span>
                                  ) : (
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colorEstado(pedido.estado_pedido)}`}>
                                      {textoEstadoAmigable(pedido.estado_pedido)}
                                    </span>
                                  )}
                                  {pedido.numero_comprobante && (
                                    <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                      {pedido.numero_comprobante}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="p-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => abrirModalFotos(pedido)}
                                  className="inline-flex items-center space-x-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  <Camera size={13} className="text-indigo-600" />
                                  <span>{pedido.total_fotos || 0}</span>
                                </button>
                              </td>

                              {(puedeEditarPedidos || puedeEditarFacturacion) && (
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center space-x-1.5">
                                    {pedido.estado_pedido === 'PENDIENTE' && puedeEditarPedidos && (
                                      <button
                                        onClick={() => abrirModalPesoListo(pedido.id_pedido)}
                                        disabled={procesandoDespacho === pedido.id_pedido}
                                        className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center space-x-1 cursor-pointer"
                                        title="Marcar como listo para despacho"
                                      >
                                        <PackageCheck size={13} />
                                        <span>{procesandoDespacho === pedido.id_pedido ? '...' : 'Listo'}</span>
                                      </button>
                                    )}

                                    {(pedido.estado_pedido === 'PENDIENTE' || pedido.estado_pedido === 'LISTO_DESPACHO') && !yaFacturado && puedeEditarPedidos && (
                                      <button
                                        onClick={() => setPedidoACancelar(pedido)}
                                        disabled={cancelando === pedido.id_pedido}
                                        className="inline-flex items-center space-x-1 bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                        title="Cancelar pedido"
                                      >
                                        <XCircle size={13} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
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
                      <p className="text-slate-500 mt-1">No hay pedidos en este filtro.</p>
                    </div>
                  )}
                </div>
              )}

              {/* MODAL CONFIRMAR CANCELACIÓN DE PEDIDO */}
              {pedidoACancelar && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 bg-red-100 text-red-600 rounded-xl">
                        <AlertTriangle size={22} />
                      </div>
                      <h3 className="text-lg font-bold text-blue-950">¿Cancelar el Pedido #{pedidoACancelar.id_pedido}?</h3>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      El pedido de <strong>{pedidoACancelar.cliente}</strong> quedará cancelado y los productos reservados volverán a estar disponibles en el inventario.
                    </p>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setPedidoACancelar(null)}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                      >
                        No, volver
                      </button>
                      <button
                        type="button"
                        disabled={cancelando === pedidoACancelar.id_pedido}
                        onClick={ejecutarCancelacion}
                        className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl cursor-pointer disabled:opacity-50"
                      >
                        {cancelando === pedidoACancelar.id_pedido ? 'Cancelando...' : 'Sí, Cancelar Pedido'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL PARA SUBIR Y VER FOTOS DE EVIDENCIA */}
              {pedidoFotosModal && (
                <div
                  className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
                  onClick={() => setPedidoFotosModal(null)}
                >
                  <div
                    className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                      <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                          <Camera size={22} />
                        </div>
                        <div>
                          <h3 className="text-base sm:text-lg font-bold text-blue-950">
                            Fotos del Pedido #{pedidoFotosModal.id_pedido}
                          </h3>
                          <p className="text-xs text-slate-500">
                            Cliente: <strong className="text-slate-700">{pedidoFotosModal.cliente}</strong> · Total: <strong className="text-slate-700 font-mono">S/ {parseFloat(pedidoFotosModal.monto_total).toFixed(2)}</strong>
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setPedidoFotosModal(null)}
                        className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-amber-900">
                        <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-amber-950">Duración automática de 2 meses:</p>
                          <p className="mt-0.5 text-amber-800">
                            Las fotos de este pedido se guardan durante <strong>2 meses</strong> y luego se borran solas para no llenar la memoria.
                          </p>
                        </div>
                      </div>

                      {puedeEditarPedidos && (
                        <form onSubmit={handleSubirFoto} className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-4">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                            <Upload size={14} className="text-indigo-600" />
                            <span>Agregar Nueva Foto</span>
                          </h4>

                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              id="input-camara-celular"
                              onChange={handleSeleccionarArchivo}
                              className="hidden"
                            />
                            <input
                              type="file"
                              accept="image/*"
                              id="input-galeria-dispositivo"
                              onChange={handleSeleccionarArchivo}
                              className="hidden"
                            />

                            {!previewFoto ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label
                                  htmlFor="input-camara-celular"
                                  className="cursor-pointer border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/40 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all"
                                >
                                  <Camera size={24} className="text-indigo-600 mb-1.5" />
                                  <span className="text-xs font-bold text-indigo-700">📷 Tomar Foto con Cámara</span>
                                  <span className="text-[11px] text-slate-500 mt-0.5">Ideal desde tu celular</span>
                                </label>

                                <label
                                  htmlFor="input-galeria-dispositivo"
                                  className="cursor-pointer border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-white hover:bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all"
                                >
                                  <Image size={24} className="text-slate-600 mb-1.5" />
                                  <span className="text-xs font-bold text-slate-700">🖼️ Elegir de Galería o PC</span>
                                  <span className="text-[11px] text-slate-500 mt-0.5">Foto ya guardada</span>
                                </label>
                              </div>
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
                                    className="absolute top-2 right-2 bg-red-600/90 text-white p-1.5 rounded-full hover:bg-red-700 transition-colors shadow-md cursor-pointer"
                                    title="Quitar foto seleccionada"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                              Descripción de la foto *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Ej: Guía firmada, cajas selladas al vacío..."
                              value={descripcionFoto}
                              onChange={(e) => setDescripcionFoto(e.target.value)}
                              className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={subiendoFoto || !archivoSeleccionado || !descripcionFoto.trim()}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors flex items-center space-x-2 shadow-md cursor-pointer"
                            >
                              {subiendoFoto ? (
                                <>
                                  <Loader2 size={15} className="animate-spin" />
                                  <span>Subiendo foto...</span>
                                </>
                              ) : (
                                <>
                                  <Upload size={15} />
                                  <span>Guardar Foto</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* GALERÍA */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                          <span className="flex items-center space-x-1.5">
                            <Image size={14} className="text-indigo-600" />
                            <span>Fotos Guardadas ({fotosPedido.length})</span>
                          </span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            Toca una foto para verla en grande
                          </span>
                        </h4>

                        {cargandoFotos ? (
                          <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
                            <Loader2 size={24} className="animate-spin text-indigo-600" />
                            <span className="text-xs font-medium">Cargando fotos...</span>
                          </div>
                        ) : fotosPedido.length === 0 ? (
                          <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                            <Camera size={32} className="mx-auto mb-2 text-slate-300" />
                            <p className="font-semibold text-slate-600">Este pedido todavía no tiene fotos.</p>
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
                                        <div>📅 {fechaSubida} {f.nombre_usuario ? `· 👤 ${f.nombre_usuario}` : ''}</div>
                                        <div className="text-amber-700 font-medium">⏳ Se borra el: {fechaExpira}</div>
                                      </div>
                                    </div>

                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => setFotoEnGrande({ ...f, urlCompleta })}
                                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
                                      >
                                        <Eye size={12} />
                                        <span>Ver grande</span>
                                      </button>

                                      {puedeEditarPedidos && (
                                        fotoAEliminar === f.id_foto ? (
                                          <div className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={confirmarEliminarFoto}
                                              className="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                            >
                                              Sí, borrar
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setFotoAEliminar(null)}
                                              className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer"
                                            >
                                              No
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setFotoAEliminar(f.id_foto)}
                                            className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center space-x-1 p-1 hover:bg-red-50 rounded cursor-pointer"
                                          >
                                            <Trash2 size={12} />
                                            <span>Borrar</span>
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                      <button
                        onClick={() => setPedidoFotosModal(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* LIGHTBOX FOTO EN GRANDE */}
              {fotoEnGrande && (
                <div
                  onClick={() => setFotoEnGrande(null)}
                  className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="relative max-w-4xl w-full max-h-[92vh] flex flex-col items-center"
                  >
                    <button
                      onClick={() => setFotoEnGrande(null)}
                      className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
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
                        ⏳ Se borra el: {new Date(fotoEnGrande.expira_en).toLocaleDateString('es-ES')}
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
