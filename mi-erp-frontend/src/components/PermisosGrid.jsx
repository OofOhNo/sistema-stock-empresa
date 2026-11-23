import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Layers, Pencil, Trash2, ShieldPlus, Save, Loader2, Shield } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';
import {
  MODULOS_SISTEMA_INFO,
  formatearDuracionSesionLegible,
} from '../utils/sesionRol';
import { exportarTablaExcel } from '../utils/excelExport';
import BotonExportarExcel from './BotonExportarExcel';
import SelectorDuracionSesion from './SelectorDuracionSesion';
import SelectorSeccionesRol from './SelectorSeccionesRol';
import ModalRolFormulario from './ModalRolFormulario';
import ModalEliminarRol from './ModalEliminarRol';

const INFO_MODULOS = Object.fromEntries(
  MODULOS_SISTEMA_INFO.map((m) => [m.id, { nombre: m.nombre, ayuda: m.descripcion }])
);
INFO_MODULOS.calendario_pagos = {
  nombre: 'Calendario de Pagos',
  ayuda: 'Cada usuario con acceso ve y gestiona únicamente su propio calendario personal de pagos',
};

const OPCIONES_JERARQUIA = [
  { val: 1, label: 'Nivel 1 — Máxima jerarquía (Dirección / Admin)' },
  { val: 2, label: 'Nivel 2 — Gerencia / Subgerencia' },
  { val: 3, label: 'Nivel 3 — Jefatura / Supervisión' },
  { val: 4, label: 'Nivel 4 — Mando medio / Base' },
  { val: 5, label: 'Nivel 5 — Administrativo / Ventas' },
  { val: 6, label: 'Nivel 6 — Operativo / Planta' },
  { val: 7, label: 'Nivel 7 — Auxiliar / Apoyo' },
  { val: 8, label: 'Nivel 8 — Invitado / Lectura' },
  { val: 9, label: 'Nivel 9 — Restringido' },
  { val: 10, label: 'Nivel 10 — Mínimo' },
];

