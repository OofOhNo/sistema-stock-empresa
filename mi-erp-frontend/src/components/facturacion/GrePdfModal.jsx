import { X, Printer, Truck } from 'lucide-react';
import { generarSvgQrString } from '../../utils/qrSunat';
import { escaparHtml } from '../../utils/htmlPrint';

export default function GrePdfModal({ guia, emisor = {}, onClose }) {
  if (!guia) return null;

  const rucEmisor = emisor.ruc_emisor || '20608725394';
  const razonSocialEmisor = emisor.razon_social || 'PROCESOS CARNICOS SOCIEDAD ANONIMA CERRADA';
  const numeroGre = `${guia.serie}-${String(guia.correlativo).padStart(8, '0')}`;
  const qrSvg = generarSvgQrString(guia.cadena_qr || `${rucEmisor}|09|${guia.serie}|${guia.correlativo}`, 120);
  const bienes = Array.isArray(guia.bienes_json) ? guia.bienes_json : [];

  const fechaEmisionStr = guia.fecha_emision
    ? new Date(guia.fecha_emision).toLocaleString('es-PE', { timeZone: 'America/Lima' })
    : '';

  const imprimirGre = () => {
    const win = window.open('', '_blank', 'width=900,height=950');
    if (!win) return;
    const filasBienes = bienes.map((b, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td style="text-align:center;">${b.bien_normalizado ? 'Sí' : 'No'}</td>
        <td>${escaparHtml(b.codigo_bien || '')}</td>
        <td>${escaparHtml(b.codigo_sunat || '')}</td>
        <td>${escaparHtml(b.descripcion || '')}</td>
        <td>${escaparHtml(b.unidad_medida || 'KILOGRAMO')}</td>
        <td style="text-align:right;font-weight:bold;">${Number(b.cantidad || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const baseUrl = window.location.origin;
    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>GRE ${escaparHtml(numeroGre)}</title>
        <style>
          @font-face {
            font-family: 'Berg Regular';
            src: url('${baseUrl}/fonts/Berg_Regular_400.ttf') format('truetype');
            font-weight: 400;
            font-style: normal;
          }
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; padding: 28px; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 14px; }
          .emisor-wrap { display: flex; align-items: center; gap: 14px; }
          .emisor-title { font-family: 'Berg Regular', Arial, Helvetica, sans-serif; font-size: 21px; font-weight: 400; letter-spacing: 0.6px; }
          .title-box { border: 2px solid #0f172a; padding: 10px 18px; text-align: center; border-radius: 6px; }
          .sec { margin-bottom: 12px; line-height: 1.5; }
          .sec-title { font-weight: bold; text-transform: uppercase; font-size: 11px; color: #334155; border-bottom: 1px solid #cbd5e1; margin-bottom: 6px; padding-bottom: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #94a3b8; padding: 6px 8px; font-size: 11px; }
          th { background: #f1f5f9; text-align: left; }
          .qr-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="emisor-wrap">
            <img src="${baseUrl}/brand/logo-color-claro.png" alt="PROCESOS CÁRNICOS S.A.C." style="height: 70px; width: auto; object-fit: contain;" />
            <div>
              <div class="emisor-title">${escaparHtml(razonSocialEmisor)}</div>
              <div style="margin-top:4px;">RUC: <b>${escaparHtml(rucEmisor)}</b></div>
              <div style="margin-top:2px;color:#475569;font-size:11px;">${escaparHtml(guia.punto_partida_direccion || '')}</div>
            </div>
          </div>
          <div class="title-box">
            <div style="font-weight:bold;font-size:11px;">GUÍA DE REMISIÓN ELECTRÓNICA</div>
            <div style="font-weight:bold;font-size:12px;">${escaparHtml(guia.tipo_gre || 'REMITENTE')}</div>
            <div style="font-size:16px;font-weight:900;margin-top:4px;">N° ${escaparHtml(numeroGre)}</div>
          </div>
        </div>

        <div class="sec">
          <div><b>Fecha y hora de emisión:</b> ${escaparHtml(fechaEmisionStr)}</div>
          <div><b>Fecha de inicio de traslado:</b> ${escaparHtml(guia.fecha_inicio_traslado_iso || '')}</div>
          <div><b>Punto de Partida:</b> ${guia.punto_partida_ubigeo ? `(${escaparHtml(guia.punto_partida_ubigeo)}) ` : ''}${escaparHtml(guia.punto_partida_direccion || '')}</div>
          <div><b>Punto de Llegada:</b> ${guia.punto_llegada_ubigeo ? `(${escaparHtml(guia.punto_llegada_ubigeo)}) ` : ''}${escaparHtml(guia.punto_llegada_direccion || '')}</div>
          <div><b>Motivo de Traslado:</b> ${escaparHtml(guia.motivo_traslado || 'Venta')}</div>
          ${guia.factura_serie ? `<div><b>Comprobante Asociado:</b> Factura ${escaparHtml(guia.factura_serie)}-${escaparHtml(String(guia.factura_correlativo).padStart(8, '0'))}</div>` : ''}
        </div>

        <div class="sec">
          <div class="sec-title">Datos del Destinatario</div>
          <div><b>Apellidos y nombres / Razón Social:</b> ${escaparHtml(guia.destinatario_razon_social || '')}</div>
          <div><b>Tipo y número de documento:</b> ${guia.destinatario_tipo_doc === '6' ? 'RUC' : 'DOC'} ${escaparHtml(guia.destinatario_num_doc || '')}</div>
        </div>

        <div class="sec">
          <div class="sec-title">Datos de los Bienes a Transportar</div>
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Bien Normalizado</th>
                <th>Código Bien</th>
                <th>Código SUNAT</th>
                <th>Descripción Detallada</th>
                <th>Unidad</th>
                <th style="text-align:right;">Cantidad</th>
              </tr>
            </thead>
            <tbody>${filasBienes}</tbody>
          </table>
          <div style="margin-top:8px;">
            <b>Unidad de Medida del Peso Bruto:</b> ${escaparHtml(guia.unidad_peso_bruto || 'KGM')} &nbsp;&nbsp;|&nbsp;&nbsp;
            <b>Peso Bruto Total de la Carga:</b> ${Number(guia.peso_bruto_total || 0).toFixed(2)}
          </div>
        </div>

        <div class="sec">
          <div class="sec-title">Datos del Traslado</div>
          <div><b>Modalidad de Traslado:</b> ${escaparHtml(guia.modalidad_traslado || 'Privado')}</div>
          <div><b>Vehículo(s) Placa N°:</b> ${escaparHtml(guia.vehiculo_placa || '-')}</div>
          <div><b>Conductor(es):</b> ${escaparHtml(guia.conductor_nombres || '-')} | Doc: ${escaparHtml(guia.conductor_num_doc || '-')} | Licencia: ${escaparHtml(guia.conductor_licencia || '-')}</div>
        </div>

        <div class="qr-row">
          <div style="font-size:10px;color:#475569;max-width:460px;">
            Representación impresa de la Guía de Remisión Electrónica (${escaparHtml(numeroGre)}) emitida mediante Sistema ERP integrado.
          </div>
          <div>${qrSvg}</div>
        </div>
        <script>window.onload = async function(){ try { await document.fonts.ready; } catch(e) {} window.print(); };</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Truck size={18} className="text-sky-400" />
            <h3 className="font-bold text-sm text-white">Guía de Remisión Electrónica {numeroGre}</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={imprimirGre}
              className="inline-flex items-center space-x-1.5 bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
            >
              <Printer size={14} />
              <span>Imprimir GRE</span>
            </button>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/brand/logo-color-claro.png"
                alt="PROCESOS CÁRNICOS S.A.C."
                className="h-16 w-auto object-contain shrink-0"
              />
              <div>
                <h2 className="text-lg sm:text-xl font-brand text-slate-900">{razonSocialEmisor}</h2>
                <p className="font-mono font-bold text-slate-700">RUC: {rucEmisor}</p>
                <p className="text-slate-500 mt-1">{guia.punto_partida_direccion}</p>
              </div>
            </div>
            <div className="border-2 border-slate-900 rounded-xl px-5 py-3 text-center shrink-0">
              <div className="font-bold text-[10px] uppercase text-slate-600">Guía de Remisión Electrónica</div>
              <div className="font-bold text-slate-900">{guia.tipo_gre || 'REMITENTE'}</div>
              <div className="text-base font-black font-mono text-indigo-700 mt-0.5">N° {numeroGre}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div><span className="font-bold text-slate-600">Emisión:</span> {fechaEmisionStr}</div>
            <div><span className="font-bold text-slate-600">Inicio Traslado:</span> <span className="font-mono font-bold">{guia.fecha_inicio_traslado_iso}</span></div>
            <div className="sm:col-span-2"><span className="font-bold text-slate-600">Punto de Partida:</span> {guia.punto_partida_ubigeo ? `(${guia.punto_partida_ubigeo}) ` : ''}{guia.punto_partida_direccion}</div>
            <div className="sm:col-span-2"><span className="font-bold text-slate-600">Punto de Llegada:</span> {guia.punto_llegada_direccion}</div>
            <div><span className="font-bold text-slate-600">Destinatario:</span> {guia.destinatario_razon_social}</div>
            <div><span className="font-bold text-slate-600">Doc. Destinatario:</span> <span className="font-mono">{guia.destinatario_num_doc}</span></div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200">
                  <th className="p-2.5">N°</th>
                  <th className="p-2.5">Descripción</th>
                  <th className="p-2.5">Unidad</th>
                  <th className="p-2.5 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bienes.map((b, idx) => (
                  <tr key={idx}>
                    <td className="p-2.5">{idx + 1}</td>
                    <td className="p-2.5 font-medium">{b.descripcion}</td>
                    <td className="p-2.5">{b.unidad_medida || 'KGM'}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{Number(b.cantidad || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="space-y-1">
              <div><span className="font-bold">Peso Bruto Total:</span> <span className="font-mono font-bold">{Number(guia.peso_bruto_total || 0).toFixed(2)} {guia.unidad_peso_bruto || 'KGM'}</span></div>
              <div><span className="font-bold">Vehículo Placa:</span> <span className="font-mono font-bold">{guia.vehiculo_placa || '-'}</span> ({guia.modalidad_traslado || 'Privado'})</div>
              <div><span className="font-bold">Conductor:</span> {guia.conductor_nombres || '-'} • DNI: {guia.conductor_num_doc || '-'} • Lic: {guia.conductor_licencia || '-'}</div>
            </div>
            <div className="shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          </div>
        </div>
      </div>
    </div>
  );
}
