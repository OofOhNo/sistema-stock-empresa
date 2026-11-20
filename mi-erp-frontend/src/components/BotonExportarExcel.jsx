import { FileSpreadsheet } from 'lucide-react';

export default function BotonExportarExcel({
  onClick,
  label = 'Exportar Excel',
  cantidad = null,
  disabled = false,
  className = ''
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Descargar todos los datos de esta pestaña en Excel (.xlsx)"
      className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs ${className}`}
    >
      <FileSpreadsheet size={16} className="shrink-0 text-emerald-700" />
      <span>{label}</span>
      {cantidad !== null && cantidad !== undefined && (
        <span className="px-1.5 py-0.5 rounded-md bg-emerald-200/70 text-emerald-900 text-[10px] font-extrabold tabular-nums">
          {cantidad}
        </span>
      )}
    </button>
  );
}
