import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  Package, History, Plus, ArrowLeft, RotateCcw, CheckCircle, AlertCircle, Clock,
  ShieldAlert, Filter, XCircle, AlertTriangle, Check, X, Globe, Building, Lock, Search
} from 'lucide-react';

export default function Stock({ usuario }) {
  const [inventario, setInventario] = useState([]);
  const [stockTotal, setStockTotal] = useState([]);
  const [stockPorUbicacion, setStockPorUbicacion] = useState([]);
  const [puedeVerOtrasUbicaciones, setPuedeVerOtrasUbicaciones] = useState(false);
  const [ubicacionesLista, setUbicacionesLista] = useState([]);
  const [subVistaInventario, setSubVistaInventario] = useState('total');
  const [filtroSede, setFiltroSede] = useState('todas');
  const [tiposProducto, setTiposProducto] = useState([]);
  const [filtroTipoProducto, setFiltroTipoProducto] = useState('todos');
  const [busquedaStock, setBusquedaStock] = useState('');

  const [historial, setHistorial] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [vista, setVista] = useState('inventario'); // 'inventario', 'historial', 'alertas', 'nuevo'
  const [procesando, setProcesando] = useState(false);
  const [filtroKardex, setFiltroKardex] = useState('todos');
  const [movimientoAAnular, setMovimientoAAnular] = useState(null);

  const [form, setForm] = useState({
    id_producto: '',
    id_ubicacion: usuario?.id_ubicacion || '',
    tipo_movimiento: 'INGRESO',
    cantidad: 1,
    motivo: ''
  });

  const puedeEditarStock =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.stock?.puede_editar === true;

  const esAdminOGerente =
    usuario?.rol === 'Admin Central' ||
    usuario?.rol === 'Gerente de Área' ||
    (puedeEditarStock && puedeVerOtrasUbicaciones);

  const cargarAlertasSilencioso = useCallback(async () => {
    try {
      const res = await api.get('/stock/alertas');
      setAlertas(res.data.alertas || []);
    } catch {
      // Silencioso en carga en segundo plano
    }
  }, []);

  const cargarStock = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [resStock, resUbic, resTipos] = await Promise.all([
        api.get('/stock'),
        api.get('/ubicaciones').catch(() => ({ data: { datos: [] } })),
        api.get('/productos/tipos').catch(() => ({ data: { tipos: [] } }))
      ]);

      const stTotal = resStock.data.stock_total || resStock.data.datos || [];
      const stUbic = resStock.data.stock_por_ubicacion || [];
      const puedeVerOtras =
        resStock.data.puede_ver_otras_ubicaciones === true || usuario?.rol === 'Admin Central';

      setStockTotal(stTotal);
      setStockPorUbicacion(stUbic);
      setInventario(stTotal);
      setPuedeVerOtrasUbicaciones(puedeVerOtras);

      const ubs = resUbic.data.ubicaciones || resUbic.data.datos || [];
      setUbicacionesLista(ubs);
      setTiposProducto(resTipos.data?.tipos || []);

      setForm(f => ({
        ...f,
        id_producto: f.id_producto || (stTotal[0]?.id_producto ?? ''),
        id_ubicacion: f.id_ubicacion || usuario?.id_ubicacion || ubs[0]?.id_ubicacion || ''
      }));
    } catch {
      setError('No se pudo cargar el inventario.');
    } finally {
      setCargando(false);
    }
  }, [usuario]);

  const cargarHistorial = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await api.get('/kardex');
      setHistorial(res.data.movimientos || []);
    } catch {
      setError('No se pudo cargar el historial de entradas y salidas.');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarAlertas = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api.get('/stock/alertas');
      setAlertas(res.data.alertas || []);
    } catch {
      toast.error('No se pudieron cargar las alertas de stock.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarAlertasSilencioso();
    });
    return () => {
      alive = false;
    };
  }, [cargarAlertasSilencioso]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMovimientoAAnular(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      if (vista === 'nuevo' && !puedeEditarStock) {
        setVista('inventario');
        return;
      }
      if (vista === 'inventario' || vista === 'nuevo') void cargarStock();
      if (vista === 'historial') void cargarHistorial();
      if (vista === 'alertas') void cargarAlertas();
    });
    return () => {
      alive = false;
    };
  }, [vista, puedeEditarStock, cargarStock, cargarHistorial, cargarAlertas]);

  const obtenerDisponibleEnSede = (idProducto, idUbicacion) => {
    if (!idUbicacion) {
      const globalProd = stockTotal.find(p => String(p.id_producto) === String(idProducto));
      return globalProd ? Number(globalProd.total_disponible ?? globalProd.cantidad_disponible ?? 0) : 0;
    }
    const filaSede = stockPorUbicacion.find(
      s => String(s.id_producto) === String(idProducto) && String(s.id_ubicacion) === String(idUbicacion)
    );
    if (filaSede) {
      return Number(filaSede.cantidad_disponible ?? filaSede.total_disponible ?? 0);
    }
    if (!puedeVerOtrasUbicaciones && String(idUbicacion) === String(usuario?.id_ubicacion)) {
      const prodSede = stockTotal.find(p => String(p.id_producto) === String(idProducto));
      return prodSede ? Number(prodSede.cantidad_disponible ?? prodSede.total_disponible ?? 0) : 0;
    }
    return 0;
  };

  const registrarMovimiento = async (e) => {
    e.preventDefault();
    const sedeDestino = puedeVerOtrasUbicaciones
      ? (form.id_ubicacion || usuario?.id_ubicacion)
      : usuario?.id_ubicacion;

    if (!sedeDestino) {
      toast.error('Selecciona la sede o almacén donde se hará el movimiento.');
      return;
    }
    if (!form.id_producto) {
      toast.error('Selecciona un producto.');
      return;
    }

    const cantNum = Number(form.cantidad);
    if (!cantNum || cantNum <= 0) {
      toast.error('Ingresa una cantidad mayor a cero.');
      return;
    }

    if (form.tipo_movimiento === 'SALIDA') {
      const disp = obtenerDisponibleEnSede(form.id_producto, sedeDestino);
      if (cantNum > disp) {
        toast.error(`No hay suficiente stock disponible en esa sede (disponible: ${disp}).`);
        return;
      }
    }

    setProcesando(true);
    try {
      await api.post('/kardex/movimiento', {
        id_producto: Number(form.id_producto),
        id_ubicacion: Number(sedeDestino),
        tipo_movimiento: form.tipo_movimiento,
        cantidad: cantNum,
        motivo: form.motivo.trim()
      });
      toast.success('Entrada / salida registrada correctamente.');
      setForm(f => ({ ...f, cantidad: 1, motivo: '' }));
      cargarAlertasSilencioso();
      setVista('historial');
    } catch (err) {
      toast.error(err.response?.data?.mensaje || err.message || 'No se pudo guardar el movimiento.');
    } finally {
      setProcesando(false);
    }
  };

  const ejecutarAnulacion = async () => {
    if (!movimientoAAnular) return;
    setProcesando(true);
    try {
      const respuesta = await api.put(`/kardex/${movimientoAAnular.id_movimiento}/anular`);
      toast.success(respuesta.data.mensaje || 'Movimiento actualizado correctamente.');
      setMovimientoAAnular(null);
      cargarHistorial();
      cargarAlertasSilencioso();
    } catch (err) {
      toast.error('No se pudo deshacer: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setProcesando(false);
    }
  };

  const aprobarAnulacion = async (id_movimiento) => {
    setProcesando(true);
    try {
      const respuesta = await api.put(`/kardex/${id_movimiento}/aprobar`);
      toast.success(respuesta.data.mensaje || 'Solicitud aprobada y stock corregido.');
      cargarHistorial();
      cargarAlertasSilencioso();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || err.message);
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
      toast.error(err.response?.data?.mensaje || err.message);
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

  const filtrarPorTexto = (item) => {
    const q = busquedaStock.toLowerCase().trim();
    const coincideTexto = !q || (
      (item.sku || '').toLowerCase().includes(q) ||
      (item.nombre_producto || item.nombre || '').toLowerCase().includes(q) ||
      (item.nombre_ubicacion || '').toLowerCase().includes(q)
    );
    const coincideTipo = filtroTipoProducto === 'todos' ||
      String(item.id_tipo_producto) === String(filtroTipoProducto) ||
      (item.tipo_producto_nombre && item.tipo_producto_nombre.toLowerCase() === filtroTipoProducto.toLowerCase());
    return coincideTexto && coincideTipo;
  };

  const totalAnulados = historial.filter(m => m.estado === 'ANULADO').length;
  const totalSolicitudes = historial.filter(m => m.estado === 'SOLICITUD_ANULACION').length;
  const totalMovimientos = historial.length;

  if (cargando && inventario.length === 0 && historial.length === 0 && alertas.length === 0) {
    return <div className="text-slate-500 font-medium p-8">Cargando inventario...</div>;
  }

  return (
    <div className="space-y-6">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-blue-950">Inventario de Mercadería</h1>
            <p className="text-slate-500 text-sm">
              Consulta cantidades disponibles, registra entradas o salidas y revisa avisos de poco stock
            </p>
          </div>
        </div>

        <div className="flex space-x-3">
          {vista !== 'nuevo' && puedeEditarStock && (
            <button
              type="button"
              onClick={() => setVista('nuevo')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <Plus size={18} />
              <span>Registrar Entrada o Salida</span>
            </button>
          )}
          {vista === 'nuevo' && (
            <button
              type="button"
              onClick={() => setVista('inventario')}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer"
            >
              <ArrowLeft size={18} />
              <span>Volver al Inventario</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* PESTAÑAS DE VISTA */}
      {vista !== 'nuevo' && (
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl w-max max-w-full">
          <button
            type="button"
            onClick={() => setVista('inventario')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
              vista === 'inventario' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Package size={16} />
            <span>Stock Actual</span>
          </button>
          <button
            type="button"
            onClick={() => setVista('historial')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
              vista === 'historial' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History size={16} />
            <span>Entradas y Salidas</span>
            {totalSolicitudes > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                {totalSolicitudes}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setVista('alertas')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 cursor-pointer ${
              vista === 'alertas' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <AlertTriangle size={16} />
            <span>Poco Stock</span>
            {alertas.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                {alertas.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* VISTA 1: STOCK ACTUAL */}
      {vista === 'inventario' && (
        <div className="space-y-4">
          {!puedeVerOtrasUbicaciones && (
            <div className="bg-blue-50/80 border border-blue-200 text-blue-900 px-4 py-3 rounded-2xl text-xs flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <Building size={16} className="text-blue-700 shrink-0" />
                <span>
                  📍 Inventario de tu Sede: <strong>{usuario?.nombre_ubicacion || 'Mi Sede'}</strong>. Aquí ves las cantidades disponibles en tu lugar de trabajo.
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
            <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSubVistaInventario('total')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 cursor-pointer ${
                  subVistaInventario === 'total' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe size={15} />
                <span>{puedeVerOtrasUbicaciones ? 'Total de Toda la Empresa' : `Mi Sede (${usuario?.nombre_ubicacion || 'Asignada'})`}</span>
              </button>
              <button
                type="button"
                onClick={() => setSubVistaInventario('ubicacion')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center space-x-2 cursor-pointer ${
                  subVistaInventario === 'ubicacion' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building size={15} />
                <span>{puedeVerOtrasUbicaciones ? 'Ver por Sede / Almacén' : 'Detalle de mi Sede'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busquedaStock}
                  onChange={(e) => setBusquedaStock(e.target.value)}
                  placeholder="Buscar producto o código..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>


              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-medium text-slate-500">Tipo:</span>
                <select
                  value={filtroTipoProducto}
                  onChange={(e) => setFiltroTipoProducto(e.target.value)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="todos">🏷️ Todos los tipos</option>
                  {tiposProducto.map(t => (
                    <option key={t.id_tipo_producto} value={t.id_tipo_producto}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {subVistaInventario === 'ubicacion' && (
                puedeVerOtrasUbicaciones ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-slate-500">Sede:</span>
                    <select
                      value={filtroSede}
                      onChange={(e) => setFiltroSede(e.target.value)}
                      className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="todas">🏢 Todas las sedes</option>
                      {ubicacionesLista.map(u => (
                        <option key={u.id_ubicacion} value={u.id_ubicacion}>
                          📍 {u.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-medium">
                    <Lock size={13} className="text-amber-600" />
                    <span>Sede: <b>{usuario?.nombre_ubicacion || 'Mi Sede'}</b></span>
                  </div>
                )
              )}
            </div>
          </div>

          {/* SUBVISTA 1: TOTAL */}
          {subVistaInventario === 'total' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-bold text-blue-950">
                    {puedeVerOtrasUbicaciones ? 'Stock Total de la Empresa' : `Inventario en ${usuario?.nombre_ubicacion || 'Mi Sede'}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {puedeVerOtrasUbicaciones
                      ? 'Suma de todos los almacenes y sedes'
                      : 'Cantidades disponibles para usar o vender en tu sede'}
                  </p>
                </div>
                <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-full border border-indigo-100">
                  {stockTotal.filter(filtrarPorTexto).length} productos
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-semibold">Código</th>
                      <th className="p-4 font-semibold">Producto</th>
                      <th className="p-4 font-semibold text-center">Unidad</th>
                      <th className="p-4 font-semibold text-center">En Almacén</th>
                      <th className="p-4 font-semibold text-center">Separado en Pedidos</th>
                      <th className="p-4 font-semibold text-center text-indigo-600">Libre para Vender</th>
                      <th className="p-4 font-semibold text-center">Mínimo</th>
                      <th className="p-4 font-semibold text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {stockTotal.filter(filtrarPorTexto).length === 0 ? (
                      <tr>
                        <td colSpan="8" className="p-8 text-center text-slate-500 text-xs">
                          No se encontraron productos en el inventario.
                        </td>
                      </tr>
                    ) : (
                      stockTotal.filter(filtrarPorTexto).map((item, index) => {
                        const disponible = Number(item.total_disponible ?? item.cantidad_disponible ?? 0);
                        const minimo = Number(item.stock_minimo ?? 5);
                        const esBajo = disponible <= minimo;

                        return (
                          <tr key={item.id_producto || index} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono text-xs font-bold text-slate-900">{item.sku}</td>
                            <td className="p-4 text-slate-700 font-medium">
                              <div>{item.nombre_producto || item.nombre}</div>
                              {item.tipo_producto_nombre && (
                                <span className="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  {item.tipo_producto_nombre}
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 font-mono">
                                {item.simbolo_unidad || item.unidad_medida || 'und'}
                              </span>
                            </td>
                            <td className="p-4 text-center text-slate-900 font-semibold">{item.total_fisico ?? item.cantidad_fisica ?? 0}</td>
                            <td className="p-4 text-center text-orange-600 font-medium">{item.total_reservado ?? item.cantidad_reservada ?? 0}</td>
                            <td className="p-4 text-center text-indigo-600 font-bold bg-indigo-50/30">{disponible}</td>
                            <td className="p-4 text-center text-slate-500">{minimo}</td>
                            <td className="p-4 text-center">
                              {disponible <= 0 ? (
                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">Sin Stock</span>
                              ) : esBajo ? (
                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Queda Poco</span>
                              ) : (
                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Bien</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBVISTA 2: POR UBICACIÓN */}
          {subVistaInventario === 'ubicacion' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-bold text-blue-950">Inventario por Sede / Almacén</h3>
                  <p className="text-xs text-slate-500">
                    {puedeVerOtrasUbicaciones
                      ? 'Cantidades detalladas en cada sede física'
                      : `Mostrando únicamente tu sede (${usuario?.nombre_ubicacion || 'asignada'})`}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                      <th className="p-4 font-semibold">Sede / Almacén</th>
                      <th className="p-4 font-semibold">Código</th>
                      <th className="p-4 font-semibold">Producto</th>
                      <th className="p-4 font-semibold text-center">Unidad</th>
                      <th className="p-4 font-semibold text-center">En Almacén</th>
                      <th className="p-4 font-semibold text-center">Separado</th>
                      <th className="p-4 font-semibold text-center text-indigo-600">Libre</th>
                      <th className="p-4 font-semibold text-center">Mínimo</th>
                      <th className="p-4 font-semibold text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {stockPorUbicacion
                      .filter(item => {
                        if (puedeVerOtrasUbicaciones && filtroSede !== 'todas') {
                          return String(item.id_ubicacion) === String(filtroSede);
                        }
                        return true;
                      })
                      .filter(filtrarPorTexto)
                      .map((item, index) => {
                        const disponible = Number(item.cantidad_disponible ?? item.total_disponible ?? 0);
                        const minimo = Number(item.stock_minimo ?? 5);
                        const esBajo = disponible <= minimo;

                        return (
                          <tr key={`${item.id_ubicacion}-${item.id_producto}-${index}`} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-medium text-slate-800">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                                📍 {item.nombre_ubicacion || usuario?.nombre_ubicacion || 'Sede'}
                              </span>
                            </td>
                            <td className="p-4 font-mono text-xs font-bold text-slate-900">{item.sku}</td>
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
                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-100 text-red-700 border border-red-200">Sin Stock</span>
                              ) : esBajo ? (
                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">Queda Poco</span>
                              ) : (
                                <span className="px-2 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Bien</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: HISTORIAL DE ENTRADAS Y SALIDAS */}
      {vista === 'historial' && (
        <div className="space-y-4">
          {esAdminOGerente && (
            <div className="bg-slate-900 text-white rounded-xl p-4 flex justify-between items-center shadow-sm">
              <div className="flex items-center space-x-3">
                <ShieldAlert className="text-amber-400 shrink-0" size={24} />
                <div>
                  <h3 className="text-sm font-bold">Resumen de Entradas y Salidas</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Registros totales: {totalMovimientos} | Anulados: <b>{totalAnulados}</b> | Pedidos para deshacer pendientes: <b>{totalSolicitudes}</b>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-xl w-max max-w-full">
            <button
              type="button"
              onClick={() => setFiltroKardex('todos')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 cursor-pointer ${
                filtroKardex === 'todos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Filter size={14} className="mr-1" /> Todos
            </button>
            <button
              type="button"
              onClick={() => setFiltroKardex('vigentes')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 cursor-pointer ${
                filtroKardex === 'vigentes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <CheckCircle size={14} className="mr-1" /> Activos
            </button>
            <button
              type="button"
              onClick={() => setFiltroKardex('solicitudes')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 cursor-pointer ${
                filtroKardex === 'solicitudes' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Clock size={14} className="mr-1" /> Por Aprobar ({totalSolicitudes})
            </button>
            <button
              type="button"
              onClick={() => setFiltroKardex('anulados')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1 cursor-pointer ${
                filtroKardex === 'anulados' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <XCircle size={14} className="mr-1" /> Deshechos
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Fecha y Hora</th>
                    <th className="p-4 font-semibold">Registrado por</th>
                    <th className="p-4 font-semibold">Sede</th>
                    <th className="p-4 font-semibold">Producto</th>
                    <th className="p-4 font-semibold text-center">Operación</th>
                    <th className="p-4 font-semibold text-center">Cantidad</th>
                    <th className="p-4 font-semibold">Motivo</th>
                    {puedeEditarStock && <th className="p-4 font-semibold text-center">Acción</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {movimientosFiltrados.map((mov) => (
                    <tr
                      key={mov.id_movimiento}
                      className={`transition-colors ${
                        mov.estado === 'ANULADO'
                          ? 'bg-red-50/50 opacity-65'
                          : mov.estado === 'SOLICITUD_ANULACION'
                          ? 'bg-amber-50/60'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-4 text-slate-600 text-xs">{formatearFechaHora(mov.fecha_movimiento)}</td>
                      <td className="p-4 font-medium text-slate-800">
                        {mov.usuario_creador || 'Sistema'}
                        {mov.estado === 'ANULADO' && mov.usuario_anulador && (
                          <span className="block text-[10px] text-red-500 font-bold mt-1">
                            Deshecho por: {mov.usuario_anulador}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-slate-600 text-xs">{mov.nombre_ubicacion || 'Principal'}</td>
                      <td className="p-4 text-slate-700 font-medium">{mov.nombre_producto}</td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                            mov.tipo_movimiento === 'INGRESO'
                              ? 'bg-emerald-100 text-emerald-700'
                              : mov.tipo_movimiento === 'SALIDA'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {mov.tipo_movimiento === 'INGRESO'
                            ? 'ENTRADA (+)'
                            : mov.tipo_movimiento === 'SALIDA'
                            ? 'SALIDA (-)'
                            : mov.tipo_movimiento}
                        </span>
                      </td>
                      <td className="p-4 text-center font-bold text-slate-900">{mov.cantidad}</td>
                      <td className="p-4 text-slate-600 max-w-xs truncate" title={mov.motivo}>
                        {mov.motivo}
                      </td>
                      {puedeEditarStock && (
                        <td className="p-4 text-center">
                          {mov.estado === 'ANULADO' ? (
                            <span className="text-red-500 font-medium text-xs flex items-center justify-center">
                              <AlertCircle size={12} className="mr-1" /> Deshecho
                            </span>
                          ) : mov.estado === 'SOLICITUD_ANULACION' ? (
                            esAdminOGerente ? (
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => aprobarAnulacion(mov.id_movimiento)}
                                  disabled={procesando}
                                  title="Aprobar y devolver stock"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-xs font-bold flex items-center cursor-pointer"
                                >
                                  <Check size={12} className="mr-0.5" /> Aprobar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rechazarAnulacion(mov.id_movimiento)}
                                  disabled={procesando}
                                  title="Mantener movimiento"
                                  className="bg-slate-300 hover:bg-slate-400 text-slate-800 px-2.5 py-1 rounded text-xs font-bold flex items-center cursor-pointer"
                                >
                                  <X size={12} className="mr-0.5" /> Rechazar
                                </button>
                              </div>
                            ) : (
                              <span className="text-amber-600 font-medium text-xs flex items-center justify-center">
                                <Clock size={12} className="mr-1" /> Esperando jefe
                              </span>
                            )
                          ) : puedeAnularDirecto(mov.fecha_movimiento, mov.id_usuario) ? (
                            <button
                              type="button"
                              onClick={() => setMovimientoAAnular(mov)}
                              disabled={procesando}
                              className="text-red-500 hover:text-white hover:bg-red-500 border border-red-200 px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1 mx-auto cursor-pointer"
                            >
                              <RotateCcw size={14} />
                              <span>Deshacer</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMovimientoAAnular(mov)}
                              disabled={procesando}
                              className="text-amber-700 hover:text-white hover:bg-amber-600 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center justify-center space-x-1 mx-auto cursor-pointer"
                              title="Pedir autorización a un encargado para deshacer este registro"
                            >
                              <Clock size={12} />
                              <span>Pedir deshacer</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {movimientosFiltrados.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                <History size={48} className="mx-auto text-slate-300 mb-4" />
                <p>No hay registros en esta pestaña.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 3: ALERTAS DE POCO STOCK */}
      {vista === 'alertas' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-blue-950">Productos con poco stock</h2>
              <p className="text-slate-500 text-sm mt-0.5">
                Estos productos tienen igual o menos unidades que su mínimo recomendado
              </p>
            </div>
            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-bold text-xs border border-red-200">
              {alertas.length} avisos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Urgencia</th>
                  <th className="p-4 font-semibold">Código</th>
                  <th className="p-4 font-semibold">Producto</th>
                  <th className="p-4 font-semibold">Sede</th>
                  <th className="p-4 font-semibold text-center">En Almacén</th>
                  <th className="p-4 font-semibold text-center">Separado</th>
                  <th className="p-4 font-semibold text-center">Libre</th>
                  <th className="p-4 font-semibold text-center">Mínimo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {alertas.map((a, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-4">
                      {a.nivel_alerta === 'CRITICO' ? (
                        <span className="px-2 py-1 rounded-md text-xs font-bold bg-red-600 text-white flex items-center w-max">
                          <AlertCircle size={12} className="mr-1" /> AGOTADO (0)
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-md text-xs font-bold bg-amber-500 text-white flex items-center w-max">
                          <AlertTriangle size={12} className="mr-1" /> QUEDA POCO
                        </span>
                      )}
                    </td>
                    <td className="p-4 font-mono text-xs font-bold text-slate-900">{a.sku}</td>
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
          </div>

          {alertas.length === 0 && (
            <div className="p-12 text-center text-emerald-600">
              <CheckCircle size={48} className="mx-auto text-emerald-400 mb-4" />
              <p className="font-bold">¡Todo en orden! Ningún producto tiene poco stock.</p>
            </div>
          )}
        </div>
      )}

      {/* VISTA 4: REGISTRAR ENTRADA O SALIDA */}
      {vista === 'nuevo' && puedeEditarStock && (
        <form onSubmit={registrarMovimiento} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 max-w-2xl">
          <h2 className="text-xl font-bold text-blue-950 mb-6 border-b border-slate-100 pb-4">
            Registrar Entrada o Salida de Mercadería
          </h2>
          <div className="space-y-5">
            {puedeVerOtrasUbicaciones ? (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  ¿En qué Sede o Almacén? *
                </label>
                <select
                  value={form.id_ubicacion}
                  onChange={(e) => setForm({ ...form, id_ubicacion: e.target.value })}
                  required
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-medium"
                >
                  {ubicacionesLista.map(u => (
                    <option key={u.id_ubicacion} value={u.id_ubicacion}>
                      📍 {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                📍 Sede donde se registrará: <strong>{usuario?.nombre_ubicacion || 'Mi Sede asignada'}</strong>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Producto *</label>
              <select
                value={form.id_producto}
                onChange={(e) => setForm({ ...form, id_producto: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
              >
                {inventario.map(p => {
                  const sedeSel = puedeVerOtrasUbicaciones ? form.id_ubicacion : usuario?.id_ubicacion;
                  const dispSede = obtenerDisponibleEnSede(p.id_producto, sedeSel);
                  return (
                    <option key={p.id_producto} value={p.id_producto}>
                      {p.nombre_producto || p.nombre} — Disponible en esta sede: {dispSede} {p.simbolo_unidad || 'und'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">¿Qué deseas registrar? *</label>
                <select
                  value={form.tipo_movimiento}
                  onChange={(e) => setForm({ ...form, tipo_movimiento: e.target.value })}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="INGRESO">➕ ENTRADA (Llegó mercadería / Sumar)</option>
                  <option value="SALIDA">➖ SALIDA (Retirar mercadería / Restar)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Cantidad *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Motivo (¿Por qué entra o sale esta mercadería?) *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Llegó compra del proveedor, merma, devolución de cliente..."
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-xs flex items-start space-x-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-blue-600" />
              <p>
                Este movimiento quedará guardado a nombre de <b>{usuario?.nombre}</b>. Si te equivocas, tienes 10 minutos para deshacerlo directamente; después de ese tiempo podrás pedirle a un encargado que lo deshaga.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setVista('inventario')}
                className="px-5 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={procesando}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-7 py-3 rounded-xl text-sm font-bold shadow-md shadow-indigo-600/20 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {procesando ? 'Guardando...' : 'Guardar Movimiento'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* MODAL CONFIRMAR DESHACER MOVIMIENTO */}
      {movimientoAAnular && (
        <div
          onClick={() => !procesando && setMovimientoAAnular(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                <RotateCcw size={22} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-blue-950">¿Deshacer este movimiento?</h3>
                <p className="text-xs text-slate-500">
                  {movimientoAAnular.nombre_producto} ({movimientoAAnular.cantidad} und)
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600">
              {puedeAnularDirecto(movimientoAAnular.fecha_movimiento, movimientoAAnular.id_usuario)
                ? 'Se revertirá inmediatamente la cantidad en el inventario.'
                : 'Como ya pasaron más de 10 minutos, se enviará una solicitud para que un encargado apruebe deshacer este registro.'}
            </p>

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={procesando}
                onClick={() => setMovimientoAAnular(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={procesando}
                onClick={ejecutarAnulacion}
                className="px-5 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {procesando ? 'Procesando...' : 'Sí, continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