export default function PermisosGrid({ puedeEditar = true, usuarioLogueado, onPermisoCambiado }) {
  const [permisos, setPermisos] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoClave, setGuardandoClave] = useState(null);
  const [guardandoDuracionId, setGuardandoDuracionId] = useState(null);

  // Panel desplegable de secciones por rol seleccionado
  const [rolSeleccionadoId, setRolSeleccionadoId] = useState('');
  const [borradorSecciones, setBorradorSecciones] = useState(null);
  const [guardandoPanel, setGuardandoPanel] = useState(false);

  // Modales de creación, edición y eliminación de roles
  const [modalRolState, setModalRolState] = useState({ abierto: false, rol: null });
  const [rolAEliminar, setRolAEliminar] = useState(null);

  const rolUsuarioActual = usuarioLogueado?.rol || usuarioLogueado?.nombre_rol || '';
  const esAdminCentralUsuario = rolUsuarioActual === 'Admin Central';
  const nivelUsuarioActual = Number(usuarioLogueado?.nivel_jerarquia || 4);

  const construirMapaPermisosRol = useCallback(
    (idRol, listaPermisos = permisos) => {
      const mapa = {};
      for (const m of MODULOS_SISTEMA_INFO) {
        const encontrado = listaPermisos.find(
          (p) => Number(p.rol_id) === Number(idRol) && p.modulo === m.id
        );
        mapa[m.id] = {
          puede_ver: Boolean(encontrado?.puede_ver),
          puede_editar: Boolean(encontrado?.puede_editar),
        };
      }
      return mapa;
    },
    [permisos]
  );

  const cargarPermisos = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [resPermisos, resRoles] = await Promise.all([
        api.get('/usuarios/permisos'),
        api.get('/usuarios/roles'),
      ]);
      const nuevaListaPermisos = resPermisos.data.datos || resPermisos.data.permisos || [];
      const nuevosRoles = resRoles.data.datos || [];
      setPermisos(nuevaListaPermisos);
      setRolesList(nuevosRoles);

      setRolSeleccionadoId((prev) => {
        if (prev && nuevosRoles.some((r) => String(r.id_rol) === String(prev))) {
          return prev;
        }
        const primeroNoAdmin = nuevosRoles.find((r) => r.nombre !== 'Admin Central');
        return String((primeroNoAdmin || nuevosRoles[0])?.id_rol || '');
      });
    } catch (err) {
      if (!silencioso) {
        toast.error(err.response?.data?.mensaje || 'No se pudieron cargar los permisos.');
      }
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarPermisos(false);
    });
    return () => {
      alive = false;
    };
  }, [cargarPermisos]);

  const rolSeleccionado = useMemo(
    () => rolesList.find((r) => String(r.id_rol) === String(rolSeleccionadoId)) || null,
    [rolesList, rolSeleccionadoId]
  );

  const permisosBasePanel = useMemo(
    () => (rolSeleccionado ? construirMapaPermisosRol(rolSeleccionado.id_rol, permisos) : {}),
    [rolSeleccionado, permisos, construirMapaPermisosRol]
  );
  const permisosBorrador = borradorSecciones ?? permisosBasePanel;
  const cambiosPendientesPanel = borradorSecciones !== null;

  const handleSeleccionarRolPanel = (nuevoId) => {
    setRolSeleccionadoId(String(nuevoId));
    setBorradorSecciones(null);
  };

  const guardarSeccionesPanel = async () => {
    if (!puedeEditar || !rolSeleccionado) return;
    const payloadPermisos = MODULOS_SISTEMA_INFO.map((m) => ({
      modulo: m.id,
      puede_ver: Boolean(permisosBorrador?.[m.id]?.puede_ver),
      puede_editar: Boolean(permisosBorrador?.[m.id]?.puede_editar),
    }));

    setGuardandoPanel(true);
    try {
      await api.put(`/usuarios/roles/${rolSeleccionado.id_rol}`, {
        permisos: payloadPermisos,
      });
      toast.success(`Secciones actualizadas para "${rolSeleccionado.nombre}".`);
      setBorradorSecciones(null);
      await cargarPermisos(true);
      onPermisoCambiado?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudieron guardar las secciones del rol.');
    } finally {
      setGuardandoPanel(false);
    }
  };

  const togglePermiso = async (p, campo) => {
    if (!puedeEditar) return;
    const clave = `${p.rol_id}:${p.modulo}`;
    if (guardandoClave === clave) return;

    const nuevoValor = !p[campo];
    const payload = {
      rol_id: p.rol_id,
      modulo: p.modulo,
      puede_ver: p.puede_ver,
      puede_editar: p.puede_editar,
    };

    if (campo === 'puede_editar') {
      payload.puede_editar = nuevoValor;
      if (nuevoValor) payload.puede_ver = true;
    } else {
      payload.puede_ver = nuevoValor;
      if (!nuevoValor) payload.puede_editar = false;
    }

    const estadoAnterior = permisos;
    setGuardandoClave(clave);
    setPermisos((prev) =>
      prev.map((item) =>
        item.rol_id === p.rol_id && item.modulo === p.modulo
          ? { ...item, puede_ver: payload.puede_ver, puede_editar: payload.puede_editar }
          : item
      )
    );

    try {
      await api.put('/usuarios/permisos', payload);
      toast.success('Permiso guardado.');
      setBorradorSecciones(null);
      onPermisoCambiado?.();
    } catch (err) {
      setPermisos(estadoAnterior);
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar el permiso.');
    } finally {
      setGuardandoClave(null);
    }
  };

  const toggleOtrasUbicaciones = async (rolId, valorActual) => {
    if (!puedeEditar) return;
    try {
      await api.put(`/usuarios/roles/${rolId}/ubicaciones-permiso`, {
        puede_ver_otras_ubicaciones: !valorActual,
      });
      toast.success('Acceso a otras sedes actualizado.');
      await cargarPermisos(true);
      onPermisoCambiado?.();
    } catch (err) {
      toast.error('No se pudo actualizar: ' + (err.response?.data?.mensaje || err.message));
    }
  };

  const guardarDuracionSesionRol = async (rolId, minutos) => {
    if (!puedeEditar) return;
    setGuardandoDuracionId(rolId);
    try {
      const res = await api.put(`/usuarios/roles/${rolId}/duracion-sesion`, {
        duracion_sesion_minutos: minutos,
      });
      toast.success(res.data?.mensaje || 'Tiempo de sesión actualizado.');
      await cargarPermisos(true);
      onPermisoCambiado?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el tiempo de sesión.');
    } finally {
      setGuardandoDuracionId(null);
    }
  };

  const guardarNivelJerarquiaRol = async (rolId, nivel) => {
    if (!puedeEditar) return;
    try {
      const res = await api.put(`/usuarios/roles/${rolId}/jerarquia`, {
        nivel_jerarquia: Number(nivel),
      });
      toast.success(res.data?.mensaje || 'Nivel jerárquico actualizado.');
      await cargarPermisos(true);
      onPermisoCambiado?.();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el nivel jerárquico.');
    }
  };

  const puedeEliminarRolObjetivo = (r) => {
    if (!puedeEditar || !r) return false;
    if (r.id_rol === 1 || r.nombre === 'Admin Central') return false;
    if (Number(usuarioLogueado?.rol_id) === Number(r.id_rol) || r.nombre === rolUsuarioActual) {
      return false;
    }
    if (!esAdminCentralUsuario && Number(r.nivel_jerarquia || 4) < nivelUsuarioActual) {
      return false;
    }
    return true;
  };

  const exportarRolesYPermisosExcel = () => {
    const modulosCanonicos = MODULOS_SISTEMA_INFO.map((m) => m.id);
    const filas = [];
    for (const rolObj of rolesList) {
      const modulosRol = modulosCanonicos
        .map((mod) => {
          const p = permisos.find((x) => x.nombre_rol === rolObj.nombre && x.modulo === mod);
          const esAdmin = rolObj.nombre === 'Admin Central';
          const ver = esAdmin || Boolean(p?.puede_ver);
          const editar = esAdmin || Boolean(p?.puede_editar);
          const nombreMod = INFO_MODULOS[mod]?.nombre || mod;
          return `${nombreMod}: ${editar ? 'Ver+Editar' : ver ? 'Solo Ver' : 'Sin acceso'}`;
        })
        .join(' | ');
      filas.push({
        rol: rolObj.nombre,
        descripcion: rolObj.descripcion || '',
        nivel_jerarquia: Number(rolObj.nivel_jerarquia || (rolObj.nombre === 'Admin Central' ? 1 : 4)),
        ve_todas_sedes:
          rolObj.nombre === 'Admin Central' || rolObj.puede_ver_otras_ubicaciones ? 'Sí' : 'No',
        expiracion_sesion: formatearDuracionSesionLegible(rolObj.duracion_sesion_minutos),
        usuarios_activos: Number(rolObj.total_usuarios || 0),
        permisos_detalle: modulosRol,
      });
    }
    exportarTablaExcel({
      nombreArchivo: 'roles_y_permisos',
      nombreHoja: 'Roles y Permisos',
      filas,
      columnas: [
        { header: 'Rol', key: 'rol' },
        { header: 'Descripción', key: 'descripcion' },
        { header: 'Nivel Jerarquía', key: 'nivel_jerarquia' },
        { header: 'Ve Otras Sedes', key: 've_todas_sedes' },
        { header: 'Duración Sesión', key: 'expiracion_sesion' },
        { header: 'Usuarios Activos', key: 'usuarios_activos' },
        { header: 'Permisos por Pantalla', key: 'permisos_detalle' },
      ],
    });
  };

  if (cargando) {
    return <div className="p-6 text-slate-500 font-medium">Cargando tabla de permisos...</div>;
  }

  const modulosPresentesSet = new Set(permisos.map((p) => p.modulo));
  const modulos = MODULOS_SISTEMA_INFO.map((m) => m.id).filter((id) =>
    modulosPresentesSet.has(id)
  );

  if (modulos.length === 0) {
    return <div className="p-6 text-slate-500">No hay permisos configurados todavía.</div>;
  }

  const esRolSelAdmin =
    rolSeleccionado &&
    (rolSeleccionado.id_rol === 1 || rolSeleccionado.nombre === 'Admin Central');
  const esRolSelPropio =
    rolSeleccionado &&
    (Number(usuarioLogueado?.rol_id) === Number(rolSeleccionado.id_rol) ||
      rolSeleccionado.nombre === rolUsuarioActual);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
      {/* PANEL DE GESTIÓN RÁPIDA DE ROLES Y SELECTOR DESPLEGABLE DE SECCIONES */}
      <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Shield size={20} className="text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-blue-950">
                Configurar rol y secciones que puede ver
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Selecciona un rol, edita su nombre/descripción/jerarquía o despliega sus secciones visibles (ej: ocultar Clientes o Calidad a roles operativos).
              </p>
            </div>
          </div>

          {puedeEditar && (
            <button
              type="button"
              onClick={() => setModalRolState({ abierto: true, rol: null })}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition cursor-pointer shrink-0"
            >
              <ShieldPlus className="w-4 h-4" />
              <span>+ Nuevo Rol</span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex-1">
            <select
              value={rolSeleccionadoId}
              onChange={(e) => handleSeleccionarRolPanel(e.target.value)}
              aria-label="Seleccionar rol a configurar"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold text-blue-950 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {rolesList.map((r) => (
                <option key={r.id_rol} value={String(r.id_rol)}>
                  {r.nombre} — Nivel {r.nivel_jerarquia || (r.nombre === 'Admin Central' ? 1 : 4)} ({r.total_usuarios || 0} pers.)
                </option>
              ))}
            </select>
          </div>

          {puedeEditar && rolSeleccionado && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setModalRolState({ abierto: true, rol: rolSeleccionado })}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 transition cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar Rol</span>
              </button>

              {puedeEliminarRolObjetivo(rolSeleccionado) && (
                <button
                  type="button"
                  onClick={() => setRolAEliminar(rolSeleccionado)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {rolSeleccionado && (
          <div className="space-y-2.5">
            {rolSeleccionado.descripcion && (
              <p className="text-xs text-slate-600 bg-white px-3.5 py-2 rounded-xl border border-slate-200">
                <strong>Descripción:</strong> {rolSeleccionado.descripcion}
              </p>
            )}

            <SelectorSeccionesRol
              permisosMap={permisosBorrador}
              onChangePermisos={(nuevoMapa) => {
                setBorradorSecciones(nuevoMapa);
              }}
              esRolAdminCentral={Boolean(esRolSelAdmin)}
              esPropioRol={Boolean(esRolSelPropio)}
              disabled={!puedeEditar || guardandoPanel}
              defaultOpen={false}
              titulo={`Pestaña desplegable de secciones para "${rolSeleccionado.nombre}"`}
            />

            {cambiosPendientesPanel && !esRolSelAdmin && puedeEditar && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={guardandoPanel}
                  onClick={() => {
                    setBorradorSecciones(null);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 transition cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  disabled={guardandoPanel}
                  onClick={guardarSeccionesPanel}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {guardandoPanel ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Guardar secciones de "{rolSeleccionado.nombre}"</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACCESO MULTI-SEDES POR ROL */}
      <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
        <div className="mb-3">
          <h4 className="text-sm font-bold text-blue-950">
            🏢 ¿Qué roles pueden ver el inventario y los pedidos de TODAS las sedes?
          </h4>
          <p className="text-xs text-slate-600 mt-1">
            Si la casilla está desmarcada, las personas con ese rol{' '}
            <strong>solo verán su propia sede</strong>. Si la marcas, podrán ver todas las sedes.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {rolesList.map((r) => {
            const esAdmin = r.nombre === 'Admin Central';
            const tieneAcceso = esAdmin || Boolean(r.puede_ver_otras_ubicaciones);
            return (
              <label
                key={r.id_rol}
                className={`bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs ${
                  esAdmin || !puedeEditar ? 'opacity-80' : 'cursor-pointer hover:border-indigo-300'
                }`}
              >
                <div className="pr-2">
                  <p className="text-xs font-bold text-slate-800">{r.nombre}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {tieneAcceso ? '🟢 Ve todas las sedes' : '🔒 Solo ve su sede'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={tieneAcceso}
                  disabled={esAdmin || !puedeEditar}
                  onChange={() => toggleOtrasUbicaciones(r.id_rol, r.puede_ver_otras_ubicaciones)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* RE-INICIO DE SESIÓN OBLIGATORIO POR ROL (NÚMERO + UNIDAD SEPARADOS) */}
      <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200/80">
        <div className="mb-3 flex items-start gap-2.5">
          <Clock size={18} className="text-amber-700 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-blue-950">
              Cierre automático de sesión por rol
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Elige a la izquierda el número y a la derecha la unidad (Minutos, Horas, Días, Meses o Sin cierre automático).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rolesList.map((r) => (
            <div
              key={r.id_rol}
              className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-800 truncate">{r.nombre}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0">
                  {formatearDuracionSesionLegible(r.duracion_sesion_minutos)}
                </span>
              </div>

              <SelectorDuracionSesion
                compacto
                mostrarResumen={false}
                value={r.duracion_sesion_minutos}
                disabled={!puedeEditar}
                guardando={guardandoDuracionId === r.id_rol}
                onGuardar={(mins) => guardarDuracionSesionRol(r.id_rol, mins)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* NIVEL JERÁRQUICO POR ROL */}
      <div className="p-4 bg-violet-50/60 rounded-xl border border-violet-200/80">
        <div className="mb-3 flex items-start gap-2.5">
          <Layers size={18} className="text-violet-700 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-blue-950">
              Nivel jerárquico de cada rol (Reuniones y administración)
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              <strong>Nivel 1</strong> es la jerarquía más alta. En Reuniones y gestión de roles, cada usuario solo puede actuar sobre niveles iguales o inferiores (número igual o mayor).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {rolesList.map((r) => {
            const esAdmin = r.nombre === 'Admin Central';
            const nivelActual = esAdmin ? 1 : Number(r.nivel_jerarquia || 4);
            return (
              <div
                key={`jerarquia-${r.id_rol}`}
                className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 truncate">{r.nombre}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 shrink-0">
                    Nivel {nivelActual}
                  </span>
                </div>
                <select
                  disabled={esAdmin || !puedeEditar}
                  value={nivelActual}
                  onChange={(e) => guardarNivelJerarquiaRol(r.id_rol, e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-700 focus:outline-hidden focus:border-violet-500 disabled:opacity-60 cursor-pointer"
                >
                  {OPCIONES_JERARQUIA.map((opt) => (
                    <option key={opt.val} value={opt.val}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* TABLA MATRIZ COMPARATIVA */}
      <div className="overflow-x-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-blue-950">
              Matriz comparativa de permisos por pantalla
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Ver:</strong> permite abrir esa pestaña. · <strong>Crear / Editar:</strong> permite agregar, cambiar o anular registros.
            </p>
          </div>
          <BotonExportarExcel
            onClick={exportarRolesYPermisosExcel}
            label="Exportar Excel (Roles y Permisos)"
            cantidad={rolesList.length}
          />
        </div>

        <table className="w-full text-left border-collapse min-w-[650px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
              <th className="p-3.5 font-bold">Pantalla del Sistema</th>
              {rolesList.map((rolObj) => (
                <th key={rolObj.id_rol} className="p-3.5 font-bold text-center">
                  <div className="inline-flex items-center gap-1.5">
                    <span>{rolObj.nombre}</span>
                    {puedeEditar && (
                      <button
                        type="button"
                        title={`Editar ${rolObj.nombre}`}
                        onClick={() => setModalRolState({ abierto: true, rol: rolObj })}
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded transition cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {puedeEliminarRolObjetivo(rolObj) && (
                      <button
                        type="button"
                        title={`Eliminar ${rolObj.nombre}`}
                        onClick={() => setRolAEliminar(rolObj)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {modulos.map((modulo) => {
              const info = INFO_MODULOS[modulo] || { nombre: modulo, ayuda: '' };
              return (
                <tr key={modulo} className="hover:bg-slate-50/80">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-800">{info.nombre}</div>
                    {info.ayuda && <div className="text-[11px] text-slate-500">{info.ayuda}</div>}
                  </td>
                  {rolesList.map((rolObj) => {
                    const p = permisos.find(
                      (x) => Number(x.rol_id) === Number(rolObj.id_rol) && x.modulo === modulo
                    );
                    const esAdmin = rolObj.nombre === 'Admin Central';
                    const esMiPropioRolUsuarios =
                      rolObj.nombre === rolUsuarioActual &&
                      String(modulo || '').toLowerCase() === 'usuarios';
                    const bloqueado =
                      esAdmin ||
                      !puedeEditar ||
                      esMiPropioRolUsuarios ||
                      (p && guardandoClave === `${p.rol_id}:${p.modulo}`);
                    if (!p && !esAdmin) {
                      return (
                        <td key={rolObj.id_rol} className="p-3.5 text-center text-slate-300">
                          -
                        </td>
                      );
                    }
                    const puedeVer = esAdmin ? true : Boolean(p?.puede_ver);
                    const puedeEditarMod = esAdmin ? true : Boolean(p?.puede_editar);

                    return (
                      <td key={rolObj.id_rol} className="p-3.5 text-center">
                        <div
                          className="inline-flex flex-col items-start space-y-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100"
                          title={
                            esMiPropioRolUsuarios
                              ? 'No puedes quitarte a tu propio rol el acceso a Personal y Roles'
                              : undefined
                          }
                        >
                          <label
                            className={`flex items-center space-x-2 text-xs font-medium ${
                              bloqueado ? 'text-slate-400' : 'text-slate-700 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={puedeVer}
                              onChange={() => p && togglePermiso(p, 'puede_ver')}
                              disabled={bloqueado}
                              className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <span>Ver</span>
                          </label>
                          <label
                            className={`flex items-center space-x-2 text-xs font-medium ${
                              bloqueado ? 'text-slate-400' : 'text-slate-700 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={puedeEditarMod}
                              onChange={() => p && togglePermiso(p, 'puede_editar')}
                              disabled={bloqueado}
                              className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                            />
                            <span>Crear / Editar</span>
                          </label>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ModalRolFormulario
        abierto={modalRolState.abierto}
        onClose={() => setModalRolState({ abierto: false, rol: null })}
        rolEditar={modalRolState.rol}
        permisosRolEditar={
          modalRolState.rol ? construirMapaPermisosRol(modalRolState.rol.id_rol) : null
        }
        usuarioLogueado={usuarioLogueado}
        onGuardado={async (rolGuardado) => {
          setBorradorSecciones(null);
          if (rolGuardado?.id_rol) {
            setRolSeleccionadoId(String(rolGuardado.id_rol));
          }
          await cargarPermisos(true);
          onPermisoCambiado?.();
        }}
      />

      <ModalEliminarRol
        rol={rolAEliminar}
        cantidadEmpleados={Number(rolAEliminar?.total_usuarios || 0)}
        onClose={() => setRolAEliminar(null)}
        onEliminado={async (idEliminado) => {
          setBorradorSecciones(null);
          if (String(rolSeleccionadoId) === String(idEliminado)) {
            setRolSeleccionadoId('');
          }
          await cargarPermisos(true);
          onPermisoCambiado?.();
        }}
      />
    </div>
  );
}
