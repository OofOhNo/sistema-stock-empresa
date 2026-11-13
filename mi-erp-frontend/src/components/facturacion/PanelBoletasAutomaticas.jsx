import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../../api';
import {
  Bot, Play, Pause, Printer, RefreshCw, CheckCircle2, XCircle,
  Clock, Save, Zap
} from 'lucide-react';

export default function PanelBoletasAutomaticas({ ubicaciones = [], onBoletaGenerada }) {
  const [config, setConfig] = useState(null);
  const [cola, setCola] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [generandoAhora, setGenerandoAhora] = useState(false);

  const cargarTodo = useCallback(async () => {
    try {
      const [resCfg, resCola] = await Promise.all([
        api.get('/facturacion/boletas-auto/config'),
        api.get('/facturacion/boletas-auto/cola')
      ]);
      if (resCfg.data?.config) setConfig(resCfg.data.config);
      setCola(resCola.data?.cola || []);
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al cargar panel de boletas automáticas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarTodo();
    });
    const t = setInterval(cargarTodo, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [cargarTodo]);

  const guardarConfiguracion = async (e) => {
    e?.preventDefault();
    if (!config) return;
    if (Number(config.peso_minimo_item) < 0.50) {
      return toast.error('El peso mínimo por producto no puede ser menor a 0.50 kg.');
    }
    if (Number(config.monto_maximo) >= 700) {
      return toast.error('El monto máximo de boleta simple debe ser menor a S/ 700.00.');
    }

    setGuardando(true);
    try {
      const res = await api.put('/facturacion/boletas-auto/config', config);
      setConfig(res.data.config);
      toast.success(res.data.mensaje || 'Configuración guardada.');
      window.dispatchEvent(new CustomEvent('boletas_auto_config_actualizada'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async () => {
    if (!config) return;
    setGuardando(true);
    try {
      const res = await api.put('/facturacion/boletas-auto/config', {
        ...config,
        activo: !config.activo
      });
      setConfig(res.data.config);
      toast.success(!config.activo ? 'Generador automático ACTIVADO.' : 'Generador automático PAUSADO.');
      window.dispatchEvent(new CustomEvent('boletas_auto_config_actualizada'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al cambiar estado.');
    } finally {
      setGuardando(false);
    }
  };

  const generarPruebaAhora = async () => {
    setGenerandoAhora(true);
    try {
      const res = await api.post('/facturacion/boletas-auto/generar-ahora');
      toast.success(res.data.mensaje);
      await cargarTodo();
      if (onBoletaGenerada) onBoletaGenerada();
      window.dispatchEvent(new CustomEvent('cola_impresion_nueva_boleta'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo generar la boleta automática.');
    } finally {
      setGenerandoAhora(false);
    }
  };

  const cambiarEstadoCola = async (idCola, estado) => {
    try {
      await api.patch(`/facturacion/boletas-auto/cola/${idCola}/estado`, { estado });
      toast.success(`Cola actualizada a ${estado}`);
      cargarTodo();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar la cola.');
    }
  };

  if (cargando || !config) {
    return <div className="p-8 text-center text-slate-500 text-sm">Cargando módulo de boletas automáticas...</div>;
  }

  const pendientes = cola.filter((c) => c.estado === 'PENDIENTE').length;

  return (
    <div className="space-y-6">
      {/* Estado y acciones rápidas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className={`p-3 rounded-xl ${config.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            <Bot size={24} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-bold text-blue-950">Generador Automático de Boletas (B001)</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${config.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                {config.activo ? 'ACTIVO' : 'PAUSADO'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Emite boletas simples (&lt; S/ 700, porciones &ge; 0.50 kg) escalonadas durante el día descontando stock real y enviándolas a impresión en segundo plano.
            </p>
            {config.ultima_ejecucion && (
              <p className="text-[11px] text-slate-400 mt-1">
                Última emisión: {new Date(config.ultima_ejecucion).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
                {config.proxima_ejecucion && config.activo && (
                  <> • Próxima: {new Date(config.proxima_ejecucion).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={toggleActivo}
            disabled={guardando}
            className={`inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs cursor-pointer ${
              config.activo
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {config.activo ? <Pause size={15} /> : <Play size={15} />}
            <span>{config.activo ? 'Pausar Automático' : 'Activar Automático'}</span>
          </button>

          <button
            type="button"
            onClick={generarPruebaAhora}
            disabled={generandoAhora}
            className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Zap size={15} />
            <span>{generandoAhora ? 'Generando...' : 'Generar Boleta Ahora'}</span>
          </button>
        </div>
      </div>

      {/* Formulario de Parámetros */}
      <form onSubmit={guardarConfiguracion} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h4 className="font-bold text-sm text-slate-800">Parámetros del Generador e Impresión en Segundo Plano</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Cada cuántos minutos emitir</label>
            <input
              type="number"
              min="1"
              max="480"
              value={config.intervalo_minutos}
              onChange={(e) => setConfig({ ...config, intervalo_minutos: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Sede de descuento de stock</label>
            <select
              value={config.id_ubicacion || ''}
              onChange={(e) => setConfig({ ...config, id_ubicacion: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl bg-white"
            >
              {ubicaciones.map((u) => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Monto mínimo (S/)</label>
            <input
              type="number"
              step="1"
              min="15"
              max="680"
              value={config.monto_minimo}
              onChange={(e) => setConfig({ ...config, monto_minimo: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Monto máximo (&lt; S/ 700)</label>
            <input
              type="number"
              step="1"
              min="25"
              max="699"
              value={config.monto_maximo}
              onChange={(e) => setConfig({ ...config, monto_maximo: Math.min(699, Number(e.target.value || 680)) })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Porción mínima (kg, min 0.50)</label>
            <input
              type="number"
              step="0.05"
              min="0.50"
              value={config.peso_minimo_item}
              onChange={(e) => setConfig({ ...config, peso_minimo_item: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Porción máxima por producto (kg)</label>
            <input
              type="number"
              step="0.5"
              min="0.50"
              value={config.peso_maximo_item}
              onChange={(e) => setConfig({ ...config, peso_maximo_item: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Horario inicio (Lima)</label>
            <input
              type="time"
              value={config.hora_inicio}
              onChange={(e) => setConfig({ ...config, hora_inicio: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Horario fin (Lima)</label>
            <input
              type="time"
              value={config.hora_fin}
              onChange={(e) => setConfig({ ...config, hora_fin: e.target.value })}
              className="w-full p-2.5 border border-slate-300 rounded-xl font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(config.solo_horario_laboral)}
                onChange={(e) => setConfig({ ...config, solo_horario_laboral: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span className="font-semibold text-slate-700">Emitir solo dentro del horario configurado</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(config.auto_imprimir_navegador)}
                onChange={(e) => setConfig({ ...config, auto_imprimir_navegador: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span className="font-semibold text-slate-700">Auto-imprimir desde este navegador cuando haya cola pendiente</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="inline-flex items-center space-x-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            <Save size={14} />
            <span>{guardando ? 'Guardando...' : 'Guardar Configuración'}</span>
          </button>
        </div>
      </form>

      {/* Cola de Impresión en Segundo Plano */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center space-x-2">
            <Printer size={18} className="text-indigo-600" />
            <div>
              <h4 className="font-bold text-sm text-blue-950">Cola de Impresión Automática ({pendientes} pendientes)</h4>
              <p className="text-[11px] text-slate-500">Cada boleta generada ingresa aquí para imprimirse automáticamente en segundo plano</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cargarTodo}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl cursor-pointer"
            title="Refrescar cola"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
                <th className="p-3.5">Boleta</th>
                <th className="p-3.5">Fecha</th>
                <th className="p-3.5">Peso Total</th>
                <th className="p-3.5">Monto</th>
                <th className="p-3.5">Estado Cola</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cola.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400">
                    Aún no hay boletas en la cola de impresión.
                  </td>
                </tr>
              ) : (
                cola.map((item) => (
                  <tr key={item.id_cola} className="hover:bg-slate-50">
                    <td className="p-3.5 font-mono font-bold text-slate-900">
                      {item.serie}-{String(item.correlativo).padStart(8, '0')}
                    </td>
                    <td className="p-3.5 text-slate-600">
                      {new Date(item.creado_en).toLocaleString('es-PE', { timeZone: 'America/Lima' })}
                    </td>
                    <td className="p-3.5 font-mono">{Number(item.peso_total || 0).toFixed(2)} kg</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-700">S/ {Number(item.monto_total || 0).toFixed(2)}</td>
                    <td className="p-3.5">
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.estado === 'IMPRESO'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.estado === 'PENDIENTE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.estado === 'IMPRESO' ? <CheckCircle2 size={11} /> : item.estado === 'PENDIENTE' ? <Clock size={11} /> : <XCircle size={11} />}
                        <span>{item.estado}</span>
                      </span>
                    </td>
                    <td className="p-3.5 text-right space-x-2">
                      {item.estado !== 'PENDIENTE' ? (
                        <button
                          type="button"
                          onClick={() => cambiarEstadoCola(item.id_cola, 'PENDIENTE')}
                          className="text-indigo-600 hover:underline font-bold cursor-pointer"
                        >
                          Reencolar impresión
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => cambiarEstadoCola(item.id_cola, 'IMPRESO')}
                            className="text-emerald-600 hover:underline font-bold cursor-pointer"
                          >
                            Marcar impreso
                          </button>
                          <button
                            type="button"
                            onClick={() => cambiarEstadoCola(item.id_cola, 'OMITIDO')}
                            className="text-slate-500 hover:underline cursor-pointer"
                          >
                            Omitir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
