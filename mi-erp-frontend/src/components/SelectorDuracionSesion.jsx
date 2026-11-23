import { useState, useEffect, useRef } from 'react';
import { Clock, Save, Loader2 } from 'lucide-react';
import {
  UNIDADES_DURACION_SESION,
  MAX_DURACION_SESION_MINUTOS,
  descomponerDuracionSesion,
  calcularMinutosDuracionSesion,
  formatearDuracionSesionLegible,
} from '../utils/sesionRol';

/**
 * Selector de duración de cierre automático de sesión en dos controles separados:
 * campo numérico a la izquierda y desplegable de unidad (Sin cierre, Minutos, Horas, Días, Meses) a la derecha.
 */
export default function SelectorDuracionSesion({
  value,
  onChange,
  onGuardar,
  guardando = false,
  disabled = false,
  mostrarResumen = true,
  compacto = false,
}) {
  const inicial = descomponerDuracionSesion(value);
  const [numero, setNumero] = useState(inicial.valor);
  const [unidad, setUnidad] = useState(inicial.unidad);
  const lastEmittedRef = useRef(value === '' || value === undefined ? null : value);

  useEffect(() => {
    const incoming = value === '' || value === undefined || value === null ? null : parseInt(value, 10);
    if (incoming === lastEmittedRef.current) return;
    const desc = descomponerDuracionSesion(incoming);
    setNumero(desc.valor);
    setUnidad(desc.unidad);
    lastEmittedRef.current = incoming;
  }, [value]);

  const emitirCambio = (nuevoNum, nuevaUnidad) => {
    if (nuevaUnidad === 'sin_limite') {
      lastEmittedRef.current = null;
      onChange?.(null, null);
      return;
    }

    const n = parseInt(nuevoNum, 10);
    if (!nuevoNum || Number.isNaN(n) || n < 1) {
      lastEmittedRef.current = undefined;
      onChange?.(null, 'Ingresa un número mayor o igual a 1.');
      return;
    }

    const mins = calcularMinutosDuracionSesion(n, nuevaUnidad);
    if (!mins || mins > MAX_DURACION_SESION_MINUTOS) {
      lastEmittedRef.current = undefined;
      onChange?.(null, 'El tiempo máximo permitido es de 60 meses (5 años).');
      return;
    }

    lastEmittedRef.current = mins;
    onChange?.(mins, null);
  };

  const handleNumeroChange = (e) => {
    const raw = e.target.value;
    if (raw === '') {
      setNumero('');
      emitirCambio('', unidad);
      return;
    }
    const soloDigitos = raw.replace(/[^0-9]/g, '');
    const nextUnit = unidad === 'sin_limite' ? 'horas' : unidad;
    if (unidad === 'sin_limite') setUnidad('horas');
    setNumero(soloDigitos);
    emitirCambio(soloDigitos, nextUnit);
  };

  const handleUnidadChange = (e) => {
    const nuevaUnidad = e.target.value;
    setUnidad(nuevaUnidad);
    if (nuevaUnidad === 'sin_limite') {
      setNumero('');
      emitirCambio('', 'sin_limite');
    } else {
      const nextNum = !numero || Number(numero) < 1 ? '1' : numero;
      setNumero(nextNum);
      emitirCambio(nextNum, nuevaUnidad);
    }
  };

  const minutosCalculados =
    unidad === 'sin_limite' ? null : calcularMinutosDuracionSesion(numero, unidad);
  const valorInvalido =
    unidad !== 'sin_limite' &&
    (!numero || Number(numero) < 1 || !minutosCalculados || minutosCalculados > MAX_DURACION_SESION_MINUTOS);

  return (
    <div className="space-y-1.5">
      <div className={`flex flex-wrap sm:flex-nowrap items-center gap-2 ${compacto ? '' : 'w-full'}`}>
        <div className={compacto ? 'w-24' : 'w-28 sm:w-32 shrink-0'}>
          <input
            type="number"
            min="1"
            step="1"
            disabled={disabled || guardando || unidad === 'sin_limite'}
            placeholder={unidad === 'sin_limite' ? '--' : 'Ej: 8'}
            aria-label="Cantidad de tiempo de sesión"
            value={unidad === 'sin_limite' ? '' : numero}
            onChange={handleNumeroChange}
            className={`w-full px-3 py-2 border rounded-xl text-sm font-semibold outline-none transition ${
              unidad === 'sin_limite'
                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                : valorInvalido
                ? 'bg-rose-50 border-rose-300 text-rose-800 focus:ring-2 focus:ring-rose-400'
                : 'bg-slate-50 border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500'
            }`}
          />
        </div>

        <div className="flex-1 min-w-[155px]">
          <select
            disabled={disabled || guardando}
            aria-label="Unidad de tiempo de sesión"
            value={unidad}
            onChange={handleUnidadChange}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          >
            {UNIDADES_DURACION_SESION.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {onGuardar && (
          <button
            type="button"
            disabled={disabled || guardando || valorInvalido}
            onClick={() => onGuardar(minutosCalculados)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50 shrink-0"
          >
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Guardar</span>
          </button>
        )}
      </div>

      {mostrarResumen && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {valorInvalido ? (
            <span className="text-rose-600 font-semibold">
              {minutosCalculados && minutosCalculados > MAX_DURACION_SESION_MINUTOS
                ? 'Supera el máximo de 60 meses.'
                : 'Ingresa un número entero positivo (mínimo 1).'}
            </span>
          ) : (
            <span className="text-slate-500">
              Cierre automático: <strong className="text-slate-700">{formatearDuracionSesionLegible(minutosCalculados)}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
