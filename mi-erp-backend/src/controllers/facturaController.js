const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const facturaController = {

    emitirComprobante: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id_pedido, tipo_comprobante, forma_pago, dias_credito, fecha_vencimiento_cuota } = req.body; // '01' para Factura, '03' para Boleta

            if (!id_pedido || !tipo_comprobante) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Faltan datos obligatorios (id_pedido o tipo_comprobante).' });
            }
            if (tipo_comprobante !== '01' && tipo_comprobante !== '03') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Tipo de comprobante inválido. Use "01" (Factura) o "03" (Boleta).' });
            }

            // Condición de pago: CONTADO o CREDITO
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

            //VALIDACION BLINDADA: Verificar si el pedido ya fue facturado
            const resPedidoCheck = await client.query("SELECT estado_pedido FROM pedidos WHERE id_pedido = $1", [id_pedido]);
            if (resPedidoCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Pedido no encontrado.' });
            }

            const estadoActual = resPedidoCheck.rows[0].estado_pedido;
            if (estadoActual !== 'PENDIENTE') {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    exito: false, 
                    mensaje: `No se puede facturar. Este pedido ya se encuentra en estado: ${estadoActual}.` 
                });
            }

            //obtener los datos completos del pedido y sus items
            const queryPedido = `
                SELECT 
                    p.id_pedido, p.id_usuario, p.monto_total, p.id_ubicacion,
                    c.tipo_documento, c.numero_documento, c.razon_social_o_nombre, c.direccion, c.email
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                WHERE p.id_pedido = $1;
            `;
            const resPedido = await client.query(queryPedido, [id_pedido]);
            const pedido = resPedido.rows[0];

            const queryDetalle = `
                SELECT 
                    dp.id_producto, pr.sku, pr.nombre AS descripcion, dp.cantidad, dp.precio_unitario, dp.subtotal
                FROM detalle_pedidos dp
                JOIN productos pr ON dp.id_producto = pr.id_producto
                WHERE dp.id_pedido = $1;
            `;
            const resDetalle = await client.query(queryDetalle, [id_pedido]);
            const items = resDetalle.rows;

            //calculos matematicos fiscales (IGV 18%)
            const montoTotal = parseFloat(pedido.monto_total);
            const montoSubtotal = montoTotal / 1.18;
            const montoIgv = montoTotal - montoSubtotal;

            const serie = tipo_comprobante === '01' ? 'F001' : 'B001';
            
            // Bloqueo de concurrencia: obtenemos y bloqueamos la fila de la serie
            const resSerie = await client.query(`
                SELECT ultimo_correlativo 
                FROM series_sunat 
                WHERE serie = $1 FOR UPDATE
            `, [serie]);
            
            let correlativo = 1;
            if (resSerie.rows.length === 0) {
                // Si la serie no existe, la inicializamos
                await client.query(`
                    INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo)
                    VALUES ($1, $2, $3)
                `, [tipo_comprobante, serie, 1]);
            } else {
                correlativo = resSerie.rows[0].ultimo_correlativo + 1;
                // Actualizamos el último correlativo
                await client.query(`
                    UPDATE series_sunat 
                    SET ultimo_correlativo = $1 
                    WHERE serie = $2
                `, [correlativo, serie]);
            }

            // Integración OSE/PSE (Estructura para Nubefact / Factiliza)
            // Aquí iría un request con Axios, ej: axios.post('https://api.nubefact.com/api/v1/invoice', { ... })
            let respuestaSunat;
            try {
                // Simulamos la respuesta de la API del OSE/PSE
                const nubefactRequest = {
                    operacion: "generar_comprobante",
                    tipo_de_comprobante: tipo_comprobante,
                    serie: serie,
                    numero: correlativo,
                    sunat_transaction: 1,
                    cliente_tipo_de_documento: pedido.tipo_documento,
                    cliente_numero_de_documento: pedido.numero_documento,
                    cliente_denominacion: pedido.razon_social_o_nombre,
                    cliente_direccion: pedido.direccion,
                    cliente_email: pedido.email,
                    fecha_de_emision: new Date().toISOString().split('T')[0],
                    moneda: 1,
                    porcentaje_de_igv: 18.00,
                    total_gravada: montoSubtotal.toFixed(2),
                    total_igv: montoIgv.toFixed(2),
                    total: montoTotal.toFixed(2),
                    enviar_automaticamente_a_la_sunat: true,
                    enviar_automaticamente_al_cliente: true,
                    items: items.map(item => ({
                        unidad_de_medida: "NIU",
                        codigo: item.sku,
                        descripcion: item.descripcion,
                        cantidad: item.cantidad,
                        valor_unitario: (item.precio_unitario / 1.18).toFixed(2),
                        precio_unitario: item.precio_unitario,
                        subtotal: (item.subtotal / 1.18).toFixed(2),
                        tipo_de_igv: 1,
                        igv: (item.subtotal - (item.subtotal / 1.18)).toFixed(2),
                        total: item.subtotal
                    }))
                };
                
                // axios.post(...)
                respuestaSunat = {
                    aceptada_por_sunat: true,
                    codigo_hash: "HashOSE_" + Math.random().toString(36).substring(7),
                    mensaje_cdr: "La factura ha sido aceptada exitosamente.",
                    enlace_pdf: `https://api.nubefact.com/pdf/${serie}-${correlativo}.pdf`
                };
            } catch (err) {
                throw new Error("El proveedor OSE/PSE rechazó el comprobante: " + err.message);
            }

            //guardar el comprobante en la base de datos
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
                respuestaSunat.codigo_hash, 
                respuestaSunat.mensaje_cdr
            ]);

            // CAMBIAR EL ESTADO DEL PEDIDO A FACTURADO PERMANENTEMENTE
            await client.query(`
                UPDATE pedidos 
                SET estado_pedido = 'FACTURADO' 
                WHERE id_pedido = $1;
            `, [id_pedido]);

            // REGLA DE NEGOCIO ETAPA 4: Facturar genera salida física en Kardex y libera la reserva de inventario
            for (const item of items) {
                // 1. Huella en Kardex como SALIDA
                const queryKardex = `
                    INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                    VALUES ($1, $2, $3, 'SALIDA', $4, $5);
                `;
                await client.query(queryKardex, [
                    item.id_producto,
                    pedido.id_ubicacion,
                    req.usuario?.id_usuario || pedido.id_usuario,
                    item.cantidad,
                    `Venta Facturada: ${serie}-${correlativo} (Pedido #${id_pedido})`
                ]);

                // 2. Descontar stock físico y liberar stock reservado
                await client.query(`
                    UPDATE inventario 
                    SET cantidad_fisica = cantidad_fisica - $1,
                        cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                        ultima_actualizacion = CURRENT_TIMESTAMP
                    WHERE id_producto = $2 AND id_ubicacion = $3;
                `, [item.cantidad, item.id_producto, pedido.id_ubicacion]);
            }

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
                mensaje: 'Comprobante emitido y procesado con la SUNAT correctamente.',
                comprobante: resComprobante.rows[0],
                enlace_pdf_qr: `https://api.tufacturacion.com/pdf/${serie}-${correlativo}.pdf`
            });

        } catch (error) {
            await client.query('ROLLBACK'); //si algo falla, deshacemos todo
            console.error('Error al emitir factura:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error interno al procesar la facturación electrónica',
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

            if (!id_comprobante || !motivo) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Faltan datos obligatorios (id_comprobante o motivo).' });
            }

            // Buscar el comprobante original
            const resComp = await client.query("SELECT * FROM comprobantes WHERE id_comprobante = $1", [id_comprobante]);
            if (resComp.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Comprobante original no encontrado.' });
            }
            const compOriginal = resComp.rows[0];

            if (compOriginal.estado_sunat === 'ANULADO') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'El comprobante ya se encuentra anulado.' });
            }

            // Generar serie y correlativo para la Nota de Crédito
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
                `, ['07', serieNC, 1]); // '07' es Nota de Crédito
            } else {
                correlativoNC = resSerie.rows[0].ultimo_correlativo + 1;
                await client.query(`
                    UPDATE series_sunat 
                    SET ultimo_correlativo = $1 
                    WHERE serie = $2
                `, [correlativoNC, serieNC]);
            }

            // Simulación OSE/PSE para Nota de Crédito
            let respuestaSunat;
            try {
                // Aquí iría el request de Nubefact para Nota de Crédito
                respuestaSunat = {
                    aceptada_por_sunat: true,
                    codigo_hash: "HashOSE_NC_" + Math.random().toString(36).substring(7),
                    mensaje_cdr: "La Nota de Crédito ha sido aceptada exitosamente.",
                };
            } catch (err) {
                throw new Error("El proveedor OSE/PSE rechazó la nota de crédito: " + err.message);
            }

            // Insertar la nota de crédito como un nuevo comprobante
            const queryNC = `
                INSERT INTO comprobantes (id_pedido, tipo_comprobante, serie, correlativo, monto_subtotal, monto_igv, monto_total, estado_sunat, codigo_hash, mensaje_cdr)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;
            const resNC = await client.query(queryNC, [
                compOriginal.id_pedido,
                '07', // Nota de Crédito
                serieNC,
                correlativoNC,
                compOriginal.monto_subtotal,
                compOriginal.monto_igv,
                compOriginal.monto_total,
                'ACEPTADO',
                respuestaSunat.codigo_hash,
                respuestaSunat.mensaje_cdr
            ]);

            // Actualizar el estado del comprobante original
            await client.query(`
                UPDATE comprobantes 
                SET estado_sunat = 'ANULADO' 
                WHERE id_comprobante = $1
            `, [id_comprobante]);

            // Actualizar el estado del pedido a CANCELADO o similar si se requiere
            await client.query(`
                UPDATE pedidos 
                SET estado_pedido = 'CANCELADO' 
                WHERE id_pedido = $1
            `, [compOriginal.id_pedido]);

            await registrarAuditoria(client, req.usuario?.id_usuario || null, 'ANULAR_COMPROBANTE', 'comprobantes', id_comprobante, compOriginal, { ...compOriginal, estado_sunat: 'ANULADO' });
            await registrarAuditoria(client, req.usuario?.id_usuario || null, 'EMITIR_NOTA_CREDITO', 'comprobantes', resNC.rows[0].id_comprobante, null, resNC.rows[0]);

            await client.query('COMMIT');

            res.status(201).json({
                exito: true,
                mensaje: 'Nota de crédito emitida. Comprobante anulado correctamente.',
                nota_credito: resNC.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ exito: false, mensaje: 'Error al anular comprobante', error: error.message });
        } finally {
            client.release();
        }
    },

    listarComprobantes: async (req, res) => {
        try {
            const query = `
                SELECT 
                    c.*, 
                    p.id_ubicacion, 
                    u.nombre AS nombre_ubicacion, 
                    cl.razon_social_o_nombre AS nombre_cliente
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                ORDER BY c.id_comprobante DESC;
            `;
            const { rows } = await pool.query(query);
            res.json({ exito: true, comprobantes: rows });
        } catch (error) {
            console.error('Error al listar comprobantes:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al listar comprobantes', error: error.message });
        }
    },

    obtenerGraficosFacturacion: async (req, res) => {
        try {
            const [queryDias, queryMeses, queryTrimestres, queryAnios] = await Promise.all([
                pool.query(`
                    SELECT 
                        to_char(c.fecha_emision, 'YYYY-MM-DD') AS fecha,
                        to_char(c.fecha_emision, 'Dy') AS dia_semana,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                    GROUP BY fecha, dia_semana
                    ORDER BY fecha DESC
                    LIMIT 7;
                `),
                pool.query(`
                    SELECT 
                        EXTRACT(MONTH FROM c.fecha_emision)::int AS mes_num,
                        EXTRACT(YEAR FROM c.fecha_emision)::int AS anio,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                    GROUP BY mes_num, anio
                    ORDER BY anio ASC, mes_num ASC;
                `),
                pool.query(`
                    SELECT 
                        EXTRACT(QUARTER FROM c.fecha_emision)::int AS q_num,
                        EXTRACT(YEAR FROM c.fecha_emision)::int AS anio,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                    GROUP BY q_num, anio
                    ORDER BY anio ASC, q_num ASC;
                `),
                pool.query(`
                    SELECT 
                        EXTRACT(YEAR FROM c.fecha_emision)::int AS anio,
                        COALESCE(SUM(c.monto_total), 0) AS total,
                        COUNT(c.id_comprobante)::int AS cantidad
                    FROM comprobantes c
                    WHERE c.estado_sunat != 'ANULADO'
                    GROUP BY anio
                    ORDER BY anio ASC;
                `)
            ]);

            const diasNombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
            let semanal = diasNombres.map((dia) => {
                const match = queryDias.rows.find(r => r.dia_semana && r.dia_semana.toLowerCase().startsWith(dia.toLowerCase().slice(0, 2)));
                return {
                    etiqueta: dia,
                    total: match ? parseFloat(match.total) : 0,
                    cantidad: match ? match.cantidad : 0
                };
            });

            if (semanal.every(s => s.total === 0) && queryDias.rows.length > 0) {
                semanal = queryDias.rows.map(r => ({
                    etiqueta: r.fecha.slice(5),
                    total: parseFloat(r.total),
                    cantidad: r.cantidad
                }));
            }

            const mesesNombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
            const anioActual = new Date().getFullYear();
            const mensual = mesesNombres.map((nombre, idx) => {
                const mesNum = idx + 1;
                const match = queryMeses.rows.find(r => r.mes_num === mesNum && r.anio === anioActual) 
                           || queryMeses.rows.find(r => r.mes_num === mesNum);
                return {
                    mes: nombre,
                    mesNum,
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
                const match = queryTrimestres.rows.find(r => r.q_num === t.id && r.anio === anioActual)
                           || queryTrimestres.rows.find(r => r.q_num === t.id);
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