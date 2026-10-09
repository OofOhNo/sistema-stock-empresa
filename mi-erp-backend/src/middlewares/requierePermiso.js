const pool = require('../config/db');

const requierePermiso = (modulo, accion) => {
    return async (req, res, next) => {
        try {
            if (!req.usuario || !req.usuario.nombre_rol) {
                return res.status(401).json({ exito: false, mensaje: "No autorizado. Faltan datos del usuario." });
            }

            const nombre_rol = req.usuario.nombre_rol;

            const query = `
                SELECT rp.puede_ver, rp.puede_editar
                FROM roles_permisos rp
                JOIN roles r ON rp.rol_id = r.id_rol
                JOIN permisos p ON rp.permiso_id = p.id
                WHERE r.nombre = $1 AND p.modulo = $2
            `;
            
            const { rows } = await pool.query(query, [nombre_rol, modulo]);

            if (rows.length === 0) {
                if (nombre_rol === 'Admin Central') {
                    return next();
                }
                return res.status(403).json({ exito: false, mensaje: `No tienes permisos configurados para el mdulo ${modulo}.` });
            }

            const permisos = rows[0];

            if (accion === 'ver' && !permisos.puede_ver) {
                if (nombre_rol === 'Admin Central') return next();
                return res.status(403).json({ exito: false, mensaje: `No tienes permiso para ver el mdulo ${modulo}.` });
            }

            if (accion === 'editar' && !permisos.puede_editar) {
                if (nombre_rol === 'Admin Central') return next();
                return res.status(403).json({ exito: false, mensaje: `No tienes permiso para editar en el mdulo ${modulo}.` });
            }

            next();
        } catch (error) {
            console.error("Error al verificar permisos:", error);
            res.status(500).json({ exito: false, mensaje: "Error interno al verificar permisos." });
        }
    };
};

module.exports = requierePermiso;

