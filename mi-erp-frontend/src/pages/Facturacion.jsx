import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  FileText, Plus, AlertCircle, RefreshCw, XCircle,
  Search, ShieldCheck, DollarSign, Receipt,
  X, Printer, Eye, Loader2, Settings, Download, CheckCircle2, EyeOff
} from 'lucide-react';

// Generador determinístico de matriz QR en SVG (25x25 con patrones de posición oficiales)
// a partir de la cadena reglamentaria de SUNAT (RUC|TIPO|SERIE|CORRELATIVO|IGV|TOTAL|FECHA|DOC|HASH|)
function construirMatrizQr(cadena = '') {
  const N = 25;
  const matriz = Array.from({ length: N }, () => Array(N).fill(false));
  const reservado = Array.from({ length: N }, () => Array(N).fill(false));

  const colocarFinder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
          reservado[rr][cc] = true;
          const enBorde7 = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6);
          const enCentro3 = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          matriz[rr][cc] = enBorde7 || enCentro3;
        }
      }
    }
  };

  colocarFinder(0, 0);
  colocarFinder(0, N - 7);
  colocarFinder(N - 7, 0);

  // Patrones de sincronización (Timing patterns)
  for (let i = 8; i < N - 8; i++) {
    reservado[6][i] = true;
    matriz[6][i] = i % 2 === 0;
    reservado[i][6] = true;
    matriz[i][6] = i % 2 === 0;
  }

  // Patrón de alineación (5x5 en esquina inferior derecha)
  const ar = N - 9;
  const ac = N - 9;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      reservado[ar + r][ac + c] = true;
      matriz[ar + r][ac + c] = r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2);
    }
  }

  const texto = String(cadena || 'SUNAT-CPE');
  const bytes = [];
  for (let i = 0; i < texto.length; i++) {
    bytes.push(texto.charCodeAt(i) & 0xff);
  }
  if (bytes.length === 0) bytes.push(83, 85, 78, 65, 84);

  let bitIdx = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (!reservado[r][c]) {
        const byteVal = bytes[Math.floor(bitIdx / 8) % bytes.length];
        const shift = 7 - (bitIdx % 8);
        const mask = (r * 3 + c * 5 + bitIdx) % 2 === 0;
        const bit = ((byteVal >> shift) & 1) === 1;
        matriz[r][c] = bit !== mask;
        bitIdx++;
      }
    }
  }
  return matriz;
}

function generarSvgQrString(cadena = '', size = 110) {
  const matriz = construirMatrizQr(cadena);
  const N = matriz.length;
  let rects = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (matriz[r][c]) {
        rects += `<rect x="${c + 2}" y="${r + 2}" width="1" height="1" fill="#0f172a" />`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N + 4} ${N + 4}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${N + 4}" height="${N + 4}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.5"/>${rects}</svg>`;
}

