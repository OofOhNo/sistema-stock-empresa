import { generarSvgQrString } from './qrSunat';
import { escaparHtml } from './htmlPrint';

/**
 * Construye el HTML de ticket térmico (80 mm) para una boleta de la cola automática.
 * Compartido entre la impresión automática en segundo plano y la reimpresión manual.
 */
export function construirHtmlBoletaTicket(item) {
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
  const fechaTexto = new Date(item.fecha_emision || item.creado_en).toLocaleString('es-PE', {
    timeZone: 'America/Lima'
  });

  return {
    numero,
    html: `
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
        <div><b>Fecha:</b> ${escaparHtml(fechaTexto)}</div>
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
    `
  };
}

/**
 * Envía el HTML de una boleta a impresión mediante un iframe oculto sin cambiar de pestaña.
 */
export async function imprimirBoletaEnIframe(item, iframeRef) {
  const { numero, html } = construirHtmlBoletaTicket(item);

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

  const win = iframeRef.current?.contentWindow;
  if (!win) {
    throw new Error('No se pudo inicializar el visor de impresión.');
  }

  const doc = win.document;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise((r) => setTimeout(r, 250));
  const winActual = iframeRef.current?.contentWindow;
  if (!winActual) return numero;
  winActual.focus();
  winActual.print();
  return numero;
}
