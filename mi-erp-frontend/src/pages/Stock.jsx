import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Package, History, Plus, ArrowLeft, RotateCcw, CheckCircle, AlertCircle, Clock, ShieldAlert, Filter, XCircle } from 'lucide-react';

export default function Stock({ usuario }) {
  const [inventario, setInventario] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  
  const [vista, setVista] = useState('inventario'); 
  const [procesando, setProcesando] = useState(false);
  
  // NUEVO: filtro para el Kardex
  const [filtroKardex, setFiltroKardex] = useState('todos'); // 'todos', 'vigentes', 'anulados'

  const [form, setForm] = useState({
    id_producto: '',
    tipo_movimiento: 'INGRESO',
    cantidad: 1,
    motivo: ''
  });

  useEffect(() => {
    if (vista === 'inventario' || vista === 'nuevo') cargarStock();
    if (vista === 'historial') cargarHistorial();
  }, [vista]);

  const cargarStock = async () => {
    setCargando(true);
    try {
      const res = await api.get('/stock');
      setInventario(res.data.datos);
      if (res.data.datos.length > 0 && !form.id_producto) {
        setForm({ ...form, id_producto: res.data.datos[0].id_producto });
      }
    } catch (err) {
      setError('Error al cargar inventario.');
    } finally {
      setCargando(false);
    }
  };

  const cargarHistorial = async () => {
    setCargando(true);
    try {
      const res = await api.get('/kardex'); 
      setHistorial(res.data.movimientos || res.data); 
    } catch (err) {
      setError('Error al cargar el historial.');
    } finally {
      setCargando(false);
    }
  };

  const registrarMovimiento = async (e) => {
    e.preventDefault();
    setProcesando(true);
    try {
      await api.post('/kardex/movimiento', {
        id_producto: form.id_producto,
        id_ubicacion: usuario?.id_ubicacion,
        tipo_movimiento: form.tipo_movimiento,
        cantidad: form.cantidad,
        motivo: form.motivo
      });
      toast.success('Movimiento registrado con éxito.');
      setForm({ ...form, cantidad: 1, motivo: '' });
      setVista('historial');
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesando(false);
    }
  };

  const anularMovimiento = async (id_movimiento) => {
    toast((t) => (
      <div className="flex flex-col space-y-3">
        <p className="text-sm font-medium">¿Anular este movimiento? Se revertirá el stock físico asociado.</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => { toast.dismiss(t.id); ejecutarAnulacion(id_movimiento); }}
            className="bg-red-500 text-white px-3 py-1 rounded text-xs font-bold"
          >
            Sí, anular
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

  const ejecutarAnulacion = async (id_movimiento) => {
    setProcesando(true);
    try {
      const respuesta = await api.put(`/kardex/${id_movimiento}/anular`);
      toast.success(respuesta.data.mensaje || 'Anulado con éxito.');
      cargarHistorial();
    } catch (err) {
      toast.error('Error al anular: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesando(false);
    }
  };

  const puedeAnular = (fechaMovimiento, idUsuarioMovimiento) => {
    if (usuario?.rol === 'Admin Central') return true; 
    if (usuario?.id_usuario !== idUsuarioMovimiento) return false; 
    
    const fechaMov = new Date(fechaMovimiento);
    const ahora = new Date();
    const minutosPasados = (ahora - fechaMov) / (1000 * 60);
    return minutosPasados <= 10;
  };

  const formatearFechaHora = (fechaISO) => {
    const opciones = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
    return new Date(fechaISO).toLocaleDateString('es-ES', opciones);
  };

  // NUEVO: logica de filtrado para el Kardex
  const movimientosFiltrados = historial.filter(mov => {
    if (filtroKardex === 'todos') return true;
    if (filtroKardex === 'vigentes') return mov.estado !== 'ANULADO';
    if (filtroKardex === 'anulados') return mov.estado === 'ANULADO';
    return true;
  });

  // NUEVO: metricas para el administrador
  const totalAnulados = historial.filter(m => m.estado === 'ANULADO').length;
  const totalMovimientos = historial.length;

  if (cargando && inventario.length === 0 && historial.length === 0) {
    return <div className="text-slate-500 font-medium p-8">Cargando módulo de inventario...</div>;
  }

  return (
    <div className="space-y-6">
      
      {/* CABECERA */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Control de Inventario</h1>
            <p className="text-slate-500 text-sm">Auditoría estricta de stock y kardex</p>
          </div>
        </div>

        <div className="flex space-x-3">
          {vista !== 'nuevo' && (
            <button onClick={() => setVista('nuevo')} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center space-x-2 shadow-lg shadow-indigo-600/30">
              <Plus size={18} />
              <span>Nuevo Movimiento</span>
            </button>
          )}
          {vista === 'nuevo' && (
            <button onClick={() => setVista('inventario')} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center space-x-2">
              <ArrowLeft size={18} />
              <span>Volver</span>
            </button>
          )}
        </div>
      </div>

      {/* TABS DE VISTA */}
      {vista !== 'nuevo' && (
        <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
          <button onClick={() => setVista('inventario')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${vista === 'inventario' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Package size={16} />
            <span>Stock Actual</span>
          </button>
          <button onClick={() => setVista('historial')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${vista === 'historial' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <History size={16} />
            <span>Kardex (Auditoría)</span>
          </button>
        </div>
      )}

      {/* VISTA 1: STOCK ACTUAL */}
      {vista === 'inventario' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-semibold">SKU</th>
                <th className="p-4 font-semibold">Producto</th>
                <th className="p-4 font-semibold text-center">Físico</th>
                <th className="p-4 font-semibold text-center">Reservado</th>
                <th className="p-4 font-semibold text-center text-indigo-600">Disponible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {inventario.map((item, index) => (
                <tr key={index} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold text-slate-900">{item.sku}</td>
                  <td className="p-4 text-slate-700 font-medium">{item.nombre_producto || item.nombre}</td>
                  <td className="p-4 text-center text-slate-900">{item.cantidad_fisica || item.total_fisico}</td>
                  <td className="p-4 text-center text-orange-600 font-medium">{item.cantidad_reservada || item.total_reservado}</td>
                  <td className="p-4 text-center text-indigo-600 font-bold bg-indigo-50/30">{item.cantidad_disponible || item.total_disponible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VISTA 2: HISTORIAL KARDEX */}
      {vista === 'historial' && (
        <div className="space-y-4">
          
          {/* PANEL EXCLUSIVO PARA ADMINISTRADORES */}
          {usuario?.rol === 'Admin Central' && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <ShieldAlert className="text-red-500" size={24} />
                <div>
                  <h3 className="text-sm font-bold text-red-900">Panel de Auditoría (Admin)</h3>
                  <p className="text-xs text-red-700 mt-0.5">
                    Se han detectado <b>{totalAnulados} movimientos anulados</b> de un total de {totalMovimientos} transacciones.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* FILTROS DEL KARDEX */}
          <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl w-max">
            <button onClick={() => setFiltroKardex('todos')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtroKardex === 'todos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Filter size={14} className="mr-1"/> Todos
            </button>
            <button onClick={() => setFiltroKardex('vigentes')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtroKardex === 'vigentes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <CheckCircle size={14} className="mr-1"/> Vigentes
            </button>
            <button onClick={() => setFiltroKardex('anulados')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtroKardex === 'anulados' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <XCircle size={14} className="mr-1"/> Anulados
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Fecha/Hora</th>
                  <th className="p-4 font-semibold">Usuario</th>
                  <th className="p-4 font-semibold">Producto</th>
                  <th className="p-4 font-semibold text-center">Tipo</th>
                  <th className="p-4 font-semibold text-center">Cant.</th>
                  <th className="p-4 font-semibold">Motivo</th>
                  <th className="p-4 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {movimientosFiltrados.map((mov) => (
                  <tr key={mov.id_movimiento} className={`transition-colors ${mov.estado === 'ANULADO' ? 'bg-red-50/50 opacity-60' : 'hover:bg-slate-50'}`}>
                    <td className="p-4 text-slate-600">{formatearFechaHora(mov.fecha_movimiento)}</td>
                    <td className="p-4 font-medium text-slate-800">
                      {mov.usuario_creador || 'Sistema'}
                      {mov.estado === 'ANULADO' && mov.usuario_anulador && (
                        <span className="block text-[10px] text-red-500 font-bold mt-1">Anulado por: {mov.usuario_anulador}</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-700">{mov.nombre_producto}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                        mov.tipo_movimiento === 'INGRESO' ? 'bg-emerald-100 text-emerald-700' :
                        mov.tipo_movimiento === 'SALIDA' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {mov.tipo_movimiento}
                      </span>
                    </td>
                    <td className="p-4 text-center font-bold text-slate-900">{mov.cantidad}</td>
                    <td className="p-4 text-slate-600 max-w-xs truncate" title={mov.motivo}>{mov.motivo}</td>
                    <td className="p-4 text-center">
                      {mov.estado === 'ANULADO' ? (
                        <span className="text-red-500 font-medium text-xs flex items-center justify-center">
                          <AlertCircle size={12} className="mr-1" /> Anulado
                        </span>
                      ) : puedeAnular(mov.fecha_movimiento, mov.id_usuario) ? (
                        <button 
                          onClick={() => anularMovimiento(mov.id_movimiento)}
                          disabled={procesando}
                          className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1 mx-auto"
                        >
                          <RotateCcw size={14} />
                          <span>Deshacer</span>
                        </button>
                      ) : (
                        <div className="text-slate-400 text-xs flex flex-col items-center" title="Solo un Administrador puede anular movimientos antiguos">
                          <Clock size={14} className="mb-1 opacity-50" />
                          <span>Bloqueado</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movimientosFiltrados.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                <History size={48} className="mx-auto text-slate-300 mb-4" />
                <p>No hay movimientos que coincidan con este filtro.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 3: NUEVO MOVIMIENTO (FORMULARIO) */}
      {vista === 'nuevo' && (
        <form onSubmit={registrarMovimiento} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-2xl">
          <h2 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-100 pb-4">Registrar Movimiento Manual</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Producto</label>
              <select value={form.id_producto} onChange={(e) => setForm({...form, id_producto: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                {inventario.map(p => (
                  <option key={p.id_producto} value={p.id_producto}>{p.nombre_producto || p.nombre} (Disp: {p.cantidad_disponible || p.total_disponible})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de Operación</label>
                <select value={form.tipo_movimiento} onChange={(e) => setForm({...form, tipo_movimiento: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                  <option value="INGRESO">INGRESO (Sumar Stock)</option>
                  <option value="SALIDA">SALIDA (Restar Stock)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Cantidad</label>
                <input type="number" min="1" required value={form.cantidad} onChange={(e) => setForm({...form, cantidad: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Motivo / Justificación (Auditoría)</label>
              <input type="text" required placeholder="Ej. Devolución de cliente, Ajuste de inventario, etc." value={form.motivo} onChange={(e) => setForm({...form, motivo: e.target.value})} className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="bg-blue-50 text-blue-700 p-4 rounded-xl text-sm flex items-start space-x-3 mt-4">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <p>Esta acción dejará un registro permanente con tu nombre <b>({usuario?.nombre})</b>. Tendrás 10 minutos exactos para deshacer el movimiento si te equivocas.</p>
            </div>
            <div className="flex justify-end pt-4">
              <button type="submit" disabled={procesando} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-600/30 transition-colors disabled:opacity-50">
                {procesando ? 'Procesando...' : 'Guardar y Auditar'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}