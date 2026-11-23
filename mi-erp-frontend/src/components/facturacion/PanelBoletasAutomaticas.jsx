import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot,
  Play,
  Square,
  Zap,
  Save,
  RefreshCw,
  Printer,
  CheckCircle2,
  Clock,
  MapPin,
  AlertCircle,
  Info,
  RotateCcw,
  Ban
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api';
import { imprimirBoletaEnIframe } from '../../utils/boletaTicketHtml';
import { exportarTablaExcel } from '../../utils/excelExport';
import BotonExportarExcel from '../BotonExportarExcel';
import SelectorDecreceStock from './SelectorDecreceStock';

const CONFIG_INICIAL = {
  activo: false,
  intervalo_min_minutos: '5',
  intervalo_max_minutos: '10',
  monto_minimo: '35',
  monto_maximo: '680',
  peso_minimo_item: '0.50',
  peso_maximo_item: '8.00',
  hora_inicio: '08:00',
  hora_fin: '20:00',
  solo_horario_laboral: false,
  id_ubicacion: '',
  auto_imprimir_navegador: true,
  decrece_stock: false
};

const RANGOS_RAPIDOS = [
  { label: '5 a 10 min', min: '5', max: '10' },
  { label: '10 a 20 min', min: '10', max: '20' },
  { label: '15 a 30 min', min: '15', max: '30' }
];

function mapConfigAForm(cfg) {
  const minVal = cfg?.intervalo_min_minutos ?? cfg?.intervalo_minutos ?? 5;
  const maxVal = cfg?.intervalo_max_minutos ?? Math.max(Number(minVal) || 5, Number(cfg?.intervalo_minutos) || 10);
  return {
    activo: Boolean(cfg?.activo),
    intervalo_min_minutos: String(minVal),
    intervalo_max_minutos: String(Math.max(Number(minVal) || 5, Number(maxVal) || 10)),
    monto_minimo: String(cfg?.monto_minimo ?? 35),
    monto_maximo: String(cfg?.monto_maximo ?? 680),
    peso_minimo_item: String(cfg?.peso_minimo_item ?? '0.50'),
    peso_maximo_item: String(cfg?.peso_maximo_item ?? '8.00'),
    hora_inicio: cfg?.hora_inicio || '08:00',
    hora_fin: cfg?.hora_fin || '20:00',
    solo_horario_laboral: Boolean(cfg?.solo_horario_laboral),
    id_ubicacion: cfg?.id_ubicacion ? String(cfg.id_ubicacion) : '',
    auto_imprimir_navegador: cfg?.auto_imprimir_navegador ?? true,
    decrece_stock: Boolean(cfg?.decrece_stock)
  };
}

function formatearFechaLima(valor, conSegundos = false) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(conSegundos ? { second: '2-digit' } : {})
  });
}

