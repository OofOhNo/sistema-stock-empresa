const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const facturaController = {

    emitirComprobante: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id_pedido, tipo_comprobante, forma_pago, dias_credito, fecha_vencimiento_cuota } = req.body;

            if (!id_pedido || !tipo_comprobante) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Por favor selecciona un pedido y el tipo de comprobante (Factura o Boleta).' });
            }
            if (tipo_comprobante !== '01' && tipo_comprobante !== '03') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Selecciona Factura o Boleta.' });
            }

            const esCredito = forma_pago === 'CREDITO';
            const formaPagoFinal = esCredito ? 'CREDITO' : 'CONTADO';
            const diasCreditoFinal = esCredito ? (parseInt(dias_credito, 10) || 30) : 0;
            let fechaVencimientoFinal = null;
            if (esCredito) {
                if (fecha_vencimiento_cuota) {
                    fechaVencimientoFinal = fecha_vencimiento_cuota;
                } else {
                    const f = new Date();
                    f.setDate(f.getDate() + diasCreditoFinal);
                    fechaVencimientoFinal = f.toISOString().split('T')[0];
                }
            }

            // Bloquear fila del pedido para evitar doble facturación simultánea
            const queryPedido = `
                SELECT 
                    p.id_pedido, p.id_usuario, p.monto_total, p.id_ubicacion,
                    p.estado_pedido, COALESCE(p.stock_descontado, false) AS stock_descontado,
                    c.tipo_documento, c.numero_documento, c.razon_social_o_nombre, c.direccion, c.email
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                WHERE p.id_pedido = $1
                FOR UPDATE OF p;
            `;
            const resPedido = await client.query(queryPedido, [id_pedido]);
            if (resPedido.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Pedido no encontrado.' });
            }

            const pedido = resPedido.rows[0];
            if (pedido.estado_pedido === 'CANCELADO') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    exito: false,
                    mensaje: 'No se puede facturar un pedido que fue cancelado.'
                });
            }

            // Verificar que no tenga ya una factura o boleta vigente (no anulada)
            const resCompExistente = await client.query(`
                SELECT serie, correlativo
                FROM comprobantes
                WHERE id_pedido = $1
                  AND tipo_comprobante IN ('01', '03')
                  AND estado_sunat != 'ANULADO'
                LIMIT 1;
            `, [id_pedido]);

            if (resCompExistente.rows.length > 0) {
                const prev = resCompExistente.rows[0];
                await client.query('ROLLBACK');
                return res.status(400).json({
                    exito: false,
                    mensaje: `Este pedido ya tiene el comprobante ${prev.serie}-${String(prev.correlativo).padStart(6, '0')} emitido.`
                });
            }

            const queryDetalle = `
                SELECT 
                    dp.id_producto,
                    pr.sku,
                    pr.nombre AS descripcion,
                    COALESCE(pr.unidad_medida, 'Unidad') AS unidad_medida,
                    COALESCE(um.codigo, 'NIU') AS codigo_unidad_sunat,
                    dp.cantidad,
                    dp.precio_unitario,
                    dp.subtotal
                FROM detalle_pedidos dp
                JOIN productos pr ON dp.id_producto = pr.id_producto
                LEFT JOIN unidades_medida um ON pr.id_unidad = um.id_unidad
                WHERE dp.id_pedido = $1;
            `;
            const resDetalle = await client.query(queryDetalle, [id_pedido]);
            const items = resDetalle.rows;

            const montoTotal = parseFloat(pedido.monto_total);
            const montoSubtotal = montoTotal / 1.18;
            const montoIgv = montoTotal - montoSubtotal;

            const serie = tipo_comprobante === '01' ? 'F001' : 'B001';
            
            const resSerie = await client.query(`
                SELECT ultimo_correlativo 
                FROM series_sunat 
                WHERE serie = $1 FOR UPDATE
            `, [serie]);
            
            let correlativo = 1;
            if (resSerie.rows.length === 0) {
                await client.query(`
                    INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo)
                    VALUES ($1, $2, $3)
                `, [tipo_comprobante, serie, 1]);
            } else {
                correlativo = resSerie.rows[0].ultimo_correlativo + 1;
                await client.query(`
                    UPDATE series_sunat 
                    SET ultimo_correlativo = $1 
                    WHERE serie = $2
                `, [correlativo, serie]);
            }

            const codigoHash = "HashCPE_" + Math.random().toString(36).substring(2, 10).toUpperCase();
            const mensajeCdr = tipo_comprobante === '01'
                ? "La Factura ha sido emitida y registrada correctamente."
                : "La Boleta de Venta ha sido emitida y registrada correctamente.";

            const queryComprobante = `
                INSERT INTO comprobantes (
                    id_pedido, tipo_comprobante, serie, correlativo, 
                    monto_subtotal, monto_igv, monto_total, 
                    forma_pago, dias_credito, fecha_vencimiento_cuota,
                    estado_sunat, codigo_hash, mensaje_cdr
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *;
            `;
            const resComprobante = await client.query(queryComprobante, [
                id_pedido, 
                tipo_comprobante, 
                serie, 
                correlativo, 
                montoSubtotal.toFixed(2),
                montoIgv.toFixed(2),
                montoTotal.toFixed(2), 
                formaPagoFinal,
                diasCreditoFinal,
                fechaVencimientoFinal,
                'ACEPTADO', 
                codigoHash, 
                mensajeCdr
            ]);

            // Descontar stock físico SOLO si no había sido descontado antes (ej. al despachar)
            if (!pedido.stock_descontado) {
                for (const item of items) {
                    await client.query(`
                        INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                        VALUES ($1, $2, $3, 'SALIDA', $4, $5);
                    `, [
                        item.id_producto,
                        pedido.id_ubicacion,
                        req.usuario?.id_usuario || pedido.id_usuario,
                        item.cantidad,
                        `Venta Facturada: ${serie}-${correlativo} (Pedido #${id_pedido})`
                    ]);

                    await client.query(`
                        UPDATE inventario 
                        SET cantidad_fisica = cantidad_fisica - $1,
                            cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                            ultima_actualizacion = CURRENT_TIMESTAMP
                        WHERE id_producto = $2 AND id_ubicacion = $3;
                    `, [item.cantidad, item.id_producto, pedido.id_ubicacion]);
                }
            }

            // Si el pedido ya estaba DESPACHADO conserva DESPACHADO; si estaba PENDIENTE o LISTO_DESPACHO pasa a FACTURADO
            const nuevoEstadoPedido = pedido.estado_pedido === 'DESPACHADO' ? 'DESPACHADO' : 'FACTURADO';
            await client.query(`
                UPDATE pedidos 
                SET estado_pedido = $1,
                    stock_descontado = true
                WHERE id_pedido = $2;
            `, [nuevoEstadoPedido, id_pedido]);

            await registrarAuditoria(
                client, 
                req.usuario?.id_usuario || null, 
                'EMITIR_COMPROBANTE', 
                'comprobantes', 
                resComprobante.rows[0].id_comprobante, 
                null, 
                resComprobante.rows[0]
            );

            await client.query('COMMIT');

            res.status(201).json({
                exito: true,
                mensaje: `¡Comprobante ${serie}-${String(correlativo).padStart(6, '0')} emitido con éxito!`,
                comprobante: resComprobante.rows[0]
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al emitir factura:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'No se pudo emitir el comprobante.',
                error: error.message
            });
        } finally {
            client.release();
        }
    },

    anularComprobante: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { id_comprobante, motivo } = req.body;

            if (!id_comprobante || !motivo || !String(motivo).trim()) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Por favor escribe el motivo por el cual deseas anular este comprobante.' });
            }

            const resComp = await client.query("SELECT * FROM comprobantes WHERE id_comprobante = $1 FOR UPDATE", [id_comprobante]);
            if (resComp.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Comprobante no encontrado.' });
            }
            const compOriginal = resComp.rows[0];

            if (compOriginal.estado_sunat === 'ANULADO') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Este comprobante ya fue anulado anteriormente.' });
            }
            if (compOriginal.tipo_comprobante === '07') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Una Nota de Crédito de anulación no puede volver a anularse.' });
            }

            const serieNC = compOriginal.tipo_comprobante === '01' ? 'FC01' : 'BC01';
            const resSerie = await client.query(`
                SELECT ultimo_correlativo 
                FROM series_sunat 
                WHERE serie = $1 FOR UPDATE
            `, [serieNC]);
            
            let correlativoNC = 1;
            if (resSerie.rows.length === 0) {
                await client.query(`
                    INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo)
                    VALUES ($1, $2, $3)
                `, ['07', serieNC, 1]);
            } else {
                correlativoNC = resSerie.rows[0].ultimo_correlativo + 1;
                await client.query(`
                    UPDATE series_sunat 
                    SET ultimo_correlativo = $1 
                    WHERE serie = $2
                `, [correlativoNC, serieNC]);
            }

            const codigoHashNC = "HashNC_" + Math.random().toString(36).substring(2, 10).toUpperCase();
            const mensajeCdrNC = `Anulación de ${compOriginal.serie}-${String(compOriginal.correlativo).padStart(6, '0')}. Motivo: ${String(motivo).trim()}`;

            const resNC = await client.query(`
                INSERT INTO comprobantes (id_pedido, tipo_comprobante, serie, correlativo, monto_subtotal, monto_igv, monto_total, estado_sunat, codigo_hash, mensaje_cdr)
                VALUES ($1, '07', $2, $3, $4, $5, $6, 'ACEPTADO', $7, $8)
                RETURNING *;
            `, [
                compOriginal.id_pedido,
                serieNC,
                correlativoNC,
                compOriginal.monto_subtotal,
                compOriginal.monto_igv,
                compOriginal.monto_total,
                codigoHashNC,
                mensajeCdrNC
            ]);

            await client.query(`
                UPDATE comprobantes 
                SET estado_sunat = 'ANULADO' 
                WHERE id_comprobante = $1
            `, [id_comprobante]);

            // Devolver el stock físico descontado al inventario y dejar registro de entrada en movimientos
            if (compOriginal.id_pedido) {
                const resPedido = await client.query(
                    'SELECT id_pedido, id_ubicacion, COALESCE(stock_descontado, true) AS stock_descontado FROM pedidos WHERE id_pedido = $1 FOR UPDATE',
                    [compOriginal.id_pedido]
                );

                if (resPedido.rows.length > 0) {
                    const ped = resPedido.rows[0];
                    if (ped.stock_descontado) {
                        const resItems = await client.query(
                            'SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1',
                            [ped.id_pedido]
                        );
                        for (const item of resItems.rows) {
                            await client.query(`
                                UPDATE inventario
                                SET cantidad_fisica = cantidad_fisica + $1,
                                    ultima_actualizacion = CURRENT_TIMESTAMP
                                WHERE id_producto = $2 AND id_ubicacion = $3;
                            `, [item.cantidad, item.id_producto, ped.id_ubicacion]);

                            await client.query(`
                                INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                                VALUES ($1, $2, $3, 'INGRESO', $4, $5);
                            `, [
                                item.id_producto,
                                ped.id_ubicacion,
                                req.usuario?.id_usuario || 1,
                                item.cantidad,
                                `Devolución de stock por anulación de ${compOriginal.serie}-${compOriginal.correlativo} (Pedido #${ped.id_pedido})`
                            ]);
                        }
                    }

                    await client.query(`
                        UPDATE pedidos 
                        SET estado_pedido = 'CANCELADO',
                            stock_descontado = false
                        WHERE id_pedido = $1
                    `, [ped.id_pedido]);
                }
            }

            await registrarAuditoria(client, req.usuario?.id_usuario || null, 'ANULAR_COMPROBANTE', 'comprobantes', id_comprobante, compOriginal, { ...compOriginal, estado_sunat: 'ANULADO', motivo: String(motivo).trim() });
            await registrarAuditoria(client, req.usuario?.id_usuario || null, 'EMITIR_NOTA_CREDITO', 'comprobantes', resNC.rows[0].id_comprobante, null, resNC.rows[0]);

            await client.query('COMMIT');

            res.status(201).json({
                exito: true,
                mensaje: '¡Comprobante anulado y stock devuelto al inventario correctamente!',
                nota_credito: resNC.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al anular comprobante:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al anular comprobante', error: error.message });
        } finally {
            client.release();
        }
    },

    listarComprobantes: async (req, res) => {
        try {
            const puedeVerTodas = req.usuario?.nombre_rol === 'Admin Central' || req.usuario?.puede_ver_otras_ubicaciones === true;
            const params = [];
            let whereClause = '';
            if (!puedeVerTodas && req.usuario?.id_ubicacion) {
                whereClause = 'WHERE p.id_ubicacion = $1';
                params.push(req.usuario.id_ubicacion);
            }

            const query = `
                SELECT 
                    c.*, 
                    p.id_ubicacion, 
                    u.nombre AS nombre_ubicacion, 
                    cl.razon_social_o_nombre AS nombre_cliente,
                    cl.numero_documento AS documento_cliente,
                    cl.direccion AS direccion_cliente
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                ${whereClause}
                ORDER BY c.id_comprobante DESC;
            `;
            const { rows } = await pool.query(query, params);
            res.json({ exito: true, comprobantes: rows });
        } catch (error) {
            console.error('Error al listar comprobantes:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al listar comprobantes', error: error.message });
        }
    },

    obtenerDetalleComprobante: async (req, res) => {
        try {
            const { id } = req.params;
            const resComp = await pool.query(`
                SELECT 
                    c.*,
                    p.id_ubicacion,
                    p.solicitado_por,
                    p.etiquetado,
                    p.sellado_vacio,
                    u.nombre AS nombre_ubicacion,
                    u.direccion_completa AS direccion_ubicacion,
                    u.telefono_contacto AS telefono_ubicacion,
                    cl.tipo_documento AS cliente_tipo_doc,
                    cl.numero_documento AS cliente_documento,
                    cl.razon_social_o_nombre AS nombre_cliente,
                    cl.nombre_comercial AS cliente_comercial,
                    cl.direccion AS cliente_direccion,
                    cl.email AS cliente_email
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                WHERE c.id_comprobante = $1;
            `, [id]);

            if (resComp.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Comprobante no encontrado.' });
            }

            const comprobante = resComp.rows[0];
            let items = [];
            if (comprobante.id_pedido) {
                const resItems = await pool.query(`
                    SELECT 
                        dp.id_producto,
                        pr.sku,
                        pr.nombre AS descripcion,
                        COALESCE(pr.unidad_medida, 'Unidad') AS unidad_medida,
                        dp.cantidad,
                        dp.precio_unitario,
                        dp.subtotal
                    FROM detalle_pedidos dp
                    JOIN productos pr ON dp.id_producto = pr.id_producto
                    WHERE dp.id_pedido = $1
                    ORDER BY dp.id_detalle ASC;
                `, [comprobante.id_pedido]);
                items = resItems.rows;
            }

            res.status(200).json({
                exito: true,
                comprobante,
                items
            });
        } catch (error) {
            console.error('Error al obtener detalle de comprobante:', error);
            res.status(500).json({ exito: false, mensaje: 'No se pudo cargar el detalle del comprobante.' });
        }
    },

    obtenerGraficosFacturacion: async (req, res) => {
        try {
            const anioActual = new Date().getFullYear();

            const [querySemanaActual, queryMesActual, queryTrimestres, queryAnios] = await Promise.all([
                pool.query(`
                    SELECT 
                        EXTRACT(ISODOW FROM (c.fecha_emision AT TIME ZONE 'America/Lima'))::int AS dia_iso,
                        to_char(c.fecha_emision AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS fecha_str,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                      AND c.tipo_comprobante IN ('01', '03')
                      AND (c.fecha_emision AT TIME ZONE 'America/Lima') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'))
                      AND (c.fecha_emision AT TIME ZONE 'America/Lima') < date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')) + INTERVAL '7 days'
                    GROUP BY dia_iso, fecha_str;
                `),
                pool.query(`
                    SELECT 
                        CASE 
                            WHEN EXTRACT(DAY FROM (c.fecha_emision AT TIME ZONE 'America/Lima')) BETWEEN 1 AND 7 THEN 1
                            WHEN EXTRACT(DAY FROM (c.fecha_emision AT TIME ZONE 'America/Lima')) BETWEEN 8 AND 14 THEN 2
                            WHEN EXTRACT(DAY FROM (c.fecha_emision AT TIME ZONE 'America/Lima')) BETWEEN 15 AND 21 THEN 3
                            WHEN EXTRACT(DAY FROM (c.fecha_emision AT TIME ZONE 'America/Lima')) BETWEEN 22 AND 28 THEN 4
                            ELSE 5
                        END AS num_semana,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                      AND c.tipo_comprobante IN ('01', '03')
                      AND (c.fecha_emision AT TIME ZONE 'America/Lima') >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima'))
                      AND (c.fecha_emision AT TIME ZONE 'America/Lima') < date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')) + INTERVAL '1 month'
                    GROUP BY num_semana
                    ORDER BY num_semana ASC;
                `),
                pool.query(`
                    SELECT 
                        EXTRACT(QUARTER FROM (c.fecha_emision AT TIME ZONE 'America/Lima'))::int AS q_num,
                        EXTRACT(YEAR FROM (c.fecha_emision AT TIME ZONE 'America/Lima'))::int AS anio,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                      AND c.tipo_comprobante IN ('01', '03')
                    GROUP BY q_num, anio
                    ORDER BY anio ASC, q_num ASC;
                `),
                pool.query(`
                    SELECT 
                        EXTRACT(YEAR FROM (c.fecha_emision AT TIME ZONE 'America/Lima'))::int AS anio,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                      AND c.tipo_comprobante IN ('01', '03')
                    GROUP BY anio
                    ORDER BY anio ASC;
                `)
            ]);

            const hoy = new Date();
            const diaSemanaHoy = hoy.getDay() === 0 ? 7 : hoy.getDay();
            const lunesSemana = new Date(hoy);
            lunesSemana.setDate(hoy.getDate() - diaSemanaHoy + 1);

            const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            const semanal = nombresDias.map((nombreDia, idx) => {
                const diaIso = idx + 1;
                const d = new Date(lunesSemana);
                d.setDate(lunesSemana.getDate() + idx);
                const diaNum = String(d.getDate()).padStart(2, '0');
                const mesNum = String(d.getMonth() + 1).padStart(2, '0');
                const fechaCorta = `${diaNum}/${mesNum}`;

                const match = querySemanaActual.rows.find(r => r.dia_iso === diaIso);
                return {
                    etiqueta: `${nombreDia.slice(0, 3)} ${diaNum}`,
                    nombreCompleto: `${nombreDia} ${fechaCorta}`,
                    total: match ? parseFloat(match.total) : 0,
                    cantidad: match ? match.cantidad : 0
                };
            });

            const semanasDef = [
                { num: 1, etiqueta: 'Sem 1', label: 'Semana 1 (Días 1 al 7)' },
                { num: 2, etiqueta: 'Sem 2', label: 'Semana 2 (Días 8 al 14)' },
                { num: 3, etiqueta: 'Sem 3', label: 'Semana 3 (Días 15 al 21)' },
                { num: 4, etiqueta: 'Sem 4', label: 'Semana 4 (Días 22 al 28)' },
                { num: 5, etiqueta: 'Sem 5', label: 'Semana 5 (Días 29 a Fin)' }
            ];

            const mensual = semanasDef.map(sem => {
                const match = queryMesActual.rows.find(r => r.num_semana === sem.num);
                return {
                    etiqueta: sem.etiqueta,
                    nombreCompleto: sem.label,
                    numSemana: sem.num,
                    total: match ? parseFloat(match.total) : 0,
                    cantidad: match ? match.cantidad : 0
                };
            });

            const trimestresNombres = [
                { id: 1, nombre: 'T1 (Ene-Mar)' },
                { id: 2, nombre: 'T2 (Abr-Jun)' },
                { id: 3, nombre: 'T3 (Jul-Set)' },
                { id: 4, nombre: 'T4 (Oct-Dic)' }
            ];
            const trimestral = trimestresNombres.map(t => {
                const match = queryTrimestres.rows.find(r => r.q_num === t.id && r.anio === anioActual);
                return {
                    trimestre: t.nombre,
                    id: t.id,
                    total: match ? parseFloat(match.total) : 0,
                    cantidad: match ? match.cantidad : 0
                };
            });

            const aniosRango = [anioActual - 2, anioActual - 1, anioActual, anioActual + 1];
            const anual = aniosRango.map(anio => {
                const match = queryAnios.rows.find(r => r.anio === anio);
                return {
                    anio: String(anio),
                    total: match ? parseFloat(match.total) : 0,
                    cantidad: match ? match.cantidad : 0
                };
            });

            const totalHistorico = queryAnios.rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
            const totalComprobantes = queryAnios.rows.reduce((sum, r) => sum + r.cantidad, 0);

            res.status(200).json({
                exito: true,
                moneda: 'PEN (S/)',
                resumen: {
                    totalHistorico,
                    totalComprobantes,
                    promedioMensual: totalHistorico > 0 ? (totalHistorico / 12).toFixed(2) : '0.00'
                },
                graficos: {
                    semanal,
                    mensual,
                    trimestral,
                    anual
                }
            });

        } catch (error) {
            console.error('Error al generar gráficos de facturación:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al generar métricas de facturación', error: error.message });
        }
    }

};

module.exports = facturaController;
