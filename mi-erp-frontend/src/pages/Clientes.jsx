import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { 
  Building2, Plus, Search, Edit2, Phone, PhoneOff, User, 
  Briefcase, Mail, MapPin, Shield, CheckCircle, RefreshCw, X 
} from 'lucide-react';

export default function Clientes({ usuario }) {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [puedeVerCelulares, setPuedeVerCelulares] = useState(false);

  // Modal crear / editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [guardando, setGuardando] = useState(false);

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

  const cargarClientes = async () => {
    setCargando(true);
    try {
      const res = await api.get('/clientes');
      setClientes(res.data.datos || []);
      setPuedeVerCelulares(res.data.puede_ver_celulares ?? (usuario?.puede_ver_celulares || usuario?.rol === 'Admin Central'));
    } catch (err) {
      toast.error('Error al cargar la cartera de clientes: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setCargando(false);
    }
  };

  const abrirCrear = () => {
    setEditandoId(null);
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
    setEditandoId(cliente.id_cliente);
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
    if (!form.numero_documento || !form.razon_social_o_nombre) {
      return toast.error('El RUC y la Razón Social son campos requeridos.');
    }

    setGuardando(true);
    try {
      if (editandoId) {
        await api.put(`/clientes/${editandoId}`, form);
        toast.success('Cliente actualizado correctamente.');
      } else {
        await api.post('/clientes', form);
        toast.success('Cliente registrado exitosamente.');
      }
      setModalAbierto(false);
      cargarClientes();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
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

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Cartera de Clientes</h1>
            <p className="text-sm text-slate-500">
              Gestión de RUC, razón social, nombres comerciales y contactos comerciales
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={cargarClientes}
            disabled={cargando}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title="Recargar clientes"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={abrirCrear}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium text-sm shadow-sm transition-colors"
          >
            <Plus size={18} />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* AVISO DE PRIVACIDAD DE CELULARES */}
      <div className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
        puedeVerCelulares 
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
          : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}>
        <div className="flex items-center space-x-2">
          <Shield size={16} />
          <span>
            {puedeVerCelulares 
              ? 'Tu cuenta tiene permisos activos para visualizar y gestionar números de celular de clientes.' 
              : 'Privacidad de contactos activa: los números de celular están enmascarados para tu perfil.'}
          </span>
        </div>
        <span className="font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-white border">
          {puedeVerCelulares ? 'Acceso Telefónico Total' : 'Restringido'}
        </span>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por RUC, razón social, nombre comercial o contacto..."
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
            <p className="text-slate-400 text-sm mt-1">Registra un nuevo cliente para comenzar a facturar y despachar pedidos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="py-4 px-6">RUC / Documento</th>
                  <th className="py-4 px-6">Razón Social</th>
                  <th className="py-4 px-6">Nombre Comercial</th>
                  <th className="py-4 px-6">Contacto (Persona)</th>
                  <th className="py-4 px-6">Cargo</th>
                  <th className="py-4 px-6">Celular</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id_cliente} className="hover:bg-slate-50 transition-colors">
                    
                    {/* RUC */}
                    <td className="py-4 px-6">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-md text-xs">
                        {cliente.numero_documento}
                      </span>
                    </td>

                    {/* Razón Social */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">{cliente.razon_social_o_nombre}</div>
                      {cliente.direccion && (
                        <div className="flex items-center space-x-1 text-xs text-slate-400 mt-0.5">
                          <MapPin size={12} />
                          <span className="truncate max-w-xs">{cliente.direccion}</span>
                        </div>
                      )}
                    </td>

                    {/* Nombre Comercial */}
                    <td className="py-4 px-6 text-slate-700">
                      {cliente.nombre_comercial ? (
                        <span className="font-medium text-indigo-700 bg-indigo-50/60 px-2.5 py-1 rounded-lg text-xs">
                          {cliente.nombre_comercial}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">-</span>
                      )}
                    </td>

                    {/* Contacto */}
                    <td className="py-4 px-6 text-slate-700">
                      {cliente.contacto ? (
                        <div className="flex items-center space-x-1.5 font-medium">
                          <User size={14} className="text-slate-400" />
                          <span>{cliente.contacto}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">No especificado</span>
                      )}
                    </td>

                    {/* Cargo */}
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

                    {/* Celular con permiso granular */}
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
                          className="inline-flex items-center space-x-1 text-slate-400 bg-slate-100 px-2 py-0.5 rounded text-xs font-mono"
                          title="No tienes permiso para ver celulares de clientes"
                        >
                          <PhoneOff size={12} />
                          <span>{cliente.celular}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">-</span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => abrirEditar(cliente)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex items-center space-x-1 text-xs font-semibold"
                        title="Editar datos del cliente"
                      >
                        <Edit2 size={14} />
                        <span>Editar</span>
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREAR / EDITAR CLIENTE */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Building2 className="text-indigo-600" size={22} />
                <h3 className="text-lg font-bold text-slate-900">
                  {editandoId ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
                </h3>
              </div>
              <button onClick={() => setModalAbierto(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={guardarCliente} className="p-6 space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    RUC / Número Documento *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="20123456789"
                    value={form.numero_documento}
                    onChange={(e) => setForm({ ...form, numero_documento: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tipo de Documento
                  </label>
                  <select
                    value={form.tipo_documento}
                    onChange={(e) => setForm({ ...form, tipo_documento: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="6">RUC (Registro Único de Contribuyente)</option>
                    <option value="1">DNI (Documento Nacional de Identidad)</option>
                    <option value="4">Carnet de Extranjería</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Razón Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Inversiones y Servicios Globales S.A.C."
                  value={form.razon_social_o_nombre}
                  onChange={(e) => setForm({ ...form, razon_social_o_nombre: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre Comercial (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Tiendas Metro Express / SuperGlobal"
                  value={form.nombre_comercial}
                  onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Contacto (Persona con la que hablan)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Lic. Mariana Ramos"
                    value={form.contacto}
                    onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Cargo del Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Jefe de Compras / Administradora"
                    value={form.cargo}
                    onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Celular del Contacto (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: +51 987 654 321"
                  value={form.celular}
                  onChange={(e) => setForm({ ...form, celular: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  🔒 El número de celular solo será visible por usuarios autorizados con permiso granular.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Dirección (Fiscal / Entrega)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Av. Principal 1234, Lima"
                    value={form.direccion}
                    onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    placeholder="contacto@empresa.com"
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
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-6 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : (editandoId ? 'Guardar Cambios' : 'Registrar Cliente')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

