import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import { Truck, MapPin, UserCheck, Plus, PackageCheck, Shield, Loader2 } from 'lucide-react';

/**
 * Formulario de Guía de Remisión Electrónica (Serie EG07) adjunta a cada Factura (01).
 * Aplica visibilidad estricta por rol:
 * - Admin Central ve todas las opciones (tipo GRE, comercio exterior, bien normalizado/códigos, retornos, gestión de catálogos).
 * - Otros empleados solo ven Destinatario, Bienes/Peso, Punto Partida (selector), Punto Llegada, Vehículo, Conductor y Fecha de traslado.
 * - "Documentos relacionados" SIEMPRE oculto (se vincula automáticamente en backend).
 */
export default function SeccionGreFactura({
  greForm,
  setGreForm,
  catalogosGre = {},
  esAdminCentral = false,
  onCatalogosActualizados,
  destinatarioNombre = '',
  destinatarioDocumento = '',
  pesoBrutoTotal = 0,
  bienesResumen = [],
  titulo = 'Guía de Remisión Electrónica Automática',
  subtitulo = 'Se emitirá y vinculará automáticamente con esta Factura'
}) {
  const [gestionAbierta, setGestionAbierta] = useState(null); // 'punto' | 'vehiculo' | 'conductor' | null
  const [nuevoPunto, setNuevoPunto] = useState({ tipo: '-', ubigeo: '', domicilio: '' });
  const [nuevoVehiculo, setNuevoVehiculo] = useState({ placa: '', descripcion: '', entidad_emisora: '', numero_autorizacion: '' });
  const [nuevoConductor, setNuevoConductor] = useState({ licencia: '', numero_documento: '', apellidos_nombres: '' });
  const [guardandoCat, setGuardandoCat] = useState(false);

  // Puntos de llegada SUNAT basados en el RUC del destinatario
  const [puntosLlegadaSunat, setPuntosLlegadaSunat] = useState([]);
  const [cargandoLlegadas, setCargandoLlegadas] = useState(false);
  const [modoLlegadaManual, setModoLlegadaManual] = useState(false);

  const puntos = catalogosGre.puntos_partida || [];
  const vehiculos = catalogosGre.vehiculos || [];
  const conductores = catalogosGre.conductores || [];

  useEffect(() => {
    const ruc = String(destinatarioDocumento || '').trim();
    let cancelado = false;

    const consultarPuntosLlegada = async () => {
      if (!ruc) {
        if (!cancelado) setPuntosLlegadaSunat([]);
        return;
      }
      if (!cancelado) setCargandoLlegadas(true);
      try {
        const res = await api.get(`/facturacion/gre/puntos-llegada/${encodeURIComponent(ruc)}`);
        if (cancelado) return;
        const lista = res.data?.puntos || [];
        setPuntosLlegadaSunat(lista);
        if (lista.length > 0) {
          setModoLlegadaManual(false);
          setGreForm((prev) => {
            const actualEnLista = lista.some((pt) => pt.direccion === prev.punto_llegada_direccion);
            if (!prev.punto_llegada_direccion || !actualEnLista) {
              return {
                ...prev,
                punto_llegada_ubigeo: lista[0].ubigeo || '',
                punto_llegada_direccion: lista[0].direccion
              };
            }
            return prev;
          });
        } else {
          setModoLlegadaManual(true);
        }
      } catch {
        if (!cancelado) setPuntosLlegadaSunat([]);
      } finally {
        if (!cancelado) setCargandoLlegadas(false);
      }
    };

    void consultarPuntosLlegada();
    return () => {
      cancelado = true;
    };
  }, [destinatarioDocumento, setGreForm]);

  const handleSelectPuntoLlegada = (valor) => {
    if (valor === '__MANUAL__') {
      setModoLlegadaManual(true);
      setGreForm((prev) => ({ ...prev, punto_llegada_ubigeo: '', punto_llegada_direccion: '' }));
      return;
    }
    setModoLlegadaManual(false);
    const pt = puntosLlegadaSunat.find((p) => p.direccion === valor);
    setGreForm((prev) => ({
      ...prev,
      punto_llegada_ubigeo: pt?.ubigeo || '',
      punto_llegada_direccion: pt?.direccion || valor
    }));
  };

  const guardarDireccionLlegadaSucursal = async () => {
    const ruc = String(destinatarioDocumento || '').trim();
    if (!ruc || !greForm.punto_llegada_direccion?.trim()) {
      return toast.error('Ingresa una dirección válida para guardarla.');
    }
    try {
      const res = await api.post('/facturacion/gre/puntos-llegada', {
        ruc,
        ubigeo: greForm.punto_llegada_ubigeo || '',
        direccion: greForm.punto_llegada_direccion.trim(),
        tipo: 'SUCURSAL / ANEXO'
      });
      if (res.data?.punto) {
        setPuntosLlegadaSunat((prev) => [...prev.filter((p) => p.direccion !== res.data.punto.direccion), res.data.punto]);
        setModoLlegadaManual(false);
        toast.success('Dirección guardada en la lista de establecimientos del cliente.');
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la dirección.');
    }
  };

  const handleSelectPunto = (id) => {
    const pt = puntos.find((p) => String(p.id_punto) === String(id));
    setGreForm((prev) => ({
      ...prev,
      id_punto_partida: id,
      punto_partida_ubigeo: pt?.ubigeo || prev.punto_partida_ubigeo,
      punto_partida_direccion: pt?.domicilio || prev.punto_partida_direccion
    }));
  };

  const handleSelectVehiculo = (id) => {
    const v = vehiculos.find((vh) => String(vh.id_vehiculo) === String(id));
    setGreForm((prev) => ({
      ...prev,
      id_vehiculo: id,
      vehiculo_placa: v?.placa || ''
    }));
  };

  const handleSelectConductor = (id) => {
    const c = conductores.find((co) => String(co.id_conductor) === String(id));
    setGreForm((prev) => ({
      ...prev,
      id_conductor: id,
      conductor_nombres: c?.apellidos_nombres || '',
      conductor_num_doc: c?.numero_documento || '',
      conductor_licencia: c?.licencia || ''
    }));
  };

  const agregarPuntoPartida = async () => {
    if (!nuevoPunto.ubigeo.trim() || !nuevoPunto.domicilio.trim()) {
      return toast.error('Ingresa ubigeo y dirección del punto de partida.');
    }
    setGuardandoCat(true);
    try {
      const res = await api.post('/facturacion/gre/puntos-partida', nuevoPunto);
      toast.success('Punto de partida agregado.');
      setNuevoPunto({ tipo: '-', ubigeo: '', domicilio: '' });
      setGestionAbierta(null);
      if (onCatalogosActualizados) await onCatalogosActualizados();
      if (res.data?.punto) {
        setGreForm((prev) => ({
          ...prev,
          id_punto_partida: String(res.data.punto.id_punto),
          punto_partida_ubigeo: res.data.punto.ubigeo,
          punto_partida_direccion: res.data.punto.domicilio
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al guardar punto de partida.');
    } finally {
      setGuardandoCat(false);
    }
  };

  const agregarVehiculo = async () => {
    if (!nuevoVehiculo.placa.trim()) return toast.error('Ingresa la placa del vehículo.');
    setGuardandoCat(true);
    try {
      const res = await api.post('/facturacion/gre/vehiculos', nuevoVehiculo);
      toast.success('Vehículo frecuente agregado.');
      setNuevoVehiculo({ placa: '', descripcion: '', entidad_emisora: '', numero_autorizacion: '' });
      setGestionAbierta(null);
      if (onCatalogosActualizados) await onCatalogosActualizados();
      if (res.data?.vehiculo) {
        setGreForm((prev) => ({
          ...prev,
          id_vehiculo: String(res.data.vehiculo.id_vehiculo),
          vehiculo_placa: res.data.vehiculo.placa
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al guardar vehículo.');
    } finally {
      setGuardandoCat(false);
    }
  };

  const agregarConductor = async () => {
    if (!nuevoConductor.licencia.trim() || !nuevoConductor.numero_documento.trim() || !nuevoConductor.apellidos_nombres.trim()) {
      return toast.error('Licencia, DNI y nombres del conductor son obligatorios.');
    }
    setGuardandoCat(true);
    try {
      const res = await api.post('/facturacion/gre/conductores', nuevoConductor);
      toast.success('Conductor frecuente agregado.');
      setNuevoConductor({ licencia: '', numero_documento: '', apellidos_nombres: '' });
      setGestionAbierta(null);
      if (onCatalogosActualizados) await onCatalogosActualizados();
      if (res.data?.conductor) {
        setGreForm((prev) => ({
          ...prev,
          id_conductor: String(res.data.conductor.id_conductor),
          conductor_nombres: res.data.conductor.apellidos_nombres,
          conductor_num_doc: res.data.conductor.numero_documento,
          conductor_licencia: res.data.conductor.licencia
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al guardar conductor.');
    } finally {
      setGuardandoCat(false);
    }
  };

  return (
    <div className="p-4 bg-sky-50/60 border border-sky-200 rounded-xl space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 pb-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-sky-600 text-white rounded-lg">
            <Truck size={15} />
          </div>
          <div>
            <h4 className="font-bold text-sky-950 text-xs uppercase tracking-wider">
              {titulo}
            </h4>
            <p className="text-[11px] text-sky-700">
              {subtitulo}
            </p>
          </div>
        </div>
        {esAdminCentral && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
            <Shield size={11} />
            <span>Vista Completa Admin</span>
          </span>
        )}
      </div>

      {/* Destinatario y Bienes / Peso (Visible para todos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-xl border border-sky-100">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Destinatario</span>
          <span className="font-bold text-slate-900 block truncate">{destinatarioNombre || 'Cliente seleccionado'}</span>
          {destinatarioDocumento && (
            <span className="font-mono text-[11px] text-slate-500">RUC/Doc: {destinatarioDocumento}</span>
          )}
        </div>
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Bienes a Transportar & Peso Bruto Total</span>
          <span className="font-bold text-slate-900">
            {bienesResumen.length} ítem(s) • <span className="font-mono text-sky-700">{Number(pesoBrutoTotal || 0).toFixed(2)} KGM</span>
          </span>
          {bienesResumen.length > 0 && (
            <span className="text-[11px] text-slate-500 block truncate">
              {bienesResumen.map((b) => `${Number(b.cantidad || 0)} ${b.simbolo_unidad || b.unidad_medida || 'UND'} × ${b.descripcion}`).join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Opciones exclusivas Admin Central: Tipo GRE y Comercio Exterior */}
      {esAdminCentral && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-indigo-100">
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Tipo de GRE</label>
            <select
              value={greForm.tipo_gre}
              onChange={(e) => setGreForm({ ...greForm, tipo_gre: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
            >
              <option value="REMITENTE">GRE Remitente</option>
              <option value="TRANSPORTISTA">GRE Transportista</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Comercio Exterior</label>
            <select
              value={greForm.comercio_exterior ? 'SI' : 'NO'}
              onChange={(e) => setGreForm({ ...greForm, comercio_exterior: e.target.value === 'SI' })}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
            >
              <option value="NO">No (Venta Nacional)</option>
              <option value="SI">Sí (Comercio Exterior)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Modalidad de Traslado</label>
            <select
              value={greForm.modalidad_traslado}
              onChange={(e) => setGreForm({ ...greForm, modalidad_traslado: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white font-semibold"
            >
              <option value="Privado">Transporte Privado</option>
              <option value="Publico">Transporte Público</option>
            </select>
          </div>
        </div>
      )}

      {/* Puntos de Partida y Llegada (Visible para todos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700 flex items-center gap-1">
              <MapPin size={12} className="text-sky-600" />
              <span>Punto de Partida *</span>
            </label>
            {esAdminCentral && (
              <button
                type="button"
                onClick={() => setGestionAbierta(gestionAbierta === 'punto' ? null : 'punto')}
                className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <Plus size={11} />
                <span>Agregar punto</span>
              </button>
            )}
          </div>
          <select
            value={greForm.id_punto_partida}
            onChange={(e) => handleSelectPunto(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs"
          >
            {puntos.map((p) => (
              <option key={p.id_punto} value={p.id_punto}>
                [{p.ubigeo}] {p.tipo !== '-' ? `(${p.tipo}) ` : ''}{p.domicilio.slice(0, 55)}...
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700 flex items-center gap-1.5">
              <span>Punto de Llegada (SUNAT por RUC) *</span>
              {cargandoLlegadas && <Loader2 size={11} className="animate-spin text-sky-600" />}
            </label>
            {puntosLlegadaSunat.length > 0 && modoLlegadaManual && (
              <button
                type="button"
                onClick={() => handleSelectPuntoLlegada(puntosLlegadaSunat[0].direccion)}
                className="text-[10px] font-bold text-sky-700 hover:underline cursor-pointer"
              >
                Usar lista SUNAT ({puntosLlegadaSunat.length})
              </button>
            )}
          </div>
          {puntosLlegadaSunat.length > 0 && !modoLlegadaManual ? (
            <div className="space-y-1.5">
              <select
                value={greForm.punto_llegada_direccion || ''}
                onChange={(e) => handleSelectPuntoLlegada(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs"
              >
                {puntosLlegadaSunat.map((pt, idx) => (
                  <option key={pt.id_punto_llegada || idx} value={pt.direccion}>
                    {pt.ubigeo ? `[${pt.ubigeo}] ` : ''}{pt.tipo ? `${pt.tipo} — ` : ''}{pt.direccion}
                  </option>
                ))}
                <option value="__MANUAL__">✏️ Escribir / agregar otra dirección...</option>
              </select>
              {!/^\d{6}$/.test(String(greForm.punto_llegada_ubigeo || '').trim()) && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-1.5">
                  <span className="text-[10px] font-bold text-amber-800 whitespace-nowrap">
                    Ubigeo (6 díg.) *:
                  </span>
                  <input
                    type="text"
                    maxLength={6}
                    value={greForm.punto_llegada_ubigeo || ''}
                    onChange={(e) => setGreForm({ ...greForm, punto_llegada_ubigeo: e.target.value.replace(/\D/g, '') })}
                    placeholder="Ej: 040101"
                    className="w-28 p-1 border border-amber-300 rounded bg-white text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-amber-700">Requerido por SUNAT</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <input
                  type="text"
                  maxLength={6}
                  value={greForm.punto_llegada_ubigeo || ''}
                  onChange={(e) => setGreForm({ ...greForm, punto_llegada_ubigeo: e.target.value.replace(/\D/g, '') })}
                  placeholder="Ubigeo 6 díg. *"
                  title="Ubigeo de 6 dígitos del punto de llegada (ej. 040104)"
                  className="p-2 border border-slate-300 rounded-lg bg-white text-xs font-mono font-bold"
                />
                <input
                  type="text"
                  value={greForm.punto_llegada_direccion}
                  onChange={(e) => setGreForm({ ...greForm, punto_llegada_direccion: e.target.value })}
                  placeholder="Dirección exacta de entrega / llegada *"
                  className="sm:col-span-2 p-2 border border-slate-300 rounded-lg bg-white text-xs"
                />
              </div>
              {destinatarioDocumento && greForm.punto_llegada_direccion?.trim() && (
                <button
                  type="button"
                  onClick={guardarDireccionLlegadaSucursal}
                  className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  + Guardar esta dirección en establecimientos del RUC {destinatarioDocumento}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline Admin form: Nuevo Punto de Partida */}
      {esAdminCentral && gestionAbierta === 'punto' && (
        <div className="p-3 bg-white border border-indigo-200 rounded-xl space-y-2">
          <div className="font-bold text-indigo-900 text-[11px]">Registrar Punto de Partida Frecuente</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              placeholder="Tipo (Ej: DOMICILIO FISCAL)"
              value={nuevoPunto.tipo}
              onChange={(e) => setNuevoPunto({ ...nuevoPunto, tipo: e.target.value })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs"
            />
            <input
              type="text"
              placeholder="Ubigeo (6 díg)"
              value={nuevoPunto.ubigeo}
              onChange={(e) => setNuevoPunto({ ...nuevoPunto, ubigeo: e.target.value })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
            <input
              type="text"
              placeholder="Dirección completa *"
              value={nuevoPunto.domicilio}
              onChange={(e) => setNuevoPunto({ ...nuevoPunto, domicilio: e.target.value })}
              className="sm:col-span-2 p-1.5 border border-slate-300 rounded-lg text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGestionAbierta(null)} className="px-2.5 py-1 text-slate-500 cursor-pointer">Cancelar</button>
            <button type="button" disabled={guardandoCat} onClick={agregarPuntoPartida} className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold cursor-pointer">Guardar Punto</button>
          </div>
        </div>
      )}

      {/* Vehículo frecuente, Conductor frecuente, Fecha inicio traslado (Visible para todos) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700">Vehículo (Placa) *</label>
            {esAdminCentral && (
              <button
                type="button"
                onClick={() => setGestionAbierta(gestionAbierta === 'vehiculo' ? null : 'vehiculo')}
                className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <Plus size={11} />
                <span>Nuevo</span>
              </button>
            )}
          </div>
          <select
            value={greForm.id_vehiculo}
            onChange={(e) => handleSelectVehiculo(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold"
          >
            {vehiculos.map((v) => (
              <option key={v.id_vehiculo} value={v.id_vehiculo}>
                {v.placa}{v.descripcion ? ` — ${v.descripcion}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700 flex items-center gap-1">
              <UserCheck size={12} className="text-sky-600" />
              <span>Conductor *</span>
            </label>
            {esAdminCentral && (
              <button
                type="button"
                onClick={() => setGestionAbierta(gestionAbierta === 'conductor' ? null : 'conductor')}
                className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-0.5"
              >
                <Plus size={11} />
                <span>Nuevo</span>
              </button>
            )}
          </div>
          <select
            value={greForm.id_conductor}
            onChange={(e) => handleSelectConductor(e.target.value)}
            className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs"
          >
            {conductores.map((c) => (
              <option key={c.id_conductor} value={c.id_conductor}>
                {c.apellidos_nombres} ({c.licencia})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Fecha Inicio Traslado *</label>
          <input
            type="date"
            value={greForm.fecha_inicio_traslado}
            onChange={(e) => setGreForm({ ...greForm, fecha_inicio_traslado: e.target.value })}
            className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs font-mono"
          />
        </div>
      </div>

      {/* Inline Admin forms: Vehículo y Conductor */}
      {esAdminCentral && gestionAbierta === 'vehiculo' && (
        <div className="p-3 bg-white border border-indigo-200 rounded-xl space-y-2">
          <div className="font-bold text-indigo-900 text-[11px]">Registrar Vehículo Frecuente</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Placa (Ej: BEG445) *"
              value={nuevoVehiculo.placa}
              onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, placa: e.target.value.toUpperCase() })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
            <input
              type="text"
              placeholder="Descripción interna (Ej: Furgón blanco frío)"
              value={nuevoVehiculo.descripcion}
              onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, descripcion: e.target.value })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs"
            />
            <input
              type="text"
              placeholder="Entidad emisora (Opcional)"
              value={nuevoVehiculo.entidad_emisora}
              onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, entidad_emisora: e.target.value })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs"
            />
            <input
              type="text"
              placeholder="Nro Autorización (Opcional)"
              value={nuevoVehiculo.numero_autorizacion}
              onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, numero_autorizacion: e.target.value })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGestionAbierta(null)} className="px-2.5 py-1 text-slate-500 cursor-pointer">Cancelar</button>
            <button type="button" disabled={guardandoCat} onClick={agregarVehiculo} className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold cursor-pointer">Guardar Vehículo</button>
          </div>
        </div>
      )}

      {esAdminCentral && gestionAbierta === 'conductor' && (
        <div className="p-3 bg-white border border-indigo-200 rounded-xl space-y-2">
          <div className="font-bold text-indigo-900 text-[11px]">Registrar Conductor Frecuente</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Apellidos y Nombres *"
              value={nuevoConductor.apellidos_nombres}
              onChange={(e) => setNuevoConductor({ ...nuevoConductor, apellidos_nombres: e.target.value.toUpperCase() })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs"
            />
            <input
              type="text"
              placeholder="DNI (8 dígitos) *"
              value={nuevoConductor.numero_documento}
              onChange={(e) => setNuevoConductor({ ...nuevoConductor, numero_documento: e.target.value })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
            <input
              type="text"
              placeholder="Nro Licencia (Ej: H29563135) *"
              value={nuevoConductor.licencia}
              onChange={(e) => setNuevoConductor({ ...nuevoConductor, licencia: e.target.value.toUpperCase() })}
              className="p-1.5 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGestionAbierta(null)} className="px-2.5 py-1 text-slate-500 cursor-pointer">Cancelar</button>
            <button type="button" disabled={guardandoCat} onClick={agregarConductor} className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold cursor-pointer">Guardar Conductor</button>
          </div>
        </div>
      )}

      {/* Opciones exclusivas Admin Central: Bien normalizado/códigos y Retornos */}
      {esAdminCentral && (
        <div className="space-y-2.5 pt-2 border-t border-sky-200">
          <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                <PackageCheck size={14} className="text-indigo-600" />
                <span>Opciones Avanzadas de Bienes (Solo Admin)</span>
              </span>
              <label className="flex items-center space-x-1.5 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={greForm.bien_normalizado}
                  onChange={(e) => setGreForm({ ...greForm, bien_normalizado: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <span>¿Bien normalizado?</span>
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="text"
                placeholder="Código del bien"
                value={greForm.codigo_bien}
                onChange={(e) => setGreForm({ ...greForm, codigo_bien: e.target.value })}
                className="p-1.5 border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="text"
                placeholder="Subpartida Nacional"
                value={greForm.codigo_subpartida}
                onChange={(e) => setGreForm({ ...greForm, codigo_subpartida: e.target.value })}
                className="p-1.5 border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="text"
                placeholder="Código SUNAT"
                value={greForm.codigo_sunat}
                onChange={(e) => setGreForm({ ...greForm, codigo_sunat: e.target.value })}
                className="p-1.5 border border-slate-300 rounded-lg text-xs"
              />
              <input
                type="text"
                placeholder="Código GTIN"
                value={greForm.codigo_gtin}
                onChange={(e) => setGreForm({ ...greForm, codigo_gtin: e.target.value })}
                className="p-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-indigo-100">
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={greForm.retorno_envases_vacios}
                onChange={(e) => setGreForm({ ...greForm, retorno_envases_vacios: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span>Retorno envases vacíos</span>
            </label>
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={greForm.retorno_vehiculo_vacio}
                onChange={(e) => setGreForm({ ...greForm, retorno_vehiculo_vacio: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span>Retorno vehículo vacío</span>
            </label>
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={greForm.transbordo_programado}
                onChange={(e) => setGreForm({ ...greForm, transbordo_programado: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span>Transbordo programado</span>
            </label>
            <label className="flex items-center space-x-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={greForm.traslado_vehiculo_m1_l}
                onChange={(e) => setGreForm({ ...greForm, traslado_vehiculo_m1_l: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span>Vehículo cat. M1 o L</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
