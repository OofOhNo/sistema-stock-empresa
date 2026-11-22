import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { MapPin, Plus, Edit2, Trash2, Building2, Users, Package, RefreshCw, X, AlertTriangle, Truck, Layers, Check } from 'lucide-react';
import Organizacion from './Organizacion';
import PanelVehiculosTransporte from '../components/ubicaciones/PanelVehiculosTransporte';
import { exportarTablaExcel } from '../utils/excelExport';
import BotonExportarExcel from '../components/BotonExportarExcel';

export default function Ubicaciones({ usuario, onPermisosActualizados }) {
  const [subTab, setSubTab] = useState('sedes'); // 'sedes' | 'almacenes'
  const [ubicaciones, setUbicaciones] = useState([]);
  const [divisiones, setDivisiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [ubicacionAEliminar, setUbicacionAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  // Gestión de Áreas / Divisiones
  const [nuevaDivisionNombre, setNuevaDivisionNombre] = useState('');
  const [guardandoDivision, setGuardandoDivision] = useState(false);
  const [editandoDivId, setEditandoDivId] = useState(null);
  const [editandoDivNombre, setEditandoDivNombre] = useState('');
  const [mostrarQuickDivisionModal, setMostrarQuickDivisionModal] = useState(false);
  const [quickDivisionNombre, setQuickDivisionNombre] = useState('');

  const puedeEditarUbicaciones =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.ubicaciones?.puede_editar === true;

  const [form, setForm] = useState({
    nombre: '',
    id_division: ''
  });

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [resUbicaciones, resDivisiones] = await Promise.all([
        api.get('/ubicaciones'),
        api.get('/ubicaciones/divisiones')
      ]);

      setUbicaciones(resUbicaciones.data.datos || []);
      const divs = resDivisiones.data.datos || [];
      setDivisiones(divs);
      if (divs.length > 0) {
        setForm(f => (f.id_division ? f : { ...f, id_division: divs[0].id_division }));
      }
    } catch {
      toast.error('No se pudieron cargar las ubicaciones.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarDatos();
    });
    return () => {
      alive = false;
    };
  }, [cargarDatos]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalAbierto(false);
        setUbicacionAEliminar(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const abrirModalCrear = () => {
    setEditandoId(null);
    setForm({
      nombre: '',
      id_division: divisiones.length > 0 ? divisiones[0].id_division : ''
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (ub) => {
    setEditandoId(ub.id_ubicacion);
    setForm({
      nombre: ub.nombre,
      id_division: ub.id_division || (divisiones.length > 0 ? divisiones[0].id_division : '')
    });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setEditandoId(null);
    setMostrarQuickDivisionModal(false);
    setQuickDivisionNombre('');
    setForm({ nombre: '', id_division: '' });
  };

  const crearDivision = async (nombreRaw, { desdeModal = false } = {}) => {
    const limpio = String(nombreRaw || '').trim();
    if (!limpio) {
      toast.error('Escribe el nombre de la nueva área o división.');
      return;
    }
    setGuardandoDivision(true);
    try {
      const res = await api.post('/ubicaciones/divisiones', { nombre: limpio });
      const creada = res.data?.datos;
      toast.success(res.data?.mensaje || `Área "${limpio}" creada.`);
      if (desdeModal) {
        setQuickDivisionNombre('');
        setMostrarQuickDivisionModal(false);
        if (creada?.id_division) {
          setForm(prev => ({ ...prev, id_division: String(creada.id_division) }));
        }
      } else {
        setNuevaDivisionNombre('');
      }
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo crear el área / división.');
    } finally {
      setGuardandoDivision(false);
    }
  };

  const guardarEdicionDivision = async (idDivision) => {
    const limpio = String(editandoDivNombre || '').trim();
    if (!limpio) {
      toast.error('Escribe el nombre del área / división.');
      return;
    }
    setGuardandoDivision(true);
    try {
      const res = await api.put(`/ubicaciones/divisiones/${idDivision}`, { nombre: limpio });
      toast.success(res.data?.mensaje || 'Área actualizada.');
      setEditandoDivId(null);
      setEditandoDivNombre('');
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo actualizar el área / división.');
    } finally {
      setGuardandoDivision(false);
    }
  };

  const eliminarDivision = async (div) => {
    setGuardandoDivision(true);
    try {
      const res = await api.delete(`/ubicaciones/divisiones/${div.id_division}`);
      toast.success(res.data?.mensaje || 'Área eliminada.');
      await cargarDatos();
    } catch (error) {
      toast.error(error.response?.data?.mensaje || 'No se pudo eliminar el área / división.');
    } finally {
      setGuardandoDivision(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toast.error('Escribe el nombre de la sede o almacén.');
      return;
    }

    setGuardando(true);
    try {
      if (editandoId) {
        await api.put(`/ubicaciones/${editandoId}`, {
          nombre: form.nombre.trim(),
          id_division: Number(form.id_division)
        });
        toast.success('Sede / almacén actualizado con éxito.');
      } else {
        await api.post('/ubicaciones', {
          nombre: form.nombre.trim(),
          id_division: Number(form.id_division)
        });
        toast.success('Nueva sede / almacén creado con éxito.');
      }
      cerrarModal();
      cargarDatos();
    } catch (error) {
      toast.error('No se pudo guardar: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!ubicacionAEliminar || eliminando) return;
    setEliminando(true);
    try {
      await api.delete(`/ubicaciones/${ubicacionAEliminar.id_ubicacion}`);
      toast.success('Sede / almacén eliminado.');
      setUbicacionAEliminar(null);
      cargarDatos();
    } catch (error) {
      toast.error('No se pudo eliminar: ' + (error.response?.data?.mensaje || error.message));
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* SELECTOR DE SUB-PESTAÑAS EN UBICACIONES */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-xl w-full sm:w-max max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab('sedes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'sedes'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 size={15} />
          <span>Sedes y Encargados</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('almacenes')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'almacenes'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapPin size={15} />
          <span>Lista de Almacenes y Sucursales</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('vehiculos')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            subTab === 'vehiculos'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck size={15} />
          <span>Vehículos y Transporte</span>
        </button>
      </div>

      {subTab === 'sedes' ? (
        <Organizacion usuario={usuario} onPermisosActualizados={onPermisosActualizados} />
      ) : subTab === 'vehiculos' ? (
        <PanelVehiculosTransporte puedeEditar={puedeEditarUbicaciones} />
      ) : (
        <>
          {/* Cabecera */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
                <MapPin size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-blue-950">Almacenes y Sucursales</h2>
                <p className="text-sm text-slate-500">
                  Crea o modifica los locales, plantas y almacenes de la empresa
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <BotonExportarExcel
                onClick={() =>
                  exportarTablaExcel({
                    nombreArchivo: 'ubicaciones_almacenes',
                    nombreHoja: 'Almacenes y Sedes',
                    filas: ubicaciones,
                    columnas: [
                      { header: 'ID', key: 'id_ubicacion' },
                      { header: 'Nombre Sede / Almacén', key: 'nombre' },
                      { header: 'División / Tipo', value: (u) => u.nombre_division || u.tipo || '' },
                      { header: 'Dirección', value: (u) => u.direccion_completa || '' },
                      { header: 'Teléfono', value: (u) => u.telefono_contacto || '' }
                    ]
                  })
                }
                label="Exportar Excel (Almacenes)"
                cantidad={ubicaciones.length}
              />
              <button
                type="button"
                onClick={cargarDatos}
                disabled={cargando}
                className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                title="Actualizar"
              >
                <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
              </button>
              {puedeEditarUbicaciones && (
                <button
                  type="button"
                  onClick={abrirModalCrear}
                  className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
                >
                  <Plus size={18} />
                  <span>Nueva Sede o Almacén</span>
                </button>
              )}
            </div>
          </div>

          {/* Panel de Áreas / Divisiones de Sedes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-blue-950">Áreas / Divisiones ({divisiones.length})</h3>
                  <p className="text-xs text-slate-500">
                    Agrupá tus sedes y almacenes por área o zona (ej: Planta, Tiendas, Almacenes, Arequipa)
                  </p>
                </div>
              </div>

              {puedeEditarUbicaciones && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nueva área / división..."
                    value={nuevaDivisionNombre}
                    onChange={(e) => setNuevaDivisionNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        crearDivision(nuevaDivisionNombre);
                      }
                    }}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-48 sm:w-56"
                  />
                  <button
                    type="button"
                    disabled={guardandoDivision || !nuevaDivisionNombre.trim()}
                    onClick={() => crearDivision(nuevaDivisionNombre)}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    <Plus size={14} />
                    <span>Agregar Área</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {divisiones.map((div) => (
                <div
                  key={div.id_division}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                >
                  {editandoDivId === div.id_division ? (
                    <>
                      <input
                        type="text"
                        value={editandoDivNombre}
                        onChange={(e) => setEditandoDivNombre(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            guardarEdicionDivision(div.id_division);
                          } else if (e.key === 'Escape') {
                            setEditandoDivId(null);
                          }
                        }}
                        className="px-2 py-0.5 text-xs border border-indigo-300 rounded-lg bg-white focus:outline-hidden w-36"
                        autoFocus
                      />
                      <button
                        type="button"
                        disabled={guardandoDivision}
                        onClick={() => guardarEdicionDivision(div.id_division)}
                        className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg cursor-pointer"
                        title="Guardar nombre"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditandoDivId(null)}
                        className="p-1 text-slate-500 hover:bg-slate-200 rounded-lg cursor-pointer"
                        title="Cancelar"
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Building2 size={13} className="text-indigo-500 shrink-0" />
                      <span className="font-bold text-slate-800">{div.nombre}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-500 font-semibold">
                        {div.total_ubicaciones || 0} {Number(div.total_ubicaciones) === 1 ? 'sede' : 'sedes'}
                      </span>
                      {puedeEditarUbicaciones && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoDivId(div.id_division);
                              setEditandoDivNombre(div.nombre);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                            title="Renombrar área"
                          >
                            <Edit2 size={12} />
                          </button>
                          {Number(div.total_ubicaciones || 0) === 0 && divisiones.length > 1 && (
                            <button
                              type="button"
                              disabled={guardandoDivision}
                              onClick={() => eliminarDivision(div)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              title="Eliminar área sin sedes"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tabla de Ubicaciones */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {cargando ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                Cargando sedes y almacenes...
              </div>
            ) : ubicaciones.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600 font-medium">No hay sedes registradas todavía.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      <th className="py-4 px-6">Nombre de Sede / Almacén</th>
                      <th className="py-4 px-6">Área / División</th>
                      <th className="py-4 px-6 text-center">Empleados Asignados</th>
                      <th className="py-4 px-6 text-center">Productos con Stock</th>
                      {puedeEditarUbicaciones && <th className="py-4 px-6 text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {ubicaciones.map((ub) => (
                      <tr key={ub.id_ubicacion} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-6 font-semibold text-slate-900">
                          <div className="flex items-center space-x-2">
                            <MapPin size={16} className="text-indigo-500 shrink-0" />
                            <span>{ub.nombre}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                            <Building2 size={12} className="mr-1 text-slate-500" />
                            {ub.nombre_division || 'General'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="inline-flex items-center text-xs font-semibold text-slate-600">
                            <Users size={14} className="mr-1 text-slate-400" />
                            {ub.total_usuarios || 0}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="inline-flex items-center text-xs font-semibold text-slate-600">
                            <Package size={14} className="mr-1 text-slate-400" />
                            {ub.total_productos || 0}
                          </span>
                        </td>
                        {puedeEditarUbicaciones && (
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                type="button"
                                onClick={() => abrirModalEditar(ub)}
                                className="px-2.5 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center space-x-1 text-xs font-semibold cursor-pointer"
                                title="Cambiar nombre o área"
                              >
                                <Edit2 size={14} />
                                <span>Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setUbicacionAEliminar(ub)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar sede"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Crear / Editar */}
          {modalAbierto && puedeEditarUbicaciones && (
            <div
              onClick={() => !guardando && cerrarModal()}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-blue-950">
                    {editandoId ? 'Modificar Sede o Almacén' : 'Nueva Sede o Almacén'}
                  </h3>
                  <button
                    type="button"
                    onClick={cerrarModal}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Nombre de la Sede o Almacén *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Planta Principal, Almacén Norte..."
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Área / División
                      </label>
                      <button
                        type="button"
                        onClick={() => setMostrarQuickDivisionModal((v) => !v)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer inline-flex items-center gap-1"
                      >
                        <Plus size={13} />
                        <span>{mostrarQuickDivisionModal ? 'Cancelar nueva área' : 'Crear nueva área'}</span>
                      </button>
                    </div>

                    {mostrarQuickDivisionModal && (
                      <div className="mb-2.5 flex items-center gap-2 p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                        <input
                          type="text"
                          placeholder="Nombre (ej: Tiendas, Planta, Norte...)"
                          value={quickDivisionNombre}
                          onChange={(e) => setQuickDivisionNombre(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              crearDivision(quickDivisionNombre, { desdeModal: true });
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-white border border-indigo-300 rounded-lg focus:outline-hidden"
                        />
                        <button
                          type="button"
                          disabled={guardandoDivision || !quickDivisionNombre.trim()}
                          onClick={() => crearDivision(quickDivisionNombre, { desdeModal: true })}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          Crear
                        </button>
                      </div>
                    )}

                    <select
                      value={form.id_division}
                      onChange={(e) => setForm({ ...form, id_division: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors bg-white"
                    >
                      {divisiones.map((div) => (
                        <option key={div.id_division} value={div.id_division}>
                          {div.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={cerrarModal}
                      disabled={guardando}
                      className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={guardando}
                      className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {guardando ? 'Guardando...' : editandoId ? 'Guardar Cambios' : 'Crear Sede'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Confirmar Eliminación */}
          {ubicacionAEliminar && puedeEditarUbicaciones && (
            <div
              onClick={() => !eliminando && setUbicacionAEliminar(null)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-blue-950">¿Eliminar "{ubicacionAEliminar.nombre}"?</h3>
                    <p className="text-xs text-slate-500">Acción permanente</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  Solo se puede eliminar si no tiene empleados asignados, pedidos registrados ni mercadería guardada en su inventario.
                </p>
                <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={() => setUbicacionAEliminar(null)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={eliminando}
                    onClick={confirmarEliminar}
                    className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
