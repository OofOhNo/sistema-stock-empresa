import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  FileText, Plus, AlertCircle, RefreshCw,
  Search, ShieldCheck, DollarSign, Receipt,
  X, Printer, Eye, Loader2, Settings, Download, CheckCircle2,
  Trash2, Layers, Tag, CreditCard, ChevronRight,
  ShieldAlert, Lock, Unlock, ShoppingBag, Zap, Banknote, Minus,
  Truck, Bot
} from 'lucide-react';
import SeccionGreFactura from '../components/facturacion/SeccionGreFactura';
import { crearEstadoGreInicial } from '../components/facturacion/greUtils';
import GrePdfModal from '../components/facturacion/GrePdfModal';
import PanelBoletasAutomaticas from '../components/facturacion/PanelBoletasAutomaticas';
import { escaparHtml } from '../utils/htmlPrint';
import { esUnidadSoloEnteros, obtenerInfoUnidad } from '../utils/unidades';

// Logo oficial PROCESOS CÁRNICOS S.A.C.
function LogoProcesosCarnicos({ className = "h-20 w-auto" }) {
  return (
    <img
      src="/brand/logo-color-claro.png"
      alt="PROCESOS CÁRNICOS S.A.C."
      className={`object-contain ${className}`}
    />
  );
}

// Helpers de formato de fecha
function formatearEtiquetaPedido(id, fechaIso) {
  const d = fechaIso ? new Date(fechaIso) : new Date();
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  return `Pedido-${dia}/${mes}/${anio}#${id}`;
}

function formatearFechaTextoEspanol(fecha) {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const d = fecha ? new Date(fecha) : new Date();
  const dia = d.getDate();
  const mes = meses[d.getMonth()];
  const anio = d.getFullYear();
  return `${dia} de ${mes} del ${anio}`;
}

