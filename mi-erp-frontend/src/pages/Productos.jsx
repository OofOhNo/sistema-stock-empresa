import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Package, Edit, Trash, Plus, Ruler, Sparkles, X, Check } from 'lucide-react';

export default function Productos({ usuario }) {
  const [productos, setProductos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [cargando, setCargando] = useState(true);

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

  // Modal para crear nuevo formato de unidad de medida
  const [modalUnidad, setModalUnidad] = useState(false);
  const [formUnidad, setFormUnidad] = useState({
    codigo: '',
    nombre: '',
    simbolo: ''
  });
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [resProd, resUni] = await Promise.all([
        api.get('/productos'),
        api.get('/productos/unidades')
      ]);
      setProductos(resProd.data || []);
      const listaUnidades = resUni.data?.unidades || [];
      setUnidades(listaUnidades);
      if (listaUnidades.length > 0 && !form.id_unidad) {
        setForm(f => ({ ...f, id_unidad: listaUnidades[0].id_unidad }));
      }
    } catch (err) {
      toast.error('Error cargando catálogo de productos o formatos de medida');
    } finally {
      setCargando(false);
    }
  };

  const cargarProductos = async () => {
    try {
      const res = await api.get('/productos');
      setProductos(res.data || []);
    } catch (err) {
      toast.error('Error recargando productos');
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const unidadSeleccionada = unidades.find(u => String(u.id_unidad) === String(form.id_unidad));
      
      const data = {
        ...form,
        id_categoria: form.id_categoria ? parseInt(form.id_categoria) : null,
        precio_venta: form.precio_venta ? parseFloat(form.precio_venta) : 0,
        precio_costo: form.precio_costo ? parseFloat(form.precio_costo) : 0,
        stock_minimo: form.stock_minimo ? parseInt(form.stock_minimo) : 0,
        id_unidad: form.id_unidad ? parseInt(form.id_unidad) : null,
        unidad_medida: unidadSeleccionada ? unidadSeleccionada.nombre : 'Unidad'
      };

      if (editando) {
        await api.put(`/productos/${editando}`, data);
        toast.success('Producto actualizado exitosamente.');
      } else {
        await api.post('/productos', data);
        toast.success('Producto creado exitosamente.');
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
      toast.error('Error guardando producto: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleEdit = (prod) => {
    setForm({
      sku: prod.sku || '',
      nombre: prod.nombre || '',
      descripcion: prod.descripcion || '',
      id_categoria: prod.id_categoria || '',
      precio_venta: prod.precio_venta || '',
      precio_costo: prod.precio_costo || '',
      stock_minimo: prod.stock_minimo || '',
      id_unidad: prod.id_unidad || unidades[0]?.id_unidad || ''
    });
    setEditando(prod.id_producto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium">¿Estás seguro de dar de baja este producto? (Baja lógica segura)</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => { toast.dismiss(t.id); ejecutarEliminar(id); }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-bold"
          >
            Sí, dar de baja
          </button>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1 rounded text-xs font-bold"
          >
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  const ejecutarEliminar = async (id) => {
    try {
      await api.delete(`/productos/${id}`);
      toast.success('Producto dado de baja correctamente.');
      cargarProductos();
    } catch (err) {
      toast.error('Error eliminando producto');
    }
  };

  // Guardar nuevo formato de unidad de medida (sin requerir códigos SUNAT al usuario)
  const handleCrearUnidad = async (e) => {
    e.preventDefault();
    if (!formUnidad.nombre.trim()) {
      toast.error('Por favor escribe el nombre de la unidad.');
      return;
    }

    setGuardandoUnidad(true);
    try {
      const nombreLimpio = formUnidad.nombre.trim().toUpperCase();
      const simboloLimpio = (formUnidad.simbolo || nombreLimpio.slice(0, 3)).trim().toLowerCase();
      // Generar código interno único automáticamente
      const codigoAuto = (nombreLimpio.replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'UNI') + Math.floor(Math.random() * 90 + 10);

      const res = await api.post('/productos/unidades', {
        codigo: codigoAuto,
        nombre: nombreLimpio,
        simbolo: simboloLimpio
      });

      toast.success('¡Formato de unidad creado con éxito!');
      const nueva = res.data.unidad;
      
      // Actualizar listado de unidades y seleccionar la recién creada
      const resUnidades = await api.get('/productos/unidades');
      const actualizadas = resUnidades.data?.unidades || [];
      setUnidades(actualizadas);
      if (nueva?.id_unidad) {
        setForm(f => ({ ...f, id_unidad: nueva.id_unidad }));
      }

      setFormUnidad({ codigo: '', nombre: '', simbolo: '' });
      setModalUnidad(false);
    } catch (err) {
      toast.error('Error creando unidad de medida: ' + (err.response?.data?.message || err.message));
    } finally {
      setGuardandoUnidad(false);
    }
  };

  const handleEliminarUnidad = async (id_unidad, nombre) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium">¿Seguro que deseas retirar la unidad <strong>"{nombre}"</strong>?</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={async () => { 
              toast.dismiss(t.id);
              try {
                await api.delete(`/productos/unidades/${id_unidad}`);
                toast.success(`Unidad "${nombre}" retirada.`);
                const resUni = await api.get('/productos/unidades');
                const actualizadas = resUni.data?.unidades || [];
                setUnidades(actualizadas);
                if (form.id_unidad === id_unidad && actualizadas.length > 0) {
                  setForm(f => ({ ...f, id_unidad: actualizadas[0].id_unidad }));
                }
              } catch (err) {
                toast.error('Error al retirar unidad: ' + (err.response?.data?.message || err.message));
              }
            }}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-bold"
          >
            Sí, retirar
          </button>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1 rounded text-xs font-bold"
          >
            Cancelar
          </button>
        </div>
      </div>
    ), { duration: Infinity });
  };

  if (cargando) return <div className="p-8 text-slate-500 font-medium">Cargando productos y formatos...</div>;

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-xs">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Catálogo de Productos</h1>
            <p className="text-slate-500 text-sm">
              Gestiona productos, unidades de medida (formatos SUNAT e internos), precios y costos
            </p>
          </div>
        </div>

        <button
          onClick={() => setModalUnidad(true)}
          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-colors self-start sm:self-auto"
        >
          <Ruler size={16} />
          <span>+ Crear Formato de Medida</span>
        </button>
      </div>

      {/* FORMULARIO DE PRODUCTO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-blue-950 mb-4 flex items-center space-x-2">
          <span>{editando ? 'Editar Producto' : 'Nuevo Producto'}</span>
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* SKU */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">SKU *</label>
              <input 
                name="sku" 
                value={form.sku} 
                onChange={handleChange} 
                placeholder="Ej: PRD-001" 
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500" 
                required 
              />
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Nombre del Producto *</label>
              <input 
                name="nombre" 
                value={form.nombre} 
                onChange={handleChange} 
                placeholder="Nombre comercial" 
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500" 
                required 
              />
            </div>

            {/* Unidad de Medida (Elegir y crear formato) */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Unidad de Medida (Formato) *
                </label>
                <button
                  type="button"
                  onClick={() => setModalUnidad(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1"
                >
                  <Plus size={13} />
                  <span>Nuevo Formato</span>
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
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Descripción</label>
              <input 
                name="descripcion" 
                value={form.descripcion} 
                onChange={handleChange} 
                placeholder="Detalle técnico u observaciones del producto" 
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500" 
              />
            </div>

            {/* Precio Costo */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Precio Costo (S/)</label>
              <input 
                name="precio_costo" 
                type="number" 
                step="0.01" 
                value={form.precio_costo} 
                onChange={handleChange} 
                placeholder="0.00" 
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm font-mono focus:outline-none focus:border-indigo-500" 
              />
            </div>

            {/* Precio Venta */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Precio Venta (S/) *</label>
              <input 
                name="precio_venta" 
                type="number" 
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
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Stock Mínimo (Alerta)</label>
              <input 
                name="stock_minimo" 
                type="number" 
                value={form.stock_minimo} 
                onChange={handleChange} 
                placeholder="5" 
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500" 
              />
            </div>

            {/* Categoría ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">ID Categoría (Opcional)</label>
              <input 
                name="id_categoria" 
                type="number" 
                value={form.id_categoria} 
                onChange={handleChange} 
                placeholder="1" 
                className="w-full border border-slate-300 p-2.5 rounded-xl text-sm focus:outline-none focus:border-indigo-500" 
              />
            </div>

          </div>

          <div className="flex items-center space-x-3 pt-2">
            <button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center space-x-2 shadow-xs transition-colors"
            >
              <Plus size={16} /> 
              <span>{editando ? 'Actualizar Producto' : 'Guardar Producto'}</span>
            </button>
            {editando && (
              <button 
                type="button" 
                onClick={() => { 
                  setEditando(null); 
                  setForm({ 
                    sku: '', nombre: '', descripcion: '', id_categoria: '', 
                    precio_venta: '', precio_costo: '', stock_minimo: '',
                    id_unidad: unidades[0]?.id_unidad || '' 
                  }); 
                }} 
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      {/* TABLA DE PRODUCTOS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50/75 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Productos Registrados ({productos.length})</h3>
          <span className="text-xs text-slate-500">Precios y márgenes expresados en Soles (S/)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4">SKU</th>
                <th className="p-4">Nombre</th>
                <th className="p-4 text-center">Unidad de Medida</th>
                <th className="p-4 text-right">Costo</th>
                <th className="p-4 text-right">Venta</th>
                <th className="p-4 text-right">Margen</th>
                <th className="p-4 text-center">Stock Mín.</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {productos.map(p => (
                <tr key={p.id_producto} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono text-xs font-bold text-slate-700">{p.sku}</td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-800">{p.nombre}</div>
                    {p.descripcion && <div className="text-xs text-slate-400">{p.descripcion}</div>}
                  </td>
                  
                  {/* Unidad de Medida */}
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
                    S/ {parseFloat(p.margen || 0).toFixed(2)}
                  </td>
                  <td className="p-4 text-center font-mono text-xs text-slate-600">
                    {p.stock_minimo} {p.simbolo_unidad || 'und'}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button 
                        onClick={() => handleEdit(p)} 
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar producto"
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(p.id_producto)} 
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Dar de baja producto"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR NUEVO FORMATO DE UNIDAD DE MEDIDA */}
      {modalUnidad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Ruler size={18} />
                </div>
                <h3 className="text-lg font-bold text-blue-950">Crear Formato de Medida</h3>
              </div>
              <button 
                onClick={() => setModalUnidad(false)} 
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearUnidad} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                Registra un nuevo formato de unidad de medida (ej. KILOGRAMO, UNIDAD, GRAMO, LITRO, SACO, CAJA). Estará disponible inmediatamente para asignar a cualquier producto.
              </p>

              {/* Nombre descriptivo de la unidad */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre de la Unidad *
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Ej: KILOGRAMO, GRAMO, LITRO, SACO, CAJA, PAQUETE"
                  value={formUnidad.nombre}
                  onChange={(e) => setFormUnidad({ ...formUnidad, nombre: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold uppercase focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Aparecerá en el catálogo y selección de productos</span>
              </div>

              {/* Símbolo o abreviatura */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Abreviatura o Símbolo Corto (Opcional)
                </label>
                <input 
                  type="text"
                  placeholder="Ej: kg, g, l, sac, cja, paq, und"
                  value={formUnidad.simbolo}
                  onChange={(e) => setFormUnidad({ ...formUnidad, simbolo: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">Símbolo para cantidades y etiquetas de empaque</span>
              </div>

              {/* Botón Guardar Formato */}
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="submit"
                  disabled={guardandoUnidad}
                  className="w-full py-2.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Check size={16} />
                  <span>{guardandoUnidad ? 'Guardando...' : '+ Agregar Formato'}</span>
                </button>
              </div>
            </form>

            {/* Catálogo de Formatos Actuales con Opción de Retirar */}
            <div className="p-6 pt-2 border-t border-slate-100 bg-slate-50">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Formatos de Medida Registrados ({unidades.length})
              </h4>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {unidades.map(u => (
                  <div 
                    key={u.id_unidad} 
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 shadow-2xs"
                  >
                    <span className="font-semibold">{u.nombre}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({u.simbolo})</span>
                    <button
                      type="button"
                      onClick={() => handleEliminarUnidad(u.id_unidad, u.nombre)}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded cursor-pointer transition-colors ml-1"
                      title={`Retirar formato "${u.nombre}"`}
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
                  className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