function validarFormulario(form, ubicaciones) {
  const errores = {};
  const minMin = parseInt(form.intervalo_min_minutos, 10);
  const maxMin = parseInt(form.intervalo_max_minutos, 10);
  const montoMin = parseFloat(form.monto_minimo);
  const montoMax = parseFloat(form.monto_maximo);
  const pesoMin = parseFloat(form.peso_minimo_item);
  const pesoMax = parseFloat(form.peso_maximo_item);
  const idUbicacion = form.id_ubicacion ? parseInt(form.id_ubicacion, 10) : null;

  if (Number.isNaN(minMin) || minMin < 1 || minMin > 1440) {
    errores.intervalo_min_minutos = 'Ingresa un mínimo entero entre 1 y 1440 minutos.';
  }
  if (Number.isNaN(maxMin) || maxMin < 1 || maxMin > 1440) {
    errores.intervalo_max_minutos = 'Ingresa un máximo entero entre 1 y 1440 minutos.';
  } else if (!Number.isNaN(minMin) && maxMin < minMin) {
    errores.intervalo_max_minutos = 'El máximo no puede ser menor que el mínimo.';
  }
  if (ubicaciones.length > 0 && (!idUbicacion || Number.isNaN(idUbicacion))) {
    errores.id_ubicacion = 'Selecciona la sede emisora.';
  }
  if (Number.isNaN(montoMin) || montoMin < 1) {
    errores.monto_minimo = 'El monto mínimo debe ser al menos S/ 1.00.';
  }
  if (Number.isNaN(montoMax) || montoMax >= 700) {
    errores.monto_maximo = 'Por regla SUNAT (sin DNI), el monto máximo debe ser menor a S/ 700.00.';
  } else if (!Number.isNaN(montoMin) && montoMax <= montoMin) {
    errores.monto_maximo = 'El monto máximo debe ser mayor que el monto mínimo.';
  }
  if (Number.isNaN(pesoMin) || pesoMin < 0.5) {
    errores.peso_minimo_item = 'El peso mínimo por producto debe ser al menos 0.50 kg.';
  }
  if (Number.isNaN(pesoMax) || pesoMax > 500) {
    errores.peso_maximo_item = 'El peso máximo permitido es 500 kg.';
  } else if (!Number.isNaN(pesoMin) && pesoMax < pesoMin) {
    errores.peso_maximo_item = 'El peso máximo debe ser mayor o igual al peso mínimo.';
  }
  if (!/^\d{2}:\d{2}$/.test(form.hora_inicio || '')) {
    errores.hora_inicio = 'Formato de hora inválido.';
  }
  if (!/^\d{2}:\d{2}$/.test(form.hora_fin || '')) {
    errores.hora_fin = 'Formato de hora inválido.';
  }

  return {
    ok: Object.keys(errores).length === 0,
    errores,
    payload: {
      activo: Boolean(form.activo),
      intervalo_minutos: minMin,
      intervalo_min_minutos: minMin,
      intervalo_max_minutos: maxMin,
      monto_minimo: montoMin,
      monto_maximo: montoMax,
      peso_minimo_item: pesoMin,
      peso_maximo_item: pesoMax,
      hora_inicio: form.hora_inicio || '08:00',
      hora_fin: form.hora_fin || '20:00',
      solo_horario_laboral: Boolean(form.solo_horario_laboral),
      id_ubicacion: idUbicacion,
      auto_imprimir_navegador: Boolean(form.auto_imprimir_navegador),
      decrece_stock: Boolean(form.decrece_stock)
    }
  };
}

