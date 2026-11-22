const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Cache ligera (15s) para evitar saturar el pool de PostgreSQL en ráfagas paralelas de peticiones
const CACHE_TTL_MS = 15000;
const cacheSesionUsuario = new Map();

function invalidarCacheSesionUsuario(idUsuario) {
    if (idUsuario !== undefined && idUsuario !== null) {
        cacheSesionUsuario.delete(Number(idUsuario));
    }
}

function invalidarCacheSesionTodos() {
    cacheSesionUsuario.clear();
}

async function obtenerEstadoSesionUsuario(idUsuario) {
    const clave = Number(idUsuario);
    const cached = cacheSesionUsuario.get(clave);
    if (cached && cached.expira > Date.now()) {
        return cached.datos;
    }

    const resRol = await pool.query(`
        SELECT COALESCE(u.activo, true) AS activo,
               u.password_actualizada_en,
               COALESCE(u.token_version, 1)::int AS token_version,
               u.rol_id,
               r.nombre AS nombre_rol,
               COALESCE(r.puede_ver_otras_ubicaciones, false) AS puede_ver_otras_ubicaciones,
               u.id_ubicacion,
               ub.nombre AS nombre_ubicacion,
               u.area,
               COALESCE(u.seccion_facturacion, 'AMBAS') AS seccion_facturacion,
               COALESCE(u.puede_ver_celulares, false) AS puede_ver_celulares,
               r.duracion_sesion_minutos,
               COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END) AS nivel_jerarquia
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id_rol
        LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
        WHERE u.id_usuario = $1::int
    `, [clave]);

    const datos = resRol.rows[0] || null;
    cacheSesionUsuario.set(clave, {
        datos,
        expira: Date.now() + CACHE_TTL_MS
    });
    return datos;
}

// Guardia 1: verifica si la persona tiene un token válido y si no excedió el tiempo de sesión de su rol
const verificarToken = async (req, res, next) => {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({
            exito: false,
            mensaje: 'Acceso denegado. No enviaste un token de seguridad.'
        });
    }

    let decodificado;
    try {
        const tokenLimpio = token.replace('Bearer ', '');
        decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ exito: false, mensaje: 'El token es inválido o ya expiró.' });
    }

    let estadoUsuario = null;
    if (decodificado?.id_usuario) {
        try {
            estadoUsuario = await obtenerEstadoSesionUsuario(decodificado.id_usuario);
        } catch (dbErr) {
            console.error('Error temporal consultando sesión de usuario en BD:', dbErr.message);
            // Nunca devolver 401 por una caída temporal de BD para no cerrar la sesión válidamente activa
            return res.status(503).json({
                exito: false,
                mensaje: 'El servidor está ocupado temporalmente. Intenta de nuevo en unos segundos.'
            });
        }

        if (!estadoUsuario || !estadoUsuario.activo) {
            return res.status(401).json({
                exito: false,
                mensaje: 'Tu cuenta de usuario ya no está activa. Pide ayuda al administrador.'
            });
        }

        // Invalidar sesiones emitidas antes de un cambio o restablecimiento de contraseña
        if (decodificado.token_version !== undefined) {
            if (Number(decodificado.token_version) !== Number(estadoUsuario.token_version || 1)) {
                return res.status(401).json({
                    exito: false,
                    codigo: 'PASSWORD_ACTUALIZADA',
                    mensaje: 'Tu sesión expiró porque la contraseña de la cuenta fue cambiada. Inicia sesión nuevamente.'
                });
            }
        } else if (estadoUsuario.password_actualizada_en) {
            const pwdMs = new Date(estadoUsuario.password_actualizada_en).getTime();
            const tokenEmitidoMs = (Number(decodificado.iat) || 0) * 1000;
            if (tokenEmitidoMs < pwdMs) {
                return res.status(401).json({
                    exito: false,
                    codigo: 'PASSWORD_ACTUALIZADA',
                    mensaje: 'Tu sesión expiró porque la contraseña de la cuenta fue cambiada. Inicia sesión nuevamente.'
                });
            }
        }

        const duracionMin = estadoUsuario.duracion_sesion_minutos;
        if (duracionMin && Number(duracionMin) > 0) {
            const loginAt = Number(decodificado.login_at) || (Number(decodificado.iat) * 1000);
            if (loginAt && (Date.now() - loginAt) >= Number(duracionMin) * 60 * 1000) {
                return res.status(401).json({
                    exito: false,
                    codigo: 'SESION_ROL_EXPIRADA',
                    mensaje: 'Tu sesión expiró por el tiempo límite configurado para tu rol. Por favor vuelve a iniciar sesión.'
                });
            }
        }
    }

    const nombreRolActual = estadoUsuario?.nombre_rol || decodificado?.nombre_rol;
    const nivelJerarquia = nombreRolActual === 'Admin Central'
        ? 1
        : Number(estadoUsuario?.nivel_jerarquia || decodificado?.nivel_jerarquia || 4);

    req.usuario = {
        ...decodificado,
        rol_id: estadoUsuario?.rol_id ?? decodificado?.rol_id,
        nombre_rol: nombreRolActual,
        id_ubicacion: estadoUsuario?.id_ubicacion ?? decodificado?.id_ubicacion,
        nombre_ubicacion: estadoUsuario?.nombre_ubicacion || decodificado?.nombre_ubicacion || 'Sede Central',
        area: estadoUsuario?.area || decodificado?.area || 'ADMINISTRACION',
        seccion_facturacion: estadoUsuario?.seccion_facturacion || decodificado?.seccion_facturacion || 'AMBAS',
        puede_ver_celulares: estadoUsuario
            ? (estadoUsuario.puede_ver_celulares === true || nombreRolActual === 'Admin Central')
            : decodificado?.puede_ver_celulares,
        puede_ver_otras_ubicaciones: estadoUsuario
            ? (estadoUsuario.puede_ver_otras_ubicaciones === true || nombreRolActual === 'Admin Central')
            : decodificado?.puede_ver_otras_ubicaciones,
        nivel_jerarquia: nivelJerarquia
    };
    return next();
};

// Guardia 2: verifica si el rol del usuario es "Admin Central"
const esAdmin = (req, res, next) => {
    if (req.usuario.nombre_rol !== 'Admin Central') {
        return res.status(403).json({
            exito: false,
            mensaje: 'Acceso prohibido. Se requieren permisos de Administrador.'
        });
    }

    next();
};

module.exports = {
    verificarToken,
    esAdmin,
    invalidarCacheSesionUsuario,
    invalidarCacheSesionTodos
};
