import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';

/**
 * Modal de confirmación segura antes de eliminar un rol.
 */
export default function ModalEliminarRol({
  rol,
  cantidadEmpleados = 0,
  onClose,
  onEliminado,
}) {
  const [eliminando, setEliminando] = useState(false);

  if (!rol) return null;

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      const res = await api.delete(`/usuarios/roles/${rol.id_rol}`);
      toast.success(res.data?.mensaje || `Rol "${rol.nombre}" eliminado correctamente.`);
      onEliminado?.(rol.id_rol);
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo eliminar el rol.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-rose-600 text-white flex items-center space-x-2.5">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="font-bold text-lg">Eliminar Rol</h3>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            ¿Estás seguro de eliminar permanentemente el rol{' '}
            <strong className="text-blue-950">{rol.nombre}</strong>?
          </p>

          {cantidadEmpleados > 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
              Este rol tiene actualmente <strong>{cantidadEmpleados}</strong>{' '}
              {cantidadEmpleados === 1 ? 'empleado activo asignado' : 'empleados activos asignados'}. Debes reasignarlos a otro rol antes de poder eliminarlo.
            </div>
          ) : (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
              Se eliminarán el rol y su matriz de permisos asociada. Esta acción no se puede deshacer.
            </div>
          )}

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              disabled={eliminando}
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={eliminando || cantidadEmpleados > 0}
              onClick={handleEliminar}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {eliminando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span>Eliminar Rol</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
