import { useState } from 'react';
import { X, Shield, ShieldPlus, Layers, Globe, Loader2 } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';
import SelectorDuracionSesion from './SelectorDuracionSesion';
import SelectorSeccionesRol from './SelectorSeccionesRol';
import { MODULOS_SISTEMA_INFO } from '../utils/sesionRol';

const NIVELES_JERARQUIA = [
  { nivel: 1, etiqueta: 'Nivel 1 — Máxima Autoridad (Admin Central)' },
  { nivel: 2, etiqueta: 'Nivel 2 — Gerencia / Alta Dirección' },
  { nivel: 3, etiqueta: 'Nivel 3 — Jefatura' },
  { nivel: 4, etiqueta: 'Nivel 4 — Supervisión / Mando Medio' },
  { nivel: 5, etiqueta: 'Nivel 5 — Administrativo / Ventas' },
  { nivel: 6, etiqueta: 'Nivel 6 — Operativo / Planta' },
  { nivel: 7, etiqueta: 'Nivel 7 — Auxiliar / Asistente' },
  { nivel: 8, etiqueta: 'Nivel 8 — Invitado / Lectura' },
  { nivel: 9, etiqueta: 'Nivel 9 — Restringido' },
  { nivel: 10, etiqueta: 'Nivel 10 — Mínimo' },
];

function construirPermisosIniciales(permisosExistentes = null) {
  const mapa = {};
  for (const mod of MODULOS_SISTEMA_INFO) {
    if (permisosExistentes && permisosExistentes[mod.id]) {
      mapa[mod.id] = {
        puede_ver: Boolean(permisosExistentes[mod.id].puede_ver),
        puede_editar: Boolean(permisosExistentes[mod.id].puede_editar),
      };
    } else {
      const defaultMsg = !permisosExistentes && mod.id === 'mensajes';
      mapa[mod.id] = { puede_ver: defaultMsg, puede_editar: defaultMsg };
    }
  }
  return mapa;
}

