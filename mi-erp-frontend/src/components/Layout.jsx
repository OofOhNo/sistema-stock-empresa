import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, FileText, Calendar, 
  LogOut, Users, MapPin, Building2, Truck, Clock 
} from 'lucide-react';

export default function Layout({ usuario, cerrarSesion, vistaActual, setVistaActual, children }) {
  const [horaActual, setHoraActual] = useState(new Date());

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
  
  const menu = [
    { id: 'dashboard', nombre: 'Inicio', icono: <LayoutDashboard size={20} /> },
    { id: 'stock', nombre: 'Inventario', icono: <Package size={20} /> },
    { id: 'productos', nombre: 'Productos', icono: <Package size={20} /> },
    { id: 'clientes', nombre: 'Clientes', icono: <Building2 size={20} /> },
    { id: 'pedidos', nombre: 'Pedidos', icono: <ShoppingCart size={20} /> },
    { id: 'despacho', nombre: 'Listos para Despacho', icono: <Truck size={20} /> },
    { id: 'reuniones', nombre: 'Reuniones', icono: <Calendar size={20} /> },
    { id: 'facturacion', nombre: 'Facturación', icono: <FileText size={20} /> },
    ...(usuario.rol === 'Administrador' || usuario.rol === 'Admin Central' 
      ? [
          { id: 'usuarios', nombre: 'Personal', icono: <Users size={20} /> },
          { id: 'ubicaciones', nombre: 'Ubicaciones', icono: <MapPin size={20} /> }
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

      {/* CONTENIDO PRINCIPAL CON BARRA SUPERIOR (Reloj digital en vivo) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* BARRA SUPERIOR CON RELOJ */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Módulo Activo:</span>
            <span className="text-sm font-bold text-slate-800 capitalize">
              {menu.find(m => m.id === vistaActual)?.nombre || 'ERP'}
            </span>
          </div>

          {/* RELOJ CON REGLA HORARIA (Administración vs Producción) */}
          <div className="flex items-center space-x-3 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-xs border border-slate-800">
            <Clock size={16} className={esProduccion ? "text-amber-400 animate-pulse" : "text-indigo-400"} />
            <div className="flex items-baseline space-x-2">
              <span className="font-mono font-bold text-base tracking-wide text-white">{horaStr}</span>
              <span className="text-xs text-slate-400 capitalize hidden sm:inline">{fechaStr}</span>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              esProduccion 
                ? "bg-amber-400/20 text-amber-300 border-amber-400/30" 
                : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
            }`}>
              {esProduccion ? "Producción (-1h)" : "Administración (Hora Real)"}
            </span>
          </div>
        </header>

        {/* ÁREA DE CONTENIDO */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>

      </div>

    </div>
  );
}