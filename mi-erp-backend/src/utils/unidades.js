/**
 * Determina si un producto o unidad de medida corresponde a unidades enteras ("Unidad" / NIU / und).
 */
function esUnidadSoloEnteros(item) {
    if (!item) return false;
    const codigo = String(item.codigo_unidad || item.codigo || '').trim().toUpperCase();
    const simbolo = String(item.simbolo_unidad || item.simbolo || '').trim().toLowerCase();
    const nombre = String(item.unidad_medida || item.unidad_medida_nombre || item.nombre || '').trim().toLowerCase();

    if (codigo === 'NIU') return true;
    if (simbolo === 'und' || simbolo === 'u' || simbolo === 'unidad' || simbolo === 'unidades') return true;
    if (nombre === 'unidad' || nombre === 'unidades' || nombre === 'und') return true;
    return false;
}

function parsearCantidadPorUnidad(valor, item) {
    const limpio = String(valor ?? '').trim().replace(',', '.');
    const numero = Number(limpio);
    if (!Number.isFinite(numero) || numero <= 0) {
        return { valido: false, numero, mensaje: 'La cantidad debe ser mayor a cero.' };
    }
    if (esUnidadSoloEnteros(item) && !Number.isInteger(numero)) {
        const nomProd = item?.nombre_producto || item?.nombre || 'Este producto';
        const simb = item?.simbolo_unidad || item?.simbolo || 'und';
        return {
            valido: false,
            numero,
            mensaje: `El producto "${nomProd}" se mide en Unidad (${simb}) y solo acepta números enteros.`
        };
    }
    return { valido: true, numero, mensaje: '' };
}

module.exports = { esUnidadSoloEnteros, parsearCantidadPorUnidad };