function ModalRolFormularioContenido({
  onClose,
  rolEditar = null,
  permisosRolEditar = null,
  usuarioLogueado,
  onGuardado,
}) {
  const esEdicion = Boolean(rolEditar?.id_rol);
  const esRolAdminCentral = Boolean(
    rolEditar && (rolEditar.id_rol === 1 || rolEditar.nombre === 'Admin Central')
  );
  const esAdminCentralUsuario =
    usuarioLogueado?.rol === 'Admin Central' || usuarioLogueado?.nombre_rol === 'Admin Central';
  const nivelUsuario = Number(usuarioLogueado?.nivel_jerarquia || 4);
  const esPropioRol = Boolean(
    rolEditar &&
      (Number(usuarioLogueado?.rol_id) === Number(rolEditar.id_rol) ||
        usuarioLogueado?.rol === rolEditar.nombre ||
        usuarioLogueado?.nombre_rol === rolEditar.nombre)
  );

  const [nombre, setNombre] = useState(() => rolEditar?.nombre || '');
  const [descripcion, setDescripcion] = useState(() => rolEditar?.descripcion || '');
  const [nivelJerarquia, setNivelJerarquia] = useState(() =>
    rolEditar
      ? Number(rolEditar.nivel_jerarquia ?? (esRolAdminCentral ? 1 : 4))
      : Math.max(4, esAdminCentralUsuario ? 4 : nivelUsuario)
  );
  const [duracionMinutos, setDuracionMinutos] = useState(() =>
    rolEditar?.duracion_sesion_minutos ? Number(rolEditar.duracion_sesion_minutos) : null
  );
  const [errorDuracion, setErrorDuracion] = useState(null);
  const [puedeOtrasSedes, setPuedeOtrasSedes] = useState(() =>
    rolEditar ? Boolean(esRolAdminCentral || rolEditar.puede_ver_otras_ubicaciones) : false
  );
  const [permisosMap, setPermisosMap] = useState(() =>
    construirPermisosIniciales(rolEditar ? permisosRolEditar : null)
  );
  const [guardando, setGuardando] = useState(false);

  const nivelesDisponibles = NIVELES_JERARQUIA.filter((n) => {
    if (esRolAdminCentral) return n.nivel === 1;
    if (esAdminCentralUsuario) return n.nivel >= 1;
    return n.nivel >= nivelUsuario;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('Ingresa el nombre del rol.');
      return;
    }
    if (errorDuracion) {
      toast.error(errorDuracion);
      return;
    }

    const permisosArray = MODULOS_SISTEMA_INFO.map((m) => ({
      modulo: m.id,
      puede_ver: Boolean(permisosMap?.[m.id]?.puede_ver),
      puede_editar: Boolean(permisosMap?.[m.id]?.puede_editar),
    }));

    setGuardando(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        nivel_jerarquia: esRolAdminCentral ? 1 : Number(nivelJerarquia || 4),
        duracion_sesion_minutos: duracionMinutos,
        puede_ver_otras_ubicaciones: esRolAdminCentral ? true : Boolean(puedeOtrasSedes),
        ...(esRolAdminCentral ? {} : { permisos: permisosArray }),
      };

      const res = esEdicion
        ? await api.put(`/usuarios/roles/${rolEditar.id_rol}`, payload)
        : await api.post('/usuarios/roles', payload);

      toast.success(
        res.data?.mensaje || (esEdicion ? 'Rol actualizado correctamente.' : 'Rol creado con éxito.')
      );
      onGuardado?.(res.data?.rol);
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el rol.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-blue-950 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-2.5">
            {esEdicion ? (
              <Shield className="w-5 h-5 text-sky-400" />
            ) : (
              <ShieldPlus className="w-5 h-5 text-sky-400" />
            )}
            <h3 className="font-bold text-lg">
              {esEdicion ? `Editar Rol: ${rolEditar.nombre}` : 'Crear Nuevo Rol'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Nombre del Rol *
              </label>
              <input
                type="text"
                required
                maxLength={50}
                disabled={esRolAdminCentral || guardando}
                placeholder="Ej. Obreros de Planta, Cajero"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              />
              {esRolAdminCentral && (
                <p className="text-[10px] text-rose-600 mt-1 font-medium">
                  El nombre de Admin Central está protegido.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                <span>Jerarquía / Nivel de Mando</span>
              </label>
              <select
                disabled={esRolAdminCentral || guardando}
                value={esRolAdminCentral ? 1 : nivelJerarquia}
                onChange={(e) => setNivelJerarquia(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
              >
                {nivelesDisponibles.map((n) => (
                  <option key={n.nivel} value={n.nivel}>
                    {n.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Descripción breve
            </label>
            <input
              type="text"
              placeholder="Ej. Personal operativo sin acceso a clientes ni calidad y sanidad"
              value={descripcion}
              disabled={guardando}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Cierre automático de sesión
            </label>
            <SelectorDuracionSesion
              value={duracionMinutos}
              onChange={(mins, errMsg) => {
                setDuracionMinutos(mins);
                setErrorDuracion(errMsg);
              }}
              disabled={guardando}
            />
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer">
            <input
              type="checkbox"
              checked={esRolAdminCentral ? true : puedeOtrasSedes}
              disabled={esRolAdminCentral || guardando}
              onChange={(e) => setPuedeOtrasSedes(e.target.checked)}
              className="w-4 h-4 accent-indigo-600 rounded"
            />
            <Globe className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-slate-800 block">
                Puede consultar e interactuar con todas las sedes / ubicaciones
              </span>
              <span className="text-slate-500">
                Si está desactivado, solo verá información de su sede asignada.
              </span>
            </div>
          </label>

          <SelectorSeccionesRol
            permisosMap={permisosMap}
            onChangePermisos={setPermisosMap}
            esRolAdminCentral={esRolAdminCentral}
            esPropioRol={esPropioRol}
            disabled={guardando}
            defaultOpen={false}
          />

          <div className="flex space-x-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={guardando}
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || Boolean(errorDuracion)}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{esEdicion ? 'Guardar Cambios' : 'Crear Rol'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal unificado para crear un rol nuevo o editar nombre, descripción, jerarquía,
 * duración de sesión (número + unidad) y secciones visibles de un rol existente.
 */
export default function ModalRolFormulario(props) {
  if (!props.abierto) return null;
  return (
    <ModalRolFormularioContenido
      key={props.rolEditar?.id_rol ? `rol-${props.rolEditar.id_rol}` : 'rol-nuevo'}
      {...props}
    />
  );
}
