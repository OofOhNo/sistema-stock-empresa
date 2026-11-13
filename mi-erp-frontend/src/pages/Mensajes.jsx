import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import {
  MessageSquare, Send, Search, Eye, Lock,
  CheckCheck, Check, ArrowLeft
} from 'lucide-react';

export default function Mensajes({ usuario }) {
  // SOLO Admin Central puede ver la pestaña de supervisión silenciosa.
  // Todos los demás empleados ven únicamente su chat normal con compañeros.
  const esAdminCentral = usuario?.rol === 'Admin Central';

  const [tabActual, setTabActual] = useState('chat'); // 'chat' | 'supervision'

  // Estados para Chat Personal
  const [contactos, setContactos] = useState([]);
  const [contactoActivo, setContactoActivo] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [busquedaContacto, setBusquedaContacto] = useState('');
  const [cargandoChat, setCargandoChat] = useState(false);

  // Estados para Supervisión Silenciosa (exclusivo Admin Central)
  const [paresSupervision, setParesSupervision] = useState([]);
  const [parActivo, setParActivo] = useState(null);
  const [mensajesSupervision, setMensajesSupervision] = useState([]);
  const [cargandoSupervision, setCargandoSupervision] = useState(false);
  const [busquedaPar, setBusquedaPar] = useState('');

  const chatScrollRef = useRef(null);
  const supervisionScrollRef = useRef(null);
  const yaSeleccionoContactoRef = useRef(false);
  const yaSeleccionoParRef = useRef(false);

  const cargarContactosSilencioso = useCallback(async () => {
    try {
      const res = await api.get('/mensajes/contactos');
      setContactos(res.data.datos || []);
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const cargarContactos = useCallback(async () => {
    try {
      const res = await api.get('/mensajes/contactos');
      const list = res.data.datos || [];
      setContactos(list);
      if (list.length > 0 && !yaSeleccionoContactoRef.current) {
        yaSeleccionoContactoRef.current = true;
        setContactoActivo(list[0]);
      }
    } catch (err) {
      console.error('Error al cargar contactos:', err);
    }
  }, []);

  const cargarHistorialChat = useCallback(async (idOtro) => {
    setCargandoChat(true);
    try {
      const res = await api.get(`/mensajes/chat/${idOtro}`);
      setMensajesChat(res.data.datos || []);
      cargarContactosSilencioso();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      toast.error('No se pudo cargar la conversación.');
    } finally {
      setCargandoChat(false);
    }
  }, [cargarContactosSilencioso]);

  const cargarHistorialSilencioso = useCallback(async (idOtro) => {
    try {
      const res = await api.get(`/mensajes/chat/${idOtro}`);
      setMensajesChat(res.data.datos || []);
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const seleccionarParSupervision = useCallback(async (par) => {
    setParActivo(par);
    try {
      const res = await api.get(`/mensajes/supervision/${par.u1_id}/${par.u2_id}`);
      setMensajesSupervision(res.data.datos || []);
    } catch {
      toast.error('No se pudo abrir la conversación seleccionada.');
    }
  }, []);

  const cargarParesSupervision = useCallback(async () => {
    if (!esAdminCentral) return;
    setCargandoSupervision(true);
    try {
      const res = await api.get('/mensajes/supervision');
      const pares = res.data.datos || [];
      setParesSupervision(pares);
      if (pares.length > 0 && !yaSeleccionoParRef.current) {
        yaSeleccionoParRef.current = true;
        seleccionarParSupervision(pares[0]);
      }
    } catch {
      toast.error('No se pudo cargar la lista de conversaciones.');
    } finally {
      setCargandoSupervision(false);
    }
  }, [esAdminCentral, seleccionarParSupervision]);

  const cargarChatSupervisionSilencioso = useCallback(async (u1, u2) => {
    try {
      const res = await api.get(`/mensajes/supervision/${u1}/${u2}`);
      setMensajesSupervision(res.data.datos || []);
    } catch {
      /* silencioso en polling */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    if (!esAdminCentral && tabActual !== 'chat') {
      Promise.resolve().then(() => {
        if (alive) setTabActual('chat');
      });
    }
    return () => {
      alive = false;
    };
  }, [esAdminCentral, tabActual]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarContactos();
    });
    const interval = setInterval(() => {
      void cargarContactosSilencioso();
    }, 4500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [cargarContactos, cargarContactosSilencioso]);

  useEffect(() => {
    let alive = true;
    if (contactoActivo && tabActual === 'chat') {
      Promise.resolve().then(() => {
        if (alive) void cargarHistorialChat(contactoActivo.id_usuario);
      });
    }
    return () => {
      alive = false;
    };
  }, [contactoActivo, tabActual, cargarHistorialChat]);

  useEffect(() => {
    if (!contactoActivo || tabActual !== 'chat') return;
    const interval = setInterval(() => {
      void cargarHistorialSilencioso(contactoActivo.id_usuario);
    }, 3500);
    return () => clearInterval(interval);
  }, [contactoActivo, tabActual, cargarHistorialSilencioso]);

  useEffect(() => {
    let alive = true;
    if (tabActual === 'supervision' && esAdminCentral) {
      Promise.resolve().then(() => {
        if (alive) void cargarParesSupervision();
      });
    }
    return () => {
      alive = false;
    };
  }, [tabActual, esAdminCentral, cargarParesSupervision]);

  useEffect(() => {
    if (tabActual !== 'supervision' || !esAdminCentral || !parActivo) return;
    const interval = setInterval(() => {
      void cargarChatSupervisionSilencioso(parActivo.u1_id, parActivo.u2_id);
    }, 4500);
    return () => clearInterval(interval);
  }, [parActivo, tabActual, esAdminCentral, cargarChatSupervisionSilencioso]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [mensajesChat]);

  useEffect(() => {
    if (supervisionScrollRef.current) {
      supervisionScrollRef.current.scrollTop = supervisionScrollRef.current.scrollHeight;
    }
  }, [mensajesSupervision]);

  const handleEnviarMensaje = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !contactoActivo) return;

    const texto = nuevoMensaje.trim();
    setNuevoMensaje('');
    setEnviando(true);
    try {
      const res = await api.post('/mensajes', {
        id_receptor: contactoActivo.id_usuario,
        mensaje: texto
      });
      if (res.data.exito && res.data.datos) {
        setMensajesChat(prev => [...prev, res.data.datos]);
        cargarContactosSilencioso();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo enviar el mensaje.');
      setNuevoMensaje(texto);
    } finally {
      setEnviando(false);
    }
  };

  const formatearHoraMensaje = (fechaISO) => {
    if (!fechaISO) return '';
    const d = new Date(fechaISO);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const contactosFiltrados = contactos.filter(c => {
    if (!busquedaContacto.trim()) return true;
    const q = busquedaContacto.toLowerCase();
    return (
      (c.nombre_completo || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.nombre_rol || '').toLowerCase().includes(q) ||
      (c.nombre_ubicacion || '').toLowerCase().includes(q)
    );
  });

  const paresFiltrados = paresSupervision.filter(p => {
    if (!busquedaPar.trim()) return true;
    const q = busquedaPar.toLowerCase();
    return (
      (p.u1_nombre || '').toLowerCase().includes(q) ||
      (p.u2_nombre || '').toLowerCase().includes(q) ||
      (p.ultimo_mensaje || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 h-[calc(100dvh-130px)] md:h-[calc(100dvh-115px)] flex flex-col">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-blue-950">Mensajes Internos</h1>
            <p className="text-xs text-slate-500">Escribe y responde mensajes directos con tus compañeros de trabajo</p>
          </div>
        </div>

        {/* Pestañas visibles ÚNICAMENTE para Admin Central */}
        {esAdminCentral && (
          <div className="flex space-x-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setTabActual('chat')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                tabActual === 'chat' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare size={14} />
              <span>Mis Mensajes</span>
            </button>
            <button
              onClick={() => setTabActual('supervision')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                tabActual === 'supervision' ? 'bg-slate-900 text-amber-300 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={14} className="text-amber-400" />
              <span>Supervisión de Personal</span>
            </button>
          </div>
        )}
      </div>

      {/* VISTA 1: CHAT PERSONAL ENTRE COMPAÑEROS */}
      {tabActual === 'chat' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex min-h-0">
          {/* LISTA DE COMPAÑEROS */}
          <div className={`${contactoActivo ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-200 flex-col shrink-0 bg-slate-50/50`}>
            <div className="p-3 border-b border-slate-200 bg-white">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar compañero por nombre o sede..."
                  value={busquedaContacto}
                  onChange={(e) => setBusquedaContacto(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-100 rounded-xl text-xs border border-transparent focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {contactosFiltrados.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No se encontraron compañeros con ese nombre.
                </div>
              ) : (
                contactosFiltrados.map((c) => {
                  const esActivo = contactoActivo?.id_usuario === c.id_usuario;
                  return (
                    <button
                      key={c.id_usuario}
                      onClick={() => setContactoActivo(c)}
                      className={`w-full p-3.5 text-left flex items-start space-x-3 transition-colors cursor-pointer ${
                        esActivo ? 'bg-indigo-50/80 border-r-2 border-indigo-600' : 'hover:bg-white'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs shadow-xs">
                          {(c.nombre_completo || 'U').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        {Number(c.no_leidos) > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                            {c.no_leidos}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-800 truncate">{c.nombre_completo}</p>
                          {c.fecha_ultimo_mensaje && (
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                              {formatearHoraMensaje(c.fecha_ultimo_mensaje)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5 truncate">
                          <span>{c.nombre_rol}</span>
                          {c.nombre_ubicacion && (
                            <>
                              <span>·</span>
                              <span>{c.nombre_ubicacion}</span>
                            </>
                          )}
                        </p>
                        {c.ultimo_mensaje && (
                          <p className="text-xs text-slate-600 mt-1 truncate">
                            {c.ultimo_emisor === usuario.id_usuario && <span className="text-slate-400">Tú: </span>}
                            {c.ultimo_mensaje}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CONVERSACIÓN ACTIVA */}
          <div className={`${contactoActivo ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 bg-white`}>
            {contactoActivo ? (
              <>
                <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                  <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setContactoActivo(null)}
                      className="md:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                      aria-label="Volver a lista de contactos"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0">
                      {(contactoActivo.nombre_completo || 'U').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">
                        {contactoActivo.nombre_completo}
                      </h3>
                      <p className="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-0.5">
                        <span className="font-semibold text-indigo-700">{contactoActivo.nombre_rol}</span>
                        <span>·</span>
                        <span>{contactoActivo.nombre_ubicacion || 'Sede'}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
                  {cargandoChat ? (
                    <div className="flex items-center justify-center h-full text-xs text-slate-400">
                      Cargando conversación...
                    </div>
                  ) : mensajesChat.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
                      <MessageSquare size={36} className="text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-600">Todavía no tienes mensajes con {contactoActivo.nombre_completo}.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Escribe abajo y presiona Enviar para conversar.</p>
                    </div>
                  ) : (
                    mensajesChat.map((m) => {
                      const soyEmisor = m.id_emisor === usuario.id_usuario;
                      return (
                        <div key={m.id_mensaje} className={`flex ${soyEmisor ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl p-3 shadow-xs text-xs leading-relaxed ${
                            soyEmisor
                              ? 'bg-indigo-600 text-white rounded-br-xs'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                          }`}>
                            <p className="whitespace-pre-wrap break-words">{m.mensaje}</p>
                            <div className={`flex items-center justify-end space-x-1 mt-1 text-[10px] font-mono ${
                              soyEmisor ? 'text-indigo-200' : 'text-slate-400'
                            }`}>
                              <span>{formatearHoraMensaje(m.creado_en)}</span>
                              {soyEmisor && (
                                m.leido ? <CheckCheck size={13} className="text-indigo-200" /> : <Check size={13} className="text-indigo-300" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleEnviarMensaje} className="p-3 border-t border-slate-200 bg-white shrink-0 flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder={`Escribe un mensaje para ${(contactoActivo.nombre_completo || '').split(' ')[0]}...`}
                    value={nuevoMensaje}
                    onChange={(e) => setNuevoMensaje(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={enviando || !nuevoMensaje.trim()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Send size={15} />
                    <span>Enviar</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <MessageSquare size={48} className="text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-600">Elige un compañero de la lista izquierda</p>
                <p className="text-xs text-slate-400 mt-1">Podrás enviarle mensajes directos al instante</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VISTA 2: SUPERVISIÓN SILENCIOSA (EXCLUSIVO ADMIN CENTRAL) */}
      {tabActual === 'supervision' && esAdminCentral && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col min-h-0">
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 px-4 flex items-center justify-between text-xs text-amber-950 shrink-0">
            <div className="flex items-center space-x-2">
              <Lock size={15} className="text-amber-700 shrink-0" />
              <span>
                <strong>Modo Supervisión Silenciosa (Solo Admin Central):</strong> Puedes leer las conversaciones entre empleados sin que les aparezca ningún aviso ni cambie el estado de lectura.
              </span>
            </div>
          </div>

          <div className="flex-1 flex min-h-0">
            <div className={`${parActivo ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-200 flex-col shrink-0 bg-slate-50/50`}>
              <div className="p-3 border-b border-slate-200 bg-white">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre de empleado..."
                    value={busquedaPar}
                    onChange={(e) => setBusquedaPar(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-100 rounded-xl text-xs border border-transparent focus:bg-white focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {cargandoSupervision ? (
                  <div className="p-6 text-center text-xs text-slate-400">Cargando conversaciones...</div>
                ) : paresFiltrados.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Todavía no hay conversaciones registradas entre empleados.
                  </div>
                ) : (
                  paresFiltrados.map((p, idx) => {
                    const esActivo = parActivo?.u1_id === p.u1_id && parActivo?.u2_id === p.u2_id;
                    return (
                      <button
                        key={idx}
                        onClick={() => seleccionarParSupervision(p)}
                        className={`w-full p-3.5 text-left transition-colors cursor-pointer ${
                          esActivo ? 'bg-amber-50/80 border-r-2 border-amber-600' : 'hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                            {p.total_mensajes} mensajes
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatearHoraMensaje(p.ultima_fecha)}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {p.u1_nombre} <span className="text-amber-600 font-black">↔</span> {p.u2_nombre}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {p.u1_rol} y {p.u2_rol}
                        </p>
                        {p.ultimo_mensaje && (
                          <p className="text-xs text-slate-600 mt-1 italic truncate">
                            "{p.ultimo_mensaje}"
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className={`${parActivo ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 bg-white`}>
              {parActivo ? (
                <>
                  <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => setParActivo(null)}
                        className="md:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-slate-200/70 flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label="Volver a conversaciones"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex flex-wrap items-center gap-1.5">
                        <Eye size={15} className="text-amber-600" />
                        <span>Conversación entre:</span>
                        <span className="text-indigo-700 font-bold">{parActivo.u1_nombre}</span>
                        <span className="text-slate-400 font-normal">y</span>
                        <span className="text-indigo-700 font-bold">{parActivo.u2_nombre}</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {parActivo.total_mensajes} mensajes · Vista silenciosa de Admin Central
                      </p>
                      </div>
                    </div>
                  </div>

                  <div ref={supervisionScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                    {mensajesSupervision.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 p-8">No hay mensajes en esta charla.</div>
                    ) : (
                      mensajesSupervision.map((m) => {
                        const esU1 = m.id_emisor === parActivo.u1_id;
                        return (
                          <div key={m.id_mensaje} className={`flex ${esU1 ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[75%] rounded-2xl p-3 shadow-xs text-xs leading-relaxed border ${
                              esU1
                                ? 'bg-white border-slate-200 text-slate-800'
                                : 'bg-slate-800 text-white border-slate-700'
                            }`}>
                              <div className="flex items-center justify-between gap-3 border-b pb-1 mb-1 border-current/15">
                                <span className="font-bold text-[11px]">{m.nombre_emisor}</span>
                                <span className="text-[10px] opacity-70 font-mono">{formatearHoraMensaje(m.creado_en)}</span>
                              </div>
                              <p className="whitespace-pre-wrap break-words">{m.mensaje}</p>
                              <div className="mt-1 text-[9px] opacity-60 flex justify-end">
                                <span>{m.leido ? '✓✓ Leído' : '✓ Enviado'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="p-3 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-500 shrink-0 flex items-center justify-center space-x-1.5">
                    <Lock size={13} className="text-slate-400" />
                    <span>Vista de solo lectura para supervisión.</span>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <Eye size={48} className="text-slate-200 mb-3" />
                  <p className="text-sm font-semibold text-slate-600">Elige una conversación de la lista izquierda</p>
                  <p className="text-xs text-slate-400 mt-1">Aquí verás todos los mensajes intercambiados entre ambos empleados</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
