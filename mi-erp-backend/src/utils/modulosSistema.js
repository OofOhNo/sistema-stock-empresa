const MODULOS_CANONICOS = [
    'stock',
    'productos',
    'clientes',
    'pedidos',
    'facturacion',
    'calidad',
    'ubicaciones',
    'organizacion',
    'reuniones',
    'calendario_pagos',
    'usuarios',
    'errores',
    'mensajes',
];

const SET_MODULOS_CANONICOS = new Set(MODULOS_CANONICOS);

// 1 mes = 30 días (43,200 min); tope: 60 meses (~5 años)
const MAX_DURACION_SESION_MINUTOS = 2628000;

const normalizarDuracionSesionMinutos = (valor) => {
    if (valor === null || valor === undefined || valor === '') {
        return { ok: true, minutos: null };
    }
    const num = Number(valor);
    if (!Number.isInteger(num) || num < 1 || num > MAX_DURACION_SESION_MINUTOS) {
        return {
            ok: false,
            mensaje: `La duración de sesión debe ser un entero entre 1 minuto y 60 meses (${MAX_DURACION_SESION_MINUTOS} minutos), o quedar sin límite.`,
        };
    }
    return { ok: true, minutos: num };
};

const normalizarNivelJerarquia = (valor, defaultNivel = 4) => {
    if (valor === undefined || valor === null || valor === '') {
        return { ok: true, nivel: defaultNivel };
    }
    const num = Number(valor);
    if (!Number.isInteger(num) || num < 1 || num > 10) {
        return {
            ok: false,
            mensaje: 'El nivel jerárquico debe ser un número entero entre 1 y 10.',
        };
    }
    return { ok: true, nivel: num };
};

/**
 * Normaliza la lista u objeto de permisos por módulo para los 13 módulos canónicos.
 * Si un módulo tiene `puede_editar = true`, fuerza `puede_ver = true`.
 *
 * @param {Array|Object|null|undefined} permisosInput
 * @param {Record<string, {puede_ver: boolean, puede_editar: boolean}>|null} fallbackMap
 * @returns {Array<{modulo: string, puede_ver: boolean, puede_editar: boolean}>}
 */
const normalizarPermisosCanonicamente = (permisosInput, fallbackMap = null) => {
    const provistos = new Map();

    if (Array.isArray(permisosInput)) {
        for (const item of permisosInput) {
            if (!item || typeof item !== 'object') continue;
            const mod = typeof item.modulo === 'string' ? item.modulo.trim() : '';
            if (!SET_MODULOS_CANONICOS.has(mod)) continue;
            const puedeEditar = Boolean(item.puede_editar);
            const puedeVer = Boolean(item.puede_ver) || puedeEditar;
            provistos.set(mod, { puede_ver: puedeVer, puede_editar: puedeEditar });
        }
    } else if (permisosInput && typeof permisosInput === 'object') {
        for (const [modKey, val] of Object.entries(permisosInput)) {
            if (!SET_MODULOS_CANONICOS.has(modKey) || !val || typeof val !== 'object') continue;
            const puedeEditar = Boolean(val.puede_editar);
            const puedeVer = Boolean(val.puede_ver) || puedeEditar;
            provistos.set(modKey, { puede_ver: puedeVer, puede_editar: puedeEditar });
        }
    }

    return MODULOS_CANONICOS.map((modulo) => {
        if (provistos.has(modulo)) {
            return { modulo, ...provistos.get(modulo) };
        }
        if (fallbackMap && fallbackMap[modulo]) {
            const puedeEditar = Boolean(fallbackMap[modulo].puede_editar);
            const puedeVer = Boolean(fallbackMap[modulo].puede_ver) || puedeEditar;
            return { modulo, puede_ver: puedeVer, puede_editar: puedeEditar };
        }
        const defaultMensajes = modulo === 'mensajes';
        return {
            modulo,
            puede_ver: defaultMensajes,
            puede_editar: defaultMensajes,
        };
    });
};

module.exports = {
    MODULOS_CANONICOS,
    SET_MODULOS_CANONICOS,
    MAX_DURACION_SESION_MINUTOS,
    normalizarDuracionSesionMinutos,
    normalizarNivelJerarquia,
    normalizarPermisosCanonicamente,
};
