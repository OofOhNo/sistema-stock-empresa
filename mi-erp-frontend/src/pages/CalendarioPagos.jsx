import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import {
  CalendarDays, Plus, CheckCircle2, Clock, Trash2, Edit2,
  ChevronLeft, ChevronRight, Repeat, List, Calendar as CalendarIcon,
  DollarSign, AlertTriangle, X, RefreshCw
} from 'lucide-react';

const CATEGORIAS = [
  { id: 'SUELDOS', label: 'Sueldos y Planilla', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'PROVEEDORES', label: 'Proveedores', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'IMPUESTOS', label: 'Impuestos / SUNAT', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  { id: 'SERVICIOS', label: 'Servicios (Luz, Agua, Internet)', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'ALQUILER', label: 'Alquiler / Local', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  { id: 'BANCOS', label: 'Cuotas / Préstamos Bancarios', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'OTROS', label: 'Otros Pagos', color: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function obtenerHoyLimaISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

export default function CalendarioPagos({ usuario }) {
  const esAdminCentral = usuario?.rol === 'Admin Central';

  const ahora = new Date();
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [vista, setVista] = useState('calendario'); // 'calendario' | 'lista'
  const [pagos, setPagos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('TODOS');

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    titulo: '',
    categoria: 'SUELDOS',
    beneficiario: '',
    monto: '',
    moneda: 'PEN',
    fecha_vencimiento: obtenerHoyLimaISO(),
    recurrente_mensual: false,
    notas: ''
  });

  const cargarPagos = useCallback(async () => {
    if (!esAdminCentral) return;
    setCargando(true);
    try {
      const res = await api.get('/pagos-calendario', { params: { mes, anio } });
      setPagos(res.data?.pagos || []);
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al cargar calendario de pagos.');
    } finally {
      setCargando(false);
    }
  }, [esAdminCentral, mes, anio]);

  useEffect(() => {
    cargarPagos();
  }, [cargarPagos]);

  if (!esAdminCentral) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center">
        <AlertTriangle size={40} className="mx-auto text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Acceso Restringido</h2>
        <p className="text-sm text-slate-500 mt-1">
          El Calendario de Pagos es exclusivo para Administración Central.
        </p>
      </div>
    );
  }

  const cambiarMes = (delta) => {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes < 1) {
      nuevoMes = 12;
      nuevoAnio -= 1;
    } else if (nuevoMes > 12) {
      nuevoMes = 1;
      nuevoAnio += 1;
    }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
  };

  const abrirNuevoPago = (fechaISO = obtenerHoyLimaISO()) => {
    setEditando(null);
    setForm({
      titulo: '',
      categoria: 'SUELDOS',
      beneficiario: '',
      monto: '',
      moneda: 'PEN',
      fecha_vencimiento: fechaISO,
      recurrente_mensual: false,
      notas: ''
    });
    setModalAbierto(true);
  };

  const abrirEditarPago = (pago) => {
    setEditando(pago);
    setForm({
      titulo: pago.titulo || '',
      categoria: pago.categoria || 'SUELDOS',
      beneficiario: pago.beneficiario || '',
      monto: String(pago.monto || ''),
      moneda: pago.moneda || 'PEN',
      fecha_vencimiento: pago.fecha_vencimiento_iso || obtenerHoyLimaISO(),
      recurrente_mensual: Boolean(pago.recurrente_mensual),
      notas: pago.notas || ''
    });
    setModalAbierto(true);
  };

  const guardarPago = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) return toast.error('Ingresa un título para el pago.');
    if (!form.monto || Number(form.monto) < 0) return toast.error('Ingresa un monto válido.');

    setGuardando(true);
    try {
      const payload = { ...form, monto: Number(form.monto) };
      if (editando) {
        await api.put(`/pagos-calendario/${editando.id_pago}`, payload);
        toast.success('Pago actualizado.');
      } else {
        await api.post('/pagos-calendario', payload);
        toast.success('Pago programado en el calendario.');
      }
      setModalAbierto(false);
      cargarPagos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'Error al guardar el pago.');
    } finally {
      setGuardando(false);
    }
  };

  const toggleEstadoPago = async (pago) => {
    const nuevoEstado = pago.estado === 'PAGADO' ? 'PENDIENTE' : 'PAGADO';
    try {
      const res = await api.patch(`/pagos-calendario/${pago.id_pago}/estado`, { estado: nuevoEstado });
      toast.success(res.data?.mensaje || `Pago marcado como ${nuevoEstado}`);
      cargarPagos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo cambiar el estado.');
    }
  };

  const eliminarPago = async (pago) => {
    if (!window.confirm(`¿Eliminar "${pago.titulo}" del calendario?`)) return;
    try {
      await api.delete(`/pagos-calendario/${pago.id_pago}`);
      toast.success('Pago eliminado.');
      cargarPagos();
    } catch (err) {
      toast.error(err.response?.data?.mensaje || 'No se pudo eliminar.');
    }
  };

  const hoyISO = obtenerHoyLimaISO();
  const pagosFiltrados = pagos.filter((p) => (filtroEstado === 'TODOS' ? true : p.estado === filtroEstado));
  const totalPendienteSoles = pagos
    .filter((p) => p.estado === 'PENDIENTE' && p.moneda === 'PEN')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const totalPagadoSoles = pagos
    .filter((p) => p.estado === 'PAGADO' && p.moneda === 'PEN')
    .reduce((acc, p) => acc + Number(p.monto || 0), 0);
  const vencidosCount = pagos.filter((p) => p.estado === 'PENDIENTE' && p.fecha_vencimiento_iso < hoyISO).length;

  // Construir grilla mensual (lunes a domingo)
  const primerDiaMes = new Date(anio, mes - 1, 1);
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const offsetLunes = (primerDiaMes.getDay() + 6) % 7; // 0 = Lun .. 6 = Dom
  const celdasCalendario = [];
  for (let i = 0; i < offsetLunes; i++) celdasCalendario.push(null);
  for (let d = 1; d <= diasEnMes; d++) {
    const fechaISO = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const pagosDia = pagosFiltrados.filter((p) => p.fecha_vencimiento_iso === fechaISO);
    celdasCalendario.push({ dia: d, fechaISO, pagosDia });
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
            <CalendarDays size={24} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-blue-950">Calendario de Pagos</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Solo Admin Central
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Control de sueldos, proveedores, impuestos, alquileres y recordatorios automáticos en Inicio
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={cargarPagos}
            className="p-2.5 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
            title="Actualizar"
          >
            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
          </button>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setVista('calendario')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${vista === 'calendario' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'}`}
            >
              <CalendarIcon size={14} />
              <span>Calendario</span>
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${vista === 'lista' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'}`}
            >
              <List size={14} />
              <span>Lista</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => abrirNuevoPago()}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm shadow-sm cursor-pointer"
          >
            <Plus size={18} />
            <span>Programar Pago</span>
          </button>
        </div>
      </div>

      {/* KPIs del Mes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pendiente en {MESES[mes - 1]}</p>
            <p className="text-2xl font-black text-amber-600 mt-1">S/ {totalPendienteSoles.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock size={22} />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pagado en {MESES[mes - 1]}</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">S/ {totalPagadoSoles.toFixed(2)}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 size={22} />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vencidos Sin Pagar</p>
            <p className={`text-2xl font-black mt-1 ${vencidosCount > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
              {vencidosCount} {vencidosCount === 1 ? 'pago' : 'pagos'}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${vencidosCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
            <AlertTriangle size={22} />
          </div>
        </div>
      </div>

      {/* Controles de Mes y Filtro */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => cambiarMes(-1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-bold text-slate-800 min-w-[160px] text-center">
            {MESES[mes - 1]} {anio}
          </h2>
          <button
            type="button"
            onClick={() => cambiarMes(1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {['TODOS', 'PENDIENTE', 'PAGADO'].map((est) => (
            <button
              key={est}
              type="button"
              onClick={() => setFiltroEstado(est)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                filtroEstado === est
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {est === 'TODOS' ? 'Todos' : est === 'PENDIENTE' ? 'Pendientes' : 'Pagados'}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido: Calendario o Lista */}
      {vista === 'calendario' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <div className="min-w-[680px]">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-2.5 text-center text-xs font-bold text-slate-500 uppercase">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {celdasCalendario.map((celda, idx) => {
              if (!celda) {
                return <div key={`empty-${idx}`} className="min-h-[110px] bg-slate-50/40" />;
              }
              const esHoy = celda.fechaISO === hoyISO;
              return (
                <div
                  key={celda.fechaISO}
                  onClick={() => abrirNuevoPago(celda.fechaISO)}
                  className={`min-h-[115px] p-2 hover:bg-indigo-50/30 transition-colors cursor-pointer flex flex-col ${esHoy ? 'bg-indigo-50/50 ring-1 ring-inset ring-indigo-300' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${esHoy ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>
                      {celda.dia}
                    </span>
                    {celda.pagosDia.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-400">{celda.pagosDia.length}</span>
                    )}
                  </div>
                  <div className="space-y-1 overflow-y-auto max-h-[85px]">
                    {celda.pagosDia.map((p) => {
                      const vencido = p.estado === 'PENDIENTE' && p.fecha_vencimiento_iso < hoyISO;
                      return (
                        <div
                          key={p.id_pago}
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirEditarPago(p);
                          }}
                          className={`px-1.5 py-1 rounded-md text-[11px] font-semibold border truncate cursor-pointer ${
                            p.estado === 'PAGADO'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 line-through opacity-75'
                              : vencido
                              ? 'bg-rose-50 border-rose-300 text-rose-800'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                          title={`${p.titulo} - ${p.moneda === 'USD' ? '$' : 'S/'} ${Number(p.monto).toFixed(2)} (${p.estado})`}
                        >
                          <span className="font-bold">{p.moneda === 'USD' ? '$' : 'S/'}{Number(p.monto).toFixed(0)}</span> {p.titulo}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {pagosFiltrados.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <DollarSign size={40} className="mx-auto text-slate-300 mb-2" />
              No hay pagos registrados para este mes con el filtro actual.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                    <th className="py-3.5 px-5">Fecha</th>
                    <th className="py-3.5 px-5">Pago / Concepto</th>
                    <th className="py-3.5 px-5">Categoría</th>
                    <th className="py-3.5 px-5">Monto</th>
                    <th className="py-3.5 px-5">Estado</th>
                    <th className="py-3.5 px-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {pagosFiltrados.map((p) => {
                    const cat = CATEGORIAS.find((c) => c.id === p.categoria) || CATEGORIAS[6];
                    const vencido = p.estado === 'PENDIENTE' && p.fecha_vencimiento_iso < hoyISO;
                    return (
                      <tr key={p.id_pago} className="hover:bg-slate-50">
                        <td className="py-3.5 px-5 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                          {p.fecha_vencimiento_iso}
                          {p.fecha_vencimiento_iso === hoyISO && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">HOY</span>
                          )}
                          {vencido && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px]">VENCIDO</span>
                          )}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                            <span>{p.titulo}</span>
                            {p.recurrente_mensual && (
                              <Repeat size={13} className="text-indigo-500" title="Recurrente cada mes" />
                            )}
                          </div>
                          {p.beneficiario && <div className="text-xs text-slate-500">{p.beneficiario}</div>}
                        </td>
                        <td className="py-3.5 px-5">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${cat.color}`}>
                            {cat.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 font-mono font-bold text-slate-900">
                          {p.moneda === 'USD' ? '$ ' : 'S/ '}{Number(p.monto || 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-5">
                          <button
                            type="button"
                            onClick={() => toggleEstadoPago(p)}
                            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer ${
                              p.estado === 'PAGADO'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            }`}
                          >
                            {p.estado === 'PAGADO' ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                            <span>{p.estado === 'PAGADO' ? 'PAGADO' : 'PENDIENTE'}</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => abrirEditarPago(p)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                            title="Editar"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarPago(p)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Crear / Editar Pago */}
      {modalAbierto && (
        <div
          onClick={() => !guardando && setModalAbierto(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-6"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <CalendarDays className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold text-blue-950">
                  {editando ? 'Editar Pago Programado' : 'Programar Nuevo Pago'}
                </h3>
              </div>
              <button type="button" onClick={() => setModalAbierto(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={guardarPago} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Concepto / Título *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Pago de Sueldos Quincena, Pago Proveedor Res..."
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Categoría</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Fecha de Vencimiento *</label>
                  <input
                    type="date"
                    required
                    value={form.fecha_vencimiento}
                    onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Moneda</label>
                  <select
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="PEN">Soles (S/)</option>
                    <option value="USD">Dólares ($)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Beneficiario / Persona (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Personal Planta, SUNAT, Frigorífico Sur..."
                  value={form.beneficiario}
                  onChange={(e) => setForm({ ...form, beneficiario: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <label className="flex items-center space-x-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.recurrente_mensual}
                  onChange={(e) => setForm({ ...form, recurrente_mensual: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Pago recurrente todos los meses</span>
                  <span className="text-[11px] text-slate-500">Al marcarlo como Pagado, se programará automáticamente para el mes siguiente.</span>
                </div>
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notas (Opcional)</label>
                <textarea
                  rows={2}
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Nro de cuenta, referencia o detalles..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {editando ? (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await toggleEstadoPago(editando);
                        setModalAbierto(false);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                        editando.estado === 'PAGADO'
                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {editando.estado === 'PAGADO' ? 'Marcar Pendiente' : 'Marcar como Pagado'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await eliminarPago(editando);
                        setModalAbierto(false);
                      }}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                      title="Eliminar pago"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : <div />}
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setModalAbierto(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
