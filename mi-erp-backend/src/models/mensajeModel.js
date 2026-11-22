const pool = require('../config/db');

const Mensaje = {

    enviar: async ({ id_emisor, id_receptor, mensaje = '', adjunto = null }) => {
        try {
            const query = `
                INSERT INTO mensajes_internos (
                    id_emisor, id_receptor, mensaje, leido,
                    adjunto_url, adjunto_nombre, adjunto_tipo, adjunto_mime, adjunto_tamano
                )
                VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8)
                RETURNING *;
            `;
            const res = await pool.query(query, [
                id_emisor,
                id_receptor,
                mensaje || '',
                adjunto?.url || null,
                adjunto?.nombre || null,
                adjunto?.tipo || null,
                adjunto?.mime || null,
                adjunto?.tamano || null
            ]);
            const nuevo = res.rows[0];

            const qInfo = `
                SELECT 
                    m.*,
                    u_em.nombre_completo AS nombre_emisor,
                    r_em.nombre AS rol_emisor,
                    u_rec.nombre_completo AS nombre_receptor,
                    r_rec.nombre AS rol_receptor
                FROM mensajes_internos m
                JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
                LEFT JOIN roles r_em ON u_em.rol_id = r_em.id_rol
                JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
                LEFT JOIN roles r_rec ON u_rec.rol_id = r_rec.id_rol
                WHERE m.id_mensaje = $1;
            `;
            const resInfo = await pool.query(qInfo, [nuevo.id_mensaje]);
            return resInfo.rows[0];
        } catch (error) {
            throw error;
        }
    },

    obtenerHistorial: async (id_usuario_1, id_usuario_2) => {
        try {
            const query = `
                SELECT 
                    m.id_mensaje,
                    m.id_emisor,
                    m.id_receptor,
                    m.mensaje,
                    m.leido,
                    COALESCE(m.enviado_whatsapp, false) AS enviado_whatsapp,
                    m.enviado_whatsapp_en,
                    m.adjunto_url,
                    m.adjunto_nombre,
                    m.adjunto_tipo,
                    m.adjunto_mime,
                    m.adjunto_tamano,
                    m.creado_en,
                    u_em.nombre_completo AS nombre_emisor,
                    r_em.nombre AS rol_emisor,
                    u_rec.nombre_completo AS nombre_receptor,
                    r_rec.nombre AS rol_receptor
                FROM mensajes_internos m
                JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
                LEFT JOIN roles r_em ON u_em.rol_id = r_em.id_rol
                JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
                LEFT JOIN roles r_rec ON u_rec.rol_id = r_rec.id_rol
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

    obtenerPorId: async (id_mensaje) => {
        const query = `
            SELECT
                m.*,
                COALESCE(m.enviado_whatsapp, false) AS enviado_whatsapp,
                u_em.nombre_completo AS nombre_emisor,
                u_em.telefono_whatsapp AS telefono_emisor,
                u_rec.nombre_completo AS nombre_receptor,
                u_rec.telefono_whatsapp AS telefono_receptor
            FROM mensajes_internos m
            JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
            JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
            WHERE m.id_mensaje = $1::int;
        `;
        const { rows } = await pool.query(query, [id_mensaje]);
        return rows[0] || null;
    },

    marcarEnviadoWhatsApp: async (id_mensaje) => {
        await pool.query(
            `UPDATE mensajes_internos
             SET enviado_whatsapp = true,
                 enviado_whatsapp_en = CURRENT_TIMESTAMP
             WHERE id_mensaje = $1::int;`,
            [id_mensaje]
        );
    },

    marcarLeidos: async (id_receptor, id_emisor) => {
        try {
            await pool.query(`
                UPDATE mensajes_internos
                SET leido = true
                WHERE id_receptor = $1 AND id_emisor = $2 AND leido = false;
            `, [id_receptor, id_emisor]);
            return true;
        } catch (error) {
            throw error;
        }
    },

    contarNoLeidos: async (id_receptor) => {
        const { rows } = await pool.query(`
            SELECT (
                (SELECT COUNT(*)::int FROM mensajes_internos WHERE id_receptor = $1::int AND leido = false)
                +
                COALESCE((
                    SELECT COUNT(*)::int
                    FROM grupos_mensajes_chat mc
                    JOIN grupos_mensajes_miembros gm ON gm.id_grupo = mc.id_grupo AND gm.id_usuario = $1::int
                    LEFT JOIN grupos_mensajes_lecturas gl ON gl.id_grupo = mc.id_grupo AND gl.id_usuario = $1::int
                    WHERE mc.id_emisor != $1::int
                      AND mc.id_mensaje_grupo > COALESCE(gl.ultimo_mensaje_leido, 0)
                ), 0)
            )::int AS total;
        `, [id_receptor]);
        return rows[0]?.total || 0;
    },

    obtenerContactos: async (id_usuario_actual) => {
        try {
            const query = `
                SELECT 
                    u.id_usuario,
                    u.nombre_completo,
                    u.email,
                    r.nombre AS nombre_rol,
                    u.area,
                    u.telefono_whatsapp,
                    ub.nombre AS nombre_ubicacion,
                    ult.mensaje AS ultimo_mensaje,
                    ult.adjunto_nombre AS ultimo_adjunto_nombre,
                    ult.adjunto_tipo AS ultimo_adjunto_tipo,
                    ult.creado_en AS fecha_ultimo_mensaje,
                    ult.id_emisor AS ultimo_emisor,
                    COALESCE(nl.no_leidos, 0) AS no_leidos
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                LEFT JOIN LATERAL (
                    SELECT m.mensaje, m.adjunto_nombre, m.adjunto_tipo, m.creado_en, m.id_emisor
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
                WHERE COALESCE(u.activo, true) = true 
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
                    ult.adjunto_nombre AS ultimo_adjunto_nombre,
                    ult.adjunto_tipo AS ultimo_adjunto_tipo,
                    ult.id_emisor AS ultimo_emisor_id
                FROM pares p
                JOIN usuarios u1 ON p.u1_id = u1.id_usuario
                LEFT JOIN roles r1 ON u1.rol_id = r1.id_rol
                LEFT JOIN ubicaciones ub1 ON u1.id_ubicacion = ub1.id_ubicacion
                JOIN usuarios u2 ON p.u2_id = u2.id_usuario
                LEFT JOIN roles r2 ON u2.rol_id = r2.id_rol
                LEFT JOIN ubicaciones ub2 ON u2.id_ubicacion = ub2.id_ubicacion
                LEFT JOIN LATERAL (
                    SELECT m.mensaje, m.adjunto_nombre, m.adjunto_tipo, m.id_emisor
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

    supervisarChatPar: async (u1_id, u2_id) => {
        try {
            const query = `
                SELECT 
                    m.id_mensaje,
                    m.id_emisor,
                    m.id_receptor,
                    m.mensaje,
                    m.leido,
                    COALESCE(m.enviado_whatsapp, false) AS enviado_whatsapp,
                    m.enviado_whatsapp_en,
                    m.adjunto_url,
                    m.adjunto_nombre,
                    m.adjunto_tipo,
                    m.adjunto_mime,
                    m.adjunto_tamano,
                    m.creado_en,
                    u_em.nombre_completo AS nombre_emisor,
                    r_em.nombre AS rol_emisor,
                    u_rec.nombre_completo AS nombre_receptor,
                    r_rec.nombre AS rol_receptor
                FROM mensajes_internos m
                JOIN usuarios u_em ON m.id_emisor = u_em.id_usuario
                LEFT JOIN roles r_em ON u_em.rol_id = r_em.id_rol
                JOIN usuarios u_rec ON m.id_receptor = u_rec.id_usuario
                LEFT JOIN roles r_rec ON u_rec.rol_id = r_rec.id_rol
                WHERE (m.id_emisor = $1 AND m.id_receptor = $2)
                   OR (m.id_emisor = $2 AND m.id_receptor = $1)
                ORDER BY m.creado_en ASC;
            `;
            const res = await pool.query(query, [u1_id, u2_id]);
            return res.rows;
        } catch (error) {
            throw error;
        }
    },

    // =========================================================================
    // GRUPOS TIPO WHATSAPP
    // =========================================================================

    listarGruposUsuario: async (id_usuario) => {
        const query = `
            SELECT
                g.id_grupo,
                g.nombre,
                g.descripcion,
                g.creado_por,
                g.whatsapp_group_jid,
                g.creado_en,
                gm_yo.rol_grupo AS mi_rol,
                (
                    SELECT COUNT(*)::int
                    FROM grupos_mensajes_miembros gm2
                    WHERE gm2.id_grupo = g.id_grupo
                ) AS total_miembros,
                (
                    SELECT COALESCE(
                        JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id_usuario', u.id_usuario,
                                'nombre_completo', u.nombre_completo,
                                'telefono_whatsapp', u.telefono_whatsapp,
                                'rol_grupo', gm3.rol_grupo
                            )
                            ORDER BY (gm3.rol_grupo = 'ADMIN') DESC, u.nombre_completo ASC
                        ),
                        '[]'::json
                    )
                    FROM grupos_mensajes_miembros gm3
                    JOIN usuarios u ON u.id_usuario = gm3.id_usuario
                    WHERE gm3.id_grupo = g.id_grupo
                ) AS miembros,
                ult.mensaje AS ultimo_mensaje,
                ult.adjunto_nombre AS ultimo_adjunto_nombre,
                ult.adjunto_tipo AS ultimo_adjunto_tipo,
                ult.creado_en AS fecha_ultimo_mensaje,
                ult.id_emisor AS ultimo_emisor,
                ult.nombre_emisor AS ultimo_emisor_nombre,
                COALESCE((
                    SELECT COUNT(*)::int
                    FROM grupos_mensajes_chat mc
                    LEFT JOIN grupos_mensajes_lecturas gl
                      ON gl.id_grupo = g.id_grupo AND gl.id_usuario = $1::int
                    WHERE mc.id_grupo = g.id_grupo
                      AND mc.id_emisor != $1::int
                      AND mc.id_mensaje_grupo > COALESCE(gl.ultimo_mensaje_leido, 0)
                ), 0) AS no_leidos
            FROM grupos_mensajes g
            JOIN grupos_mensajes_miembros gm_yo
              ON gm_yo.id_grupo = g.id_grupo AND gm_yo.id_usuario = $1::int
            LEFT JOIN LATERAL (
                SELECT mc.mensaje, mc.adjunto_nombre, mc.adjunto_tipo, mc.creado_en, mc.id_emisor, u.nombre_completo AS nombre_emisor
                FROM grupos_mensajes_chat mc
                JOIN usuarios u ON u.id_usuario = mc.id_emisor
                WHERE mc.id_grupo = g.id_grupo
                ORDER BY mc.creado_en DESC, mc.id_mensaje_grupo DESC
                LIMIT 1
            ) ult ON TRUE
            ORDER BY COALESCE(ult.creado_en, g.creado_en) DESC, g.id_grupo DESC;
        `;
        const { rows } = await pool.query(query, [id_usuario]);
        return rows;
    },

    obtenerGrupoPorId: async (id_grupo) => {
        const resGrupo = await pool.query(`
            SELECT g.*, u_cre.nombre_completo AS creador_nombre
            FROM grupos_mensajes g
            LEFT JOIN usuarios u_cre ON u_cre.id_usuario = g.creado_por
            WHERE g.id_grupo = $1::int;
        `, [id_grupo]);
        if (resGrupo.rows.length === 0) return null;

        const resMiembros = await pool.query(`
            SELECT
                u.id_usuario,
                u.nombre_completo,
                u.email,
                r.nombre AS nombre_rol,
                ub.nombre AS nombre_ubicacion,
                u.telefono_whatsapp,
                gm.rol_grupo,
                gm.unido_en
            FROM grupos_mensajes_miembros gm
            JOIN usuarios u ON u.id_usuario = gm.id_usuario
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
            WHERE gm.id_grupo = $1::int
            ORDER BY (gm.rol_grupo = 'ADMIN') DESC, u.nombre_completo ASC;
        `, [id_grupo]);

        return {
            ...resGrupo.rows[0],
            miembros: resMiembros.rows,
            total_miembros: resMiembros.rows.length
        };
    },

    esMiembroGrupo: async (id_grupo, id_usuario) => {
        const { rows } = await pool.query(
            'SELECT rol_grupo FROM grupos_mensajes_miembros WHERE id_grupo = $1::int AND id_usuario = $2::int LIMIT 1;',
            [id_grupo, id_usuario]
        );
        return rows[0] || null;
    },

    crearGrupo: async ({ nombre, descripcion = null, id_creador, miembros_ids = [] }) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const resG = await client.query(
                `INSERT INTO grupos_mensajes (nombre, descripcion, creado_por)
                 VALUES ($1::varchar, $2::text, $3::int)
                 RETURNING *;`,
                [nombre, descripcion, id_creador]
            );
            const nuevoGrupo = resG.rows[0];

            const idsUnicos = [...new Set([Number(id_creador), ...miembros_ids.map(Number)])]
                .filter((id) => Number.isFinite(id) && id > 0);

            const { rows: validUsers } = await client.query(
                'SELECT id_usuario FROM usuarios WHERE id_usuario = ANY($1::int[]) AND COALESCE(activo, true) = true;',
                [idsUnicos]
            );

            for (const u of validUsers) {
                const rolGrupo = Number(u.id_usuario) === Number(id_creador) ? 'ADMIN' : 'MIEMBRO';
                await client.query(
                    `INSERT INTO grupos_mensajes_miembros (id_grupo, id_usuario, rol_grupo)
                     VALUES ($1::int, $2::int, $3::varchar)
                     ON CONFLICT (id_grupo, id_usuario) DO NOTHING;`,
                    [nuevoGrupo.id_grupo, u.id_usuario, rolGrupo]
                );
                await client.query(
                    `INSERT INTO grupos_mensajes_lecturas (id_grupo, id_usuario, ultimo_mensaje_leido)
                     VALUES ($1::int, $2::int, 0)
                     ON CONFLICT (id_grupo, id_usuario) DO NOTHING;`,
                    [nuevoGrupo.id_grupo, u.id_usuario]
                );
            }

            await client.query('COMMIT');
            return await Mensaje.obtenerGrupoPorId(nuevoGrupo.id_grupo);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    },

    actualizarGrupo: async (id_grupo, { nombre, descripcion }) => {
        await pool.query(
            `UPDATE grupos_mensajes
             SET nombre = COALESCE($1::varchar, nombre),
                 descripcion = $2::text,
                 actualizado_en = CURRENT_TIMESTAMP
             WHERE id_grupo = $3::int;`,
            [nombre, descripcion, id_grupo]
        );
        return await Mensaje.obtenerGrupoPorId(id_grupo);
    },

    asignarWhatsappGroupJid: async (id_grupo, whatsapp_group_jid) => {
        await pool.query(
            `UPDATE grupos_mensajes
             SET whatsapp_group_jid = $1::varchar,
                 actualizado_en = CURRENT_TIMESTAMP
             WHERE id_grupo = $2::int;`,
            [whatsapp_group_jid || null, id_grupo]
        );
        return await Mensaje.obtenerGrupoPorId(id_grupo);
    },

    agregarMiembrosGrupo: async (id_grupo, miembros_ids = []) => {
        const idsUnicos = [...new Set(miembros_ids.map(Number))].filter((id) => Number.isFinite(id) && id > 0);
        if (idsUnicos.length === 0) return await Mensaje.obtenerGrupoPorId(id_grupo);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: validUsers } = await client.query(
                'SELECT id_usuario FROM usuarios WHERE id_usuario = ANY($1::int[]) AND COALESCE(activo, true) = true;',
                [idsUnicos]
            );
            const { rows: maxMsg } = await client.query(
                'SELECT COALESCE(MAX(id_mensaje_grupo), 0)::int AS max_id FROM grupos_mensajes_chat WHERE id_grupo = $1::int;',
                [id_grupo]
            );
            const maxMsgId = maxMsg[0]?.max_id || 0;

            for (const u of validUsers) {
                await client.query(
                    `INSERT INTO grupos_mensajes_miembros (id_grupo, id_usuario, rol_grupo)
                     VALUES ($1::int, $2::int, 'MIEMBRO')
                     ON CONFLICT (id_grupo, id_usuario) DO NOTHING;`,
                    [id_grupo, u.id_usuario]
                );
                await client.query(
                    `INSERT INTO grupos_mensajes_lecturas (id_grupo, id_usuario, ultimo_mensaje_leido)
                     VALUES ($1::int, $2::int, $3::int)
                     ON CONFLICT (id_grupo, id_usuario) DO NOTHING;`,
                    [id_grupo, u.id_usuario, maxMsgId]
                );
            }
            await client.query('COMMIT');
            return await Mensaje.obtenerGrupoPorId(id_grupo);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    },

    quitarMiembroGrupo: async (id_grupo, id_usuario_objetivo) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'DELETE FROM grupos_mensajes_miembros WHERE id_grupo = $1::int AND id_usuario = $2::int;',
                [id_grupo, id_usuario_objetivo]
            );
            await client.query(
                'DELETE FROM grupos_mensajes_lecturas WHERE id_grupo = $1::int AND id_usuario = $2::int;',
                [id_grupo, id_usuario_objetivo]
            );

            const { rows: restantes } = await client.query(
                `SELECT id_usuario, rol_grupo
                 FROM grupos_mensajes_miembros
                 WHERE id_grupo = $1::int
                 ORDER BY (rol_grupo = 'ADMIN') DESC, unido_en ASC;`,
                [id_grupo]
            );

            if (restantes.length === 0) {
                await client.query('DELETE FROM grupos_mensajes WHERE id_grupo = $1::int;', [id_grupo]);
                await client.query('COMMIT');
                return { eliminado_grupo: true, grupo: null };
            }

            const tieneAdmin = restantes.some((r) => r.rol_grupo === 'ADMIN');
            if (!tieneAdmin) {
                await client.query(
                    `UPDATE grupos_mensajes_miembros
                     SET rol_grupo = 'ADMIN'
                     WHERE id_grupo = $1::int AND id_usuario = $2::int;`,
                    [id_grupo, restantes[0].id_usuario]
                );
            }

            await client.query('COMMIT');
            const grupo = await Mensaje.obtenerGrupoPorId(id_grupo);
            return { eliminado_grupo: false, grupo };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    },

    cambiarRolMiembroGrupo: async (id_grupo, id_usuario_objetivo, rol_grupo) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (rol_grupo !== 'ADMIN') {
                const { rows: admins } = await client.query(
                    `SELECT id_usuario FROM grupos_mensajes_miembros
                     WHERE id_grupo = $1::int AND rol_grupo = 'ADMIN';`,
                    [id_grupo]
                );
                if (admins.length <= 1 && Number(admins[0]?.id_usuario) === Number(id_usuario_objetivo)) {
                    throw new Error('Debe haber al menos un administrador en el grupo.');
                }
            }
            await client.query(
                `UPDATE grupos_mensajes_miembros
                 SET rol_grupo = $1::varchar
                 WHERE id_grupo = $2::int AND id_usuario = $3::int;`,
                [rol_grupo, id_grupo, id_usuario_objetivo]
            );
            await client.query('COMMIT');
            return await Mensaje.obtenerGrupoPorId(id_grupo);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    },

    eliminarGrupo: async (id_grupo) => {
        await pool.query('DELETE FROM grupos_mensajes WHERE id_grupo = $1::int;', [id_grupo]);
        return true;
    },

    obtenerHistorialGrupo: async (id_grupo) => {
        const { rows } = await pool.query(`
            SELECT
                mc.id_mensaje_grupo,
                mc.id_grupo,
                mc.id_emisor,
                mc.mensaje,
                COALESCE(mc.enviado_whatsapp, false) AS enviado_whatsapp,
                COALESCE(mc.whatsapp_destinatarios_ok, 0) AS whatsapp_destinatarios_ok,
                COALESCE(mc.whatsapp_destinatarios_total, 0) AS whatsapp_destinatarios_total,
                mc.adjunto_url,
                mc.adjunto_nombre,
                mc.adjunto_tipo,
                mc.adjunto_mime,
                mc.adjunto_tamano,
                mc.creado_en,
                u.nombre_completo AS nombre_emisor,
                r.nombre AS rol_emisor
            FROM grupos_mensajes_chat mc
            JOIN usuarios u ON mc.id_emisor = u.id_usuario
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            WHERE mc.id_grupo = $1::int
            ORDER BY mc.creado_en ASC, mc.id_mensaje_grupo ASC;
        `, [id_grupo]);
        return rows;
    },

    marcarGrupoLeido: async (id_grupo, id_usuario) => {
        await pool.query(`
            INSERT INTO grupos_mensajes_lecturas (id_grupo, id_usuario, ultimo_mensaje_leido, leido_en)
            VALUES (
                $1::int,
                $2::int,
                COALESCE((SELECT MAX(id_mensaje_grupo) FROM grupos_mensajes_chat WHERE id_grupo = $1::int), 0),
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (id_grupo, id_usuario)
            DO UPDATE SET
                ultimo_mensaje_leido = GREATEST(grupos_mensajes_lecturas.ultimo_mensaje_leido, EXCLUDED.ultimo_mensaje_leido),
                leido_en = CURRENT_TIMESTAMP;
        `, [id_grupo, id_usuario]);
    },

    enviarMensajeGrupo: async ({ id_grupo, id_emisor, mensaje = '', adjunto = null }) => {
        const resIns = await pool.query(`
            INSERT INTO grupos_mensajes_chat (
                id_grupo, id_emisor, mensaje,
                adjunto_url, adjunto_nombre, adjunto_tipo, adjunto_mime, adjunto_tamano
            )
            VALUES ($1::int, $2::int, $3::text, $4::text, $5::varchar, $6::varchar, $7::varchar, $8::bigint)
            RETURNING id_mensaje_grupo;
        `, [
            id_grupo,
            id_emisor,
            mensaje || '',
            adjunto?.url || null,
            adjunto?.nombre || null,
            adjunto?.tipo || null,
            adjunto?.mime || null,
            adjunto?.tamano || null
        ]);
        const nuevoId = resIns.rows[0].id_mensaje_grupo;

        await pool.query(
            'UPDATE grupos_mensajes SET actualizado_en = CURRENT_TIMESTAMP WHERE id_grupo = $1::int;',
            [id_grupo]
        ).catch(() => {});

        await pool.query(`
            INSERT INTO grupos_mensajes_lecturas (id_grupo, id_usuario, ultimo_mensaje_leido, leido_en)
            VALUES ($1::int, $2::int, $3::int, CURRENT_TIMESTAMP)
            ON CONFLICT (id_grupo, id_usuario)
            DO UPDATE SET
                ultimo_mensaje_leido = GREATEST(grupos_mensajes_lecturas.ultimo_mensaje_leido, EXCLUDED.ultimo_mensaje_leido),
                leido_en = CURRENT_TIMESTAMP;
        `, [id_grupo, id_emisor, nuevoId]).catch(() => {});

        const { rows } = await pool.query(`
            SELECT
                mc.id_mensaje_grupo,
                mc.id_grupo,
                mc.id_emisor,
                mc.mensaje,
                COALESCE(mc.enviado_whatsapp, false) AS enviado_whatsapp,
                COALESCE(mc.whatsapp_destinatarios_ok, 0) AS whatsapp_destinatarios_ok,
                COALESCE(mc.whatsapp_destinatarios_total, 0) AS whatsapp_destinatarios_total,
                mc.adjunto_url,
                mc.adjunto_nombre,
                mc.adjunto_tipo,
                mc.adjunto_mime,
                mc.adjunto_tamano,
                mc.creado_en,
                u.nombre_completo AS nombre_emisor,
                r.nombre AS rol_emisor
            FROM grupos_mensajes_chat mc
            JOIN usuarios u ON mc.id_emisor = u.id_usuario
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            WHERE mc.id_mensaje_grupo = $1::int;
        `, [nuevoId]);
        return rows[0];
    },

    marcarMensajeGrupoWhatsApp: async (id_mensaje_grupo, okCount, totalCount) => {
        await pool.query(`
            UPDATE grupos_mensajes_chat
            SET enviado_whatsapp = ($2::int > 0),
                whatsapp_destinatarios_ok = $2::int,
                whatsapp_destinatarios_total = $3::int
            WHERE id_mensaje_grupo = $1::int;
        `, [id_mensaje_grupo, okCount, totalCount]);
    },

    supervisarGrupos: async () => {
        const { rows } = await pool.query(`
            SELECT
                g.id_grupo,
                g.nombre,
                g.descripcion,
                g.whatsapp_group_jid,
                g.creado_en,
                u_cre.nombre_completo AS creador_nombre,
                (SELECT COUNT(*)::int FROM grupos_mensajes_miembros gm WHERE gm.id_grupo = g.id_grupo) AS total_miembros,
                (SELECT COUNT(*)::int FROM grupos_mensajes_chat mc WHERE mc.id_grupo = g.id_grupo) AS total_mensajes,
                COALESCE(ult.creado_en, g.creado_en) AS ultima_fecha,
                ult.mensaje AS ultimo_mensaje,
                ult.adjunto_nombre AS ultimo_adjunto_nombre,
                ult.adjunto_tipo AS ultimo_adjunto_tipo,
                ult.nombre_emisor AS ultimo_emisor_nombre
            FROM grupos_mensajes g
            LEFT JOIN usuarios u_cre ON u_cre.id_usuario = g.creado_por
            LEFT JOIN LATERAL (
                SELECT mc.mensaje, mc.adjunto_nombre, mc.adjunto_tipo, mc.creado_en, u.nombre_completo AS nombre_emisor
                FROM grupos_mensajes_chat mc
                JOIN usuarios u ON u.id_usuario = mc.id_emisor
                WHERE mc.id_grupo = g.id_grupo
                ORDER BY mc.creado_en DESC, mc.id_mensaje_grupo DESC
                LIMIT 1
            ) ult ON TRUE
            ORDER BY COALESCE(ult.creado_en, g.creado_en) DESC, g.id_grupo DESC;
        `);
        return rows;
    },

    obtenerAdjuntoAutorizado: async (adjuntoUrl, idUsuario, esAdminCentral = false) => {
        const resDirecto = await pool.query(`
            SELECT adjunto_nombre, adjunto_mime, id_emisor, id_receptor
            FROM mensajes_internos
            WHERE adjunto_url = $1::text
            LIMIT 1;
        `, [adjuntoUrl]);
        if (resDirecto.rows.length > 0) {
            const r = resDirecto.rows[0];
            if (esAdminCentral || Number(r.id_emisor) === Number(idUsuario) || Number(r.id_receptor) === Number(idUsuario)) {
                return r;
            }
            return null;
        }

        const resGrupo = await pool.query(`
            SELECT mc.adjunto_nombre, mc.adjunto_mime, mc.id_grupo
            FROM grupos_mensajes_chat mc
            WHERE mc.adjunto_url = $1::text
            LIMIT 1;
        `, [adjuntoUrl]);
        if (resGrupo.rows.length > 0) {
            const rg = resGrupo.rows[0];
            if (esAdminCentral) return rg;
            const mem = await Mensaje.esMiembroGrupo(rg.id_grupo, idUsuario);
            return mem ? rg : null;
        }

        return null;
    }

};

module.exports = Mensaje;
