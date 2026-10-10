const pool = require('../config/db');

const ErrorReporte = {
    obtenerTodos: async () => {
        try {
            const query = `
                SELECT 
                    e.id_error,
                    e.codigo_incidencia,
                    e.titulo,
                    e.descripcion,
                    e.area_modulo,
                    e.severidad,
                    e.estado,
                    e.id_usuario_reporta,
                    u1.nombre_completo AS nombre_reporta,
                    e.id_usuario_asigna,
                    u2.nombre_completo AS nombre_asigna,
                    e.id_pedido,
                    p.monto_total AS pedido_monto,
                    c.razon_social_o_nombre AS cliente_nombre,
                    e.solucion_adoptada,
                    e.fecha_reporte,
                    e.fecha_solucion
                FROM reportes_errores e
                LEFT JOIN usuarios u1 ON e.id_usuario_reporta = u1.id_usuario
                LEFT JOIN usuarios u2 ON e.id_usuario_asigna = u2.id_usuario
                LEFT JOIN pedidos p ON e.id_pedido = p.id_pedido
                LEFT JOIN clientes c ON p.id_cliente = c.id_cliente
                ORDER BY e.fecha_reporte DESC;
            `;
            const res = await pool.query(query);
            return res.rows;
        } catch (error) {
            throw error;
        }
    },

    obtenerPorId: async (id) => {
        try {
            const query = `
                SELECT e.*, u1.nombre_completo AS nombre_reporta, u2.nombre_completo AS nombre_asigna
                FROM reportes_errores e
                LEFT JOIN usuarios u1 ON e.id_usuario_reporta = u1.id_usuario
                LEFT JOIN usuarios u2 ON e.id_usuario_asigna = u2.id_usuario
                WHERE e.id_error = $1;
            `;
            const res = await pool.query(query, [id]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    crear: async ({
        codigo_incidencia,
        titulo,
        descripcion,
        area_modulo,
        severidad,
        id_usuario_reporta,
        id_usuario_asigna,
        id_pedido
    }) => {
        try {
            const codigoFinal = codigo_incidencia || `INC-${Date.now().toString().slice(-6)}`;
            const query = `
                INSERT INTO reportes_errores (
                    codigo_incidencia,
                    titulo,
                    descripcion,
                    area_modulo,
                    severidad,
                    estado,
                    id_usuario_reporta,
                    id_usuario_asigna,
                    id_pedido
                )
                VALUES ($1, $2, $3, $4, $5, 'PENDIENTE', $6, $7, $8)
                RETURNING *;
            `;
            const res = await pool.query(query, [
                codigoFinal,
                titulo,
                descripcion,
                area_modulo || 'General',
                severidad || 'MEDIA',
                id_usuario_reporta,
                id_usuario_asigna || null,
                id_pedido ? Number(id_pedido) : null
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    actualizar: async (id, datos) => {
        try {
            const {
                titulo,
                descripcion,
                area_modulo,
                severidad,
                estado,
                id_usuario_asigna,
                solucion_adoptada
            } = datos;

            // Si pasa a RESUELTO, sellar fecha_solucion
            let sqlFechaSolucion = '';
            if (estado === 'RESUELTO') {
                sqlFechaSolucion = ', fecha_solucion = COALESCE(fecha_solucion, CURRENT_TIMESTAMP)';
            } else if (estado && estado !== 'RESUELTO') {
                sqlFechaSolucion = ', fecha_solucion = NULL';
            }

            const query = `
                UPDATE reportes_errores
                SET 
                    titulo = COALESCE($1, titulo),
                    descripcion = COALESCE($2, descripcion),
                    area_modulo = COALESCE($3, area_modulo),
                    severidad = COALESCE($4, severidad),
                    estado = COALESCE($5, estado),
                    id_usuario_asigna = COALESCE($6, id_usuario_asigna),
                    solucion_adoptada = COALESCE($7, solucion_adoptada)
                    ${sqlFechaSolucion}
                WHERE id_error = $8
                RETURNING *;
            `;
            const res = await pool.query(query, [
                titulo,
                descripcion,
                area_modulo,
                severidad,
                estado,
                id_usuario_asigna,
                solucion_adoptada,
                id
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    }
};

module.exports = ErrorReporte;

