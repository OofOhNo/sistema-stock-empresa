import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import {
  MessageSquare, Send, Search, Eye, Lock,
  CheckCheck, Check, ArrowLeft, Phone,
  QrCode, Wifi, RefreshCw, X, Loader2,
  Users, UserPlus, UserMinus, Shield, LogOut,
  Trash2, Plus, Edit2
} from 'lucide-react';
import { normalizarNumeroWhatsApp } from '../utils/whatsapp';

const COLORES_EMISOR_GRUPO = [
  'text-emerald-700',
  'text-indigo-700',
  'text-amber-700',
  'text-rose-700',
  'text-sky-700',
  'text-violet-700'
];

function colorEmisorGrupo(idUsuario) {
  const idx = Math.abs(Number(idUsuario) || 0) % COLORES_EMISOR_GRUPO.length;
  return COLORES_EMISOR_GRUPO[idx];
}

export default function Mensajes({ usuario }) {
  // SOLO Admin Central puede ver la pestaña de supervisión silenciosa.
  // Todos los demás empleados ven únicamente sus chats y grupos.
  const esAdminCentral = usuario?.rol === 'Admin Central';

  const [tabActual, setTabActual] = useState('chat'); // 'chat' | 'supervision'

  // Estados para Chat Personal y Grupos
  const [contactos, setContactos] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [filtroSidebar, setFiltroSidebar] = useState('TODOS'); // 'TODOS' | 'CONTACTOS' | 'GRUPOS'
  const [contactoActivo, setContactoActivo] = useState(null);
  const [grupoActivo, setGrupoActivo] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [mensajesGrupo, setMensajesGrupo] = useState([]);
  // Borradores independientes por conversación ("chat:ID" o "grupo:ID") para nunca mezclarse al cambiar de chat
  const [borradores, setBorradores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [busquedaContacto, setBusquedaContacto] = useState('');
  const [cargandoChat, setCargandoChat] = useState(false);

  // Modales de Grupos tipo WhatsApp
  const [modalCrearGrupo, setModalCrearGrupo] = useState(false);
  const [formNuevoGrupo, setFormNuevoGrupo] = useState({ nombre: '', descripcion: '', miembros: [] });
  const [busquedaMiembroNuevo, setBusquedaMiembroNuevo] = useState('');
  const [guardandoGrupo, setGuardandoGrupo] = useState(false);

  const [modalInfoGrupo, setModalInfoGrupo] = useState(false);
  const [detalleGrupo, setDetalleGrupo] = useState(null);
  const [editandoGrupoMeta, setEditandoGrupoMeta] = useState(false);
  const [formEditarGrupo, setFormEditarGrupo] = useState({ nombre: '', descripcion: '' });
  const [miembrosAgregar, setMiembrosAgregar] = useState([]);
  const [busquedaAgregarMiembro, setBusquedaAgregarMiembro] = useState('');
  const [procesandoGrupoAccion, setProcesandoGrupoAccion] = useState(false);

  // Estado del puente WhatsApp QR personal por usuario
  const [estadoWhatsapp, setEstadoWhatsapp] = useState({
    estado: 'DESCONECTADO',
    conectado: false,
    numero: '',
    nombre: '',
    ultimo_error: '',
    qr_data_url: null
  });
  const [modalWhatsapp, setModalWhatsapp] = useState(false);
  const [cargandoQrWa, setCargandoQrWa] = useState(false);
  const [desconectandoWa, setDesconectandoWa] = useState(false);

  // Estados para Supervisión Silenciosa (exclusivo Admin Central)
  const [paresSupervision, setParesSupervision] = useState([]);
  const [gruposSupervision, setGruposSupervision] = useState([]);
  const [parActivo, setParActivo] = useState(null);
  const [grupoSupActivo, setGrupoSupActivo] = useState(null);
  const [mensajesSupervision, setMensajesSupervision] = useState([]);
  const [cargandoSupervision, setCargandoSupervision] = useState(false);
  const [busquedaPar, setBusquedaPar] = useState('');

  const chatScrollRef = useRef(null);
  const supervisionScrollRef = useRef(null);
  const yaSeleccionoInicialRef = useRef(false);
  const yaSeleccionoSupRef = useRef(false);
  const claveActivaRef = useRef(null);
  const supActivaRef = useRef(null);
  const ultimoScrollChatSigRef = useRef('');
  const ultimoScrollSupSigRef = useRef('');
  const [sincronizandoWaGrupo, setSincronizandoWaGrupo] = useState(false);

  const idContactoActivo = contactoActivo?.id_usuario ?? null;
  const idGrupoActivo = grupoActivo?.id_grupo ?? null;
  const parU1 = parActivo?.u1_id ?? null;
  const parU2 = parActivo?.u2_id ?? null;
  const idGrupoSup = grupoSupActivo?.id_grupo ?? null;

  const claveChatActivo = idGrupoActivo
    ? `grupo:${idGrupoActivo}`
    : idContactoActivo
    ? `chat:${idContactoActivo}`
    : null;
  const claveSupActiva = idGrupoSup
    ? `sup-grupo:${idGrupoSup}`
    : parU1 && parU2
    ? `sup-par:${parU1}-${parU2}`
    : null;

  useEffect(() => {
    claveActivaRef.current = claveChatActivo;
  }, [claveChatActivo]);

  useEffect(() => {
    supActivaRef.current = claveSupActiva;
  }, [claveSupActiva]);

  const nuevoMensaje = claveChatActivo ? (borradores[claveChatActivo] || '') : '';

  const setBorrador = (clave, valor) => {
    if (!clave) return;
    setBorradores(prev => ({ ...prev, [clave]: valor }));
  };

  const cargarListasSilencioso = useCallback(async () => {
    try {
      const [resCont, resGrup] = await Promise.all([
        api.get('/mensajes/contactos'),
        api.get('/mensajes/grupos').catch(() => ({ data: { datos: [] } }))
      ]);
      const listaCont = resCont.data?.datos || [];
      const listaGrup = resGrup.data?.datos || [];
      setContactos(listaCont);
      setGrupos(listaGrup);
      setGrupoActivo(prev => {
        if (!prev) return prev;
        const actual = listaGrup.find(g => g.id_grupo === prev.id_grupo);
        if (!actual) return null;
        const mismosMiembros =
          (prev.miembros || []).length === (actual.miembros || []).length &&
          (prev.miembros || []).every((m, idx) => {
            const a = actual.miembros[idx];
            return (
              a &&
              m.id_usuario === a.id_usuario &&
              m.rol_grupo === a.rol_grupo &&
              m.telefono_whatsapp === a.telefono_whatsapp &&
              m.nombre_completo === a.nombre_completo
            );
          });
        const sinCambiosMeta =
          prev.nombre === actual.nombre &&
          prev.descripcion === actual.descripcion &&
          prev.whatsapp_group_jid === actual.whatsapp_group_jid &&
          prev.total_miembros === actual.total_miembros &&
          prev.mi_rol === actual.mi_rol &&
          mismosMiembros;
        return sinCambiosMeta ? prev : actual;
      });
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const cargarListasInicial = useCallback(async () => {
    try {
      const [resCont, resGrup] = await Promise.all([
        api.get('/mensajes/contactos'),
        api.get('/mensajes/grupos').catch(() => ({ data: { datos: [] } }))
      ]);
      const listaCont = resCont.data?.datos || [];
      const listaGrup = resGrup.data?.datos || [];
      setContactos(listaCont);
      setGrupos(listaGrup);
      if (!yaSeleccionoInicialRef.current) {
        yaSeleccionoInicialRef.current = true;
        if (listaCont.length > 0) {
          claveActivaRef.current = `chat:${listaCont[0].id_usuario}`;
          setContactoActivo(listaCont[0]);
        } else if (listaGrup.length > 0) {
          claveActivaRef.current = `grupo:${listaGrup[0].id_grupo}`;
          setGrupoActivo(listaGrup[0]);
        }
      }
    } catch (err) {
      console.error('Error al cargar chats y grupos:', err);
    }
  }, []);

  const cargarHistorialChat = useCallback(async (idOtro) => {
    const claveEsperada = `chat:${idOtro}`;
    setCargandoChat(true);
    try {
      const res = await api.get(`/mensajes/chat/${idOtro}`);
      if (claveActivaRef.current !== claveEsperada) return;
      setMensajesChat(res.data.datos || []);
      void cargarListasSilencioso();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      if (claveActivaRef.current === claveEsperada) {
        toast.error('No se pudo cargar la conversación.');
      }
    } finally {
      if (claveActivaRef.current === claveEsperada) {
        setCargandoChat(false);
      }
    }
  }, [cargarListasSilencioso]);

  const cargarHistorialSilencioso = useCallback(async (idOtro) => {
    const claveEsperada = `chat:${idOtro}`;
    try {
      const res = await api.get(`/mensajes/chat/${idOtro}`);
      if (claveActivaRef.current !== claveEsperada) return;
      setMensajesChat(res.data.datos || []);
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const cargarHistorialGrupo = useCallback(async (idGrupo) => {
    const claveEsperada = `grupo:${idGrupo}`;
    setCargandoChat(true);
    try {
      const res = await api.get(`/mensajes/grupos/${idGrupo}/mensajes`);
      if (claveActivaRef.current !== claveEsperada) return;
      setMensajesGrupo(res.data?.datos || []);
      void cargarListasSilencioso();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      if (claveActivaRef.current === claveEsperada) {
        toast.error('No se pudieron cargar los mensajes del grupo.');
      }
    } finally {
      if (claveActivaRef.current === claveEsperada) {
        setCargandoChat(false);
      }
    }
  }, [cargarListasSilencioso]);

  const cargarHistorialGrupoSilencioso = useCallback(async (idGrupo) => {
    const claveEsperada = `grupo:${idGrupo}`;
    try {
      const res = await api.get(`/mensajes/grupos/${idGrupo}/mensajes`);
      if (claveActivaRef.current !== claveEsperada) return;
      setMensajesGrupo(res.data?.datos || []);
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const seleccionarParSupervision = useCallback(async (par) => {
    const claveEsp = `sup-par:${par.u1_id}-${par.u2_id}`;
    supActivaRef.current = claveEsp;
    setGrupoSupActivo(null);
    setParActivo(par);
    try {
      const res = await api.get(`/mensajes/supervision/${par.u1_id}/${par.u2_id}`);
      if (supActivaRef.current === claveEsp) {
        setMensajesSupervision(res.data.datos || []);
      }
    } catch {
      if (supActivaRef.current === claveEsp) {
        toast.error('No se pudo abrir la conversación seleccionada.');
      }
    }
  }, []);

  const seleccionarGrupoSupervision = useCallback(async (grupo) => {
    const claveEsp = `sup-grupo:${grupo.id_grupo}`;
    supActivaRef.current = claveEsp;
    setParActivo(null);
    setGrupoSupActivo(grupo);
    try {
      const res = await api.get(`/mensajes/supervision-grupos/${grupo.id_grupo}`);
      if (supActivaRef.current === claveEsp) {
        setMensajesSupervision(res.data?.datos || []);
      }
    } catch {
      if (supActivaRef.current === claveEsp) {
        toast.error('No se pudo abrir el grupo seleccionado.');
      }
    }
  }, []);

  const cargarSupervision = useCallback(async () => {
    if (!esAdminCentral) return;
    setCargandoSupervision(true);
    try {
      const [resPares, resGrupos] = await Promise.all([
        api.get('/mensajes/supervision'),
        api.get('/mensajes/supervision-grupos').catch(() => ({ data: { datos: [] } }))
      ]);
      const pares = resPares.data?.datos || [];
      const gruposLista = resGrupos.data?.datos || [];
      setParesSupervision(pares);
      setGruposSupervision(gruposLista);
      if (!yaSeleccionoSupRef.current) {
        yaSeleccionoSupRef.current = true;
        if (pares.length > 0) {
          void seleccionarParSupervision(pares[0]);
        } else if (gruposLista.length > 0) {
          void seleccionarGrupoSupervision(gruposLista[0]);
        }
      }
    } catch {
      toast.error('No se pudo cargar la lista de conversaciones.');
    } finally {
      setCargandoSupervision(false);
    }
  }, [esAdminCentral, seleccionarParSupervision, seleccionarGrupoSupervision]);

  const cargarChatSupervisionSilencioso = useCallback(async (u1, u2) => {
    const claveEsp = `sup-par:${u1}-${u2}`;
    try {
      const res = await api.get(`/mensajes/supervision/${u1}/${u2}`);
      if (supActivaRef.current === claveEsp) {
        setMensajesSupervision(res.data.datos || []);
      }
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const cargarGrupoSupervisionSilencioso = useCallback(async (idGrupo) => {
    const claveEsp = `sup-grupo:${idGrupo}`;
    try {
      const res = await api.get(`/mensajes/supervision-grupos/${idGrupo}`);
      if (supActivaRef.current === claveEsp) {
        setMensajesSupervision(res.data?.datos || []);
      }
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const cargarEstadoWhatsapp = useCallback(async () => {
    try {
      const res = await api.get('/mensajes/whatsapp/estado');
      if (res.data?.exito) {
        setEstadoWhatsapp(res.data);
      }
    } catch {
      /* silencioso */
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
      if (alive) {
        void cargarListasInicial();
        void cargarEstadoWhatsapp();
      }
    });
    const interval = setInterval(() => {
      void cargarListasSilencioso();
    }, 4500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [cargarListasInicial, cargarListasSilencioso, cargarEstadoWhatsapp]);

  useEffect(() => {
    if (!modalWhatsapp) return undefined;
    const interval = setInterval(() => {
      void cargarEstadoWhatsapp();
    }, 2000);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setModalWhatsapp(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modalWhatsapp, cargarEstadoWhatsapp]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setModalCrearGrupo(false);
        setModalInfoGrupo(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let alive = true;
    if (tabActual === 'chat') {
      if (idGrupoActivo) {
        Promise.resolve().then(() => {
          if (alive) void cargarHistorialGrupo(idGrupoActivo);
        });
      } else if (idContactoActivo) {
        Promise.resolve().then(() => {
          if (alive) void cargarHistorialChat(idContactoActivo);
        });
      }
    }
    return () => {
      alive = false;
    };
  }, [idContactoActivo, idGrupoActivo, tabActual, cargarHistorialChat, cargarHistorialGrupo]);

  useEffect(() => {
    if (tabActual !== 'chat') return undefined;
    if (idGrupoActivo) {
      const interval = setInterval(() => {
        void cargarHistorialGrupoSilencioso(idGrupoActivo);
      }, 3500);
      return () => clearInterval(interval);
    }
    if (idContactoActivo) {
      const interval = setInterval(() => {
        void cargarHistorialSilencioso(idContactoActivo);
      }, 3500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [idContactoActivo, idGrupoActivo, tabActual, cargarHistorialSilencioso, cargarHistorialGrupoSilencioso]);

  useEffect(() => {
    let alive = true;
    if (tabActual === 'supervision' && esAdminCentral) {
      Promise.resolve().then(() => {
        if (alive) void cargarSupervision();
      });
    }
    return () => {
      alive = false;
    };
  }, [tabActual, esAdminCentral, cargarSupervision]);

  useEffect(() => {
    if (tabActual !== 'supervision' || !esAdminCentral) return undefined;
    if (parU1 && parU2) {
      const interval = setInterval(() => {
        void cargarChatSupervisionSilencioso(parU1, parU2);
      }, 4500);
      return () => clearInterval(interval);
    }
    if (idGrupoSup) {
      const interval = setInterval(() => {
        void cargarGrupoSupervisionSilencioso(idGrupoSup);
      }, 4500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [parU1, parU2, idGrupoSup, tabActual, esAdminCentral, cargarChatSupervisionSilencioso, cargarGrupoSupervisionSilencioso]);

  useEffect(() => {
    const lista = idGrupoActivo ? mensajesGrupo : mensajesChat;
    const ultimo = lista[lista.length - 1];
    const sig = `${claveChatActivo || ''}|${lista.length}|${ultimo?.id_mensaje_grupo || ultimo?.id_mensaje || 0}`;
    if (sig !== ultimoScrollChatSigRef.current && chatScrollRef.current) {
      ultimoScrollChatSigRef.current = sig;
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [mensajesChat, mensajesGrupo, claveChatActivo, idGrupoActivo]);

  useEffect(() => {
    const ultimo = mensajesSupervision[mensajesSupervision.length - 1];
    const sig = `${claveSupActiva || ''}|${mensajesSupervision.length}|${ultimo?.id_mensaje_grupo || ultimo?.id_mensaje || 0}`;
    if (sig !== ultimoScrollSupSigRef.current && supervisionScrollRef.current) {
      ultimoScrollSupSigRef.current = sig;
      supervisionScrollRef.current.scrollTop = supervisionScrollRef.current.scrollHeight;
    }
  }, [mensajesSupervision, claveSupActiva]);

  const abrirModalVincularWhatsapp = async () => {
    setModalWhatsapp(true);
    if (estadoWhatsapp.conectado) return;
    setCargandoQrWa(true);
    try {
      const res = await api.post('/mensajes/whatsapp/vincular', { forzar_nuevo_qr: false });
      if (res.data?.exito) {
        setEstadoWhatsapp(res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo iniciar la vinculación de WhatsApp.');
    } finally {
      setCargandoQrWa(false);
    }
  };

  const generarNuevoQrWhatsapp = async () => {
    if (cargandoQrWa) return;
    setCargandoQrWa(true);
    try {
      const res = await api.post('/mensajes/whatsapp/vincular', { forzar_nuevo_qr: true });
      if (res.data?.exito) {
        setEstadoWhatsapp(res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo regenerar el QR de WhatsApp.');
    } finally {
      setCargandoQrWa(false);
    }
  };

  const handleDesconectarWhatsapp = async () => {
    if (desconectandoWa) return;
    if (!window.confirm('¿Desvincular tu cuenta de WhatsApp del ERP? Tendrás que escanear el código QR nuevamente para enviar desde tu número.')) {
      return;
    }
    setDesconectandoWa(true);
    try {
      const res = await api.post('/mensajes/whatsapp/desconectar');
      if (res.data?.exito) {
        setEstadoWhatsapp(res.data);
        toast.success('Tu WhatsApp fue desvinculado correctamente.');
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo desvincular WhatsApp.');
    } finally {
      setDesconectandoWa(false);
    }
  };

  const seleccionarContacto = (c) => {
    claveActivaRef.current = `chat:${c.id_usuario}`;
    setMensajesGrupo([]);
    setGrupoActivo(null);
    setContactoActivo(c);
  };

  const seleccionarGrupo = (g) => {
    claveActivaRef.current = `grupo:${g.id_grupo}`;
    setMensajesChat([]);
    setContactoActivo(null);
    setGrupoActivo(g);
  };

  const enviarTextoInterno = async (texto, receptorId, claveOrigen, enviarWhatsapp = false) => {
    setEnviando(true);
    try {
      const res = await api.post('/mensajes', {
        id_receptor: receptorId,
        mensaje: texto,
        enviar_whatsapp: enviarWhatsapp
      });
      if (res.data.exito && res.data.datos) {
        setMensajesChat(prev => [...prev, res.data.datos]);
        void cargarListasSilencioso();
      }
      if (enviarWhatsapp && res.data?.whatsapp) {
        if (res.data.whatsapp.enviado) {
          toast.success(res.data.whatsapp.mensaje || 'Enviado al chat interno y por WhatsApp.');
        } else {
          toast.error(res.data.whatsapp.mensaje || 'Guardado en el chat, pero no se pudo enviar por WhatsApp.');
          void cargarEstadoWhatsapp();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo enviar el mensaje.');
      setBorrador(claveOrigen, texto);
    } finally {
      setEnviando(false);
    }
  };

  const enviarTextoGrupo = async (texto, idGrupo, claveOrigen, enviarWhatsapp = false) => {
    setEnviando(true);
    try {
      const res = await api.post(`/mensajes/grupos/${idGrupo}/mensajes`, {
        mensaje: texto,
        enviar_whatsapp: enviarWhatsapp
      });
      if (res.data?.exito && res.data?.datos) {
        setMensajesGrupo(prev => [...prev, res.data.datos]);
        const jidNuevo = res.data?.whatsapp?.whatsapp_group_jid;
        if (jidNuevo) {
          setGrupoActivo(prev => (prev && prev.id_grupo === idGrupo ? { ...prev, whatsapp_group_jid: jidNuevo } : prev));
          setDetalleGrupo(prev => (prev && prev.id_grupo === idGrupo ? { ...prev, whatsapp_group_jid: jidNuevo } : prev));
        }
        void cargarListasSilencioso();
      }
      if (enviarWhatsapp && res.data?.whatsapp) {
        if (res.data.whatsapp.enviado) {
          toast.success(res.data.whatsapp.mensaje || 'Enviado al grupo y por WhatsApp.');
        } else {
          toast.error(res.data.whatsapp.mensaje || 'Guardado en el grupo, pero no se pudo enviar por WhatsApp.');
          void cargarEstadoWhatsapp();
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo enviar el mensaje al grupo.');
      setBorrador(claveOrigen, texto);
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarMensaje = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !claveChatActivo || enviando) return;
    const texto = nuevoMensaje.trim();
    const claveOrigen = claveChatActivo;
    setBorrador(claveOrigen, '');

    if (grupoActivo) {
      await enviarTextoGrupo(texto, grupoActivo.id_grupo, claveOrigen, false);
    } else if (contactoActivo) {
      await enviarTextoInterno(texto, contactoActivo.id_usuario, claveOrigen, false);
    }
  };

  const handleEnviarYWhatsApp = async () => {
    if (!claveChatActivo || enviando) return;
    const texto = nuevoMensaje.trim();
    if (!texto) {
      toast.error('Escribe un mensaje antes de enviarlo.');
      return;
    }

    if (grupoActivo) {
      const hayConWa =
        Boolean(grupoActivo.whatsapp_group_jid) ||
        (grupoActivo.miembros || []).some(
          m => Number(m.id_usuario) !== Number(usuario.id_usuario) && Boolean(normalizarNumeroWhatsApp(m.telefono_whatsapp))
        );
      if (!hayConWa) {
        toast.error('Ningún otro integrante de este grupo tiene un número de WhatsApp registrado en Personal y Roles.');
        return;
      }
      const claveOrigen = claveChatActivo;
      setBorrador(claveOrigen, '');
      await enviarTextoGrupo(texto, grupoActivo.id_grupo, claveOrigen, true);
      return;
    }

    if (contactoActivo) {
      const numero = normalizarNumeroWhatsApp(contactoActivo.telefono_whatsapp);
      if (!numero) {
        toast.error('Este compañero aún no tiene un número de WhatsApp registrado en Personal y Roles.');
        return;
      }
      const claveOrigen = claveChatActivo;
      setBorrador(claveOrigen, '');
      await enviarTextoInterno(texto, contactoActivo.id_usuario, claveOrigen, true);
    }
  };

  // Handlers de Creación y Administración de Grupos
  const abrirModalCrearGrupo = () => {
    setFormNuevoGrupo({ nombre: '', descripcion: '', miembros: [] });
    setBusquedaMiembroNuevo('');
    setModalCrearGrupo(true);
  };

  const toggleMiembroNuevoGrupo = (idUsuario) => {
    setFormNuevoGrupo(prev => {
      const existe = prev.miembros.includes(idUsuario);
      return {
        ...prev,
        miembros: existe
          ? prev.miembros.filter(id => id !== idUsuario)
          : [...prev.miembros, idUsuario]
      };
    });
  };

  const handleCrearGrupo = async (e) => {
    e.preventDefault();
    if (!formNuevoGrupo.nombre.trim()) {
      toast.error('Escribe un nombre para el grupo.');
      return;
    }
    if (formNuevoGrupo.miembros.length === 0) {
      toast.error('Selecciona al menos un compañero para crear el grupo.');
      return;
    }

    setGuardandoGrupo(true);
    try {
      const res = await api.post('/mensajes/grupos', {
        nombre: formNuevoGrupo.nombre.trim(),
        descripcion: formNuevoGrupo.descripcion.trim(),
        miembros: formNuevoGrupo.miembros
      });
      const creado = res.data?.datos;
      const waGrupo = res.data?.whatsapp_grupo;
      if (waGrupo?.creado) {
        toast.success('Grupo creado en el ERP y en WhatsApp.');
      } else {
        toast.success(res.data?.mensaje || 'Grupo creado.');
        if (waGrupo?.mensaje && waGrupo?.codigo !== 'WHATSAPP_NO_CONECTADO') {
          toast(waGrupo.mensaje, { icon: 'ℹ️' });
        }
      }
      setModalCrearGrupo(false);
      await cargarListasSilencioso();
      if (creado) {
        seleccionarGrupo(creado);
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo crear el grupo.');
    } finally {
      setGuardandoGrupo(false);
    }
  };

  const handleSincronizarGrupoWhatsapp = async () => {
    if (!detalleGrupo || sincronizandoWaGrupo) return;
    setSincronizandoWaGrupo(true);
    try {
      const res = await api.post(`/mensajes/grupos/${detalleGrupo.id_grupo}/sincronizar-whatsapp`);
      const upd = res.data?.datos;
      if (upd) {
        setDetalleGrupo(upd);
        setGrupoActivo(prev => (prev && prev.id_grupo === upd.id_grupo ? upd : prev));
      }
      if (res.data?.sincronizado) {
        toast.success(res.data?.mensaje || 'Grupo sincronizado con WhatsApp.');
      } else {
        toast.error(res.data?.mensaje || 'No se pudo sincronizar con WhatsApp.');
      }
      void cargarListasSilencioso();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo sincronizar con WhatsApp.');
    } finally {
      setSincronizandoWaGrupo(false);
    }
  };

  const abrirModalInfoGrupo = async () => {
    if (!grupoActivo) return;
    setModalInfoGrupo(true);
    setEditandoGrupoMeta(false);
    setMiembrosAgregar([]);
    setBusquedaAgregarMiembro('');
    try {
      const res = await api.get(`/mensajes/grupos/${grupoActivo.id_grupo}`);
      const det = res.data?.datos;
      if (det) {
        setDetalleGrupo(det);
        setFormEditarGrupo({ nombre: det.nombre || '', descripcion: det.descripcion || '' });
      }
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cargar la información del grupo.');
    }
  };

  const handleGuardarMetaGrupo = async (e) => {
    e.preventDefault();
    if (!detalleGrupo || !formEditarGrupo.nombre.trim()) {
      toast.error('El nombre del grupo es obligatorio.');
      return;
    }
    setProcesandoGrupoAccion(true);
    try {
      const res = await api.put(`/mensajes/grupos/${detalleGrupo.id_grupo}`, {
        nombre: formEditarGrupo.nombre.trim(),
        descripcion: formEditarGrupo.descripcion.trim()
      });
      const upd = res.data?.datos;
      if (upd) {
        setDetalleGrupo(upd);
        setGrupoActivo(upd);
      }
      setEditandoGrupoMeta(false);
      toast.success('Grupo actualizado.');
      void cargarListasSilencioso();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el grupo.');
    } finally {
      setProcesandoGrupoAccion(false);
    }
  };

  const handleAgregarIntegrantes = async () => {
    if (!detalleGrupo || miembrosAgregar.length === 0) return;
    setProcesandoGrupoAccion(true);
    try {
      const res = await api.post(`/mensajes/grupos/${detalleGrupo.id_grupo}/miembros`, {
        miembros: miembrosAgregar
      });
      const upd = res.data?.datos;
      if (upd) {
        setDetalleGrupo(upd);
        setGrupoActivo(upd);
      }
      setMiembrosAgregar([]);
      toast.success('Integrantes agregados al grupo.');
      void cargarListasSilencioso();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudieron agregar integrantes.');
    } finally {
      setProcesandoGrupoAccion(false);
    }
  };

  const handleCambiarRolMiembro = async (miembro) => {
    if (!detalleGrupo) return;
    const nuevoRol = miembro.rol_grupo === 'ADMIN' ? 'MIEMBRO' : 'ADMIN';
    setProcesandoGrupoAccion(true);
    try {
      const res = await api.patch(
        `/mensajes/grupos/${detalleGrupo.id_grupo}/miembros/${miembro.id_usuario}/rol`,
        { rol_grupo: nuevoRol }
      );
      if (res.data?.datos) {
        setDetalleGrupo(res.data.datos);
        setGrupoActivo(res.data.datos);
      }
      toast.success(nuevoRol === 'ADMIN' ? `${miembro.nombre_completo} ahora es admin del grupo.` : 'Rol cambiado a miembro.');
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cambiar el rol.');
    } finally {
      setProcesandoGrupoAccion(false);
    }
  };

  const handleQuitarOSalir = async (idUsuarioObjetivo, nombrePersona = '') => {
    if (!detalleGrupo) return;
    const esYo = Number(idUsuarioObjetivo) === Number(usuario.id_usuario);
    const msgConfirm = esYo
      ? `¿Seguro que quieres salir del grupo "${detalleGrupo.nombre}"?`
      : `¿Quitar a ${nombrePersona} del grupo "${detalleGrupo.nombre}"?`;
    if (!window.confirm(msgConfirm)) return;

    setProcesandoGrupoAccion(true);
    try {
      const res = await api.delete(`/mensajes/grupos/${detalleGrupo.id_grupo}/miembros/${idUsuarioObjetivo}`);
      toast.success(res.data?.mensaje || 'Actualizado.');
      if (esYo || res.data?.eliminado_grupo) {
        setModalInfoGrupo(false);
        setDetalleGrupo(null);
        setGrupoActivo(null);
      } else if (res.data?.grupo) {
        setDetalleGrupo(res.data.grupo);
        setGrupoActivo(res.data.grupo);
      }
      void cargarListasSilencioso();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo actualizar el grupo.');
    } finally {
      setProcesandoGrupoAccion(false);
    }
  };

  const handleEliminarGrupo = async () => {
    if (!detalleGrupo) return;
    if (!window.confirm(`¿Eliminar definitivamente el grupo "${detalleGrupo.nombre}" y todo su historial?`)) return;
    setProcesandoGrupoAccion(true);
    try {
      await api.delete(`/mensajes/grupos/${detalleGrupo.id_grupo}`);
      toast.success('Grupo eliminado.');
      setModalInfoGrupo(false);
      setDetalleGrupo(null);
      setGrupoActivo(null);
      void cargarListasSilencioso();
      window.dispatchEvent(new Event('actualizar_alertas_layout'));
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo eliminar el grupo.');
    } finally {
      setProcesandoGrupoAccion(false);
    }
  };

  const numeroWhatsappActivo = contactoActivo
    ? normalizarNumeroWhatsApp(contactoActivo.telefono_whatsapp)
    : '';

  const grupoTieneWhatsappDestinatarios = grupoActivo
    ? (grupoActivo.miembros || []).some(
        m => Number(m.id_usuario) !== Number(usuario.id_usuario) && Boolean(normalizarNumeroWhatsApp(m.telefono_whatsapp))
      )
    : false;

  const mostrarBotonEnviarWhatsapp =
    Boolean(numeroWhatsappActivo) ||
    grupoTieneWhatsappDestinatarios ||
    Boolean(grupoActivo?.whatsapp_group_jid);

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

  const gruposFiltrados = grupos.filter(g => {
    if (!busquedaContacto.trim()) return true;
    const q = busquedaContacto.toLowerCase();
    return (
      (g.nombre || '').toLowerCase().includes(q) ||
      (g.descripcion || '').toLowerCase().includes(q) ||
      (g.miembros || []).some(m => (m.nombre_completo || '').toLowerCase().includes(q))
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

  const gruposSupFiltrados = gruposSupervision.filter(g => {
    if (!busquedaPar.trim()) return true;
    const q = busquedaPar.toLowerCase();
    return (
      (g.nombre || '').toLowerCase().includes(q) ||
      (g.creador_nombre || '').toLowerCase().includes(q) ||
      (g.ultimo_mensaje || '').toLowerCase().includes(q)
    );
  });

  const esAdminDelGrupoActual = Boolean(
    esAdminCentral ||
    detalleGrupo?.miembros?.some(m => Number(m.id_usuario) === Number(usuario.id_usuario) && m.rol_grupo === 'ADMIN')
  );

  const contactosDisponiblesParaAgregar = detalleGrupo
    ? contactos.filter(c => !(detalleGrupo.miembros || []).some(m => Number(m.id_usuario) === Number(c.id_usuario)))
    : [];

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
            <p className="text-xs text-slate-500">Chats individuales y grupos tipo WhatsApp entre compañeros</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Estado / Configuración personal de WhatsApp QR */}
          <button
            type="button"
            onClick={abrirModalVincularWhatsapp}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
              estadoWhatsapp.conectado
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
            }`}
            title={
              estadoWhatsapp.conectado
                ? `Tu WhatsApp está vinculado (+${estadoWhatsapp.numero || 'activo'}). Haz clic para administrar.`
                : 'Escanea un QR con tu WhatsApp para enviar mensajes directos desde tu número sin salir del ERP'
            }
          >
            {estadoWhatsapp.conectado ? <Wifi size={14} /> : <QrCode size={14} />}
            <span>
              {estadoWhatsapp.conectado
                ? `Mi WhatsApp (+${estadoWhatsapp.numero || 'OK'})`
                : estadoWhatsapp.estado === 'ESPERANDO_QR'
                ? 'Escanear mi QR WhatsApp'
                : 'Vincular mi WhatsApp (QR)'}
            </span>
          </button>

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
      </div>

      {/* VISTA 1: CHAT PERSONAL Y GRUPOS */}
      {tabActual === 'chat' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex min-h-0">
          {/* LISTA DE GRUPOS Y COMPAÑEROS */}
          <div className={`${(contactoActivo || grupoActivo) ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-200 flex-col shrink-0 bg-slate-50/50`}>
            <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar chat o grupo..."
                    value={busquedaContacto}
                    onChange={(e) => setBusquedaContacto(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-100 rounded-xl text-xs border border-transparent focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  onClick={abrirModalCrearGrupo}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
                  title="Crear nuevo grupo tipo WhatsApp"
                >
                  <Plus size={14} />
                  <span>Grupo</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl text-[11px] font-bold">
                {[
                  { id: 'TODOS', label: 'Todos' },
                  { id: 'CONTACTOS', label: `Chats (${contactos.length})` },
                  { id: 'GRUPOS', label: `Grupos (${grupos.length})` }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltroSidebar(f.id)}
                    className={`py-1 rounded-lg transition-colors cursor-pointer ${
                      filtroSidebar === f.id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {/* GRUPOS */}
              {filtroSidebar !== 'CONTACTOS' && gruposFiltrados.map((g) => {
                const esActivo = grupoActivo?.id_grupo === g.id_grupo;
                return (
                  <button
                    key={`grupo-${g.id_grupo}`}
                    onClick={() => seleccionarGrupo(g)}
                    className={`w-full p-3.5 text-left flex items-start space-x-3 transition-colors cursor-pointer ${
                      esActivo ? 'bg-emerald-50/80 border-r-2 border-emerald-600' : 'hover:bg-white'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shadow-xs">
                        <Users size={18} />
                      </div>
                      {Number(g.no_leidos) > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                          {g.no_leidos}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{g.nombre}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          {Boolean(g.whatsapp_group_jid) && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"
                              title="Grupo vinculado a WhatsApp real"
                            >
                              WA
                            </span>
                          )}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {g.total_miembros}
                          </span>
                          {g.fecha_ultimo_mensaje && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatearHoraMensaje(g.fecha_ultimo_mensaje)}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {(g.miembros || []).map(m => (m.nombre_completo || '').split(' ')[0]).join(', ')}
                      </p>
                      {g.ultimo_mensaje && (
                        <p className="text-xs text-slate-600 mt-1 truncate">
                          <span className="text-slate-400 font-semibold">
                            {Number(g.ultimo_emisor) === Number(usuario.id_usuario)
                              ? 'Tú: '
                              : `${(g.ultimo_emisor_nombre || 'Usuario').split(' ')[0]}: `}
                          </span>
                          {g.ultimo_mensaje}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* COMPAÑEROS 1 A 1 */}
              {filtroSidebar !== 'GRUPOS' && contactosFiltrados.map((c) => {
                const esActivo = contactoActivo?.id_usuario === c.id_usuario;
                return (
                  <button
                    key={`user-${c.id_usuario}`}
                    onClick={() => seleccionarContacto(c)}
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
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.nombre_completo}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          {Boolean(normalizarNumeroWhatsApp(c.telefono_whatsapp)) && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title={`WhatsApp: ${c.telefono_whatsapp}`}
                            >
                              WA
                            </span>
                          )}
                          {c.fecha_ultimo_mensaje && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatearHoraMensaje(c.fecha_ultimo_mensaje)}
                            </span>
                          )}
                        </div>
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
              })}

              {(
                (filtroSidebar === 'TODOS' && contactosFiltrados.length === 0 && gruposFiltrados.length === 0) ||
                (filtroSidebar === 'CONTACTOS' && contactosFiltrados.length === 0) ||
                (filtroSidebar === 'GRUPOS' && gruposFiltrados.length === 0)
              ) && (
                <div className="p-6 text-center text-xs text-slate-400">
                  {filtroSidebar === 'GRUPOS'
                    ? 'Aún no tienes grupos. Usa el botón "+ Grupo" para crear uno.'
                    : 'No se encontraron conversaciones con ese criterio.'}
                </div>
              )}
            </div>
          </div>

          {/* CONVERSACIÓN ACTIVA (INDIVIDUAL O GRUPO) */}
          <div className={`${(contactoActivo || grupoActivo) ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 bg-white`}>
            {grupoActivo ? (
              <>
                {/* CABECERA DE GRUPO */}
                <div className="p-3.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-white shrink-0">
                  <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => setGrupoActivo(null)}
                      className="md:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                      aria-label="Volver a lista de chats"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={abrirModalInfoGrupo}
                      className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0 cursor-pointer"
                      title="Ver integrantes y configuración del grupo"
                    >
                      <Users size={17} />
                    </button>
                    <div
                      onClick={abrirModalInfoGrupo}
                      className="min-w-0 cursor-pointer"
                      title="Ver integrantes del grupo"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 leading-tight truncate">
                          {grupoActivo.nombre}
                        </h3>
                        {Boolean(grupoActivo.whatsapp_group_jid) && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0"
                            title="Conectado a un grupo real de WhatsApp"
                          >
                            WA Grupo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {(grupoActivo.miembros || []).map(m => (Number(m.id_usuario) === Number(usuario.id_usuario) ? 'Tú' : m.nombre_completo)).join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!estadoWhatsapp.conectado && grupoTieneWhatsappDestinatarios && (
                      <button
                        type="button"
                        onClick={abrirModalVincularWhatsapp}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        title="Vincular tu WhatsApp QR para enviar al grupo sin salir del ERP"
                      >
                        <QrCode size={12} />
                        <span className="hidden md:inline">Vincular mi QR</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={abrirModalInfoGrupo}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Users size={13} />
                      <span className="hidden sm:inline">Participantes ({grupoActivo.total_miembros || (grupoActivo.miembros || []).length})</span>
                    </button>
                  </div>
                </div>

                {/* MENSAJES DEL GRUPO */}
                <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
                  {cargandoChat ? (
                    <div className="flex items-center justify-center h-full text-xs text-slate-400">
                      Cargando mensajes del grupo...
                    </div>
                  ) : mensajesGrupo.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
                      <Users size={36} className="text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-600">Grupo &quot;{grupoActivo.nombre}&quot; listo.</p>
                      <p className="text-[11px] text-slate-400 mt-1">Escribe abajo para conversar con los integrantes.</p>
                    </div>
                  ) : (
                    mensajesGrupo.map((m) => {
                      const soyEmisor = Number(m.id_emisor) === Number(usuario.id_usuario);
                      return (
                        <div key={m.id_mensaje_grupo} className={`flex ${soyEmisor ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] rounded-2xl p-3 shadow-xs text-xs leading-relaxed ${
                            soyEmisor
                              ? 'bg-indigo-600 text-white rounded-br-xs'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                          }`}>
                            {!soyEmisor && (
                              <p className={`text-[11px] font-bold mb-0.5 ${colorEmisorGrupo(m.id_emisor)}`}>
                                {m.nombre_emisor}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap break-words">{m.mensaje}</p>
                            <div className={`flex items-center justify-end space-x-1.5 mt-1 text-[10px] font-mono ${
                              soyEmisor ? 'text-indigo-200' : 'text-slate-400'
                            }`}>
                              {Boolean(m.enviado_whatsapp) && (
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-sans font-semibold select-none ${
                                    soyEmisor
                                      ? 'text-emerald-200 bg-emerald-500/20'
                                      : 'text-emerald-700 bg-emerald-50'
                                  }`}
                                >
                                  <Phone size={10} />
                                  <span>
                                    ✓ WhatsApp{m.whatsapp_destinatarios_total > 0 ? ` (${m.whatsapp_destinatarios_ok}/${m.whatsapp_destinatarios_total})` : ''}
                                  </span>
                                </span>
                              )}
                              <span>{formatearHoraMensaje(m.creado_en)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* COMPOSER DE GRUPO */}
                <form onSubmit={handleEnviarMensaje} className="p-3 border-t border-slate-200 bg-white shrink-0 flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Escribe un mensaje al grupo ${grupoActivo.nombre}...`}
                    value={nuevoMensaje}
                    onChange={(e) => setBorrador(claveChatActivo, e.target.value)}
                    className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  {mostrarBotonEnviarWhatsapp && (
                    <button
                      type="button"
                      onClick={handleEnviarYWhatsApp}
                      disabled={enviando || !nuevoMensaje.trim()}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
                      title="Guarda el mensaje en el grupo y lo envía por WhatsApp a los integrantes que tienen número registrado"
                    >
                      {enviando ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                      <span>Enviar + WhatsApp</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={enviando || !nuevoMensaje.trim()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
                  >
                    <Send size={15} />
                    <span>Enviar</span>
                  </button>
                </form>
              </>
            ) : contactoActivo ? (
              <>
                {/* CABECERA CHAT INDIVIDUAL */}
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
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 leading-tight truncate">
                        {contactoActivo.nombre_completo}
                      </h3>
                      <p className="text-[11px] text-slate-500 flex items-center space-x-1.5 mt-0.5 truncate">
                        <span className="font-semibold text-indigo-700">{contactoActivo.nombre_rol}</span>
                        <span>·</span>
                        <span>{contactoActivo.nombre_ubicacion || 'Sede'}</span>
                      </p>
                    </div>
                  </div>

                  {numeroWhatsappActivo ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5"
                        title={`Envío directo configurado al número ${contactoActivo.telefono_whatsapp}`}
                      >
                        <Phone size={13} />
                        <span className="hidden sm:inline">{contactoActivo.telefono_whatsapp}</span>
                        <span className="sm:hidden">WA</span>
                      </span>
                      {!estadoWhatsapp.conectado && (
                        <button
                          type="button"
                          onClick={abrirModalVincularWhatsapp}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="Vincular tu WhatsApp QR para enviar desde tu número sin salir del ERP"
                        >
                          <QrCode size={12} />
                          <span className="hidden md:inline">Vincular mi QR</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span
                      className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl shrink-0 inline-flex items-center gap-1"
                      title="Registra su número en Personal, Roles y Contraseñas para activar WhatsApp"
                    >
                      <Phone size={11} className="text-slate-400" />
                      <span className="hidden sm:inline">Sin WhatsApp (agrégalo en Personal)</span>
                      <span className="sm:hidden">Sin WA</span>
                    </span>
                  )}
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
                            <div className={`flex items-center justify-end space-x-1.5 mt-1 text-[10px] font-mono ${
                              soyEmisor ? 'text-indigo-200' : 'text-slate-400'
                            }`}>
                              {Boolean(m.enviado_whatsapp) && (
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-sans font-semibold select-none ${
                                    soyEmisor
                                      ? 'text-emerald-200 bg-emerald-500/20'
                                      : 'text-emerald-700 bg-emerald-50'
                                  }`}
                                >
                                  <Phone size={10} />
                                  <span>✓ WhatsApp</span>
                                </span>
                              )}
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

                <form onSubmit={handleEnviarMensaje} className="p-3 border-t border-slate-200 bg-white shrink-0 flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    type="text"
                    placeholder={`Escribe un mensaje para ${(contactoActivo.nombre_completo || '').split(' ')[0]}...`}
                    value={nuevoMensaje}
                    onChange={(e) => setBorrador(claveChatActivo, e.target.value)}
                    className="flex-1 min-w-[160px] border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  />
                  {mostrarBotonEnviarWhatsapp && (
                    <button
                      type="button"
                      onClick={handleEnviarYWhatsApp}
                      disabled={enviando || !nuevoMensaje.trim()}
                      className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
                      title="Guarda el mensaje aquí y lo envía automáticamente por WhatsApp sin salir de la página"
                    >
                      {enviando ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />}
                      <span>Enviar + WhatsApp</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={enviando || !nuevoMensaje.trim()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
                  >
                    <Send size={15} />
                    <span>Enviar</span>
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <MessageSquare size={48} className="text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-600">Elige un compañero o grupo de la lista izquierda</p>
                <p className="text-xs text-slate-400 mt-1">Podrás enviar mensajes directos o crear grupos tipo WhatsApp</p>
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
                <strong>Modo Supervisión Silenciosa (Solo Admin Central):</strong> Ves todas las conversaciones individuales y grupos, y si cada mensaje fue enviado por WhatsApp o solo por el chat interno.
              </span>
            </div>
          </div>

          <div className="flex-1 flex min-h-0">
            <div className={`${(parActivo || grupoSupActivo) ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-slate-200 flex-col shrink-0 bg-slate-50/50`}>
              <div className="p-3 border-b border-slate-200 bg-white">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar empleado o grupo..."
                    value={busquedaPar}
                    onChange={(e) => setBusquedaPar(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-100 rounded-xl text-xs border border-transparent focus:bg-white focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {cargandoSupervision ? (
                  <div className="p-6 text-center text-xs text-slate-400">Cargando conversaciones...</div>
                ) : (paresFiltrados.length === 0 && gruposSupFiltrados.length === 0) ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Todavía no hay conversaciones ni grupos registrados.
                  </div>
                ) : (
                  <>
                    {gruposSupFiltrados.map((g) => {
                      const esActivo = grupoSupActivo?.id_grupo === g.id_grupo;
                      return (
                        <button
                          key={`sup-g-${g.id_grupo}`}
                          onClick={() => seleccionarGrupoSupervision(g)}
                          className={`w-full p-3.5 text-left transition-colors cursor-pointer ${
                            esActivo ? 'bg-amber-50/80 border-r-2 border-amber-600' : 'hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                              <Users size={10} />
                              <span>Grupo · {g.total_mensajes} msgs</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatearHoraMensaje(g.ultima_fecha)}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 truncate">{g.nombre}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {g.total_miembros} participante(s) · Creado por {g.creador_nombre || 'Usuario'}
                          </p>
                          {g.ultimo_mensaje && (
                            <p className="text-xs text-slate-600 mt-1 italic truncate">
                              &quot;{g.ultimo_emisor_nombre ? `${g.ultimo_emisor_nombre.split(' ')[0]}: ` : ''}{g.ultimo_mensaje}&quot;
                            </p>
                          )}
                        </button>
                      );
                    })}

                    {paresFiltrados.map((p, idx) => {
                      const esActivo = parActivo?.u1_id === p.u1_id && parActivo?.u2_id === p.u2_id;
                      return (
                        <button
                          key={`sup-p-${idx}`}
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
                              &quot;{p.ultimo_mensaje}&quot;
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            <div className={`${(parActivo || grupoSupActivo) ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 bg-white`}>
              {(parActivo || grupoSupActivo) ? (
                <>
                  <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setParActivo(null);
                          setGrupoSupActivo(null);
                        }}
                        className="md:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-slate-200/70 flex items-center justify-center shrink-0 cursor-pointer"
                        aria-label="Volver a conversaciones"
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <div className="min-w-0">
                        {grupoSupActivo ? (
                          <>
                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex flex-wrap items-center gap-1.5">
                              <Eye size={15} className="text-amber-600" />
                              <span>Grupo:</span>
                              <span className="text-emerald-700 font-bold">{grupoSupActivo.nombre}</span>
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {grupoSupActivo.total_miembros} participantes · {mensajesSupervision.length} mensajes · Vista silenciosa
                            </p>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div ref={supervisionScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                    {mensajesSupervision.length === 0 ? (
                      <div className="text-center text-xs text-slate-400 p-8">No hay mensajes en esta charla.</div>
                    ) : (
                      mensajesSupervision.map((m) => {
                        const esOscuro = parActivo ? m.id_emisor !== parActivo.u1_id : false;
                        const envioWa = Boolean(m.enviado_whatsapp);
                        return (
                          <div
                            key={m.id_mensaje_grupo || m.id_mensaje}
                            className={`flex ${esOscuro ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[75%] rounded-2xl p-3 shadow-xs text-xs leading-relaxed border ${
                              esOscuro
                                ? 'bg-slate-800 text-white border-slate-700'
                                : 'bg-white border-slate-200 text-slate-800'
                            }`}>
                              <div className="flex items-center justify-between gap-3 border-b pb-1 mb-1 border-current/15">
                                <span className={`font-bold text-[11px] ${!esOscuro && grupoSupActivo ? colorEmisorGrupo(m.id_emisor) : ''}`}>
                                  {m.nombre_emisor}
                                </span>
                                <span className="text-[10px] opacity-70 font-mono">{formatearHoraMensaje(m.creado_en)}</span>
                              </div>
                              <p className="whitespace-pre-wrap break-words">{m.mensaje}</p>
                              <div className="mt-1.5 flex items-center justify-end gap-2 text-[10px]">
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${
                                    envioWa
                                      ? (esOscuro ? 'bg-emerald-500/25 text-emerald-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')
                                      : (esOscuro ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')
                                  }`}
                                >
                                  {envioWa ? (
                                    <>
                                      <Phone size={9} />
                                      <span>
                                        ✓ WhatsApp{m.whatsapp_destinatarios_total > 0 ? ` (${m.whatsapp_destinatarios_ok}/${m.whatsapp_destinatarios_total})` : ''}
                                      </span>
                                    </>
                                  ) : (
                                    <span>Solo chat interno</span>
                                  )}
                                </span>
                                {parActivo && (
                                  <span className="opacity-60 text-[9px]">{m.leido ? '✓✓ Leído' : '✓ Enviado'}</span>
                                )}
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
                  <p className="text-sm font-semibold text-slate-600">Elige una conversación o grupo de la lista izquierda</p>
                  <p className="text-xs text-slate-400 mt-1">Aquí verás los mensajes y si fueron enviados por WhatsApp</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR GRUPO TIPO WHATSAPP */}
      {modalCrearGrupo && (
        <div
          onClick={() => !guardandoGrupo && setModalCrearGrupo(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Nuevo Grupo</h3>
                  <p className="text-[11px] text-slate-500">Crea un chat grupal con tus compañeros</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !guardandoGrupo && setModalCrearGrupo(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearGrupo} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Nombre del grupo *</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  placeholder="Ej: Despacho Lima, Ventas Turno Mañana..."
                  value={formNuevoGrupo.nombre}
                  onChange={(e) => setFormNuevoGrupo(prev => ({ ...prev, nombre: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Coordinación de entregas y pedidos urgentes"
                  value={formNuevoGrupo.descripcion}
                  onChange={(e) => setFormNuevoGrupo(prev => ({ ...prev, descripcion: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase">
                    Participantes ({formNuevoGrupo.miembros.length} seleccionado{formNuevoGrupo.miembros.length === 1 ? '' : 's'})
                  </label>
                </div>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar compañeros..."
                    value={busquedaMiembroNuevo}
                    onChange={(e) => setBusquedaMiembroNuevo(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {contactos
                    .filter(c => !busquedaMiembroNuevo.trim() || (c.nombre_completo || '').toLowerCase().includes(busquedaMiembroNuevo.toLowerCase()))
                    .map((c) => {
                      const marcado = formNuevoGrupo.miembros.includes(c.id_usuario);
                      const tieneWa = Boolean(normalizarNumeroWhatsApp(c.telefono_whatsapp));
                      return (
                        <label
                          key={c.id_usuario}
                          className={`flex items-center justify-between px-3 py-2.5 cursor-pointer text-xs ${
                            marcado ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => toggleMiembroNuevoGrupo(c.id_usuario)}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 truncate">{c.nombre_completo}</p>
                              <p className="text-[11px] text-slate-500 truncate">{c.nombre_rol} · {c.nombre_ubicacion || 'Sede'}</p>
                            </div>
                          </div>
                          {tieneWa && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 shrink-0">
                              WA
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
                estadoWhatsapp.conectado
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                {estadoWhatsapp.conectado
                  ? 'Al crear el grupo aquí, también se creará automáticamente el grupo real en tu WhatsApp con los integrantes que tengan número registrado.'
                  : 'Tu WhatsApp QR no está conectado ahora; el grupo se creará en el chat interno y luego podrás sincronizarlo con WhatsApp.'}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={guardandoGrupo}
                  onClick={() => setModalCrearGrupo(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoGrupo}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                >
                  {guardandoGrupo ? 'Creando...' : 'Crear Grupo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INFO Y PARTICIPANTES DE GRUPO */}
      {modalInfoGrupo && detalleGrupo && (
        <div
          onClick={() => !procesandoGrupoAccion && setModalInfoGrupo(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[88vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                  <Users size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">{detalleGrupo.nombre}</h3>
                  <p className="text-[11px] text-slate-500">
                    Grupo · {detalleGrupo.total_miembros} participante(s)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !procesandoGrupoAccion && setModalInfoGrupo(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Nombre y Descripción */}
              {editandoGrupoMeta ? (
                <form onSubmit={handleGuardarMetaGrupo} className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <input
                    type="text"
                    required
                    value={formEditarGrupo.nombre}
                    onChange={(e) => setFormEditarGrupo(prev => ({ ...prev, nombre: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold"
                  />
                  <input
                    type="text"
                    placeholder="Descripción del grupo..."
                    value={formEditarGrupo.descripcion}
                    onChange={(e) => setFormEditarGrupo(prev => ({ ...prev, descripcion: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditandoGrupoMeta(false)}
                      className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 font-bold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={procesandoGrupoAccion}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold cursor-pointer"
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900">{detalleGrupo.nombre}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {detalleGrupo.descripcion || 'Sin descripción'}
                    </p>
                  </div>
                  {esAdminDelGrupoActual && (
                    <button
                      type="button"
                      onClick={() => setEditandoGrupoMeta(true)}
                      className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 cursor-pointer shrink-0"
                      title="Editar nombre y descripción"
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Estado / Sincronización con grupo real de WhatsApp */}
              <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                detalleGrupo.whatsapp_group_jid
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                <div className="min-w-0">
                  <p className="font-bold flex items-center gap-1.5">
                    <Phone size={13} />
                    <span>
                      {detalleGrupo.whatsapp_group_jid
                        ? 'Vinculado a grupo real de WhatsApp'
                        : 'Pendiente de crear en WhatsApp'}
                    </span>
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {detalleGrupo.whatsapp_group_jid
                      ? 'Los mensajes con "Enviar + WhatsApp" llegan directamente al chat grupal de WhatsApp.'
                      : 'Sincronízalo con tu WhatsApp QR para crear el grupo real en WhatsApp.'}
                  </p>
                </div>
                {esAdminDelGrupoActual && (
                  <button
                    type="button"
                    onClick={handleSincronizarGrupoWhatsapp}
                    disabled={sincronizandoWaGrupo}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw size={12} className={sincronizandoWaGrupo ? 'animate-spin' : ''} />
                    <span>
                      {sincronizandoWaGrupo
                        ? 'Sincronizando...'
                        : detalleGrupo.whatsapp_group_jid
                        ? 'Sincronizar WA'
                        : 'Crear en WhatsApp'}
                    </span>
                  </button>
                )}
              </div>

              {/* Agregar participantes (solo admin del grupo) */}
              {esAdminDelGrupoActual && contactosDisponiblesParaAgregar.length > 0 && (
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                  <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <UserPlus size={14} />
                    <span>Agregar participantes</span>
                  </p>
                  <input
                    type="text"
                    placeholder="Buscar compañero para agregar..."
                    value={busquedaAgregarMiembro}
                    onChange={(e) => setBusquedaAgregarMiembro(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-emerald-200 bg-white text-xs focus:outline-hidden"
                  />
                  <div className="max-h-32 overflow-y-auto divide-y divide-emerald-100 bg-white rounded-lg border border-emerald-100">
                    {contactosDisponiblesParaAgregar
                      .filter(c => !busquedaAgregarMiembro.trim() || (c.nombre_completo || '').toLowerCase().includes(busquedaAgregarMiembro.toLowerCase()))
                      .map((c) => {
                        const sel = miembrosAgregar.includes(c.id_usuario);
                        return (
                          <label key={c.id_usuario} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-emerald-50/50">
                            <span className="flex items-center gap-2 font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={() =>
                                  setMiembrosAgregar(prev =>
                                    prev.includes(c.id_usuario)
                                      ? prev.filter(id => id !== c.id_usuario)
                                      : [...prev, c.id_usuario]
                                  )
                                }
                                className="rounded text-emerald-600"
                              />
                              <span>{c.nombre_completo}</span>
                            </span>
                            <span className="text-[10px] text-slate-400">{c.nombre_rol}</span>
                          </label>
                        );
                      })}
                  </div>
                  {miembrosAgregar.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAgregarIntegrantes}
                      disabled={procesandoGrupoAccion}
                      className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                    >
                      Agregar {miembrosAgregar.length} participante(s)
                    </button>
                  )}
                </div>
              )}

              {/* Lista de Participantes */}
              <div>
                <p className="font-bold text-slate-700 uppercase mb-2">
                  Participantes ({detalleGrupo.miembros?.length || 0})
                </p>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {(detalleGrupo.miembros || []).map((m) => {
                    const esYo = Number(m.id_usuario) === Number(usuario.id_usuario);
                    const tieneWa = Boolean(normalizarNumeroWhatsApp(m.telefono_whatsapp));
                    return (
                      <div key={m.id_usuario} className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900">
                              {esYo ? `${m.nombre_completo} (Tú)` : m.nombre_completo}
                            </span>
                            {m.rol_grupo === 'ADMIN' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                Admin del grupo
                              </span>
                            )}
                            {tieneWa && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                WA
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">{m.nombre_rol} · {m.nombre_ubicacion || 'Sede'}</p>
                        </div>

                        {esAdminDelGrupoActual && !esYo && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleCambiarRolMiembro(m)}
                              disabled={procesandoGrupoAccion}
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                              title={m.rol_grupo === 'ADMIN' ? 'Quitar admin de grupo' : 'Hacer admin del grupo'}
                            >
                              <Shield size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuitarOSalir(m.id_usuario, m.nombre_completo)}
                              disabled={procesandoGrupoAccion}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Quitar del grupo"
                            >
                              <UserMinus size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Acciones del grupo */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleQuitarOSalir(usuario.id_usuario)}
                  disabled={procesandoGrupoAccion}
                  className="px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Salir del grupo</span>
                </button>

                {esAdminDelGrupoActual && (
                  <button
                    type="button"
                    onClick={handleEliminarGrupo}
                    disabled={procesandoGrupoAccion}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Eliminar grupo</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VINCULAR MI WHATSAPP POR QR */}
      {modalWhatsapp && (
        <div
          onClick={() => setModalWhatsapp(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <QrCode size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Mi WhatsApp ({usuario?.nombre || 'Cuenta ERP'})</h3>
                  <p className="text-[11px] text-slate-500">Envío automático directo desde tu número sin salir del sistema</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalWhatsapp(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {estadoWhatsapp.conectado ? (
                <div className="space-y-4 text-center">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-emerald-700 font-extrabold text-sm">
                      <Wifi size={17} />
                      <span>Tu WhatsApp está Conectado</span>
                    </div>
                    <p className="text-xs text-emerald-900 font-semibold">
                      +{estadoWhatsapp.numero || 'Número vinculado'}
                      {estadoWhatsapp.nombre ? ` · ${estadoWhatsapp.nombre}` : ''}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Cuando presiones &quot;Enviar + WhatsApp&quot;, el mensaje saldrá directamente desde tu número al chat de tu compañero sin salir del ERP.
                    </p>
                  </div>

                  <div className="flex justify-between gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleDesconectarWhatsapp}
                      disabled={desconectandoWa}
                      className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {desconectandoWa ? 'Desvinculando...' : 'Desvincular mi cuenta'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalWhatsapp(false)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <ol className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <li><strong>1.</strong> Abre <strong>WhatsApp</strong> en tu teléfono.</li>
                    <li><strong>2.</strong> Entra en <strong>Dispositivos vinculados → Vincular un dispositivo</strong>.</li>
                    <li><strong>3.</strong> Escanea este código QR para enviar desde tu propio chat al número de tus compañeros.</li>
                  </ol>

                  <div className="flex flex-col items-center justify-center min-h-[250px] bg-white rounded-2xl border border-dashed border-slate-300 p-4">
                    {estadoWhatsapp.qr_data_url ? (
                      <img
                        src={estadoWhatsapp.qr_data_url}
                        alt="Código QR para vincular WhatsApp"
                        className="w-56 h-56 object-contain rounded-lg"
                      />
                    ) : cargandoQrWa || estadoWhatsapp.estado === 'INICIANDO' ? (
                      <div className="flex flex-col items-center gap-2 text-slate-500 text-xs">
                        <Loader2 size={28} className="animate-spin text-emerald-600" />
                        <span>Generando código QR...</span>
                      </div>
                    ) : (
                      <div className="text-center text-xs text-slate-500 space-y-2">
                        <QrCode size={36} className="mx-auto text-slate-300" />
                        <p>Presiona &quot;Generar nuevo QR&quot; para vincular el WhatsApp.</p>
                      </div>
                    )}
                  </div>

                  {estadoWhatsapp.ultimo_error && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      {estadoWhatsapp.ultimo_error}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={generarNuevoQrWhatsapp}
                      disabled={cargandoQrWa}
                      className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={cargandoQrWa ? 'animate-spin' : ''} />
                      <span>Generar nuevo QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalWhatsapp(false)}
                      className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
