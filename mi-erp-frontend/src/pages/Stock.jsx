import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { Package, History, Plus, ArrowLeft, RotateCcw, CheckCircle, AlertCircle, Clock, ShieldAlert, Filter, XCircle, AlertTriangle, Check, X } from 'lucide-react';

export default function Stock({ usuario }) {
  const [inventario, setInventario] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  
  const [vista, setVista] = useState('inventario'); // 'inventario', 'historial', 'alertas', 'nuevo'
  const [procesando, setProcesando] = useState(false);
  
  const [filtroKardex, setFiltroKardex] = useState('todos'); // 'todos', 'vigentes', 'solicitudes', 'anulados'

  const [form, setForm] = useState({
    id_producto: '',
    tipo_movimiento: 'INGRESO',
    cantidad: 1,
    motivo: ''
  });

  const esAdminOGerente = usuario?.rol === 'Admin Central' || usuario?.rol === 'Gerente de Área';

  useEffect(() => {
    if (vista === 'inventario' || vista === 'nuevo') cargarStock();
    if (vista === 'historial') cargarHistorial();
    if (vista === 'alertas') cargarAlertas();
  }, [vista]);

  const cargarStock = async () => {
    setCargando(true);
    try {
      const res = await api.get('/stock');
      const datos = res.data.datos || [];
      setInventario(datos);
      if (datos.length > 0 && !form.id_producto) {
        setForm(f => ({ ...f, id_producto: datos[0].id_producto }));
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
      setHistorial(res.data.movimientos || []); 
    } catch (err) {
      setError('Error al cargar el historial del Kardex.');
    } finally {
      setCargando(false);
    }
  };

  const cargarAlertas = async () => {
    setCargando(true);
    try {
      const res = await api.get('/stock/alertas');
      setAlertas(res.data.alertas || []);
    } catch (err) {
      toast.error('Error al cargar alertas de stock');
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
        <p className="text-sm font-medium">¿Anular este movimiento? Si pasaron más de 10 minutos pasará a solicitud de aprobación.</p>
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
      toast.success(respuesta.data.mensaje || 'Procesado con éxito.');
      cargarHistorial();
    } catch (err) {
      toast.error('Error al anular: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesando(false);
    }
  };

  const aprobarAnulacion = async (id_movimiento) => {
    setProcesando(true);
    try {
      const respuesta = await api.put(`/kardex/${id_movimiento}/aprobar`);
      toast.success(respuesta.data.mensaje || 'Solicitud aprobada y stock revertido.');
      cargarHistorial();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesando(false);
    }
  };

  const rechazarAnulacion = async (id_movimiento) => {
    setProcesando(true);
    try {
      const respuesta = await api.put(`/kardex/${id_movimiento}/rechazar`);
      toast.success(respuesta.data.mensaje || 'Solicitud rechazada.');
      cargarHistorial();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesando(false);
    }
  };

  const puedeAnularDirecto = (fechaMovimiento, idUsuarioMovimiento) => {
    if (esAdminOGerente) return true; 
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

  const movimientosFiltrados = historial.filter(mov => {
    if (filtroKardex === 'todos') return true;
    if (filtroKardex === 'vigentes') return mov.estado === 'VIGENTE';
    if (filtroKardex === 'solicitudes') return mov.estado === 'SOLICITUD_ANULACION';
    if (filtroKardex === 'anulados') return mov.estado === 'ANULADO';
    return true;
  });

  const totalAnulados = historial.filter(m => m.estado === 'ANULADO').length;
  const totalSolicitudes = historial.filter(m => m.estado === 'SOLICITUD_ANULACION').length;
  const totalMovimientos = historial.length;

  if (cargando && inventario.length === 0 && historial.length === 0 && alertas.length === 0) {
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
            <h1 className="text-2xl font-bold text-blue-950">Control de Inventario</h1>
            <p className="text-slate-500 text-sm">Auditoría estricta de stock, kardex y alertas de reposición</p>
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
            {totalSolicitudes > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">{totalSolicitudes}</span>
            )}
          </button>
          <button onClick={() => setVista('alertas')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 ${vista === 'alertas' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <AlertTriangle size={16} />
            <span>Alertas de Stock Mínimo</span>
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
                <th className="p-4 font-semibold text-center">Unidad</th>
                <th className="p-4 font-semibold text-center">Físico</th>
                <th className="p-4 font-semibold text-center">Reservado</th>
                <th className="p-4 font-semibold text-center text-indigo-600">Disponible</th>
                <th className="p-4 font-semibold text-center">Stock Mínimo</th>
                <th className="p-4 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {inventario.map((item, index) => {
                const disponible = item.cantidad_disponible ?? item.total_disponible ?? 0;
                const minimo = item.stock_minimo ?? 5;
                const esBajo = disponible <= minimo;

                return (
                  <tr key={index} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-900">{item.sku}</td>
                    <td className="p-4 text-slate-700 font-medium">{item.nombre_producto || item.nombre}</td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 font-mono">
                        {item.simbolo_unidad || item.unidad_medida || 'und'}
                      </span>
                    </td>
                    <td className="p-4 text-center text-slate-900">{item.cantidad_fisica ?? item.total_fisico ?? 0}</td>
                    <td className="p-4 text-center text-orange-600 font-medium">{item.cantidad_reservada ?? item.total_reservado ?? 0}</td>
                    <td className="p-4 text-center text-indigo-600 font-bold bg-indigo-50/30">{disponible}</td>
                    <td className="p-4 text-center text-slate-500">{minimo}</td>
                    <td className="p-4 text-center">
                      {disponible <= 0 ? (
                        <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">Agotado</span>
                      ) : esBajo ? (
                        <span className="px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Bajo Stock</span>
                      ) : (
                        <span className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Óptimo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* VISTA 2: HISTORIAL KARDEX */}
      {vista === 'historial' && (
        <div className="space-y-4">
          
          {esAdminOGerente && (
            <div className="bg-slate-900 text-white rounded-xl p-4 flex justify-between items-center shadow-sm">
              <div className="flex items-center space-x-3">
                <ShieldAlert className="text-amber-400" size={24} />
                <div>
                  <h3 className="text-sm font-bold">Panel de Auditoría del Kardex</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Total: {totalMovimientos} movimientos | Anulados: <b>{totalAnulados}</b> | Solicitudes pendientes de aprobación: <b>{totalSolicitudes}</b>
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
            <button onClick={() => setFiltroKardex('solicitudes')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 ${filtroKardex === 'solicitudes' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Clock size={14} className="mr-1"/> Solicitudes ({totalSolicitudes})
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
                  <th className="p-4 font-semibold">Ubicación</th>
                  <th className="p-4 font-semibold">Producto</th>
                  <th className="p-4 font-semibold text-center">Tipo</th>
                  <th className="p-4 font-semibold text-center">Cant.</th>
                  <th className="p-4 font-semibold">Motivo</th>
                  <th className="p-4 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {movimientosFiltrados.map((mov) => (
                  <tr key={mov.id_movimiento} className={`transition-colors ${mov.estado === 'ANULADO' ? 'bg-red-50/50 opacity-60' : mov.estado === 'SOLICITUD_ANULACION' ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}>
                    <td className="p-4 text-slate-600">{formatearFechaHora(mov.fecha_movimiento)}</td>
                    <td className="p-4 font-medium text-slate-800">
                      {mov.usuario_creador || 'Sistema'}
                      {mov.estado === 'ANULADO' && mov.usuario_anulador && (
                        <span className="block text-[10px] text-red-500 font-bold mt-1">Anulado por: {mov.usuario_anulador}</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600 text-xs">{mov.nombre_ubicacion || 'Principal'}</td>
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
                      ) : mov.estado === 'SOLICITUD_ANULACION' ? (
                        esAdminOGerente ? (
                          <div className="flex items-center justify-center space-x-1">
                            <button 
                              onClick={() => aprobarAnulacion(mov.id_movimiento)}
                              disabled={procesando}
                              title="Aprobar anulación y revertir stock"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs font-bold flex items-center"
                            >
                              <Check size={12} className="mr-0.5" /> Aprobar
                            </button>
                            <button 
                              onClick={() => rechazarAnulacion(mov.id_movimiento)}
                              disabled={procesando}
                              title="Rechazar solicitud"
                              className="bg-slate-300 hover:bg-slate-400 text-slate-800 px-2 py-1 rounded text-xs font-bold flex items-center"
                            >
                              <X size={12} className="mr-0.5" /> Rechazar
                            </button>
                          </div>
                        ) : (
                          <span className="text-amber-600 font-medium text-xs flex items-center justify-center">
                            <Clock size={12} className="mr-1" /> En Revisión
                          </span>
                        )
                      ) : puedeAnularDirecto(mov.fecha_movimiento, mov.id_usuario) ? (
                        <button 
                          onClick={() => anularMovimiento(mov.id_movimiento)}
                          disabled={procesando}
                          className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1 mx-auto"
                        >
                          <RotateCcw size={14} />
                          <span>Deshacer</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => anularMovimiento(mov.id_movimiento)}
                          disabled={procesando}
                          className="text-amber-600 hover:text-white hover:bg-amber-600 border border-amber-200 px-2 py-1 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1 mx-auto"
                          title="Pasaron más de 10 min. Solicitar anulación a un superior"
                        >
                          <Clock size={12} />
                          <span>Solicitar</span>
                        </button>
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

      {/* VISTA 4: ALERTAS DE STOCK MÍNIMO */}
      {vista === 'alertas' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Productos por debajo del stock de seguridad</h2>
              <p className="text-slate-500 text-sm mt-0.5">Se requiere reabastecimiento urgente según los umbrales configurados</p>
            </div>
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-bold text-xs border border-red-200">
              {alertas.length} alertas activas
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-semibold">Nivel</th>
                <th className="p-4 font-semibold">SKU</th>
                <th className="p-4 font-semibold">Producto</th>
                <th className="p-4 font-semibold">Ubicación</th>
                <th className="p-4 font-semibold text-center">Físico</th>
                <th className="p-4 font-semibold text-center">Reservado</th>
                <th className="p-4 font-semibold text-center">Disponible</th>
                <th className="p-4 font-semibold text-center">Mínimo Exigido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {alertas.map((a, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="p-4">
                    {a.nivel_alerta === 'CRITICO' ? (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-600 text-white flex items-center w-max">
                        <AlertCircle size={12} className="mr-1" /> CRÍTICO (0)
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-md text-xs font-bold bg-amber-500 text-white flex items-center w-max">
                        <AlertTriangle size={12} className="mr-1" /> BAJO
                      </span>
                    )}
                  </td>
                  <td className="p-4 font-bold text-slate-900">{a.sku}</td>
                  <td className="p-4 text-slate-700 font-medium">{a.nombre_producto}</td>
                  <td className="p-4 text-slate-600 text-xs">{a.nombre_ubicacion}</td>
                  <td className="p-4 text-center">{a.cantidad_fisica}</td>
                  <td className="p-4 text-center text-orange-600">{a.cantidad_reservada}</td>
                  <td className="p-4 text-center font-bold text-red-600">{a.cantidad_disponible}</td>
                  <td className="p-4 text-center font-medium text-slate-500">{a.stock_minimo}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {alertas.length === 0 && (
            <div className="p-12 text-center text-emerald-600">
              <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
              <p className="font-bold">¡Excelente! Todos los productos tienen stock por encima del umbral mínimo.</p>
            </div>
          )}
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
                  <option key={p.id_producto} value={p.id_producto}>{p.nombre_producto || p.nombre} (Disp: {p.cantidad_disponible ?? p.total_disponible ?? 0})</option>
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
              <p>Esta acción dejará un registro permanente con tu usuario <b>({usuario?.nombre})</b> en la sucursal asignada. Tendrás 10 minutos para revertirlo directamente; pasado ese lapso se emitirá una solicitud a un superior.</p>
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