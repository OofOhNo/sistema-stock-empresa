const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Guardia 1: verifica si la persona tiene un token válido y si no excedió el tiempo de sesión de su rol
const verificarToken = async (req, res, next) => {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({
            exito: false,
            mensaje: 'Acceso denegado. No enviaste un token de seguridad.'
        });
    }

    try {
        const tokenLimpio = token.replace('Bearer ', '');
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);

        if (decodificado?.id_usuario) {
            const resRol = await pool.query(`
                SELECT COALESCE(u.activo, true) AS activo,
                       r.duracion_sesion_minutos
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                WHERE u.id_usuario = $1::int
            `, [decodificado.id_usuario]);

            if (resRol.rows.length === 0 || !resRol.rows[0].activo) {
                return res.status(401).json({
                    exito: false,
                    mensaje: 'Tu cuenta de usuario ya no está activa. Pide ayuda al administrador.'
                });
            }

            const duracionMin = resRol.rows[0].duracion_sesion_minutos;
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
        next();
    } catch {
        res.status(401).json({ exito: false, mensaje: 'El token es inválido o ya expiró.' });
    }
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

module.exports = { verificarToken, esAdmin };
