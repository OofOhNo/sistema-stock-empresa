const pool = require('../config/db');

const Calidad = {
    obtenerTodos: async () => {
        try {
            const query = `
                SELECT 
                    c.id_certificado,
                    c.codigo_certificado,
                    c.tipo_certificado,
                    c.lote_o_producto,
                    c.entidad_emisora,
                    c.fecha_emision,
                    c.fecha_vencimiento,
                    c.estado,
                    c.id_ubicacion,
                    u.nombre AS nombre_ubicacion,
                    c.id_usuario,
                    usr.nombre_completo AS nombre_usuario,
                    c.id_cliente,
                    c.cliente_nombre,
                    c.cliente_ruc,
                    COALESCE(c.senasa_resolucion, 'N° 000111-MINAGRI-SENASA-AREQUIPA') AS senasa_resolucion,
                    COALESCE(c.ciudad_emision, 'Arequipa') AS ciudad_emision,
                    COALESCE(c.items_detalle, '[]'::jsonb) AS items_detalle,
                    c.archivo_url,
                    c.observaciones,
                    c.creado_en,
                    CASE 
                        WHEN c.fecha_vencimiento < CURRENT_DATE THEN 'VENCIDO'
                        WHEN c.fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days' THEN 'POR_VENCER'
                        ELSE c.estado
                    END AS estado_actualizado,
                    (c.fecha_vencimiento - CURRENT_DATE)::int AS dias_restantes
                FROM certificados_calidad c
                LEFT JOIN ubicaciones u ON c.id_ubicacion = u.id_ubicacion
                LEFT JOIN usuarios usr ON c.id_usuario = usr.id_usuario
                ORDER BY c.fecha_emision DESC, c.id_certificado DESC;
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
                SELECT c.*, u.nombre AS nombre_ubicacion, usr.nombre_completo AS nombre_usuario
                FROM certificados_calidad c
                LEFT JOIN ubicaciones u ON c.id_ubicacion = u.id_ubicacion
                LEFT JOIN usuarios usr ON c.id_usuario = usr.id_usuario
                WHERE c.id_certificado = $1;
            `;
            const res = await pool.query(query, [id]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    crear: async ({
        codigo_certificado,
        tipo_certificado,
        lote_o_producto,
        entidad_emisora,
        fecha_emision,
        fecha_vencimiento,
        estado,
        id_ubicacion,
        id_usuario,
        id_cliente,
        cliente_nombre,
        cliente_ruc,
        senasa_resolucion,
        ciudad_emision,
        items_detalle,
        archivo_url,
        observaciones
    }) => {
        try {
            let estadoFinal = estado || 'VIGENTE';
            const vDate = new Date(fecha_vencimiento);
            const now = new Date();
            const diffDays = Math.ceil((vDate - now) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
                estadoFinal = 'VENCIDO';
            } else if (diffDays <= 30) {
                estadoFinal = 'POR_VENCER';
            }

            const query = `
                INSERT INTO certificados_calidad (
                    codigo_certificado,
                    tipo_certificado,
                    lote_o_producto,
                    entidad_emisora,
                    fecha_emision,
                    fecha_vencimiento,
                    estado,
                    id_ubicacion,
                    id_usuario,
                    id_cliente,
                    cliente_nombre,
                    cliente_ruc,
                    senasa_resolucion,
                    ciudad_emision,
                    items_detalle,
                    archivo_url,
                    observaciones
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING *;
            `;
            const res = await pool.query(query, [
                codigo_certificado,
                tipo_certificado || 'Certificado de Calidad SENASA',
                lote_o_producto || null,
                entidad_emisora || 'PROCESOS CÁRNICOS S.A.C.',
                fecha_emision || new Date(),
                fecha_vencimiento,
                estadoFinal,
                id_ubicacion || null,
                id_usuario || null,
                id_cliente || null,
                cliente_nombre || null,
                cliente_ruc || null,
                senasa_resolucion || 'N° 000111-MINAGRI-SENASA-AREQUIPA',
                ciudad_emision || 'Arequipa',
                JSON.stringify(items_detalle || []),
                archivo_url || null,
                observaciones || null
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    actualizar: async (id, datos) => {
        try {
            const {
                codigo_certificado,
                tipo_certificado,
                lote_o_producto,
                entidad_emisora,
                fecha_emision,
                fecha_vencimiento,
                estado,
                id_ubicacion,
                id_cliente,
                cliente_nombre,
                cliente_ruc,
                senasa_resolucion,
                ciudad_emision,
                items_detalle,
                archivo_url,
                observaciones
            } = datos;

            const query = `
                UPDATE certificados_calidad
                SET 
                    codigo_certificado = COALESCE($1, codigo_certificado),
                    tipo_certificado = COALESCE($2, tipo_certificado),
                    lote_o_producto = COALESCE($3, lote_o_producto),
                    entidad_emisora = COALESCE($4, entidad_emisora),
                    fecha_emision = COALESCE($5, fecha_emision),
                    fecha_vencimiento = COALESCE($6, fecha_vencimiento),
                    estado = COALESCE($7, estado),
                    id_ubicacion = COALESCE($8, id_ubicacion),
                    id_cliente = COALESCE($9, id_cliente),
                    cliente_nombre = COALESCE($10, cliente_nombre),
                    cliente_ruc = COALESCE($11, cliente_ruc),
                    senasa_resolucion = COALESCE($12, senasa_resolucion),
                    ciudad_emision = COALESCE($13, ciudad_emision),
                    items_detalle = CASE WHEN $14::jsonb IS NOT NULL THEN $14::jsonb ELSE items_detalle END,
                    archivo_url = COALESCE($15, archivo_url),
                    observaciones = COALESCE($16, observaciones)
                WHERE id_certificado = $17
                RETURNING *;
            `;
            const res = await pool.query(query, [
                codigo_certificado,
                tipo_certificado,
                lote_o_producto,
                entidad_emisora,
                fecha_emision,
                fecha_vencimiento,
                estado,
                id_ubicacion,
                id_cliente,
                cliente_nombre,
                cliente_ruc,
                senasa_resolucion,
                ciudad_emision,
                items_detalle ? JSON.stringify(items_detalle) : null,
                archivo_url,
                observaciones,
                id
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    eliminar: async (id) => {
        try {
            const query = `DELETE FROM certificados_calidad WHERE id_certificado = $1 RETURNING *;`;
            const res = await pool.query(query, [id]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    }
};

module.exports = Calidad;

