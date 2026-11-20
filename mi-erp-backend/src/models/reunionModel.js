const pool = require('../config/db');

const ESTADOS_VALIDOS = new Set(['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA']);

const SQL_BASE_REUNION_SELECT = `
    SELECT
        r.id_reunion,
        r.titulo,
        r.descripcion,
        r.fecha_hora_inicio,
        r.fecha_hora_fin,
        r.id_organizador,
        r.id_sala,
        r.id_ubicacion,
        r.alcance,
        r.enlace_videollamada,
        r.id_pedido_relacionado,
        r.estado,
        r.creado_en,
        r.actualizado_en,
        COALESCE(r.tipo_evento, 'reunion') AS tipo_evento,
        COALESCE(r.es_general_nivel, false) AS es_general_nivel,
        COALESCE(r.temas_objetivos, '[]'::jsonb) AS temas_objetivos,
        ROUND((EXTRACT(EPOCH FROM (r.fecha_hora_inicio - NOW())) / 60.0)::numeric, 2)::float AS minutos_para_inicio,
        (r.fecha_hora_inicio >= NOW() + INTERVAL '10 minutes') AS puede_editar_por_tiempo,
        org.nombre_completo AS organizador_nombre,
        org.email AS organizador_email,
        COALESCE(org_r.nombre, 'Sin Rol') AS organizador_rol,
        COALESCE(org_r.nivel_jerarquia, CASE WHEN org_r.nombre = 'Admin Central' THEN 1 ELSE 4 END)::int AS organizador_nivel,
        u.nombre AS nombre_ubicacion,
        s.nombre AS nombre_sala,
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id_usuario', usr.id_usuario,
                        'nombre_completo', usr.nombre_completo,
                        'email', usr.email,
                        'id_ubicacion', usr.id_ubicacion,
                        'nombre_ubicacion', COALESCE(ub_a.nombre, 'Sede Central'),
                        'nombre_rol', COALESCE(rol_a.nombre, 'Sin Rol'),
                        'nivel_jerarquia', COALESCE(rol_a.nivel_jerarquia, CASE WHEN rol_a.nombre = 'Admin Central' THEN 1 ELSE 4 END)::int,
                        'estado_invitacion', ar.estado_invitacion
                    )
                    ORDER BY COALESCE(rol_a.nivel_jerarquia, 4) ASC, usr.nombre_completo ASC
                )
                FROM asistentes_reunion ar
                JOIN usuarios usr ON ar.id_usuario = usr.id_usuario
                LEFT JOIN roles rol_a ON usr.rol_id = rol_a.id_rol
                LEFT JOIN ubicaciones ub_a ON usr.id_ubicacion = ub_a.id_ubicacion
                WHERE ar.id_reunion = r.id_reunion
            ),
            '[]'::json
        ) AS asistentes
    FROM reuniones r
    JOIN usuarios org ON r.id_organizador = org.id_usuario
    LEFT JOIN roles org_r ON org.rol_id = org_r.id_rol
    LEFT JOIN ubicaciones u ON r.id_ubicacion = u.id_ubicacion
    LEFT JOIN salas_reunion s ON r.id_sala = s.id_sala
`;

function limpiarAsistentesIds(rawIds) {
    if (!Array.isArray(rawIds)) return [];
    const unicos = new Set();
    for (const item of rawIds) {
        const idNum = parseInt(item, 10);
        if (Number.isFinite(idNum) && idNum > 0) {
            unicos.add(idNum);
        }
    }
    return [...unicos];
}

function normalizarTemasObjetivos(rawTemas) {
    if (!Array.isArray(rawTemas)) return [];
    const resultado = [];
    for (let i = 0; i < rawTemas.length && resultado.length < 50; i += 1) {
        const entry = rawTemas[i];
        const tituloRaw = typeof entry === 'string' ? entry : entry?.titulo;
        const titulo = String(tituloRaw || '').trim().slice(0, 300);
        if (!titulo) continue;
        const idVal = typeof entry === 'object' && entry?.id
            ? String(entry.id).trim().slice(0, 40)
            : `tema-${i + 1}`;
        resultado.push({
            id: idVal,
            titulo,
            completado: Boolean(typeof entry === 'object' && entry?.completado)
        });
    }
    return resultado;
}

