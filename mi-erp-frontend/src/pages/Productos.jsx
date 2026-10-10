import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Package, Edit, Trash, Plus } from 'lucide-react';

export default function Productos({ usuario }) {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState({
    sku: '', nombre: '', descripcion: '', id_categoria: '',
    precio_venta: '', precio_costo: '', stock_minimo: ''
  });
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    cargarProductos();
  }, []);

  const cargarProductos = async () => {
    setCargando(true);
    try {
      const res = await api.get('/productos');
      setProductos(res.data);
    } catch (err) {
      toast.error('Error cargando productos');
    } finally {
      setCargando(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        id_categoria: form.id_categoria ? parseInt(form.id_categoria) : null,
        precio_venta: form.precio_venta ? parseFloat(form.precio_venta) : 0,
        precio_costo: form.precio_costo ? parseFloat(form.precio_costo) : 0,
        stock_minimo: form.stock_minimo ? parseInt(form.stock_minimo) : 0
      };

      if (editando) {
        await api.put(`/productos/${editando}`, data);
      } else {
        await api.post('/productos', data);
      }
      setForm({ sku: '', nombre: '', descripcion: '', id_categoria: '', precio_venta: '', precio_costo: '', stock_minimo: '' });
      setEditando(null);
      cargarProductos();
    } catch (err) {
      toast.error('Error guardando producto');
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
      stock_minimo: prod.stock_minimo || ''
    });
    setEditando(prod.id_producto);
  };

  const handleDelete = async (id) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium">¿Eliminar producto?</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => { toast.dismiss(t.id); ejecutarEliminar(id); }}
            className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold"
          >
            Sí, eliminar
          </button>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="bg-slate-200 text-slate-800 px-3 py-1 rounded text-xs font-bold"
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
      cargarProductos();
    } catch (err) {
      toast.error('Error eliminando producto');
    }
  };

  if (cargando) return <div className="p-8">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-slate-800 text-white rounded-xl shadow-lg">
          <Package size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-blue-950">Catálogo de Productos</h1>
          <p className="text-slate-500 text-sm">Gestiona productos, costos y stock mínimo</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-blue-950 mb-4">{editando ? 'Editar Producto' : 'Nuevo Producto'}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input name="sku" value={form.sku} onChange={handleChange} placeholder="SKU" className="border p-2 rounded" required />
          <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Nombre" className="border p-2 rounded" required />
          <input name="descripcion" value={form.descripcion} onChange={handleChange} placeholder="Descripción" className="border p-2 rounded" />
          <input name="id_categoria" type="number" value={form.id_categoria} onChange={handleChange} placeholder="ID Categoría" className="border p-2 rounded" />
          <input name="precio_costo" type="number" step="0.01" value={form.precio_costo} onChange={handleChange} placeholder="Precio Costo (S/)" className="border p-2 rounded" />
          <input name="precio_venta" type="number" step="0.01" value={form.precio_venta} onChange={handleChange} placeholder="Precio Venta (S/)" className="border p-2 rounded" required />
          <input name="stock_minimo" type="number" value={form.stock_minimo} onChange={handleChange} placeholder="Stock Mínimo" className="border p-2 rounded" />
          <div className="md:col-span-4">
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded flex items-center gap-2">
              <Plus size={16} /> {editando ? 'Actualizar' : 'Guardar'}
            </button>
            {editando && (
              <button type="button" onClick={() => { setEditando(null); setForm({ sku: '', nombre: '', descripcion: '', id_categoria: '', precio_venta: '', precio_costo: '', stock_minimo: '' }) }} className="ml-2 text-slate-500">
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b">
              <th className="p-4">SKU</th>
              <th className="p-4">Nombre</th>
              <th className="p-4">Costo</th>
              <th className="p-4">Venta</th>
              <th className="p-4">Margen</th>
              <th className="p-4">Stock Mín.</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {productos.map(p => (
              <tr key={p.id_producto} className="hover:bg-slate-50">
                <td className="p-4 font-mono text-xs">{p.sku}</td>
                <td className="p-4 font-medium">{p.nombre}</td>
                <td className="p-4 font-mono">S/ {p.precio_costo}</td>
                <td className="p-4 font-mono font-bold text-slate-900">S/ {p.precio_venta}</td>
                <td className="p-4 font-mono text-emerald-600 font-semibold">S/ {p.margen}</td>
                <td className="p-4 text-center">{p.stock_minimo}</td>
                <td className="p-4 flex gap-2">
                  <button onClick={() => handleEdit(p)} className="text-blue-500"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(p.id_producto)} className="text-red-500"><Trash size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
