const pool = require('../config/db');

function pad2(n) {
    return String(n).padStart(2, '0');
}

function construirPeriodoYM(anio, mes) {
    return `${anio}-${pad2(mes)}`;
}

function fechaParaMes(anio, mes, diaObjetivo) {
    const ultimoDiaMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const dia = Math.min(Math.max(1, parseInt(diaObjetivo, 10) || 1), ultimoDiaMes);
    return `${anio}-${pad2(mes)}-${pad2(dia)}`;
}

async function asegurarOcurrenciasMes(db, targetAnio, targetMes) {
    const anioNum = parseInt(targetAnio, 10);
    const mesNum = parseInt(targetMes, 10);
    if (!Number.isFinite(anioNum) || !Number.isFinite(mesNum) || mesNum < 1 || mesNum > 12) {
        return;
    }

    const targetYm = construirPeriodoYM(anioNum, mesNum);

    const { rows: series } = await db.query(`
        WITH resumen_series AS (
            SELECT
                COALESCE(id_pago_origen, id_pago) AS serie_id,
                TO_CHAR(MIN(fecha_vencimiento), 'YYYY-MM') AS ym_inicio
            FROM pagos_programados
            WHERE recurrente_mensual = TRUE
            GROUP BY COALESCE(id_pago_origen, id_pago)
        ),
        plantillas AS (
            SELECT DISTINCT ON (COALESCE(p.id_pago_origen, p.id_pago))
                COALESCE(p.id_pago_origen, p.id_pago) AS serie_id,
                p.titulo,
                p.categoria,
                p.beneficiario,
                p.monto,
                p.moneda,
                COALESCE(p.dia_recurrencia, EXTRACT(DAY FROM p.fecha_vencimiento)::int) AS dia_rec,
                p.notas,
                p.creado_por
            FROM pagos_programados p
            WHERE p.recurrente_mensual = TRUE
            ORDER BY COALESCE(p.id_pago_origen, p.id_pago), p.fecha_vencimiento DESC, p.id_pago DESC
        )
        SELECT s.serie_id, pl.titulo, pl.categoria, pl.beneficiario, pl.monto, pl.moneda, pl.dia_rec, pl.notas, pl.creado_por
        FROM resumen_series s
        JOIN plantillas pl ON pl.serie_id = s.serie_id
        WHERE s.ym_inicio <= $1::varchar;
    `, [targetYm]);

    for (const s of series) {
        const fechaMes = fechaParaMes(anioNum, mesNum, s.dia_rec);
        await db.query(`
            INSERT INTO pagos_programados (
                titulo, categoria, beneficiario, monto, moneda,
                fecha_vencimiento, estado, recurrente_mensual, notas, creado_por,
                id_pago_origen, periodo_ym, dia_recurrencia
            )
            VALUES (
                $1::varchar, $2::varchar, $3::varchar, $4::numeric, $5::varchar,
                $6::date, 'PENDIENTE', TRUE, $7::text, $8::int,
                $9::int, $10::varchar, $11::smallint
            )
            ON CONFLICT (id_pago_origen, periodo_ym)
            WHERE id_pago_origen IS NOT NULL AND periodo_ym IS NOT NULL
            DO NOTHING;
        `, [
            s.titulo,
            s.categoria,
            s.beneficiario,
            s.monto,
            s.moneda || 'PEN',
            fechaMes,
            s.notas,
            s.creado_por,
            s.serie_id,
            targetYm,
            s.dia_rec
        ]);
    }
}

async function pregenerarMesesRecurrentes(db, serie, fechaBaseISO, mesesAdicionales = 12) {
    const [anioStr, mesStr, diaStr] = String(fechaBaseISO).slice(0, 10).split('-');
    let anio = parseInt(anioStr, 10);
    let mes = parseInt(mesStr, 10);
    const diaObjetivo = parseInt(serie.dia_recurrencia || diaStr, 10) || 1;
    if (!Number.isFinite(anio) || !Number.isFinite(mes)) return;

    for (let i = 1; i <= mesesAdicionales; i += 1) {
        mes += 1;
        if (mes > 12) {
            mes = 1;
            anio += 1;
        }
        const periodoYm = construirPeriodoYM(anio, mes);
        const fechaMes = fechaParaMes(anio, mes, diaObjetivo);
        await db.query(`
            INSERT INTO pagos_programados (
                titulo, categoria, beneficiario, monto, moneda,
                fecha_vencimiento, estado, recurrente_mensual, notas, creado_por,
                id_pago_origen, periodo_ym, dia_recurrencia
            )
            VALUES (
                $1::varchar, $2::varchar, $3::varchar, $4::numeric, $5::varchar,
                $6::date, 'PENDIENTE', TRUE, $7::text, $8::int,
                $9::int, $10::varchar, $11::smallint
            )
            ON CONFLICT (id_pago_origen, periodo_ym)
            WHERE id_pago_origen IS NOT NULL AND periodo_ym IS NOT NULL
            DO NOTHING;
        `, [
            serie.titulo,
            serie.categoria,
            serie.beneficiario || null,
            serie.monto,
            serie.moneda || 'PEN',
            fechaMes,
            serie.notas || null,
            serie.creado_por || null,
            serie.id_pago_origen || serie.id_pago,
            periodoYm,
            diaObjetivo
        ]);
    }
}

