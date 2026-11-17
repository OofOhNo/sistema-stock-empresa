/**
 * Utilidades para distinguir unidades enteras ("Unidad" / NIU / und) frente a unidades decimales (kg, L, etc.).
 */
export function esUnidadSoloEnteros(item) {
  if (!item) return false;
  const codigo = String(item.codigo_unidad || item.codigo || '').trim().toUpperCase();
  const simbolo = String(item.simbolo_unidad || item.simbolo || '').trim().toLowerCase();
  const nombre = String(item.unidad_medida || item.unidad_medida_nombre || item.nombre || '').trim().toLowerCase();

  if (codigo === 'NIU') return true;
  if (simbolo === 'und' || simbolo === 'u' || simbolo === 'unidad' || simbolo === 'unidades') return true;
  if (nombre === 'unidad' || nombre === 'unidades' || nombre === 'und') return true;
  return false;
}

export function obtenerInfoUnidad(item) {
  const esEntero = esUnidadSoloEnteros(item);
  const nombre = item?.unidad_medida_nombre || item?.unidad_medida || item?.nombre_unidad || (esEntero ? 'Unidad' : 'Kilogramo');
  const simbolo = item?.simbolo_unidad || item?.simbolo || (esEntero ? 'und' : 'kg');
  return {
    nombre,
    simbolo,
    esEntero
  };
}

export function parsearCantidadPorUnidad(valor, item) {
  const limpio = String(valor ?? '').trim().replace(',', '.');
  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero <= 0) {
    return { valido: false, numero, mensaje: 'Ingresa una cantidad mayor a cero.' };
  }
  const info = obtenerInfoUnidad(item);
  if (info.esEntero && !Number.isInteger(numero)) {
    const nombreProd = item?.nombre_producto || item?.nombre || 'Este producto';
    return {
      valido: false,
      numero,
      mensaje: `"${nombreProd}" se mide en ${info.nombre} (${info.simbolo}): ingresa un número entero (sin decimales).`
    };
  }
  return { valido: true, numero, mensaje: '' };
}
