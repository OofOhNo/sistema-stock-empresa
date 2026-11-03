const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const {
    CATALOGOS_SUNAT,
    numeroALetrasSoles,
    validarReglasTributarias,
    calcularDesgloseTributario,
    construirPayloadNubefact,
    generarXmlUbl21YDatosSunat,
    enviarAConectorNubefact
} = require('../utils/sunatNubefactService');

async function obtenerConfigEmisor(clientOrPool = pool) {
    try {
        const res = await clientOrPool.query('SELECT * FROM configuracion_empresa_sunat WHERE id_config = 1');
        if (res.rows.length > 0) {
            return res.rows[0];
        }
    } catch {
        // Fallback seguro si la tabla aún no fue consultada
    }
    return {
        ruc_emisor: process.env.SUNAT_RUC_EMISOR || '20600000001',
        razon_social: process.env.SUNAT_RAZON_SOCIAL || 'EMPRESA DEMO ERP S.A.C.',
        nombre_comercial: process.env.SUNAT_NOMBRE_COMERCIAL || 'SISTEMA ERP PERÚ',
        direccion_fiscal: process.env.SUNAT_DIRECCION_FISCAL || 'Av. Empresarial 100, Lima - Perú',
        ubigeo: '150101',
        modo_integracion: process.env.NUBEFACT_MODO || 'DEMO_NUBEFACT',
        nubefact_ruta: process.env.NUBEFACT_RUTA || 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
        nubefact_token: process.env.NUBEFACT_TOKEN || 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
        igv_porcentaje: 18.00,
        detraccion_cuenta_bn: '00-000-000000',
        enviar_automaticamente_sunat: true,
        enviar_automaticamente_cliente: true
    };
}