const pagosCalendarioController = {
    listarPagos: async (req, res) => {
        try {
            const { mes, anio, estado, categoria } = req.query;
            const where = [];
            const params = [];

            if (mes && anio) {
                const anioNum = parseInt(anio, 10);
                const mesNum = parseInt(mes, 10);
                await asegurarOcurrenciasMes(pool, anioNum, mesNum);
                params.push(anioNum, mesNum);
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
            const { rows: fechaHoyRows } = await pool.query(`
                SELECT
                    EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'))::int AS anio,
                    EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'))::int AS mes;
            `);
            if (fechaHoyRows[0]) {
                await asegurarOcurrenciasMes(pool, fechaHoyRows[0].anio, fechaHoyRows[0].mes);
            }

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
        const client = await pool.connect();
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

            const esRecurrente = Boolean(recurrente_mensual);
            const fechaISO = String(fecha_vencimiento).slice(0, 10);
            const periodoYm = fechaISO.slice(0, 7);
            const diaRec = parseInt(fechaISO.slice(8, 10), 10) || 1;

            await client.query('BEGIN');

            const { rows } = await client.query(
                `INSERT INTO pagos_programados (
                    titulo, categoria, beneficiario, monto, moneda,
                    fecha_vencimiento, recurrente_mensual, notas, creado_por,
                    periodo_ym, dia_recurrencia
                )
                VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11)
                RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                [
                    titulo.trim(),
                    categoria,
                    beneficiario ? beneficiario.trim() : null,
                    montoNum,
                    moneda || 'PEN',
                    fechaISO,
                    esRecurrente,
                    notas ? notas.trim() : null,
                    req.usuario.id_usuario,
                    esRecurrente ? periodoYm : null,
                    esRecurrente ? diaRec : null
                ]
            );

            let pagoCreado = rows[0];
            if (esRecurrente) {
                const { rows: updRows } = await client.query(
                    `UPDATE pagos_programados
                     SET id_pago_origen = id_pago
                     WHERE id_pago = $1::int
                     RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                    [pagoCreado.id_pago]
                );
                pagoCreado = updRows[0];
                await pregenerarMesesRecurrentes(client, pagoCreado, pagoCreado.fecha_vencimiento_iso, 12);
            }

            await client.query('COMMIT');
            return res.status(201).json({
                exito: true,
                mensaje: esRecurrente
                    ? 'Pago recurrente programado para este mes y los siguientes meses.'
                    : 'Pago programado correctamente.',
                pago: pagoCreado
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Error al crear pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al programar pago.' });
        } finally {
            client.release();
        }
    },

    actualizarPago: async (req, res) => {
        const client = await pool.connect();
        try {
            const id = parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de pago inválido.' });
            }

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

            await client.query('BEGIN');
            const actualRes = await client.query(
                `SELECT *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso FROM pagos_programados WHERE id_pago = $1::int FOR UPDATE;`,
                [id]
            );
            if (actualRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Pago no encontrado.' });
            }
            const actual = actualRes.rows[0];
            const fechaFinalISO = fecha_vencimiento ? String(fecha_vencimiento).slice(0, 10) : actual.fecha_vencimiento_iso;
            const periodoYm = fechaFinalISO.slice(0, 7);
            const diaRec = parseInt(fechaFinalISO.slice(8, 10), 10) || 1;
            const nuevoRecurrente = recurrente_mensual !== undefined ? Boolean(recurrente_mensual) : Boolean(actual.recurrente_mensual);
            const serieId = actual.id_pago_origen || actual.id_pago;

            const { rows } = await client.query(
                `UPDATE pagos_programados
                 SET titulo = COALESCE($1, titulo),
                     categoria = COALESCE($2, categoria),
                     beneficiario = $3,
                     monto = COALESCE($4, monto),
                     moneda = COALESCE($5, moneda),
                     fecha_vencimiento = $6::date,
                     recurrente_mensual = $7::boolean,
                     notas = $8,
                     id_pago_origen = CASE WHEN $7::boolean THEN COALESCE(id_pago_origen, id_pago) ELSE id_pago_origen END,
                     periodo_ym = CASE WHEN $7::boolean THEN $9::varchar ELSE periodo_ym END,
                     dia_recurrencia = CASE WHEN $7::boolean THEN $10::smallint ELSE dia_recurrencia END
                 WHERE id_pago = $11::int
                 RETURNING *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso;`,
                [
                    titulo ? titulo.trim() : null,
                    categoria || null,
                    beneficiario !== undefined ? (beneficiario ? beneficiario.trim() : null) : actual.beneficiario,
                    monto !== undefined ? Number(monto) : null,
                    moneda || null,
                    fechaFinalISO,
                    nuevoRecurrente,
                    notas !== undefined ? (notas ? notas.trim() : null) : actual.notas,
                    periodoYm,
                    diaRec,
                    id
                ]
            );

            const actualizado = rows[0];
            if (nuevoRecurrente) {
                await client.query(
                    `UPDATE pagos_programados
                     SET titulo = $1, categoria = $2, beneficiario = $3, monto = $4, moneda = $5, notas = $6, recurrente_mensual = TRUE
                     WHERE id_pago_origen = $7::int
                       AND fecha_vencimiento > $8::date
                       AND estado = 'PENDIENTE';`,
                    [
                        actualizado.titulo,
                        actualizado.categoria,
                        actualizado.beneficiario,
                        actualizado.monto,
                        actualizado.moneda,
                        actualizado.notas,
                        serieId,
                        actualizado.fecha_vencimiento_iso
                    ]
                );
                await pregenerarMesesRecurrentes(client, actualizado, actualizado.fecha_vencimiento_iso, 12);
            } else if (actual.recurrente_mensual) {
                await client.query(
                    `UPDATE pagos_programados SET recurrente_mensual = FALSE WHERE id_pago_origen = $1::int OR id_pago = $1::int;`,
                    [serieId]
                );
                await client.query(
                    `DELETE FROM pagos_programados
                     WHERE id_pago_origen = $1::int
                       AND id_pago != $2::int
                       AND fecha_vencimiento > $3::date
                       AND estado = 'PENDIENTE';`,
                    [serieId, id, actual.fecha_vencimiento_iso]
                );
            }

            await client.query('COMMIT');
            return res.status(200).json({ exito: true, mensaje: 'Pago actualizado.', pago: actualizado });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Error al actualizar pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al actualizar pago.' });
        } finally {
            client.release();
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
            if (estado === 'PAGADO' && pago.recurrente_mensual) {
                await pregenerarMesesRecurrentes(client, pago, pago.fecha_vencimiento_iso, 12);
            }

            await client.query('COMMIT');
            return res.status(200).json({
                exito: true,
                mensaje: estado === 'PAGADO' ? 'Pago marcado como PAGADO.' : 'Pago marcado como PENDIENTE.',
                pago
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Error al cambiar estado de pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al cambiar estado del pago.' });
        } finally {
            client.release();
        }
    },

    eliminarPago: async (req, res) => {
        const client = await pool.connect();
        try {
            const id = parseInt(req.params.id, 10);
            if (Number.isNaN(id)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de pago inválido.' });
            }
            const alcance = String(req.query?.alcance || 'unico');

            await client.query('BEGIN');
            const { rows: found } = await client.query(
                `SELECT *, TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento_iso FROM pagos_programados WHERE id_pago = $1::int FOR UPDATE;`,
                [id]
            );
            if (found.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Pago no encontrado.' });
            }
            const pago = found[0];
            const serieId = pago.id_pago_origen || pago.id_pago;

            if (alcance === 'serie' && pago.id_pago_origen) {
                await client.query(
                    `UPDATE pagos_programados SET recurrente_mensual = FALSE WHERE id_pago_origen = $1::int;`,
                    [serieId]
                );
                await client.query(
                    `DELETE FROM pagos_programados
                     WHERE id_pago = $1::int
                        OR (id_pago_origen = $2::int AND fecha_vencimiento >= $3::date AND estado = 'PENDIENTE');`,
                    [id, serieId, pago.fecha_vencimiento_iso]
                );
            } else {
                await client.query('DELETE FROM pagos_programados WHERE id_pago = $1::int;', [id]);
            }

            await client.query('COMMIT');
            return res.status(200).json({
                exito: true,
                mensaje: alcance === 'serie'
                    ? 'Pago y futuras repeticiones eliminados.'
                    : 'Pago de este mes eliminado.'
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('Error al eliminar pago:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al eliminar pago.' });
        } finally {
            client.release();
        }
    }
};

module.exports = pagosCalendarioController;