const Reunion = {
    ESTADOS_VALIDOS,
    limpiarAsistentesIds,
    normalizarTemasObjetivos,

    obtenerUsuariosInvitables: async (nivelOrganizador = 4) => {
        const nivel = Number(nivelOrganizador) >= 1 ? parseInt(nivelOrganizador, 10) : 4;
        const query = `
            SELECT
                u.id_usuario,
                u.nombre_completo,
                u.email,
                u.id_ubicacion,
                COALESCE(ub.nombre, 'Sede Central') AS nombre_ubicacion,
                u.rol_id,
                COALESCE(r.nombre, 'Empleado') AS nombre_rol,
                COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END)::int AS nivel_jerarquia
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
            WHERE COALESCE(u.activo, true) = true
              AND COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END) >= $1::int
            ORDER BY COALESCE(r.nivel_jerarquia, 4) ASC, u.nombre_completo ASC;
        `;
        const { rows } = await pool.query(query, [nivel]);
        return rows;
    },

    validarInvitadosJerarquia: async (asistentesIds, nivelOrganizador = 4) => {
        const idsLimpios = limpiarAsistentesIds(asistentesIds);
        if (idsLimpios.length === 0) {
            return { valido: true, ids: [] };
        }

        const nivelOrg = Number(nivelOrganizador) >= 1 ? parseInt(nivelOrganizador, 10) : 4;
        const { rows } = await pool.query(`
            SELECT
                u.id_usuario,
                u.nombre_completo,
                COALESCE(u.activo, true) AS activo,
                COALESCE(r.nombre, 'Sin Rol') AS nombre_rol,
                COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END)::int AS nivel_jerarquia
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            WHERE u.id_usuario = ANY($1::int[]);
        `, [idsLimpios]);

        const mapa = new Map(rows.map((u) => [Number(u.id_usuario), u]));
        for (const id of idsLimpios) {
            const usuario = mapa.get(id);
            if (!usuario || !usuario.activo) {
                return {
                    valido: false,
                    status: 400,
                    mensaje: 'Uno de los usuarios invitados ya no existe o está inactivo.'
                };
            }
            if (Number(usuario.nivel_jerarquia) < nivelOrg) {
                return {
                    valido: false,
                    status: 403,
                    mensaje: `No puedes convocar a ${usuario.nombre_completo} (${usuario.nombre_rol}, Nivel ${usuario.nivel_jerarquia}) porque tiene una jerarquía superior a la tuya (Nivel ${nivelOrg}).`
                };
            }
        }
        return { valido: true, ids: idsLimpios };
    },

    verificarDisponibilidadSala: async (id_sala, fecha_hora_inicio, fecha_hora_fin, excluir_id_reunion = null) => {
        if (!id_sala) return true;
        const query = `
            SELECT id_reunion
            FROM reuniones
            WHERE id_sala = $1::int
              AND estado != 'CANCELADA'
              AND ($4::int IS NULL OR id_reunion != $4::int)
              AND (fecha_hora_inicio < $3::timestamptz AND fecha_hora_fin > $2::timestamptz)
            LIMIT 1;
        `;
        const res = await pool.query(query, [
            id_sala,
            fecha_hora_inicio,
            fecha_hora_fin,
            excluir_id_reunion ? parseInt(excluir_id_reunion, 10) : null
        ]);
        return res.rows.length === 0;
    },

    obtenerPorId: async (id_reunion) => {
        const query = `
            ${SQL_BASE_REUNION_SELECT}
            WHERE r.id_reunion = $1::int
            LIMIT 1;
        `;
        const { rows } = await pool.query(query, [parseInt(id_reunion, 10)]);
        return rows[0] || null;
    },

    crearReunion: async (datos) => {
        const {
            titulo,
            descripcion = null,
            fecha_hora_inicio,
            fecha_hora_fin,
            id_organizador,
            id_sala = null,
            id_ubicacion = null,
            alcance = 'invitados',
            enlace_videollamada = null,
            id_pedido_relacionado = null,
            tipo_evento = 'reunion',
            es_general_nivel = false,
            temas_objetivos = [],
            asistentes_ids = []
        } = datos;

        const asistentesLimpios = limpiarAsistentesIds(asistentes_ids);
        const temasLimpios = normalizarTemasObjetivos(temas_objetivos);
        const tipoFinal = tipo_evento === 'imprevisto' ? 'imprevisto' : 'reunion';

        const client = await pool.connect();
        let idReunionCreada = null;
        try {
            await client.query('BEGIN');
            const queryInsert = `
                INSERT INTO reuniones (
                    titulo,
                    descripcion,
                    fecha_hora_inicio,
                    fecha_hora_fin,
                    id_organizador,
                    id_sala,
                    id_ubicacion,
                    alcance,
                    enlace_videollamada,
                    id_pedido_relacionado,
                    tipo_evento,
                    es_general_nivel,
                    temas_objetivos
                )
                VALUES (
                    $1::varchar,
                    $2::text,
                    $3::timestamptz,
                    $4::timestamptz,
                    $5::int,
                    $6::int,
                    $7::int,
                    $8::varchar,
                    $9::varchar,
                    $10::int,
                    $11::varchar,
                    $12::boolean,
                    $13::jsonb
                )
                RETURNING id_reunion;
            `;
            const resInsert = await client.query(queryInsert, [
                titulo,
                descripcion,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_organizador,
                id_sala || null,
                id_ubicacion || null,
                alcance || 'invitados',
                enlace_videollamada || null,
                id_pedido_relacionado || null,
                tipoFinal,
                Boolean(es_general_nivel),
                JSON.stringify(temasLimpios)
            ]);

            idReunionCreada = resInsert.rows[0].id_reunion;
            if (asistentesLimpios.length > 0) {
                await client.query(`
                    INSERT INTO asistentes_reunion (id_reunion, id_usuario, estado_invitacion)
                    SELECT $1::int, unnest($2::int[]), 'PENDIENTE'
                    ON CONFLICT (id_reunion, id_usuario) DO NOTHING;
                `, [idReunionCreada, asistentesLimpios]);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        return await Reunion.obtenerPorId(idReunionCreada);
    },

    actualizarReunion: async (id_reunion, datos) => {
        const idNum = parseInt(id_reunion, 10);
        const asistentesLimpios = limpiarAsistentesIds(datos.asistentes_ids);
        const temasLimpios = normalizarTemasObjetivos(datos.temas_objetivos);
        const tipoFinal = datos.tipo_evento === 'imprevisto' ? 'imprevisto' : 'reunion';
        const estadoFinal = ESTADOS_VALIDOS.has(datos.estado) ? datos.estado : 'PROGRAMADA';

        const client = await pool.connect();
        let errorResultado = null;
        try {
            await client.query('BEGIN');

            const checkRes = await client.query(`
                SELECT
                    id_reunion,
                    ROUND((EXTRACT(EPOCH FROM (fecha_hora_inicio - NOW())) / 60.0)::numeric, 2)::float AS minutos_para_inicio
                FROM reuniones
                WHERE id_reunion = $1::int
                FOR UPDATE;
            `, [idNum]);

            if (checkRes.rows.length === 0) {
                await client.query('ROLLBACK');
                errorResultado = { ok: false, status: 404, mensaje: 'Reunión no encontrada.' };
            } else {
                const minutosRestantes = Number(checkRes.rows[0].minutos_para_inicio);
                if (!Number.isFinite(minutosRestantes) || minutosRestantes < 10) {
                    await client.query('ROLLBACK');
                    errorResultado = {
                        ok: false,
                        status: 400,
                        codigo: 'VENTANA_EDICION_CERRADA',
                        mensaje: 'El tiempo límite de edición expiró: las reuniones solo pueden editarse como máximo hasta 10 minutos antes de iniciar.'
                    };
                } else {
                    await client.query(`
                        UPDATE reuniones
                        SET titulo = $1::varchar,
                            descripcion = $2::text,
                            fecha_hora_inicio = $3::timestamptz,
                            fecha_hora_fin = $4::timestamptz,
                            id_sala = $5::int,
                            id_ubicacion = $6::int,
                            alcance = $7::varchar,
                            enlace_videollamada = $8::varchar,
                            tipo_evento = $9::varchar,
                            es_general_nivel = $10::boolean,
                            temas_objetivos = $11::jsonb,
                            estado = $12::varchar,
                            actualizado_en = NOW()
                        WHERE id_reunion = $13::int;
                    `, [
                        datos.titulo,
                        datos.descripcion ?? null,
                        datos.fecha_hora_inicio,
                        datos.fecha_hora_fin,
                        datos.id_sala || null,
                        datos.id_ubicacion || null,
                        datos.alcance || 'invitados',
                        datos.enlace_videollamada || null,
                        tipoFinal,
                        Boolean(datos.es_general_nivel),
                        JSON.stringify(temasLimpios),
                        estadoFinal,
                        idNum
                    ]);

                    await client.query('DELETE FROM asistentes_reunion WHERE id_reunion = $1::int;', [idNum]);
                    if (asistentesLimpios.length > 0) {
                        await client.query(`
                            INSERT INTO asistentes_reunion (id_reunion, id_usuario, estado_invitacion)
                            SELECT $1::int, unnest($2::int[]), 'PENDIENTE'
                            ON CONFLICT (id_reunion, id_usuario) DO NOTHING;
                        `, [idNum, asistentesLimpios]);
                    }

                    await client.query('COMMIT');
                }
            }
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        if (errorResultado) return errorResultado;
        const actualizada = await Reunion.obtenerPorId(idNum);
        return { ok: true, reunion: actualizada };
    },

    obtenerReuniones: async ({ id_usuario, id_ubicacion = null, nivel_jerarquia = 4 }) => {
        const nivelLector = Number(nivel_jerarquia) >= 1 ? parseInt(nivel_jerarquia, 10) : 4;
        const query = `
            ${SQL_BASE_REUNION_SELECT}
            WHERE r.id_organizador = $1::int
               OR EXISTS (
                   SELECT 1
                   FROM asistentes_reunion ar_vis
                   WHERE ar_vis.id_reunion = r.id_reunion
                     AND ar_vis.id_usuario = $1::int
               )
               OR (
                   COALESCE(r.es_general_nivel, FALSE) = TRUE
                   AND $3::int >= COALESCE(org_r.nivel_jerarquia, CASE WHEN org_r.nombre = 'Admin Central' THEN 1 ELSE 4 END)::int
                   AND (
                       r.alcance = 'general'
                       OR (r.alcance = 'ubicacion' AND $2::int IS NOT NULL AND r.id_ubicacion = $2::int)
                   )
               )
            ORDER BY r.fecha_hora_inicio ASC, r.id_reunion DESC;
        `;
        const { rows } = await pool.query(query, [
            parseInt(id_usuario, 10),
            id_ubicacion ? parseInt(id_ubicacion, 10) : null,
            nivelLector
        ]);
        return rows;
    }
};

module.exports = Reunion;