function obtenerBadgeEstadoCola(estado) {
  if (estado === 'IMPRESO') {
    return {
      etiqueta: 'Impresa',
      clase: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  }
  if (estado === 'OMITIDO') {
    return {
      etiqueta: 'Omitida',
      clase: 'bg-slate-100 text-slate-600 border-slate-200'
    };
  }
  return {
    etiqueta: 'Por imprimir',
    clase: 'bg-amber-50 text-amber-800 border-amber-200'
  };
}

export default function PanelBoletasAutomaticas({
  ubicaciones = [],
  onBoletaGenerada,
  puedeEditar = true
}) {
  const [configMeta, setConfigMeta] = useState({ ultima_ejecucion: null, proxima_ejecucion: null });
  const [form, setForm] = useState(CONFIG_INICIAL);
  const [errores, setErrores] = useState({});
  const [hayCambios, setHayCambios] = useState(false);
  const [cola, setCola] = useState([]);
  const [filtroCola, setFiltroCola] = useState('TODAS');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoAhora, setGenerandoAhora] = useState(false);
  const [imprimiendoId, setImprimiendoId] = useState(null);
  const iframePrintRef = useRef(null);
  const idUbicacionEfectivo =
    form.id_ubicacion || (ubicaciones[0] ? String(ubicaciones[0].id_ubicacion) : '');

  const cargarTodo = useCallback(async (preservarEdicion = false, silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [cfgRes, colaRes] = await Promise.all([
        api.get('/facturacion/boletas-auto/config'),
        api.get('/facturacion/boletas-auto/cola')
      ]);
      const cfg = cfgRes.data?.config;
      if (cfg) {
        setConfigMeta({
          ultima_ejecucion: cfg.ultima_ejecucion || null,
          proxima_ejecucion: cfg.proxima_ejecucion || null
        });
        if (!preservarEdicion) {
          setForm(mapConfigAForm(cfg));
          setHayCambios(false);
          setErrores({});
        }
      }
      setCola(colaRes.data?.cola || []);
    } catch (err) {
      if (!silencioso) {
        toast.error(err.response?.data?.mensaje || 'No se pudo cargar la configuración de boletas automáticas.');
      }
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [cfgRes, colaRes] = await Promise.all([
          api.get('/facturacion/boletas-auto/config'),
          api.get('/facturacion/boletas-auto/cola')
        ]);
        if (cancelado) return;
        const cfg = cfgRes.data?.config;
        if (cfg) {
          setConfigMeta({
            ultima_ejecucion: cfg.ultima_ejecucion || null,
            proxima_ejecucion: cfg.proxima_ejecucion || null
          });
          setForm(mapConfigAForm(cfg));
          setHayCambios(false);
          setErrores({});
        }
        setCola(colaRes.data?.cola || []);
      } catch (err) {
        if (!cancelado) {
          toast.error(err.response?.data?.mensaje || 'No se pudo cargar la configuración de boletas automáticas.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    const actualizarSoloCola = () => {
      void cargarTodo(true, true);
    };
    window.addEventListener('cola_impresion_actualizada', actualizarSoloCola);
    return () => {
      window.removeEventListener('cola_impresion_actualizada', actualizarSoloCola);
      if (iframePrintRef.current && iframePrintRef.current.parentNode) {
        iframePrintRef.current.parentNode.removeChild(iframePrintRef.current);
        iframePrintRef.current = null;
      }
    };
  }, [cargarTodo]);

  // Refresco silencioso mientras esté activo para ver la hora exacta de próxima boleta y la cola al instante
  useEffect(() => {
    if (!form.activo) return undefined;
    const t = setInterval(() => {
      void cargarTodo(true, true);
    }, 10000);
    return () => clearInterval(t);
  }, [form.activo, cargarTodo]);

  const actualizarCampo = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setHayCambios(true);
    if (errores[campo]) {
      setErrores((prev) => {
        const copia = { ...prev };
        delete copia[campo];
        return copia;
      });
    }
  };

  const aplicarRangoRapido = (min, max) => {
    setForm((prev) => ({
      ...prev,
      intervalo_min_minutos: min,
      intervalo_max_minutos: max
    }));
    setHayCambios(true);
    setErrores((prev) => {
      const copia = { ...prev };
      delete copia.intervalo_min_minutos;
      delete copia.intervalo_max_minutos;
      return copia;
    });
  };

  const guardarConfiguracion = async (e) => {
    e.preventDefault();
    if (!puedeEditar) return;

    const validacion = validarFormulario({ ...form, id_ubicacion: idUbicacionEfectivo }, ubicaciones);
    setErrores(validacion.errores);
    if (!validacion.ok) {
      toast.error('Revisa los campos marcados antes de guardar.');
      return;
    }

    setGuardando(true);
    try {
      const res = await api.put('/facturacion/boletas-auto/config', validacion.payload);
      const actualizada = res.data?.config;
      if (actualizada) {
        setConfigMeta({
          ultima_ejecucion: actualizada.ultima_ejecucion || null,
          proxima_ejecucion: actualizada.proxima_ejecucion || null
        });
        setForm(mapConfigAForm(actualizada));
      }
      setHayCambios(false);
      toast.success('Configuración guardada correctamente.');
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async () => {
    if (!puedeEditar) return;

    const validacion = validarFormulario({ ...form, id_ubicacion: idUbicacionEfectivo }, ubicaciones);
    setErrores(validacion.errores);
    if (!validacion.ok) {
      toast.error('Corrige los parámetros marcados antes de iniciar o detener.');
      return;
    }

    const nuevoEstado = !form.activo;
    setGuardando(true);
    try {
      const res = await api.put('/facturacion/boletas-auto/config', {
        ...validacion.payload,
        activo: nuevoEstado
      });
      const actualizada = res.data?.config;
      if (actualizada) {
        setConfigMeta({
          ultima_ejecucion: actualizada.ultima_ejecucion || null,
          proxima_ejecucion: actualizada.proxima_ejecucion || null
        });
        setForm(mapConfigAForm(actualizada));
      } else {
        setForm((prev) => ({ ...prev, activo: nuevoEstado }));
      }
      setHayCambios(false);
      toast.success(
        nuevoEstado
          ? `Play activado: emitirá boletas en momentos aleatorios entre ${validacion.payload.intervalo_min_minutos} y ${validacion.payload.intervalo_max_minutos} minutos.`
          : 'Generador detenido (Fin). No emitirá nuevas boletas hasta que pulses Play.'
      );
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cambiar el estado del generador.');
    } finally {
      setGuardando(false);
    }
  };

  const generarPruebaAhora = async () => {
    if (!puedeEditar) return;
    setGenerandoAhora(true);
    try {
      const res = await api.post('/facturacion/boletas-auto/generar-ahora');
      if (res.data?.exito === false) {
        toast(res.data.mensaje || 'No se pudo generar en este intento (revisa que existan productos activos con precio compatible).', {
          icon: '⚠️'
        });
        return;
      }
      toast.success(res.data?.mensaje || 'Boleta emitida y agregada a la cola de impresión.');
      window.dispatchEvent(new CustomEvent('cola_impresion_nueva_boleta'));
      await cargarTodo(hayCambios);
      if (onBoletaGenerada) onBoletaGenerada();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al emitir la boleta.');
    } finally {
      setGenerandoAhora(false);
    }
  };

  const cambiarEstadoCola = async (idCola, estado) => {
    try {
      await api.patch(`/facturacion/boletas-auto/cola/${idCola}/estado`, { estado });
      setCola((prev) => prev.map((c) => (c.id_cola === idCola ? { ...c, estado } : c)));
      toast.success(
        estado === 'IMPRESO'
          ? 'Boleta marcada como impresa.'
          : estado === 'OMITIDO'
            ? 'Boleta omitida de la cola.'
            : 'Boleta devuelta a la cola por imprimir.'
      );
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el estado en la cola.');
    }
  };

  const imprimirManualmente = async (item) => {
    setImprimiendoId(item.id_cola);
    try {
      const numero = await imprimirBoletaEnIframe(item, iframePrintRef);
      toast.success(`Ticket ${numero} enviado a impresión.`);
    } catch (err) {
      toast.error(err.message || 'No se pudo abrir el ticket para imprimir.');
    } finally {
      setImprimiendoId(null);
    }
  };

  const pendientes = cola.filter((c) => c.estado === 'PENDIENTE').length;
  const impresas = cola.filter((c) => c.estado === 'IMPRESO').length;
  const omitidas = cola.filter((c) => c.estado === 'OMITIDO').length;
  const colaFiltrada =
    filtroCola === 'TODAS' ? cola : cola.filter((c) => c.estado === filtroCola);

  const sedeSeleccionada =
    ubicaciones.find((u) => String(u.id_ubicacion) === String(idUbicacionEfectivo))?.nombre ||
    'la sede elegida';

  const ultimaTexto = formatearFechaLima(configMeta.ultima_ejecucion, true);
  const proximaTexto = formatearFechaLima(configMeta.proxima_ejecucion, true);

  return (
    <div className="space-y-5">
      {/* BLOQUE 1: ESTADO ACTUAL Y ACCIONES PRINCIPALES */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`p-3 rounded-xl border ${
                form.activo
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              <Bot size={26} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-lg font-black text-blue-950">
                  Generador Automático de Boletas (Serie B001)
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    form.activo
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                >
                  {form.activo
                    ? form.solo_horario_laboral && !configMeta.proxima_ejecucion
                      ? `EN ESPERA (Hasta las ${form.hora_inicio})`
                      : 'ACTIVO — Emitiendo en momentos aleatorios'
                    : 'DETENIDO — En pausa'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                Emite boletas simples a <strong>CLIENTES VARIOS (DNI 00000000)</strong> menores a{' '}
                <strong>S/ 700</strong> en momentos aleatorios exactos al segundo dentro de tu rango horario,{' '}
                <strong>sin descontar stock ni mover el Kardex</strong>.
              </p>
            </div>
          </div>

          {puedeEditar && (
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2">
              <button
                type="button"
                onClick={toggleActivo}
                disabled={guardando}
                className={`min-h-[42px] px-4 py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs disabled:opacity-60 ${
                  form.activo
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {form.activo ? <Square size={15} /> : <Play size={16} />}
                <span>{form.activo ? 'Fin / Pausar Automático' : 'Play — Activar Automático'}</span>
              </button>

              <button
                type="button"
                onClick={generarPruebaAhora}
                disabled={generandoAhora}
                title="Emite inmediatamente una boleta real sin esperar el temporizador aleatorio"
                className="min-h-[42px] px-4 py-2 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Zap size={16} />
                <span>{generandoAhora ? 'Emitiendo boleta...' : 'Emitir 1 Boleta Ahora'}</span>
              </button>
            </div>
          )}
        </div>

        {/* RESUMEN CLARO EN LENGUAJE SIMPLE */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-2">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-blue-950">¿Qué hará con esta configuración?</strong>{' '}
              {form.activo ? 'Desde que diste Play, en cada ciclo esperará ' : 'Cuando des Play, en cada ciclo esperará '}
              un tiempo <strong>aleatorio entre {form.intervalo_min_minutos || '—'} y {form.intervalo_max_minutos || '—'} minutos</strong>{' '}
              (por ejemplo <em>5 min 53 seg</em> u <em>8 min 02 seg</em>), elegirá productos activos del catálogo y emitirá una boleta fiscalmente registrada en{' '}
              <strong>{sedeSeleccionada}</strong> (<strong>sin descontar stock</strong>) por un monto entre{' '}
              <strong>S/ {Number(form.monto_minimo || 0).toFixed(2)}</strong> y{' '}
              <strong>S/ {Number(form.monto_maximo || 0).toFixed(2)}</strong> (porciones de{' '}
              <strong>{Number(form.peso_minimo_item || 0.5).toFixed(2)} kg</strong> a{' '}
              <strong>{Number(form.peso_maximo_item || 8).toFixed(2)} kg</strong>).{' '}
              {form.solo_horario_laboral ? (
                <span>
                  Solo emitirá de <strong>{form.hora_inicio}</strong> a <strong>{form.hora_fin}</strong> (hora Perú); al terminar la hora de fin quedará en espera y retomará automáticamente al día siguiente.
                </span>
              ) : (
                <span>Emitirá de forma continua las 24 horas hasta que pulses Fin.</span>
              )}{' '}
              {form.auto_imprimir_navegador
                ? 'Se enviará automáticamente a imprimir desde este navegador.'
                : 'Se guardará en la cola inferior para que la imprimas manualmente.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-slate-400" />
              <strong>Última emisión:</strong> {ultimaTexto || 'Aún no se ha ejecutado'}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={13} className="text-emerald-600" />
              <strong>Próxima emisión aleatoria:</strong>{' '}
              {!form.activo
                ? 'En pausa'
                : form.solo_horario_laboral && !configMeta.proxima_ejecucion
                  ? `En espera hasta ${form.hora_inicio} (Lima)`
                  : proximaTexto || 'Programando...'}
            </span>
            <span className="flex items-center gap-1.5">
              <Printer size={13} className="text-amber-600" />
              <strong>Por imprimir en cola:</strong> {pendientes} boleta(s)
            </span>
          </div>
        </div>

        {hayCambios && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3.5 py-2.5 text-xs font-semibold">
            <AlertCircle size={16} className="shrink-0 text-amber-600" />
            <span>
              Tienes cambios sin guardar. Haz clic en <strong>Guardar Configuración</strong> (abajo) o{' '}
              <strong>{form.activo ? 'Fin / Pausar' : 'Play — Activar Automático'}</strong> para aplicarlos.
            </span>
          </div>
        )}
      </div>

      {/* BLOQUE 2: PARÁMETROS CLAROS POR GRUPO */}
      <form
        onSubmit={guardarConfiguracion}
        className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h4 className="font-bold text-blue-950 text-base">
              1. Reglas de Emisión y Rango Aleatorio
            </h4>
            <p className="text-xs text-slate-500">
              El sistema elige al azar un momento exacto (minutos y segundos) entre el mínimo y el máximo. No descuenta inventario.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Rangos rápidos:</span>
            {RANGOS_RAPIDOS.map((r) => {
              const activoChip =
                String(form.intervalo_min_minutos) === r.min &&
                String(form.intervalo_max_minutos) === r.max;
              return (
                <button
                  key={r.label}
                  type="button"
                  disabled={!puedeEditar}
                  onClick={() => aplicarRangoRapido(r.min, r.max)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    activoChip
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* INTERVALO MINIMO */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Rango aleatorio: Mínimo (min)
            </label>
            <input
              type="number"
              min="1"
              max="1440"
              disabled={!puedeEditar}
              value={form.intervalo_min_minutos}
              onChange={(e) => actualizarCampo('intervalo_min_minutos', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.intervalo_min_minutos ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            />
            {errores.intervalo_min_minutos ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.intervalo_min_minutos}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Ejemplo: 5 (como mínimo espera 5 min).</p>
            )}
          </div>

          {/* INTERVALO MAXIMO */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Rango aleatorio: Máximo (min)
            </label>
            <input
              type="number"
              min="1"
              max="1440"
              disabled={!puedeEditar}
              value={form.intervalo_max_minutos}
              onChange={(e) => actualizarCampo('intervalo_max_minutos', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.intervalo_max_minutos ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            />
            {errores.intervalo_max_minutos ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.intervalo_max_minutos}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Ejemplo: 10 (dispara al azar ej. 5m 53s o 8m 02s).</p>
            )}
          </div>

          {/* SEDE */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <MapPin size={13} className="text-slate-400" />
              <span>Sede emisora (sin descontar stock)</span>
            </label>
            <select
              disabled={!puedeEditar}
              value={idUbicacionEfectivo}
              onChange={(e) => actualizarCampo('id_ubicacion', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.id_ubicacion ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            >
              {ubicaciones.length === 0 && <option value="">Sin ubicaciones</option>}
              {ubicaciones.map((u) => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>
                  {u.nombre}
                </option>
              ))}
            </select>
            {errores.id_ubicacion ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.id_ubicacion}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Solo registra la sede en el comprobante; no altera inventario.</p>
            )}
          </div>

          {/* MONTO MINIMO Y MAXIMO EN PARES CLAROS */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Monto mínimo por boleta (S/)
            </label>
            <input
              type="number"
              step="any"
              min="1"
              disabled={!puedeEditar}
              value={form.monto_minimo}
              onChange={(e) => actualizarCampo('monto_minimo', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.monto_minimo ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            />
            {errores.monto_minimo ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.monto_minimo}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Importe mínimo aproximado de cada ticket.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Monto máximo (&lt; S/ 700.00)
            </label>
            <input
              type="number"
              step="any"
              min="1"
              max="699.99"
              disabled={!puedeEditar}
              value={form.monto_maximo}
              onChange={(e) => actualizarCampo('monto_maximo', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.monto_maximo ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            />
            {errores.monto_maximo ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.monto_maximo}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Límite SUNAT sin DNI: siempre menor a S/ 700.</p>
            )}
          </div>

          {/* PESO MINIMO */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Peso mínimo por producto (kg)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              disabled={!puedeEditar}
              value={form.peso_minimo_item}
              onChange={(e) => actualizarCampo('peso_minimo_item', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.peso_minimo_item ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            />
            {errores.peso_minimo_item ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.peso_minimo_item}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Mínimo 0.50 kg por cada línea elegida.</p>
            )}
          </div>

          {/* PESO MAXIMO */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Peso máximo por producto (kg)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              disabled={!puedeEditar}
              value={form.peso_maximo_item}
              onChange={(e) => actualizarCampo('peso_maximo_item', e.target.value)}
              className={`w-full border rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                errores.peso_maximo_item ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200'
              }`}
            />
            {errores.peso_maximo_item ? (
              <p className="text-[11px] text-rose-600 font-semibold">{errores.peso_maximo_item}</p>
            ) : (
              <p className="text-[11px] text-slate-400">Tope máximo de kg por producto en una boleta.</p>
            )}
          </div>

          {/* HORA INICIO Y HORA FIN */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Hora inicio (Lima)
              </label>
              <input
                type="time"
                disabled={!puedeEditar || !form.solo_horario_laboral}
                value={form.hora_inicio}
                onChange={(e) => actualizarCampo('hora_inicio', e.target.value)}
                className={`w-full border rounded-xl px-2.5 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  !form.solo_horario_laboral
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : errores.hora_inicio
                      ? 'border-rose-400 bg-rose-50/40'
                      : 'border-slate-200'
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Hora fin (Lima)
              </label>
              <input
                type="time"
                disabled={!puedeEditar || !form.solo_horario_laboral}
                value={form.hora_fin}
                onChange={(e) => actualizarCampo('hora_fin', e.target.value)}
                className={`w-full border rounded-xl px-2.5 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  !form.solo_horario_laboral
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : errores.hora_fin
                      ? 'border-rose-400 bg-rose-50/40'
                      : 'border-slate-200'
                }`}
              />
            </div>
            <p className="col-span-2 text-[11px] text-slate-400">
              {form.solo_horario_laboral
                ? 'Duerme fuera de este horario y retoma al día siguiente.'
                : 'Marca "Restringir a horario de atención" para activar estas horas.'}
            </p>
          </div>
        </div>

        {/* OPCIONES DE HORARIO E IMPRESIÓN + BOTÓN GUARDAR */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2">
          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              disabled={!puedeEditar}
              checked={Boolean(form.solo_horario_laboral)}
              onChange={(e) => actualizarCampo('solo_horario_laboral', e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 w-4 h-4 shrink-0"
            />
            <div>
              <span className="text-xs font-bold text-slate-800 block">
                Restringir a horario de atención (hora de Perú)
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Emite entre las {form.hora_inicio} y las {form.hora_fin}. Durante la noche queda en espera y retoma solo al día siguiente.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              disabled={!puedeEditar}
              checked={Boolean(form.auto_imprimir_navegador)}
              onChange={(e) => actualizarCampo('auto_imprimir_navegador', e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 w-4 h-4 shrink-0"
            />
            <div>
              <span className="text-xs font-bold text-slate-800 block">
                Auto-imprimir automáticamente desde esta PC / navegador
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Mientras este sistema siga abierto en una pestaña, abrirá la impresión al instante en cuanto se genere una boleta pendiente.
              </span>
            </div>
          </label>

          <SelectorDecreceStock
            value={Boolean(form.decrece_stock)}
            onChange={(val) => actualizarCampo('decrece_stock', val)}
            disabled={!puedeEditar}
            compact
          />
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
            >
              <Save size={16} />
              <span>{guardando ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>
        )}
      </form>

      {/* BLOQUE 3: COLA DE IMPRESIÓN */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-start gap-2.5">
            <Printer size={19} className="text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-bold text-blue-950 text-base">
                2. Cola de Impresión de Boletas ({pendientes} por imprimir)
              </h4>
              <p className="text-xs text-slate-500">
                Aquí aparecen las boletas creadas por el generador. Puedes imprimir el ticket directo o cambiar su estado.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'TODAS', label: `Todas (${cola.length})` },
              { id: 'PENDIENTE', label: `Por imprimir (${pendientes})` },
              { id: 'IMPRESO', label: `Impresas (${impresas})` },
              { id: 'OMITIDO', label: `Omitidas (${omitidas})` }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroCola(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  filtroCola === f.id
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => cargarTodo(hayCambios)}
              disabled={cargando}
              className="p-2 text-slate-600 hover:bg-slate-200 rounded-xl border border-slate-200 bg-white cursor-pointer"
              title="Actualizar cola de impresión"
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
            </button>

            <BotonExportarExcel
              onClick={() =>
                exportarTablaExcel({
                  nombreArchivo: 'facturacion_boletas_automaticas_cola',
                  nombreHoja: 'Boletas Auto',
                  filas: cola,
                  columnas: [
                    { header: 'Boleta', value: (r) => `${r.serie}-${String(r.correlativo).padStart(8, '0')}` },
                    { header: 'Cliente', value: (r) => r.cliente_nombre || 'CLIENTES VARIOS' },
                    { header: 'Fecha / Hora (Lima)', value: (r) => formatearFechaLima(r.creado_en, true) || '' },
                    {
                      header: 'Productos',
                      value: (r) =>
                        Array.isArray(r.items_json)
                          ? r.items_json.map((it) => `${it.descripcion} (${Number(it.cantidad || 0).toFixed(2)} kg)`).join(', ')
                          : ''
                    },
                    { header: 'Total (S/)', value: (r) => Number(r.monto_total || 0) },
                    { header: 'Estado Cola', key: 'estado' }
                  ]
                })
              }
              label="Exportar Excel (Cola)"
              cantidad={cola.length}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-100">
                <th className="py-3 px-4">Boleta</th>
                <th className="py-3 px-4">Fecha / Hora (Lima)</th>
                <th className="py-3 px-4">Productos y Peso</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {colaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                    {cola.length === 0
                      ? 'Todavía no hay boletas generadas en la cola. Pulsa "Play — Activar Automático" o "Emitir 1 Boleta Ahora" para probar.'
                      : 'No hay boletas en este filtro.'}
                  </td>
                </tr>
              ) : (
                colaFiltrada.map((item) => {
                  const numero = `${item.serie}-${String(item.correlativo).padStart(8, '0')}`;
                  const items = Array.isArray(item.items_json) ? item.items_json : [];
                  const resumenProductos = items
                    .map((it) => `${it.descripcion} (${Number(it.cantidad || 0).toFixed(2)} kg)`)
                    .join(', ');
                  const badge = obtenerBadgeEstadoCola(item.estado);

                  return (
                    <tr key={item.id_cola} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-black text-blue-950">{numero}</div>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {item.cliente_nombre || 'CLIENTES VARIOS'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {formatearFechaLima(item.creado_en, true) || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                        {resumenProductos || `${item.cantidad_items || 0} producto(s)`}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-blue-950 whitespace-nowrap">
                        S/ {Number(item.monto_total || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.clase}`}
                        >
                          {badge.etiqueta}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => imprimirManualmente(item)}
                            disabled={imprimiendoId === item.id_cola}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Abrir ticket de boleta para imprimir"
                          >
                            <Printer size={13} />
                            <span>Imprimir</span>
                          </button>

                          {puedeEditar && item.estado === 'PENDIENTE' && (
                            <>
                              <button
                                type="button"
                                onClick={() => cambiarEstadoCola(item.id_cola, 'IMPRESO')}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                title="Marcar manualmente como ya impresa"
                              >
                                <CheckCircle2 size={13} />
                                <span>Marcar impresa</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => cambiarEstadoCola(item.id_cola, 'OMITIDO')}
                                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                title="Saltar impresión de esta boleta"
                              >
                                <Ban size={13} />
                                <span>Omitir</span>
                              </button>
                            </>
                          )}

                          {puedeEditar && item.estado !== 'PENDIENTE' && (
                            <button
                              type="button"
                              onClick={() => cambiarEstadoCola(item.id_cola, 'PENDIENTE')}
                              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                              title="Volver a poner en lista por imprimir"
                            >
                              <RotateCcw size={13} />
                              <span>Volver a cola</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
