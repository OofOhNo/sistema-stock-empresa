import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { 
  LayoutDashboard, Package, ShoppingCart, FileText, Calendar, 
  LogOut, Users, MapPin, Building2, Truck, Clock, Search, 
  ShieldCheck, AlertTriangle, Network, X, Loader2, CheckCircle2, ArrowRight, Bug 
} from 'lucide-react';
import api from '../api';

export default function Layout({ usuario, cerrarSesion, vistaActual, setVistaActual, children }) {
  const [horaActual, setHoraActual] = useState(new Date());

  // Estado del Buscador General Rápido
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState(null);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);
  const [mostrarModalBusqueda, setMostrarModalBusqueda] = useState(false);
  const [tabResultados, setTabResultados] = useState('facturas');
  const buscadorTimeout = useRef(null);

  // Estado del Modal Rápido de Reporte de Errores (Símbolo en la esquina)
  const [modalBug, setModalBug] = useState(false);
  const [formBug, setFormBug] = useState({
    modulo: 'General',
    queHacia: '',
    descripcion: ''
  });
  const [enviandoBug, setEnviandoBug] = useState(false);

  // Reloj digital en tiempo real que se actualiza cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setHoraActual(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // REGLA DE NEGOCIO:
  // "La hora tiene que salir con diferencia de 1 hora para los administrativos y los de producción,
  // los de administración ven la hora real y producción ven 1 hora menos"
  const esProduccion = usuario?.area === 'PRODUCCION';
  const horaCalculada = esProduccion 
    ? new Date(horaActual.getTime() - 60 * 60 * 1000) 
    : horaActual;

  const horaStr = horaCalculada.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });

  const fechaStr = horaCalculada.toLocaleDateString('es-ES', { 
    weekday: 'short', 
    day: '2-digit', 
    month: 'short' 
  });
  
  // Ejecutar búsqueda global con debounce
  const ejecutarBusqueda = async (query) => {
    if (!query || query.trim().length < 2) {
      setResultadosBusqueda(null);
      return;
    }
    setCargandoBusqueda(true);
    try {
      const res = await api.get(`/busqueda/global?q=${encodeURIComponent(query)}`);
      setResultadosBusqueda(res.data);
      setMostrarModalBusqueda(true);
      if (res.data.facturas?.length > 0) {
        setTabResultados('facturas');
      } else if (res.data.pedidos?.length > 0) {
        setTabResultados('pedidos');
      }
    } catch (err) {
      console.error('Error en búsqueda global:', err);
    } finally {
      setCargandoBusqueda(false);
    }
  };

  const handleInputBusqueda = (val) => {
    setTerminoBusqueda(val);
    if (buscadorTimeout.current) clearTimeout(buscadorTimeout.current);
    buscadorTimeout.current = setTimeout(() => {
      ejecutarBusqueda(val);
    }, 350);
  };

  const handleEnviarBug = async (e) => {
    e.preventDefault();
    if (!formBug.descripcion.trim()) {
      toast.error('Por favor cuéntanos qué problema o error ocurrió.');
      return;
    }
    setEnviandoBug(true);
    try {
      await api.post('/errores', {
        titulo: `Incidencia en ${formBug.modulo}: ${formBug.descripcion.slice(0, 40)}`,
        descripcion: `¿Qué estaba intentando hacer?: ${formBug.queHacia || 'No especificado'}\n¿Qué ocurrió?: ${formBug.descripcion}`,
        area_modulo: formBug.modulo,
        severidad: 'MEDIA'
      });
      toast.success('¡Gracias por avisar! Tu reporte de error fue registrado.');
      setModalBug(false);
      setFormBug({ modulo: 'General', queHacia: '', descripcion: '' });
    } catch (err) {
      toast.error('Error al enviar reporte: ' + (err.response?.data?.mensaje || err.message));
    } finally {
      setEnviandoBug(false);
    }
  };

  const menu = [
    { id: 'dashboard', nombre: 'Inicio', icono: <LayoutDashboard size={20} /> },
    { id: 'stock', nombre: 'Inventario', icono: <Package size={20} /> },
    { id: 'productos', nombre: 'Productos', icono: <Package size={20} /> },
    { id: 'clientes', nombre: 'Clientes', icono: <Building2 size={20} /> },
    { id: 'pedidos', nombre: 'Pedidos', icono: <ShoppingCart size={20} /> },
    { id: 'facturacion', nombre: 'Facturación', icono: <FileText size={20} /> },
    { id: 'calidad', nombre: 'Calidad y Sanidad', icono: <ShieldCheck size={20} /> },
    { id: 'ubicaciones', nombre: 'Ubicaciones y Sedes', icono: <MapPin size={20} /> },
    { id: 'reuniones', nombre: 'Reuniones', icono: <Calendar size={20} /> },
    ...(usuario.rol === 'Administrador' || usuario.rol === 'Admin Central' 
      ? [
          { id: 'usuarios', nombre: 'Personal y Roles', icono: <Users size={20} /> }
        ] 
      : []
    )
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      
      {/* MENU LATERAL (Sidebar) */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">Mi ERP</h2>
          <div className="flex items-center space-x-2 mt-1">
            <span className="text-xs text-indigo-400 font-semibold">{usuario.rol}</span>
            <span className="text-slate-600">·</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded ${
              esProduccion ? 'bg-amber-400/20 text-amber-300' : 'bg-indigo-400/20 text-indigo-300'
            }`}>
              {esProduccion ? 'Producción' : 'Admin'}
            </span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-1.5 mt-2 overflow-y-auto">
          {menu.map((item) => (
            <button
              key={item.id}
              onClick={() => setVistaActual(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl transition-all ${
                vistaActual === item.id 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icono}
              <span className="font-medium text-sm">{item.nombre}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between px-2 mb-3">
            <div className="flex flex-col truncate pr-2">
              <span className="text-sm font-semibold text-white truncate">{usuario.nombre}</span>
              <span className="text-[11px] text-slate-400 truncate">{usuario.email}</span>
            </div>
          </div>
          <button 
            onClick={cerrarSesion}
            className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-red-500 hover:text-white text-slate-400 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL CON BARRA SUPERIOR (Reloj digital en vivo + Buscador General) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* BARRA SUPERIOR CON RELOJ Y BUSCADOR GENERAL */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 sm:px-8 flex items-center justify-between shrink-0 shadow-xs gap-4">
          
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:inline">Módulo Activo:</span>
            <span className="text-sm font-bold text-slate-800 capitalize">
              {menu.find(m => m.id === vistaActual)?.nombre || 'ERP'}
            </span>
          </div>

          {/* BUSCADOR GENERAL RÁPIDO PARA FACTURAS Y PEDIDOS */}
          <div className="relative flex-1 max-w-lg mx-2">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-2.5 text-slate-400" />
              <input 
                type="text"
                placeholder="🔍 Buscar pedidos y facturas (ej: 5 de noviembre, cliente: vikingos)..."
                value={terminoBusqueda}
                onChange={(e) => handleInputBusqueda(e.target.value)}
                onFocus={() => { if (resultadosBusqueda) setMostrarModalBusqueda(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ejecutarBusqueda(terminoBusqueda);
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition-all shadow-2xs"
              />
              {cargandoBusqueda && (
                <Loader2 size={15} className="absolute right-3 top-2.5 text-indigo-500 animate-spin" />
              )}
              {terminoBusqueda && !cargandoBusqueda && (
                <button 
                  onClick={() => { setTerminoBusqueda(''); setResultadosBusqueda(null); }}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
              esProduccion 
                ? "bg-amber-50 text-amber-800 border-amber-200" 
                : "bg-indigo-50 text-indigo-700 border-indigo-200"
            }`}>
              {esProduccion ? "Área: Producción / Planta" : "Área: Administración"}
            </span>
          </div>
        </header>

        {/* ÁREA DE CONTENIDO */}
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          {children}
        </main>

      </div>

      {/* MODAL DE RESULTADOS DE BÚSQUEDA GENERAL */}
      {mostrarModalBusqueda && resultadosBusqueda && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs pt-16 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header del Modal */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center space-x-2">
                  <Search size={18} className="text-indigo-600" />
                  <h3 className="text-base font-bold text-blue-950">
                    Resultados de Búsqueda Rápida
                  </h3>
                  <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-bold">
                    {resultadosBusqueda.total} encontrados
                  </span>
                </div>
                <div className="flex items-center space-x-2 mt-1 text-xs text-slate-500">
                  <span>Consulta: <strong className="text-slate-800">"{resultadosBusqueda.consulta}"</strong></span>
                  {resultadosBusqueda.criterios?.dia && (
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      📅 Día: {resultadosBusqueda.criterios.dia}
                    </span>
                  )}
                  {resultadosBusqueda.criterios?.mes && (
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      📅 Mes: {resultadosBusqueda.criterios.mes}
                    </span>
                  )}
                  {resultadosBusqueda.criterios?.cliente && (
                    <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                      🏢 Cliente: {resultadosBusqueda.criterios.cliente}
                    </span>
                  )}
                </div>
              </div>

              <button 
                onClick={() => setMostrarModalBusqueda(false)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Pestañas: Facturas vs Pedidos */}
            <div className="flex border-b border-slate-200 bg-white px-5 pt-3 space-x-3">
              <button
                onClick={() => setTabResultados('facturas')}
                className={`pb-2.5 text-xs font-bold transition-all flex items-center space-x-1.5 border-b-2 ${
                  tabResultados === 'facturas'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText size={15} />
                <span>Facturas y Boletas ({resultadosBusqueda.facturas?.length || 0})</span>
              </button>

              <button
                onClick={() => setTabResultados('pedidos')}
                className={`pb-2.5 text-xs font-bold transition-all flex items-center space-x-1.5 border-b-2 ${
                  tabResultados === 'pedidos'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShoppingCart size={15} />
                <span>Pedidos ({resultadosBusqueda.pedidos?.length || 0})</span>
              </button>
            </div>

            {/* Lista de Resultados */}
            <div className="max-h-96 overflow-y-auto p-4 divide-y divide-slate-100">
              
              {/* TAB FACTURAS */}
              {tabResultados === 'facturas' && (
                resultadosBusqueda.facturas?.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No se encontraron facturas o boletas con estos criterios.
                  </div>
                ) : (
                  resultadosBusqueda.facturas.map((f) => (
                    <div 
                      key={f.id_comprobante} 
                      onClick={() => {
                        setMostrarModalBusqueda(false);
                        setVistaActual('facturacion');
                      }}
                      className="py-3 px-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          <FileText size={18} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">{f.codigo_formateado}</span>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-bold border border-emerald-200">
                              {f.estado_sunat}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-blue-950 mt-0.5">{f.cliente_nombre || 'Cliente General'}</p>
                          <p className="text-xs text-slate-500">
                            RUC: {f.cliente_ruc || '-'} · Fecha: {new Date(f.fecha_emision).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-blue-950 block">
                          S/ {parseFloat(f.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-indigo-600 font-semibold group-hover:underline flex items-center justify-end mt-0.5">
                          Ir a Facturación <ArrowRight size={12} className="ml-1" />
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}

              {/* TAB PEDIDOS */}
              {tabResultados === 'pedidos' && (
                resultadosBusqueda.pedidos?.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-400">
                    No se encontraron órdenes de pedido con estos criterios.
                  </div>
                ) : (
                  resultadosBusqueda.pedidos.map((p) => (
                    <div 
                      key={p.id_pedido} 
                      onClick={() => {
                        setMostrarModalBusqueda(false);
                        setVistaActual('pedidos');
                      }}
                      className="py-3 px-3 hover:bg-slate-50 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
                          <ShoppingCart size={18} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">Pedido #{p.id_pedido}</span>
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-bold border border-blue-200">
                              {p.estado_pedido}
                            </span>
                            {p.etiquetado && <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded">Etiquetado</span>}
                            {p.sellado_vacio && <span className="text-[9px] bg-cyan-50 text-cyan-700 px-1 rounded">Al Vacío</span>}
                          </div>
                          <p className="text-sm font-bold text-blue-950 mt-0.5">{p.cliente_nombre || 'Cliente General'}</p>
                          <p className="text-xs text-slate-500">
                            Solicitado por: {p.solicitado_por || p.usuario_creador || '-'} · Fecha: {new Date(p.creado_en).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold text-blue-950 block">
                          S/ {parseFloat(p.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[11px] text-amber-600 font-semibold group-hover:underline flex items-center justify-end mt-0.5">
                          Ir a Pedidos <ArrowRight size={12} className="ml-1" />
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}

            </div>

            {/* Footer Modal */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Presiona <strong>Esc</strong> para cerrar o haz clic fuera del diálogo</span>
              <button
                onClick={() => setMostrarModalBusqueda(false)}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* BOTÓN FLOTANTE EN LA ESQUINA PARA REPORTAR ERRORES */}
      <button
        onClick={() => setModalBug(true)}
        className="fixed bottom-5 right-5 z-40 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center gap-2 group cursor-pointer"
        title="Reportar un problema o error"
      >
        <Bug size={20} />
        <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out text-xs font-bold pr-1">
          Reportar problema
        </span>
      </button>

      {/* MODAL SIMPLE DE REPORTE DE ERRORES */}
      {modalBug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bug size={18} className="text-red-400" />
                <h3 className="text-base font-bold text-white">¿Encontraste un problema?</h3>
              </div>
              <button 
                onClick={() => setModalBug(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEnviarBug} className="p-5 space-y-4">
              <p className="text-xs text-slate-500">
                Cuéntanos qué falló en palabras sencillas para que podamos solucionarlo rápidamente.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ¿En qué parte del sistema ocurrió?
                </label>
                <select
                  value={formBug.modulo}
                  onChange={(e) => setFormBug({ ...formBug, modulo: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                >
                  <option value="General">General / No estoy seguro</option>
                  <option value="Inventario">Inventario / Stock</option>
                  <option value="Productos">Productos</option>
                  <option value="Pedidos">Pedidos</option>
                  <option value="Facturación">Facturación / Boletas</option>
                  <option value="Clientes">Clientes</option>
                  <option value="Ubicaciones">Ubicaciones y Sedes</option>
                  <option value="Calidad">Calidad y Sanidad</option>
                  <option value="Reuniones">Reuniones</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ¿Qué estabas intentando hacer? <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Quise guardar un pedido nuevo o cambiar un precio"
                  value={formBug.queHacia}
                  onChange={(e) => setFormBug({ ...formBug, queHacia: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ¿Qué problema o error pasó? <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Ej: Salió un mensaje de error, o el botón no hizo nada al presionarlo..."
                  value={formBug.descripcion}
                  onChange={(e) => setFormBug({ ...formBug, descripcion: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalBug(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviandoBug}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 shadow-md shadow-red-600/20 disabled:opacity-50 cursor-pointer"
                >
                  {enviandoBug ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <span>Enviar reporte</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}