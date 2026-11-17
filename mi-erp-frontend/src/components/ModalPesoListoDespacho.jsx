import { X, Scale, CheckCircle2 } from 'lucide-react';

/**
 * Modal compartido para ingresar el peso total en kg al marcar un pedido
 * como "Listo para Despacho" desde Pedidos o Despacho.
 */
export default function ModalPesoListoDespacho({
  modalPesoListo,
  setModalPesoListo,
  onConfirmar,
  procesando = false,
}) {
  if (!modalPesoListo?.abierto) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Listo para Despacho</h3>
              <p className="text-xs text-slate-500">Pedido #{modalPesoListo.idPedido}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setModalPesoListo({ abierto: false, idPedido: null, peso: '' })}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onConfirmar} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Ingrese el peso total en kg <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                autoFocus
                placeholder="Ej: 15.50"
                value={modalPesoListo.peso}
                onChange={(e) => setModalPesoListo((prev) => ({ ...prev, peso: e.target.value }))}
                className="w-full px-3.5 py-2.5 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-medium"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                kg
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Este peso se mostrará automáticamente en Facturación al emitir el comprobante y se descontará el stock de la sede.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={procesando}
              onClick={() => setModalPesoListo({ abierto: false, idPedido: null, peso: '' })}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesando}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              {procesando ? 'Procesando...' : 'Confirmar Listo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
