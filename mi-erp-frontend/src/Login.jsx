import React, { useState } from 'react';
import api from './api';
import { Lock, Mail, ArrowRight } from 'lucide-react';

export default function Login({ onLoginExitoso }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const manejarSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      //llamamos al backend de Node.js
      const respuesta = await api.post('/auth/login', { 
        email: email.trim().toLowerCase(), 
        password: password.trim() 
      });
      
      if (respuesta.data.exito) {
        //guardamos el token en el almacenamiento local del navegador
        localStorage.setItem('token_erp', respuesta.data.token);
        localStorage.setItem('usuario_erp', JSON.stringify(respuesta.data.usuario));
        
        //notificamos a la aplicacion principal que entramos
        onLoginExitoso(respuesta.data.usuario);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.mensaje || 'Ocurrió un error al iniciar sesión.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Mi ERP</h1>
          <p className="text-slate-400 text-sm mt-2">Ingresa tus credenciales para acceder al sistema</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={manejarSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Correo Electrónico</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Mail size={18} />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jefe@empresa.com"
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Contraseña</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock size={18} />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30 text-sm disabled:opacity-50"
          >
            <span>{cargando ? 'Verificando...' : 'Iniciar Sesión'}</span>
            {!cargando && <ArrowRight size={18} />}
          </button>
        </form>

      </div>
    </div>
  );
}