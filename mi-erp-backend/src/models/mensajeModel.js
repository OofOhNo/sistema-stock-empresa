const pool = require('../config/db');

const Mensaje = {

    // Enviar un mensaje entre empleados
    enviar: async ({ id_emisor, id_receptor, mensaje }) => {
        try {
            const query = `
                INSERT INTO mensajes_internos (id_emisor, id_receptor, mensaje, leido)
                VALUES ($1, $2, $3, false)
                RETURNING *;
            `;
            const res = await pool.query(query, [id_emisor, id_receptor, mensaje]);
            const nuevo = res.rows[0];

            // Retornar con datos del emisor
            const qInfo = `
                SELECT 
                    m.*,
                    u_em.nombre_completo AS nombre_emisor,
                    r_em.nombre AS rol_emisor,
                    u_rec.nombre_completo AS nombre_receptor,
                    r_rec.nombre AS rol_receptor
                FROM mensajes_internos m
                JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
                JOIN roles r_em ON u_em.rol_id = r_em.id_rol
                JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
                JOIN roles r_rec ON u_rec.rol_id = r_rec.id_rol
                WHERE m.id_mensaje = $1;
            `;
            const resInfo = await pool.query(qInfo, [nuevo.id_mensaje]);
            return resInfo.rows[0];
        } catch (error) {
            throw error;
        }
    },

    // Obtener historial de chat entre 2 empleados
    obtenerHistorial: async (id_usuario_1, id_usuario_2) => {
        try {
            const query = `
                SELECT 
                    m.id_mensaje,
                    m.id_emisor,
                    m.id_receptor,
                    m.mensaje,
                    m.leido,
                    m.creado_en,
                    u_em.nombre_completo AS nombre_emisor,
                    r_em.nombre AS rol_emisor,
                    u_rec.nombre_completo AS nombre_receptor,
                    r_rec.nombre AS rol_receptor
                FROM mensajes_internos m
                JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
                JOIN roles r_em ON u_em.rol_id = r_em.id_rol
                JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
                JOIN roles r_rec ON u_rec.rol_id = r_rec.id_rol
                WHERE (m.id_emisor = $1 AND m.id_receptor = $2)
                   OR (m.id_emisor = $2 AND m.id_receptor = $1)
                ORDER BY m.creado_en ASC;
            `;
            const res = await pool.query(query, [id_usuario_1, id_usuario_2]);
            return res.rows;
        } catch (error) {
            throw error;
        }
    },

    // Marcar mensajes recibidos como leídos por el empleado
    marcarLeidos: async (id_receptor, id_emisor) => {
        try {
            const query = `
                UPDATE mensajes_internos
                SET leido = true
                WHERE id_receptor = $1 AND id_emisor = $2 AND leido = false;
            `;
            await pool.query(query, [id_receptor, id_emisor]);
            return true;
        } catch (error) {
            throw error;
        }
    },

    // Lista de contactos/colegas con último mensaje y no leídos para un usuario
    obtenerContactos: async (id_usuario_actual) => {
        try {
            const query = `
                SELECT 
                    u.id_usuario,
                    u.nombre_completo,
                    u.email,
                    r.nombre AS nombre_rol,
                    u.area,
                    ub.nombre AS nombre_ubicacion,
                    ult.mensaje AS ultimo_mensaje,
                    ult.creado_en AS fecha_ultimo_mensaje,
                    ult.id_emisor AS ultimo_emisor,
                    COALESCE(nl.no_leidos, 0) AS no_leidos
                FROM usuarios u
                JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                LEFT JOIN LATERAL (
                    SELECT m.mensaje, m.creado_en, m.id_emisor
                    FROM mensajes_internos m
                    WHERE (m.id_emisor = u.id_usuario AND m.id_receptor = $1)
                       OR (m.id_emisor = $1 AND m.id_receptor = u.id_usuario)
                    ORDER BY m.creado_en DESC
                    LIMIT 1
                ) ult ON true
                LEFT JOIN LATERAL (
                    SELECT COUNT(*)::int AS no_leidos
                    FROM mensajes_internos m
                    WHERE m.id_emisor = u.id_usuario 
                      AND m.id_receptor = $1 
                      AND m.leido = false
                ) nl ON true
                WHERE u.activo = true 
                  AND u.id_usuario != $1
                ORDER BY 
                    COALESCE(nl.no_leidos, 0) DESC,
                    ult.creado_en DESC NULLS LAST,
                    u.nombre_completo ASC;
            `;
            const res = await pool.query(query, [id_usuario_actual]);
            return res.rows;
        } catch (error) {
            throw error;
        }
    },

    // =========================================================================
    // MODO SUPERVISIÓN SILENCIOSA (JEFATURA / ADMIN CENTRAL)
    // Permite al jefe auditar todas las conversaciones sin que el empleado lo sepa
    // =========================================================================

    // Listar todos los pares de empleados que han conversado
    supervisarTodasLasConversaciones: async () => {
        try {
            const query = `
                WITH pares AS (
                    SELECT 
                        LEAST(id_emisor, id_receptor) AS u1_id,
                        GREATEST(id_emisor, id_receptor) AS u2_id,
                        COUNT(*)::int AS total_mensajes,
                        MAX(creado_en) AS ultima_fecha
                    FROM mensajes_internos
                    GROUP BY LEAST(id_emisor, id_receptor), GREATEST(id_emisor, id_receptor)
                )
                SELECT 
                    p.u1_id,
                    u1.nombre_completo AS u1_nombre,
                    u1.email AS u1_email,
                    r1.nombre AS u1_rol,
                    u1.area AS u1_area,
                    ub1.nombre AS u1_ubicacion,
                    p.u2_id,
                    u2.nombre_completo AS u2_nombre,
                    u2.email AS u2_email,
                    r2.nombre AS u2_rol,
                    u2.area AS u2_area,
                    ub2.nombre AS u2_ubicacion,
                    p.total_mensajes,
                    p.ultima_fecha,
                    ult.mensaje AS ultimo_mensaje,
                    ult.id_emisor AS ultimo_emisor_id
                FROM pares p
                JOIN usuarios u1 ON p.u1_id = u1.id_usuario
                JOIN roles r1 ON u1.rol_id = r1.id_rol
                LEFT JOIN ubicaciones ub1 ON u1.id_ubicacion = ub1.id_ubicacion
                JOIN usuarios u2 ON p.u2_id = u2.id_usuario
                JOIN roles r2 ON u2.rol_id = r2.id_rol
                LEFT JOIN ubicaciones ub2 ON u2.id_ubicacion = ub2.id_ubicacion
                LEFT JOIN LATERAL (
                    SELECT m.mensaje, m.id_emisor
                    FROM mensajes_internos m
                    WHERE (m.id_emisor = p.u1_id AND m.id_receptor = p.u2_id)
                       OR (m.id_emisor = p.u2_id AND m.id_receptor = p.u1_id)
                    ORDER BY m.creado_en DESC
                    LIMIT 1
                ) ult ON true
                ORDER BY p.ultima_fecha DESC;
            `;
            const res = await pool.query(query);
            return res.rows;
        } catch (error) {
            throw error;
        }
    },

    // Obtener transcripción completa de un par auditado sin alterar flags ni fechas
    supervisarChatPar: async (u1_id, u2_id) => {
        try {
            const query = `
                SELECT 
                    m.id_mensaje,
                    m.id_emisor,
                    m.id_receptor,
                    m.mensaje,
                    m.leido,
                    m.creado_en,
                    u_em.nombre_completo AS nombre_emisor,
                    r_em.nombre AS rol_emisor,
                    u_rec.nombre_completo AS nombre_receptor,
                    r_rec.nombre AS rol_receptor
                FROM mensajes_internos m
                JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
                JOIN roles r_em ON u_em.rol_id = r_em.id_rol
                JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
                JOIN roles r_rec ON u_rec.rol_id = r_rec.id_rol
                WHERE (m.id_emisor = $1 AND m.id_receptor = $2)
                   OR (m.id_emisor = $2 AND m.id_receptor = $1)
                ORDER BY m.creado_en ASC;
            `;
            const res = await pool.query(query, [u1_id, u2_id]);
            return res.rows;
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Mensaje;