export default function Facturacion({ usuario }) {
  const [comprobantes, setComprobantes] = useState([]);
  const [notasPedido, setNotasPedido] = useState([]);
  const [pedidosFacturables, setPedidosFacturables] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [configSunat, setConfigSunat] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');

  // Permisos y secciones
  const esAdminCentral = usuario?.rol === 'Admin Central';
  const puedeEditarFacturacion = esAdminCentral || usuario?.permisos?.facturacion?.puede_editar === true;
  const seccionAsignada = usuario?.seccion_facturacion || 'AMBAS';
  const tieneAccesoPedidos = esAdminCentral || seccionAsignada === 'AMBAS' || seccionAsignada === 'PEDIDOS';
  const tieneAccesoManual = esAdminCentral || seccionAsignada === 'AMBAS' || seccionAsignada === 'MANUAL';

  // Pestaña principal activa: 'pedidos' | 'manual' | 'notas' | 'historial'
  const [tabActiva, setTabActiva] = useState(() => {
    if (tieneAccesoPedidos) return 'pedidos';
    if (tieneAccesoManual) return 'manual';
    return 'notas';
  });

  // Modal Emitir Comprobante (Por Pedido)
  const [modalEmitir, setModalEmitir] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('01'); // '01' Factura, '03' Boleta
  const [formaPago, setFormaPago] = useState('CONTADO'); // 'CONTADO' | 'CREDITO'
  const [diasCredito, setDiasCredito] = useState(28); // Múltiplos de 7
  const [esPlazoPersonalizado, setEsPlazoPersonalizado] = useState(false);
  const [cantidadCuotas, setCantidadCuotas] = useState(1);
  const [medioPagoSunat, setMedioPagoSunat] = useState('008');
  const [aplicaDetraccion, setAplicaDetraccion] = useState(false);
  const [pesoTotalFactura, setPesoTotalFactura] = useState('');
  const [itemsEditables, setItemsEditables] = useState([]);
  const [procesando, setProcesando] = useState(false);

  // Pago dividido entre múltiples clientes (Req 2 - Opción A)
  const [esPagoDividido, setEsPagoDividido] = useState(false);
  const [pagosDivididos, setPagosDivididos] = useState([]);

  // Modal Facturación Manual (Sin Pedido Previo)
  const [modalManual, setModalManual] = useState(false);
  const [manualClienteId, setManualClienteId] = useState('');
  const [manualUbicacionId, setManualUbicacionId] = useState('');
  const [manualTipoComp, setManualTipoComp] = useState('01');
  const [manualFormaPago, setManualFormaPago] = useState('CONTADO');
  const [manualDiasCredito, setManualDiasCredito] = useState(28);
  const [manualCuotas, setManualCuotas] = useState(1);
  const [manualMedioPago, setManualMedioPago] = useState('008');
  const [manualAplicaDetraccion, setManualAplicaDetraccion] = useState(false);
  const [manualPesoTotal, setManualPesoTotal] = useState('');
  const [manualItems, setManualItems] = useState([
    { id_producto: '', descripcion: '', cantidad: 1, peso: '', precio_unitario: 0, subtotal: 0 }
  ]);

  // Modal Crear Nota de Pedido (Req 13, 16)
  const [modalNotaPedido, setModalNotaPedido] = useState(false);
  const [formNota, setFormNota] = useState({
    id_cliente: '',
    cliente_nombre: '',
    cliente_documento: '',
    observaciones: '',
    items: [
      { id_producto: '', descripcion: '', peso: '', precio_unitario: '', total: '' }
    ]
  });
  const [guardandoNota, setGuardandoNota] = useState(false);

  // Modal Ver / Imprimir Nota de Pedido
  const [modalVerNota, setModalVerNota] = useState(null); // { nota, items }

  // Modal Ver / Imprimir Comprobante A4
  const [modalPdf, setModalPdf] = useState(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);

  // Modal Configuración SUNAT
  const [modalConfig, setModalConfig] = useState(false);
  const [formConfig, setFormConfig] = useState({
    ruc_emisor: '20608725394',
    razon_social: 'PROCESOS CARNICOS S.A.C.',
    nombre_comercial: 'PROCESOS CÁRNICOS S.A.C.',
    direccion_fiscal: 'Lima - Perú',
    modo_integracion: 'DEMO_NUBEFACT',
    nubefact_ruta: 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
    nubefact_token: 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
    detraccion_cuenta_bn: '00-000-000000'
  });
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [probandoConexion, setProbandoConexion] = useState(false);

  // Estados Modo Emergencia / Pánico y Desbloqueo Secreto
  const [modoEmergencia, setModoEmergencia] = useState(() => {
    return localStorage.getItem('erp_modo_emergencia') === 'true';
  });
  const [modalConfirmarEmergencia, setModalConfirmarEmergencia] = useState(false);
  const [modalDesbloqueoSecreto, setModalDesbloqueoSecreto] = useState(false);
  const [pinDesbloqueo, setPinDesbloqueo] = useState('');
  const [errorPin, setErrorPin] = useState('');
  const clicsSecretosRef = useRef({ count: 0, lastTime: 0 });

  // Estados para Venta Rápida de Mostrador / Cafetería (POS)
  const [submodoManual, setSubmodoManual] = useState('CAFETERIA'); // 'CAFETERIA' | 'DETALLADO'
  const [busquedaProdPos, setBusquedaProdPos] = useState('');
  const [categoriaPos, setCategoriaPos] = useState('TODOS');
  const [carritoPos, setCarritoPos] = useState([]);
  const [metodoPagoPos, setMetodoPagoPos] = useState('EFECTIVO'); // 'EFECTIVO' | 'YAPE' | 'TARJETA'
  const [montoEntregadoPos, setMontoEntregadoPos] = useState('');
  const [cobrandoPos, setCobrandoPos] = useState(false);

  // Guías de Remisión Electrónica (GRE EG07)
  const [catalogosGre, setCatalogosGre] = useState({ puntos_partida: [], vehiculos: [], conductores: [], bienes_frecuentes: [] });
  const [guiasRemision, setGuiasRemision] = useState([]);
  const [greFormPedido, setGreFormPedido] = useState(() => crearEstadoGreInicial());
  const [greFormManual, setGreFormManual] = useState(() => crearEstadoGreInicial());
  const [guiaPreview, setGuiaPreview] = useState(null);
  const yaSeleccionoPedidoRef = useRef(false);

  const seleccionarPedido = useCallback((ped, catGre = null) => {
    setPedidoSeleccionado(ped);
    if (!ped) return;

    // Regla tributaria inicial: si tiene RUC -> Factura (01), si no -> Boleta (03)
    const doc = String(ped.ruc_cliente || '').trim();
    const esRuc = ped.tipo_documento_cliente === '6' && /^(10|15|16|17|20)\d{9}$/.test(doc);
    setTipoComprobante(esRuc ? '01' : '03');

    // Req 10: Si ya está listo para despacho, pre-llenar peso registrado; si no, vacío
    if (ped.estado_pedido === 'LISTO_DESPACHO' && ped.peso_total) {
      setPesoTotalFactura(String(ped.peso_total));
    } else {
      setPesoTotalFactura('');
    }

    // Cargar ítems editables (Req 9)
    const itemsRaw = ped.items || [
      {
        id_producto: 1,
        descripcion: ped.descripcion || 'Cortes Cárnicos Seleccionados',
        cantidad: 1,
        peso: ped.peso_total || '',
        precio_unitario: parseFloat(ped.monto_total || 0),
        subtotal: parseFloat(ped.monto_total || 0)
      }
    ];
    setItemsEditables(itemsRaw.map(it => ({
      ...it,
      peso: it.peso || '',
      precio_unitario: parseFloat(it.precio_unitario || 0),
      subtotal: parseFloat(it.subtotal || (it.cantidad * it.precio_unitario) || 0)
    })));

    // Resetear pagos divididos
    setEsPagoDividido(false);
    setPagosDivididos([]);
    setGreFormPedido(crearEstadoGreInicial(catGre || catalogosGre, ped.direccion_cliente || ''));
  }, [catalogosGre]);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [resComp, resNotas, resPed, resConf, resCli, resProd, resUbic, resGreCat, resGres] = await Promise.all([
        api.get('/facturacion'),
        api.get('/facturacion/notas-pedido').catch(() => ({ data: { notas: [] } })),
        api.get('/pedidos/calendario').catch(() => ({ data: { eventos: [] } })),
        api.get('/facturacion/configuracion').catch(() => ({ data: {} })),
        api.get('/clientes').catch(() => ({ data: { datos: [] } })),
        api.get('/productos').catch(() => ({ data: { datos: [] } })),
        api.get('/ubicaciones').catch(() => ({ data: { datos: [] } })),
        api.get('/facturacion/gre/catalogos').catch(() => ({ data: {} })),
        api.get('/facturacion/gre').catch(() => ({ data: { guias: [] } }))
      ]);

      setComprobantes(resComp.data.comprobantes || []);
      setNotasPedido(resNotas.data.notas || []);
      if (resGreCat.data?.puntos_partida) {
        setCatalogosGre(resGreCat.data);
        setGreFormPedido((prev) => prev.id_punto_partida ? prev : crearEstadoGreInicial(resGreCat.data, prev.punto_llegada_direccion));
        setGreFormManual((prev) => prev.id_punto_partida ? prev : crearEstadoGreInicial(resGreCat.data, prev.punto_llegada_direccion));
      }
      setGuiasRemision(resGres.data?.guias || []);
      const listaCli = resCli.data.datos || resCli.data.clientes || [];
      setClientes(listaCli);
      const listaProd = resProd.data.datos || resProd.data.productos || [];
      setProductos(listaProd);
      const listaUbic = resUbic.data.datos || resUbic.data.ubicaciones || [];
      setUbicaciones(listaUbic);
      if (listaUbic.length > 0) {
        setManualUbicacionId((prev) => prev || usuario?.id_ubicacion || listaUbic[0].id_ubicacion);
      }

      if (resConf.data?.configuracion) {
        setConfigSunat(resConf.data.configuracion);
        setFormConfig({
          ruc_emisor: resConf.data.configuracion.ruc_emisor || '20608725394',
          razon_social: resConf.data.configuracion.razon_social || 'PROCESOS CARNICOS S.A.C.',
          nombre_comercial: resConf.data.configuracion.nombre_comercial || 'PROCESOS CÁRNICOS S.A.C.',
          direccion_fiscal: resConf.data.configuracion.direccion_fiscal || '',
          modo_integracion: resConf.data.configuracion.modo_integracion || 'DEMO_NUBEFACT',
          nubefact_ruta: resConf.data.configuracion.nubefact_ruta || '',
          nubefact_token: resConf.data.configuracion.nubefact_token || '',
          detraccion_cuenta_bn: resConf.data.configuracion.detraccion_cuenta_bn || '00-000-000000'
        });
      }

      const disponibles = (resPed.data.eventos || []).filter(
        p => p.estado_pedido !== 'CANCELADO' && !p.tiene_factura && p.estado_pedido !== 'FACTURADO'
      );
      setPedidosFacturables(disponibles);
      if (disponibles.length > 0 && !yaSeleccionoPedidoRef.current) {
        yaSeleccionoPedidoRef.current = true;
        seleccionarPedido(disponibles[0], resGreCat.data?.puntos_partida ? resGreCat.data : null);
      }
    } catch (error) {
      toast.error('No se pudieron cargar los comprobantes: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setCargando(false);
    }
  }, [usuario?.id_ubicacion, seleccionarPedido]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarDatos();
    });
    return () => {
      alive = false;
    };
  }, [cargarDatos]);

  useEffect(() => {
    const onRestaurar = () => setModoEmergencia(false);
    window.addEventListener('restaurar_modo_emergencia', onRestaurar);
    return () => window.removeEventListener('restaurar_modo_emergencia', onRestaurar);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalPdf(null);
        setGuiaPreview(null);
        setModalEmitir(false);
        setModalManual(false);
        setModalNotaPedido(false);
        setModalVerNota(null);
        setModalConfig(false);
        setModalConfirmarEmergencia(false);
        setModalDesbloqueoSecreto(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const recargarCatalogosGre = async () => {
    try {
      const resCat = await api.get('/facturacion/gre/catalogos');
      if (resCat.data?.exito) setCatalogosGre(resCat.data);
    } catch {
      // Silencioso
    }
  };

  // Recalcular subtotal de un ítem editable
  const actualizarItemEditable = (idx, campo, valor) => {
    const copia = [...itemsEditables];
    copia[idx] = { ...copia[idx], [campo]: valor };
    if (campo === 'cantidad' || campo === 'precio_unitario') {
      const cant = parseFloat(copia[idx].cantidad) || 0;
      const pu = parseFloat(copia[idx].precio_unitario) || 0;
      copia[idx].subtotal = Number((cant * pu).toFixed(2));
    }
    setItemsEditables(copia);
  };

  // Total recalculado de los ítems editables
  const totalItemsCalculado = useMemo(() => {
    return itemsEditables.reduce((acc, it) => acc + (parseFloat(it.subtotal) || 0), 0);
  }, [itemsEditables]);

  // Repartir monto y porcentaje de forma equitativa entre todos los participantes
  const recalcularDivididosEquitativo = (lista, totalBase) => {
    const n = lista.length;
    if (n === 0) return [];
    const totalNum = Number(totalBase) || 0;
    const porcBase = Number((100 / n).toFixed(2));
    const montoBase = Number((totalNum / n).toFixed(2));
    let sumaPorc = 0;
    let sumaMonto = 0;

    return lista.map((item, index) => {
      if (index === n - 1) {
        return {
          ...item,
          porcentaje: Number((100 - sumaPorc).toFixed(2)),
          monto: Number((totalNum - sumaMonto).toFixed(2))
        };
      }
      sumaPorc += porcBase;
      sumaMonto += montoBase;
      return {
        ...item,
        porcentaje: porcBase,
        monto: montoBase
      };
    });
  };

  // Inicializar pagos divididos cuando el usuario marca el checkbox
  const togglePagoDividido = (activar) => {
    setEsPagoDividido(activar);
    if (activar && pedidoSeleccionado) {
      const total = totalItemsCalculado || parseFloat(pedidoSeleccionado.monto_total);
      setPagosDivididos(
        recalcularDivididosEquitativo([
          {
            id_cliente: pedidoSeleccionado.id_cliente,
            nombre_cliente: pedidoSeleccionado.cliente,
            tipo_comprobante: tipoComprobante,
            monto: 0,
            porcentaje: 0
          },
          {
            id_cliente: '',
            nombre_cliente: '',
            tipo_comprobante: '01',
            monto: 0,
            porcentaje: 0
          }
        ], total)
      );
    }
  };

  const actualizarPagoDividido = (idx, campo, valor) => {
    const copia = [...pagosDivididos];
    copia[idx] = { ...copia[idx], [campo]: valor };
    const total = totalItemsCalculado || parseFloat(pedidoSeleccionado?.monto_total || 0);

    if (campo === 'porcentaje') {
      const porc = parseFloat(valor) || 0;
      copia[idx].monto = Number(((porc / 100) * total).toFixed(2));
    } else if (campo === 'monto') {
      const m = parseFloat(valor) || 0;
      copia[idx].porcentaje = total > 0 ? Number(((m / total) * 100).toFixed(2)) : 0;
    } else if (campo === 'id_cliente') {
      const cli = clientes.find(c => String(c.id_cliente) === String(valor));
      if (cli) {
        copia[idx].nombre_cliente = cli.razon_social_o_nombre || cli.nombre_comercial;
        const esRuc = cli.tipo_documento === '6' && /^(10|15|16|17|20)\d{9}$/.test(cli.numero_documento);
        copia[idx].tipo_comprobante = esRuc ? '01' : '03';
      }
    }
    setPagosDivididos(copia);
  };

  const agregarFilaPagoDividido = () => {
    const total = totalItemsCalculado || parseFloat(pedidoSeleccionado?.monto_total || 0);
    const nuevaLista = [
      ...pagosDivididos,
      { id_cliente: '', nombre_cliente: '', tipo_comprobante: '01', monto: 0, porcentaje: 0 }
    ];
    setPagosDivididos(recalcularDivididosEquitativo(nuevaLista, total));
  };

  const eliminarFilaPagoDividido = (idx) => {
    if (pagosDivididos.length <= 2) {
      return toast.error('El pago dividido requiere al menos 2 clientes.');
    }
    const total = totalItemsCalculado || parseFloat(pedidoSeleccionado?.monto_total || 0);
    const restante = pagosDivididos.filter((_, i) => i !== idx);
    setPagosDivididos(recalcularDivididosEquitativo(restante, total));
  };

  // Validaciones tributarias previas
  const validarTributarioAntesDeEmitir = (tipo, docCliente, montoTotal = 0) => {
    const doc = String(docCliente || '').trim();
    // Req 17: Boleta no puede tener RUC
    if (tipo === '03' && (doc.length === 11 || /^(10|15|16|17|20)\d{9}$/.test(doc))) {
      return 'Por disposición de SUNAT, una Boleta de Venta no puede emitirse con RUC. Debe utilizar DNI (8 dígitos), "Clientes Varios" o cambiar a Factura (01).';
    }
    if (tipo === '03' && (doc === '00000000' || doc === '-' || doc === '')) {
      if (montoTotal >= 700) {
        return 'Por normativa de SUNAT (RS 007-99), para Boletas de Venta de S/ 700 a más es obligatorio identificar al cliente con su DNI.';
      }
      return null;
    }
    if (tipo === '01' && (!doc || doc.length !== 11)) {
      return 'Para emitir una Factura Electrónica (01), el cliente debe tener un RUC válido de 11 dígitos.';
    }
    return null;
  };

  // Abrir Modal de Emisión de Pedido
  const abrirModalEmitirConPedido = (ped = null) => {
    const p = ped || pedidosFacturables[0];
    if (!p) {
      toast.error('No hay pedidos pendientes para facturar. Puedes usar "Facturación Manual" para ventas directas.');
      return;
    }
    seleccionarPedido(p);
    setFormaPago('CONTADO');
    setDiasCredito(28);
    setEsPlazoPersonalizado(false);
    setCantidadCuotas(1);
    setMedioPagoSunat('008');
    setAplicaDetraccion(false);
    setModalEmitir(true);
  };

  // Emitir Comprobante de Pedido
  const handleEmitirComprobante = async (e) => {
    e.preventDefault();
    if (!pedidoSeleccionado) {
      return toast.error('Selecciona un pedido para facturar.');
    }

    // Validación Boleta con RUC (Req 17)
    const docPedido = pedidoSeleccionado.ruc_cliente || pedidoSeleccionado.documento_cliente;
    const errorTrib = validarTributarioAntesDeEmitir(tipoComprobante, docPedido);
    if (errorTrib) {
      return toast.error(errorTrib);
    }

    // Validación pago dividido
    if (esPagoDividido) {
      const sumaMontos = pagosDivididos.reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);
      const totalEsp = totalItemsCalculado || parseFloat(pedidoSeleccionado.monto_total);
      if (Math.abs(sumaMontos - totalEsp) > 0.05) {
        return toast.error(`La suma de los pagos divididos (S/ ${sumaMontos.toFixed(2)}) debe coincidir con el total del pedido (S/ ${totalEsp.toFixed(2)}).`);
      }
      for (const p of pagosDivididos) {
        if (!p.id_cliente) return toast.error('Selecciona el cliente para todas las partes del pago dividido.');
      }
    }

    setProcesando(true);
    try {
      const payload = {
        id_pedido: pedidoSeleccionado.id_pedido,
        tipo_comprobante: tipoComprobante,
        forma_pago: formaPago,
        dias_credito: formaPago === 'CREDITO' ? parseInt(diasCredito, 10) : 0,
        cantidad_cuotas: formaPago === 'CREDITO' ? parseInt(cantidadCuotas, 10) : 1,
        medio_pago_sunat: formaPago === 'CREDITO' ? '006' : medioPagoSunat,
        aplica_detraccion: tipoComprobante === '01' ? aplicaDetraccion : false,
        codigo_detraccion: '014',
        peso_total: pesoTotalFactura ? parseFloat(pesoTotalFactura) : null,
        items: itemsEditables,
        es_pago_dividido: esPagoDividido,
        pagos: esPagoDividido ? pagosDivididos : null,
        gre: tipoComprobante === '01' ? greFormPedido : null
      };

      const res = await api.post('/facturacion/emitir', payload);
      toast.success(res.data.mensaje || '¡Comprobante emitido y validado con SUNAT!');
      setModalEmitir(false);
      await cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo emitir el comprobante.');
    } finally {
      setProcesando(false);
    }
  };

  // Handlers para Facturación Manual
  const abrirModalManual = () => {
    setManualClienteId('CLIENTES_VARIOS');
    setManualUbicacionId(usuario?.id_ubicacion || ubicaciones[0]?.id_ubicacion || 1);
    setManualTipoComp('03');
    setManualFormaPago('CONTADO');
    setManualDiasCredito(28);
    setManualCuotas(1);
    setManualMedioPago('008');
    setManualAplicaDetraccion(false);
    setManualPesoTotal('');
    setManualItems([
      { id_producto: productos[0]?.id_producto || '', descripcion: productos[0]?.nombre || '', cantidad: 1, peso: '', precio_unitario: productos[0]?.precio_venta || 0, subtotal: productos[0]?.precio_venta || 0 }
    ]);
    setGreFormManual(crearEstadoGreInicial(catalogosGre, ''));
    setModalManual(true);
  };

  const agregarFilaManual = () => {
    const prod = productos[0];
    setManualItems([
      ...manualItems,
      { id_producto: prod?.id_producto || '', descripcion: prod?.nombre || '', cantidad: 1, peso: '', precio_unitario: prod?.precio_venta || 0, subtotal: prod?.precio_venta || 0 }
    ]);
  };

  const actualizarFilaManual = (idx, campo, valor) => {
    const copia = [...manualItems];
    copia[idx] = { ...copia[idx], [campo]: valor };
    if (campo === 'id_producto') {
      const p = productos.find(prod => String(prod.id_producto) === String(valor));
      if (p) {
        let cantAjustada = parseFloat(copia[idx].cantidad) || 1;
        if (esUnidadSoloEnteros(p)) {
          cantAjustada = Math.max(1, Math.round(cantAjustada));
          copia[idx].cantidad = cantAjustada;
        }
        copia[idx].descripcion = p.nombre;
        copia[idx].precio_unitario = parseFloat(p.precio_venta || 0);
        copia[idx].subtotal = Number((cantAjustada * parseFloat(p.precio_venta || 0)).toFixed(2));
      }
    } else if (campo === 'cantidad' || campo === 'precio_unitario') {
      const c = parseFloat(copia[idx].cantidad) || 0;
      const pu = parseFloat(copia[idx].precio_unitario) || 0;
      copia[idx].subtotal = Number((c * pu).toFixed(2));
    }
    setManualItems(copia);
  };

  const eliminarFilaManual = (idx) => {
    if (manualItems.length <= 1) return toast.error('Debe incluir al menos un producto.');
    setManualItems(manualItems.filter((_, i) => i !== idx));
  };

  const totalManualCalculado = useMemo(() => {
    return manualItems.reduce((acc, it) => acc + (parseFloat(it.subtotal) || 0), 0);
  }, [manualItems]);

  const handleEmitirManual = async (e) => {
    e.preventDefault();
    if (!manualClienteId) return toast.error('Selecciona un cliente o "Clientes Varios".');
    if (manualClienteId === 'CLIENTES_VARIOS') {
      if (manualTipoComp === '01') {
        return toast.error('No se puede emitir Factura (01) a Clientes Varios. Debe emitirse con Boleta de Venta (03).');
      }
      if (totalManualCalculado >= 700) {
        return toast.error('Por normativa de SUNAT (RS 007-99), para importes de S/ 700.00 a más en Boleta es obligatorio ingresar el DNI del cliente.');
      }
    } else {
      const cli = clientes.find(c => String(c.id_cliente) === String(manualClienteId));
      const errorTrib = validarTributarioAntesDeEmitir(manualTipoComp, cli?.numero_documento, totalManualCalculado);
      if (errorTrib) return toast.error(errorTrib);
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/emitir-manual', {
        id_cliente: manualClienteId,
        id_ubicacion: manualUbicacionId,
        tipo_comprobante: manualTipoComp,
        forma_pago: manualFormaPago,
        dias_credito: manualFormaPago === 'CREDITO' ? parseInt(manualDiasCredito, 10) : 0,
        cantidad_cuotas: manualFormaPago === 'CREDITO' ? parseInt(manualCuotas, 10) : 1,
        medio_pago_sunat: manualFormaPago === 'CREDITO' ? '006' : manualMedioPago,
        aplica_detraccion: manualTipoComp === '01' ? manualAplicaDetraccion : false,
        codigo_detraccion: '014',
        peso_total: manualPesoTotal ? parseFloat(manualPesoTotal) : null,
        items: manualItems,
        gre: manualTipoComp === '01' ? greFormManual : null
      });

      toast.success(res.data.mensaje || '¡Factura manual emitida y stock descontado!');
      setModalManual(false);
      await cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo emitir la factura manual.');
    } finally {
      setProcesando(false);
    }
  };

  // Handlers para Notas de Pedido (Req 13, 16)
  const abrirModalNotaPedido = () => {
    setFormNota({
      id_cliente: clientes[0]?.id_cliente || '',
      cliente_nombre: clientes[0]?.razon_social_o_nombre || clientes[0]?.nombre_comercial || '',
      cliente_documento: clientes[0]?.numero_documento || '',
      observaciones: '',
      items: [
        { id_producto: productos[0]?.id_producto || '', descripcion: productos[0]?.nombre || 'Chuleta de cogote', peso: '11.60', precio_unitario: '15.00', total: '174.00' }
      ]
    });
    setModalNotaPedido(true);
  };

  const agregarFilaNota = () => {
    const prod = productos[0];
    setFormNota({
      ...formNota,
      items: [
        ...formNota.items,
        { id_producto: prod?.id_producto || '', descripcion: prod?.nombre || '', peso: '', precio_unitario: prod?.precio_venta || '', total: '' }
      ]
    });
  };

  const actualizarFilaNota = (idx, campo, valor) => {
    const items = [...formNota.items];
    const anterior = items[idx];
    items[idx] = { ...anterior, [campo]: valor };
    if (campo === 'peso' || campo === 'precio_unitario') {
      const p = parseFloat(items[idx].peso) || 0;
      const pu = parseFloat(items[idx].precio_unitario) || 0;
      if (p > 0 && pu > 0) {
        items[idx].total = (p * pu).toFixed(2);
      } else if (Number(anterior.peso) > 0 && Number(anterior.precio_unitario) > 0) {
        items[idx].total = '';
      }
    } else if (campo === 'id_producto') {
      const prod = productos.find(pr => String(pr.id_producto) === String(valor));
      if (prod) {
        items[idx].descripcion = prod.nombre;
        items[idx].precio_unitario = prod.precio_venta || '';
        const p = parseFloat(items[idx].peso) || 0;
        const pu = parseFloat(prod.precio_venta) || 0;
        if (p > 0 && pu > 0) items[idx].total = (p * pu).toFixed(2);
      }
    }
    setFormNota({ ...formNota, items });
  };

  const eliminarFilaNota = (idx) => {
    if (formNota.items.length <= 1) return toast.error('Debe haber al menos un producto.');
    setFormNota({ ...formNota, items: formNota.items.filter((_, i) => i !== idx) });
  };

  const totalNotaCalculado = useMemo(() => {
    return formNota.items.reduce((acc, it) => acc + (parseFloat(it.total) || 0), 0);
  }, [formNota.items]);

  const handleCrearNotaPedido = async (e) => {
    e.preventDefault();
    if (!formNota.cliente_nombre.trim()) {
      return toast.error('Escribe el nombre del cliente para la nota de pedido.');
    }
    for (const it of formNota.items) {
      if (!it.descripcion.trim()) return toast.error('Cada fila debe tener una descripción de producto.');
    }

    setGuardandoNota(true);
    try {
      const payload = {
        id_cliente: formNota.id_cliente || null,
        cliente_nombre: formNota.cliente_nombre.trim(),
        cliente_documento: formNota.cliente_documento.trim(),
        observaciones: formNota.observaciones,
        items: formNota.items.map(it => ({
          id_producto: it.id_producto || null,
          descripcion: it.descripcion,
          peso: it.peso ? parseFloat(it.peso) : null,
          precio_unitario: it.precio_unitario ? parseFloat(it.precio_unitario) : 0,
          subtotal: it.total ? parseFloat(it.total) : 0
        }))
      };

      const res = await api.post('/facturacion/notas-pedido', payload);
      toast.success(res.data.mensaje || '¡Nota de pedido creada con éxito!');
      setModalNotaPedido(false);
      await cargarDatos();

      // Abrir vista previa de la nota creada
      if (res.data?.nota) {
        setModalVerNota({
          nota: res.data.nota,
          items: res.data.items || payload.items
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo crear la nota de pedido.');
    } finally {
      setGuardandoNota(false);
    }
  };

  // Abrir Visor de Nota de Pedido existente
  const abrirDetalleNota = async (np) => {
    try {
      const res = await api.get(`/facturacion/notas-pedido/${np.id_nota_pedido}`);
      setModalVerNota({
        nota: res.data.nota || np,
        items: res.data.items || []
      });
    } catch {
      toast.error('No se pudo abrir el detalle de la nota.');
    }
  };

  // Imprimir Nota de Pedido idéntica a la imagen del usuario
  const imprimirNotaPedidoActual = () => {
    if (!modalVerNota?.nota) return;
    const n = modalVerNota.nota;
    const items = modalVerNota.items || [];
    const numeroNotaMostrar = n.numero_nota || n.numero_correlativo || n.id_nota_pedido;
    const fechaTexto = formatearFechaTextoEspanol(n.fecha_emision || n.creado_en);
    const total = parseFloat(n.monto_total || 0).toFixed(2);

    const filasHtml = items.map(it => {
      const importeItem = Number(
        it.total ?? it.subtotal ?? ((Number(it.peso) > 0 ? Number(it.peso) : Number(it.cantidad || 1)) * Number(it.precio_unitario || 0))
      );
      return `
      <tr>
        <td style="padding:10px 14px;border:1.5px solid #000;font-weight:600;font-size:13px;">${escaparHtml(it.descripcion)}</td>
        <td style="padding:10px 14px;border:1.5px solid #000;text-align:center;font-weight:600;font-size:13px;">${it.peso ? Number(it.peso).toFixed(2) : '-'}</td>
        <td style="padding:10px 14px;border:1.5px solid #000;text-align:right;font-weight:600;font-size:13px;">${Number(it.precio_unitario || 0).toFixed(2)}</td>
        <td style="padding:10px 14px;border:1.5px solid #000;text-align:right;font-weight:bold;font-size:13px;">${importeItem.toFixed(2)}</td>
      </tr>
    `;
    }).join('');

    const ventana = window.open('', '_blank', 'width=850,height=900');
    if (!ventana) return window.print();

    const baseUrl = window.location.origin;
    ventana.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Nota de Pedido - ${escaparHtml(numeroNotaMostrar)}</title>
        <style>
          @font-face {
            font-family: 'Berg Regular';
            src: url('${baseUrl}/fonts/Berg_Regular_400.ttf') format('truetype');
            font-weight: 400;
            font-style: normal;
          }
          body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 30px; font-size: 13px; }
          .logo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; gap: 16px; }
          .titulo-empresa { font-family: 'Berg Regular', Arial, Helvetica, sans-serif; font-size: 30px; font-weight: 400; letter-spacing: 1px; color: #000; text-align: center; flex: 1; }
          .datos-cliente { font-size: 14px; line-height: 1.8; margin-bottom: 20px; }
          .datos-cliente strong { font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; border: 1.5px solid #000; }
          th { border: 1.5px solid #000; padding: 10px 14px; font-size: 13px; font-weight: 900; text-transform: uppercase; }
          .total-row td { border: 1.5px solid #000; padding: 12px 14px; font-weight: 900; font-size: 14px; }
          @media print {
            body { margin: 15mm; }
          }
        </style>
      </head>
      <body>
        <div class="logo-header">
          <div style="width: 150px;">
            <img src="${baseUrl}/brand/logo-color-claro.png" alt="PROCESOS CÁRNICOS S.A.C." style="height: 82px; width: auto; object-fit: contain;" />
          </div>
          <div class="titulo-empresa">
            PROCESOS CÁRNICOS S.A.C.
          </div>
          <div style="width: 150px; text-align: right; font-size: 11px; font-weight: bold; color: #555;">
            ${escaparHtml(n.numero_nota || n.numero_correlativo || '')}
          </div>
        </div>

        <div class="datos-cliente">
          <div><strong>Cliente:</strong> ${escaparHtml(n.cliente_nombre)}</div>
          <div style="margin-top: 6px;"><strong>Fecha de venta:</strong> ${escaparHtml(fechaTexto)}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align:center;width:45%;">DESCRIPCIÓN</th>
              <th style="text-align:center;width:18%;">PESO</th>
              <th style="text-align:center;width:18%;">PRECIO</th>
              <th style="text-align:center;width:19%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${filasHtml}
            <tr class="total-row">
              <td colspan="3" style="text-align:center;font-weight:900;letter-spacing:1px;">TOTAL</td>
              <td style="text-align:right;font-weight:900;">${escaparHtml(total)}</td>
            </tr>
          </tbody>
        </table>

        ${n.observaciones ? `<div style="margin-top:20px;font-size:11px;color:#555;"><strong>Obs:</strong> ${escaparHtml(n.observaciones)}</div>` : ''}
        <script>window.onload = async function() { try { await document.fonts.ready; } catch(e) {} window.print(); };</script>
      </body>
      </html>
    `);
    ventana.document.close();
  };

  // Helper de nombre de tipo comprobante
  const nombreTipo = (tipo) => {
    switch (tipo) {
      case '01': return 'Factura Electrónica';
      case '03': return 'Boleta de Venta Electrónica';
      case '07': return 'Nota de Crédito Electrónica';
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

  // Clic secreto en el título o icono para desbloquear (5 clics en 3 segundos)
  const registrarClicSecreto = () => {
    const ahora = Date.now();
    if (ahora - clicsSecretosRef.current.lastTime > 3000) {
      clicsSecretosRef.current.count = 1;
    } else {
      clicsSecretosRef.current.count += 1;
    }
    clicsSecretosRef.current.lastTime = ahora;

    if (clicsSecretosRef.current.count >= 5) {
      clicsSecretosRef.current.count = 0;
      setPinDesbloqueo('');
      setErrorPin('');
      setModalDesbloqueoSecreto(true);
    }
  };

  // Manejo de búsqueda y detección de código de desbloqueo *7777#
  const handleCambioBusqueda = (valor) => {
    const limpio = valor.trim();
    if (limpio === '*7777#' || limpio === '*7777' || limpio.toLowerCase() === '*desbloqueo#') {
      localStorage.removeItem('erp_modo_emergencia');
      setModoEmergencia(false);
      setBusqueda('');
      toast.success('🔓 Código de desbloqueo aceptado. Modo normal restaurado.');
      return;
    }
    setBusqueda(valor);
  };

  // Botón de emergencia: Descarga de backup y activación de modo seguro
  const activarModoEmergenciaYDescargarBackup = () => {
    try {
      const backupData = {
        fecha_exportacion: new Date().toISOString(),
        usuario_responsable: usuario?.nombre || 'Administrador',
        empresa_emisora: {
          ruc: configSunat?.ruc_emisor || '20608725394',
          razon_social: configSunat?.razon_social || 'PROCESOS CARNICOS S.A.C.',
          modo_integracion: configSunat?.modo_integracion || 'DEMO_NUBEFACT'
        },
        notas_de_credito: comprobantes.filter(c => c.tipo_comprobante === '07' || c.estado_sunat === 'ANULADO'),
        notas_de_pedido: notasPedido,
        boletas_automaticas: comprobantes.filter(c => c.origen_facturacion === 'AUTOMATICA'),
        total_comprobantes: comprobantes.length,
        total_facturado_soles: totalMonto
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      link.href = url;
      link.download = `backup_seguridad_facturas_${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      localStorage.setItem('erp_modo_emergencia', 'true');
      setModoEmergencia(true);
      if (tabActiva === 'notas' || tabActiva === 'boletas_auto') {
        setTabActiva(tieneAccesoPedidos ? 'pedidos' : 'manual');
      }
      setModalConfirmarEmergencia(false);
      toast.success('🛡️ Respaldo descargado y Modo Seguro activado.');
    } catch (err) {
      toast.error('Error al generar respaldo: ' + err.message);
    }
  };

  const desbloquearConPin = (e) => {
    e.preventDefault();
    if (pinDesbloqueo.trim() === '7777') {
      localStorage.removeItem('erp_modo_emergencia');
      setModoEmergencia(false);
      setModalDesbloqueoSecreto(false);
      setPinDesbloqueo('');
      setErrorPin('');
      toast.success('🔓 Modo normal restaurado exitosamente.');
    } else {
      setErrorPin('Código incorrecto. Ingresa el PIN correcto (7777).');
    }
  };

  // Handlers para POS Cafetería / Venta Rápida de Mostrador
  const agregarProductoAlPos = (prod) => {
    const existe = carritoPos.find(it => it.id_producto === prod.id_producto);
    const precio = parseFloat(prod.precio_venta || 0);
    if (existe) {
      setCarritoPos(carritoPos.map(it => {
        if (it.id_producto === prod.id_producto) {
          const nuevaCant = it.cantidad + 1;
          return { ...it, cantidad: nuevaCant, subtotal: Number((nuevaCant * it.precio_unitario).toFixed(2)) };
        }
        return it;
      }));
    } else {
      setCarritoPos([
        ...carritoPos,
        {
          id_producto: prod.id_producto,
          descripcion: prod.nombre,
          cantidad: 1,
          peso: '',
          precio_unitario: precio,
          subtotal: precio,
          sku: prod.sku || 'PROD',
          unidad_medida: prod.unidad_medida || 'Unidad',
          codigo_unidad_sunat: prod.codigo_unidad_sunat || 'NIU'
        }
      ]);
    }
  };

  const modificarCantidadPos = (idx, delta) => {
    const item = carritoPos[idx];
    const nuevaCant = item.cantidad + delta;
    if (nuevaCant <= 0) {
      setCarritoPos(carritoPos.filter((_, i) => i !== idx));
    } else {
      const copia = [...carritoPos];
      copia[idx] = {
        ...item,
        cantidad: nuevaCant,
        subtotal: Number((nuevaCant * item.precio_unitario).toFixed(2))
      };
      setCarritoPos(copia);
    }
  };

  const eliminarItemPos = (idx) => {
    setCarritoPos(carritoPos.filter((_, i) => i !== idx));
  };

  const totalPosCalculado = useMemo(() => {
    return carritoPos.reduce((sum, it) => sum + (parseFloat(it.subtotal) || 0), 0);
  }, [carritoPos]);

  const vueltoPosCalculado = useMemo(() => {
    const entrega = parseFloat(montoEntregadoPos) || 0;
    const vuelto = entrega - totalPosCalculado;
    return vuelto > 0 ? Number(vuelto.toFixed(2)) : 0;
  }, [montoEntregadoPos, totalPosCalculado]);

  const handleCobrarPos = async () => {
    if (carritoPos.length === 0) {
      return toast.error('Agrega al menos un producto al pedido de mostrador.');
    }
    if (metodoPagoPos === 'EFECTIVO' && montoEntregadoPos) {
      const entrega = parseFloat(montoEntregadoPos) || 0;
      if (entrega < totalPosCalculado) {
        return toast.error(`El monto entregado (S/ ${entrega.toFixed(2)}) es menor al total a pagar (S/ ${totalPosCalculado.toFixed(2)}).`);
      }
    }

    setCobrandoPos(true);
    try {
      const medioPagoMap = {
        EFECTIVO: '008',
        YAPE: '003',
        TARJETA: '006'
      };

      const res = await api.post('/facturacion/emitir-manual', {
        id_cliente: 'CLIENTES_VARIOS',
        id_ubicacion: manualUbicacionId,
        tipo_comprobante: '03',
        forma_pago: 'CONTADO',
        medio_pago_sunat: medioPagoMap[metodoPagoPos] || '008',
        items: carritoPos.map(it => ({
          id_producto: it.id_producto,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          peso: it.peso || null,
          precio_unitario: it.precio_unitario,
          subtotal: it.subtotal,
          sku: it.sku,
          unidad_medida: it.unidad_medida,
          codigo_unidad_sunat: it.codigo_unidad_sunat
        }))
      });

      toast.success(res.data.mensaje || '¡Venta de mostrador registrada y stock descontado!');
      setCarritoPos([]);
      setMontoEntregadoPos('');
      await cargarDatos();

      if (res.data?.comprobante) {
        const compId = res.data.comprobante.id_comprobante;
        api.get(`/facturacion/${compId}/detalle`)
          .then(det => {
            setModalPdf({
              comprobante: det.data.comprobante,
              emisor: det.data.emisor,
              items: det.data.items
            });
          })
          .catch(() => {});
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo procesar la venta.');
    } finally {
      setCobrandoPos(false);
    }
  };

  const categoriasDisponibles = useMemo(() => {
    const cats = new Set();
    productos.forEach(p => {
      if (p.tipo_producto) cats.add(p.tipo_producto);
      else if (p.categoria) cats.add(p.categoria);
    });
    return ['TODOS', ...Array.from(cats)];
  }, [productos]);

  const productosPosFiltrados = useMemo(() => {
    return productos.filter(p => {
      if (categoriaPos !== 'TODOS') {
        const cat = p.tipo_producto || p.categoria;
        if (cat !== categoriaPos) return false;
      }
      if (busquedaProdPos.trim()) {
        const q = busquedaProdPos.toLowerCase();
        const nom = (p.nombre || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        return nom.includes(q) || sku.includes(q);
      }
      return true;
    });
  }, [productos, categoriaPos, busquedaProdPos]);

  // Handlers para Configuración SUNAT
  const handleProbarConexion = async () => {
    setProbandoConexion(true);
    try {
      const res = await api.post('/facturacion/probar-conexion', {
        modo_integracion: formConfig.modo_integracion,
        nubefact_ruta: formConfig.nubefact_ruta,
        nubefact_token: formConfig.nubefact_token
      });
      if (res.data.exito) {
        toast.success(res.data.mensaje || '¡Conexión verificada con éxito!');
      } else {
        toast.error(res.data.mensaje || 'No se pudo verificar la conexión.');
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al conectar con la API de NubeFact.');
    } finally {
      setProbandoConexion(false);
    }
  };

  const handleGuardarConfig = async (e) => {
    e.preventDefault();
    setGuardandoConfig(true);
    try {
      const res = await api.put('/facturacion/configuracion', formConfig);
      toast.success(res.data.mensaje || '¡Configuración guardada correctamente!');
      if (res.data.configuracion) {
        setConfigSunat(res.data.configuracion);
      }
      setModalConfig(false);
      await cargarDatos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la configuración.');
    } finally {
      setGuardandoConfig(false);
    }
  };

  // Comprobantes visibles considerando Modo Emergencia
  const comprobantesVisibles = useMemo(() => {
    if (modoEmergencia) {
      return comprobantes.filter(c => c.tipo_comprobante !== '07' && c.origen_facturacion !== 'AUTOMATICA');
    }
    return comprobantes;
  }, [comprobantes, modoEmergencia]);

  // Filtros del historial
  const comprobantesFiltrados = comprobantesVisibles.filter(c => {
    if (filtroTipo !== 'todos' && c.tipo_comprobante !== filtroTipo) return false;
    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase();
      const serieCorr = `${c.serie}-${c.correlativo}`.toLowerCase();
      const serieCorrPadded = `${c.serie}-${String(c.correlativo).padStart(8, '0')}`.toLowerCase();
      const cliente = (c.nombre_cliente || '').toLowerCase();
      return serieCorr.includes(q) || serieCorrPadded.includes(q) || cliente.includes(q);
    }
    return true;
  });

  const totalFacturas = comprobantesVisibles.filter(c => c.tipo_comprobante === '01').length;
  const totalBoletas = comprobantesVisibles.filter(c => c.tipo_comprobante === '03').length;
  const totalNotas = comprobantesVisibles.filter(c => c.tipo_comprobante === '07').length;
  const totalMonto = comprobantesVisibles
    .filter(c => c.estado_sunat === 'ACEPTADO' && c.tipo_comprobante !== '07')
    .reduce((acc, c) => acc + parseFloat(c.monto_total || 0), 0);

  // Múltiplos de 7 días por default (Req 6)
  const opcionesMultiplos7 = [7, 14, 21, 28, 35, 42, 49, 56, 63, 70];

  return (
    <div className="space-y-6">
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start sm:items-center space-x-3">
          <div
            onClick={registrarClicSecreto}
            className="p-3 bg-indigo-100 text-indigo-600 rounded-xl shadow-xs shrink-0 cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
            title="Facturación Electrónica SUNAT"
          >
            <Receipt size={24} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                onClick={registrarClicSecreto}
                className="text-2xl font-bold text-blue-950 cursor-pointer select-none"
                title="Facturación y Notas de Pedido"
              >
                Facturación y Notas de Pedido
              </h1>
              {configSunat?.modo_integracion === 'NUBEFACT_REAL' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Facturación Oficial SUNAT Activa</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                  <CheckCircle2 size={13} className="text-amber-600" />
                  <span>API Demo NubeFact v1 Activa</span>
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Empresa Emisora: <strong className="text-slate-700">{configSunat?.razon_social || 'PROCESOS CARNICOS S.A.C.'}</strong> (RUC: <span className="font-mono font-bold">{configSunat?.ruc_emisor || '20608725394'}</span>) · SUNAT UBL 2.1
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={cargarDatos}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Actualizar lista"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>

          {puedeEditarFacturacion && (
            <button
              type="button"
              onClick={() => setModalConfig(true)}
              className="flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-2 rounded-xl font-semibold text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              <Settings size={15} />
              <span>Configuración Emisor</span>
            </button>
          )}

          {/* BOTÓN DE EMERGENCIA (Oculto cuando está en modo emergencia) */}
          {!modoEmergencia && puedeEditarFacturacion && (
            <button
              type="button"
              onClick={() => setModalConfirmarEmergencia(true)}
              className="flex items-center space-x-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-2xs"
              title="Descargar respaldo y ocultar secciones sensibles"
            >
              <ShieldAlert size={15} className="text-rose-600" />
              <span>Modo Seguro</span>
            </button>
          )}

          {/* BOTÓN AL LADO DE EMITIR FACTURA: EMITIR NOTA DE PEDIDO (Req 16 - Oculto en modo emergencia) */}
          {!modoEmergencia && puedeEditarFacturacion && (
            <button
              onClick={abrirModalNotaPedido}
              className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <FileText size={17} />
              <span>Emitir Nota de Pedido</span>
            </button>
          )}

          {puedeEditarFacturacion && (
            <button
              onClick={() => {
                if (tieneAccesoPedidos && pedidosFacturables.length > 0) {
                  abrirModalEmitirConPedido();
                } else if (tieneAccesoManual) {
                  abrirModalManual();
                } else {
                  abrirModalEmitirConPedido();
                }
              }}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={17} />
              <span>Emitir Factura o Boleta</span>
            </button>
          )}
        </div>
      </div>

      {/* TARJETAS DE RESUMEN */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${modoEmergencia ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`}>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Facturas (F001)</span>
            <FileText size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-blue-950 mt-2">{totalFacturas}</div>
          <span className="text-xs text-slate-500 font-medium">Empresas con RUC</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Boletas (B001)</span>
            <Receipt size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-blue-950 mt-2">{totalBoletas}</div>
          <span className="text-xs text-slate-500 font-medium">Personas Naturales y Mostrador</span>
        </div>

        {!modoEmergencia && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notas de Pedido</span>
              <Tag size={18} className="text-amber-600" />
            </div>
            <div className="text-2xl font-black text-blue-950 mt-2">{notasPedido.length}</div>
            <span className="text-xs text-slate-500 font-medium">Documentos Internos Imprimibles</span>
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Facturado</span>
            <DollarSign size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-blue-950 mt-2">
            S/ {totalMonto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-xs text-emerald-600 font-bold">Aceptado SUNAT</span>
        </div>
      </div>

      {/* SELECTOR DE PESTAÑAS (SECCIONES FACTURACIÓN SEGÚN ASIGNACIÓN - Req 18 & 13) */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        {tieneAccesoPedidos && (
          <button
            type="button"
            onClick={() => setTabActiva('pedidos')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              tabActiva === 'pedidos'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers size={14} />
            <span>Facturación por Pedidos ({pedidosFacturables.length})</span>
          </button>
        )}

        {tieneAccesoManual && (
          <button
            type="button"
            onClick={() => setTabActiva('manual')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              tabActiva === 'manual'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Plus size={14} />
            <span>Facturación Manual / Mostrador</span>
          </button>
        )}

        {!modoEmergencia && (
          <button
            type="button"
            onClick={() => setTabActiva('notas')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              tabActiva === 'notas'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText size={14} />
            <span>Notas de Pedido ({notasPedido.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setTabActiva('historial')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
            tabActiva === 'historial'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Receipt size={14} />
          <span>Comprobantes Emitidos ({comprobantesVisibles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('gre')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
            tabActiva === 'gre'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Truck size={14} />
          <span>Guías de Remisión EG07 ({guiasRemision.length})</span>
        </button>

        {!modoEmergencia && (
          <button
            type="button"
            onClick={() => setTabActiva('boletas_auto')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
              tabActiva === 'boletas_auto'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Bot size={14} />
            <span>Boletas Automáticas</span>
          </button>
        )}
      </div>

      {/* PESTAÑA 1: FACTURACIÓN POR PEDIDOS */}
      {tabActiva === 'pedidos' && tieneAccesoPedidos && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-blue-950">Pedidos Pendientes de Facturación</h3>
              <p className="text-xs text-slate-500">
                Selecciona un pedido para emitir su factura o boleta electrónica SUNAT.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Identificador Pedido</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold text-center">Estado Preparación</th>
                  <th className="p-4 font-semibold text-center">Peso en Balanza</th>
                  <th className="p-4 font-semibold text-right">Monto Total</th>
                  <th className="p-4 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pedidosFacturables.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                      No hay pedidos pendientes de facturar en este momento.
                    </td>
                  </tr>
                ) : (
                  pedidosFacturables.map(p => {
                    const etiquetaFormateada = formatearEtiquetaPedido(p.id_pedido, p.fecha_limite_despacho || p.creado_en);
                    const estaListo = p.estado_pedido === 'LISTO_DESPACHO';

                    return (
                      <tr key={p.id_pedido} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-mono font-bold text-slate-900 text-xs">
                          {etiquetaFormateada}
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-slate-900">{p.cliente}</div>
                          <div className="text-[11px] text-slate-500 font-mono">Doc: {p.ruc_cliente || '-'}</div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                            estaListo
                              ? 'bg-amber-300 text-amber-950 border-amber-500'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {estaListo ? 'Listo para Despacho' : 'En Preparación'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          {p.peso_total ? (
                            <span className="font-bold text-amber-900 font-mono text-xs bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              ⚖️ {Number(p.peso_total).toFixed(2)} kg
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Por ingresar</span>
                          )}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-slate-900">
                          S/ {parseFloat(p.monto_total || 0).toFixed(2)}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            type="button"
                            onClick={() => abrirModalEmitirConPedido(p)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Facturar</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: FACTURACIÓN MANUAL / VENTA RÁPIDA DE MOSTRADOR */}
      {tabActiva === 'manual' && tieneAccesoManual && (
        <div className="space-y-4">
          {/* Barra superior con selector de modo */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Modo de Venta:</span>
              <div className="inline-flex p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSubmodoManual('CAFETERIA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    submodoManual === 'CAFETERIA'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Zap size={14} className="text-amber-500" />
                  <span>⚡ Venta Rápida de Mostrador / Cafetería</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubmodoManual('DETALLADO')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    submodoManual === 'DETALLADO'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText size={14} className="text-indigo-600" />
                  <span>🏢 Venta Detallada a Cliente (RUC / DNI)</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 shrink-0">📍 Descontar Stock de:</label>
              <select
                value={manualUbicacionId}
                onChange={(e) => setManualUbicacionId(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800"
              >
                {ubicaciones.map(u => (
                  <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {submodoManual === 'CAFETERIA' ? (
            /* INTERFAZ RÁPIDA DE MOSTRADOR / CAFETERÍA */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* COLUMNA IZQUIERDA: CATÁLOGO DE PRODUCTOS (7 COLS) */}
              <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-blue-950 flex items-center gap-2">
                      <ShoppingBag size={18} className="text-indigo-600" />
                      <span>Catálogo de Productos Disponibles</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Toca cualquier producto para sumarlo a la boleta con un solo clic.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-56">
                    <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={busquedaProdPos}
                      onChange={(e) => setBusquedaProdPos(e.target.value)}
                      placeholder="Buscar producto o código..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Filtros de Categoría / Tipo de Producto */}
                {categoriasDisponibles.length > 2 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1.5 text-xs">
                    {categoriasDisponibles.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoriaPos(cat)}
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs shrink-0 transition-colors cursor-pointer ${
                          categoriaPos === cat
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}

                {/* Grilla de productos rápidos */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto pr-1">
                  {productosPosFiltrados.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                      No se encontraron productos en esta categoría.
                    </div>
                  ) : (
                    productosPosFiltrados.map(prod => {
                      const yaEnCarrito = carritoPos.find(it => it.id_producto === prod.id_producto);
                      return (
                        <button
                          key={prod.id_producto}
                          type="button"
                          onClick={() => agregarProductoAlPos(prod)}
                          className={`p-3.5 min-h-[98px] rounded-xl border text-left transition-all relative flex flex-col justify-between hover:shadow-md cursor-pointer select-none ${
                            yaEnCarrito
                              ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                              : 'border-slate-200 bg-white hover:border-indigo-300'
                          }`}
                        >
                          {yaEnCarrito && (
                            <span className="absolute top-2 right-2 bg-indigo-600 text-white font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                              {yaEnCarrito.cantidad}
                            </span>
                          )}
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                              {prod.tipo_producto || prod.categoria || 'Producto'}
                            </span>
                            <span className="font-bold text-slate-900 text-xs line-clamp-2 mt-0.5 leading-snug">
                              {prod.nombre}
                            </span>
                          </div>
                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-mono font-black text-indigo-700">
                              S/ {parseFloat(prod.precio_venta || 0).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold">
                              + Agregar
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA: ORDEN DE VENTA / COBRO DE CAJA (5 COLS) */}
              <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-blue-950 flex items-center gap-1.5">
                      <Receipt size={17} className="text-emerald-600" />
                      <span>Boleta de Venta Rápida (B001)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Cliente: <strong className="text-slate-800">CLIENTES VARIOS / CONSUMIDOR FINAL</strong> (DNI: <span className="font-mono">00000000</span>)
                    </p>
                  </div>
                  {carritoPos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCarritoPos([])}
                      className="text-[11px] text-rose-600 hover:underline font-bold cursor-pointer"
                    >
                      Vaciar
                    </button>
                  )}
                </div>

                {/* Lista de ítems en carrito */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {carritoPos.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <ShoppingBag size={20} />
                      </div>
                      <p className="font-medium">El pedido está vacío.</p>
                      <p className="text-[11px] text-slate-400">Haz clic en los productos para agregarlos al cobro.</p>
                    </div>
                  ) : (
                    carritoPos.map((it, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-800 truncate leading-tight">{it.descripcion}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            S/ {it.precio_unitario.toFixed(2)} c/u
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => modificarCantidadPos(idx, -1)}
                            className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center cursor-pointer font-bold"
                            aria-label="Restar cantidad"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-7 text-center font-bold font-mono text-sm">{it.cantidad}</span>
                          <button
                            type="button"
                            onClick={() => modificarCantidadPos(idx, 1)}
                            className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center cursor-pointer font-bold"
                            aria-label="Sumar cantidad"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="text-right shrink-0 min-w-[60px]">
                          <span className="font-mono font-bold text-slate-900 block">
                            S/ {it.subtotal.toFixed(2)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => eliminarItemPos(idx)}
                          className="text-slate-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 cursor-pointer shrink-0"
                          title="Eliminar"
                          aria-label="Eliminar producto"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Métodos de Pago Rápido */}
                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <span className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                    Método de Pago
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setMetodoPagoPos('EFECTIVO')}
                      className={`py-3 px-2 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        metodoPagoPos === 'EFECTIVO'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Banknote size={17} />
                      <span>Efectivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPagoPos('YAPE')}
                      className={`py-3 px-2 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        metodoPagoPos === 'YAPE'
                          ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Zap size={17} />
                      <span>Yape / Plin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPagoPos('TARJETA')}
                      className={`py-3 px-2 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                        metodoPagoPos === 'TARJETA'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <CreditCard size={17} />
                      <span>Tarjeta</span>
                    </button>
                  </div>

                  {/* Cálculo de vuelto si paga en efectivo */}
                  {metodoPagoPos === 'EFECTIVO' && totalPosCalculado > 0 && (
                    <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-emerald-900">Paga con billete:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[10, 20, 50, 100].map(billete => (
                            <button
                              key={billete}
                              type="button"
                              onClick={() => setMontoEntregadoPos(String(billete))}
                              className="px-2.5 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-bold text-emerald-800 cursor-pointer"
                            >
                              S/ {billete}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setMontoEntregadoPos(String(totalPosCalculado))}
                            className="px-2.5 py-1.5 bg-white border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-bold text-emerald-800 cursor-pointer"
                          >
                            Exacto
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={montoEntregadoPos}
                            onChange={(e) => setMontoEntregadoPos(e.target.value)}
                            placeholder="Monto entregado S/"
                            className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                          />
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-800 block">Vuelto a entregar:</span>
                          <span className="text-sm font-mono font-black text-emerald-900">
                            S/ {vueltoPosCalculado.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Resumen de totales */}
                <div className="bg-slate-900 text-white p-4 rounded-xl space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Op. Gravada:</span>
                    <span className="font-mono">S/ {(totalPosCalculado / 1.18).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>I.G.V. (18% SUNAT):</span>
                    <span className="font-mono">S/ {(totalPosCalculado - (totalPosCalculado / 1.18)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-700 text-base font-black">
                    <span>TOTAL A PAGAR:</span>
                    <span className="text-emerald-400 font-mono">
                      S/ {totalPosCalculado.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Botón de cobro rápido */}
                <button
                  type="button"
                  onClick={handleCobrarPos}
                  disabled={cobrandoPos || carritoPos.length === 0}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {cobrandoPos ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  <span>{cobrandoPos ? 'Emitiendo Boleta SUNAT...' : `⚡ Cobrar e Imprimir Boleta (S/ ${totalPosCalculado.toFixed(2)})`}</span>
                </button>
              </div>
            </div>
          ) : (
            /* MODO DETALLADO A CLIENTE ESPECÍFICO (RUC O DNI) */
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-blue-950">Facturación Detallada por Cliente</h3>
                  <p className="text-xs text-slate-500">
                    Para clientes corporativos con RUC (Factura) o clientes que soliciten Boleta a su nombre con DNI.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={abrirModalManual}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus size={15} />
                  <span>Abrir Formulario de Emisión Completo</span>
                </button>
              </div>
              <p className="text-xs text-slate-600">
                Haz clic en el botón superior para ingresar los datos del comprobante corporativo, plazos de crédito a 7, 14, 21 o 28 días, cuotas o detracciones tributarias.
              </p>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: NOTAS DE PEDIDO (Req 13, 16 - Solo si no está en Modo Emergencia) */}
      {tabActiva === 'notas' && !modoEmergencia && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-base font-bold text-blue-950">Notas de Pedido Registradas</h3>
              <p className="text-xs text-slate-500">
                Documentos comerciales internos con formato oficial de Proceso Cárnicos para impresión rápida.
              </p>
            </div>
            {puedeEditarFacturacion && (
              <button
                type="button"
                onClick={abrirModalNotaPedido}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus size={15} />
                <span>+ Emitir Nota de Pedido</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Número Documento</th>
                  <th className="p-4 font-semibold">Cliente</th>
                  <th className="p-4 font-semibold">Fecha de Venta</th>
                  <th className="p-4 font-semibold">Sede / Emisor</th>
                  <th className="p-4 font-semibold text-right">Importe Total</th>
                  <th className="p-4 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {notasPedido.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                      No hay notas de pedido registradas todavía. Puedes crear una con el botón de arriba.
                    </td>
                  </tr>
                ) : (
                  notasPedido.map(np => (
                    <tr key={np.id_nota_pedido} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-mono font-bold text-slate-900 text-xs">
                        {np.numero_nota || np.numero_correlativo || `NotaPedido#${np.id_nota_pedido}`}
                      </td>
                      <td className="p-4 font-semibold text-slate-900">
                        {np.cliente_nombre}
                      </td>
                      <td className="p-4 text-slate-600 text-xs">
                        {formatearFechaTextoEspanol(np.fecha_emision || np.creado_en)}
                      </td>
                      <td className="p-4 text-slate-600 text-xs">
                        {np.nombre_ubicacion || 'Sede Principal'}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        S/ {parseFloat(np.monto_total || 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => abrirDetalleNota(np)}
                          className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Eye size={13} />
                          <span>Ver / Imprimir</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: GUÍAS DE REMISIÓN ELECTRÓNICAS (EG07) */}
      {tabActiva === 'gre' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-sky-50/40">
            <div>
              <h3 className="text-base font-bold text-blue-950">Guías de Remisión Electrónica (Serie EG07)</h3>
              <p className="text-xs text-slate-500">
                Emitidas automáticamente junto a cada Factura (01) • Documentos relacionados vinculados automáticamente en SUNAT
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4">GRE N°</th>
                  <th className="p-4">Factura Asociada</th>
                  <th className="p-4">Destinatario</th>
                  <th className="p-4">Traslado</th>
                  <th className="p-4">Vehículo / Conductor</th>
                  <th className="p-4 text-right">Peso Total</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guiasRemision.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-10 text-center text-slate-400">
                      Aún no se han emitido Guías de Remisión EG07. Se generan automáticamente al emitir una Factura (01).
                    </td>
                  </tr>
                ) : (
                  guiasRemision.map((g) => (
                    <tr key={g.id_gre} className="hover:bg-slate-50">
                      <td className="p-4 font-mono font-bold text-sky-800">
                        {g.serie}-{String(g.correlativo).padStart(8, '0')}
                      </td>
                      <td className="p-4 font-mono text-slate-700">
                        {g.factura_serie ? `${g.factura_serie}-${String(g.factura_correlativo).padStart(8, '0')}` : '-'}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{g.destinatario_razon_social}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{g.destinatario_num_doc}</div>
                      </td>
                      <td className="p-4 text-slate-600">
                        <div>Inicio: <span className="font-mono font-bold">{g.fecha_inicio_traslado_iso}</span></div>
                        <div className="text-[11px] truncate max-w-xs">{g.punto_llegada_direccion}</div>
                      </td>
                      <td className="p-4 text-slate-600">
                        <div className="font-mono font-bold">{g.vehiculo_placa || '-'}</div>
                        <div className="text-[11px] truncate max-w-[180px]">{g.conductor_nombres || '-'}</div>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        {Number(g.peso_bruto_total || 0).toFixed(2)} {g.unidad_peso_bruto || 'KGM'}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => setGuiaPreview(g)}
                          className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Eye size={13} />
                          <span>Ver / Imprimir</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PESTAÑA: BOLETAS AUTOMÁTICAS Y COLA DE IMPRESIÓN */}
      {tabActiva === 'boletas_auto' && !modoEmergencia && (
        <PanelBoletasAutomaticas
          ubicaciones={ubicaciones}
          onBoletaGenerada={cargarDatos}
          puedeEditar={puedeEditarFacturacion}
        />
      )}

      {/* PESTAÑA 4: HISTORIAL DE COMPROBANTES EMITIDOS */}
      {tabActiva === 'historial' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltroTipo('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  filtroTipo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Todos ({comprobantesVisibles.length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('01')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  filtroTipo === '01' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Facturas ({totalFacturas})
              </button>
              <button
                type="button"
                onClick={() => setFiltroTipo('03')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  filtroTipo === '03' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Boletas ({totalBoletas})
              </button>
              {!modoEmergencia && (
                <button
                  type="button"
                  onClick={() => setFiltroTipo('07')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    filtroTipo === '07' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Notas de Crédito ({totalNotas})
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => handleCambioBusqueda(e.target.value)}
                placeholder="Buscar por serie, número o cliente..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Comprobante</th>
                  <th className="p-4 font-semibold">Cliente / Razón Social</th>
                  <th className="p-4 font-semibold text-center">Fecha Emisión</th>
                  <th className="p-4 font-semibold text-center">Peso</th>
                  <th className="p-4 font-semibold text-right">Importe Total</th>
                  <th className="p-4 font-semibold text-center">Estado SUNAT</th>
                  <th className="p-4 font-semibold text-center">Archivos Tributarios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {comprobantesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400 text-xs">
                      No hay comprobantes para mostrar.
                    </td>
                  </tr>
                ) : (
                  comprobantesFiltrados.map(comp => (
                    <tr key={comp.id_comprobante} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="font-mono font-bold text-slate-900">
                          {comp.serie}-{String(comp.correlativo).padStart(8, '0')}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeTipo(comp.tipo_comprobante)}`}>
                          {nombreTipo(comp.tipo_comprobante)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{comp.nombre_cliente}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{comp.documento_cliente}</div>
                      </td>
                      <td className="p-4 text-center text-xs text-slate-600">
                        {new Date(comp.fecha_emision).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4 text-center">
                        {comp.peso_total ? (
                          <span className="font-bold text-amber-900 text-xs font-mono bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            ⚖️ {Number(comp.peso_total).toFixed(2)} kg
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900">
                        S/ {parseFloat(comp.monto_total || 0).toFixed(2)}
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          <CheckCircle2 size={13} />
                          <span>Aceptado</span>
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={cargandoPdf}
                            onClick={() => {
                              setCargandoPdf(true);
                              api.get(`/facturacion/${comp.id_comprobante}/detalle`)
                                .then(res => setModalPdf({ comprobante: res.data.comprobante, emisor: res.data.emisor, items: res.data.items }))
                                .catch(() => toast.error('No se pudo cargar el detalle.'))
                                .finally(() => setCargandoPdf(false));
                            }}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <Eye size={12} />
                            <span>PDF/A4</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: EMITIR FACTURA / BOLETA DESDE PEDIDO */}
      {modalEmitir && pedidoSeleccionado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => !procesando && setModalEmitir(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <FileText size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                  Emitir Comprobante Electrónico (SUNAT)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalEmitir(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEmitirComprobante} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* 1. Selector de Pedido Formateado (Req 1) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Pedido a Facturar *
                </label>
                <select
                  value={pedidoSeleccionado.id_pedido}
                  onChange={(e) => {
                    const sel = pedidosFacturables.find(p => String(p.id_pedido) === e.target.value);
                    if (sel) seleccionarPedido(sel);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white focus:ring-2 focus:ring-indigo-500 font-mono"
                >
                  {pedidosFacturables.map(p => (
                    <option key={p.id_pedido} value={p.id_pedido}>
                      {formatearEtiquetaPedido(p.id_pedido, p.fecha_limite_despacho || p.creado_en)} - Cliente: {p.cliente} (S/ {parseFloat(p.monto_total).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Tipo de Comprobante con Validación RUC/DNI (Req 17) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  2. Tipo de Comprobante Electrónico *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('01')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      tipoComprobante === '01'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="text-sm">Factura (F001)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Para empresas con RUC</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoComprobante('03')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      tipoComprobante === '03'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <div className="text-sm">Boleta de Venta (B001)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Exclusivo personas con DNI</div>
                  </button>
                </div>

                {/* Advertencia en vivo si Boleta tiene RUC (Req 17) */}
                {tipoComprobante === '03' && (pedidoSeleccionado.tipo_documento_cliente === '6' || String(pedidoSeleccionado.ruc_cliente || '').length === 11) && (
                  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-600 shrink-0" />
                    <span>
                      ⚠️ SUNAT prohíbe emitir Boletas de Venta a clientes con RUC. Debe usar DNI (8 dígitos) o cambiar a Factura (01).
                    </span>
                  </div>
                )}
              </div>

              {/* 3. Ítems del Pedido: Precio y Peso Editables (Req 9 & 10) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                    3. Detalle de Ítems (Precios y Pesos Editables)
                  </label>
                  <span className="text-[11px] text-slate-500">Puedes corregir precios o pesos antes de emitir</span>
                </div>

                <div className="space-y-2">
                  {itemsEditables.map((it, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center text-xs">
                      <div className="sm:col-span-5 font-semibold text-slate-800 truncate">
                        {it.descripcion}
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-500 mb-0.5">Peso (kg):</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.peso}
                          onChange={(e) => actualizarItemEditable(idx, 'peso', e.target.value)}
                          placeholder="Ej: 11.60"
                          className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] text-slate-500 mb-0.5">Precio (S/):</label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.precio_unitario}
                          onChange={(e) => actualizarItemEditable(idx, 'precio_unitario', e.target.value)}
                          className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                        />
                      </div>
                      <div className="sm:col-span-3 text-right">
                        <span className="text-[10px] text-slate-500 block">Subtotal:</span>
                        <span className="font-mono font-bold text-indigo-700">
                          S/ {parseFloat(it.subtotal || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Peso Total General en Balanza (Req 10) */}
                <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-bold text-slate-700">Peso Total en Balanza (kg): </span>
                    <span className="text-slate-500">
                      {pedidoSeleccionado.estado_pedido === 'LISTO_DESPACHO'
                        ? '(Pre-cargado desde balanza de despacho)'
                        : '(Ingresar manualmente si el pedido aún no está listo)'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={pesoTotalFactura}
                    onChange={(e) => setPesoTotalFactura(e.target.value)}
                    placeholder="Ej: 11.60 kg"
                    className="w-36 p-1.5 bg-white border border-amber-300 rounded-lg font-mono font-bold text-xs text-amber-950 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* 4. Condición de Pago, Plazos en múltiplos de 7 y Tarjeta Forzada (Req 6, 7, 8) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    4. Condición de Pago
                  </label>
                  <select
                    value={formaPago}
                    onChange={(e) => {
                      const nuevaForma = e.target.value;
                      setFormaPago(nuevaForma);
                      if (nuevaForma === 'CREDITO') {
                        setMedioPagoSunat('006');
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="CONTADO">💵 Al Contado</option>
                    <option value="CREDITO">🗓️ Al Crédito (Obliga Tarjeta / Cuotas)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    5. Medio de Pago (Catálogo 59 SUNAT)
                  </label>
                  <select
                    disabled={formaPago === 'CREDITO'}
                    value={medioPagoSunat}
                    onChange={(e) => setMedioPagoSunat(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="008">Transferencia Bancaria (008)</option>
                    <option value="009">Efectivo (009)</option>
                    <option value="005">Tarjeta de Débito (005)</option>
                    <option value="006">Tarjeta de Crédito (006)</option>
                    <option value="999">Billetera Digital Yape / Plin (999)</option>
                  </select>
                  {formaPago === 'CREDITO' && (
                    <span className="text-[10px] text-purple-700 font-semibold mt-1 block">
                      🔒 Por regla de Crédito, se fuerza a Tarjeta de Crédito.
                    </span>
                  )}
                </div>
              </div>

              {/* Si es CRÉDITO: Plazo en múltiplos de 7 y Cantidad de Cuotas (Req 6 y 8) */}
              {formaPago === 'CREDITO' && (
                <div className="p-4 bg-purple-50/80 rounded-xl border border-purple-200 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-purple-950 uppercase mb-1">
                        Plazo de Pago (Múltiplos de 7):
                      </label>
                      <select
                        value={esPlazoPersonalizado ? 'otro' : diasCredito}
                        onChange={(e) => {
                          if (e.target.value === 'otro') {
                            setEsPlazoPersonalizado(true);
                          } else {
                            setEsPlazoPersonalizado(false);
                            setDiasCredito(Number(e.target.value));
                          }
                        }}
                        className="w-full p-2 bg-white border border-purple-300 rounded-lg font-bold text-purple-950 text-xs"
                      >
                        {opcionesMultiplos7.map(d => (
                          <option key={d} value={d}>
                            {d} días ({d / 7} semana{d / 7 > 1 ? 's' : ''})
                          </option>
                        ))}
                        <option value="otro">✍️ Escribir otro plazo...</option>
                      </select>
                      {esPlazoPersonalizado && (
                        <input
                          type="number"
                          min="1"
                          value={diasCredito}
                          onChange={(e) => setDiasCredito(parseInt(e.target.value, 10) || 1)}
                          placeholder="Número de días"
                          className="w-full mt-1.5 p-1.5 bg-white border border-purple-300 rounded-lg text-xs font-bold"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block font-bold text-purple-950 uppercase mb-1">
                        Cantidad de Cuotas (Req 8):
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="48"
                        value={cantidadCuotas}
                        onChange={(e) => setCantidadCuotas(parseInt(e.target.value, 10) || 1)}
                        className="w-full p-2 bg-white border border-purple-300 rounded-lg font-bold text-purple-950 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 5. División de Pago entre Varios Clientes / Razones Sociales (Req 2 - Opción A) */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center space-x-2.5 cursor-pointer font-bold text-xs text-slate-800">
                  <input
                    type="checkbox"
                    checked={esPagoDividido}
                    onChange={(e) => togglePagoDividido(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span>Dividir pago de este pedido entre varios clientes / razones sociales</span>
                </label>

                {esPagoDividido && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <p className="text-[11px] text-slate-500">
                      Asigna el porcentaje o monto que pagará cada cliente. El total debe sumar 100% (S/ {totalItemsCalculado.toFixed(2)}).
                    </p>
                    {pagosDivididos.map((pago, pIdx) => (
                      <div key={pIdx} className="bg-white p-2.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                        <div className="sm:col-span-5">
                          <select
                            value={pago.id_cliente}
                            onChange={(e) => actualizarPagoDividido(pIdx, 'id_cliente', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg font-medium text-xs bg-white"
                          >
                            <option value="">Selecciona Cliente...</option>
                            {clientes.map(c => (
                              <option key={c.id_cliente} value={c.id_cliente}>
                                {c.nombre_comercial || c.razon_social_o_nombre} ({c.numero_documento})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <select
                            value={pago.tipo_comprobante}
                            onChange={(e) => actualizarPagoDividido(pIdx, 'tipo_comprobante', e.target.value)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg font-bold text-xs bg-white"
                          >
                            <option value="01">Factura</option>
                            <option value="03">Boleta</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              value={pago.porcentaje}
                              onChange={(e) => actualizarPagoDividido(pIdx, 'porcentaje', e.target.value)}
                              placeholder="%"
                              className="w-full p-1.5 pr-6 border border-slate-300 rounded-lg font-mono text-xs text-center font-bold"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-500 pointer-events-none">%</span>
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={pago.monto}
                            onChange={(e) => actualizarPagoDividido(pIdx, 'monto', e.target.value)}
                            placeholder="S/"
                            className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs"
                          />
                        </div>
                        <div className="sm:col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => eliminarFilaPagoDividido(pIdx)}
                            className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={agregarFilaPagoDividido}
                      className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer pt-1"
                    >
                      + Agregar otro cliente a la división
                    </button>
                  </div>
                )}
              </div>

              {tipoComprobante === '01' && (
                <SeccionGreFactura
                  greForm={greFormPedido}
                  setGreForm={setGreFormPedido}
                  catalogosGre={catalogosGre}
                  esAdminCentral={esAdminCentral}
                  onCatalogosActualizados={recargarCatalogosGre}
                  destinatarioNombre={pedidoSeleccionado.cliente}
                  destinatarioDocumento={pedidoSeleccionado.ruc_cliente || pedidoSeleccionado.documento_cliente}
                  pesoBrutoTotal={pesoTotalFactura || itemsEditables.reduce((acc, it) => acc + (Number(it.peso || it.cantidad || 0)), 0)}
                  bienesResumen={itemsEditables}
                />
              )}

              {/* 6. Resumen de Precios y Peso (Req 11 & 12) */}
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-1.5 text-xs shadow-md">
                <div className="flex justify-between text-slate-300">
                  <span>Cliente Principal:</span>
                  <span className="font-bold text-white">{pedidoSeleccionado.cliente}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Peso Total en Balanza (Req 11, 12):</span>
                  <span className="font-mono font-bold text-amber-400">
                    {pesoTotalFactura ? `${parseFloat(pesoTotalFactura).toFixed(2)} kg` : '(Sin registrar)'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Subtotal Gravado (Sin IGV):</span>
                  <span className="font-mono">S/ {(totalItemsCalculado / 1.18).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>I.G.V. (18% SUNAT):</span>
                  <span className="font-mono">S/ {(totalItemsCalculado - (totalItemsCalculado / 1.18)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-700 text-sm font-black">
                  <span>IMPORTE TOTAL:</span>
                  <span className="text-emerald-400 font-mono">
                    S/ {totalItemsCalculado.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEmitir(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {procesando && <Loader2 size={14} className="animate-spin" />}
                  <span>{procesando ? 'Enviando a SUNAT...' : 'Emitir Comprobante Oficial'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: FACTURACIÓN MANUAL (Req 3 & 18) */}
      {modalManual && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => !procesando && setModalManual(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Plus size={18} className="text-emerald-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                  Facturación Manual Directa (Descuenta Inventario)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalManual(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEmitirManual} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Cliente *
                  </label>
                  <select
                    value={manualClienteId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setManualClienteId(val);
                      if (val === 'CLIENTES_VARIOS') {
                        setManualTipoComp('03');
                      } else {
                        const cliObj = clientes.find(c => String(c.id_cliente) === String(val));
                        if (cliObj?.direccion) {
                          setGreFormManual((prev) => ({ ...prev, punto_llegada_direccion: cliObj.direccion }));
                        }
                      }
                    }}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  >
                    <option value="CLIENTES_VARIOS">⚡ CLIENTES VARIOS / CONSUMIDOR FINAL (Doc: 00000000 - Mostrador)</option>
                    {clientes.filter(c => c.numero_documento !== '00000000').map(c => (
                      <option key={c.id_cliente} value={c.id_cliente}>
                        {c.nombre_comercial || c.razon_social_o_nombre} ({c.numero_documento})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Sede / Almacén (Descuenta Stock) *
                  </label>
                  <select
                    value={manualUbicacionId}
                    onChange={(e) => setManualUbicacionId(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  >
                    {ubicaciones.map(u => (
                      <option key={u.id_ubicacion} value={u.id_ubicacion}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tipo de Comprobante *
                  </label>
                  <select
                    value={manualTipoComp}
                    onChange={(e) => setManualTipoComp(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="01">Factura (01 - Empresas con RUC)</option>
                    <option value="03">Boleta de Venta (03 - Personas con DNI)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Peso Total en Balanza (kg)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={manualPesoTotal}
                    onChange={(e) => setManualPesoTotal(e.target.value)}
                    placeholder="Ej: 11.60"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Filas de productos */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Productos a Facturar y Descontar
                  </span>
                  <button
                    type="button"
                    onClick={agregarFilaManual}
                    className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    + Agregar Producto
                  </button>
                </div>

                {manualItems.map((it, idx) => {
                  const prodManual = productos.find(pr => String(pr.id_producto) === String(it.id_producto));
                  const infoUnidadManual = obtenerInfoUnidad(prodManual);
                  return (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Producto:</label>
                      <select
                        value={it.id_producto}
                        onChange={(e) => actualizarFilaManual(idx, 'id_producto', e.target.value)}
                        className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white"
                      >
                        {productos.map(pr => (
                          <option key={pr.id_producto} value={pr.id_producto}>
                            {pr.nombre} ({obtenerInfoUnidad(pr).simbolo})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Cant ({infoUnidadManual.simbolo}):</label>
                      <input
                        type="number"
                        min={infoUnidadManual.esEntero ? '1' : '0'}
                        step={infoUnidadManual.esEntero ? '1' : 'any'}
                        value={it.cantidad}
                        onChange={(e) => actualizarFilaManual(idx, 'cantidad', e.target.value)}
                        className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Peso (kg):</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.peso}
                        onChange={(e) => actualizarFilaManual(idx, 'peso', e.target.value)}
                        placeholder="Ej: 11.60"
                        className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Precio (S/):</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.precio_unitario}
                        onChange={(e) => actualizarFilaManual(idx, 'precio_unitario', e.target.value)}
                        className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                    <div className="sm:col-span-1 text-right">
                      <span className="text-[10px] text-slate-400 block">Total:</span>
                      <span className="font-mono font-bold text-indigo-700">
                        {parseFloat(it.subtotal || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => eliminarFilaManual(idx)}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>

              {manualTipoComp === '01' && (() => {
                const cliManualObj = clientes.find(c => String(c.id_cliente) === String(manualClienteId));
                return (
                  <SeccionGreFactura
                    greForm={greFormManual}
                    setGreForm={setGreFormManual}
                    catalogosGre={catalogosGre}
                    esAdminCentral={esAdminCentral}
                    onCatalogosActualizados={recargarCatalogosGre}
                    destinatarioNombre={cliManualObj?.razon_social_o_nombre || cliManualObj?.nombre_comercial || 'Cliente'}
                    destinatarioDocumento={cliManualObj?.numero_documento || ''}
                    pesoBrutoTotal={manualPesoTotal || manualItems.reduce((acc, it) => acc + (Number(it.peso || it.cantidad || 0)), 0)}
                    bienesResumen={manualItems}
                  />
                );
              })()}

              {/* Total y botones */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block">Total a Facturar:</span>
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    S/ {totalManualCalculado.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block">Peso Total:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {manualPesoTotal ? `${parseFloat(manualPesoTotal).toFixed(2)} kg` : '-'}
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalManual(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {procesando && <Loader2 size={14} className="animate-spin" />}
                  <span>{procesando ? 'Emitiendo...' : 'Emitir Factura Manual'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CREAR NOTA DE PEDIDO (Req 13, 16) */}
      {modalNotaPedido && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => !guardandoNota && setModalNotaPedido(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <FileText size={18} className="text-amber-200" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                  Nueva Nota de Pedido (PROCESOS CÁRNICOS S.A.C.)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalNotaPedido(false)}
                className="text-amber-200 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCrearNotaPedido} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Cliente / Razón Social *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Javier Daza"
                    value={formNota.cliente_nombre}
                    onChange={(e) => setFormNota({ ...formNota, cliente_nombre: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    DNI / RUC (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 10458796 o 2060..."
                    value={formNota.cliente_documento}
                    onChange={(e) => setFormNota({ ...formNota, cliente_documento: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              {/* Filas de productos tipo ticket imagen */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Filas de la Nota (DESCRIPCIÓN | PESO | PRECIO | TOTAL)
                  </span>
                  <button
                    type="button"
                    onClick={agregarFilaNota}
                    className="text-xs text-amber-700 font-bold hover:underline cursor-pointer"
                  >
                    + Agregar otra fila
                  </button>
                </div>

                {formNota.items.map((it, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Descripción:</label>
                      <input
                        type="text"
                        required
                        value={it.descripcion}
                        onChange={(e) => actualizarFilaNota(idx, 'descripcion', e.target.value)}
                        placeholder="Ej: Chuleta de cogote"
                        className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Peso (kg):</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.peso}
                        onChange={(e) => actualizarFilaNota(idx, 'peso', e.target.value)}
                        placeholder="11.60"
                        className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs font-bold text-center"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Precio:</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.precio_unitario}
                        onChange={(e) => actualizarFilaNota(idx, 'precio_unitario', e.target.value)}
                        placeholder="15.00"
                        className="w-full p-1.5 border border-slate-300 rounded-lg font-mono text-xs font-bold text-center"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-slate-400 mb-0.5">Total:</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={it.total}
                        onChange={(e) => actualizarFilaNota(idx, 'total', e.target.value)}
                        placeholder="174.00"
                        className="w-full p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-xs text-right"
                      />
                    </div>
                    <div className="sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => eliminarFilaNota(idx)}
                        className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Row */}
              <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-300">Total Nota de Pedido:</span>
                <span className="text-2xl font-black text-amber-400 font-mono">
                  S/ {totalNotaCalculado.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalNotaPedido(false)}
                  disabled={guardandoNota}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoNota}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {guardandoNota && <Loader2 size={14} className="animate-spin" />}
                  <span>{guardandoNota ? 'Guardando...' : 'Crear y Ver Nota'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: VER / IMPRIMIR NOTA DE PEDIDO (IDÉNTICA A LA IMAGEN) */}
      {modalVerNota && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setModalVerNota(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold font-mono">
                {modalVerNota.nota?.numero_nota || modalVerNota.nota?.numero_correlativo || 'Nota de Pedido'}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={imprimirNotaPedidoActual}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Imprimir Nota</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalVerNota(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Hoja oficial PROCESOS CÁRNICOS S.A.C. */}
            <div className="p-6 sm:p-8 bg-white text-slate-900 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <LogoProcesosCarnicos className="h-20 sm:h-24 w-auto shrink-0" />
                <h2 className="text-2xl sm:text-3xl font-brand text-black tracking-wide text-center flex-1">
                  PROCESOS CÁRNICOS S.A.C.
                </h2>
                <div className="hidden sm:block w-20"></div>
              </div>

              <div className="space-y-1 text-sm font-semibold">
                <div>
                  <strong>Cliente:</strong> {modalVerNota.nota?.cliente_nombre}
                </div>
                <div>
                  <strong>Fecha de venta:</strong> {formatearFechaTextoEspanol(modalVerNota.nota?.fecha_emision || modalVerNota.nota?.creado_en)}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse border-[1.5px] border-black text-xs font-semibold">
                  <thead>
                    <tr className="border-b-[1.5px] border-black text-center font-black">
                      <th className="p-3 border-r-[1.5px] border-black uppercase w-[45%] text-center">
                        DESCRIPCIÓN
                      </th>
                      <th className="p-3 border-r-[1.5px] border-black uppercase w-[18%] text-center">
                        PESO
                      </th>
                      <th className="p-3 border-r-[1.5px] border-black uppercase w-[18%] text-center">
                        PRECIO
                      </th>
                      <th className="p-3 uppercase w-[19%] text-center">
                        TOTAL
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(modalVerNota.items || []).map((it, idx) => (
                      <tr key={idx} className="border-b-[1.5px] border-black">
                        <td className="p-3 border-r-[1.5px] border-black text-left">
                          {it.descripcion}
                        </td>
                        <td className="p-3 border-r-[1.5px] border-black text-center font-mono">
                          {it.peso ? Number(it.peso).toFixed(2) : '-'}
                        </td>
                        <td className="p-3 border-r-[1.5px] border-black text-right font-mono">
                          {Number(it.precio_unitario || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono font-bold">
                          {Number(it.total ?? it.subtotal ?? ((Number(it.peso) > 0 ? Number(it.peso) : Number(it.cantidad || 1)) * Number(it.precio_unitario || 0))).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-black text-sm">
                      <td colSpan="3" className="p-3 border-r-[1.5px] border-black text-center tracking-widest">
                        TOTAL
                      </td>
                      <td className="p-3 text-right font-mono">
                        {Number(modalVerNota.nota?.monto_total || 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: VER / IMPRIMIR COMPROBANTE SUNAT (A4 REGLAMENTARIO) */}
      {modalPdf?.comprobante && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setModalPdf(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <span className="text-sm font-bold">
                {nombreTipo(modalPdf.comprobante.tipo_comprobante)} · {modalPdf.comprobante.serie}-{String(modalPdf.comprobante.correlativo).padStart(8, '0')}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Imprimir A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalPdf(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-5 bg-white text-xs">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-blue-950 pb-4">
                <div className="flex items-center gap-4">
                  <LogoProcesosCarnicos className="h-16 sm:h-20 w-auto shrink-0" />
                  <div>
                    <h2 className="text-xl sm:text-2xl font-brand text-blue-950">PROCESOS CARNICOS S.A.C.</h2>
                    <p className="text-xs text-slate-500 mt-1">{configSunat?.direccion_fiscal || 'Arequipa / Lima - Perú'}</p>
                    <p className="text-xs text-slate-500">Sede: {modalPdf.comprobante.nombre_ubicacion || 'Principal'}</p>
                  </div>
                </div>
                <div className="border-2 border-blue-950 p-3 rounded-xl text-center min-w-[220px]">
                  <p className="font-bold">R.U.C. N° 20608725394</p>
                  <p className="font-extrabold text-blue-950 my-1">{nombreTipo(modalPdf.comprobante.tipo_comprobante).toUpperCase()}</p>
                  <p className="font-mono text-base font-bold">{modalPdf.comprobante.serie}-{String(modalPdf.comprobante.correlativo).padStart(8, '0')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div><strong>Cliente:</strong> {modalPdf.comprobante.nombre_cliente}</div>
                <div><strong>Fecha:</strong> {new Date(modalPdf.comprobante.fecha_emision).toLocaleDateString('es-PE')}</div>
                <div><strong>Doc:</strong> {modalPdf.comprobante.cliente_documento || modalPdf.comprobante.documento_cliente || '-'}</div>
                <div><strong>Forma Pago:</strong> {modalPdf.comprobante.forma_pago || 'CONTADO'}</div>
                {modalPdf.comprobante.peso_total && (
                  <div><strong>Peso Total:</strong> {Number(modalPdf.comprobante.peso_total).toFixed(2)} kg</div>
                )}
              </div>

              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="p-2 border-r border-slate-200">Descripción</th>
                    <th className="p-2 text-center border-r border-slate-200">Cant / Peso</th>
                    <th className="p-2 text-right border-r border-slate-200">P. Unit</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(modalPdf.items || []).map((it, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="p-2 border-r border-slate-100">{it.descripcion}</td>
                      <td className="p-2 text-center border-r border-slate-100">{it.peso ? `${it.peso} kg` : it.cantidad}</td>
                      <td className="p-2 text-right border-r border-slate-100 font-mono">S/ {parseFloat(it.precio_unitario || 0).toFixed(2)}</td>
                      <td className="p-2 text-right font-mono font-bold">S/ {parseFloat(it.subtotal || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end pt-2">
                <div className="w-64 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span>Op. Gravada:</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_gravada || (modalPdf.comprobante.monto_total / 1.18)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>I.G.V. (18%):</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_igv || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-300 font-bold text-sm text-blue-950">
                    <span>TOTAL:</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN SUNAT RESTAURADO */}
      {modalConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => !guardandoConfig && !probandoConexion && setModalConfig(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <Settings size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                  Configuración Emisor SUNAT y NubeFact
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalConfig(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGuardarConfig} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              {/* 1. Selector de Modo: Demo vs Oficial Real */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Modo de Facturación Electrónica *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormConfig({ ...formConfig, modo_integracion: 'DEMO_NUBEFACT' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formConfig.modo_integracion === 'DEMO_NUBEFACT'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <span className="font-bold text-sm">🧪 API Demo NubeFact</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-normal leading-relaxed">
                      Pruebas gratuitas sin costo. Genera CDR, QR y XML UBL 2.1 sin gastar folios de tu plan ni reportar a SUNAT.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormConfig({ ...formConfig, modo_integracion: 'NUBEFACT_REAL' })}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      formConfig.modo_integracion === 'NUBEFACT_REAL'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span className="font-bold text-sm">🟢 NubeFact Oficial Real</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-normal leading-relaxed">
                      Producción oficial. Cada factura y boleta se envía directamente a SUNAT con valor fiscal real.
                    </p>
                  </button>
                </div>
              </div>

              {/* Parámetros de conexión Oficial (Ruta y Token) */}
              {formConfig.modo_integracion === 'NUBEFACT_REAL' && (
                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                  <p className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-700" />
                    <span>Credenciales de API NubeFact Oficial</span>
                  </p>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ruta API NubeFact *</label>
                    <input
                      type="url"
                      required
                      value={formConfig.nubefact_ruta}
                      onChange={(e) => setFormConfig({ ...formConfig, nubefact_ruta: e.target.value })}
                      placeholder="https://api.nubefact.com/api/v1/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Token de Seguridad NubeFact *</label>
                    <input
                      type="password"
                      required
                      value={formConfig.nubefact_token}
                      onChange={(e) => setFormConfig({ ...formConfig, nubefact_token: e.target.value })}
                      placeholder="Pega aquí el Token que te da NubeFact en tu panel"
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Datos del Emisor (PROCESOS CÁRNICOS S.A.C.) */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <span className="block font-bold text-slate-700 uppercase tracking-wider">
                  2. Datos Fiscales de la Empresa Emisora
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">RUC Emisor *</label>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      value={formConfig.ruc_emisor}
                      onChange={(e) => setFormConfig({ ...formConfig, ruc_emisor: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Razón Social *</label>
                    <input
                      type="text"
                      required
                      value={formConfig.razon_social}
                      onChange={(e) => setFormConfig({ ...formConfig, razon_social: e.target.value })}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Nombre Comercial</label>
                    <input
                      type="text"
                      value={formConfig.nombre_comercial}
                      onChange={(e) => setFormConfig({ ...formConfig, nombre_comercial: e.target.value })}
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Dirección Fiscal</label>
                    <input
                      type="text"
                      value={formConfig.direccion_fiscal}
                      onChange={(e) => setFormConfig({ ...formConfig, direccion_fiscal: e.target.value })}
                      placeholder="Ej: Av. Industrial 123, Lima"
                      className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cuenta Detracciones Banco de la Nación</label>
                  <input
                    type="text"
                    value={formConfig.detraccion_cuenta_bn}
                    onChange={(e) => setFormConfig({ ...formConfig, detraccion_cuenta_bn: e.target.value })}
                    placeholder="00-000-000000"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleProbarConexion}
                  disabled={probandoConexion}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  {probandoConexion ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  <span>Probar Conexión</span>
                </button>

                <div className="flex items-center space-x-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setModalConfig(false)}
                    disabled={guardandoConfig}
                    className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 font-bold rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoConfig}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    {guardandoConfig && <Loader2 size={14} className="animate-spin" />}
                    <span>Guardar Configuración</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR MODO SEGURO / EMERGENCIA */}
      {modalConfirmarEmergencia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setModalConfirmarEmergencia(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-rose-950 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <ShieldAlert size={20} className="text-rose-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                  Activar Modo Seguro / Respaldo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalConfirmarEmergencia(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle size={15} className="text-rose-600 shrink-0" />
                  <span>¿Qué ocurrirá al activar el Modo Seguro?</span>
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>Se <strong>descargará automáticamente un archivo de respaldo (backup JSON)</strong> con todas las Notas de Crédito, Notas de Pedido, Boletas Automáticas y anulaciones del sistema.</li>
                  <li>Las secciones de <strong>Notas de Crédito, Notas de Pedido y Boletas Automáticas desaparecerán de la pantalla</strong> y de los filtros.</li>
                  <li>El propio botón de Modo Seguro <strong>se ocultará por completo</strong>.</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
                <p className="font-bold text-slate-800 mb-1">🔐 ¿Cómo rehabilitar las secciones más adelante?</p>
                <p>
                  Escribe el código secreto <strong className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">*7777#</strong> en cualquier buscador, o haz <strong>5 clics seguidos</strong> sobre el título o icono de Facturación.
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalConfirmarEmergencia(false)}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={activarModoEmergenciaYDescargarBackup}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Download size={15} />
                  <span>Descargar Backup y Ocultar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DESBLOQUEO SECRETO */}
      {modalDesbloqueoSecreto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setModalDesbloqueoSecreto(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lock size={18} className="text-indigo-400" />
                <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                  Acceso de Seguridad
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalDesbloqueoSecreto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={desbloquearConPin} className="p-6 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Ingresa el PIN de seguridad de 4 dígitos para restaurar el modo normal y visualizar todas las secciones:
              </p>

              <div>
                <input
                  type="password"
                  maxLength={10}
                  autoFocus
                  value={pinDesbloqueo}
                  onChange={(e) => { setPinDesbloqueo(e.target.value); setErrorPin(''); }}
                  placeholder="PIN secreto (7777)"
                  className="w-full p-3 text-center font-mono font-bold text-lg tracking-widest bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
                {errorPin && (
                  <p className="text-rose-600 font-bold text-[11px] mt-1.5 text-center flex items-center justify-center gap-1">
                    <AlertCircle size={13} />
                    <span>{errorPin}</span>
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalDesbloqueoSecreto(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Unlock size={14} />
                  <span>Desbloquear</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {guiaPreview && (
        <GrePdfModal
          guia={guiaPreview}
          emisor={configSunat || {}}
          onClose={() => setGuiaPreview(null)}
        />
      )}
    </div>
  );
}
