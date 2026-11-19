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
               r.duracion_sesion_minutos
        FROM usuarios u
        LEFT JOIN roles r ON u.rol_id = r.id_rol
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

    if (decodificado?.id_usuario) {
        let estadoUsuario;
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

    req.usuario = decodificado;
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
