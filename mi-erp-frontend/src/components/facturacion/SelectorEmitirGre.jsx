import { Truck } from 'lucide-react';

/**
 * Selector "Sí / No" para decidir si al emitir una Factura (01) se genera también
 * su Guía de Remisión Electrónica (GRE) vinculada o se emite solo la Factura.
 */
export default function SelectorEmitirGre({
  value = true,
  onChange,
  disabled = false,
  compact = false
}) {
  const emitir = Boolean(value);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        emitir
          ? 'bg-sky-50/75 border-sky-200'
          : 'bg-slate-50 border-slate-200'
      } ${compact ? 'p-3' : 'p-3.5'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Truck
            size={16}
            className={`mt-0.5 shrink-0 ${emitir ? 'text-sky-700' : 'text-slate-500'}`}
          />
          <div className="min-w-0">
            <span className="block text-xs font-bold text-slate-800">
              ¿Emitir Guía de Remisión (GRE)?
            </span>
            <span className="block text-[11px] text-slate-500 leading-snug">
              {emitir
                ? 'Sí: se generará y vinculará la Guía de Remisión Electrónica junto con esta Factura.'
                : 'No: se emitirá únicamente la Factura electrónica, sin generar Guía de Remisión.'}
            </span>
          </div>
        </div>

        <div
          className="inline-flex rounded-xl bg-white p-0.5 border border-slate-300 shadow-2xs shrink-0"
          role="group"
          aria-label="¿Emitir Guía de Remisión?"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              !emitir
                ? 'bg-slate-800 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            No
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              emitir
                ? 'bg-sky-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Sí
          </button>
        </div>
      </div>
    </div>
  );
}
