const pool = require('../config/db');

const Reunion = {

    verificarDisponibilidadSala: async (id_sala, inicio, fin) => {
        if (!id_sala) return true;
        
        try {
            const query = `
                SELECT id_reunion FROM reuniones
                WHERE id_sala = $1 
                  AND estado != 'CANCELADA'
                  AND (fecha_hora_inicio < $3 AND fecha_hora_fin > $2);
            `;
            const resultado = await pool.query(query, [id_sala, inicio, fin]);
            return resultado.rows.length === 0;
        } catch (error) {
            throw error;
        }
    },

    crearReunion: async (datos, asistentes) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                titulo,
                descripcion,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_organizador,
                id_sala,
                id_ubicacion,
                alcance,
                enlace_videollamada,
                id_pedido_relacionado
            } = datos;

            const queryReunion = `
                INSERT INTO reuniones (
                    titulo, descripcion, fecha_hora_inicio, fecha_hora_fin,
                    id_organizador, id_sala, id_ubicacion, alcance,
                    enlace_videollamada, id_pedido_relacionado, estado
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PROGRAMADA')
                RETURNING *;
            `;
            const resultadoReunion = await client.query(queryReunion, [
                titulo,
                descripcion,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_organizador,
                id_sala || null,
                id_ubicacion || null,
                alcance || 'general',
                enlace_videollamada || null,
                id_pedido_relacionado || null
            ]);
            const nuevaReunion = resultadoReunion.rows[0];

            if (Array.isArray(asistentes) && asistentes.length > 0) {
                for (const id_usuario of asistentes) {
                    await client.query(`
                        INSERT INTO asistentes_reunion (id_reunion, id_usuario, estado_invitacion)
                        VALUES ($1, $2, 'PENDIENTE')
                        ON CONFLICT DO NOTHING;
                    `, [nuevaReunion.id_reunion, id_usuario]);
                }
            }

            await client.query('COMMIT');
            return nuevaReunion;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    obtenerReuniones: async (id_usuario, rol, id_ubicacion = null, puede_ver_otras_ubicaciones = false) => {
        try {
            const params = [];
            const puedeVerTodas = rol === 'Admin Central' || puede_ver_otras_ubicaciones === true;

            let queryFinal = `
                SELECT DISTINCT
                    r.id_reunion,
                    COALESCE(r.titulo, 'Reunión') AS titulo,
                    r.descripcion,
                    r.fecha_hora_inicio,
                    r.fecha_hora_fin,
                    r.enlace_videollamada,
                    r.estado,
                    r.id_ubicacion,
                    COALESCE(r.alcance, 'general') AS alcance,
                    s.nombre AS nombre_sala,
                    ub.nombre AS nombre_ubicacion,
                    u.nombre_completo AS organizador
                FROM reuniones r
                LEFT JOIN salas_reunion s ON r.id_sala = s.id_sala
                LEFT JOIN ubicaciones ub ON r.id_ubicacion = ub.id_ubicacion
                LEFT JOIN usuarios u ON r.id_organizador = u.id_usuario
                LEFT JOIN asistentes_reunion ar ON r.id_reunion = ar.id_reunion
                WHERE r.estado != 'CANCELADA'
            `;
            
            if (!puedeVerTodas) {
                queryFinal += ` AND (
                    COALESCE(r.alcance, 'general') = 'general'
                    OR r.id_ubicacion IS NULL
                    OR r.id_ubicacion = $1
                    OR r.id_organizador = $2
                    OR ar.id_usuario = $2
                )`;
                params.push(id_ubicacion || 0, id_usuario || 0);
            }
            queryFinal += ` ORDER BY r.fecha_hora_inicio ASC;`;

            const resultado = await pool.query(queryFinal, params);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Reunion;
