import React from 'react';
import { LayoutDashboard, Package, ShoppingCart, FileText, Calendar, LogOut, Users } from 'lucide-react';

export default function Layout({ usuario, cerrarSesion, vistaActual, setVistaActual, children }) {
  
  const menu = [
    { id: 'dashboard', nombre: 'Inicio', icono: <LayoutDashboard size={20} /> },
    { id: 'stock', nombre: 'Inventario', icono: <Package size={20} /> },
    { id: 'pedidos', nombre: 'Pedidos', icono: <ShoppingCart size={20} /> },
    { id: 'reuniones', nombre: 'Reuniones', icono: <Calendar size={20} /> },
    { id: 'facturacion', nombre: 'Facturación', icono: <FileText size={20} /> },
    ...(usuario.rol === 'Administrador' || usuario.rol === 'Admin Central' 
      ? [{ id: 'usuarios', nombre: 'Personal', icono: <Users size={20} /> }] 
      : []
  )
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      
      {/* menu latwral (Sidebar) */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">Mi ERP</h2>
          <p className="text-xs text-slate-400 mt-1">{usuario.rol}</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {menu.map((item) => (
            <button
              key={item.id}
              onClick={() => setVistaActual(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
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
          <div className="flex items-center justify-between px-2 mb-4">
            <span className="text-sm font-medium text-white truncate pr-4">{usuario.nombre}</span>
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

      {/* contenido principal (lo que cambia a la derecha) */}
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>

    </div>
  );
}