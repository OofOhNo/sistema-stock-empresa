import React, { useState } from 'react';
import api from './api';
import { Lock, Mail, ArrowRight, Eye, EyeOff, HelpCircle, ArrowLeft, CheckCircle2, User, Send } from 'lucide-react';

export default function Login({ onLoginExitoso }) {
  const [modo, setModo] = useState('login'); // 'login' | 'recuperar'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // Estados para "¿Olvidaste tu contraseña?"
  const [identificador, setIdentificador] = useState('');
  const [notaRecuperacion, setNotaRecuperacion] = useState('');
  const [enviandoRecuperacion, setEnviandoRecuperacion] = useState(false);
  const [recuperacionEnviada, setRecuperacionEnviada] = useState(false);
  const [mensajeExitoRecuperacion, setMensajeExitoRecuperacion] = useState('');

  const manejarSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      const respuesta = await api.post('/auth/login', {
        email: email.trim().toLowerCase(),
        password: password
      });

      if (respuesta.data.exito) {
        localStorage.setItem('token_erp', respuesta.data.token);
        localStorage.setItem('usuario_erp', JSON.stringify(respuesta.data.usuario));
        onLoginExitoso(respuesta.data.usuario);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.mensaje || 'No se pudo iniciar sesión. Revisa tu correo y contraseña.');
    } finally {
      setCargando(false);
    }
  };

  const abrirModoRecuperar = () => {
    setError('');
    setRecuperacionEnviada(false);
    setMensajeExitoRecuperacion('');
    if (email.trim() && !identificador.trim()) {
      setIdentificador(email.trim());
    }
    setModo('recuperar');
  };

  const volverALogin = () => {
    setError('');
    setRecuperacionEnviada(false);
    setModo('login');
  };

  const enviarSolicitudRecuperacion = async (e) => {
    e.preventDefault();
    setError('');
    if (!identificador.trim()) {
      setError('Por favor escribe tu correo electrónico o tu nombre completo.');
      return;
    }

    setEnviandoRecuperacion(true);
    try {
      const res = await api.post('/auth/solicitar-recuperacion', {
        identificador: identificador.trim(),
        mensaje: notaRecuperacion.trim()
      });
      setRecuperacionEnviada(true);
      setMensajeExitoRecuperacion(
        res.data?.mensaje ||
        '¡Listo! Ya le enviamos el aviso al encargado de Personal y Roles para que te dé una nueva contraseña.'
      );
    } catch (err) {
      setError(
        err.response?.data?.mensaje ||
        'No se pudo enviar el aviso ahora. Avísale directamente al encargado de Personal y Roles.'
      );
    } finally {
      setEnviandoRecuperacion(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8">
        {modo === 'login' ? (
          <>
            <div className="text-center mb-7">
              <h1 className="text-3xl font-bold !text-white tracking-tight" style={{ color: '#ffffff' }}>Mi ERP</h1>
              <p className="text-slate-300 text-sm mt-2">
                Escribe tu correo y contraseña para entrar
              </p>
            </div>

            {error && (
              <div className="mb-5 bg-red-500/15 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={manejarSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                  Correo electrónico
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail size={18} />
                  </span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@empresa.com"
                    className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock size={18} />
                  </span>
                  <input
                    type={mostrarPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Escribe tu contraseña"
                    className="w-full pl-10 pr-12 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    title={mostrarPassword ? 'Ocultar contraseña' : 'Ver lo que escribiste'}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                  >
                    {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Puedes tocar el ojito de la derecha para revisar que tu contraseña esté bien escrita.
                </p>
              </div>

              <button
                type="submit"
                disabled={cargando}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/30 text-sm disabled:opacity-50 cursor-pointer"
              >
                <span>{cargando ? 'Entrando...' : 'Entrar al Sistema'}</span>
                {!cargando && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-700/80 text-center">
              <button
                type="button"
                onClick={abrirModoRecuperar}
                className="inline-flex items-center justify-center gap-2 text-amber-300 hover:text-amber-200 text-sm font-semibold hover:underline cursor-pointer"
              >
                <HelpCircle size={16} />
                <span>¿Olvidaste tu contraseña? Haz clic aquí</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={volverALogin}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-semibold mb-5 cursor-pointer"
            >
              <ArrowLeft size={15} />
              <span>Volver para iniciar sesión</span>
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold !text-white" style={{ color: '#ffffff' }}>¿Olvidaste tu contraseña?</h2>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">
                No te preocupes. Escribe abajo tu correo o tu nombre completo y le enviaremos un aviso al encargado de <strong>Personal y Roles</strong> para que te ponga una contraseña nueva.
              </p>
            </div>

            {error && (
              <div className="mb-4 bg-red-500/15 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {recuperacionEnviada ? (
              <div className="space-y-5">
                <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-2xl p-5 text-center space-y-2">
                  <CheckCircle2 size={38} className="text-emerald-400 mx-auto" />
                  <h3 className="text-base font-bold !text-white" style={{ color: '#ffffff' }}>¡Aviso enviado con éxito!</h3>
                  <p className="text-sm text-emerald-200 leading-relaxed">
                    {mensajeExitoRecuperacion}
                  </p>
                  <p className="text-xs text-slate-300 pt-1">
                    Cuando el encargado te diga tu nueva contraseña, vuelve aquí para entrar.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={volverALogin}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all text-sm cursor-pointer"
                >
                  Volver a Iniciar Sesión
                </button>
              </div>
            ) : (
              <form onSubmit={enviarSolicitudRecuperacion} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                    Tu correo o tu nombre completo *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User size={18} />
                    </span>
                    <input
                      type="text"
                      required
                      value={identificador}
                      onChange={(e) => setIdentificador(e.target.value)}
                      placeholder="Ej: juan@empresa.com o Juan Pérez"
                      className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
                    Mensaje adicional <span className="text-slate-400 font-normal normal-case">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={notaRecuperacion}
                    onChange={(e) => setNotaRecuperacion(e.target.value)}
                    placeholder="Ej: Soy de Planta Norte, avísenme al WhatsApp"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={enviandoRecuperacion}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg text-sm disabled:opacity-50 cursor-pointer"
                >
                  <Send size={17} />
                  <span>{enviandoRecuperacion ? 'Enviando aviso...' : 'Pedir que restablezcan mi contraseña'}</span>
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
