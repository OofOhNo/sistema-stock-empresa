export const OPCIONES_DURACION_SESION = [
  { value: '', label: 'Sin límite automático (no cierra por tiempo)' },
  { value: '30', label: 'Cada 30 minutos' },
  { value: '60', label: 'Cada 1 hora' },
  { value: '120', label: 'Cada 2 horas' },
  { value: '240', label: 'Cada 4 horas' },
  { value: '480', label: 'Cada 8 horas (1 turno)' },
  { value: '720', label: 'Cada 12 horas' },
  { value: '1440', label: 'Cada 24 horas (1 día)' },
  { value: '4320', label: 'Cada 3 días' },
  { value: '10080', label: 'Cada 7 días' }
];

export function formatearDuracionSesionLegible(minutos) {
  const num = Number(minutos);
  if (!num || Number.isNaN(num) || num <= 0) {
    return 'Sin límite automático';
  }
  if (num % 1440 === 0) {
    const dias = num / 1440;
    return `Cada ${dias} día${dias === 1 ? '' : 's'}`;
  }
  if (num % 60 === 0) {
    const horas = num / 60;
    return `Cada ${horas} hora${horas === 1 ? '' : 's'}`;
  }
  return `Cada ${num} min`;
}
