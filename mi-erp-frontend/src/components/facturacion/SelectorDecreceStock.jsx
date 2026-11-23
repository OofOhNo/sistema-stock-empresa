import { PackageMinus } from 'lucide-react';

/**
 * Botón selector "¿Decrece stock? Sí / No" compartido entre todos los módulos de facturación.
 * Por defecto siempre inicia en No (false).
 */
export default function SelectorDecreceStock({
  value = false,
  onChange,
  disabled = false,
  notaExtra = '',
  compact = false
}) {
  const decrece = Boolean(value);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        decrece
          ? 'bg-emerald-50/70 border-emerald-200'
          : 'bg-slate-50 border-slate-200'
      } ${compact ? 'p-3' : 'p-3.5'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <PackageMinus
            size={16}
            className={`mt-0.5 shrink-0 ${decrece ? 'text-emerald-700' : 'text-slate-500'}`}
          />
          <div className="min-w-0">
            <span className="block text-xs font-bold text-slate-800">
              ¿Decrece stock?
            </span>
            <span className="block text-[11px] text-slate-500 leading-snug">
              {notaExtra || (decrece
                ? 'Sí: descontará las cantidades del inventario al emitir.'
                : 'No: se emitirá sin modificar el stock en inventario.')}
            </span>
          </div>
        </div>

        <div
          className="inline-flex rounded-xl bg-white p-0.5 border border-slate-300 shadow-2xs shrink-0"
          role="group"
          aria-label="¿Decrece stock?"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              !decrece
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
              decrece
                ? 'bg-emerald-600 text-white shadow-2xs'
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
