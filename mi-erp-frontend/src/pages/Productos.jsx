import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Package, Edit, Trash, Plus, Ruler, Search, AlertTriangle, X, Check } from 'lucide-react';

export default function Productos({ usuario }) {
  const [productos, setProductos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [puedeEditar, setPuedeEditar] = useState(
    usuario?.rol === 'Admin Central' || usuario?.permisos?.productos?.puede_editar === true
  );

  const [form, setForm] = useState({
    sku: '',
    nombre: '',
    descripcion: '',
    id_categoria: '',
    precio_venta: '',
    precio_costo: '',
    stock_minimo: '',
    id_unidad: ''
  });
  const [editando, setEditando] = useState(null);
  const [guardandoProd, setGuardandoProd] = useState(false);

  // Modal para crear nuevo formato de unidad de medida
  const [modalUnidad, setModalUnidad] = useState(false);
  const [formUnidad, setFormUnidad] = useState({
    codigo: '',
    nombre: '',
    simbolo: ''
  });
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  // Modales limpios de confirmación (en lugar de toasts infinitos con lenguaje técnico)
  const [productoADesactivar, setProductoADesactivar] = useState(null);
  const [unidadAEliminar, setUnidadAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    setPuedeEditar(
      usuario?.rol === 'Admin Central' || usuario?.permisos?.productos?.puede_editar === true
    );
  }, [usuario?.rol, usuario?.permisos?.productos?.puede_editar]);

  useEffect(() => {
    cargarDatos();
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalUnidad(false);
        setProductoADesactivar(null);
        setUnidadAEliminar(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resProd, resUni] = await Promise.all([
        api.get('/productos'),
        api.get('/productos/unidades')
      ]);
      const listaProds = Array.isArray(resProd.data)
        ? resProd.data
        : (resProd.data?.datos || resProd.data?.productos || []);
      setProductos(listaProds);

      if (resProd.data?.puede_editar !== undefined) {
        setPuedeEditar(Boolean(resProd.data.puede_editar));
      }

      const listaUnidades = resUni.data?.unidades || [];
      setUnidades(listaUnidades);
      if (listaUnidades.length > 0 && !form.id_unidad) {
        setForm(f => ({ ...f, id_unidad: listaUnidades[0].id_unidad }));
      }
    } catch (err) {
      toast.error('No se pudo cargar la lista de productos.');
    } finally {
      setCargando(false);
    }
  };

  const cargarProductos = async () => {
    try {
      const res = await api.get('/productos');
      const listaProds = Array.isArray(res.data)
        ? res.data
        : (res.data?.datos || res.data?.productos || []);
      setProductos(listaProds);
      if (res.data?.puede_editar !== undefined) {
        setPuedeEditar(Boolean(res.data.puede_editar));
      }
    } catch (err) {
      toast.error('No se pudo actualizar la lista de productos.');
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.nombre.trim()) {
      toast.error('Por favor escribe el código y el nombre del producto.');
      return;
    }

    setGuardandoProd(true);
    try {
      const unidadSeleccionada = unidades.find(u => String(u.id_unidad) === String(form.id_unidad));

      const data = {
        ...form,
        sku: form.sku.trim().toUpperCase(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion ? form.descripcion.trim() : '',
        id_categoria: form.id_categoria ? parseInt(form.id_categoria, 10) : null,
        precio_venta: form.precio_venta !== '' ? parseFloat(form.precio_venta) : 0,
        precio_costo: form.precio_costo !== '' ? parseFloat(form.precio_costo) : 0,
        stock_minimo: form.stock_minimo !== '' ? parseInt(form.stock_minimo, 10) : 5,
        id_unidad: form.id_unidad ? parseInt(form.id_unidad, 10) : null,
        unidad_medida: unidadSeleccionada ? unidadSeleccionada.nombre : 'Unidad'
      };

      if (editando) {
        await api.put(`/productos/${editando}`, data);
        toast.success('Producto actualizado con éxito.');
      } else {
        await api.post('/productos', data);
        toast.success('Producto guardado con éxito.');
      }

      setForm({
        sku: '',
        nombre: '',
        descripcion: '',
        id_categoria: '',
        precio_venta: '',
        precio_costo: '',
        stock_minimo: '',
        id_unidad: unidades[0]?.id_unidad || ''
      });
      setEditando(null);
      cargarProductos();
    } catch (err) {
      const msg = err.response?.data?.mensaje || err.response?.data?.message || err.message;
      toast.error('No se pudo guardar el producto: ' + msg);
    } finally {
      setGuardandoProd(false);
    }
  };

  const handleEdit = (prod) => {
    setForm({
      sku: prod.sku || '',
      nombre: prod.nombre || '',
      descripcion: prod.descripcion || '',
      id_categoria: prod.id_categoria || '',
      precio_venta: prod.precio_venta ?? '',
      precio_costo: prod.precio_costo ?? '',
      stock_minimo: prod.stock_minimo ?? '',
      id_unidad: prod.id_unidad || unidades[0]?.id_unidad || ''
    });
    setEditando(prod.id_producto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmarDesactivarProducto = async () => {
    if (!productoADesactivar) return;
    setEliminando(true);
    try {
      await api.delete(`/productos/${productoADesactivar.id_producto}`);
      toast.success(`Producto "${productoADesactivar.nombre}" retirado del catálogo.`);
      if (editando === productoADesactivar.id_producto) {
        setEditando(null);
        setForm({
          sku: '',
          nombre: '',
          descripcion: '',
          id_categoria: '',
          precio_venta: '',
          precio_costo: '',
          stock_minimo: '',
          id_unidad: unidades[0]?.id_unidad || ''
        });
      }
      setProductoADesactivar(null);
      cargarProductos();
    } catch (err) {
      const msg = err.response?.data?.mensaje || err.response?.data?.message || err.message;
      toast.error('No se pudo retirar el producto: ' + msg);
    } finally {
      setEliminando(false);
    }
  };

  const handleCrearUnidad = async (e) => {
    e.preventDefault();
    if (!formUnidad.nombre.trim()) {
      toast.error('Por favor escribe el nombre de la unidad de medida.');
      return;
    }

    setGuardandoUnidad(true);
    try {
      const nombreLimpio = formUnidad.nombre.trim().toUpperCase();
      const simboloLimpio = (formUnidad.simbolo || nombreLimpio.slice(0, 3)).trim().toLowerCase();
      const codigoAuto = (nombreLimpio.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'UNI') + Math.floor(Math.random() * 90 + 10);

      const res = await api.post('/productos/unidades', {
        codigo: codigoAuto,
        nombre: nombreLimpio,
        simbolo: simboloLimpio
      });

      toast.success('¡Unidad de medida agregada!');
      const nueva = res.data.unidad;

      const resUnidades = await api.get('/productos/unidades');
      const actualizadas = resUnidades.data?.unidades || [];
      setUnidades(actualizadas);
      if (nueva?.id_unidad) {
        setForm(f => ({ ...f, id_unidad: nueva.id_unidad }));
      }

      setFormUnidad({ codigo: '', nombre: '', simbolo: '' });
      setModalUnidad(false);
    } catch (err) {
      const msg = err.response?.data?.mensaje || err.response?.data?.message || err.message;
      toast.error('No se pudo crear la unidad: ' + msg);
    } finally {
      setGuardandoUnidad(false);
    }
  };

  const confirmarRetirarUnidad = async () => {
    if (!unidadAEliminar) return;
    setEliminando(true);
    try {
      await api.delete(`/productos/unidades/${unidadAEliminar.id_unidad}`);
      toast.success(`Unidad "${unidadAEliminar.nombre}" retirada.`);
      const resUni = await api.get('/productos/unidades');
      const actualizadas = resUni.data?.unidades || [];
      setUnidades(actualizadas);
      if (String(form.id_unidad) === String(unidadAEliminar.id_unidad) && actualizadas.length > 0) {
        setForm(f => ({ ...f, id_unidad: actualizadas[0].id_unidad }));
      }
      setUnidadAEliminar(null);
    } catch (err) {
      const msg = err.response?.data?.mensaje || err.response?.data?.message || err.message;
      toast.error('No se pudo retirar la unidad: ' + msg);
    } finally {
      setEliminando(false);
    }
  };

  const productosFiltrados = productos.filter(p => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return true;
    return (
      (p.sku || '').toLowerCase().includes(q) ||
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q)
    );
  });

  if (cargando) return <div className="p-8 text-slate-500 font-medium">Cargando lista de productos...</div>;

  return (
    <div className="space-y-6">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-xs">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Lista de Productos</h1>
            <p className="text-slate-500 text-sm">
              Administra tus productos, precios en Soles (S/), unidades de medida y aviso de stock mínimo
            </p>
          </div>
        </div>

        {puedeEditar && (
          <button
            type="button"
            onClick={() => setModalUnidad(true)}
            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Ruler size={16} />
            <span>+ Unidades de Medida</span>
          </button>
        )}
      </div>

      {/* FORMULARIO DE PRODUCTO (SOLO SI TIENE PERMISO DE EDICIÓN) */}
      {puedeEditar ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-blue-950 mb-4 flex items-center space-x-2">
            <span>{editando ? '✏️ Modificar Producto' : '➕ Agregar Nuevo Producto'}</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

              {/* Código corto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Código del Producto *
                </label>
                <input
                  name="sku"
                  value={form.sku}
                  onChange={handleChange}
                  placeholder="Ej: PROD-001"
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm uppercase focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Nombre */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre del Producto *
                </label>
                <input
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  placeholder="Ej: Pulpa de Cerdo"
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Unidad de Medida */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Unidad de Medida *
                  </label>
                  <button
                    type="button"
                    onClick={() => setModalUnidad(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Crear nueva unidad</span>
                  </button>
                </div>
                <select
                  name="id_unidad"
                  value={form.id_unidad}
                  onChange={handleChange}
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500 bg-white font-medium"
                  required
                >
                  {unidades.map(u => (
                    <option key={u.id_unidad} value={u.id_unidad}>
                      {u.nombre.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Descripción (Opcional)
                </label>
                <input
                  name="descripcion"
                  value={form.descripcion}
                  onChange={handleChange}
                  placeholder="Presentación o detalle breve"
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Precio Costo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Costo de Compra (S/)
                </label>
                <input
                  name="precio_costo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio_costo}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Precio Venta */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Precio de Venta (S/) *
                </label>
                <input
                  name="precio_venta"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio_venta}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              {/* Stock Mínimo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Avisar cuando queden menos de
                </label>
                <input
                  name="stock_minimo"
                  type="number"
                  min="0"
                  value={form.stock_minimo}
                  onChange={handleChange}
                  placeholder="Ej: 5"
                  className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="submit"
                disabled={guardandoProd}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-xs transition-colors cursor-pointer"
              >
                <Plus size={16} />
                <span>{guardandoProd ? 'Guardando...' : editando ? 'Guardar Cambios' : 'Guardar Producto'}</span>
              </button>
              {editando && (
                <button
                  type="button"
                  onClick={() => {
                    setEditando(null);
                    setForm({
                      sku: '',
                      nombre: '',
                      descripcion: '',
                      id_categoria: '',
                      precio_venta: '',
                      precio_costo: '',
                      stock_minimo: '',
                      id_unidad: unidades[0]?.id_unidad || ''
                    });
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar edición
                </button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-blue-50/60 border border-blue-200 text-blue-900 px-5 py-4 rounded-2xl text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Package size={18} className="text-blue-700 shrink-0" />
            <span>
              <strong>Modo Solo Lectura:</strong> Puedes consultar la lista de productos, sus unidades de medida y precios de venta.
            </span>
          </div>
          <span className="font-semibold text-blue-800 bg-white px-3 py-1 rounded-lg border border-blue-200 shadow-2xs shrink-0 ml-2">
            Solo Consulta
          </span>
        </div>
      )}

      {/* TABLA DE PRODUCTOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50/75 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-blue-950 text-sm">Productos Registrados ({productosFiltrados.length})</h3>
            <span className="text-xs text-slate-500">Todos los precios están en Soles (S/)</span>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4">Código</th>
                <th className="p-4">Producto</th>
                <th className="p-4 text-center">Unidad de Medida</th>
                <th className="p-4 text-right">Costo</th>
                <th className="p-4 text-right">Precio Venta</th>
                <th className="p-4 text-right">Ganancia</th>
                <th className="p-4 text-center">Stock Mínimo</th>
                {puedeEditar && <th className="p-4 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={puedeEditar ? 8 : 7} className="p-10 text-center text-slate-500 text-sm">
                    No se encontraron productos con esa búsqueda.
                  </td>
                </tr>
              ) : (
                productosFiltrados.map(p => (
                  <tr key={p.id_producto} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-mono text-xs font-bold text-slate-700">{p.sku}</td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-800">{p.nombre}</div>
                      {p.descripcion && <div className="text-xs text-slate-400">{p.descripcion}</div>}
                    </td>

                    <td className="p-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 uppercase tracking-wide">
                        {(p.unidad_medida_nombre || p.unidad_medida || 'UNIDAD').toUpperCase()}
                      </span>
                    </td>

                    <td className="p-4 font-mono text-right text-slate-600 text-xs">
                      S/ {parseFloat(p.precio_costo || 0).toFixed(2)}
                    </td>
                    <td className="p-4 font-mono font-bold text-right text-slate-900">
                      S/ {parseFloat(p.precio_venta || 0).toFixed(2)}
                    </td>
                    <td className="p-4 font-mono font-semibold text-right text-emerald-600 text-xs">
                      S/ {parseFloat(p.margen ?? ((p.precio_venta || 0) - (p.precio_costo || 0))).toFixed(2)}
                    </td>
                    <td className="p-4 text-center font-mono text-xs text-slate-600">
                      {p.stock_minimo} {p.simbolo_unidad || 'und'}
                    </td>
                    {puedeEditar && (
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(p)}
                            className="px-2.5 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1 text-xs font-semibold"
                            title="Modificar producto"
                          >
                            <Edit size={14} />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductoADesactivar(p)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Retirar producto del catálogo"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / ADMINISTRAR UNIDADES DE MEDIDA */}
      {modalUnidad && (
        <div
          onClick={() => setModalUnidad(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Ruler size={18} />
                </div>
                <h3 className="text-lg font-bold text-blue-950">Unidades de Medida</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalUnidad(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearUnidad} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Agrega una unidad de medida (por ejemplo: KILOGRAMO, UNIDAD, GRAMO, LITRO, CAJA, SACO) para elegirla al crear tus productos.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre de la Unidad *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: KILOGRAMO, CAJA, PAQUETE"
                  value={formUnidad.nombre}
                  onChange={(e) => setFormUnidad({ ...formUnidad, nombre: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Abreviatura Corta (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: kg, cja, paq, und"
                  value={formUnidad.simbolo}
                  onChange={(e) => setFormUnidad({ ...formUnidad, simbolo: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="submit"
                  disabled={guardandoUnidad}
                  className="w-full py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Check size={16} />
                  <span>{guardandoUnidad ? 'Guardando...' : '+ Agregar Unidad de Medida'}</span>
                </button>
              </div>
            </form>

            <div className="p-6 pt-3 border-t border-slate-100 bg-slate-50">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Unidades Registradas ({unidades.length})
              </h4>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {unidades.map(u => (
                  <div
                    key={u.id_unidad}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-2xs"
                  >
                    <span className="font-semibold">{u.nombre}</span>
                    {u.simbolo && <span className="text-[10px] text-slate-400 font-mono">({u.simbolo})</span>}
                    <button
                      type="button"
                      onClick={() => setUnidadAEliminar(u)}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded cursor-pointer transition-colors ml-1"
                      title={`Retirar "${u.nombre}"`}
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setModalUnidad(false)}
                  className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR RETIRO DE PRODUCTO */}
      {productoADesactivar && (
        <div
          onClick={() => !eliminando && setProductoADesactivar(null)}
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
                <h3 className="text-lg font-bold text-blue-950">¿Retirar este producto?</h3>
                <p className="text-xs text-slate-500">Código: {productoADesactivar.sku}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Vas a retirar <strong>{productoADesactivar.nombre}</strong> de la lista activa. Ya no aparecerá al crear nuevos pedidos, pero los pedidos y facturas anteriores se conservarán intactos.
            </p>

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={eliminando}
                onClick={() => setProductoADesactivar(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                No, conservar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={confirmarDesactivarProducto}
                className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {eliminando ? 'Retirando...' : 'Sí, retirar producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR RETIRO DE UNIDAD DE MEDIDA */}
      {unidadAEliminar && (
        <div
          onClick={() => !eliminando && setUnidadAEliminar(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-xl shrink-0">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-base font-bold text-blue-950">¿Retirar unidad "{unidadAEliminar.nombre}"?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Dejará de aparecer en la lista para nuevos productos.
            </p>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={eliminando}
                onClick={() => setUnidadAEliminar(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={confirmarRetirarUnidad}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50 cursor-pointer"
              >
                {eliminando ? 'Retirando...' : 'Sí, retirar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
