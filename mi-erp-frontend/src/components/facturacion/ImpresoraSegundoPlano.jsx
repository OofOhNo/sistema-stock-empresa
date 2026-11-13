import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { generarSvgQrString } from '../../utils/qrSunat';
import { escaparHtml } from '../../utils/htmlPrint';

/**
 * Procesador silencioso de cola de impresión en segundo plano.
 * Se monta en Layout cuando el usuario tiene acceso a Facturación.
 * Si auto_imprimir_navegador está activo, toma la boleta PENDIENTE más antigua,
 * la renderiza en un iframe oculto, dispara print() y la marca IMPRESO.
 */
export default function ImpresoraSegundoPlano({ usuario }) {
  const procesandoRef = useRef(false);
  const iframeRef = useRef(null);

  const puedeFacturar =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.facturacion?.puede_ver === true;

  useEffect(() => {
    if (!puedeFacturar) return;

    const revisarYProcesarCola = async () => {
      if (procesandoRef.current) return;
      if (localStorage.getItem('erp_modo_emergencia') === 'true') return;
      procesandoRef.current = true;
      try {
        const cfgRes = await api.get('/facturacion/boletas-auto/config');
        const cfg = cfgRes.data?.config;
        if (!cfg || !cfg.auto_imprimir_navegador) {
          return;
        }

        const colaRes = await api.get('/facturacion/boletas-auto/cola', { params: { estado: 'PENDIENTE' } });
        const pendientes = colaRes.data?.cola || [];
        if (pendientes.length === 0) return;

        // Imprimir la más antigua pendiente
        const item = pendientes[pendientes.length - 1];
        const items = Array.isArray(item.items_json) ? item.items_json : [];
        const numero = `${item.serie}-${String(item.correlativo).padStart(8, '0')}`;
        const qrSvg = generarSvgQrString(item.cadena_qr || numero, 95);

        const filasHtml = items.map((it) => `
          <tr>
            <td>${escaparHtml(it.descripcion || 'Producto')}</td>
            <td style="text-align:right;">${Number(it.cantidad || 1).toFixed(2)}</td>
            <td style="text-align:right;">${Number(it.precio_unitario || 0).toFixed(2)}</td>
            <td style="text-align:right;">${Number(it.subtotal || 0).toFixed(2)}</td>
          </tr>
        `).join('');

        const baseUrl = window.location.origin;
        const html = `
          <!doctype html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>Boleta ${escaparHtml(numero)}</title>
            <style>
              @font-face {
                font-family: 'Berg Regular';
                src: url('${baseUrl}/fonts/Berg_Regular_400.ttf') format('truetype');
                font-weight: 400;
                font-style: normal;
              }
              body { font-family: monospace, Arial, sans-serif; width: 280px; margin: 0 auto; padding: 10px; font-size: 11px; color: #000; }
              .center { text-align: center; }
              table { width: 100%; border-collapse: collapse; margin: 8px 0; }
              th, td { border-bottom: 1px dashed #999; padding: 3px 2px; font-size: 10px; }
              @media print { @page { margin: 4mm; } }
            </style>
          </head>
          <body>
            <div class="center">
              <img src="${baseUrl}/brand/logo-positivo.png" alt="PROCESOS CÁRNICOS S.A.C." style="height: 56px; width: auto; margin: 0 auto 5px; display: block; object-fit: contain;" />
              <div style="font-family:'Berg Regular',monospace,Arial,sans-serif;font-size:16px;letter-spacing:0.6px;">PROCESOS CARNICOS S.A.C.</div>
              <div>RUC: 20608725394</div>
              <div style="margin-top:4px;font-weight:bold;">BOLETA DE VENTA ELECTRÓNICA</div>
              <div style="font-size:13px;font-weight:bold;">${escaparHtml(numero)}</div>
            </div>
            <hr/>
            <div><b>Cliente:</b> ${escaparHtml(item.cliente_nombre || 'CLIENTES VARIOS')}</div>
            <div><b>Doc:</b> ${escaparHtml(item.cliente_documento || '00000000')}</div>
            <div><b>Fecha:</b> ${escaparHtml(new Date(item.fecha_emision || item.creado_en).toLocaleString('es-PE', { timeZone: 'America/Lima' }))}</div>
            <table>
              <thead>
                <tr><th>Desc</th><th style="text-align:right;">Kg</th><th style="text-align:right;">P/U</th><th style="text-align:right;">Tot</th></tr>
              </thead>
              <tbody>${filasHtml}</tbody>
            </table>
            <div style="text-align:right;font-size:13px;font-weight:bold;">TOTAL: S/ ${Number(item.monto_total || 0).toFixed(2)}</div>
            <div style="font-size:10px;margin-top:4px;">${escaparHtml(item.monto_en_letras || '')}</div>
            <div class="center" style="margin-top:8px;">${qrSvg}</div>
            <div class="center" style="font-size:9px;margin-top:4px;">Representación impresa de Boleta Electrónica</div>
          </body>
          </html>
        `;

        if (!iframeRef.current) {
          const ifr = document.createElement('iframe');
          ifr.style.position = 'fixed';
          ifr.style.right = '0';
          ifr.style.bottom = '0';
          ifr.style.width = '0';
          ifr.style.height = '0';
          ifr.style.border = '0';
          document.body.appendChild(ifr);
          iframeRef.current = ifr;
        }

        const doc = iframeRef.current.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        await new Promise((r) => setTimeout(r, 250));
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();

        await api.patch(`/facturacion/boletas-auto/cola/${item.id_cola}/estado`, { estado: 'IMPRESO' });
        toast.success(`Boleta ${numero} enviada a impresión automática.`, { icon: '🖨️' });
      } catch (err) {
        console.error('ImpresoraSegundoPlano:', err.message);
      } finally {
        procesandoRef.current = false;
      }
    };

    const timer = setInterval(revisarYProcesarCola, 25000);
    window.addEventListener('cola_impresion_nueva_boleta', revisarYProcesarCola);
    return () => {
      clearInterval(timer);
      window.removeEventListener('cola_impresion_nueva_boleta', revisarYProcesarCola);
      if (iframeRef.current && iframeRef.current.parentNode) {
        iframeRef.current.parentNode.removeChild(iframeRef.current);
        iframeRef.current = null;
      }
    };
  }, [puedeFacturar]);

  return null;
}
