export const MINUTOS_POR_HORA = 60;
export const MINUTOS_POR_DIA = 1440;
export const MINUTOS_POR_MES = 43200; // 30 días estándar
export const MAX_DURACION_SESION_MINUTOS = 2628000; // Hasta 60 meses / 5 años

export const UNIDADES_DURACION_SESION = [
  { value: 'sin_limite', label: 'Sin cierre automático' },
  { value: 'min', label: 'Minutos' },
  { value: 'horas', label: 'Horas' },
  { value: 'dias', label: 'Días' },
  { value: 'meses', label: 'Meses' },
];

export const OPCIONES_DURACION_SESION = [
  { value: '', label: 'Sin límite (cierre manual)' },
  { value: 30, label: 'Cada 30 minutos' },
  { value: 60, label: 'Cada 1 hora' },
  { value: 240, label: 'Cada 4 horas' },
  { value: 480, label: 'Cada 8 horas (turno)' },
  { value: 720, label: 'Cada 12 horas' },
  { value: 1440, label: 'Cada 1 día (24 horas)' },
  { value: 10080, label: 'Cada 7 días (1 semana)' },
  { value: 43200, label: 'Cada 1 mes (30 días)' },
];

/**
 * Descompone minutos totales en { valor, unidad } eligiendo la unidad exacta más grande posible.
 */
export function descomponerDuracionSesion(minutos) {
  if (minutos === null || minutos === undefined || minutos === '' || Number(minutos) <= 0) {
    return { valor: '', unidad: 'sin_limite' };
  }
  const num = parseInt(minutos, 10);
  if (!Number.isFinite(num) || num <= 0) {
    return { valor: '', unidad: 'sin_limite' };
  }
  if (num % MINUTOS_POR_MES === 0) {
    return { valor: String(num / MINUTOS_POR_MES), unidad: 'meses' };
  }
  if (num % MINUTOS_POR_DIA === 0) {
    return { valor: String(num / MINUTOS_POR_DIA), unidad: 'dias' };
  }
  if (num % MINUTOS_POR_HORA === 0) {
    return { valor: String(num / MINUTOS_POR_HORA), unidad: 'horas' };
  }
  return { valor: String(num), unidad: 'min' };
}

/**
 * Convierte { valor, unidad } en minutos totales o null si no aplica límite.
 */
export function calcularMinutosDuracionSesion(valor, unidad) {
  if (!unidad || unidad === 'sin_limite') return null;
  const num = Number(valor);
  if (!Number.isFinite(num) || num <= 0) return null;
  const multiplicadores = {
    min: 1,
    horas: MINUTOS_POR_HORA,
    dias: MINUTOS_POR_DIA,
    meses: MINUTOS_POR_MES,
  };
  const factor = multiplicadores[unidad];
  if (!factor) return null;
  return Math.round(num * factor);
}

export function formatearDuracionSesionLegible(minutos) {
  if (minutos === null || minutos === undefined || minutos === '' || Number(minutos) <= 0) {
    return 'Sin límite (manual)';
  }
  const m = parseInt(minutos, 10);
  if (!Number.isFinite(m) || m <= 0) return 'Sin límite (manual)';

  if (m >= MINUTOS_POR_MES && m % MINUTOS_POR_MES === 0) {
    const meses = m / MINUTOS_POR_MES;
    return `Cada ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  }
  if (m >= MINUTOS_POR_DIA && m % MINUTOS_POR_DIA === 0) {
    const dias = m / MINUTOS_POR_DIA;
    return `Cada ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }
  if (m >= MINUTOS_POR_HORA && m % MINUTOS_POR_HORA === 0) {
    const horas = m / MINUTOS_POR_HORA;
    return `Cada ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  }
  if (m >= MINUTOS_POR_MES) {
    const meses = Math.floor(m / MINUTOS_POR_MES);
    const restoDias = Math.round((m % MINUTOS_POR_MES) / MINUTOS_POR_DIA);
    return restoDias > 0
      ? `Cada ${meses} ${meses === 1 ? 'mes' : 'meses'} y ${restoDias} d`
      : `Cada ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  }
  if (m >= MINUTOS_POR_DIA) {
    const dias = Math.floor(m / MINUTOS_POR_DIA);
    const restoHoras = Math.round((m % MINUTOS_POR_DIA) / MINUTOS_POR_HORA);
    return restoHoras > 0
      ? `Cada ${dias} ${dias === 1 ? 'día' : 'días'} y ${restoHoras} h`
      : `Cada ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }
  if (m >= MINUTOS_POR_HORA) {
    const horas = Math.floor(m / MINUTOS_POR_HORA);
    const restoMin = m % MINUTOS_POR_HORA;
    return `Cada ${horas} h ${restoMin} min`;
  }
  return `Cada ${m} min`;
}

export const MODULOS_SISTEMA_INFO = [
  { id: 'stock', nombre: 'Inventario y Stock', descripcion: 'Entradas, lotes, movimientos y trazabilidad por sede', categoria: 'Operaciones' },
  { id: 'productos', nombre: 'Productos', descripcion: 'Catálogo maestro, precios base y caducidad promedio', categoria: 'Operaciones' },
  { id: 'pedidos', nombre: 'Pedidos y Despachos', descripcion: 'Órdenes de compra/venta y seguimiento de entregas', categoria: 'Operaciones' },
  { id: 'clientes', nombre: 'Clientes', descripcion: 'Directorio comercial, RUC/DNI y contactos', categoria: 'Comercial' },
  { id: 'facturacion', nombre: 'Facturación y Guías', descripcion: 'Comprobantes electrónicos, GRE y registro de cobros', categoria: 'Comercial' },
  { id: 'calidad', nombre: 'Calidad y Sanidad', descripcion: 'Certificados sanitarios, auditorías y control inocuo', categoria: 'Control' },
  { id: 'ubicaciones', nombre: 'Sedes y Ubicaciones', descripcion: 'Almacenes, plantas de proceso y sucursales', categoria: 'Administración' },
  { id: 'organizacion', nombre: 'Organización y Turnos', descripcion: 'Áreas de planta, equipos y asignación de turnos', categoria: 'Administración' },
  { id: 'reuniones', nombre: 'Reuniones', descripcion: 'Agenda operativa, actas y seguimiento de acuerdos', categoria: 'Colaboración' },
  { id: 'calendario_pagos', nombre: 'Calendario de Pagos', descripcion: 'Obligaciones, vencimientos y alertas de tesorería', categoria: 'Comercial' },
  { id: 'usuarios', nombre: 'Personal y Roles', descripcion: 'Gestión de empleados, jerarquías y permisos', categoria: 'Administración' },
  { id: 'errores', nombre: 'Centro de Errores', descripcion: 'Logs de incidencias y diagnóstico técnico', categoria: 'Administración' },
  { id: 'mensajes', nombre: 'Mensajería', descripcion: 'Chat interno y grupos operativos con WhatsApp', categoria: 'Colaboración' },
];
