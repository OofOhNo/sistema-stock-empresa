import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Truck, Plus, Trash2, Loader2 } from 'lucide-react';
import api from '../../api';
import SeccionGreFactura from './SeccionGreFactura';
import { crearEstadoGreInicial } from './greUtils';

const MOTIVOS_GRE = [
  'Venta',
  'Traslado entre establecimientos de la misma empresa',
  'Compra',
  'Devolución',
  'Otros'
];

export default function ModalGreSuelta({
  onClose,
  clientes = [],
  productos = [],
  comprobantes = [],
  configSunat = {},
  catalogosGre = {},
  esAdminCentral = false,
  onCatalogosActualizados,
  onGreEmitida
}) {
  const [motivoTraslado, setMotivoTraslado] = useState('Venta');
  const [idCliente, setIdCliente] = useState('');
  const [destTipoDoc, setDestTipoDoc] = useState('6');
  const [destNumDoc, setDestNumDoc] = useState('');
  const [destRazon, setDestRazon] = useState('');
  const [idComprobante, setIdComprobante] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState([
    { id_producto: '', codigo_bien: '', descripcion: '', codigo_unidad_sunat: 'KGM', unidad_medida: 'Kilogramo', cantidad: 1 }
  ]);
  const [pesoBrutoTotal, setPesoBrutoTotal] = useState('1');
  const [greForm, setGreForm] = useState(() => crearEstadoGreInicial(catalogosGre));
  const [enviando, setEnviando] = useState(false);

  const esTrasladoInterno = motivoTraslado === 'Traslado entre establecimientos de la misma empresa';

  const handleMotivoChange = (nuevoMotivo) => {
    setMotivoTraslado(nuevoMotivo);
    setGreForm((prev) => ({ ...prev, motivo_traslado: nuevoMotivo }));
    if (nuevoMotivo === 'Traslado entre establecimientos de la misma empresa') {
      setIdCliente('');
      setDestTipoDoc('6');
      setDestNumDoc(configSunat?.ruc_emisor || '20608725394');
      setDestRazon(configSunat?.razon_social || 'PROCESOS CARNICOS SOCIEDAD ANONIMA CERRADA');
    }
  };

  const handleClienteChange = (idSel) => {
    setIdCliente(idSel);
    const cli = clientes.find((c) => String(c.id_cliente) === String(idSel));
    if (cli) {
      setDestTipoDoc(cli.tipo_documento || '6');
      setDestNumDoc(cli.numero_documento || '');
      setDestRazon(cli.razon_social_o_nombre || '');
    }
  };

  const recalcularPesoSugerido = (lista) => {
    const suma = lista.reduce((acc, it) => acc + (Number(it.cantidad) || 0), 0);
    if (suma > 0) setPesoBrutoTotal(String(+suma.toFixed(2)));
  };

  const handleItemChange = (idx, patch) => {
    setItems((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      recalcularPesoSugerido(next);
      return next;
    });
  };

  const handleProductoPick = (idx, idProd) => {
    if (!idProd) {
      handleItemChange(idx, { id_producto: '' });
      return;
    }
    const prod = productos.find((p) => String(p.id_producto) === String(idProd));
    if (prod) {
      handleItemChange(idx, {
        id_producto: String(prod.id_producto),
        codigo_bien: prod.sku || `PROD-${prod.id_producto}`,
        descripcion: prod.nombre || '',
        codigo_unidad_sunat: prod.codigo_unidad_sunat || 'KGM',
        unidad_medida: prod.unidad_medida || 'Kilogramo'
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!destNumDoc.trim() || !destRazon.trim()) {
      return toast.error('Completa el documento y razón social / nombre del destinatario.');
    }
    const bienesValidos = items.filter((it) => it.descripcion?.trim() && Number(it.cantidad) > 0);
    if (bienesValidos.length === 0) {
      return toast.error('Agrega al menos un bien con descripción y cantidad mayor a 0.');
    }
    if (!(Number(pesoBrutoTotal) > 0)) {
      return toast.error('El peso bruto total debe ser mayor a 0.');
    }
    if (!greForm.punto_llegada_direccion?.trim()) {
      return toast.error('Completa la dirección del punto de llegada.');
    }

    const modoReal = configSunat?.modo_integracion === 'APISPERU' || configSunat?.modo_integracion === 'NUBEFACT_REAL';
    if (modoReal) {
      if (!/^\d{6}$/.test(String(greForm.punto_partida_ubigeo || '').trim())) {
        return toast.error('El Ubigeo del punto de partida debe tener 6 dígitos.');
      }
      if (!/^\d{6}$/.test(String(greForm.punto_llegada_ubigeo || '').trim())) {
        return toast.error('Ingresa el Ubigeo (6 dígitos) del punto de llegada antes de emitir la GRE.');
      }
    }

    setEnviando(true);
    try {
      const payload = {
        ...greForm,
        motivo_traslado: motivoTraslado,
        id_cliente: idCliente ? Number(idCliente) : null,
        id_comprobante: idComprobante ? Number(idComprobante) : null,
        destinatario_tipo_doc: destTipoDoc,
        destinatario_num_doc: destNumDoc.trim(),
        destinatario_razon_social: destRazon.trim(),
        peso_bruto_total: Number(pesoBrutoTotal),
        observaciones: observaciones.trim(),
        bienes: bienesValidos.map((it, idx) => ({
          orden: idx + 1,
          bien_normalizado: Boolean(greForm.bien_normalizado),
          codigo_bien: it.codigo_bien || greForm.codigo_bien || `BIEN-${idx + 1}`,
          codigo_subpartida: greForm.codigo_subpartida || '',
          codigo_sunat: greForm.codigo_sunat || '',
          codigo_gtin: greForm.codigo_gtin || '',
          descripcion: it.descripcion.trim(),
          unidad_medida: it.unidad_medida || 'Kilogramo',
          codigo_unidad_sunat: it.codigo_unidad_sunat || 'KGM',
          cantidad: Number(it.cantidad)
        }))
      };

      const res = await api.post('/facturacion/gre', payload);
      toast.success(res.data?.mensaje || 'Guía de Remisión emitida con éxito.');
      if (onGreEmitida) await onGreEmitida(res.data?.guia);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo emitir la Guía de Remisión.');
    } finally {
      setEnviando(false);
    }
  };

  const comprobantesAsociables = comprobantes.filter((c) => c.tipo_comprobante === '01' || c.tipo_comprobante === '03').slice(0, 40);

  return (
    <div
      onClick={() => !enviando && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6 flex flex-col max-h-[92vh]"
      >
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <Truck size={18} className="text-sky-400" />
            <div>
              <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>
                Emitir Guía de Remisión Electrónica Independiente
              </h3>
              <p className="text-[11px] text-slate-300">
                Serie {greForm.tipo_gre === 'TRANSPORTISTA' ? (configSunat?.serie_gre_transportista || 'V001') : (configSunat?.serie_gre_remitente || 'T001')} • Traslados, compras o guías sin factura previa
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={enviando}
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Motivo, comprobante opcional y peso bruto */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Motivo de Traslado *</label>
              <select
                value={motivoTraslado}
                onChange={(e) => handleMotivoChange(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-semibold"
              >
                {MOTIVOS_GRE.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Comprobante Asociado (Opcional)</label>
              <select
                value={idComprobante}
                onChange={(e) => setIdComprobante(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
              >
                <option value="">-- Ninguno (GRE independiente) --</option>
                {comprobantesAsociables.map((c) => (
                  <option key={c.id_comprobante} value={c.id_comprobante}>
                    {c.serie}-{String(c.correlativo).padStart(8, '0')} · {c.nombre_cliente}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Peso Bruto Total (KGM) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={pesoBrutoTotal}
                onChange={(e) => setPesoBrutoTotal(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono font-bold"
              />
            </div>
          </div>

          {/* Destinatario */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-700 uppercase tracking-wider">Datos del Destinatario</span>
              {esTrasladoInterno && (
                <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg border border-sky-200">
                  Traslado interno: destinatario igual al emisor
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Cliente Registrado (Opcional)</label>
                <select
                  disabled={esTrasladoInterno}
                  value={idCliente}
                  onChange={(e) => handleClienteChange(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl disabled:bg-slate-100"
                >
                  <option value="">-- Elegir cliente o llenar manual --</option>
                  {clientes.map((c) => (
                    <option key={c.id_cliente} value={c.id_cliente}>
                      {c.razon_social_o_nombre} ({c.numero_documento})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tipo Doc.</label>
                <select
                  value={destTipoDoc}
                  onChange={(e) => setDestTipoDoc(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
                >
                  <option value="6">RUC (6)</option>
                  <option value="1">DNI (1)</option>
                  <option value="4">Carnet Extr. (4)</option>
                  <option value="7">Pasaporte (7)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nro. Documento *</label>
                <input
                  type="text"
                  required
                  value={destNumDoc}
                  onChange={(e) => setDestNumDoc(e.target.value)}
                  placeholder="20..."
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Razón Social / Nombre Destinatario *</label>
                <input
                  type="text"
                  required
                  value={destRazon}
                  onChange={(e) => setDestRazon(e.target.value)}
                  placeholder="Razón social del destinatario"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-semibold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Observaciones (Opcional)</label>
                <input
                  type="text"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Ej: Traslado de cortes congelados a cámara"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Bienes a transportar */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 uppercase tracking-wider">Bienes a Transportar</span>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { id_producto: '', codigo_bien: '', descripcion: '', codigo_unidad_sunat: 'KGM', unidad_medida: 'Kilogramo', cantidad: 1 }])}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold cursor-pointer"
              >
                <Plus size={13} />
                <span>Agregar bien</span>
              </button>
            </div>

            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <select
                    value={it.id_producto}
                    onChange={(e) => handleProductoPick(idx, e.target.value)}
                    className="sm:col-span-3 p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">-- Del catálogo (opcional) --</option>
                    {productos.map((p) => (
                      <option key={p.id_producto} value={p.id_producto}>
                        {p.nombre} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    placeholder="Descripción del bien *"
                    value={it.descripcion}
                    onChange={(e) => handleItemChange(idx, { descripcion: e.target.value })}
                    className="sm:col-span-4 p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                  <select
                    value={it.codigo_unidad_sunat}
                    onChange={(e) => handleItemChange(idx, { codigo_unidad_sunat: e.target.value })}
                    className="sm:col-span-2 p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="KGM">KGM (Kg)</option>
                    <option value="NIU">NIU (Und)</option>
                    <option value="BX">BX (Cajas)</option>
                    <option value="BG">BG (Bolsas)</option>
                    <option value="TNE">TNE (Ton)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="Cant."
                    value={it.cantidad}
                    onChange={(e) => handleItemChange(idx, { cantidad: e.target.value })}
                    className="sm:col-span-2 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-right"
                  />
                  <div className="sm:col-span-1 flex justify-end">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                        title="Quitar ítem"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SeccionGreFactura
            greForm={greForm}
            setGreForm={setGreForm}
            catalogosGre={catalogosGre}
            esAdminCentral={esAdminCentral}
            onCatalogosActualizados={onCatalogosActualizados}
            destinatarioNombre={destRazon}
            destinatarioDocumento={destNumDoc}
            pesoBrutoTotal={Number(pesoBrutoTotal || 0)}
            bienesResumen={items}
            titulo="Datos de Traslado, Partida, Llegada, Vehículo y Conductor"
            subtitulo="Verifica el Ubigeo (6 dígitos) de partida y llegada antes de enviar a SUNAT"
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={enviando}
              onClick={onClose}
              className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {enviando ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
              <span>{enviando ? 'Enviando GRE...' : 'Emitir Guía de Remisión'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
