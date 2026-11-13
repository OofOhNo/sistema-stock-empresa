const pool = require('../config/db');

const pagosCalendarioController = {
    listarPagos: async (req, res) => {
        try {
            const { mes, anio, estado, categoria } = req.query;
            let where = [];
            const params = [];

            if (mes && anio) {
                params.push(parseInt(anio, 10), parseInt(mes, 10));
                where.push(`EXTRACT(YEAR FROM p.fecha_vencimiento) = $${params.length - 1} AND EXTRACT(MONTH FROM p.fecha_vencimiento) = $${params.length}`);
            }
            if (estado && ['PENDIENTE', 'PAGADO'].includes(estado)) {
                params.push(estado);
                where.push(`p.estado = $${params.length}`);
            }
            if (categoria) {
                params.push(categoria);
                where.push(`p.categoria = $${params.length}`);
            }

            const sql = `
                SELECT
                    p.*,
                    TO_CHAR(p.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso,
                    u.nombre_completo AS creado_por_nombre
                FROM pagos_programados p
                LEFT JOIN usuarios u ON p.creado_por = u.id_usuario
                ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY p.estado ASC, p.fecha_vencimiento ASC, p.id_pago DESC;
            `;
            const { rows } = await pool.query(sql, params);
            return res.status(200).json({ exito: true, pagos: rows });
        } catch (error) {
            console.error('Error al listar pagos:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al cargar el calendario de pagos.' });
        }
    },

    alertasInicio: async (req, res) => {
        try {
            const queryPagos = `
                WITH fechas_lima AS (
                    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date AS hoy
                )
                SELECT
                    p.*,
                    TO_CHAR(p.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso,
                    CASE
                        WHEN p.fecha_vencimiento < f.hoy - 1 THEN 'ATRASADO'
                        WHEN p.fecha_vencimiento = f.hoy - 1 THEN 'AYER'
                        WHEN p.fecha_vencimiento = f.hoy THEN 'HOY'
                        WHEN p.fecha_vencimiento = f.hoy + 1 THEN 'MANANA'
                        ELSE 'OTRO'
                    END AS urgencia,
                    (p.fecha_vencimiento - f.hoy)::INTEGER AS dias_diferencia
                FROM pagos_programados p
                CROSS JOIN fechas_lima f
                WHERE p.estado = 'PENDIENTE'
                  AND p.fecha_vencimiento <= f.hoy + 1
                ORDER BY p.fecha_vencimiento ASC, p.monto DESC;
            `;
            const { rows } = await pool.query(queryPagos);
            return res.status(200).json({
                exito: true,
                alertas: rows
            });
        } catch (error) {
            console.error('Error al consultar alertas de pagos:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al consultar alertas de pagos.' });
        }
    },

    crearPago: async (req, res) => {
        try {
            const {
                titulo,
                categoria = 'SUELDOS',
                beneficiario = '',
                monto,
                moneda = 'PEN',
                fecha_vencimiento,
                recurrente_mensual = false,
                notas = ''
            } = req.body;

            if (!titulo || !titulo.trim()) {
                return res.status(400).json({ exito: false, mensaje: 'El título del pago es obligatorio.' });
            }
            if (!fecha_vencimiento) {
                return res.status(400).json({ exito: false, mensaje: 'La fecha de vencimiento es obligatoria.' });
            }
            const montoNum = Number(monto);
            if (!Number.isFinite(montoNum) || montoNum < 0) {
                return res.status(400).json({ exito: false, mensaje: 'Ingresa un monto válido.' });
            }

            const { rows } = await pool.query(
                `INSERT INTO pagos_programados (
                    titulo, categoria, beneficiario, monto, moneda,
                    fecha_vencimiento, recurrente_mensual, notas, creado_por
                )
                VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9)
                RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                [
                    titulo.trim(),
                    categoria,
                    beneficiario ? beneficiario.trim() : null,
                    montoNum,
                    moneda || 'PEN',
                    fecha_vencimiento,
                    Boolean(recurrente_mensual),
                    notas ? notas.trim() : null,
                    req.usuario.id_usuario
                ]
            );

            return res.status(201).json({ exito: true, mensaje: 'Pago programado correctamente.', pago: rows[0] });
        } catch (error) {
            console.error('Error al crear pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al programar pago.' });
        }
    },

    actualizarPago: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const {
                titulo,
                categoria,
                beneficiario,
                monto,
                moneda,
                fecha_vencimiento,
                recurrente_mensual,
                notas
            } = req.body;

            const { rows } = await pool.query(
                `UPDATE pagos_programados
                 SET titulo = COALESCE($1, titulo),
                     categoria = COALESCE($2, categoria),
                     beneficiario = $3,
                     monto = COALESCE($4, monto),
                     moneda = COALESCE($5, moneda),
                     fecha_vencimiento = COALESCE($6::date, fecha_vencimiento),
                     recurrente_mensual = COALESCE($7, recurrente_mensual),
                     notas = $8
                 WHERE id_pago = $9
                 RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                [
                    titulo ? titulo.trim() : null,
                    categoria || null,
                    beneficiario !== undefined ? (beneficiario ? beneficiario.trim() : null) : null,
                    monto !== undefined ? Number(monto) : null,
                    moneda || null,
                    fecha_vencimiento || null,
                    recurrente_mensual !== undefined ? Boolean(recurrente_mensual) : null,
                    notas !== undefined ? (notas ? notas.trim() : null) : null,
                    id
                ]
            );

            if (rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Pago no encontrado.' });
            }

            return res.status(200).json({ exito: true, mensaje: 'Pago actualizado.', pago: rows[0] });
        } catch (error) {
            console.error('Error al actualizar pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al actualizar pago.' });
        }
    },

    cambiarEstado: async (req, res) => {
        const client = await pool.connect();
        try {
            const id = parseInt(req.params.id, 10);
            if (Number.isNaN(id)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de pago inválido.' });
            }
            const { estado } = req.body;
            if (!['PENDIENTE', 'PAGADO'].includes(estado)) {
                return res.status(400).json({ exito: false, mensaje: 'Estado inválido.' });
            }

            await client.query('BEGIN');
            const { rows } = await client.query(
                `UPDATE pagos_programados
                 SET estado = $1::varchar,
                     fecha_pagado = CASE WHEN $1::varchar = 'PAGADO' THEN CURRENT_TIMESTAMP ELSE NULL END
                 WHERE id_pago = $2::int
                 RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                [estado, id]
            );

            if (rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Pago no encontrado.' });
            }

            const pago = rows[0];
            let siguienteCreado = null;

            if (estado === 'PAGADO' && pago.recurrente_mensual) {
                const checkDup = await client.query(
                    `SELECT id_pago FROM pagos_programados
                     WHERE titulo = $1
                       AND fecha_vencimiento = ($2::date + INTERVAL '1 month')::date
                     LIMIT 1;`,
                    [pago.titulo, pago.fecha_vencimiento_iso]
                );
                if (checkDup.rows.length === 0) {
                    const nextRes = await client.query(
                        `INSERT INTO pagos_programados (
                            titulo, categoria, beneficiario, monto, moneda,
                            fecha_vencimiento, recurrente_mensual, notas, creado_por
                        )
                        VALUES ($1, $2, $3, $4, $5, ($6::date + INTERVAL '1 month')::date, TRUE, $7, $8)
                        RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                        [
                            pago.titulo,
                            pago.categoria,
                            pago.beneficiario,
                            pago.monto,
                            pago.moneda,
                            pago.fecha_vencimiento_iso,
                            pago.notas,
                            req.usuario.id_usuario
                        ]
                    );
                    siguienteCreado = nextRes.rows[0];
                }
            }

            await client.query('COMMIT');
            return res.status(200).json({
                exito: true,
                mensaje: estado === 'PAGADO'
                    ? (siguienteCreado ? 'Pago marcado como PAGADO y programado para el próximo mes.' : 'Pago marcado como PAGADO.')
                    : 'Pago marcado como PENDIENTE.',
                pago,
                siguiente_pago: siguienteCreado
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al cambiar estado de pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al cambiar estado del pago.' });
        } finally {
            client.release();
        }
    },

    eliminarPago: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (Number.isNaN(id)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de pago inválido.' });
            }
            const { rows } = await pool.query('DELETE FROM pagos_programados WHERE id_pago = $1 RETURNING *;', [id]);
            if (rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Pago no encontrado.' });
            }
            return res.status(200).json({ exito: true, mensaje: 'Pago eliminado.' });
        } catch (error) {
            console.error('Error al eliminar pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al eliminar pago.' });
        }
    }
};

module.exports = pagosCalendarioController;
