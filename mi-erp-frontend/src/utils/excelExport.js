import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

function limpiarNombreHoja(nombre) {
  const limpio = String(nombre || 'Datos').replace(/[\\/?*[\]:]/g, ' ').trim();
  return (limpio || 'Datos').slice(0, 31);
}

function limpiarNombreArchivo(nombre) {
  return String(nombre || 'reporte')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'reporte';
}

export function fechaLocalISO(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function fechaHoraLocalTexto(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('es-PE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Exporta los registros de una pestaña específica a un archivo .xlsx independiente.
 * @param {object} opts
 * @param {string} opts.nombreArchivo - Nombre base del archivo (sin extensión).
 * @param {string} [opts.nombreHoja] - Título de la hoja dentro del libro Excel.
 * @param {Array<object>} opts.filas - Arreglo de registros de la pestaña activa.
 * @param {Array<{header: string, key?: string, value?: (row: object, idx: number) => any}>} [opts.columnas] - Columnas ordenadas opcionales.
 */
export function exportarTablaExcel({ nombreArchivo, nombreHoja = 'Datos', filas = [], columnas = null }) {
  if (!Array.isArray(filas) || filas.length === 0) {
    toast.error('No hay registros en esta pestaña para exportar.');
    return false;
  }

  const datosMapeados = columnas && Array.isArray(columnas) && columnas.length > 0
    ? filas.map((fila, idx) => {
        const obj = {};
        for (const col of columnas) {
          const valor = typeof col.value === 'function'
            ? col.value(fila, idx)
            : fila?.[col.key];
          obj[col.header] = valor === null || valor === undefined ? '' : valor;
        }
        return obj;
      })
    : filas;

  const hoja = XLSX.utils.json_to_sheet(datosMapeados);
  const encabezados = Object.keys(datosMapeados[0] || {});
  hoja['!cols'] = encabezados.map((header) => {
    let maxLen = header.length;
    for (const fila of datosMapeados) {
      const len = String(fila[header] ?? '').length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 46) };
  });

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, limpiarNombreHoja(nombreHoja));

  const fechaHoy = fechaLocalISO(new Date());
  const archivoFinal = `${limpiarNombreArchivo(nombreArchivo)}_${fechaHoy}.xlsx`;
  XLSX.writeFile(libro, archivoFinal);
  toast.success(`Excel "${archivoFinal}" descargado (${datosMapeados.length} registros).`);
  return true;
}