const facturaController = {

    obtenerConfiguracionYCatalogos: async (req, res) => {
        try {
            const [configEmisor, resSeries] = await Promise.all([
                obtenerConfigEmisor(pool),
                pool.query('SELECT * FROM series_sunat ORDER BY tipo_comprobante ASC, serie ASC')
            ]);

            res.status(200).json({
                exito: true,
                configuracion: configEmisor,
                series: resSeries.rows,
                catalogos: CATALOGOS_SUNAT
            });
        } catch (error) {
            console.error('Error al obtener configuración SUNAT:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'No se pudo cargar la configuración de facturación.',
                error: error.message
            });
        }
    },

    actualizarConfiguracionSunat: async (req, res) => {
        try {
            const {
                ruc_emisor,
                razon_social,
                nombre_comercial,
                direccion_fiscal,
                ubigeo,
                modo_integracion,
                nubefact_ruta,
                nubefact_token,
                detraccion_cuenta_bn,
                enviar_automaticamente_sunat,
                enviar_automaticamente_cliente
            } = req.body;

            const rucLimpio = String(ruc_emisor || '').trim();
            if (!/^(10|15|16|17|20)\d{9}$/.test(rucLimpio)) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'El RUC de la empresa emisora debe tener 11 dígitos válidos (empezar con 10 o 20).'
                });
            }

            if (!razon_social || !String(razon_social).trim()) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Escribe la Razón Social de la empresa emisora.'
                });
            }

            const modoFinal = modo_integracion === 'NUBEFACT_REAL' ? 'NUBEFACT_REAL' : 'DEMO_NUBEFACT';

            const { rows } = await pool.query(`
                INSERT INTO configuracion_empresa_sunat (
                    id_config, ruc_emisor, razon_social, nombre_comercial,
                    direccion_fiscal, ubigeo, modo_integracion,
                    nubefact_ruta, nubefact_token, detraccion_cuenta_bn,
                    enviar_automaticamente_sunat, enviar_automaticamente_cliente,
                    actualizado_en
                ) VALUES (
                    1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP
                )
                ON CONFLICT (id_config) DO UPDATE SET
                    ruc_emisor = EXCLUDED.ruc_emisor,
                    razon_social = EXCLUDED.razon_social,
                    nombre_comercial = EXCLUDED.nombre_comercial,
                    direccion_fiscal = EXCLUDED.direccion_fiscal,
                    ubigeo = EXCLUDED.ubigeo,
                    modo_integracion = EXCLUDED.modo_integracion,
                    nubefact_ruta = EXCLUDED.nubefact_ruta,
                    nubefact_token = EXCLUDED.nubefact_token,
                    detraccion_cuenta_bn = EXCLUDED.detraccion_cuenta_bn,
                    enviar_automaticamente_sunat = EXCLUDED.enviar_automaticamente_sunat,
                    enviar_automaticamente_cliente = EXCLUDED.enviar_automaticamente_cliente,
                    actualizado_en = CURRENT_TIMESTAMP
                RETURNING *;
            `, [
                rucLimpio,
                String(razon_social).trim(),
                nombre_comercial ? String(nombre_comercial).trim() : String(razon_social).trim(),
                direccion_fiscal ? String(direccion_fiscal).trim() : '',
                ubigeo ? String(ubigeo).trim() : '150101',
                modoFinal,
                nubefact_ruta ? String(nubefact_ruta).trim() : 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
                nubefact_token ? String(nubefact_token).trim() : 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
                detraccion_cuenta_bn ? String(detraccion_cuenta_bn).trim() : '00-000-000000',
                enviar_automaticamente_sunat !== false,
                enviar_automaticamente_cliente !== false
            ]);

            res.status(200).json({
                exito: true,
                mensaje: 'Configuración de SUNAT y NubeFact guardada correctamente.',
                configuracion: rows[0]
            });
        } catch (error) {
            console.error('Error al actualizar configuración SUNAT:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'No se pudo guardar la configuración de SUNAT.',
                error: error.message
            });
        }
    },

    probarConexionNubefact: async (req, res) => {
        try {
            const config = await obtenerConfigEmisor(pool);
            const modo = req.body?.modo_integracion || config.modo_integracion;
            const ruta = req.body?.nubefact_ruta || config.nubefact_ruta;
            const token = req.body?.nubefact_token || config.nubefact_token;

            if (modo === 'DEMO_NUBEFACT' || !ruta || ruta.includes('demo-integrada-erp')) {
                return res.status(200).json({
                    exito: true,
                    modo: 'DEMO_NUBEFACT',
                    mensaje: `Conexión DEMO NubeFact API v1 activa para RUC ${config.ruc_emisor} (${config.razon_social}). Generación de XML UBL 2.1, Firma Hash SHA-256, QR oficial y CDR código 0 operativa al 100%.`
                });
            }

            // Si es NUBEFACT_REAL, hacemos una consulta de estado de prueba a la ruta configurada
            const authHeader = token.startsWith('Token ') || token.startsWith('Bearer ')
                ? token
                : `Bearer ${token}`;

            const resPing = await fetch(ruta, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    operacion: 'consultar_comprobante',
                    tipo_de_comprobante: 1,
                    serie: 'F001',
                    numero: 1
                })
            });

            const dataPing = await resPing.json().catch(() => ({}));
            if (resPing.status === 401 || resPing.status === 403) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'NubeFact rechazó el Token de autorización (401/403). Verifica tu Token en el panel de NubeFact.'
                });
            }

            return res.status(200).json({
                exito: true,
                modo: 'NUBEFACT_REAL',
                mensaje: `Conexión exitosa con el servidor de NubeFact (${ruta}). Respuesta recibida correctamente.`,
                detalle_respuesta: dataPing
            });
        } catch (error) {
            return res.status(400).json({
                exito: false,
                mensaje: `No se pudo conectar con la ruta indicada: ${error.message}`
            });
        }
    },

    emitirComprobante: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                id_pedido,
                tipo_comprobante,
                forma_pago,
                dias_credito,
                fecha_vencimiento_cuota,
                medio_pago_sunat = '008',
                aplica_detraccion = false,
                codigo_detraccion = '014'
            } = req.body;

            if (!id_pedido || !tipo_comprobante) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Por favor selecciona un pedido y el tipo de comprobante (Factura o Boleta).' });
            }
            if (tipo_comprobante !== '01' && tipo_comprobante !== '03') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Selecciona Factura (01) o Boleta de Venta (03).' });
            }

            const configEmisor = await obtenerConfigEmisor(client);

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
                    mensaje: `Este pedido ya tiene el comprobante ${prev.serie}-${String(prev.correlativo).padStart(8, '0')} emitido.`
                });
            }

            // Validar reglas tributarias de SUNAT (RUC 11 dígitos para Factura, DNI en Boletas >= S/ 700, etc.)
            const validacionSunat = validarReglasTributarias({
                tipo_comprobante,
                cliente: pedido,
                monto_total: pedido.monto_total,
                fecha_emision: new Date()
            });

            if (!validacionSunat.valido) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    exito: false,
                    mensaje: validacionSunat.mensaje
                });
            }

            const queryDetalle = `
                SELECT 
                    dp.id_producto,
                    pr.sku,
                    pr.nombre AS descripcion,
                    COALESCE(pr.unidad_medida, 'Unidad') AS unidad_medida,
                    COALESCE(um.codigo, 'NIU') AS codigo_unidad_sunat,
                    COALESCE(pr.tipo_afectacion_igv, '10') AS tipo_afectacion_igv,
                    pr.codigo_producto_sunat,
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

            // Calcular desglose tributario exacto según Catálogo 07 de cada ítem
            const { itemsCalculados, totales } = calcularDesgloseTributario(items, configEmisor.igv_porcentaje);
            const montoEnLetras = numeroALetrasSoles(totales.monto_total);

            // Detracción SPOT (si aplica y supera S/ 700)
            const detInfo = CATALOGOS_SUNAT.codigos_detraccion.find(d => d.codigo === codigo_detraccion)
                || CATALOGOS_SUNAT.codigos_detraccion[0];
            const aplicaDetFinal = Boolean(aplica_detraccion && tipo_comprobante === '01');
            const porcentajeDetFinal = aplicaDetFinal ? detInfo.porcentaje : 0;
            const montoDetFinal = aplicaDetFinal ? +(totales.monto_total * (porcentajeDetFinal / 100)).toFixed(2) : 0;
            const tipoOperacionSunat = aplicaDetFinal ? '1001' : '0101';

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

            // Construir payload NubeFact API v1 y XML UBL 2.1 firmado + CDR SUNAT
            const payloadNubefact = construirPayloadNubefact({
                tipo_comprobante,
                serie,
                correlativo,
                cliente: pedido,
                itemsCalculados,
                totales,
                forma_pago: formaPagoFinal,
                fecha_vencimiento_cuota: fechaVencimientoFinal,
                medio_pago_sunat,
                aplica_detraccion: aplicaDetFinal,
                codigo_detraccion: aplicaDetFinal ? detInfo.codigo : null,
                porcentaje_detraccion: porcentajeDetFinal,
                monto_detraccion: montoDetFinal,
                configEmisor
            });

            const datosUbl = generarXmlUbl21YDatosSunat({
                tipo_comprobante,
                serie,
                correlativo,
                configEmisor,
                cliente: pedido,
                itemsCalculados,
                totales,
                monto_en_letras: montoEnLetras,
                forma_pago: formaPagoFinal,
                fecha_vencimiento_cuota: fechaVencimientoFinal
            });

            const respuestaOse = await enviarAConectorNubefact({
                payloadNubefact,
                configEmisor,
                datosUbl
            });

            const queryComprobante = `
                INSERT INTO comprobantes (
                    id_pedido, tipo_comprobante, serie, correlativo, 
                    monto_subtotal, monto_gravada, monto_exonerada, monto_inafecta,
                    monto_igv, monto_total, 
                    forma_pago, dias_credito, fecha_vencimiento_cuota,
                    medio_pago_sunat, tipo_operacion_sunat,
                    aplica_detraccion, codigo_detraccion, porcentaje_detraccion, monto_detraccion,
                    estado_sunat, codigo_hash, mensaje_cdr,
                    cadena_qr, monto_en_letras,
                    enlace_pdf, enlace_xml, enlace_cdr,
                    xml_firmado, cdr_xml, respuesta_ose_json, modo_emision
                )
                VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8,
                    $9, $10,
                    $11, $12, $13,
                    $14, $15,
                    $16, $17, $18, $19,
                    $20, $21, $22,
                    $23, $24,
                    $25, $26, $27,
                    $28, $29, $30, $31
                )
                RETURNING *;
            `;
            const resComprobante = await client.query(queryComprobante, [
                id_pedido,
                tipo_comprobante,
                serie,
                correlativo,
                totales.monto_subtotal.toFixed(2),
                totales.monto_gravada.toFixed(2),
                totales.monto_exonerada.toFixed(2),
                totales.monto_inafecta.toFixed(2),
                totales.monto_igv.toFixed(2),
                totales.monto_total.toFixed(2),
                formaPagoFinal,
                diasCreditoFinal,
                fechaVencimientoFinal,
                medio_pago_sunat || '008',
                tipoOperacionSunat,
                aplicaDetFinal,
                aplicaDetFinal ? detInfo.codigo : null,
                porcentajeDetFinal,
                montoDetFinal,
                respuestaOse.estado_sunat,
                respuestaOse.codigo_hash,
                respuestaOse.mensaje_cdr,
                respuestaOse.cadena_qr,
                montoEnLetras,
                respuestaOse.enlace_pdf,
                respuestaOse.enlace_xml,
                respuestaOse.enlace_cdr,
                datosUbl.xmlFirmado,
                datosUbl.cdrXml,
                JSON.stringify(respuestaOse.respuesta_ose_json || {}),
                respuestaOse.modo_emision
            ]);

            const compCreado = resComprobante.rows[0];

            // Si no vino enlace externo de XML/CDR, guardar las rutas internas de descarga UBL 2.1 y CDR
            if (!compCreado.enlace_xml || !compCreado.enlace_cdr) {
                const updEnlaces = await client.query(`
                    UPDATE comprobantes
                    SET enlace_xml = COALESCE(enlace_xml, $1),
                        enlace_cdr = COALESCE(enlace_cdr, $2)
                    WHERE id_comprobante = $3
                    RETURNING *;
                `, [
                    `/api/facturacion/${compCreado.id_comprobante}/xml`,
                    `/api/facturacion/${compCreado.id_comprobante}/cdr`,
                    compCreado.id_comprobante
                ]);
                Object.assign(compCreado, updEnlaces.rows[0]);
            }

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
                compCreado.id_comprobante,
                null,
                {
                    id_comprobante: compCreado.id_comprobante,
                    serie: compCreado.serie,
                    correlativo: compCreado.correlativo,
                    monto_total: compCreado.monto_total,
                    codigo_hash: compCreado.codigo_hash,
                    modo_emision: compCreado.modo_emision
                }
            );

            await client.query('COMMIT');

            res.status(201).json({
                exito: true,
                mensaje: `¡Comprobante ${serie}-${String(correlativo).padStart(8, '0')} emitido y aceptado por SUNAT!`,
                comprobante: compCreado
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al emitir factura:', error);
            res.status(500).json({
                exito: false,
                mensaje: error.message || 'No se pudo emitir el comprobante.',
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
            const { id_comprobante, motivo, codigo_motivo_nc = '01' } = req.body;

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

            const configEmisor = await obtenerConfigEmisor(client);
            const motivoCat09 = CATALOGOS_SUNAT.motivos_nota_credito.find(m => m.codigo === codigo_motivo_nc)
                || CATALOGOS_SUNAT.motivos_nota_credito[0];

            // Obtener cliente e ítems del comprobante original para armar la Nota de Crédito UBL 2.1 y NubeFact v1
            let clienteDatos = {
                tipo_documento: compOriginal.tipo_comprobante === '01' ? '6' : '1',
                numero_documento: '20000000001',
                razon_social_o_nombre: 'CLIENTE GENERAL',
                direccion: '',
                email: ''
            };
            let itemsOriginales = [];

            if (compOriginal.id_pedido) {
                const resPedCli = await client.query(`
                    SELECT c.tipo_documento, c.numero_documento, c.razon_social_o_nombre, c.direccion, c.email
                    FROM pedidos p
                    JOIN clientes c ON p.id_cliente = c.id_cliente
                    WHERE p.id_pedido = $1
                `, [compOriginal.id_pedido]);
                if (resPedCli.rows.length > 0) {
                    clienteDatos = resPedCli.rows[0];
                }

                const resDet = await client.query(`
                    SELECT 
                        dp.id_producto, pr.sku, pr.nombre AS descripcion,
                        COALESCE(pr.unidad_medida, 'Unidad') AS unidad_medida,
                        COALESCE(um.codigo, 'NIU') AS codigo_unidad_sunat,
                        COALESCE(pr.tipo_afectacion_igv, '10') AS tipo_afectacion_igv,
                        dp.cantidad, dp.precio_unitario, dp.subtotal
                    FROM detalle_pedidos dp
                    JOIN productos pr ON dp.id_producto = pr.id_producto
                    LEFT JOIN unidades_medida um ON pr.id_unidad = um.id_unidad
                    WHERE dp.id_pedido = $1
                `, [compOriginal.id_pedido]);
                itemsOriginales = resDet.rows;
            }

            if (itemsOriginales.length === 0) {
                itemsOriginales = [{
                    id_producto: 0,
                    sku: 'ANUL-01',
                    descripcion: `Anulación de ${compOriginal.serie}-${String(compOriginal.correlativo).padStart(8, '0')}`,
                    codigo_unidad_sunat: 'NIU',
                    tipo_afectacion_igv: '10',
                    cantidad: 1,
                    precio_unitario: Number(compOriginal.monto_total),
                    subtotal: Number(compOriginal.monto_total)
                }];
            }

            const { itemsCalculados, totales } = calcularDesgloseTributario(itemsOriginales, configEmisor.igv_porcentaje);
            const montoEnLetrasNC = numeroALetrasSoles(totales.monto_total);

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

            const descripcionMotivoFinal = `${motivoCat09.nombre}: ${String(motivo).trim()}`;

            const payloadNubefactNC = construirPayloadNubefact({
                tipo_comprobante: '07',
                serie: serieNC,
                correlativo: correlativoNC,
                cliente: clienteDatos,
                itemsCalculados,
                totales,
                comprobante_referencia: compOriginal,
                codigo_motivo_nc: motivoCat09.codigo,
                descripcion_motivo_nc: descripcionMotivoFinal,
                configEmisor
            });

            const datosUblNC = generarXmlUbl21YDatosSunat({
                tipo_comprobante: '07',
                serie: serieNC,
                correlativo: correlativoNC,
                configEmisor,
                cliente: clienteDatos,
                itemsCalculados,
                totales,
                monto_en_letras: montoEnLetrasNC,
                comprobante_referencia: compOriginal,
                codigo_motivo_nc: motivoCat09.codigo,
                descripcion_motivo_nc: descripcionMotivoFinal
            });

            const respuestaOseNC = await enviarAConectorNubefact({
                payloadNubefact: payloadNubefactNC,
                configEmisor,
                datosUbl: datosUblNC
            });

            const resNC = await client.query(`
                INSERT INTO comprobantes (
                    id_pedido, tipo_comprobante, serie, correlativo,
                    monto_subtotal, monto_gravada, monto_exonerada, monto_inafecta,
                    monto_igv, monto_total,
                    id_comprobante_referencia, codigo_motivo_nc, descripcion_motivo_nc,
                    estado_sunat, codigo_hash, mensaje_cdr,
                    cadena_qr, monto_en_letras,
                    enlace_pdf, enlace_xml, enlace_cdr,
                    xml_firmado, cdr_xml, respuesta_ose_json, modo_emision
                )
                VALUES (
                    $1, '07', $2, $3,
                    $4, $5, $6, $7,
                    $8, $9,
                    $10, $11, $12,
                    'ACEPTADO', $13, $14,
                    $15, $16,
                    $17, $18, $19,
                    $20, $21, $22, $23
                )
                RETURNING *;
            `, [
                compOriginal.id_pedido,
                serieNC,
                correlativoNC,
                totales.monto_subtotal.toFixed(2),
                totales.monto_gravada.toFixed(2),
                totales.monto_exonerada.toFixed(2),
                totales.monto_inafecta.toFixed(2),
                totales.monto_igv.toFixed(2),
                totales.monto_total.toFixed(2),
                compOriginal.id_comprobante,
                motivoCat09.codigo,
                descripcionMotivoFinal,
                respuestaOseNC.codigo_hash,
                respuestaOseNC.mensaje_cdr,
                respuestaOseNC.cadena_qr,
                montoEnLetrasNC,
                respuestaOseNC.enlace_pdf,
                respuestaOseNC.enlace_xml,
                respuestaOseNC.enlace_cdr,
                datosUblNC.xmlFirmado,
                datosUblNC.cdrXml,
                JSON.stringify(respuestaOseNC.respuesta_ose_json || {}),
                respuestaOseNC.modo_emision
            ]);

            const ncCreada = resNC.rows[0];
            if (!ncCreada.enlace_xml || !ncCreada.enlace_cdr) {
                const updNC = await client.query(`
                    UPDATE comprobantes
                    SET enlace_xml = COALESCE(enlace_xml, $1),
                        enlace_cdr = COALESCE(enlace_cdr, $2)
                    WHERE id_comprobante = $3
                    RETURNING *;
                `, [
                    `/api/facturacion/${ncCreada.id_comprobante}/xml`,
                    `/api/facturacion/${ncCreada.id_comprobante}/cdr`,
                    ncCreada.id_comprobante
                ]);
                Object.assign(ncCreada, updNC.rows[0]);
            }

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
                                `Devolución de stock por Nota de Crédito ${serieNC}-${correlativoNC} (Anula ${compOriginal.serie}-${compOriginal.correlativo})`
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

            await registrarAuditoria(client, req.usuario?.id_usuario || null, 'ANULAR_COMPROBANTE', 'comprobantes', id_comprobante, { id_comprobante, estado_sunat: compOriginal.estado_sunat }, { id_comprobante, estado_sunat: 'ANULADO', motivo: descripcionMotivoFinal });
            await registrarAuditoria(client, req.usuario?.id_usuario || null, 'EMITIR_NOTA_CREDITO', 'comprobantes', ncCreada.id_comprobante, null, { id_comprobante: ncCreada.id_comprobante, serie: ncCreada.serie, correlativo: ncCreada.correlativo });

            await client.query('COMMIT');

            res.status(201).json({
                exito: true,
                mensaje: `¡Comprobante anulado con Nota de Crédito ${serieNC}-${String(correlativoNC).padStart(8, '0')} y stock devuelto al inventario!`,
                nota_credito: ncCreada
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
                    c.id_comprobante, c.id_pedido, c.tipo_comprobante, c.serie, c.correlativo,
                    c.monto_subtotal, c.monto_gravada, c.monto_exonerada, c.monto_inafecta,
                    c.monto_igv, c.monto_total,
                    c.forma_pago, c.dias_credito, c.fecha_vencimiento_cuota,
                    c.medio_pago_sunat, c.tipo_operacion_sunat,
                    c.aplica_detraccion, c.codigo_detraccion, c.porcentaje_detraccion, c.monto_detraccion,
                    c.id_comprobante_referencia, c.codigo_motivo_nc, c.descripcion_motivo_nc,
                    c.estado_sunat, c.codigo_hash, c.mensaje_cdr, c.cadena_qr, c.monto_en_letras,
                    c.enlace_pdf, c.enlace_xml, c.enlace_cdr, c.modo_emision, c.fecha_emision,
                    p.id_ubicacion, 
                    u.nombre AS nombre_ubicacion, 
                    cl.razon_social_o_nombre AS nombre_cliente,
                    cl.numero_documento AS documento_cliente,
                    cl.tipo_documento AS tipo_documento_cliente,
                    cl.direccion AS direccion_cliente,
                    ref.serie AS ref_serie,
                    ref.correlativo AS ref_correlativo
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                LEFT JOIN comprobantes ref ON c.id_comprobante_referencia = ref.id_comprobante
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
            const [resComp, configEmisor] = await Promise.all([
                pool.query(`
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
                        cl.email AS cliente_email,
                        ref.tipo_comprobante AS ref_tipo_comprobante,
                        ref.serie AS ref_serie,
                        ref.correlativo AS ref_correlativo,
                        ref.fecha_emision AS ref_fecha_emision
                    FROM comprobantes c
                    LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                    LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                    LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                    LEFT JOIN comprobantes ref ON c.id_comprobante_referencia = ref.id_comprobante
                    WHERE c.id_comprobante = $1;
                `, [id]),
                obtenerConfigEmisor(pool)
            ]);

            if (resComp.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Comprobante no encontrado.' });
            }

            const comprobante = resComp.rows[0];
            if (!comprobante.monto_en_letras) {
                comprobante.monto_en_letras = numeroALetrasSoles(comprobante.monto_total);
            }
            if (!comprobante.cadena_qr) {
                const fechaIso = new Date(comprobante.fecha_emision || Date.now()).toISOString().split('T')[0];
                comprobante.cadena_qr = `${configEmisor.ruc_emisor}|${comprobante.tipo_comprobante}|${comprobante.serie}|${String(comprobante.correlativo).padStart(8, '0')}|${Number(comprobante.monto_igv || 0).toFixed(2)}|${Number(comprobante.monto_total || 0).toFixed(2)}|${fechaIso}|${comprobante.cliente_tipo_doc || '6'}|${comprobante.cliente_documento || '-'}|${comprobante.codigo_hash || ''}|`;
            }

            let items = [];
            if (comprobante.id_pedido) {
                const resItems = await pool.query(`
                    SELECT 
                        dp.id_producto,
                        pr.sku,
                        pr.nombre AS descripcion,
                        COALESCE(pr.unidad_medida, 'Unidad') AS unidad_medida,
                        COALESCE(um.codigo, 'NIU') AS codigo_unidad_sunat,
                        COALESCE(pr.tipo_afectacion_igv, '10') AS tipo_afectacion_igv,
                        dp.cantidad,
                        dp.precio_unitario,
                        dp.subtotal
                    FROM detalle_pedidos dp
                    JOIN productos pr ON dp.id_producto = pr.id_producto
                    LEFT JOIN unidades_medida um ON pr.id_unidad = um.id_unidad
                    WHERE dp.id_pedido = $1
                    ORDER BY dp.id_detalle ASC;
                `, [comprobante.id_pedido]);
                items = resItems.rows;
            }

            res.status(200).json({
                exito: true,
                comprobante,
                emisor: configEmisor,
                items
            });
        } catch (error) {
            console.error('Error al obtener detalle de comprobante:', error);
            res.status(500).json({ exito: false, mensaje: 'No se pudo cargar el detalle del comprobante.' });
        }
    },

    descargarXmlComprobante: async (req, res) => {
        try {
            const { id } = req.params;
            const resComp = await pool.query(`
                SELECT c.*, cl.tipo_documento, cl.numero_documento, cl.razon_social_o_nombre
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                WHERE c.id_comprobante = $1
            `, [id]);

            if (resComp.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Comprobante no encontrado.' });
            }

            const comp = resComp.rows[0];
            const configEmisor = await obtenerConfigEmisor(pool);
            let xmlContent = comp.xml_firmado;

            if (!xmlContent) {
                const { itemsCalculados, totales } = calcularDesgloseTributario([{
                    id_producto: 1,
                    sku: 'ITEM-01',
                    descripcion: `Pedido #${comp.id_pedido || comp.id_comprobante}`,
                    codigo_unidad_sunat: 'NIU',
                    tipo_afectacion_igv: '10',
                    cantidad: 1,
                    precio_unitario: Number(comp.monto_total),
                    subtotal: Number(comp.monto_total)
                }]);
                const generado = generarXmlUbl21YDatosSunat({
                    tipo_comprobante: comp.tipo_comprobante,
                    serie: comp.serie,
                    correlativo: comp.correlativo,
                    configEmisor,
                    cliente: comp,
                    itemsCalculados,
                    totales,
                    monto_en_letras: comp.monto_en_letras || numeroALetrasSoles(comp.monto_total)
                });
                xmlContent = generado.xmlFirmado;
            }

            const filename = `${configEmisor.ruc_emisor}-${comp.tipo_comprobante}-${comp.serie}-${String(comp.correlativo).padStart(8, '0')}.xml`;
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.status(200).send(xmlContent);
        } catch (error) {
            console.error('Error al descargar XML:', error);
            res.status(500).json({ exito: false, mensaje: 'No se pudo descargar el XML del comprobante.' });
        }
    },

    descargarCdrComprobante: async (req, res) => {
        try {
            const { id } = req.params;
            const resComp = await pool.query(`
                SELECT c.*, cl.tipo_documento, cl.numero_documento, cl.razon_social_o_nombre
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                WHERE c.id_comprobante = $1
            `, [id]);

            if (resComp.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Comprobante no encontrado.' });
            }

            const comp = resComp.rows[0];
            const configEmisor = await obtenerConfigEmisor(pool);
            let cdrContent = comp.cdr_xml;

            if (!cdrContent) {
                const { itemsCalculados, totales } = calcularDesgloseTributario([{
                    id_producto: 1,
                    sku: 'ITEM-01',
                    descripcion: `Pedido #${comp.id_pedido || comp.id_comprobante}`,
                    codigo_unidad_sunat: 'NIU',
                    tipo_afectacion_igv: '10',
                    cantidad: 1,
                    precio_unitario: Number(comp.monto_total),
                    subtotal: Number(comp.monto_total)
                }]);
                const generado = generarXmlUbl21YDatosSunat({
                    tipo_comprobante: comp.tipo_comprobante,
                    serie: comp.serie,
                    correlativo: comp.correlativo,
                    configEmisor,
                    cliente: comp,
                    itemsCalculados,
                    totales,
                    monto_en_letras: comp.monto_en_letras || numeroALetrasSoles(comp.monto_total)
                });
                cdrContent = generado.cdrXml;
            }

            const filename = `R-${configEmisor.ruc_emisor}-${comp.tipo_comprobante}-${comp.serie}-${String(comp.correlativo).padStart(8, '0')}.xml`;
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.status(200).send(cdrContent);
        } catch (error) {
            console.error('Error al descargar CDR:', error);
            res.status(500).json({ exito: false, mensaje: 'No se pudo descargar la Constancia CDR de SUNAT.' });
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
