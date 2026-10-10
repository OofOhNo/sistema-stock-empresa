const pool = require('../config/db');

const auditoriaController = {
    listar: async (req, res) => {
        try {
            const { entidad, accion, limit = 100 } = req.query;
            let query = `
                SELECT 
                    a.id_auditoria,
                    a.id_usuario,
                    u.nombre_completo AS usuario_nombre,
                    u.email AS usuario_email,
                    r.nombre AS usuario_rol,
                    a.accion,
                    a.entidad,
                    a.id_entidad,
                    a.antes,
                    a.despues,
                    a.fecha
                FROM auditoria a
                LEFT JOIN usuarios u ON a.id_usuario = u.id_usuario
                LEFT JOIN roles r ON u.rol_id = r.id_rol
            `;
            const params = [];
            const where = [];

            if (entidad) {
                params.push(entidad);
                where.push(`a.entidad = $${params.length}`);
            }
            if (accion) {
                params.push(accion);
                where.push(`a.accion = $${params.length}`);
            }

            if (where.length > 0) {
                query += ` WHERE ${where.join(' AND ')}`;
            }

            query += ` ORDER BY a.id_auditoria DESC LIMIT $${params.length + 1};`;
            params.push(Number(limit));

            const { rows } = await pool.query(query, params);
            res.json({ exito: true, total: rows.length, datos: rows });
        } catch (error) {
            console.error('Error al consultar auditoría:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al consultar logs de auditoría', error: error.message });
        }
    }
};

module.exports = auditoriaController;

