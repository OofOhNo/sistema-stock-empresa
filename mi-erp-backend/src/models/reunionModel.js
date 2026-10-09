const pool = require('../config/db');

const Reunion = {

    //verificar si una sala esta disponible en ese horario (evita cruces)
    verificarDisponibilidadSala: async (id_sala, inicio, fin) => {
        if (!id_sala) return true; //si no usa sala fisica, no hay conflicto de espacio
        
        try {
            const query = `
                SELECT id_reunion FROM reuniones
                WHERE id_sala = $1 
                  AND estado != 'CANCELADA'
                  AND (
                      (fecha_hora_inicio < $3 AND fecha_hora_fin > $2)
                  );
            `;
            const resultado = await pool.query(query, [id_sala, inicio, fin]);
            //si la consulta devuelve registros, significa que la sala ya esta ocupada
            return resultado.rows.length === 0;
        } catch (error) {
            throw error;
        }
    },

    //crear una nueva reunion y registrar a sus asistentes
    crearReunion: async (datos, asistentes) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { titulo, descripcion, fecha_hora_inicio, fecha_hora_fin, id_organizador, id_sala, enlace_videollamada, id_pedido_relacionado } = datos;

            //insertar la reunion principal
            const queryReunion = `
                INSERT INTO reuniones (titulo, descripcion, fecha_hora_inicio, fecha_hora_fin, id_organizador, id_sala, enlace_videollamada, id_pedido_relacionado, estado)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROGRAMADA')
                RETURNING *;
            `;
            const resultadoReunion = await client.query(queryReunion, [
                titulo, descripcion, fecha_hora_inicio, fecha_hora_fin, id_organizador, id_sala, enlace_videollamada, id_pedido_relacionado
            ]);
            const nuevaReunion = resultadoReunion.rows[0];

            //registrar los asistentes invitados (si los hay)
            if (asistentes && asistentes.length > 0) {
                for (let id_usuario of asistentes) {
                    const queryAsistente = `
                        INSERT INTO asistentes_reunion (id_reunion, id_usuario, estado_invitacion)
                        VALUES ($1, $2, 'PENDIENTE');
                    `;
                    await client.query(queryAsistente, [nuevaReunion.id_reunion, id_usuario]);
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

    //obtener reuniones para el calendario
    obtenerReuniones: async (id_usuario, rol) => {
        try {
            const params = [];
            let queryFinal = `SELECT DISTINCT r.id_reunion, r.titulo, r.descripcion, r.fecha_hora_inicio, r.fecha_hora_fin, r.enlace_videollamada, r.estado, s.nombre AS nombre_sala, u.nombre_completo AS organizador FROM reuniones r LEFT JOIN salas_reunion s ON r.id_sala = s.id_sala LEFT JOIN usuarios u ON r.id_organizador = u.id_usuario LEFT JOIN asistentes_reunion ar ON r.id_reunion = ar.id_reunion WHERE r.estado != 'CANCELADA'`;
            
            if (rol !== 'Admin Central') {
                queryFinal += ` AND (r.id_organizador = $1 OR ar.id_usuario = $1)`;
                params.push(id_usuario);
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