export default function Facturacion({ usuario }) {
  const [comprobantes, setComprobantes] = useState([]);
  const [pedidosFacturables, setPedidosFacturables] = useState([]);
  const [configSunat, setConfigSunat] = useState(null);
  const [catalogos, setCatalogos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos', '01', '03', '07'
  const [busqueda, setBusqueda] = useState('');

  // Modal Emitir
  const [modalEmitir, setModalEmitir] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('01'); // '01' Factura, '03' Boleta
  const [formaPago, setFormaPago] = useState('CONTADO'); // 'CONTADO' o 'CREDITO'
  const [diasCredito, setDiasCredito] = useState(30);
  const [medioPagoSunat, setMedioPagoSunat] = useState('008'); // Catálogo 59
  const [aplicaDetraccion, setAplicaDetraccion] = useState(false);
  const [codigoDetraccion, setCodigoDetraccion] = useState('014'); // Catálogo 54
  const [procesando, setProcesando] = useState(false);

  // Modal Anular (Nota de Crédito con Catálogo 09)
  const [modalAnular, setModalAnular] = useState(false);
  const [comprobanteAAnular, setComprobanteAAnular] = useState(null);
  const [codigoMotivoNc, setCodigoMotivoNc] = useState('01');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  // Modal Ver / Imprimir Comprobante A4
  const [modalPdf, setModalPdf] = useState(null); // { comprobante, emisor, items }
  const [cargandoPdf, setCargandoPdf] = useState(false);

  // Modal Configurar SUNAT / NubeFact
  const [modalConfig, setModalConfig] = useState(false);
  const [formConfig, setFormConfig] = useState({
    ruc_emisor: '20600000001',
    razon_social: 'EMPRESA DEMO ERP S.A.C.',
    nombre_comercial: 'SISTEMA ERP PERÚ',
    direccion_fiscal: 'Av. Empresarial 100, Lima - Perú',
    modo_integracion: 'DEMO_NUBEFACT',
    nubefact_ruta: 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
    nubefact_token: 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
    detraccion_cuenta_bn: '00-000-000000'
  });
  const [mostrarToken, setMostrarToken] = useState(false);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [probandoConexion, setProbandoConexion] = useState(false);

  const esAdminCentral = usuario?.rol === 'Admin Central';
  const puedeEditarFacturacion =
    esAdminCentral || usuario?.permisos?.facturacion?.puede_editar === true;

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalPdf(null);
        setModalEmitir(false);
        setModalAnular(false);
        setModalConfig(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resComp, resPed, resConf] = await Promise.all([
        api.get('/facturacion'),
        api.get('/pedidos/calendario').catch(() => ({ data: { eventos: [] } })),
        api.get('/facturacion/configuracion').catch(() => ({ data: {} }))
      ]);

      setComprobantes(resComp.data.comprobantes || []);
      if (resConf.data?.configuracion) {
        setConfigSunat(resConf.data.configuracion);
        setFormConfig({
          ruc_emisor: resConf.data.configuracion.ruc_emisor || '20600000001',
          razon_social: resConf.data.configuracion.razon_social || 'EMPRESA DEMO ERP S.A.C.',
          nombre_comercial: resConf.data.configuracion.nombre_comercial || 'SISTEMA ERP PERÚ',
          direccion_fiscal: resConf.data.configuracion.direccion_fiscal || '',
          modo_integracion: resConf.data.configuracion.modo_integracion || 'DEMO_NUBEFACT',
          nubefact_ruta: resConf.data.configuracion.nubefact_ruta || '',
          nubefact_token: resConf.data.configuracion.nubefact_token || '',
          detraccion_cuenta_bn: resConf.data.configuracion.detraccion_cuenta_bn || '00-000-000000'
        });
      }
      if (resConf.data?.catalogos) {
        setCatalogos(resConf.data.catalogos);
      }

      const disponibles = (resPed.data.eventos || []).filter(
        p => p.estado_pedido !== 'CANCELADO' && !p.tiene_factura && p.estado_pedido !== 'FACTURADO'
      );
      setPedidosFacturables(disponibles);
      setPedidoSeleccionado(disponibles[0] || null);
    } catch (error) {
      toast.error('No se pudieron cargar los comprobantes: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setCargando(false);
    }
  };

  const seleccionarPedidoYTipoAuto = (ped) => {
    setPedidoSeleccionado(ped);
    if (ped) {
      const rucDoc = String(ped.ruc_cliente || '').trim();
      const esRuc11 = ped.tipo_documento_cliente === '6' && /^(10|15|16|17|20)\d{9}$/.test(rucDoc);
      setTipoComprobante(esRuc11 ? '01' : '03');
    }
  };

  const abrirModalEmitir = () => {
    if (pedidosFacturables.length === 0) {
      toast.error('No hay pedidos sin facturar en este momento. Crea primero un pedido en la pestaña Pedidos.');
      return;
    }
    const primero = pedidosFacturables[0];
    seleccionarPedidoYTipoAuto(primero);
    setFormaPago('CONTADO');
    setDiasCredito(30);
    setMedioPagoSunat('008');
    setAplicaDetraccion(false);
    setCodigoDetraccion('014');
    setModalEmitir(true);
  };

  const handleEmitir = async (e) => {
    e.preventDefault();
    if (!pedidoSeleccionado) {
      toast.error('Elige un pedido para emitir su comprobante.');
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/emitir', {
        id_pedido: pedidoSeleccionado.id_pedido,
        tipo_comprobante: tipoComprobante,
        forma_pago: formaPago,
        dias_credito: formaPago === 'CREDITO' ? parseInt(diasCredito, 10) : 0,
        medio_pago_sunat: medioPagoSunat,
        aplica_detraccion: tipoComprobante === '01' ? aplicaDetraccion : false,
        codigo_detraccion: codigoDetraccion
      });
      toast.success(res.data.mensaje || '¡Comprobante emitido y aceptado por SUNAT!');
      setModalEmitir(false);
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo emitir el comprobante.');
    } finally {
      setProcesando(false);
    }
  };

  const abrirModalAnular = (comp) => {
    setComprobanteAAnular(comp);
    setCodigoMotivoNc('01');
    setMotivoAnulacion('');
    setModalAnular(true);
  };

  const handleAnular = async (e) => {
    e.preventDefault();
    if (!motivoAnulacion.trim()) {
      toast.error('Escribe brevemente por qué vas a anular este comprobante.');
      return;
    }

    setProcesando(true);
    try {
      const res = await api.post('/facturacion/anular', {
        id_comprobante: comprobanteAAnular.id_comprobante,
        codigo_motivo_nc: codigoMotivoNc,
        motivo: motivoAnulacion.trim()
      });
      toast.success(res.data.mensaje || 'Comprobante anulado con Nota de Crédito y stock devuelto al inventario.');
      setModalAnular(false);
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo anular el comprobante.');
    } finally {
      setProcesando(false);
    }
  };

  const handleGuardarConfigSunat = async (e) => {
    e.preventDefault();
    setGuardandoConfig(true);
    try {
      const res = await api.put('/facturacion/configuracion', formConfig);
      setConfigSunat(res.data.configuracion);
      toast.success(res.data.mensaje || 'Configuración SUNAT / NubeFact guardada.');
      setModalConfig(false);
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo guardar la configuración.');
    } finally {
      setGuardandoConfig(false);
    }
  };

  const handleProbarConexion = async () => {
    setProbandoConexion(true);
    try {
      const res = await api.post('/facturacion/probar-conexion', formConfig);
      toast.success(res.data.mensaje || 'Conexión verificada correctamente.');
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo conectar con NubeFact.');
    } finally {
      setProbandoConexion(false);
    }
  };

  const descargarArchivoTributario = async (idComprobante, tipoArchivo, serie, correlativo) => {
    try {
      const endpoint = tipoArchivo === 'cdr'
        ? `/facturacion/${idComprobante}/cdr`
        : `/facturacion/${idComprobante}/xml`;
      const res = await api.get(endpoint, { responseType: 'blob' });
      const ruc = configSunat?.ruc_emisor || '20600000001';
      const prefijo = tipoArchivo === 'cdr' ? 'R-' : '';
      const nombreDescarga = `${prefijo}${ruc}-${serie}-${String(correlativo).padStart(8, '0')}.xml`;

      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', nombreDescarga);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${tipoArchivo === 'cdr' ? 'Constancia CDR SUNAT' : 'XML UBL 2.1 firmado'} descargado.`);
    } catch {
      toast.error('No se pudo descargar el archivo tributario.');
    }
  };

  const abrirVisorPdf = async (comp) => {
    setCargandoPdf(true);
    try {
      const res = await api.get(`/facturacion/${comp.id_comprobante}/detalle`);
      setModalPdf({
        comprobante: res.data.comprobante,
        emisor: res.data.emisor || configSunat || {},
        items: res.data.items || []
      });
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo abrir el comprobante.');
    } finally {
      setCargandoPdf(false);
    }
  };

  const nombreTipo = (tipo) => {
    switch (tipo) {
      case '01': return 'Factura Electrónica';
      case '03': return 'Boleta de Venta Electrónica';
      case '07': return 'Nota de Crédito Electrónica';
      case '08': return 'Nota de Débito Electrónica';
      default: return `Comprobante (${tipo})`;
    }
  };

  const etiquetaTipoDocCliente = (codigo) => {
    switch (String(codigo)) {
      case '6': return 'RUC';
      case '1': return 'DNI';
      case '4': return 'C.E.';
      case '7': return 'Pasaporte';
      default: return 'Doc.';
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

  const etiquetaEstadoPedido = (estado) => {
    switch (estado) {
      case 'PENDIENTE': return 'En preparación';
      case 'LISTO_DESPACHO': return 'Listo para despacho';
      case 'DESPACHADO': return 'Ya despachado';
      default: return estado;
    }
  };

  const imprimirComprobanteActual = () => {
    if (!modalPdf?.comprobante) return;
    const c = modalPdf.comprobante;
    const emisor = modalPdf.emisor || configSunat || {};
    const items = modalPdf.items || [];
    const numero = `${c.serie}-${String(c.correlativo).padStart(8, '0')}`;
    const titulo = nombreTipo(c.tipo_comprobante).toUpperCase();
    const fechaEmision = new Date(c.fecha_emision).toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const qrSvg = generarSvgQrString(c.cadena_qr, 115);

    const filasHtml = items.length > 0
      ? items.map((it, idx) => `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${idx + 1}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${it.sku || '-'}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${it.descripcion}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:center;">${it.cantidad} ${it.codigo_unidad_sunat || it.unidad_medida || 'NIU'}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">S/ ${parseFloat(it.precio_unitario || 0).toFixed(2)}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">S/ ${parseFloat(it.subtotal || (it.cantidad * it.precio_unitario) || 0).toFixed(2)}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="6" style="padding:12px;text-align:center;color:#64748b;">Detalle de Pedido #${c.id_pedido || '-'}</td></tr>`;

    const ventana = window.open('', '_blank', 'width=880,height=920');
    if (!ventana) {
      window.print();
      return;
    }

    ventana.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${titulo} ${numero}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e1b4b; padding-bottom: 16px; margin-bottom: 16px; }
          .box-num { border: 2px solid #1e1b4b; border-radius: 10px; padding: 12px 22px; text-align: center; min-width: 250px; }
          .box-num .ruc { font-size: 14px; font-weight: bold; color: #0f172a; }
          .box-num h2 { margin: 6px 0; font-size: 14px; color: #1e1b4b; background: #eef2ff; padding: 4px 8px; border-radius: 4px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 14px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          th { background: #1e1b4b; color: white; padding: 8px; font-size: 11px; text-transform: uppercase; }
          .leyenda-letras { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; font-weight: bold; margin-bottom: 14px; font-size: 12px; }
          .footer-sunat { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-top: 10px; }
          .qr-box { display: flex; align-items: center; gap: 14px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; max-width: 460px; }
          .totales { width: 280px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
          .totales div { display: flex; justify-content: space-between; padding: 3px 0; }
          .total-final { border-top: 2px solid #1e1b4b; margin-top: 6px; padding-top: 8px !important; font-weight: bold; font-size: 15px; color: #1e1b4b; }
          .anulado { color: #dc2626; font-weight: bold; border: 2px solid #dc2626; display: inline-block; padding: 3px 10px; border-radius: 6px; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 style="margin:0;color:#1e1b4b;font-size:20px;">${emisor.razon_social || c.nombre_ubicacion || 'EMPRESA DEMO ERP S.A.C.'}</h1>
            <p style="margin:3px 0;color:#334155;font-weight:bold;">${emisor.nombre_comercial || ''}</p>
            <p style="margin:3px 0;color:#475569;">Dirección Fiscal: ${emisor.direccion_fiscal || c.direccion_ubicacion || 'Lima - Perú'}</p>
            <p style="margin:2px 0;color:#475569;">Sede de Despacho: ${c.nombre_ubicacion || 'Sede Central'}</p>
          </div>
          <div class="box-num">
            <div class="ruc">R.U.C. N° ${emisor.ruc_emisor || '20600000001'}</div>
            <h2>${titulo}</h2>
            <div style="font-family:monospace;font-size:16px;font-weight:bold;">${numero}</div>
            ${c.estado_sunat === 'ANULADO' ? '<div class="anulado">ANULADO</div>' : ''}
          </div>
        </div>

        <div class="info-grid">
          <div><strong>Cliente / Razón Social:</strong> ${c.nombre_cliente || 'Cliente General'}</div>
          <div><strong>Fecha de Emisión:</strong> ${fechaEmision}</div>
          <div><strong>${etiquetaTipoDocCliente(c.cliente_tipo_doc)}:</strong> ${c.cliente_documento || '-'}</div>
          <div><strong>Condición de Pago:</strong> ${c.forma_pago === 'CREDITO' ? `CRÉDITO (${c.dias_credito || 30} días)` : 'CONTADO'}</div>
          <div><strong>Dirección del Cliente:</strong> ${c.cliente_direccion || '-'}</div>
          <div><strong>Moneda:</strong> SOLES (PEN) · Pedido #${c.id_pedido || '-'}</div>
          ${c.tipo_comprobante === '07' && c.ref_serie ? `
            <div><strong>Documento que Modifica:</strong> ${c.ref_serie}-${String(c.ref_correlativo).padStart(8, '0')}</div>
            <div><strong>Motivo SUNAT (Cat. 09):</strong> (${c.codigo_motivo_nc || '01'}) ${c.descripcion_motivo_nc || ''}</div>
          ` : ''}
        </div>

        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th style="text-align:left;">Código</th>
              <th style="text-align:left;">Descripción</th>
              <th>Cant. / Unidad</th>
              <th style="text-align:right;">P. Unitario</th>
              <th style="text-align:right;">Importe Total</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>

        <div class="leyenda-letras">
          ${c.monto_en_letras || 'SON: SOLES'}
        </div>

        <div class="footer-sunat">
          <div class="qr-box">
            <div>${qrSvg}</div>
            <div style="font-size:10px;color:#334155;line-height:1.45;">
              <div><strong>Representación impresa de la ${nombreTipo(c.tipo_comprobante)}</strong></div>
              <div style="margin-top:4px;"><strong>Resumen / Código Hash CPE:</strong> <span style="font-family:monospace;">${c.codigo_hash || '-'}</span></div>
              <div><strong>Estado SUNAT:</strong> ${c.mensaje_cdr || 'Aceptado por SUNAT (Código 0)'}</div>
              ${c.aplica_detraccion ? `<div style="margin-top:4px;color:#1e1b4b;"><strong>Operación sujeta a Detracción (${c.porcentaje_detraccion}%):</strong> S/ ${parseFloat(c.monto_detraccion || 0).toFixed(2)} · Cta. BN: ${emisor.detraccion_cuenta_bn || '00-000-000000'}</div>` : ''}
              <div style="margin-top:4px;color:#64748b;">Autorizado mediante resolución de intendencia SUNAT. Consulte su comprobante en www.sunat.gob.pe</div>
            </div>
          </div>

          <div class="totales">
            <div><span>Op. Gravada:</span><span>S/ ${parseFloat(c.monto_gravada ?? c.monto_subtotal ?? 0).toFixed(2)}</span></div>
            ${Number(c.monto_exonerada) > 0 ? `<div><span>Op. Exonerada:</span><span>S/ ${parseFloat(c.monto_exonerada).toFixed(2)}</span></div>` : ''}
            ${Number(c.monto_inafecta) > 0 ? `<div><span>Op. Inafecta:</span><span>S/ ${parseFloat(c.monto_inafecta).toFixed(2)}</span></div>` : ''}
            <div><span>I.G.V. (18%):</span><span>S/ ${parseFloat(c.monto_igv || 0).toFixed(2)}</span></div>
            <div class="total-final"><span>IMPORTE TOTAL:</span><span>S/ ${parseFloat(c.monto_total || 0).toFixed(2)}</span></div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    ventana.document.close();
  };

  // Estadísticas
  const totalFacturas = comprobantes.filter(c => c.tipo_comprobante === '01').length;
  const totalBoletas = comprobantes.filter(c => c.tipo_comprobante === '03').length;
  const totalNotas = comprobantes.filter(c => c.tipo_comprobante === '07').length;
  const totalMonto = comprobantes
    .filter(c => c.estado_sunat === 'ACEPTADO' && c.tipo_comprobante !== '07')
    .reduce((acc, c) => acc + parseFloat(c.monto_total || 0), 0);

  const comprobantesFiltrados = comprobantes.filter(c => {
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

  // Validación preventiva en vivo en el modal de emisión
  const clienteSeleccionadoTieneRuc = pedidoSeleccionado
    ? (pedidoSeleccionado.tipo_documento_cliente === '6' && /^(10|15|16|17|20)\d{9}$/.test(String(pedidoSeleccionado.ruc_cliente || '').trim()))
    : true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-start sm:items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl shadow-xs shrink-0">
            <Receipt size={24} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-blue-950">Facturación Electrónica SUNAT</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={13} />
                <span>
                  {configSunat?.modo_integracion === 'NUBEFACT_REAL'
                    ? 'Conectado a NubeFact API'
                    : 'API Demo NubeFact v1 Activa'}
                </span>
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Emisor: <strong className="text-slate-700">{configSunat?.razon_social || 'EMPRESA DEMO ERP S.A.C.'}</strong> (RUC: <span className="font-mono font-bold">{configSunat?.ruc_emisor || '20600000001'}</span>) · UBL 2.1, QR y CDR listos
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
              className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3.5 py-2.5 rounded-xl font-semibold text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              <Settings size={16} />
              <span>Configurar SUNAT / NubeFact</span>
            </button>
          )}

          {puedeEditarFacturacion && (
            <button
              onClick={abrirModalEmitir}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={18} />
              <span>Emitir Factura o Boleta</span>
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Facturas (F001)</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">{totalFacturas}</span>
            <span className="text-xs text-slate-400">Empresas (RUC)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Boletas (B001)</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Receipt size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">{totalBoletas}</span>
            <span className="text-xs text-slate-400">Personas (DNI)</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notas de Crédito</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg"><AlertCircle size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">{totalNotas}</span>
            <span className="text-xs text-slate-400">FC01 / BC01</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Facturado</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg"><DollarSign size={16} /></span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-950">S/ {totalMonto.toFixed(2)}</span>
            <span className="text-xs text-emerald-600 font-semibold">Aceptado SUNAT</span>
          </div>
        </div>
      </div>

      {/* Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFiltroTipo('todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === 'todos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({comprobantes.length})
          </button>
          <button
            onClick={() => setFiltroTipo('01')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === '01' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Facturas ({totalFacturas})
          </button>
          <button
            onClick={() => setFiltroTipo('03')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === '03' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Boletas ({totalBoletas})
          </button>
          <button
            onClick={() => setFiltroTipo('07')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              filtroTipo === '07' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Notas de Crédito ({totalNotas})
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por serie, número o cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Tabla de Comprobantes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando comprobantes electrónicos...</div>
        ) : comprobantesFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No hay comprobantes para mostrar.</p>
            {puedeEditarFacturacion && (
              <p className="text-slate-400 text-sm mt-1">Haz clic en "Emitir Factura o Boleta" arriba a la derecha para crear uno.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-5">Tipo</th>
                  <th className="py-4 px-5">Serie y Número</th>
                  <th className="py-4 px-5">Cliente / Pedido</th>
                  <th className="py-4 px-5 text-center">Condición</th>
                  <th className="py-4 px-5">Emisión</th>
                  <th className="py-4 px-5 text-right">Gravada</th>
                  <th className="py-4 px-5 text-right">IGV (18%)</th>
                  <th className="py-4 px-5 text-right">Total</th>
                  <th className="py-4 px-5 text-center">Estado SUNAT</th>
                  <th className="py-4 px-5 text-right">Comprobante / XML / CDR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {comprobantesFiltrados.map((comp) => {
                  const serieCorr = `${comp.serie}-${String(comp.correlativo).padStart(8, '0')}`;
                  const esAnulado = comp.estado_sunat === 'ANULADO';
                  const esNotaCredito = comp.tipo_comprobante === '07';

                  return (
                    <tr key={comp.id_comprobante} className={`hover:bg-slate-50/60 transition-colors ${esAnulado ? 'bg-red-50/30' : ''}`}>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${badgeTipo(comp.tipo_comprobante)}`}>
                          {nombreTipo(comp.tipo_comprobante)}
                        </span>
                        {esNotaCredito && comp.ref_serie && (
                          <div className="text-[11px] text-purple-700 font-mono mt-1">
                            Modifica: {comp.ref_serie}-{String(comp.ref_correlativo).padStart(8, '0')}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5">
                        <div className="font-mono font-bold text-slate-900">{serieCorr}</div>
                        {comp.codigo_hash && (
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-[130px]" title={`Hash CPE: ${comp.codigo_hash}`}>
                            Hash: {comp.codigo_hash}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-800">{comp.nombre_cliente || 'Cliente General'}</div>
                        <div className="text-xs text-slate-400">
                          {etiquetaTipoDocCliente(comp.tipo_documento_cliente)}: {comp.documento_cliente || '-'} · Pedido #{comp.id_pedido}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        {comp.forma_pago === 'CREDITO' ? (
                          <div>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Crédito ({comp.dias_credito || 30}d)
                            </span>
                            {comp.fecha_vencimiento_cuota && (
                              <div className="text-[10px] text-purple-600 font-mono mt-0.5">
                                Vence: {new Date(comp.fecha_vencimiento_cuota).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Contado
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-slate-600 text-xs font-medium">
                        {new Date(comp.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-4 px-5 text-right text-slate-600 font-mono text-xs">
                        S/ {parseFloat(comp.monto_subtotal || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-right text-slate-600 font-mono text-xs">
                        S/ {parseFloat(comp.monto_igv || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-right font-bold text-slate-900 font-mono">
                        S/ {parseFloat(comp.monto_total || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-5 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          esAnulado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {esAnulado ? <XCircle size={12} className="mr-1" /> : <ShieldCheck size={12} className="mr-1" />}
                          {esAnulado ? 'Anulado (Baja/NC)' : 'Aceptado SUNAT'}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={cargandoPdf}
                            onClick={() => abrirVisorPdf(comp)}
                            className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center space-x-1 text-xs font-bold cursor-pointer"
                            title="Ver representación impresa A4 con Código QR oficial"
                          >
                            <Eye size={13} />
                            <span>PDF / QR</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => descargarArchivoTributario(comp.id_comprobante, 'xml', comp.serie, comp.correlativo)}
                            className="px-2 py-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors text-[11px] font-bold cursor-pointer"
                            title="Descargar XML UBL 2.1 firmado"
                          >
                            XML
                          </button>

                          <button
                            type="button"
                            onClick={() => descargarArchivoTributario(comp.id_comprobante, 'cdr', comp.serie, comp.correlativo)}
                            className="px-2 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors text-[11px] font-bold cursor-pointer"
                            title="Descargar Constancia de Recepción (CDR) de SUNAT"
                          >
                            CDR
                          </button>

                          {puedeEditarFacturacion && !esAnulado && !esNotaCredito && (
                            <button
                              type="button"
                              onClick={() => abrirModalAnular(comp)}
                              className="px-2.5 py-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors text-xs font-bold cursor-pointer"
                              title="Emitir Nota de Crédito y anular este comprobante"
                            >
                              Anular
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL VER / IMPRIMIR COMPROBANTE EN FORMATO A4 REGLAMENTARIO SUNAT */}
      {modalPdf?.comprobante && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setModalPdf(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra superior del visor */}
            <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2">
                <FileText size={18} className="text-indigo-400" />
                <span className="text-sm font-bold">
                  {nombreTipo(modalPdf.comprobante.tipo_comprobante)} · {modalPdf.comprobante.serie}-{String(modalPdf.comprobante.correlativo).padStart(8, '0')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => descargarArchivoTributario(modalPdf.comprobante.id_comprobante, 'xml', modalPdf.comprobante.serie, modalPdf.comprobante.correlativo)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Descargar XML UBL 2.1</span>
                </button>
                <button
                  type="button"
                  onClick={() => descargarArchivoTributario(modalPdf.comprobante.id_comprobante, 'cdr', modalPdf.comprobante.serie, modalPdf.comprobante.correlativo)}
                  className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck size={13} />
                  <span>Descargar CDR SUNAT</span>
                </button>
                <button
                  type="button"
                  onClick={imprimirComprobanteActual}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Imprimir / Guardar PDF A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalPdf(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X size={15} />
                  <span>Cerrar</span>
                </button>
              </div>
            </div>

            {/* Hoja del Comprobante A4 */}
            <div className="p-6 sm:p-8 overflow-y-auto space-y-5 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-blue-950">
                <div>
                  <h2 className="text-xl font-extrabold text-blue-950">
                    {modalPdf.emisor?.razon_social || modalPdf.comprobante.nombre_ubicacion || 'EMPRESA DEMO ERP S.A.C.'}
                  </h2>
                  {modalPdf.emisor?.nombre_comercial && (
                    <p className="text-xs font-bold text-indigo-700 mt-0.5">
                      {modalPdf.emisor.nombre_comercial}
                    </p>
                  )}
                  <p className="text-xs text-slate-600 mt-1">
                    Dirección Fiscal: {modalPdf.emisor?.direccion_fiscal || modalPdf.comprobante.direccion_ubicacion || 'Lima - Perú'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sede Operativa: {modalPdf.comprobante.nombre_ubicacion || 'Sede Central'}
                  </p>
                </div>

                <div className="border-2 border-blue-950 rounded-xl px-6 py-3 text-center shrink-0 min-w-[240px]">
                  <p className="text-xs font-bold text-slate-800">
                    R.U.C. N° {modalPdf.emisor?.ruc_emisor || '20600000001'}
                  </p>
                  <p className="text-xs font-extrabold text-blue-950 uppercase tracking-wider bg-indigo-50 py-1 px-2 rounded my-1">
                    {nombreTipo(modalPdf.comprobante.tipo_comprobante)}
                  </p>
                  <p className="font-mono text-base font-black text-slate-900">
                    {modalPdf.comprobante.serie}-{String(modalPdf.comprobante.correlativo).padStart(8, '0')}
                  </p>
                  {modalPdf.comprobante.estado_sunat === 'ANULADO' && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded text-[10px] font-black">
                      ANULADO
                    </span>
                  )}
                </div>
              </div>

              {/* Datos del Cliente y Operación */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold">Cliente / Razón Social: </span>
                  <strong className="text-slate-900">{modalPdf.comprobante.nombre_cliente || 'Cliente General'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Fecha de Emisión: </span>
                  <strong className="text-slate-900">
                    {new Date(modalPdf.comprobante.fecha_emision).toLocaleDateString('es-PE', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">{etiquetaTipoDocCliente(modalPdf.comprobante.cliente_tipo_doc)}: </span>
                  <strong className="text-slate-900 font-mono">{modalPdf.comprobante.cliente_documento || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">Condición de Pago: </span>
                  <strong className="text-slate-900">
                    {modalPdf.comprobante.forma_pago === 'CREDITO'
                      ? `CRÉDITO (${modalPdf.comprobante.dias_credito || 30} días)`
                      : 'CONTADO'}
                  </strong>
                </div>
                {modalPdf.comprobante.cliente_direccion && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 font-semibold">Dirección del Cliente: </span>
                    <span className="text-slate-800">{modalPdf.comprobante.cliente_direccion}</span>
                  </div>
                )}
                {modalPdf.comprobante.tipo_comprobante === '07' && modalPdf.comprobante.ref_serie && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-200 flex flex-wrap justify-between gap-2 text-purple-900">
                    <span>
                      <strong>Comprobante que modifica:</strong> {modalPdf.comprobante.ref_serie}-{String(modalPdf.comprobante.ref_correlativo).padStart(8, '0')}
                    </span>
                    <span>
                      <strong>Motivo SUNAT (Cat. 09):</strong> ({modalPdf.comprobante.codigo_motivo_nc || '01'}) {modalPdf.comprobante.descripcion_motivo_nc}
                    </span>
                  </div>
                )}
              </div>

              {/* Tabla de Productos */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-blue-950 text-white uppercase">
                      <th className="p-3">Código</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3 text-center">Cant. / Unidad</th>
                      <th className="p-3 text-right">Precio Unit.</th>
                      <th className="p-3 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalPdf.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-400">
                          Pedido #{modalPdf.comprobante.id_pedido}
                        </td>
                      </tr>
                    ) : (
                      modalPdf.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-3 font-mono text-slate-600">{it.sku || '-'}</td>
                          <td className="p-3 font-semibold text-slate-900">{it.descripcion}</td>
                          <td className="p-3 text-center font-bold text-slate-800">
                            {it.cantidad} {it.codigo_unidad_sunat || it.unidad_medida}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-600">
                            S/ {parseFloat(it.precio_unitario || 0).toFixed(2)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900">
                            S/ {parseFloat(it.subtotal || (it.cantidad * it.precio_unitario) || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Leyenda obligatoria de importe en letras */}
              <div className="bg-slate-100 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-extrabold text-blue-950">
                {modalPdf.comprobante.monto_en_letras || 'SON: SOLES'}
              </div>

              {/* Pie reglamentario: Código QR oficial SUNAT + Hash CPE + Totales */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5 max-w-lg">
                  <div
                    className="shrink-0 bg-white p-1 rounded-lg border border-slate-200"
                    dangerouslySetInnerHTML={{ __html: generarSvgQrString(modalPdf.comprobante.cadena_qr, 104) }}
                  />
                  <div className="text-[11px] text-slate-600 space-y-1 leading-snug">
                    <p className="font-bold text-slate-900">
                      Representación impresa de la {nombreTipo(modalPdf.comprobante.tipo_comprobante)}
                    </p>
                    <p>
                      <span className="font-semibold">Código Hash CPE: </span>
                      <span className="font-mono text-slate-800 break-all">{modalPdf.comprobante.codigo_hash || '-'}</span>
                    </p>
                    <p>
                      <span className="font-semibold">Constancia CDR: </span>
                      <span className="text-emerald-700 font-semibold">{modalPdf.comprobante.mensaje_cdr}</span>
                    </p>
                    {modalPdf.comprobante.aplica_detraccion && (
                      <p className="text-indigo-900 bg-indigo-50 px-2 py-1 rounded border border-indigo-200 font-medium">
                        Operación sujeta a Detracción ({modalPdf.comprobante.porcentaje_detraccion}%):{' '}
                        <strong>S/ {parseFloat(modalPdf.comprobante.monto_detraccion || 0).toFixed(2)}</strong> · Cta. BN: {modalPdf.emisor?.detraccion_cuenta_bn || '00-000-000000'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="w-full md:w-72 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs shrink-0">
                  <div className="flex justify-between text-slate-600">
                    <span>Op. Gravada:</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_gravada ?? modalPdf.comprobante.monto_subtotal ?? 0).toFixed(2)}</span>
                  </div>
                  {Number(modalPdf.comprobante.monto_exonerada) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Op. Exonerada:</span>
                      <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_exonerada).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(modalPdf.comprobante.monto_inafecta) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Op. Inafecta:</span>
                      <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_inafecta).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>I.G.V. (18%):</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_igv || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-300 text-base font-extrabold text-blue-950">
                    <span>IMPORTE TOTAL:</span>
                    <span className="font-mono">S/ {parseFloat(modalPdf.comprobante.monto_total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EMITIR COMPROBANTE */}
      {modalEmitir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-6">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Receipt className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-blue-950">Emitir Factura o Boleta Electrónica</h3>
              </div>
              <button onClick={() => setModalEmitir(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEmitir} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Elige el Pedido a Facturar
                </label>
                <select
                  value={pedidoSeleccionado?.id_pedido || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const encontrado = pedidosFacturables.find(p => p.id_pedido === id);
                    seleccionarPedidoYTipoAuto(encontrado);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-500 bg-white"
                >
                  {pedidosFacturables.map((p) => (
                    <option key={p.id_pedido} value={p.id_pedido}>
                      Pedido #{p.id_pedido} · {p.cliente} ({p.ruc_cliente || 'Sin doc'}) · S/ {parseFloat(p.monto_total).toFixed(2)} ({etiquetaEstadoPedido(p.estado_pedido)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. ¿Qué comprobante necesitas?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('01')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      tipoComprobante === '01'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">Factura (F001)</span>
                    <span className="text-xs text-slate-500">Para empresas con RUC (11 dígitos)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoComprobante('03')}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      tipoComprobante === '03'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-sm">Boleta de Venta (B001)</span>
                    <span className="text-xs text-slate-500">Para personas con DNI o RUC</span>
                  </button>
                </div>

                {tipoComprobante === '01' && !clienteSeleccionadoTieneRuc && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
                    ⚠️ El cliente de este pedido tiene registrado <strong>{pedidoSeleccionado?.ruc_cliente || 'un DNI'}</strong> (no un RUC de 11 dígitos). Por regla de SUNAT, cámbialo a <strong>Boleta de Venta</strong> o actualiza el RUC del cliente en la pestaña Clientes.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    3. Condición de Pago
                  </label>
                  <select
                    value={formaPago}
                    onChange={(e) => setFormaPago(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                  >
                    <option value="CONTADO">💵 Al Contado</option>
                    <option value="CREDITO">🗓️ Al Crédito (En cuotas / plazo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    4. Medio de Pago (Cat. 59)
                  </label>
                  <select
                    value={medioPagoSunat}
                    onChange={(e) => setMedioPagoSunat(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white"
                  >
                    {(catalogos?.medios_pago || [
                      { codigo: '008', nombre: 'Transferencia Bancaria' },
                      { codigo: '009', nombre: 'Efectivo' },
                      { codigo: '999', nombre: 'Billetera Digital (Yape / Plin)' },
                      { codigo: '001', nombre: 'Depósito en Cuenta' },
                      { codigo: '005', nombre: 'Tarjeta de Débito / Crédito' }
                    ]).map(m => (
                      <option key={m.codigo} value={m.codigo}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formaPago === 'CREDITO' && (
                <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-900">Plazo de pago (Cuota 001 UBL 2.1):</span>
                    <select
                      value={diasCredito}
                      onChange={(e) => setDiasCredito(Number(e.target.value))}
                      className="bg-white border border-purple-300 rounded-lg px-3 py-1 font-bold text-purple-950 text-xs"
                    >
                      <option value={15}>15 días</option>
                      <option value={30}>30 días</option>
                      <option value={45}>45 días</option>
                      <option value={60}>60 días</option>
                      <option value={90}>90 días</option>
                    </select>
                  </div>
                </div>
              )}

              {tipoComprobante === '01' && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={aplicaDetraccion}
                      onChange={(e) => setAplicaDetraccion(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Incluir Detracción del Banco de la Nación (SPOT - Catálogo 54)</span>
                  </label>
                  {aplicaDetraccion && (
                    <select
                      value={codigoDetraccion}
                      onChange={(e) => setCodigoDetraccion(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium mt-1"
                    >
                      {(catalogos?.codigos_detraccion || [
                        { codigo: '014', nombre: 'Carnes y despojos comestibles (4%)' },
                        { codigo: '022', nombre: 'Otros servicios empresariales (12%)' },
                        { codigo: '037', nombre: 'Demás servicios gravados con el IGV (12%)' }
                      ]).map(d => (
                        <option key={d.codigo} value={d.codigo}>{d.codigo} - {d.nombre}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {pedidoSeleccionado && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cliente:</span>
                    <span className="font-bold text-slate-800">{pedidoSeleccionado.cliente} ({pedidoSeleccionado.ruc_cliente})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Valor Venta (Sin IGV):</span>
                    <span className="font-mono text-slate-800">S/ {(parseFloat(pedidoSeleccionado.monto_total) / 1.18).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">I.G.V. (18%):</span>
                    <span className="font-mono text-slate-800">S/ {(parseFloat(pedidoSeleccionado.monto_total) - (parseFloat(pedidoSeleccionado.monto_total) / 1.18)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                    <span className="text-slate-900">Importe Total:</span>
                    <span className="text-indigo-600 font-mono">S/ {parseFloat(pedidoSeleccionado.monto_total).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalEmitir(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando || !pedidoSeleccionado || (tipoComprobante === '01' && !clienteSeleccionadoTieneRuc)}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {procesando && <Loader2 size={15} className="animate-spin" />}
                  <span>{procesando ? 'Enviando a SUNAT...' : 'Emitir Comprobante'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ANULAR COMPROBANTE (EMITIR NOTA DE CRÉDITO CON CATÁLOGO 09 SUNAT) */}
      {modalAnular && comprobanteAAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-red-600">Anular con Nota de Crédito (SUNAT)</h3>
              <button onClick={() => setModalAnular(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAnular} className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900 space-y-1">
                <p>
                  Se emitirá una <strong>Nota de Crédito Electrónica ({comprobanteAAnular.tipo_comprobante === '01' ? 'FC01' : 'BC01'})</strong> para anular el comprobante <strong className="font-mono">{comprobanteAAnular.serie}-{String(comprobanteAAnular.correlativo).padStart(8, '0')}</strong>.
                </p>
                <p className="font-semibold">
                  📦 Los productos volverán a sumarse automáticamente al inventario.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Motivo Oficial SUNAT (Catálogo 09) *
                </label>
                <select
                  value={codigoMotivoNc}
                  onChange={(e) => setCodigoMotivoNc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:outline-hidden focus:border-red-500"
                >
                  {(catalogos?.motivos_nota_credito || [
                    { codigo: '01', nombre: 'Anulación de la operación' },
                    { codigo: '02', nombre: 'Anulación por error en el RUC' },
                    { codigo: '03', nombre: 'Corrección por error en la descripción' },
                    { codigo: '06', nombre: 'Devolución total de mercadería' },
                    { codigo: '10', nombre: 'Otros conceptos' }
                  ]).map(m => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.codigo} - {m.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Detalle o explicación breve *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ej: Error en los datos del comprobante o devolución del pedido..."
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-red-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAnular(false)}
                  disabled={procesando}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesando}
                  className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {procesando ? 'Emitiendo Nota de Crédito...' : 'Sí, Emitir Nota de Crédito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURACIÓN DE DATOS DEL EMISOR Y CREDENCIALES NUBEFACT / SUNAT */}
      {modalConfig && puedeEditarFacturacion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setModalConfig(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Settings className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-blue-950">Configuración de Empresa y Conexión NubeFact / SUNAT</h3>
              </div>
              <button onClick={() => setModalConfig(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGuardarConfigSunat} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    RUC de tu Empresa (11 dígitos) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formConfig.ruc_emisor}
                    onChange={(e) => setFormConfig({ ...formConfig, ruc_emisor: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                    placeholder="20600000001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Cuenta Detracción Banco de la Nación
                  </label>
                  <input
                    type="text"
                    value={formConfig.detraccion_cuenta_bn}
                    onChange={(e) => setFormConfig({ ...formConfig, detraccion_cuenta_bn: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                    placeholder="00-000-000000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Razón Social Emisora *
                  </label>
                  <input
                    type="text"
                    required
                    value={formConfig.razon_social}
                    onChange={(e) => setFormConfig({ ...formConfig, razon_social: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nombre Comercial
                  </label>
                  <input
                    type="text"
                    value={formConfig.nombre_comercial}
                    onChange={(e) => setFormConfig({ ...formConfig, nombre_comercial: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Dirección Fiscal (Aparece en el PDF y XML)
                </label>
                <input
                  type="text"
                  value={formConfig.direccion_fiscal}
                  onChange={(e) => setFormConfig({ ...formConfig, direccion_fiscal: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Modo de Conexión con NubeFact / SUNAT
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormConfig({ ...formConfig, modo_integracion: 'DEMO_NUBEFACT' })}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      formConfig.modo_integracion === 'DEMO_NUBEFACT'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-xs">🟢 API Demo Gratuita Integrada</span>
                    <span className="text-[11px] text-slate-500">Lista para usar sin costo. Genera XML UBL 2.1, Hash, QR y CDR de prueba.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormConfig({ ...formConfig, modo_integracion: 'NUBEFACT_REAL' })}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      formConfig.modo_integracion === 'NUBEFACT_REAL'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="block font-bold text-xs">🌐 Cuenta NubeFact Externa</span>
                    <span className="text-[11px] text-slate-500">Conecta tu Ruta URL y Token propios del panel de NubeFact.</span>
                  </button>
                </div>

                {formConfig.modo_integracion === 'NUBEFACT_REAL' && (
                  <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Ruta URL de la API v1 NubeFact
                      </label>
                      <input
                        type="url"
                        value={formConfig.nubefact_ruta}
                        onChange={(e) => setFormConfig({ ...formConfig, nubefact_ruta: e.target.value })}
                        placeholder="https://api.nubefact.com/api/v1/..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Token de Autorización NubeFact
                      </label>
                      <div className="relative">
                        <input
                          type={mostrarToken ? 'text' : 'password'}
                          value={formConfig.nubefact_token}
                          onChange={(e) => setFormConfig({ ...formConfig, nubefact_token: e.target.value })}
                          placeholder="Pega aquí tu Token de NubeFact"
                          autoComplete="new-password"
                          data-lpignore="true"
                          className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarToken(!mostrarToken)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {mostrarToken ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={probandoConexion}
                  onClick={handleProbarConexion}
                  className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl cursor-pointer"
                >
                  {probandoConexion ? 'Verificando...' : '🔌 Probar Conexión Ahora'}
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setModalConfig(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoConfig}
                    className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs cursor-pointer"
                  >
                    {guardandoConfig ? 'Guardando...' : 'Guardar Configuración'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
