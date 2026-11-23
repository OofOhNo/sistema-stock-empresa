import { useState, useMemo } from 'react';
import { ChevronDown, Eye, EyeOff, Lock, Check, ShieldAlert } from 'lucide-react';
import { MODULOS_SISTEMA_INFO } from '../utils/sesionRol';

const MODULOS_SOLO_OPERATIVOS = new Set(['stock', 'productos', 'pedidos', 'mensajes']);

/**
 * Pestaña desplegable para elegir qué secciones del sistema puede ver (y opcionalmente editar) un rol.
 */
export default function SelectorSeccionesRol({
  permisosMap = {},
  onChangePermisos,
  esRolAdminCentral = false,
  esPropioRol = false,
  disabled = false,
  defaultOpen = false,
  titulo = 'Secciones que puede ver este rol',
}) {
  const [abierto, setAbierto] = useState(defaultOpen);
  const [busqueda, setBusqueda] = useState('');

  const resumen = useMemo(() => {
    const visibles = MODULOS_SISTEMA_INFO.filter((m) =>
      esRolAdminCentral ? true : Boolean(permisosMap?.[m.id]?.puede_ver)
    );
    const ocultas = MODULOS_SISTEMA_INFO.filter((m) =>
      esRolAdminCentral ? false : !permisosMap?.[m.id]?.puede_ver
    );
    return { visibles, ocultas };
  }, [permisosMap, esRolAdminCentral]);

  const modulosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return MODULOS_SISTEMA_INFO;
    return MODULOS_SISTEMA_INFO.filter(
      (m) =>
        m.nombre.toLowerCase().includes(q) ||
        m.descripcion.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    );
  }, [busqueda]);

  const estaBloqueadoModulo = (modId) => {
    if (disabled || esRolAdminCentral) return true;
    if (esPropioRol && modId === 'usuarios') return true;
    return false;
  };

  const toggleVer = (modId) => {
    if (estaBloqueadoModulo(modId)) return;
    const actual = permisosMap?.[modId] || { puede_ver: false, puede_editar: false };
    const nuevoVer = !actual.puede_ver;
    onChangePermisos?.({
      ...permisosMap,
      [modId]: {
        puede_ver: nuevoVer,
        puede_editar: nuevoVer ? Boolean(actual.puede_editar) : false,
      },
    });
  };

  const toggleEditar = (modId) => {
    if (estaBloqueadoModulo(modId)) return;
    const actual = permisosMap?.[modId] || { puede_ver: false, puede_editar: false };
    const nuevoEditar = !actual.puede_editar;
    onChangePermisos?.({
      ...permisosMap,
      [modId]: {
        puede_ver: nuevoEditar ? true : Boolean(actual.puede_ver),
        puede_editar: nuevoEditar,
      },
    });
  };

  const aplicarPreset = (modo) => {
    if (disabled || esRolAdminCentral) return;
    const siguiente = {};
    for (const m of MODULOS_SISTEMA_INFO) {
      const bloqueado = esPropioRol && m.id === 'usuarios';
      if (bloqueado) {
        siguiente[m.id] = { puede_ver: true, puede_editar: true };
        continue;
      }
      if (modo === 'todas') {
        siguiente[m.id] = {
          puede_ver: true,
          puede_editar: Boolean(permisosMap?.[m.id]?.puede_editar),
        };
      } else if (modo === 'operativo') {
        const activo = MODULOS_SOLO_OPERATIVOS.has(m.id);
        siguiente[m.id] = {
          puede_ver: activo,
          puede_editar: activo ? Boolean(permisosMap?.[m.id]?.puede_editar) : false,
        };
      } else {
        const soloMensajes = m.id === 'mensajes';
        siguiente[m.id] = {
          puede_ver: soloMensajes,
          puede_editar: soloMensajes,
        };
      }
    }
    onChangePermisos?.(siguiente);
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between gap-3 text-left transition"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-blue-950">{titulo}</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              {resumen.visibles.length} de {MODULOS_SISTEMA_INFO.length} visibles
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            {esRolAdminCentral
              ? 'Admin Central tiene acceso completo garantizado a todas las secciones.'
              : resumen.visibles.length === 0
              ? 'Ninguna sección activa (solo Dashboard básico).'
              : `Ve: ${resumen.visibles.map((m) => m.nombre).join(', ')}`}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${
            abierto ? 'rotate-180' : ''
          }`}
        />
      </button>

      {abierto && (
        <div className="p-3.5 border-t border-slate-200 space-y-3 bg-white">
          {esRolAdminCentral ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>
                El rol <strong>Admin Central</strong> siempre ve y edita todas las secciones por seguridad del sistema.
              </span>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Filtrar sección (ej: clientes, calidad, stock...)"
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => aplicarPreset('todas')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => aplicarPreset('operativo')}
                    title="Deja visibles Stock, Productos, Pedidos y Mensajería; oculta Clientes, Calidad, Facturación, etc."
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition disabled:opacity-50"
                  >
                    Solo planta / obreros
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => aplicarPreset('minimo')}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition disabled:opacity-50"
                  >
                    Mínimo
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto pr-1 divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {modulosFiltrados.map((mod) => {
                  const state = permisosMap?.[mod.id] || { puede_ver: false, puede_editar: false };
                  const bloqueado = estaBloqueadoModulo(mod.id);
                  return (
                    <div
                      key={mod.id}
                      className={`px-3 py-2.5 flex items-center justify-between gap-3 transition ${
                        state.puede_ver ? 'bg-white' : 'bg-slate-50/70'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={bloqueado}
                        onClick={() => toggleVer(mod.id)}
                        className="flex items-start gap-2.5 text-left flex-1 min-w-0 disabled:cursor-not-allowed"
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                            state.puede_ver
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-300 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs font-bold ${
                                state.puede_ver ? 'text-slate-900' : 'text-slate-500'
                              }`}
                            >
                              {mod.nombre}
                            </span>
                            {bloqueado && esPropioRol && mod.id === 'usuarios' && (
                              <Lock className="w-3 h-3 text-amber-600" title="Requerido para tu propio rol" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">{mod.descripcion}</p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            state.puede_ver
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {state.puede_ver ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {state.puede_ver ? 'Visible' : 'Oculto'}
                        </span>

                        <button
                          type="button"
                          disabled={bloqueado}
                          onClick={() => toggleEditar(mod.id)}
                          title="Permite también crear o modificar registros en esta sección"
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition disabled:opacity-50 ${
                            state.puede_editar
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                          }`}
                        >
                          {state.puede_editar ? 'Puede editar' : 'Solo ver'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
