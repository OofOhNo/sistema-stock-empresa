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
const {
    generarUnaBoletaAutomatica,
    reprogramarBoletasAutomaticas,
    calcularProximaEjecucionAleatoria,
    dentroDeHorarioLima
} = require('../utils/boletaAutoService');
const { obtenerCatalogosGre, crearGreInterna, consultarPuntosLlegadaPorRuc } = require('../utils/greService');

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
            const esAdminCentral = req.usuario?.nombre_rol === 'Admin Central';
            const [configEmisor, resSeries] = await Promise.all([
                obtenerConfigEmisor(pool),
                pool.query('SELECT * FROM series_sunat ORDER BY tipo_comprobante ASC, serie ASC')
            ]);

            const tokenRaw = String(configEmisor?.nubefact_token || '');
            const configuracionSegura = esAdminCentral
                ? {
                    ...configEmisor,
                    nubefact_token_configurado: Boolean(tokenRaw)
                }
                : {
                    ...configEmisor,
                    nubefact_ruta: '',
                    nubefact_token: '',
                    nubefact_token_enmascarado: tokenRaw ? '•••••••• (Solo Admin Central)' : '',
                    nubefact_token_configurado: Boolean(tokenRaw),
                    credenciales_restringidas: true
                };

            res.status(200).json({
                exito: true,
                configuracion: configuracionSegura,
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

    consultarEstadoSunat: async (req, res) => {
        const config = await obtenerConfigEmisor(pool);
        const sunatWsdlUrl = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService?wsdl';
        const inicioMs = Date.now();
        let estado = 'CAIDO';
        let codigoHttp = null;
        let detalle = '';
        let oseAlcanzable = null;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4500);
            try {
                const resp = await fetch(sunatWsdlUrl, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: { 'User-Agent': 'ERP-SistemaStock-HealthCheck/1.0' }
                });
                codigoHttp = resp.status;
                const latencia = Date.now() - inicioMs;
                if (resp.ok && latencia < 3000) {
                    estado = 'ONLINE';
                    detalle = `Servicios de SUNAT respondiendo normalmente (${latencia} ms).`;
                } else if (resp.status < 500) {
                    estado = 'INESTABLE';
                    detalle = `SUNAT respondió con demora (${latencia} ms, HTTP ${resp.status}). Verifica antes de emitir.`;
                } else {
                    estado = 'CAIDO';
                    detalle = `SUNAT devolvió error HTTP ${resp.status}. Es posible que esté caído o en mantenimiento.`;
                }
            } finally {
                clearTimeout(timeout);
            }
        } catch (err) {
            estado = 'CAIDO';
            detalle = err?.name === 'AbortError'
                ? 'Tiempo de espera agotado (>4.5s) al consultar SUNAT. Podría estar caída o con congestión.'
                : `No se pudo conectar con SUNAT (${err.message}). Revisa si el portal SUNAT está caído.`;
        }

        const latenciaTotal = Date.now() - inicioMs;
        if (config?.modo_integracion === 'NUBEFACT_REAL' && config?.nubefact_ruta && !config.nubefact_ruta.includes('demo-integrada-erp')) {
            try {
                const c2 = new AbortController();
                const t2 = setTimeout(() => c2.abort(), 3000);
                try {
                    const r2 = await fetch(new URL(config.nubefact_ruta).origin, { method: 'HEAD', signal: c2.signal });
                    oseAlcanzable = r2.status < 500;
                } finally {
                    clearTimeout(t2);
                }
            } catch {
                oseAlcanzable = false;
            }
        }

        return res.status(200).json({
            exito: true,
            estado,
            codigo_http: codigoHttp,
            latencia_ms: latenciaTotal,
            modo_integracion: config?.modo_integracion || 'DEMO_NUBEFACT',
            ose_alcanzable: oseAlcanzable,
            mensaje: detalle,
            verificado_en: new Date().toISOString()
        });
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
                    p.id_pedido, p.id_cliente, p.id_usuario, p.monto_total, p.id_ubicacion,
                    p.estado_pedido, COALESCE(p.stock_descontado, false) AS stock_descontado,
                    p.peso_total,
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

            // Req 2: Pago dividido entre múltiples clientes / razones sociales (Opción A: por montos/porcentajes)
            if (req.body.es_pago_dividido && Array.isArray(req.body.pagos) && req.body.pagos.length > 0) {
                const comprobantesEmitidos = [];
                for (const pago of req.body.pagos) {
                    const resCli = await client.query('SELECT * FROM clientes WHERE id_cliente = $1', [pago.id_cliente]);
                    if (resCli.rows.length === 0) throw new Error('Cliente del pago dividido no encontrado.');
                    const cliDividido = resCli.rows[0];
                    const tipoComp = pago.tipo_comprobante || '01';
                    const montoPago = parseFloat(pago.monto || 0);
                    const porcPago = parseFloat(pago.porcentaje || 0);

                    if (montoPago <= 0) {
                        throw new Error('El monto a pagar de cada cliente en el pago dividido debe ser mayor a 0.');
                    }

                    const valSunat = validarReglasTributarias({
                        tipo_comprobante: tipoComp,
                        cliente: cliDividido,
                        monto_total: montoPago,
                        fecha_emision: new Date()
                    });
                    if (!valSunat.valido) throw new Error(valSunat.mensaje);

                    const serieDividida = tipoComp === '01' ? 'F001' : 'B001';
                    const resS = await client.query('SELECT ultimo_correlativo FROM series_sunat WHERE serie = $1 FOR UPDATE', [serieDividida]);
                    let correlativoDiv = 1;
                    if (resS.rows.length === 0) {
                        await client.query('INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES ($1, $2, 1)', [tipoComp, serieDividida]);
                    } else {
                        correlativoDiv = resS.rows[0].ultimo_correlativo + 1;
                        await client.query('UPDATE series_sunat SET ultimo_correlativo = $1 WHERE serie = $2', [correlativoDiv, serieDividida]);
                    }

                    const itemDiv = [{
                        id_producto: null,
                        sku: 'PART-PEDIDO',
                        descripcion: `Pago ${porcPago > 0 ? `(${porcPago}%) ` : ''}del Pedido #${id_pedido}`,
                        unidad_medida: 'Unidad',
                        codigo_unidad_sunat: 'NIU',
                        tipo_afectacion_igv: '10',
                        cantidad: 1,
                        precio_unitario: montoPago,
                        subtotal: montoPago
                    }];
                    const desgloseDiv = calcularDesgloseTributario(itemDiv, configEmisor.igv_porcentaje);
                    const letrasDiv = numeroALetrasSoles(desgloseDiv.totales.monto_total);

                    const payloadNube = construirPayloadNubefact({
                        tipo_comprobante: tipoComp,
                        serie: serieDividida,
                        correlativo: correlativoDiv,
                        cliente: cliDividido,
                        itemsCalculados: desgloseDiv.itemsCalculados,
                        totales: desgloseDiv.totales,
                        forma_pago: pago.forma_pago || 'CONTADO',
                        dias_credito: pago.forma_pago === 'CREDITO' ? (parseInt(pago.dias_credito, 10) || 7) : 0,
                        medio_pago_sunat: pago.forma_pago === 'CREDITO' ? '006' : '008',
                        configEmisor
                    });

                    const datosUblDiv = generarXmlUbl21YDatosSunat({
                        tipo_comprobante: tipoComp,
                        serie: serieDividida,
                        correlativo: correlativoDiv,
                        configEmisor,
                        cliente: cliDividido,
                        itemsCalculados: desgloseDiv.itemsCalculados,
                        totales: desgloseDiv.totales,
                        monto_en_letras: letrasDiv,
                        forma_pago: pago.forma_pago || 'CONTADO'
                    });

                    const respOseDiv = await enviarAConectorNubefact({ payloadNubefact: payloadNube, configEmisor, datosUbl: datosUblDiv });

                    const resC = await client.query(`
                        INSERT INTO comprobantes (
                            id_pedido, id_cliente, id_ubicacion, tipo_comprobante, serie, correlativo,
                            monto_subtotal, monto_gravada, monto_exonerada, monto_inafecta,
                            monto_igv, monto_total, forma_pago, dias_credito, medio_pago_sunat,
                            estado_sunat, codigo_hash, mensaje_cdr, cadena_qr, monto_en_letras,
                            enlace_pdf, enlace_xml, enlace_cdr, xml_firmado, cdr_xml, modo_emision,
                            peso_total, es_pago_dividido, monto_dividido, porcentaje_dividido, items_json
                        )
                        VALUES (
                            $1, $2, $3, $4, $5, $6,
                            $7, $8, $9, $10,
                            $11, $12, $13, $14, $15,
                            $16, $17, $18, $19, $20,
                            $21, $22, $23, $24, $25, $26,
                            $27, TRUE, $28, $29, $30
                        ) RETURNING *;
                    `, [
                        id_pedido,
                        pago.id_cliente,
                        pedido.id_ubicacion,
                        tipoComp,
                        serieDividida,
                        correlativoDiv,
                        desgloseDiv.totales.monto_subtotal.toFixed(2),
                        desgloseDiv.totales.monto_gravada.toFixed(2),
                        desgloseDiv.totales.monto_exonerada.toFixed(2),
                        desgloseDiv.totales.monto_inafecta.toFixed(2),
                        desgloseDiv.totales.monto_igv.toFixed(2),
                        desgloseDiv.totales.monto_total.toFixed(2),
                        pago.forma_pago || 'CONTADO',
                        pago.forma_pago === 'CREDITO' ? (parseInt(pago.dias_credito, 10) || 7) : 0,
                        pago.forma_pago === 'CREDITO' ? '006' : '008',
                        respOseDiv.estado_sunat,
                        respOseDiv.codigo_hash,
                        respOseDiv.mensaje_cdr,
                        respOseDiv.cadena_qr,
                        letrasDiv,
                        respOseDiv.enlace_pdf,
                        respOseDiv.enlace_xml,
                        respOseDiv.enlace_cdr,
                        datosUblDiv.xmlFirmado,
                        datosUblDiv.cdrXml,
                        respOseDiv.modo_emision,
                        req.body.peso_total || pedido.peso_total || null,
                        montoPago,
                        porcPago,
                        JSON.stringify(itemDiv)
                    ]);
                    const compDivCreado = resC.rows[0];
                    if (tipoComp === '01') {
                        const pesoProp = ((Number(req.body.peso_total || pedido.peso_total || 0)) * (porcPago / 100));
                        compDivCreado.guia_remision = await crearGreInterna(client, {
                            id_comprobante: compDivCreado.id_comprobante,
                            id_pedido,
                            cliente: cliDividido,
                            items,
                            peso_bruto_total: pesoProp > 0 ? pesoProp : undefined,
                            gre: req.body.gre || {},
                            configEmisor,
                            idUsuario: req.usuario?.id_usuario || null
                        });
                    }
                    comprobantesEmitidos.push(compDivCreado);
                }

                if (!pedido.stock_descontado) {
                    const resItemsPed = await client.query('SELECT * FROM detalle_pedidos WHERE id_pedido = $1', [id_pedido]);
                    for (const item of resItemsPed.rows) {
                        await client.query(`
                            UPDATE inventario 
                            SET cantidad_fisica = cantidad_fisica - $1,
                                cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                                ultima_actualizacion = CURRENT_TIMESTAMP
                            WHERE id_producto = $2 AND id_ubicacion = $3;
                        `, [item.cantidad, item.id_producto, pedido.id_ubicacion]);
                    }
                }

                await client.query("UPDATE pedidos SET estado_pedido = 'FACTURADO', stock_descontado = true WHERE id_pedido = $1", [id_pedido]);
                await client.query('COMMIT');

                return res.status(201).json({
                    exito: true,
                    mensaje: `¡Pago dividido emitido con éxito! Se generaron ${comprobantesEmitidos.length} comprobantes para este pedido.`,
                    comprobantes: comprobantesEmitidos
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
            let items = resDetalle.rows;

            // Req 9: Modificación de precios y pesos al elegir el pedido
            if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
                items = req.body.items.map(it => {
                    const cant = Number(it.cantidad) || 1;
                    const precio = Number(it.precio_unitario) || 0;
                    return {
                        id_producto: it.id_producto,
                        sku: it.sku || 'PROD',
                        descripcion: it.descripcion || 'Producto',
                        unidad_medida: it.unidad_medida || 'Unidad',
                        codigo_unidad_sunat: it.codigo_unidad_sunat || 'NIU',
                        tipo_afectacion_igv: it.tipo_afectacion_igv || '10',
                        codigo_producto_sunat: it.codigo_producto_sunat || null,
                        cantidad: cant,
                        peso: Number(it.peso) || 0,
                        precio_unitario: precio,
                        subtotal: +(cant * precio).toFixed(2)
                    };
                });
            }

            // Req 7 & 8: Tarjeta de crédito obligatoria en crédito, cuotas y peso
            const medioPagoFinal = esCredito ? '006' : (medio_pago_sunat || '008');
            const cantidadCuotasFinal = esCredito ? (parseInt(req.body.cantidad_cuotas, 10) || 1) : 1;
            const pesoTotalFinal = req.body.peso_total !== undefined && req.body.peso_total !== null && req.body.peso_total !== '' 
                ? parseFloat(req.body.peso_total) 
                : (pedido.peso_total || null);

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
                    id_pedido, id_cliente, id_ubicacion, tipo_comprobante, serie, correlativo, 
                    monto_subtotal, monto_gravada, monto_exonerada, monto_inafecta,
                    monto_igv, monto_total, 
                    forma_pago, dias_credito, fecha_vencimiento_cuota,
                    medio_pago_sunat, tipo_operacion_sunat,
                    aplica_detraccion, codigo_detraccion, porcentaje_detraccion, monto_detraccion,
                    estado_sunat, codigo_hash, mensaje_cdr,
                    cadena_qr, monto_en_letras,
                    enlace_pdf, enlace_xml, enlace_cdr,
                    xml_firmado, cdr_xml, respuesta_ose_json, modo_emision,
                    peso_total, cantidad_cuotas, items_json, estado_pago
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10,
                    $11, $12,
                    $13, $14, $15,
                    $16, $17,
                    $18, $19, $20, $21,
                    $22, $23, $24,
                    $25, $26,
                    $27, $28, $29,
                    $30, $31, $32, $33,
                    $34, $35, $36, $37
                )
                RETURNING *;
            `;
            const resComprobante = await client.query(queryComprobante, [
                id_pedido,
                pedido.id_cliente,
                pedido.id_ubicacion,
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
                medioPagoFinal,
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
                respuestaOse.modo_emision,
                pesoTotalFinal,
                cantidadCuotasFinal,
                JSON.stringify(items),
                formaPagoFinal === 'CREDITO' ? 'PENDIENTE' : 'PAGADO'
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

            let guiaRemisionCreada = null;
            if (tipo_comprobante === '01') {
                guiaRemisionCreada = await crearGreInterna(client, {
                    id_comprobante: compCreado.id_comprobante,
                    id_pedido,
                    cliente: pedido,
                    items,
                    peso_bruto_total: req.body.peso_total || pedido.peso_total || null,
                    gre: req.body.gre || {},
                    configEmisor,
                    idUsuario: req.usuario?.id_usuario || null
                });
            }

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
                mensaje: guiaRemisionCreada
                    ? `¡Factura ${serie}-${String(correlativo).padStart(8, '0')} y GRE ${guiaRemisionCreada.serie}-${String(guiaRemisionCreada.correlativo).padStart(8, '0')} emitidas con éxito!`
                    : `¡Comprobante ${serie}-${String(correlativo).padStart(8, '0')} emitido y aceptado por SUNAT!`,
                comprobante: compCreado,
                guia_remision: guiaRemisionCreada
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
                whereClause = 'WHERE (p.id_ubicacion = $1 OR c.id_ubicacion = $1)';
                params.push(req.usuario.id_ubicacion);
            }

            const query = `
                SELECT 
                    c.id_comprobante, c.id_pedido, c.id_cliente, c.id_ubicacion,
                    c.tipo_comprobante, c.serie, c.correlativo,
                    c.monto_subtotal, c.monto_gravada, c.monto_exonerada, c.monto_inafecta,
                    c.monto_igv, c.monto_total,
                    c.forma_pago, c.dias_credito, c.fecha_vencimiento_cuota,
                    TO_CHAR(c.fecha_vencimiento_cuota, 'YYYY-MM-DD') AS fecha_vencimiento_iso,
                    c.estado_pago, c.fecha_pago,
                    CASE
                        WHEN c.forma_pago = 'CREDITO'
                             AND COALESCE(c.estado_pago, 'PENDIENTE') = 'PENDIENTE'
                             AND COALESCE(c.estado_sunat, '') != 'ANULADO'
                             AND c.tipo_comprobante IN ('01', '03')
                             AND c.fecha_vencimiento_cuota IS NOT NULL
                             AND c.fecha_vencimiento_cuota < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                        THEN TRUE
                        ELSE FALSE
                    END AS esta_vencida,
                    CASE
                        WHEN c.fecha_vencimiento_cuota IS NOT NULL
                        THEN ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date - c.fecha_vencimiento_cuota)::int
                        ELSE 0
                    END AS dias_vencido,
                    c.medio_pago_sunat, c.tipo_operacion_sunat,
                    c.aplica_detraccion, c.codigo_detraccion, c.porcentaje_detraccion, c.monto_detraccion,
                    c.id_comprobante_referencia, c.codigo_motivo_nc, c.descripcion_motivo_nc,
                    c.estado_sunat, c.codigo_hash, c.mensaje_cdr, c.cadena_qr, c.monto_en_letras,
                    c.enlace_pdf, c.enlace_xml, c.enlace_cdr, c.modo_emision, c.fecha_emision,
                    c.peso_total, c.cantidad_cuotas, c.origen_facturacion,
                    c.es_pago_dividido, c.monto_dividido, c.porcentaje_dividido,
                    COALESCE(c.id_ubicacion, p.id_ubicacion) AS id_ubicacion_final, 
                    COALESCE(u.nombre, u_comp.nombre, 'Sede Principal') AS nombre_ubicacion, 
                    COALESCE(cl_comp.razon_social_o_nombre, cl.razon_social_o_nombre, 'Cliente General') AS nombre_cliente,
                    COALESCE(cl_comp.numero_documento, cl.numero_documento, '-') AS documento_cliente,
                    COALESCE(cl_comp.tipo_documento, cl.tipo_documento, '6') AS tipo_documento_cliente,
                    COALESCE(cl_comp.direccion, cl.direccion, '') AS direccion_cliente,
                    ref.serie AS ref_serie,
                    ref.correlativo AS ref_correlativo
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                LEFT JOIN ubicaciones u_comp ON c.id_ubicacion = u_comp.id_ubicacion
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                LEFT JOIN clientes cl_comp ON c.id_cliente = cl_comp.id_cliente
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
                        COALESCE(c.id_ubicacion, p.id_ubicacion) AS id_ubicacion,
                        p.solicitado_por,
                        p.etiquetado,
                        p.sellado_vacio,
                        COALESCE(u.nombre, u_comp.nombre, 'Sede Principal') AS nombre_ubicacion,
                        COALESCE(u.direccion_completa, u_comp.direccion_completa, '') AS direccion_ubicacion,
                        COALESCE(u.telefono_contacto, u_comp.telefono_contacto, '') AS telefono_ubicacion,
                        COALESCE(cl_comp.tipo_documento, cl.tipo_documento, '6') AS cliente_tipo_doc,
                        COALESCE(cl_comp.numero_documento, cl.numero_documento, '-') AS cliente_documento,
                        COALESCE(cl_comp.razon_social_o_nombre, cl.razon_social_o_nombre, 'CLIENTE GENERAL') AS nombre_cliente,
                        COALESCE(cl_comp.nombre_comercial, cl.nombre_comercial) AS cliente_comercial,
                        COALESCE(cl_comp.direccion, cl.direccion, '') AS cliente_direccion,
                        COALESCE(cl_comp.email, cl.email, '') AS cliente_email,
                        ref.tipo_comprobante AS ref_tipo_comprobante,
                        ref.serie AS ref_serie,
                        ref.correlativo AS ref_correlativo,
                        ref.fecha_emision AS ref_fecha_emision
                    FROM comprobantes c
                    LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                    LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                    LEFT JOIN ubicaciones u_comp ON c.id_ubicacion = u_comp.id_ubicacion
                    LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                    LEFT JOIN clientes cl_comp ON c.id_cliente = cl_comp.id_cliente
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
            if (comprobante.items_json && Array.isArray(comprobante.items_json) && comprobante.items_json.length > 0) {
                items = comprobante.items_json;
            } else if (comprobante.id_pedido) {
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
    },

    emitirComprobanteManual: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const {
                id_cliente,
                tipo_comprobante,
                forma_pago,
                dias_credito,
                cantidad_cuotas,
                fecha_vencimiento_cuota,
                medio_pago_sunat = '008',
                aplica_detraccion = false,
                codigo_detraccion = '014',
                peso_total,
                items
            } = req.body;

            if (!tipo_comprobante) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Selecciona el tipo de comprobante (Factura o Boleta).' });
            }
            if (tipo_comprobante !== '01' && tipo_comprobante !== '03') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Selecciona Factura (01) o Boleta de Venta (03).' });
            }
            if (!items || !Array.isArray(items) || items.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Debes agregar al menos un producto para emitir el comprobante.' });
            }

            let cliente;
            if (id_cliente === 'CLIENTES_VARIOS' || id_cliente === 'VARIOS' || id_cliente === '0' || !id_cliente) {
                const resVarios = await client.query("SELECT * FROM clientes WHERE numero_documento = '00000000' OR razon_social_o_nombre ILIKE '%CLIENTES VARIOS%' LIMIT 1");
                if (resVarios.rows.length > 0) {
                    cliente = resVarios.rows[0];
                } else {
                    const insertVarios = await client.query(`
                        INSERT INTO clientes (razon_social_o_nombre, nombre_comercial, tipo_documento, numero_documento, direccion)
                        VALUES ('CLIENTES VARIOS', 'CONSUMIDOR FINAL', '0', '00000000', 'Venta en Mostrador')
                        RETURNING *
                    `);
                    cliente = insertVarios.rows[0];
                }
            } else {
                const resCliente = await client.query('SELECT * FROM clientes WHERE id_cliente = $1', [id_cliente]);
                if (resCliente.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({ exito: false, mensaje: 'Cliente no encontrado.' });
                }
                cliente = resCliente.rows[0];
            }

            const montoCalculadoTotal = items.reduce((sum, it) => sum + (Number(it.cantidad || 1) * Number(it.precio_unitario || 0)), 0);

            // Validar reglas tributarias (DNI obligatorio en Boletas, RUC en Facturas)
            const validacionSunat = validarReglasTributarias({
                tipo_comprobante,
                cliente,
                monto_total: montoCalculadoTotal,
                fecha_emision: new Date()
            });
            if (!validacionSunat.valido) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: validacionSunat.mensaje });
            }

            const configEmisor = await obtenerConfigEmisor(client);
            const esCredito = forma_pago === 'CREDITO';
            const formaPagoFinal = esCredito ? 'CREDITO' : 'CONTADO';
            const diasCreditoFinal = esCredito ? (parseInt(dias_credito, 10) || 7) : 0;
            const cuotasFinal = esCredito ? (parseInt(cantidad_cuotas, 10) || 1) : 1;
            const medioPagoFinal = esCredito ? '006' : (medio_pago_sunat || '008');

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

            const idUbicacionUsuario = req.body?.id_ubicacion || req.usuario?.id_ubicacion || 1;

            // Procesar ítems y descontar stock automáticamente (Req 3)
            const itemsValidados = [];
            for (const item of items) {
                const cant = Number(item.cantidad) || 1;
                const precio = Number(item.precio_unitario) || 0;
                const peso = Number(item.peso) || 0;
                const subtotal = +(cant * precio).toFixed(2);

                if (item.id_producto) {
                    const resInv = await client.query(
                        'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE',
                        [item.id_producto, idUbicacionUsuario]
                    );
                    if (resInv.rows.length === 0) {
                        await client.query(
                            'INSERT INTO inventario (id_producto, id_ubicacion, cantidad_fisica, cantidad_reservada) VALUES ($1, $2, 0, 0)',
                            [item.id_producto, idUbicacionUsuario]
                        );
                    }
                    await client.query(`
                        UPDATE inventario 
                        SET cantidad_fisica = cantidad_fisica - $1,
                            ultima_actualizacion = CURRENT_TIMESTAMP
                        WHERE id_producto = $2 AND id_ubicacion = $3;
                    `, [cant, item.id_producto, idUbicacionUsuario]);

                    await client.query(`
                        INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                        VALUES ($1, $2, $3, 'SALIDA', $4, $5);
                    `, [
                        item.id_producto,
                        idUbicacionUsuario,
                        req.usuario?.id_usuario || null,
                        cant,
                        `Venta Manual Directa (${item.descripcion || 'Producto'})`
                    ]);
                }

                itemsValidados.push({
                    id_producto: item.id_producto || null,
                    sku: item.sku || 'PROD',
                    descripcion: item.descripcion || 'Producto / Servicio',
                    unidad_medida: item.unidad_medida || 'Unidad',
                    codigo_unidad_sunat: item.codigo_unidad_sunat || 'NIU',
                    tipo_afectacion_igv: item.tipo_afectacion_igv || '10',
                    cantidad: cant,
                    precio_unitario: precio,
                    peso: peso,
                    subtotal: subtotal
                });
            }

            const { itemsCalculados, totales } = calcularDesgloseTributario(itemsValidados, configEmisor.igv_porcentaje);
            const montoEnLetras = numeroALetrasSoles(totales.monto_total);

            const serie = tipo_comprobante === '01' ? 'F001' : 'B001';
            const resSerie = await client.query('SELECT ultimo_correlativo FROM series_sunat WHERE serie = $1 FOR UPDATE', [serie]);
            let correlativo = 1;
            if (resSerie.rows.length === 0) {
                await client.query('INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES ($1, $2, 1)', [tipo_comprobante, serie]);
            } else {
                correlativo = resSerie.rows[0].ultimo_correlativo + 1;
                await client.query('UPDATE series_sunat SET ultimo_correlativo = $1 WHERE serie = $2', [correlativo, serie]);
            }

            const pesoFinal = peso_total !== undefined && peso_total !== null && peso_total !== '' 
                ? parseFloat(peso_total) 
                : itemsValidados.reduce((acc, it) => acc + (Number(it.peso) || 0), 0);

            const payloadNubefact = construirPayloadNubefact({
                tipo_comprobante,
                serie,
                correlativo,
                cliente,
                itemsCalculados,
                totales,
                forma_pago: formaPagoFinal,
                dias_credito: diasCreditoFinal,
                fecha_vencimiento_cuota: fechaVencimientoFinal,
                medio_pago_sunat: medioPagoFinal,
                aplica_detraccion: false,
                configEmisor
            });

            const datosUbl = generarXmlUbl21YDatosSunat({
                tipo_comprobante,
                serie,
                correlativo,
                configEmisor,
                cliente,
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
                    id_pedido, id_cliente, id_ubicacion, tipo_comprobante, serie, correlativo, 
                    monto_subtotal, monto_gravada, monto_exonerada, monto_inafecta,
                    monto_igv, monto_total, 
                    forma_pago, dias_credito, fecha_vencimiento_cuota,
                    medio_pago_sunat, tipo_operacion_sunat,
                    aplica_detraccion, estado_sunat, codigo_hash, mensaje_cdr,
                    cadena_qr, monto_en_letras,
                    enlace_pdf, enlace_xml, enlace_cdr,
                    xml_firmado, cdr_xml, respuesta_ose_json, modo_emision,
                    peso_total, cantidad_cuotas, origen_facturacion, items_json, estado_pago
                )
                VALUES (
                    NULL, $1, $2, $3, $4, $5,
                    $6, $7, $8, $9,
                    $10, $11,
                    $12, $13, $14,
                    $15, '0101',
                    FALSE, $16, $17, $18,
                    $19, $20,
                    $21, $22, $23,
                    $24, $25, $26, $27,
                    $28, $29, 'MANUAL', $30, $31
                )
                RETURNING *;
            `;

            const resComp = await client.query(queryComprobante, [
                cliente.id_cliente,
                idUbicacionUsuario,
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
                medioPagoFinal,
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
                respuestaOse.modo_emision,
                pesoFinal,
                cuotasFinal,
                JSON.stringify(itemsValidados),
                formaPagoFinal === 'CREDITO' ? 'PENDIENTE' : 'PAGADO'
            ]);

            const compCreado = resComp.rows[0];

            let guiaRemisionCreada = null;
            if (tipo_comprobante === '01') {
                guiaRemisionCreada = await crearGreInterna(client, {
                    id_comprobante: compCreado.id_comprobante,
                    id_pedido: null,
                    cliente,
                    items: itemsValidados,
                    peso_bruto_total: pesoFinal,
                    gre: req.body.gre || {},
                    configEmisor,
                    idUsuario: req.usuario?.id_usuario || null
                });
            }

            await registrarAuditoria(
                client,
                req.usuario?.id_usuario || null,
                'EMITIR_FACTURA_MANUAL',
                'comprobantes',
                compCreado.id_comprobante,
                null,
                compCreado
            );

            await client.query('COMMIT');
            res.status(201).json({
                exito: true,
                mensaje: guiaRemisionCreada
                    ? `¡Factura ${serie}-${String(correlativo).padStart(8, '0')} y GRE ${guiaRemisionCreada.serie}-${String(guiaRemisionCreada.correlativo).padStart(8, '0')} emitidas y stock descontado con éxito!`
                    : `¡Comprobante ${serie}-${String(correlativo).padStart(8, '0')} emitido y stock descontado con éxito!`,
                comprobante: compCreado,
                guia_remision: guiaRemisionCreada
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al emitir factura manual:', error);
            res.status(500).json({ exito: false, mensaje: error.message || 'Error al emitir factura manual' });
        } finally {
            client.release();
        }
    },

    listarNotasPedido: async (req, res) => {
        try {
            const query = `
                SELECT 
                    np.*,
                    u.nombre AS nombre_ubicacion,
                    usr.nombre_completo AS nombre_usuario,
                    cl.numero_documento AS cliente_documento_bd,
                    cl.direccion AS cliente_direccion_bd
                FROM notas_pedido np
                LEFT JOIN ubicaciones u ON np.id_ubicacion = u.id_ubicacion
                LEFT JOIN usuarios usr ON np.id_usuario = usr.id_usuario
                LEFT JOIN clientes cl ON np.id_cliente = cl.id_cliente
                ORDER BY np.id_nota_pedido DESC;
            `;
            const { rows } = await pool.query(query);
            res.json({ exito: true, notas: rows });
        } catch (error) {
            console.error('Error al listar notas de pedido:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al listar notas de pedido', error: error.message });
        }
    },

    crearNotaPedido: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const {
                id_cliente,
                cliente_nombre,
                cliente_documento,
                id_pedido,
                observaciones,
                items
            } = req.body;

            if (!cliente_nombre || !cliente_nombre.trim()) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Por favor indica el nombre del cliente para la nota de pedido.' });
            }
            if (!items || !Array.isArray(items) || items.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Debes agregar al menos un producto a la nota de pedido.' });
            }

            const idUbicacion = req.usuario?.id_ubicacion || 1;
            const idUsuario = req.usuario?.id_usuario || null;

            const resCorr = await client.query(`
                UPDATE correlativos_internos 
                SET ultimo_correlativo = ultimo_correlativo + 1 
                WHERE tipo_documento = 'NOTA_PEDIDO' 
                RETURNING ultimo_correlativo;
            `);
            const correlativo = resCorr.rows[0].ultimo_correlativo;

            const ahora = new Date();
            const diaStr = String(ahora.getDate()).padStart(2, '0');
            const mesStr = String(ahora.getMonth() + 1).padStart(2, '0');
            const anioStr = ahora.getFullYear();
            const numeroNota = `NotaPedido-${diaStr}/${mesStr}/${anioStr}#${correlativo}`;

            const meses = [
                'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
            ];
            const fechaTexto = `${ahora.getDate()} de ${meses[ahora.getMonth()]} del ${ahora.getFullYear()}`;

            let montoTotal = 0;
            let pesoTotal = 0;

            const itemsValidados = items.map(it => {
                const cant = Number(it.cantidad) || 1;
                const peso = Number(it.peso) || 0;
                const precio = Number(it.precio_unitario || it.precio) || 0;
                const totalItem = +(peso > 0 ? (peso * precio) : (cant * precio)).toFixed(2);
                montoTotal += totalItem;
                pesoTotal += peso;

                return {
                    id_producto: it.id_producto || null,
                    descripcion: it.descripcion || 'Producto',
                    peso: peso,
                    cantidad: cant,
                    precio_unitario: precio,
                    total: totalItem
                };
            });

            // Descontar inventario de la sede si no proviene de un pedido con stock reservado (Req 3)
            for (const it of itemsValidados) {
                if (it.id_producto && !id_pedido) {
                    await client.query(`
                        UPDATE inventario 
                        SET cantidad_fisica = cantidad_fisica - $1,
                            ultima_actualizacion = CURRENT_TIMESTAMP
                        WHERE id_producto = $2 AND id_ubicacion = $3;
                    `, [it.cantidad, it.id_producto, idUbicacion]);

                    await client.query(`
                        INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                        VALUES ($1, $2, $3, 'SALIDA', $4, $5);
                    `, [
                        it.id_producto,
                        idUbicacion,
                        idUsuario,
                        it.cantidad,
                        `Emisión de ${numeroNota}`
                    ]);
                }
            }

            const queryNota = `
                INSERT INTO notas_pedido (
                    correlativo, numero_nota, id_pedido, id_cliente,
                    cliente_nombre, cliente_documento, fecha_emision, fecha_texto,
                    id_ubicacion, id_usuario, peso_total, monto_total, observaciones
                )
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8, $9, $10, $11, $12)
                RETURNING *;
            `;
            const resNota = await client.query(queryNota, [
                correlativo,
                numeroNota,
                id_pedido || null,
                id_cliente || null,
                cliente_nombre.trim(),
                cliente_documento || null,
                fechaTexto,
                idUbicacion,
                idUsuario,
                pesoTotal.toFixed(2),
                montoTotal.toFixed(2),
                observaciones || null
            ]);
            const notaCreada = resNota.rows[0];

            for (const it of itemsValidados) {
                await client.query(`
                    INSERT INTO detalle_notas_pedido (
                        id_nota_pedido, id_producto, descripcion, peso, cantidad, precio_unitario, total
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7);
                `, [
                    notaCreada.id_nota_pedido,
                    it.id_producto,
                    it.descripcion,
                    it.peso,
                    it.cantidad,
                    it.precio_unitario,
                    it.total
                ]);
            }

            await registrarAuditoria(
                client,
                idUsuario,
                'CREAR_NOTA_PEDIDO',
                'notas_pedido',
                notaCreada.id_nota_pedido,
                null,
                notaCreada
            );

            await client.query('COMMIT');
            res.status(201).json({
                exito: true,
                mensaje: `¡${numeroNota} creada exitosamente!`,
                nota: notaCreada,
                items: itemsValidados
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al crear nota de pedido:', error);
            res.status(500).json({ exito: false, mensaje: error.message || 'Error al crear nota de pedido' });
        } finally {
            client.release();
        }
    },

    obtenerDetalleNotaPedido: async (req, res) => {
        try {
            const { id } = req.params;
            const resNota = await pool.query(`
                SELECT 
                    np.*,
                    u.nombre AS nombre_ubicacion,
                    usr.nombre_completo AS nombre_usuario
                FROM notas_pedido np
                LEFT JOIN ubicaciones u ON np.id_ubicacion = u.id_ubicacion
                LEFT JOIN usuarios usr ON np.id_usuario = usr.id_usuario
                WHERE np.id_nota_pedido = $1;
            `, [id]);

            if (resNota.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Nota de pedido no encontrada.' });
            }

            const nota = resNota.rows[0];
            const resDetalles = await pool.query(`
                SELECT * FROM detalle_notas_pedido WHERE id_nota_pedido = $1 ORDER BY id_detalle ASC;
            `, [id]);

            res.json({
                exito: true,
                nota,
                items: resDetalles.rows,
                emisor: {
                    ruc: '20608725394',
                    razon_social: 'PROCESOS CÁRNICOS S.A.C.'
                }
            });
        } catch (error) {
            console.error('Error al obtener detalle de nota de pedido:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener detalle de nota de pedido', error: error.message });
        }
    },

    // =========================================================================
    // BOLETAS AUTOMÁTICAS + COLA DE IMPRESIÓN EN SEGUNDO PLANO
    // =========================================================================
    obtenerConfigBoletasAuto: async (req, res) => {
        try {
            const resCfg = await pool.query(`
                SELECT c.*, u.nombre AS nombre_ubicacion
                FROM config_boletas_automaticas c
                LEFT JOIN ubicaciones u ON c.id_ubicacion = u.id_ubicacion
                WHERE c.id_config = 1;
            `);
            res.json({ exito: true, config: resCfg.rows[0] || null });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al leer configuración de boletas automáticas.' });
        }
    },

    actualizarConfigBoletasAuto: async (req, res) => {
        try {
            const {
                activo,
                intervalo_minutos,
                intervalo_min_minutos,
                intervalo_max_minutos,
                monto_minimo,
                monto_maximo,
                peso_minimo_item,
                peso_maximo_item,
                hora_inicio,
                hora_fin,
                solo_horario_laboral,
                id_ubicacion,
                auto_imprimir_navegador
            } = req.body;

            const resActual = await pool.query('SELECT * FROM config_boletas_automaticas WHERE id_config = 1');
            const actual = resActual.rows[0] || {};

            const minRaw = intervalo_min_minutos ?? intervalo_minutos ?? actual.intervalo_min_minutos ?? actual.intervalo_minutos ?? 5;
            const maxRaw = intervalo_max_minutos ?? intervalo_minutos ?? actual.intervalo_max_minutos ?? actual.intervalo_minutos ?? 10;
            const minMin = Math.max(1, Math.min(1440, parseInt(minRaw, 10) || 5));
            const maxMin = Math.max(minMin, Math.min(1440, parseInt(maxRaw, 10) || minMin));

            const pesoMin = Math.max(0.50, Number(peso_minimo_item ?? actual.peso_minimo_item ?? 0.50));
            const pesoMax = Math.max(pesoMin, Number(peso_maximo_item ?? actual.peso_maximo_item ?? 8.00));
            const montoMax = Math.min(699.00, Math.max(25.00, Number(monto_maximo ?? actual.monto_maximo ?? 680.00)));
            const montoMin = Math.max(15.00, Math.min(montoMax - 5, Number(monto_minimo ?? actual.monto_minimo ?? 35.00)));

            const finalActivo = activo !== undefined ? Boolean(activo) : Boolean(actual.activo);
            const finalSoloHorario = solo_horario_laboral !== undefined ? Boolean(solo_horario_laboral) : Boolean(actual.solo_horario_laboral);
            const finalHoraInicio = hora_inicio || actual.hora_inicio || '08:00';
            const finalHoraFin = hora_fin || actual.hora_fin || '20:00';

            let proximaEjecucion = null;
            if (finalActivo && (!finalSoloHorario || dentroDeHorarioLima(finalHoraInicio, finalHoraFin))) {
                proximaEjecucion = calcularProximaEjecucionAleatoria(minMin, maxMin).fecha.toISOString();
            }

            const { rows } = await pool.query(`
                UPDATE config_boletas_automaticas
                SET activo = $1::boolean,
                    intervalo_minutos = $2::int,
                    intervalo_min_minutos = $2::int,
                    intervalo_max_minutos = $3::int,
                    monto_minimo = $4::numeric,
                    monto_maximo = $5::numeric,
                    peso_minimo_item = $6::numeric,
                    peso_maximo_item = $7::numeric,
                    hora_inicio = $8::varchar,
                    hora_fin = $9::varchar,
                    solo_horario_laboral = $10::boolean,
                    id_ubicacion = COALESCE($11::int, id_ubicacion),
                    auto_imprimir_navegador = COALESCE($12::boolean, auto_imprimir_navegador),
                    proxima_ejecucion = $13::timestamptz,
                    actualizado_en = CURRENT_TIMESTAMP
                WHERE id_config = 1
                RETURNING *;
            `, [
                finalActivo,
                minMin,
                maxMin,
                montoMin,
                montoMax,
                pesoMin,
                pesoMax,
                finalHoraInicio,
                finalHoraFin,
                finalSoloHorario,
                id_ubicacion ? parseInt(id_ubicacion, 10) : null,
                auto_imprimir_navegador !== undefined ? Boolean(auto_imprimir_navegador) : null,
                proximaEjecucion
            ]);

            await reprogramarBoletasAutomaticas();

            res.json({ exito: true, mensaje: 'Configuración de boletas automáticas actualizada.', config: rows[0] });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: error.message || 'Error al actualizar configuración.' });
        }
    },

    generarBoletaAutoAhora: async (req, res) => {
        try {
            const resultado = await generarUnaBoletaAutomatica({
                forzar: true,
                idUsuario: req.usuario?.id_usuario || null
            });
            if (!resultado.generada) {
                return res.status(400).json({ exito: false, mensaje: resultado.motivo });
            }
            await reprogramarBoletasAutomaticas();
            res.status(201).json({
                exito: true,
                mensaje: `Boleta automática ${resultado.comprobante.serie}-${String(resultado.comprobante.correlativo).padStart(8, '0')} generada (S/ ${Number(resultado.comprobante.monto_total).toFixed(2)}) y enviada a la cola de impresión.`,
                comprobante: resultado.comprobante,
                cola: resultado.cola
            });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: error.message || 'Error al generar boleta automática.' });
        }
    },

    listarColaImpresion: async (req, res) => {
        try {
            const { estado } = req.query;
            const params = [];
            let filtro = '';
            if (estado && ['PENDIENTE', 'IMPRESO', 'OMITIDO'].includes(estado)) {
                params.push(estado);
                filtro = `WHERE q.estado = $1`;
            }
            const { rows } = await pool.query(`
                SELECT
                    q.*,
                    c.serie, c.correlativo, c.monto_total, c.peso_total,
                    c.fecha_emision, c.items_json, c.cadena_qr, c.codigo_hash,
                    c.monto_en_letras,
                    cl.razon_social_o_nombre AS cliente_nombre,
                    cl.numero_documento AS cliente_documento
                FROM cola_impresion_boletas q
                JOIN comprobantes c ON q.id_comprobante = c.id_comprobante
                LEFT JOIN clientes cl ON c.id_cliente = cl.id_cliente
                ${filtro}
                ORDER BY CASE WHEN q.estado = 'PENDIENTE' THEN 0 ELSE 1 END, q.creado_en DESC
                LIMIT 60;
            `, params);
            res.json({ exito: true, cola: rows });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al consultar la cola de impresión.' });
        }
    },

    actualizarEstadoColaImpresion: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (!id || Number.isNaN(id)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de cola inválido.' });
            }
            const { estado } = req.body;
            if (!['PENDIENTE', 'IMPRESO', 'OMITIDO'].includes(estado)) {
                return res.status(400).json({ exito: false, mensaje: 'Estado de cola inválido.' });
            }
            const { rows } = await pool.query(`
                UPDATE cola_impresion_boletas
                SET estado = $1::varchar,
                    impreso_en = CASE WHEN $1::varchar = 'IMPRESO' THEN CURRENT_TIMESTAMP ELSE NULL END
                WHERE id_cola = $2::int
                RETURNING *;
            `, [estado, id]);
            if (rows.length === 0) return res.status(404).json({ exito: false, mensaje: 'Elemento de cola no encontrado.' });
            res.json({ exito: true, item: rows[0] });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al actualizar cola de impresión.' });
        }
    },

    // =========================================================================
    // GUÍAS DE REMISIÓN ELECTRÓNICA (GRE EG07) Y CATÁLOGOS FRECUENTES
    // =========================================================================
    listarCatalogosGre: async (req, res) => {
        try {
            const catalogos = await obtenerCatalogosGre(pool);
            res.json({ exito: true, ...catalogos });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al cargar catálogos de GRE.' });
        }
    },

    crearPuntoPartidaGre: async (req, res) => {
        try {
            const { tipo = '-', ubigeo, domicilio } = req.body;
            if (!ubigeo || !domicilio) return res.status(400).json({ exito: false, mensaje: 'Ubigeo y domicilio son obligatorios.' });
            const { rows } = await pool.query(
                `INSERT INTO gre_puntos_partida (tipo, ubigeo, domicilio) VALUES ($1, $2, $3) RETURNING *;`,
                [tipo.trim() || '-', ubigeo.trim(), domicilio.trim()]
            );
            res.status(201).json({ exito: true, punto: rows[0] });
        } catch (error) {
            res.status(400).json({ exito: false, mensaje: error.message || 'No se pudo guardar el punto de partida.' });
        }
    },

    eliminarPuntoPartidaGre: async (req, res) => {
        try {
            await pool.query('UPDATE gre_puntos_partida SET activo = FALSE WHERE id_punto = $1', [parseInt(req.params.id, 10)]);
            res.json({ exito: true });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al eliminar punto de partida.' });
        }
    },

    crearVehiculoGre: async (req, res) => {
        try {
            const { placa, descripcion = '', entidad_emisora = '', numero_autorizacion = '' } = req.body;
            if (!placa || !placa.trim()) return res.status(400).json({ exito: false, mensaje: 'La placa del vehículo es obligatoria.' });
            const { rows } = await pool.query(
                `INSERT INTO gre_vehiculos (placa, descripcion, entidad_emisora, numero_autorizacion, activo)
                 VALUES (UPPER($1), $2, $3, $4, TRUE)
                 ON CONFLICT (placa) DO UPDATE SET
                    activo = TRUE,
                    descripcion = COALESCE(NULLIF(EXCLUDED.descripcion, ''), gre_vehiculos.descripcion),
                    entidad_emisora = EXCLUDED.entidad_emisora,
                    numero_autorizacion = EXCLUDED.numero_autorizacion
                 RETURNING *;`,
                [placa.trim(), String(descripcion || '').trim(), String(entidad_emisora || '').trim(), String(numero_autorizacion || '').trim()]
            );
            res.status(201).json({ exito: true, mensaje: 'Vehículo guardado correctamente.', vehiculo: rows[0] });
        } catch (error) {
            res.status(400).json({ exito: false, mensaje: error.message || 'Error al registrar vehículo.' });
        }
    },

    actualizarVehiculoGre: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { placa, descripcion, entidad_emisora, numero_autorizacion } = req.body;
            if (!placa || !placa.trim()) return res.status(400).json({ exito: false, mensaje: 'La placa es obligatoria.' });
            const { rows } = await pool.query(
                `UPDATE gre_vehiculos
                 SET placa = UPPER($1),
                     descripcion = COALESCE($2, descripcion),
                     entidad_emisora = COALESCE($3, entidad_emisora),
                     numero_autorizacion = COALESCE($4, numero_autorizacion)
                 WHERE id_vehiculo = $5
                 RETURNING *;`,
                [
                    placa.trim(),
                    descripcion !== undefined ? String(descripcion || '').trim() : null,
                    entidad_emisora !== undefined ? String(entidad_emisora || '').trim() : null,
                    numero_autorizacion !== undefined ? String(numero_autorizacion || '').trim() : null,
                    id
                ]
            );
            if (rows.length === 0) return res.status(404).json({ exito: false, mensaje: 'Vehículo no encontrado.' });
            res.json({ exito: true, mensaje: 'Vehículo actualizado correctamente.', vehiculo: rows[0] });
        } catch (error) {
            const msg = error.code === '23505' ? 'Ya existe otro vehículo con esa placa.' : (error.message || 'Error al actualizar vehículo.');
            res.status(400).json({ exito: false, mensaje: msg });
        }
    },

    obtenerPuntosLlegadaPorRuc: async (req, res) => {
        try {
            const ruc = String(req.params.ruc || '').trim();
            const puntos = await consultarPuntosLlegadaPorRuc(pool, ruc);
            res.json({ exito: true, ruc, puntos });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al consultar puntos de llegada por RUC.' });
        }
    },

    guardarPuntoLlegadaRuc: async (req, res) => {
        try {
            const { ruc, tipo = 'SUCURSAL / ANEXO', ubigeo = '', direccion, codigo_anexo = 'MAN' } = req.body;
            if (!ruc || !direccion || !direccion.trim()) {
                return res.status(400).json({ exito: false, mensaje: 'RUC y dirección de llegada son obligatorios.' });
            }
            const { rows } = await pool.query(`
                INSERT INTO gre_puntos_llegada_cliente (ruc, codigo_anexo, tipo, ubigeo, direccion, origen)
                VALUES ($1, $2, $3, $4, $5, 'MANUAL')
                ON CONFLICT (ruc, direccion) DO UPDATE SET
                    ubigeo = COALESCE(NULLIF(EXCLUDED.ubigeo, ''), gre_puntos_llegada_cliente.ubigeo),
                    tipo = EXCLUDED.tipo
                RETURNING *;
            `, [String(ruc).trim(), String(codigo_anexo).trim(), String(tipo).trim(), String(ubigeo || '').trim(), direccion.trim()]);
            res.status(201).json({ exito: true, punto: rows[0] });
        } catch (error) {
            res.status(400).json({ exito: false, mensaje: error.message || 'No se pudo guardar el punto de llegada.' });
        }
    },

    eliminarVehiculoGre: async (req, res) => {
        try {
            await pool.query('UPDATE gre_vehiculos SET activo = FALSE WHERE id_vehiculo = $1', [parseInt(req.params.id, 10)]);
            res.json({ exito: true });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al eliminar vehículo.' });
        }
    },

    crearConductorGre: async (req, res) => {
        try {
            const { licencia, tipo_documento = 'DOCUMENTO NACIONAL DE IDENTIDAD', numero_documento, apellidos_nombres } = req.body;
            if (!licencia || !numero_documento || !apellidos_nombres) {
                return res.status(400).json({ exito: false, mensaje: 'Licencia, documento y nombres del conductor son obligatorios.' });
            }
            const { rows } = await pool.query(
                `INSERT INTO gre_conductores (licencia, tipo_documento, numero_documento, apellidos_nombres, activo)
                 VALUES (UPPER($1), $2, $3, UPPER($4), TRUE)
                 ON CONFLICT (numero_documento) DO UPDATE SET activo = TRUE, licencia = EXCLUDED.licencia, apellidos_nombres = EXCLUDED.apellidos_nombres
                 RETURNING *;`,
                [licencia.trim(), tipo_documento, numero_documento.trim(), apellidos_nombres.trim()]
            );
            res.status(201).json({ exito: true, conductor: rows[0] });
        } catch (error) {
            res.status(400).json({ exito: false, mensaje: error.message || 'Error al registrar conductor.' });
        }
    },

    eliminarConductorGre: async (req, res) => {
        try {
            await pool.query('UPDATE gre_conductores SET activo = FALSE WHERE id_conductor = $1', [parseInt(req.params.id, 10)]);
            res.json({ exito: true });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al eliminar conductor.' });
        }
    },

    listarGres: async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT
                    g.*,
                    TO_CHAR(g.fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso,
                    c.serie AS factura_serie,
                    c.correlativo AS factura_correlativo
                FROM guias_remision g
                LEFT JOIN comprobantes c ON g.id_comprobante = c.id_comprobante
                ORDER BY g.id_gre DESC
                LIMIT 120;
            `);
            res.json({ exito: true, guias: rows });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al listar Guías de Remisión.' });
        }
    },

    emitirGreStandalone: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const configEmisor = await obtenerConfigEmisor(client);
            let cliente = null;
            if (req.body.id_cliente) {
                const cRes = await client.query('SELECT * FROM clientes WHERE id_cliente = $1', [parseInt(req.body.id_cliente, 10)]);
                if (cRes.rows.length > 0) cliente = cRes.rows[0];
            }

            const greCreada = await crearGreInterna(client, {
                id_comprobante: req.body.id_comprobante ? parseInt(req.body.id_comprobante, 10) : null,
                id_pedido: req.body.id_pedido ? parseInt(req.body.id_pedido, 10) : null,
                cliente,
                items: req.body.bienes || [],
                peso_bruto_total: req.body.peso_bruto_total,
                gre: req.body,
                configEmisor,
                idUsuario: req.usuario?.id_usuario || null
            });

            await client.query('COMMIT');
            res.status(201).json({
                exito: true,
                mensaje: `GRE ${greCreada.serie}-${String(greCreada.correlativo).padStart(8, '0')} emitida con éxito.`,
                guia: greCreada
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ exito: false, mensaje: error.message || 'Error al emitir Guía de Remisión.' });
        } finally {
            client.release();
        }
    },

    obtenerDetalleGre: async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { rows } = await pool.query(`
                SELECT
                    g.*,
                    TO_CHAR(g.fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso,
                    c.serie AS factura_serie,
                    c.correlativo AS factura_correlativo
                FROM guias_remision g
                LEFT JOIN comprobantes c ON g.id_comprobante = c.id_comprobante
                WHERE g.id_gre = $1;
            `, [id]);
            if (rows.length === 0) return res.status(404).json({ exito: false, mensaje: 'GRE no encontrada.' });
            const configEmisor = await obtenerConfigEmisor(pool);
            res.json({ exito: true, guia: rows[0], emisor: configEmisor });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al obtener detalle de GRE.' });
        }
    },

    listarFacturasVencidas: async (req, res) => {
        try {
            const puedeVerTodas = req.usuario?.nombre_rol === 'Admin Central' || req.usuario?.puede_ver_otras_ubicaciones === true;
            const params = [];
            let filtroUbicacion = '';
            if (!puedeVerTodas && req.usuario?.id_ubicacion) {
                filtroUbicacion = 'AND (p.id_ubicacion = $1::int OR c.id_ubicacion = $1::int)';
                params.push(req.usuario.id_ubicacion);
            }

            const query = `
                SELECT
                    c.id_comprobante,
                    c.id_pedido,
                    c.tipo_comprobante,
                    c.serie,
                    c.correlativo,
                    c.monto_total,
                    c.forma_pago,
                    c.dias_credito,
                    c.estado_pago,
                    c.fecha_vencimiento_cuota,
                    TO_CHAR(c.fecha_vencimiento_cuota, 'YYYY-MM-DD') AS fecha_vencimiento_iso,
                    ((CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date - c.fecha_vencimiento_cuota)::int AS dias_vencido,
                    COALESCE(c.id_ubicacion, p.id_ubicacion) AS id_ubicacion_final,
                    COALESCE(u.nombre, u_comp.nombre, 'Sede Principal') AS nombre_ubicacion,
                    COALESCE(cl_comp.razon_social_o_nombre, cl.razon_social_o_nombre, 'Cliente General') AS nombre_cliente,
                    COALESCE(cl_comp.numero_documento, cl.numero_documento, '-') AS documento_cliente
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN ubicaciones u ON p.id_ubicacion = u.id_ubicacion
                LEFT JOIN ubicaciones u_comp ON c.id_ubicacion = u_comp.id_ubicacion
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                LEFT JOIN clientes cl_comp ON c.id_cliente = cl_comp.id_cliente
                WHERE c.forma_pago = 'CREDITO'
                  AND COALESCE(c.estado_pago, 'PENDIENTE') = 'PENDIENTE'
                  AND COALESCE(c.estado_sunat, '') != 'ANULADO'
                  AND c.tipo_comprobante IN ('01', '03')
                  AND c.fecha_vencimiento_cuota IS NOT NULL
                  AND c.fecha_vencimiento_cuota < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
                  ${filtroUbicacion}
                ORDER BY c.fecha_vencimiento_cuota ASC, c.id_comprobante DESC;
            `;
            const { rows } = await pool.query(query, params);
            return res.status(200).json({
                exito: true,
                total: rows.length,
                vencidas: rows
            });
        } catch (error) {
            console.error('Error al listar facturas vencidas:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al consultar facturas a crédito vencidas.' });
        }
    },

    actualizarEstadoPagoComprobante: async (req, res) => {
        try {
            const idComprobante = parseInt(req.params.id, 10);
            if (!Number.isFinite(idComprobante) || idComprobante <= 0) {
                return res.status(400).json({ exito: false, mensaje: 'ID de comprobante inválido.' });
            }

            const estadoSolicitado = String(req.body?.estado_pago || '').toUpperCase().trim();
            if (!['PAGADO', 'PENDIENTE'].includes(estadoSolicitado)) {
                return res.status(400).json({ exito: false, mensaje: 'Estado de pago inválido. Usa PAGADO o PENDIENTE.' });
            }

            const check = await pool.query(`
                SELECT c.*, p.id_ubicacion AS pedido_ubicacion
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                WHERE c.id_comprobante = $1::int;
            `, [idComprobante]);

            if (check.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Comprobante no encontrado.' });
            }

            const comp = check.rows[0];
            const puedeVerTodas = req.usuario?.nombre_rol === 'Admin Central' || req.usuario?.puede_ver_otras_ubicaciones === true;
            const ubicacionComp = comp.id_ubicacion || comp.pedido_ubicacion;
            if (!puedeVerTodas && req.usuario?.id_ubicacion && ubicacionComp && Number(ubicacionComp) !== Number(req.usuario.id_ubicacion)) {
                return res.status(403).json({ exito: false, mensaje: 'No tienes permiso para actualizar comprobantes de otra sede.' });
            }

            if (comp.forma_pago !== 'CREDITO') {
                return res.status(400).json({ exito: false, mensaje: 'Solo los comprobantes emitidos a CRÉDITO permiten cambiar su estado de cobranza.' });
            }
            if (comp.estado_sunat === 'ANULADO' || comp.tipo_comprobante === '07') {
                return res.status(400).json({ exito: false, mensaje: 'No se puede cambiar el estado de pago de un comprobante anulado o nota de crédito.' });
            }

            const { rows } = await pool.query(`
                UPDATE comprobantes
                SET estado_pago = $1::varchar,
                    fecha_pago = CASE WHEN $1::varchar = 'PAGADO' THEN NOW() ELSE NULL END,
                    pagado_por = CASE WHEN $1::varchar = 'PAGADO' THEN $2::int ELSE NULL END
                WHERE id_comprobante = $3::int
                RETURNING id_comprobante, serie, correlativo, forma_pago, estado_pago, fecha_pago, TO_CHAR(fecha_vencimiento_cuota, 'YYYY-MM-DD') AS fecha_vencimiento_iso;
            `, [estadoSolicitado, req.usuario?.id_usuario || null, idComprobante]);

            await registrarAuditoria(
                pool,
                req.usuario?.id_usuario || null,
                'ACTUALIZAR_ESTADO_PAGO_COMPROBANTE',
                'comprobantes',
                idComprobante,
                { estado_pago: comp.estado_pago },
                { estado_pago: estadoSolicitado, serie: comp.serie, correlativo: comp.correlativo }
            );

            return res.status(200).json({
                exito: true,
                mensaje: estadoSolicitado === 'PAGADO'
                    ? `Comprobante ${comp.serie}-${String(comp.correlativo).padStart(8, '0')} marcado como Pagado.`
                    : `Comprobante ${comp.serie}-${String(comp.correlativo).padStart(8, '0')} devuelto a Pendiente de pago.`,
                comprobante: rows[0]
            });
        } catch (error) {
            console.error('Error al actualizar estado de pago del comprobante:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al actualizar el estado de pago.' });
        }
    },

};

module.exports = facturaController;
