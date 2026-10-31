import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  Building2, Plus, Search, Edit2, Phone, PhoneOff, User,
  Briefcase, MapPin, Shield, RefreshCw, X
} from 'lucide-react';

export default function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [puedeVerTodosCelulares, setPuedeVerTodosCelulares] = useState(false);

  // Modal crear / editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoCliente, setEditandoCliente] = useState(null);
  const [guardando, setGuardando] = useState(false);

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
    tipo_documento: '6'
  });

  useEffect(() => {
    cargarClientes();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalAbierto(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const cargarClientes = async () => {
    setCargando(true);
    try {
      const res = await api.get('/clientes');
      setClientes(res.data.datos || []);
      setPuedeVerTodosCelulares(
        Boolean(res.data.es_admin || res.data.puede_ver_celulares || usuario?.puede_ver_celulares || usuario?.rol === 'Admin Central')
      );
    } catch (err) {
      toast.error('No se pudo cargar la lista de clientes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargando(false);
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
      tipo_documento: '6'
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
      tipo_documento: cliente.tipo_documento || '6'
    });
    setModalAbierto(true);
  };

  const guardarCliente = async (e) => {
    e.preventDefault();
    if (!form.numero_documento.trim() || !form.razon_social_o_nombre.trim()) {
      return toast.error('El número de RUC/DNI y el nombre del cliente son obligatorios.');
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

  const clientesFiltrados = clientes.filter(c => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.numero_documento || '').toLowerCase().includes(q) ||
      (c.razon_social_o_nombre || '').toLowerCase().includes(q) ||
      (c.nombre_comercial || '').toLowerCase().includes(q) ||
      (c.contacto || '').toLowerCase().includes(q) ||
      (c.cargo || '').toLowerCase().includes(q)
    );
  });

  const cantidadCelularesVisibles = clientes.filter(c => c.celular_visible && c.celular).length;

  return (
    <div className="space-y-6">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Clientes</h1>
            <p className="text-sm text-slate-500">
              Empresas, RUC, nombres comerciales y personas de contacto
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
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

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar cliente por RUC, nombre o persona de contacto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500">
          Mostrando {clientesFiltrados.length} de {clientes.length} clientes
        </div>
      </div>

      {/* TABLA DE CLIENTES */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-slate-500 font-medium">Cargando clientes...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No se encontraron clientes</p>
            <p className="text-slate-400 text-sm mt-1">
              {puedeEditarClientes
                ? 'Haz clic en "Nuevo Cliente" arriba a la derecha para agregar el primero.'
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
                    <option value="6">RUC (Empresa / Negocio)</option>
                    <option value="1">DNI (Persona)</option>
                    <option value="4">Carnet de Extranjería</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Número de RUC o DNI *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 20123456789"
                    value={form.numero_documento}
                    onChange={(e) => setForm({ ...form, numero_documento: e.target.value })}
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

    </div>
  );
}
