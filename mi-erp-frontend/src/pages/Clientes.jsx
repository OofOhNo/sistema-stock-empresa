import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  Building2, Plus, Search, Edit2, Phone, PhoneOff, User,
  Briefcase, MapPin, Shield, RefreshCw, X, Folder, FolderPlus,
  FolderOpen, ArrowLeft, Trash2, Users
} from 'lucide-react';

const COLORES_CARPETA = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200 hover:border-indigo-400', icon: 'text-indigo-600 bg-indigo-100', badge: 'bg-indigo-100 text-indigo-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200 hover:border-emerald-400', icon: 'text-emerald-600 bg-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200 hover:border-amber-400', icon: 'text-amber-600 bg-amber-100', badge: 'bg-amber-100 text-amber-700' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200 hover:border-rose-400', icon: 'text-rose-600 bg-rose-100', badge: 'bg-rose-100 text-rose-700' },
  sky: { bg: 'bg-sky-50', border: 'border-sky-200 hover:border-sky-400', icon: 'text-sky-600 bg-sky-100', badge: 'bg-sky-100 text-sky-700' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200 hover:border-violet-400', icon: 'text-violet-600 bg-violet-100', badge: 'bg-violet-100 text-violet-700' },
};

export default function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [carpetaActiva, setCarpetaActiva] = useState(null); // null = vista carpetas, 'all' = todos, 'none' = sin carpeta, number = id_carpeta
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [puedeVerTodosCelulares, setPuedeVerTodosCelulares] = useState(false);

  // Modal crear / editar cliente
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Modal crear / editar carpeta
  const [modalCarpetaAbierto, setModalCarpetaAbierto] = useState(false);
  const [editandoCarpeta, setEditandoCarpeta] = useState(null);
  const [guardandoCarpeta, setGuardandoCarpeta] = useState(false);
  const [formCarpeta, setFormCarpeta] = useState({ nombre: '', color: 'indigo', descripcion: '' });

  const puedeEditarClientes =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.clientes?.puede_editar === true;

  const [form, setForm] = useState({
    numero_documento: '',
    razon_social_o_nombre: '',
    nombre_comercial: '',
    contacto: '',
    cargo: '',
    celular: '',
    direccion: '',
    email: '',
    tipo_documento: '6',
    id_carpeta: ''
  });

  useEffect(() => {
    cargarClientes();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalAbierto(false);
        setModalCarpetaAbierto(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const cargarClientes = async () => {
    setCargando(true);
    try {
      const [resClientes, resCarpetas] = await Promise.all([
        api.get('/clientes'),
        api.get('/clientes/carpetas').catch(() => ({ data: { carpetas: [] } }))
      ]);
      setClientes(resClientes.data.datos || []);
      setCarpetas(resCarpetas.data?.carpetas || []);
      setPuedeVerTodosCelulares(
        Boolean(resClientes.data.es_admin || resClientes.data.puede_ver_celulares || usuario?.puede_ver_celulares || usuario?.rol === 'Admin Central')
      );
    } catch (err) {
      toast.error('No se pudo cargar la lista de clientes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargando(false);
    }
  };

  const abrirCrearCarpeta = () => {
    setEditandoCarpeta(null);
    setFormCarpeta({ nombre: '', color: 'indigo', descripcion: '' });
    setModalCarpetaAbierto(true);
  };

  const abrirEditarCarpeta = (e, carpeta) => {
    e.stopPropagation();
    setEditandoCarpeta(carpeta);
    setFormCarpeta({
      nombre: carpeta.nombre || '',
      color: carpeta.color || 'indigo',
      descripcion: carpeta.descripcion || ''
    });
    setModalCarpetaAbierto(true);
  };

  const guardarCarpeta = async (e) => {
    e.preventDefault();
    if (!formCarpeta.nombre.trim()) return toast.error('Escribe el nombre de la carpeta.');
    setGuardandoCarpeta(true);
    try {
      if (editandoCarpeta) {
        await api.put(`/clientes/carpetas/${editandoCarpeta.id_carpeta}`, formCarpeta);
        toast.success('Carpeta actualizada.');
      } else {
        await api.post('/clientes/carpetas', formCarpeta);
        toast.success('Carpeta creada.');
      }
      setModalCarpetaAbierto(false);
      cargarClientes();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la carpeta.');
    } finally {
      setGuardandoCarpeta(false);
    }
  };

  const eliminarCarpeta = async (e, carpeta) => {
    e.stopPropagation();
    if (!window.confirm(`¿Eliminar la carpeta "${carpeta.nombre}"? Sus clientes no se borrarán, pasarán a "Sin carpeta".`)) return;
    try {
      await api.delete(`/clientes/carpetas/${carpeta.id_carpeta}`);
      toast.success('Carpeta eliminada.');
      if (carpetaActiva === carpeta.id_carpeta) setCarpetaActiva(null);
      cargarClientes();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo eliminar la carpeta.');
    }
  };

  const moverClienteDeCarpeta = async (idCliente, idCarpeta) => {
    try {
      await api.patch(`/clientes/${idCliente}/carpeta`, { id_carpeta: idCarpeta || null });
      toast.success('Cliente movido de carpeta.');
      cargarClientes();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo mover el cliente.');
    }
  };

  const abrirCrear = () => {
    setEditandoCliente(null);
    setForm({
      numero_documento: '',
      razon_social_o_nombre: '',
      nombre_comercial: '',
      contacto: '',
      cargo: '',
      celular: '',
      direccion: '',
      email: '',
      tipo_documento: '6',
      id_carpeta: typeof carpetaActiva === 'number' ? String(carpetaActiva) : ''
    });
    setModalAbierto(true);
  };

  const abrirEditar = (cliente) => {
    setEditandoCliente(cliente);
    setForm({
      numero_documento: cliente.numero_documento || '',
      razon_social_o_nombre: cliente.razon_social_o_nombre || '',
      nombre_comercial: cliente.nombre_comercial || '',
      contacto: cliente.contacto || '',
      cargo: cliente.cargo || '',
      celular: cliente.celular_visible ? (cliente.celular || '') : '',
      direccion: cliente.direccion || '',
      email: cliente.email || '',
      tipo_documento: cliente.tipo_documento || '6',
      id_carpeta: cliente.id_carpeta ? String(cliente.id_carpeta) : ''
    });
    setModalAbierto(true);
  };

  const guardarCliente = async (e) => {
    e.preventDefault();
    const docLimpio = form.numero_documento.trim();
    if (!docLimpio || !form.razon_social_o_nombre.trim()) {
      return toast.error('El número de RUC/DNI y el nombre del cliente son obligatorios.');
    }

    if (form.tipo_documento === '6' && !/^(10|15|16|17|20)\d{9}$/.test(docLimpio)) {
      return toast.error('El RUC debe tener exactamente 11 números y empezar con 10 o 20.');
    }
    if (form.tipo_documento === '1' && !/^\d{8}$/.test(docLimpio)) {
      return toast.error('El DNI debe tener exactamente 8 números.');
    }

    setGuardando(true);
    try {
      const payload = { ...form };
      // Si está editando un cliente cuyo teléfono está oculto para este usuario, no enviar celular vacío para no borrarlo
      if (editandoCliente && !editandoCliente.celular_visible && editandoCliente.celular && !payload.celular.trim()) {
        delete payload.celular;
      }

      if (editandoCliente) {
        await api.put(`/clientes/${editandoCliente.id_cliente}`, payload);
        toast.success('Datos del cliente actualizados.');
      } else {
        await api.post('/clientes', payload);
        toast.success('Cliente guardado con éxito.');
      }
      setModalAbierto(false);
      cargarClientes();
    } catch (err) {
      toast.error('No se pudo guardar: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setGuardando(false);
    }
  };

  const q = busqueda.toLowerCase().trim();
  const mostrarVistaCarpetas = carpetaActiva === null && !q;

  const clientesFiltrados = clientes.filter(c => {
    if (!q) {
      if (carpetaActiva === 'none') {
        if (c.id_carpeta) return false;
      } else if (typeof carpetaActiva === 'number') {
        if (Number(c.id_carpeta) !== carpetaActiva) return false;
      }
    } else if (carpetaActiva === 'none' && c.id_carpeta) {
      return false;
    } else if (typeof carpetaActiva === 'number' && Number(c.id_carpeta) !== carpetaActiva) {
      return false;
    }

    if (!q) return true;
    return (
      (c.numero_documento || '').toLowerCase().includes(q) ||
      (c.razon_social_o_nombre || '').toLowerCase().includes(q) ||
      (c.nombre_comercial || '').toLowerCase().includes(q) ||
      (c.contacto || '').toLowerCase().includes(q) ||
      (c.cargo || '').toLowerCase().includes(q) ||
      (c.nombre_carpeta || '').toLowerCase().includes(q)
    );
  });

  const clientesSinCarpeta = clientes.filter(c => !c.id_carpeta).length;
  const carpetaSeleccionadaObj = typeof carpetaActiva === 'number'
    ? carpetas.find(f => f.id_carpeta === carpetaActiva)
    : null;
  const cantidadCelularesVisibles = clientes.filter(c => c.celular_visible && c.celular).length;

  return (
    <div className="space-y-6">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            {mostrarVistaCarpetas ? <FolderOpen size={24} /> : <Building2 size={24} />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">
              {carpetaActiva === 'none'
                ? 'Clientes — Sin carpeta'
                : carpetaActiva === 'all'
                ? 'Todos los Clientes'
                : carpetaSeleccionadaObj
                ? `Carpeta: ${carpetaSeleccionadaObj.nombre}`
                : 'Clientes'}
            </h1>
            <p className="text-sm text-slate-500">
              Empresas, RUC, nombres comerciales y personas de contacto organizados en carpetas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={cargarClientes}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Actualizar lista"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          {puedeEditarClientes && (
            <button
              type="button"
              onClick={abrirCrearCarpeta}
              className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-xs transition-colors cursor-pointer"
            >
              <FolderPlus size={18} />
              <span>Nueva Carpeta</span>
            </button>
          )}
          {puedeEditarClientes && (
            <button
              type="button"
              onClick={abrirCrear}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm transition-colors cursor-pointer"
            >
              <Plus size={18} />
              <span>Nuevo Cliente</span>
            </button>
          )}
        </div>
      </div>

      {/* AVISO CLARO DE VISIBILIDAD DE TELÉFONOS */}
      <div
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-medium ${
          puedeVerTodosCelulares
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : cantidadCelularesVisibles > 0
            ? 'bg-blue-50 border-blue-200 text-blue-900'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}
      >
        <div className="flex items-center space-x-2">
          <Shield size={16} className="shrink-0" />
          <span>
            {puedeVerTodosCelulares
              ? 'Puedes ver los números de celular de todos los clientes.'
              : cantidadCelularesVisibles > 0
              ? `Puedes ver los números de celular de los clientes asignados a tu cuenta (${cantidadCelularesVisibles}).`
              : 'Por privacidad, los números de celular solo se muestran en los clientes autorizados para tu cuenta.'}
          </span>
        </div>
        <span className="font-bold uppercase tracking-wider text-[10px] px-2.5 py-0.5 rounded-full bg-white border self-start sm:self-auto shrink-0">
          {puedeVerTodosCelulares
            ? 'Acceso Total'
            : cantidadCelularesVisibles > 0
            ? 'Clientes Asignados'
            : 'Teléfonos Protegidos'}
        </span>
      </div>

      {/* BARRA DE BÚSQUEDA + BOTÓN VOLVER */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          {carpetaActiva !== null && (
            <button
              type="button"
              onClick={() => setCarpetaActiva(null)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft size={14} />
              <span>Carpetas</span>
            </button>
          )}
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente por RUC, nombre, contacto o carpeta..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
            />
          </div>
        </div>
        <div className="text-xs font-semibold text-slate-500">
          {mostrarVistaCarpetas
            ? `${carpetas.length} carpetas • ${clientes.length} clientes en total`
            : `Mostrando ${clientesFiltrados.length} de ${clientes.length} clientes`}
        </div>
      </div>

      {/* VISTA DE CARPETAS (POR DEFECTO) O TABLA DE CLIENTES */}
      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-500 font-medium">
          Cargando clientes...
        </div>
      ) : mostrarVistaCarpetas ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {carpetas.map((carpeta) => {
            const estilo = COLORES_CARPETA[carpeta.color] || COLORES_CARPETA.indigo;
            const cant = clientes.filter(c => Number(c.id_carpeta) === carpeta.id_carpeta).length;
            return (
              <div
                key={carpeta.id_carpeta}
                onClick={() => setCarpetaActiva(carpeta.id_carpeta)}
                className={`group p-5 rounded-2xl border ${estilo.bg} ${estilo.border} transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between min-h-[140px]`}
              >
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl ${estilo.icon}`}>
                    <Folder size={24} />
                  </div>
                  {puedeEditarClientes && (
                    <div className="flex items-center space-x-1 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => abrirEditarCarpeta(e, carpeta)}
                        className="p-2 sm:p-1.5 bg-white/90 hover:bg-white text-slate-600 hover:text-indigo-600 rounded-lg cursor-pointer shadow-xs"
                        title="Renombrar carpeta"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => eliminarCarpeta(e, carpeta)}
                        className="p-2 sm:p-1.5 bg-white/90 hover:bg-white text-slate-600 hover:text-rose-600 rounded-lg cursor-pointer shadow-xs"
                        title="Eliminar carpeta"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <h3 className="font-bold text-slate-900 text-base truncate">{carpeta.nombre}</h3>
                  {carpeta.descripcion && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{carpeta.descripcion}</p>
                  )}
                  <div className="mt-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${estilo.badge}`}>
                      {cant} {cant === 1 ? 'cliente' : 'clientes'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Carpeta: Sin carpeta */}
          <div
            onClick={() => setCarpetaActiva('none')}
            className="p-5 rounded-2xl border border-slate-200 hover:border-slate-400 bg-white transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between min-h-[140px]"
          >
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-xl bg-slate-100 text-slate-600">
                <Folder size={24} />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="font-bold text-slate-800 text-base">Sin carpeta</h3>
              <p className="text-xs text-slate-500 mt-0.5">Clientes aún sin clasificar</p>
              <div className="mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  {clientesSinCarpeta} {clientesSinCarpeta === 1 ? 'cliente' : 'clientes'}
                </span>
              </div>
            </div>
          </div>

          {/* Carpeta: Ver todos */}
          <div
            onClick={() => setCarpetaActiva('all')}
            className="p-5 rounded-2xl border border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/40 transition-all cursor-pointer shadow-xs hover:shadow-md flex flex-col justify-between min-h-[140px]"
          >
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
                <Users size={24} />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="font-bold text-indigo-950 text-base">Todos los clientes</h3>
              <p className="text-xs text-indigo-700/80 mt-0.5">Ver listado completo en tabla</p>
              <div className="mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  {clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {clientesFiltrados.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 size={48} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-600 font-medium">No se encontraron clientes aquí</p>
              <p className="text-slate-400 text-sm mt-1">
                {puedeEditarClientes
                  ? 'Haz clic en "Nuevo Cliente" arriba a la derecha o mueve clientes a esta carpeta.'
                  : 'No hay clientes que coincidan con tu búsqueda.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-6">RUC / DNI</th>
                  <th className="py-4 px-6">Razón Social</th>
                  <th className="py-4 px-6">Nombre Comercial</th>
                  <th className="py-4 px-6">Carpeta</th>
                  <th className="py-4 px-6">Persona de Contacto</th>
                  <th className="py-4 px-6">Cargo</th>
                  <th className="py-4 px-6">Celular</th>
                  {puedeEditarClientes && <th className="py-4 px-6 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id_cliente} className="hover:bg-slate-50 transition-colors">

                    <td className="py-4 px-6">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-xs">
                        {cliente.numero_documento}
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">{cliente.razon_social_o_nombre}</div>
                      {cliente.direccion && (
                        <div className="flex items-center space-x-1 text-xs text-slate-400 mt-0.5">
                          <MapPin size={12} />
                          <span className="truncate max-w-xs">{cliente.direccion}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-6 text-slate-700">
                      {cliente.nombre_comercial ? (
                        <span className="font-medium text-indigo-700 bg-indigo-50/60 px-2.5 py-1 rounded-lg text-xs">
                          {cliente.nombre_comercial}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">-</span>
                      )}
                    </td>

                    <td className="py-4 px-6">
                      {puedeEditarClientes ? (
                        <select
                          value={cliente.id_carpeta || ''}
                          onChange={(e) => moverClienteDeCarpeta(cliente.id_cliente, e.target.value)}
                          className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer max-w-[160px]"
                          title="Mover cliente de carpeta"
                        >
                          <option value="">Sin carpeta</option>
                          {carpetas.map((carp) => (
                            <option key={carp.id_carpeta} value={carp.id_carpeta}>
                              {carp.nombre}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Folder size={12} className="text-slate-400" />
                          <span>{cliente.nombre_carpeta || 'Sin carpeta'}</span>
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-6 text-slate-700">
                      {cliente.contacto ? (
                        <div className="flex items-center space-x-1.5 font-medium">
                          <User size={14} className="text-slate-400" />
                          <span>{cliente.contacto}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">-</span>
                      )}
                    </td>

                    <td className="py-4 px-6 text-slate-600">
                      {cliente.cargo ? (
                        <div className="flex items-center space-x-1.5 text-xs">
                          <Briefcase size={12} className="text-slate-400" />
                          <span>{cliente.cargo}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">-</span>
                      )}
                    </td>

                    <td className="py-4 px-6">
                      {cliente.celular_visible && cliente.celular ? (
                        <a
                          href={`tel:${cliente.celular.replace(/\s+/g, '')}`}
                          className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs font-mono font-bold"
                          title="Llamar al contacto"
                        >
                          <Phone size={12} />
                          <span>{cliente.celular}</span>
                        </a>
                      ) : cliente.celular ? (
                        <span
                          className="inline-flex items-center space-x-1 text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-medium"
                          title="Teléfono privado — solicita acceso al administrador si necesitas verlo"
                        >
                          <PhoneOff size={12} />
                          <span>Privado</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">-</span>
                      )}
                    </td>

                    {puedeEditarClientes && (
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => abrirEditar(cliente)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center space-x-1 text-xs font-semibold cursor-pointer"
                          title="Modificar datos del cliente"
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                      </td>
                    )}

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* MODAL CREAR / EDITAR CLIENTE */}
      {modalAbierto && puedeEditarClientes && (
        <div
          onClick={() => !guardando && setModalAbierto(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Building2 className="text-indigo-600" size={22} />
                <h3 className="text-lg font-bold text-blue-950">
                  {editandoCliente ? 'Modificar Cliente' : 'Agregar Nuevo Cliente'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={guardarCliente} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tipo de Documento
                  </label>
                  <select
                    value={form.tipo_documento}
                    onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="6">RUC - Empresa o Negocio (11 dígitos)</option>
                    <option value="1">DNI - Persona Natural (8 dígitos)</option>
                    <option value="4">Carnet de Extranjería</option>
                    <option value="7">Pasaporte</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Número de {form.tipo_documento === '6' ? 'RUC (11 dígitos)' : form.tipo_documento === '1' ? 'DNI (8 dígitos)' : 'Documento'} *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={form.tipo_documento === '6' ? 'Ej: 20123456789' : 'Ej: 45678912'}
                    value={form.numero_documento}
                    onChange={(e) => {
                      const val = e.target.value;
                      const soloDig = val.trim();
                      let nuevoTipo = form.tipo_documento;
                      if (/^\d{8}$/.test(soloDig) && form.tipo_documento === '6') {
                        nuevoTipo = '1';
                      } else if (/^(10|15|16|17|20)\d{9}$/.test(soloDig) && form.tipo_documento === '1') {
                        nuevoTipo = '6';
                      }
                      setForm({ ...form, numero_documento: val, tipo_documento: nuevoTipo });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Razón Social o Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Comercial Los Andes S.A.C."
                  value={form.razon_social_o_nombre}
                  onChange={(e) => setForm({ ...form, razon_social_o_nombre: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre Comercial / Conocido como (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Supermercados Los Andes"
                  value={form.nombre_comercial}
                  onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Persona con la que hablan (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Juan Pérez"
                    value={form.contacto}
                    onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Cargo de esa persona (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Encargado de Compras"
                    value={form.cargo}
                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Celular de Contacto (Opcional)
                </label>
                {editandoCliente && !editandoCliente.celular_visible && editandoCliente.celular ? (
                  <div className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center space-x-2">
                    <PhoneOff size={14} className="text-slate-400" />
                    <span>Este cliente ya tiene un celular guardado y está protegido por privacidad.</span>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Ej: 987 654 321"
                      value={form.celular}
                      onChange={(e) => setForm({ ...form, celular: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      🔒 Solo podrán ver este número las personas autorizadas en Personal y Roles.
                    </p>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Carpeta del Cliente (Opcional)
                </label>
                <select
                  value={form.id_carpeta ?? ''}
                  onChange={(e) => setForm({ ...form, id_carpeta: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="">📁 Sin carpeta</option>
                  {carpetas.map((carp) => (
                    <option key={carp.id_carpeta} value={carp.id_carpeta}>
                      📁 {carp.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Dirección (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Principal 123"
                    value={form.direccion}
                    onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Correo Electrónico (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="ejemplo@correo.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  disabled={guardando}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-6 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {guardando ? 'Guardando...' : (editandoCliente ? 'Guardar Cambios' : 'Guardar Cliente')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR CARPETA */}
      {modalCarpetaAbierto && puedeEditarClientes && (
        <div
          onClick={() => !guardandoCarpeta && setModalCarpetaAbierto(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <FolderPlus className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-blue-950">
                  {editandoCarpeta ? 'Editar Carpeta' : 'Nueva Carpeta de Clientes'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalCarpetaAbierto(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={guardarCarpeta} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre de la Carpeta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Arequipa, Restaurantes, Mayoristas..."
                  value={formCarpeta.nombre}
                  onChange={(e) => setFormCarpeta({ ...formCarpeta, nombre: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Color de la Carpeta
                </label>
                <div className="flex items-center space-x-2">
                  {[
                    { id: 'indigo', cls: 'bg-indigo-500' },
                    { id: 'emerald', cls: 'bg-emerald-500' },
                    { id: 'amber', cls: 'bg-amber-500' },
                    { id: 'rose', cls: 'bg-rose-500' },
                    { id: 'sky', cls: 'bg-sky-500' },
                    { id: 'violet', cls: 'bg-violet-500' },
                  ].map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setFormCarpeta({ ...formCarpeta, color: col.id })}
                      className={`w-7 h-7 rounded-full ${col.cls} cursor-pointer transition-transform ${formCarpeta.color === col.id ? 'ring-2 ring-offset-2 ring-slate-800 scale-110' : 'opacity-70 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Descripción (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Clientes corporativos zona sur"
                  value={formCarpeta.descripcion}
                  onChange={(e) => setFormCarpeta({ ...formCarpeta, descripcion: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalCarpetaAbierto(false)}
                  disabled={guardandoCarpeta}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCarpeta}
                  className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {guardandoCarpeta ? 'Guardando...' : (editandoCarpeta ? 'Guardar Carpeta' : 'Crear Carpeta')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
