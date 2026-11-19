const pool = require('../config/db');

const requierePermiso = (modulo, accion) => {
    return async (req, res, next) => {
        try {
            if (!req.usuario || !req.usuario.nombre_rol) {
                return res.status(401).json({ exito: false, mensaje: "No autorizado. Faltan datos del usuario." });
            }

            const nombre_rol = req.usuario.nombre_rol;

            // Admin Central siempre tiene acceso absoluto
            if (nombre_rol === 'Admin Central') {
                return next();
            }

            const modulos = (Array.isArray(modulo) ? modulo : [modulo]).map(m => String(m).toLowerCase());
            const etiquetaModulo = modulos.join(' / ');

            const query = `
                SELECT 
                    COALESCE(BOOL_OR(rp.puede_ver), FALSE) AS puede_ver,
                    COALESCE(BOOL_OR(rp.puede_editar), FALSE) AS puede_editar,
                    COUNT(*) AS total
                FROM roles_permisos rp
                JOIN roles r ON rp.rol_id = r.id_rol
                JOIN permisos p ON rp.permiso_id = p.id
                WHERE r.nombre = $1 AND LOWER(p.modulo) = ANY($2::text[]);
            `;
            
            const { rows } = await pool.query(query, [nombre_rol, modulos]);

            if (!rows[0] || Number(rows[0].total) === 0) {
                return res.status(403).json({ 
                    exito: false, 
                    mensaje: `Acceso restringido: No tienes permisos configurados para la sección "${etiquetaModulo}".` 
                });
            }

            const permisos = rows[0];

            if (accion === 'ver' && !permisos.puede_ver) {
                return res.status(403).json({ 
                    exito: false, 
                    mensaje: `Acceso restringido: No tienes permiso para ver la sección "${etiquetaModulo}".` 
                });
            }

            if (accion === 'editar' && !permisos.puede_editar) {
                return res.status(403).json({ 
                    exito: false, 
                    mensaje: `Acceso restringido: No tienes permiso para crear o modificar datos en "${etiquetaModulo}".` 
                });
            }

            next();
        } catch (error) {
            console.error("Error al verificar permisos:", error);
            res.status(500).json({ exito: false, mensaje: "Error interno al verificar permisos." });
        }
    };
};

module.exports = requierePermiso;
