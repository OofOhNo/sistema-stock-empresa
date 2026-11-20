import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api';
import toast from 'react-hot-toast';
import {
  Calendar as CalendarIcon, Plus, List, Users, Video, MapPin, Globe,
  AlertTriangle, Clock, Lock, CheckSquare, Square, Trash2, Edit3,
  ChevronLeft, ChevronRight, X, Search, Target, Layers, CheckCircle2
} from 'lucide-react';
import BotonExportarExcel from '../components/BotonExportarExcel';
import { exportarTablaExcel, fechaHoraLocalTexto } from '../utils/excelExport';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function claveFechaLocal(valor) {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function aDatetimeLocalValue(valor) {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function aIsoDesdeDatetimeLocal(localStr) {
  if (!localStr) return '';
  const d = new Date(localStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function horaCortaLocal(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function crearFormInicial(fechaDia = null, tipo = 'reunion') {
  const ahora = new Date();
  let ini;
  let fin;
  if (fechaDia) {
    ini = new Date(`${fechaDia}T09:00`);
    fin = new Date(`${fechaDia}T10:00`);
  } else if (tipo === 'imprevisto') {
    ini = new Date(ahora.getTime() + 15 * 60000);
    fin = new Date(ahora.getTime() + 45 * 60000);
  } else {
    ini = new Date(ahora.getTime() + 60 * 60000);
    ini.setMinutes(0, 0, 0);
    fin = new Date(ini.getTime() + 60 * 60000);
  }

  return {
    titulo: '',
    descripcion: '',
    tipo_evento: tipo,
    fecha_hora_inicio: aDatetimeLocalValue(ini),
    fecha_hora_fin: aDatetimeLocalValue(fin),
    id_sala: '',
    es_general_nivel: false,
    alcance: 'invitados',
    id_ubicacion: '',
    enlace_videollamada: '',
    estado: 'PROGRAMADA',
    asistentes_ids: [],
    temas_objetivos: []
  };
}

export default function Reuniones({ usuario }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0..11
  const [vista, setVista] = useState('calendario'); // 'calendario' | 'lista'
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos' | 'reunion' | 'imprevisto'

  const [reuniones, setReuniones] = useState([]);
  const [invitables, setInvitables] = useState([]);
  const [salas, setSalas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [miNivel, setMiNivel] = useState(
    usuario?.rol === 'Admin Central' ? 1 : Number(usuario?.nivel_jerarquia || 4)
  );

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Modal Detalle / Crear / Editar
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoModal, setModoModal] = useState('ver'); // 'ver' | 'crear' | 'editar'
  const [reunionSeleccionada, setReunionSeleccionada] = useState(null);
  const [form, setForm] = useState(() => crearFormInicial());
  const [nuevoTemaTexto, setNuevoTemaTexto] = useState('');
  const [busquedaInvitado, setBusquedaInvitado] = useState('');
  const [filtroSedeInvitado, setFiltroSedeInvitado] = useState('todas');
  const [ahoraTick, setAhoraTick] = useState(() => Date.now());

  const puedeEditarReuniones =
    usuario?.rol === 'Admin Central' || usuario?.permisos?.reuniones?.puede_editar === true;

  const esAdminCentral = usuario?.rol === 'Admin Central';

  useEffect(() => {
    const id = setInterval(() => setAhoraTick(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  const cargarTodo = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [resReuniones, resInv, resUbic] = await Promise.all([
        api.get('/reuniones'),
        api.get('/reuniones/invitables').catch(() => ({ data: {} })),
        api.get('/ubicaciones').catch(() => ({ data: { datos: [] } }))
      ]);

      setReuniones(resReuniones.data?.eventos || []);
      if (resInv.data?.mi_nivel) setMiNivel(Number(resInv.data.mi_nivel));
      else if (resReuniones.data?.mi_nivel) setMiNivel(Number(resReuniones.data.mi_nivel));

      setInvitables(resInv.data?.usuarios || []);
      setSalas(resInv.data?.salas || []);
      setUbicaciones(resUbic.data?.ubicaciones || resUbic.data?.datos || []);
    } catch {
      setError('No se pudieron cargar las reuniones.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) void cargarTodo();
    });
    return () => {
      alive = false;
    };
  }, [cargarTodo]);

  const esImprevisto = (r) =>
    r?.tipo_evento === 'imprevisto' || String(r?.titulo || '').startsWith('[IMPREVISTO]');

  const calcularMinutosRestantes = useCallback(
    (reunion) => {
      if (!reunion?.fecha_hora_inicio) return -999;
      const inicioMs = new Date(reunion.fecha_hora_inicio).getTime();
      if (Number.isNaN(inicioMs)) return -999;
      return (inicioMs - ahoraTick) / 60000;
    },
    [ahoraTick]
  );

  const puedeUsuarioEditarEstaReunion = useCallback(
    (reunion) => {
      if (!reunion || !puedeEditarReuniones) return false;
      const esOrganizador = Number(reunion.id_organizador) === Number(usuario?.id_usuario);
      return esOrganizador || esAdminCentral;
    },
    [puedeEditarReuniones, usuario?.id_usuario, esAdminCentral]
  );

  const reunionesFiltradas = useMemo(() => {
    return reuniones.filter((r) => {
      if (filtroTipo === 'imprevisto') return esImprevisto(r);
      if (filtroTipo === 'reunion') return !esImprevisto(r);
      return true;
    });
  }, [reuniones, filtroTipo]);

  const eventosPorDia = useMemo(() => {
    const mapa = new Map();
    for (const r of reunionesFiltradas) {
      const clave = claveFechaLocal(r.fecha_hora_inicio);
      if (!clave) continue;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(r);
    }
    return mapa;
  }, [reunionesFiltradas]);

  // Celdas mensuales Lunes..Domingo (idéntico a CalendarioPagos.jsx)
  const celdasCalendario = useMemo(() => {
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);
    const totalDias = ultimoDia.getDate();
    const diaSemanaInicio = primerDia.getDay(); // 0=Dom .. 6=Sab
    const offsetLunes = diaSemanaInicio === 0 ? 6 : diaSemanaInicio - 1;

    const celdas = [];
    for (let i = 0; i < offsetLunes; i += 1) {
      celdas.push({ vacio: true, key: `pad-start-${i}` });
    }
    for (let d = 1; d <= totalDias; d += 1) {
      const fechaStr = `${anio}-${pad2(mes + 1)}-${pad2(d)}`;
      celdas.push({
        vacio: false,
        dia: d,
        fechaStr,
        eventos: eventosPorDia.get(fechaStr) || [],
        key: fechaStr
      });
    }
    while (celdas.length % 7 !== 0) {
      celdas.push({ vacio: true, key: `pad-end-${celdas.length}` });
    }
    return celdas;
  }, [anio, mes, eventosPorDia]);

  const invitablesFiltrados = useMemo(() => {
    const q = busquedaInvitado.toLowerCase().trim();
    return invitables.filter((u) => {
      const okSede = filtroSedeInvitado === 'todas' || String(u.id_ubicacion) === String(filtroSedeInvitado);
      const okTexto =
        !q ||
        String(u.nombre_completo || '').toLowerCase().includes(q) ||
        String(u.nombre_rol || '').toLowerCase().includes(q) ||
        String(u.email || '').toLowerCase().includes(q);
      return okSede && okTexto;
    });
  }, [invitables, busquedaInvitado, filtroSedeInvitado]);

  const cambiarMes = (delta) => {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAnio -= 1;
    } else if (nuevoMes > 11) {
      nuevoMes = 0;
      nuevoAnio += 1;
    }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
  };

  const abrirModalCrear = (fechaDia = null, tipo = 'reunion') => {
    if (!puedeEditarReuniones) return;
    setReunionSeleccionada(null);
    setForm(crearFormInicial(fechaDia, tipo));
    setNuevoTemaTexto('');
    setBusquedaInvitado('');
    setFiltroSedeInvitado('todas');
    setModoModal('crear');
    setModalAbierto(true);
  };

  const hidratarFormDesdeReunion = (r) => {
    const asistentes = Array.isArray(r.asistentes) ? r.asistentes.map((a) => Number(a.id_usuario)) : [];
    const temas = Array.isArray(r.temas_objetivos) ? r.temas_objetivos : [];
    return {
      titulo: r.titulo || '',
      descripcion: r.descripcion || '',
      tipo_evento: esImprevisto(r) ? 'imprevisto' : 'reunion',
      fecha_hora_inicio: aDatetimeLocalValue(r.fecha_hora_inicio),
      fecha_hora_fin: aDatetimeLocalValue(r.fecha_hora_fin),
      id_sala: r.id_sala ? String(r.id_sala) : '',
      es_general_nivel: Boolean(r.es_general_nivel),
      alcance: r.alcance === 'ubicacion' ? 'ubicacion' : 'general',
      id_ubicacion: r.id_ubicacion ? String(r.id_ubicacion) : '',
      enlace_videollamada: r.enlace_videollamada || '',
      estado: r.estado || 'PROGRAMADA',
      asistentes_ids: asistentes,
      temas_objetivos: temas.map((t, idx) => ({
        id: t.id || `tema-${idx + 1}`,
        titulo: t.titulo || String(t),
        completado: Boolean(t.completado)
      }))
    };
  };

  const abrirModalDetalle = (reunion) => {
    setReunionSeleccionada(reunion);
    setForm(hidratarFormDesdeReunion(reunion));
    setNuevoTemaTexto('');
    setBusquedaInvitado('');
    setFiltroSedeInvitado('todas');
    setModoModal('ver');
    setModalAbierto(true);
  };

  const pasarAEditar = () => {
    if (!reunionSeleccionada) return;
    const mins = calcularMinutosRestantes(reunionSeleccionada);
    if (mins < 10) {
      toast.error('Esta reunión ya no puede editarse (límite: máximo 10 minutos antes del inicio).');
      return;
    }
    setForm(hidratarFormDesdeReunion(reunionSeleccionada));
    setModoModal('editar');
  };

  const toggleInvitado = (idUsuario) => {
    const idNum = Number(idUsuario);
    setForm((prev) => {
      const existe = prev.asistentes_ids.includes(idNum);
      return {
        ...prev,
        asistentes_ids: existe
          ? prev.asistentes_ids.filter((x) => x !== idNum)
          : [...prev.asistentes_ids, idNum]
      };
    });
  };

  const seleccionarTodosVisibles = () => {
    setForm((prev) => {
      const set = new Set(prev.asistentes_ids);
      invitablesFiltrados.forEach((u) => set.add(Number(u.id_usuario)));
      return { ...prev, asistentes_ids: [...set] };
    });
  };

  const limpiarInvitados = () => {
    setForm((prev) => ({ ...prev, asistentes_ids: [] }));
  };

  const agregarTema = () => {
    const texto = nuevoTemaTexto.trim();
    if (!texto) return;
    setForm((prev) => ({
      ...prev,
      temas_objetivos: [
        ...prev.temas_objetivos,
        { id: `tema-${Date.now()}-${prev.temas_objetivos.length + 1}`, titulo: texto, completado: false }
      ]
    }));
    setNuevoTemaTexto('');
  };

  const toggleTemaCompletado = (temaId) => {
    setForm((prev) => ({
      ...prev,
      temas_objetivos: prev.temas_objetivos.map((t) =>
        t.id === temaId ? { ...t, completado: !t.completado } : t
      )
    }));
  };

  const eliminarTema = (temaId) => {
    setForm((prev) => ({
      ...prev,
      temas_objetivos: prev.temas_objetivos.filter((t) => t.id !== temaId)
    }));
  };

  const actualizarTituloTema = (temaId, nuevoTitulo) => {
    setForm((prev) => ({
      ...prev,
      temas_objetivos: prev.temas_objetivos.map((t) =>
        t.id === temaId ? { ...t, titulo: nuevoTitulo } : t
      )
    }));
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.fecha_hora_inicio || !form.fecha_hora_fin) {
      toast.error('Completa el título y el horario de inicio/fin.');
      return;
    }

    const iniIso = aIsoDesdeDatetimeLocal(form.fecha_hora_inicio);
    const finIso = aIsoDesdeDatetimeLocal(form.fecha_hora_fin);
    if (!iniIso || !finIso || new Date(finIso) <= new Date(iniIso)) {
      toast.error('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    if (!form.es_general_nivel && form.asistentes_ids.length === 0) {
      toast.error('Selecciona al menos un usuario invitado o marca "Visible para mi nivel o inferior".');
      return;
    }

    if (modoModal === 'editar' && reunionSeleccionada) {
      const mins = calcularMinutosRestantes(reunionSeleccionada);
      if (mins < 10) {
        toast.error('El tiempo límite para editar venció (máximo 10 minutos antes del inicio).');
        return;
      }
    }

    setGuardando(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim(),
        tipo_evento: form.tipo_evento,
        fecha_hora_inicio: iniIso,
        fecha_hora_fin: finIso,
        id_sala: form.id_sala ? Number(form.id_sala) : null,
        es_general_nivel: form.es_general_nivel,
        alcance: form.es_general_nivel ? form.alcance : 'invitados',
        id_ubicacion: form.es_general_nivel && form.alcance === 'ubicacion'
          ? (form.id_ubicacion ? Number(form.id_ubicacion) : usuario?.id_ubicacion || null)
          : null,
        enlace_videollamada: form.enlace_videollamada.trim() || null,
        asistentes_ids: form.asistentes_ids,
        temas_objetivos: form.temas_objetivos.filter((t) => String(t.titulo || '').trim()),
        estado: form.estado || 'PROGRAMADA'
      };

      if (modoModal === 'editar' && reunionSeleccionada) {
        const res = await api.put(`/reuniones/${reunionSeleccionada.id_reunion}`, payload);
        toast.success(res.data?.mensaje || 'Reunión actualizada.');
      } else {
        const res = await api.post('/reuniones', payload);
        toast.success(res.data?.mensaje || 'Reunión programada.');
      }
      setModalAbierto(false);
      await cargarTodo();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo guardar la reunión.');
    } finally {
      setGuardando(false);
    }
  };

  const exportarReunionesExcel = () => {
    exportarTablaExcel({
      nombreArchivo: 'reuniones_agenda',
      nombreHoja: 'Reuniones',
      filas: reunionesFiltradas,
      columnas: [
        { header: 'ID', key: 'id_reunion' },
        { header: 'Tipo', value: (r) => (esImprevisto(r) ? 'Imprevisto' : 'Reunión') },
        { header: 'Título', key: 'titulo' },
        { header: 'Estado', key: 'estado' },
        { header: 'Inicio', value: (r) => fechaHoraLocalTexto(r.fecha_hora_inicio) },
        { header: 'Fin', value: (r) => fechaHoraLocalTexto(r.fecha_hora_fin) },
        { header: 'Organizador', key: 'organizador_nombre' },
        { header: 'Nivel Organizador', key: 'organizador_nivel' },
        {
          header: 'Alcance',
          value: (r) => (r.es_general_nivel ? (r.alcance === 'ubicacion' ? `Sede: ${r.nombre_ubicacion || ''}` : 'General (su nivel o inferior)') : 'Solo invitados')
        },
        {
          header: 'Invitados',
          value: (r) => (Array.isArray(r.asistentes) ? r.asistentes.map((a) => `${a.nombre_completo} (N${a.nivel_jerarquia})`).join(', ') : '')
        },
        {
          header: 'Temas / Objetivos a Tratar',
          value: (r) =>
            Array.isArray(r.temas_objetivos)
              ? r.temas_objetivos.map((t) => `[${t.completado ? 'OK' : 'Pendiente'}] ${t.titulo}`).join(' | ')
              : ''
        },
        { header: 'Enlace / Descripción', value: (r) => [r.enlace_videollamada, r.descripcion].filter(Boolean).join(' — ') }
      ]
    });
  };

  const hoyStr = claveFechaLocal(hoy);
  const totalImprevistos = reuniones.filter(esImprevisto).length;
  const totalReunionesMes = reunionesFiltradas.filter((r) => {
    const d = new Date(r.fecha_hora_inicio);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === anio && d.getMonth() === mes;
  }).length;
  const proximasActivas = reunionesFiltradas.filter((r) => calcularMinutosRestantes(r) > 0 && r.estado !== 'CANCELADA').length;

  const minutosRestantesSel = reunionSeleccionada ? calcularMinutosRestantes(reunionSeleccionada) : 999;
  const edicionDesbloqueadaPorTiempo = modoModal === 'crear' || minutosRestantesSel >= 10;
  const esSoloLectura = modoModal === 'ver' || !edicionDesbloqueadaPorTiempo;

  if (cargando && reuniones.length === 0) {
    return <div className="p-8 text-slate-500 font-medium">Cargando calendario y agenda de reuniones...</div>;
  }

  return (
    <div className="space-y-6">
      {/* CABECERA */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
            <CalendarIcon size={24} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-blue-950">Calendario de Reuniones</h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-800 border border-violet-200">
                <Layers size={12} />
                Tu jerarquía: Nivel {miNivel}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Organiza reuniones convocando usuarios de tu nivel o inferior, define temas y edita hasta 10 min antes de iniciar.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setVista('calendario')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                vista === 'calendario' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon size={14} />
              <span>Calendario</span>
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                vista === 'lista' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List size={14} />
              <span>Lista ({reunionesFiltradas.length})</span>
            </button>
          </div>

          <BotonExportarExcel
            onClick={exportarReunionesExcel}
            label="Exportar Excel"
            cantidad={reunionesFiltradas.length}
          />

          {puedeEditarReuniones && (
            <>
              <button
                type="button"
                onClick={() => abrirModalCrear(null, 'imprevisto')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <AlertTriangle size={15} />
                <span>Reunión Urgente</span>
              </button>
              <button
                type="button"
                onClick={() => abrirModalCrear(null, 'reunion')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 cursor-pointer transition-colors"
              >
                <Plus size={15} />
                <span>Agendar Reunión</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* RESUMEN Y FILTROS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase">Reuniones este mes</p>
          <p className="text-2xl font-black text-indigo-950 mt-1">{totalReunionesMes}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase">Próximas pendientes</p>
          <p className="text-2xl font-black text-emerald-700 mt-1">{proximasActivas}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase">Imprevistos registrados</p>
          <p className="text-2xl font-black text-rose-600 mt-1">{totalImprevistos}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase">Personas que puedes convocar</p>
          <p className="text-2xl font-black text-violet-700 mt-1">{invitables.length}</p>
        </div>
      </div>

      {/* BARRA DE NAVEGACIÓN DE MES Y FILTRO DE TIPO */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => cambiarMes(-1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
            title="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[160px] text-center text-sm font-extrabold text-blue-950">
            {MESES[mes]} {anio}
          </span>
          <button
            type="button"
            onClick={() => cambiarMes(1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
            title="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setMes(hoy.getMonth());
              setAnio(hoy.getFullYear());
            }}
            className="ml-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold cursor-pointer"
          >
            Hoy
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'todos', label: `Todos (${reuniones.length})` },
            { id: 'reunion', label: `Reuniones (${reuniones.length - totalImprevistos})` },
            { id: 'imprevisto', label: `Imprevistos (${totalImprevistos})` }
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroTipo(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                filtroTipo === f.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* VISTA CALENDARIO MENSUAL (SIMILAR A CALENDARIO DE PAGOS) */}
      {vista === 'calendario' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200 text-center">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-500">
                {dia}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {celdasCalendario.map((celda) => {
              if (celda.vacio) {
                return <div key={celda.key} className="min-h-[118px] bg-slate-50/40" />;
              }

              const esHoy = celda.fechaStr === hoyStr;
              return (
                <div
                  key={celda.key}
                  className={`min-h-[118px] p-2 flex flex-col gap-1.5 transition-colors group ${
                    esHoy ? 'bg-indigo-50/40 ring-2 ring-inset ring-indigo-500/40' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-extrabold px-1.5 py-0.5 rounded-md ${
                        esHoy ? 'bg-indigo-600 text-white' : 'text-slate-700'
                      }`}
                    >
                      {celda.dia}
                      {esHoy ? ' · Hoy' : ''}
                    </span>
                    {puedeEditarReuniones && (
                      <button
                        type="button"
                        onClick={() => abrirModalCrear(celda.fechaStr, 'reunion')}
                        title="Agendar reunión este día"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer transition-opacity"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[104px] pr-0.5">
                    {celda.eventos.map((ev) => {
                      const imprev = esImprevisto(ev);
                      const mins = calcularMinutosRestantes(ev);
                      const cancelada = ev.estado === 'CANCELADA';
                      const bloqueada = mins < 10;
                      const nInv = Array.isArray(ev.asistentes) ? ev.asistentes.length : 0;
                      const nTemas = Array.isArray(ev.temas_objetivos) ? ev.temas_objetivos.length : 0;

                      const colorClase = cancelada
                        ? 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                        : imprev
                        ? 'bg-rose-50 border-rose-200 text-rose-900 hover:border-rose-400'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-950 hover:border-indigo-400';

                      return (
                        <button
                          key={ev.id_reunion}
                          type="button"
                          onClick={() => abrirModalDetalle(ev)}
                          className={`w-full text-left p-1.5 rounded-lg border text-[11px] leading-tight transition-all cursor-pointer shadow-2xs ${colorClase}`}
                        >
                          <div className="flex items-center justify-between gap-1 font-bold">
                            <span className="truncate">
                              {horaCortaLocal(ev.fecha_hora_inicio)} {ev.titulo}
                            </span>
                            {bloqueada && <Lock size={10} className="shrink-0 opacity-70" />}
                          </div>
                          <div className="flex items-center justify-between text-[10px] opacity-80 mt-0.5">
                            <span className="truncate">N{ev.organizador_nivel || 4} · {ev.organizador_nombre?.split(' ')[0]}</span>
                            <span className="shrink-0 font-semibold">
                              👥{nInv} · 🎯{nTemas}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VISTA LISTA DETALLADA */}
      {vista === 'lista' && (
        <div className="space-y-3">
          {reunionesFiltradas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
              No hay reuniones ni avisos visibles para tu usuario con los filtros actuales.
            </div>
          ) : (
            reunionesFiltradas.map((ev) => {
              const imprev = esImprevisto(ev);
              const mins = calcularMinutosRestantes(ev);
              const editablePorTiempo = mins >= 10;
              const temas = Array.isArray(ev.temas_objetivos) ? ev.temas_objetivos : [];
              const temasOk = temas.filter((t) => t.completado).length;
              const asistentes = Array.isArray(ev.asistentes) ? ev.asistentes : [];
              const puedeEditarEsta = puedeUsuarioEditarEstaReunion(ev);

              return (
                <div
                  key={ev.id_reunion}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-indigo-300 transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          imprev ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'
                        }`}
                      >
                        {imprev ? 'IMPREVISTO' : 'REUNIÓN'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                        {ev.estado || 'PROGRAMADA'}
                      </span>
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                        <Clock size={13} className="text-indigo-500" />
                        {fechaHoraLocalTexto(ev.fecha_hora_inicio)} → {horaCortaLocal(ev.fecha_hora_fin)}
                      </span>
                      {editablePorTiempo ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Editable (hasta 10 min antes)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                          <Lock size={10} /> Edición cerrada (&lt; 10 min)
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-extrabold text-blue-950">{ev.titulo}</h3>
                    {ev.descripcion && <p className="text-xs text-slate-600">{ev.descripcion}</p>}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="font-semibold">
                        Convoca: {ev.organizador_nombre} (Nivel {ev.organizador_nivel || 4})
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {ev.es_general_nivel ? <Globe size={13} className="text-indigo-500" /> : <Users size={13} className="text-violet-500" />}
                        {ev.es_general_nivel
                          ? ev.alcance === 'ubicacion'
                            ? `Sede ${ev.nombre_ubicacion || ''} + Invitados (${asistentes.length})`
                            : `Nivel ${ev.organizador_nivel || 4} o inferior (${asistentes.length} directos)`
                          : `${asistentes.length} invitado(s)`}
                      </span>
                      {temas.length > 0 && (
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-700">
                          <Target size={13} />
                          {temas.length} tema(s)/objetivo(s) ({temasOk} cumplidos)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {ev.enlace_videollamada && (
                      <a
                        href={ev.enlace_videollamada}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-200"
                      >
                        <Video size={14} />
                        <span>Unirse</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => abrirModalDetalle(ev)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      {puedeEditarEsta && editablePorTiempo ? <Edit3 size={14} /> : <Target size={14} />}
                      <span>{puedeEditarEsta && editablePorTiempo ? 'Ver / Editar' : 'Ver Detalle y Temas'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL DETALLE / CREAR / EDITAR REUNIÓN */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div>
                <h2 className="text-lg font-extrabold text-blue-950">
                  {modoModal === 'crear'
                    ? 'Agendar Nueva Reunión'
                    : modoModal === 'editar'
                    ? 'Editar Reunión, Invitados y Objetivos'
                    : reunionSeleccionada?.titulo || 'Detalle de la Reunión'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modoModal === 'crear'
                    ? `Jerarquía: solo puedes invitar usuarios de tu Nivel ${miNivel} o inferior.`
                    : `Convocada por ${reunionSeleccionada?.organizador_nombre || ''} (Nivel ${reunionSeleccionada?.organizador_nivel || 4})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="overflow-y-auto p-6 space-y-5 flex-1">
              {/* BANNER DE VENTANA DE EDICIÓN (MÁXIMO 10 MIN ANTES) */}
              {reunionSeleccionada && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                    edicionDesbloqueadaPorTiempo
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {edicionDesbloqueadaPorTiempo ? (
                      <>
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>
                          Edición habilitada: faltan {Math.max(0, Math.floor(minutosRestantesSel))} min para iniciar (límite hasta 10 min antes).
                        </span>
                      </>
                    ) : (
                      <>
                        <Lock size={16} className="text-amber-700 shrink-0" />
                        <span>
                          Edición bloqueada: solo se puede editar hasta 10 minutos antes del inicio de la reunión.
                        </span>
                      </>
                    )}
                  </div>
                  {modoModal === 'ver' &&
                    puedeUsuarioEditarEstaReunion(reunionSeleccionada) &&
                    edicionDesbloqueadaPorTiempo && (
                      <button
                        type="button"
                        onClick={pasarAEditar}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>Editar Reunión</span>
                      </button>
                    )}
                </div>
              )}

              {/* CAMPOS PRINCIPALES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Título *</label>
                    <input
                      type="text"
                      required
                      disabled={esSoloLectura}
                      value={form.titulo}
                      onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                      placeholder="Ej: Revisión semanal de ventas y despacho"
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tipo</label>
                    <select
                      disabled={esSoloLectura}
                      value={form.tipo_evento}
                      onChange={(e) => setForm({ ...form, tipo_evento: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white disabled:bg-slate-50"
                    >
                      <option value="reunion">Reunión Programada</option>
                      <option value="imprevisto">Imprevisto / Urgente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Inicio *</label>
                  <input
                    type="datetime-local"
                    required
                    disabled={esSoloLectura}
                    value={form.fecha_hora_inicio}
                    onChange={(e) => setForm({ ...form, fecha_hora_inicio: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fin *</label>
                  <input
                    type="datetime-local"
                    required
                    disabled={esSoloLectura}
                    value={form.fecha_hora_fin}
                    onChange={(e) => setForm({ ...form, fecha_hora_fin: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Enlace Videollamada (Opcional)</label>
                  <input
                    type="url"
                    disabled={esSoloLectura}
                    value={form.enlace_videollamada}
                    onChange={(e) => setForm({ ...form, enlace_videollamada: e.target.value })}
                    placeholder="https://meet.google.com/..."
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Sala (Opcional)</label>
                    <select
                      disabled={esSoloLectura}
                      value={form.id_sala}
                      onChange={(e) => setForm({ ...form, id_sala: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white disabled:bg-slate-50"
                    >
                      <option value="">Sin sala física</option>
                      {salas.map((s) => (
                        <option key={s.id_sala} value={s.id_sala}>
                          {s.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Estado</label>
                    <select
                      disabled={esSoloLectura || modoModal === 'crear'}
                      value={form.estado}
                      onChange={(e) => setForm({ ...form, estado: e.target.value })}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white disabled:bg-slate-50"
                    >
                      <option value="PROGRAMADA">Programada</option>
                      <option value="EN_CURSO">En curso</option>
                      <option value="FINALIZADA">Finalizada</option>
                      <option value="CANCELADA">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Descripción / Notas</label>
                  <textarea
                    rows={2}
                    disabled={esSoloLectura}
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Contexto breve de la reunión..."
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* TEMAS U OBJETIVOS A TRATAR */}
              <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target size={18} className="text-indigo-700" />
                    <div>
                      <h4 className="text-sm font-bold text-blue-950">Temas y Objetivos a Tratar</h4>
                      <p className="text-[11px] text-slate-500">
                        {form.temas_objetivos.length} objetivo(s) registrado(s)
                      </p>
                    </div>
                  </div>
                </div>

                {!esSoloLectura && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoTemaTexto}
                      onChange={(e) => setNuevoTemaTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          agregarTema();
                        }
                      }}
                      placeholder="Escribe un tema u objetivo (ej: Revisar cartera de facturas vencidas)..."
                      className="flex-1 border border-slate-300 bg-white rounded-xl px-3.5 py-2 text-xs sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={agregarTema}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      + Agregar
                    </button>
                  </div>
                )}

                {form.temas_objetivos.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No se agregaron temas u objetivos específicos.</p>
                ) : (
                  <ul className="space-y-2">
                    {form.temas_objetivos.map((tema, idx) => (
                      <li
                        key={tema.id}
                        className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200"
                      >
                        <button
                          type="button"
                          disabled={esSoloLectura}
                          onClick={() => toggleTemaCompletado(tema.id)}
                          className="text-indigo-600 disabled:opacity-60 cursor-pointer shrink-0"
                          title="Marcar tema como tratado/cumplido"
                        >
                          {tema.completado ? <CheckSquare size={18} /> : <Square size={18} className="text-slate-400" />}
                        </button>
                        <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}.</span>
                        {esSoloLectura ? (
                          <span className={`text-xs sm:text-sm flex-1 ${tema.completado ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                            {tema.titulo}
                          </span>
                        ) : (
                          <input
                            type="text"
                            value={tema.titulo}
                            onChange={(e) => actualizarTituloTema(tema.id, e.target.value)}
                            className={`flex-1 text-xs sm:text-sm bg-transparent border-b border-transparent focus:border-indigo-400 focus:outline-hidden ${
                              tema.completado ? 'line-through text-slate-400' : 'text-slate-800 font-medium'
                            }`}
                          />
                        )}
                        {!esSoloLectura && (
                          <button
                            type="button"
                            onClick={() => eliminarTema(tema.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
                            title="Quitar tema"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* SELECTOR JERÁRQUICO DE PARTICIPANTES Y VISIBILIDAD */}
              <div className="bg-violet-50/50 border border-violet-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-violet-700" />
                    <div>
                      <h4 className="text-sm font-bold text-blue-950">Participantes y Visibilidad Jerárquica</h4>
                      <p className="text-[11px] text-slate-600">
                        Solo puedes elegir personas con rango igual o inferior al tuyo (Nivel {miNivel} o mayor).
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-bold">
                    {form.asistentes_ids.length} seleccionado(s)
                  </span>
                </div>

                {/* Alcance opcional general para nivel <= organizador */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <label className={`flex items-center gap-2 text-xs font-bold text-slate-700 ${esSoloLectura ? '' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      disabled={esSoloLectura}
                      checked={form.es_general_nivel}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          es_general_nivel: e.target.checked,
                          alcance: e.target.checked ? (form.alcance === 'ubicacion' ? 'ubicacion' : 'general') : 'invitados'
                        })
                      }
                      className="w-4 h-4 rounded text-violet-600"
                    />
                    <span>Hacer visible también como reunión general para mi nivel o inferior</span>
                  </label>

                  {form.es_general_nivel && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        disabled={esSoloLectura}
                        value={form.alcance === 'ubicacion' ? 'ubicacion' : 'general'}
                        onChange={(e) => setForm({ ...form, alcance: e.target.value })}
                        className="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                      >
                        <option value="general">🌐 Todas las sedes (Nivel {miNivel}+)</option>
                        <option value="ubicacion">📍 Solo una sede específica (Nivel {miNivel}+)</option>
                      </select>
                      {form.alcance === 'ubicacion' && (
                        <select
                          disabled={esSoloLectura}
                          value={form.id_ubicacion}
                          onChange={(e) => setForm({ ...form, id_ubicacion: e.target.value })}
                          className="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                        >
                          <option value="">Selecciona sede...</option>
                          {ubicaciones.map((ub) => (
                            <option key={ub.id_ubicacion} value={ub.id_ubicacion}>
                              {ub.nombre}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                {/* Lista de usuarios elegibles */}
                {!esSoloLectura ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={busquedaInvitado}
                          onChange={(e) => setBusquedaInvitado(e.target.value)}
                          placeholder="Buscar usuario o rol..."
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <select
                        value={filtroSedeInvitado}
                        onChange={(e) => setFiltroSedeInvitado(e.target.value)}
                        className="border border-slate-300 bg-white rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                      >
                        <option value="todas">Todas las sedes</option>
                        {ubicaciones.map((ub) => (
                          <option key={ub.id_ubicacion} value={ub.id_ubicacion}>
                            {ub.nombre}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={seleccionarTodosVisibles}
                        className="px-2.5 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-800 text-xs font-bold cursor-pointer"
                      >
                        Marcar visibles
                      </button>
                      <button
                        type="button"
                        onClick={limpiarInvitados}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                      >
                        Limpiar
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                      {invitablesFiltrados.map((u) => {
                        const marcado = form.asistentes_ids.includes(Number(u.id_usuario));
                        return (
                          <label
                            key={u.id_usuario}
                            className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 cursor-pointer transition-colors ${
                              marcado
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-950'
                                : 'bg-white border-slate-200 hover:border-violet-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => toggleInvitado(u.id_usuario)}
                              className="mt-0.5 rounded text-indigo-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold truncate">{u.nombre_completo}</p>
                              <p className="text-[11px] text-slate-500 truncate">
                                N{u.nivel_jerarquia} · {u.nombre_rol}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                <MapPin size={10} /> {u.nombre_ubicacion}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(reunionSeleccionada?.asistentes || []).length === 0 ? (
                      <span className="text-xs text-slate-500 italic">
                        {reunionSeleccionada?.es_general_nivel
                          ? 'Reunión general abierta al nivel correspondiente (sin lista nominal específica).'
                          : 'Sin invitados asignados.'}
                      </span>
                    ) : (
                      (reunionSeleccionada?.asistentes || []).map((a) => (
                        <span
                          key={a.id_usuario}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-violet-200 text-xs font-semibold text-slate-800"
                        >
                          <span>{a.nombre_completo}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-violet-100 text-violet-800 font-bold">
                            N{a.nivel_jerarquia} · {a.nombre_rol}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold cursor-pointer"
                >
                  Cerrar
                </button>
                {!esSoloLectura && (
                  <button
                    type="submit"
                    disabled={guardando}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                  >
                    {guardando
                      ? 'Guardando...'
                      : modoModal === 'editar'
                      ? 'Guardar Cambios'
                      : 'Guardar Reunión'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
