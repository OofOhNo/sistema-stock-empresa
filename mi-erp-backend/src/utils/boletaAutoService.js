const pool = require('../config/db');
const { registrarAuditoria } = require('./auditoria');
const {
    numeroALetrasSoles,
    calcularDesgloseTributario,
    construirPayloadNubefact,
    generarXmlUbl21YDatosSunat,
    enviarAConectorNubefact
} = require('./sunatNubefactService');

let cronHandle = null;
let ejecutandoCiclo = false;

async function obtenerConfigEmisor(client) {
    const res = await client.query('SELECT * FROM configuracion_empresa_sunat WHERE id_config = 1');
    if (res.rows.length > 0) return res.rows[0];
    return {
        ruc_emisor: process.env.SUNAT_RUC_EMISOR || '20608725394',
        razon_social: process.env.SUNAT_RAZON_SOCIAL || 'PROCESOS CARNICOS SOCIEDAD ANONIMA CERRADA',
        nombre_comercial: 'PROCESOS CARNICOS S.A.C.',
        direccion_fiscal: 'OTR. ZONA N 24 Y 25 MZ. 12 P.J. SEMIRURAL PACHACUTEC AREQUIPA',
        ubigeo: '040101',
        modo_integracion: process.env.NUBEFACT_MODO || 'DEMO_NUBEFACT',
        nubefact_ruta: process.env.NUBEFACT_RUTA || 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
        nubefact_token: process.env.NUBEFACT_TOKEN || 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
        igv_porcentaje: 18.00
    };
}

function dentroDeHorarioLima(horaInicio = '08:00', horaFin = '20:00') {
    const ahora = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return ahora >= horaInicio && ahora <= horaFin;
}

function redondearPasoPeso(valor, paso = 0.25) {
    return +(Math.round(valor / paso) * paso).toFixed(2);
}

async function generarUnaBoletaAutomatica({ forzar = false, idUsuario = null } = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cfgRes = await client.query('SELECT * FROM config_boletas_automaticas WHERE id_config = 1 FOR UPDATE');
        if (cfgRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { generada: false, motivo: 'Sin configuración de boletas automáticas.' };
        }

        const cfg = cfgRes.rows[0];

        if (!forzar) {
            if (!cfg.activo) {
                await client.query('ROLLBACK');
                return { generada: false, motivo: 'Generador desactivado.' };
            }
            if (cfg.solo_horario_laboral && !dentroDeHorarioLima(cfg.hora_inicio, cfg.hora_fin)) {
                await client.query('ROLLBACK');
                return { generada: false, motivo: 'Fuera de horario configurado.' };
            }
            if (cfg.proxima_ejecucion && new Date() < new Date(cfg.proxima_ejecucion)) {
                await client.query('ROLLBACK');
                return { generada: false, motivo: 'Aún no cumple el intervalo.' };
            }
        }

        // Asegurar ubicación válida
        let idUbicacion = cfg.id_ubicacion;
        if (!idUbicacion) {
            const uRes = await client.query('SELECT id_ubicacion FROM ubicaciones ORDER BY id_ubicacion ASC LIMIT 1');
            idUbicacion = uRes.rows[0]?.id_ubicacion || 1;
        }

        // Peso mínimo nunca menor a 0.50 kg por requerimiento estricto
        const pesoMinItem = Math.max(0.50, Number(cfg.peso_minimo_item || 0.50));
        const pesoMaxItem = Math.max(pesoMinItem, Number(cfg.peso_maximo_item || 8.00));
        const montoMaxLimite = Math.min(695.00, Number(cfg.monto_maximo || 680.00));
        const montoMinObjetivo = Math.max(20.00, Math.min(montoMaxLimite - 5, Number(cfg.monto_minimo || 35.00)));

        // Seleccionar productos reales con stock físico disponible >= pesoMinItem en esa ubicación
        const prodRes = await client.query(`
            SELECT
                p.id_producto, p.sku, p.nombre, p.precio_venta,
                p.unidad_medida, p.tipo_afectacion_igv,
                COALESCE(um.codigo, 'KGM') AS codigo_unidad_sunat,
                (i.cantidad_fisica - COALESCE(i.cantidad_reservada, 0)) AS disponible
            FROM inventario i
            JOIN productos p ON p.id_producto = i.id_producto
            LEFT JOIN unidades_medida um ON p.id_unidad = um.id_unidad
            WHERE i.id_ubicacion = $1
              AND p.activo = TRUE
              AND p.precio_venta > 0
              AND p.precio_venta * $2 < 700
              AND (i.cantidad_fisica - COALESCE(i.cantidad_reservada, 0)) >= $2
            ORDER BY RANDOM()
            LIMIT 12;
        `, [idUbicacion, pesoMinItem]);

        if (prodRes.rows.length === 0) {
            // Reprogramar siguiente intento para no saturar si falta stock
            const intervalo = Math.max(1, parseInt(cfg.intervalo_minutos || 30, 10));
            await client.query(
                `UPDATE config_boletas_automaticas
                 SET proxima_ejecucion = CURRENT_TIMESTAMP + ($1 * INTERVAL '1 minute')
                 WHERE id_config = 1`,
                [intervalo]
            );
            await client.query('COMMIT');
            return {
                generada: false,
                motivo: `No hay productos con stock disponible >= ${pesoMinItem.toFixed(2)} kg y precio compatible (< S/ 700) en la sede seleccionada.`
            };
        }

        // Elegir un objetivo realista entre montoMinObjetivo y montoMaxLimite (< 700)
        const objetivoMonto = +(
            montoMinObjetivo + Math.random() * (montoMaxLimite - montoMinObjetivo)
        ).toFixed(2);

        const maxProductos = Math.min(3, prodRes.rows.length);
        const itemsElegidos = [];
        let acumulado = 0;

        for (let idx = 0; idx < prodRes.rows.length && itemsElegidos.length < maxProductos; idx++) {
            const prod = prodRes.rows[idx];
            const precio = Number(prod.precio_venta);
            const disponible = Number(prod.disponible);
            const restanteDinero = Math.min(698 - acumulado, objetivoMonto - acumulado);

            if (restanteDinero < precio * pesoMinItem && itemsElegidos.length > 0) {
                continue;
            }

            const maxKgPosiblePorMonto = Math.floor(((698 - acumulado) / precio) / 0.25) * 0.25;
            const maxKgPosible = Math.min(disponible, pesoMaxItem, maxKgPosiblePorMonto);

            if (maxKgPosible < pesoMinItem) continue;

            // Elegir peso realista >= 0.50 kg
            const topeDeseado = Math.min(maxKgPosible, Math.max(pesoMinItem, (restanteDinero > 0 ? restanteDinero / precio : pesoMinItem)));
            let kg = pesoMinItem + Math.random() * Math.max(0, topeDeseado - pesoMinItem);
            kg = Math.max(pesoMinItem, redondearPasoPeso(kg, 0.25));
            kg = Math.min(kg, maxKgPosible);
            kg = +kg.toFixed(2);

            if (kg < pesoMinItem) continue;

            const subtotal = +(kg * precio).toFixed(2);
            if (acumulado + subtotal >= 700) continue;

            itemsElegidos.push({
                id_producto: prod.id_producto,
                codigo: prod.sku,
                descripcion: prod.nombre,
                unidad_medida: prod.unidad_medida || 'Kilogramo',
                codigo_unidad_sunat: prod.codigo_unidad_sunat || 'KGM',
                tipo_afectacion_igv: prod.tipo_afectacion_igv || '10',
                cantidad: kg,
                precio_unitario: precio,
                peso: kg,
                subtotal
            });
            acumulado = +(acumulado + subtotal).toFixed(2);

            if (acumulado >= objetivoMonto * 0.85) break;
        }

        if (itemsElegidos.length === 0 || acumulado >= 700) {
            await client.query('ROLLBACK');
            return { generada: false, motivo: 'No se pudo armar una boleta válida menor a S/ 700 con porciones >= 0.50 kg.' };
        }

        // Asegurar cliente CLIENTES VARIOS (DNI/Doc 00000000) para Boleta simple
        let cliente;
        const resVarios = await client.query(
            "SELECT * FROM clientes WHERE numero_documento = '00000000' OR razon_social_o_nombre ILIKE '%CLIENTES VARIOS%' LIMIT 1"
        );
        if (resVarios.rows.length > 0) {
            cliente = resVarios.rows[0];
        } else {
            const insVarios = await client.query(`
                INSERT INTO clientes (razon_social_o_nombre, nombre_comercial, tipo_documento, numero_documento, direccion)
                VALUES ('CLIENTES VARIOS', 'CONSUMIDOR FINAL', '0', '00000000', 'Venta en Mostrador')
                RETURNING *;
            `);
            cliente = insVarios.rows[0];
        }

        // Descontar inventario real y registrar Kardex
        for (const it of itemsElegidos) {
            await client.query(`
                UPDATE inventario
                SET cantidad_fisica = cantidad_fisica - $1,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id_producto = $2 AND id_ubicacion = $3;
            `, [it.cantidad, it.id_producto, idUbicacion]);

            await client.query(`
                INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                VALUES ($1, $2, $3, 'SALIDA', $4, $5);
            `, [it.id_producto, idUbicacion, idUsuario, it.cantidad, `Boleta Automática (${it.descripcion})`]);
        }

        const configEmisor = await obtenerConfigEmisor(client);
        const { itemsCalculados, totales } = calcularDesgloseTributario(itemsElegidos, configEmisor.igv_porcentaje);

        if (totales.monto_total >= 700) {
            await client.query('ROLLBACK');
            return { generada: false, motivo: 'El monto calculado alcanzó S/ 700.' };
        }

        const montoEnLetras = numeroALetrasSoles(totales.monto_total);
        const tipoComprobante = '03';
        const serie = 'B001';

        const resSerie = await client.query('SELECT ultimo_correlativo FROM series_sunat WHERE serie = $1 FOR UPDATE', [serie]);
        let correlativo = 1;
        if (resSerie.rows.length === 0) {
            await client.query('INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES ($1, $2, 1)', [tipoComprobante, serie]);
        } else {
            correlativo = resSerie.rows[0].ultimo_correlativo + 1;
            await client.query('UPDATE series_sunat SET ultimo_correlativo = $1 WHERE serie = $2', [correlativo, serie]);
        }

        const pesoTotal = +itemsElegidos.reduce((acc, it) => acc + Number(it.peso || it.cantidad || 0), 0).toFixed(2);

        const payloadNubefact = construirPayloadNubefact({
            tipo_comprobante: tipoComprobante,
            serie,
            correlativo,
            cliente,
            itemsCalculados,
            totales,
            forma_pago: 'CONTADO',
            dias_credito: 0,
            fecha_vencimiento_cuota: null,
            medio_pago_sunat: '008',
            aplica_detraccion: false,
            configEmisor
        });

        const datosUbl = generarXmlUbl21YDatosSunat({
            tipo_comprobante: tipoComprobante,
            serie,
            correlativo,
            configEmisor,
            cliente,
            itemsCalculados,
            totales,
            monto_en_letras: montoEnLetras,
            forma_pago: 'CONTADO'
        });

        const respuestaOse = await enviarAConectorNubefact({
            payloadNubefact,
            configEmisor,
            datosUbl
        });

        const resComp = await client.query(`
            INSERT INTO comprobantes (
                id_pedido, id_cliente, id_ubicacion, tipo_comprobante, serie, correlativo,
                monto_subtotal, monto_gravada, monto_exonerada, monto_inafecta,
                monto_igv, monto_total, forma_pago, dias_credito, fecha_vencimiento_cuota,
                medio_pago_sunat, tipo_operacion_sunat, aplica_detraccion,
                estado_sunat, codigo_hash, mensaje_cdr, cadena_qr, monto_en_letras,
                enlace_pdf, enlace_xml, enlace_cdr, xml_firmado, cdr_xml,
                respuesta_ose_json, modo_emision, peso_total, cantidad_cuotas,
                origen_facturacion, items_json
            )
            VALUES (
                NULL, $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, 'CONTADO', 0, NULL,
                '008', '0101', FALSE,
                $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21,
                $22, $23, $24, 1,
                'AUTOMATICA', $25
            )
            RETURNING *;
        `, [
            cliente.id_cliente,
            idUbicacion,
            tipoComprobante,
            serie,
            correlativo,
            totales.monto_subtotal.toFixed(2),
            totales.monto_gravada.toFixed(2),
            totales.monto_exonerada.toFixed(2),
            totales.monto_inafecta.toFixed(2),
            totales.monto_igv.toFixed(2),
            totales.monto_total.toFixed(2),
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
            pesoTotal,
            JSON.stringify(itemsElegidos)
        ]);

        const comprobante = resComp.rows[0];

        // Encolar para impresión en segundo plano
        const colaRes = await client.query(`
            INSERT INTO cola_impresion_boletas (id_comprobante, estado, origen)
            VALUES ($1, 'PENDIENTE', $2)
            RETURNING *;
        `, [comprobante.id_comprobante, forzar ? 'PRUEBA_MANUAL' : 'AUTOMATICA']);

        const intervalo = Math.max(1, parseInt(cfg.intervalo_minutos || 30, 10));
        await client.query(`
            UPDATE config_boletas_automaticas
            SET ultima_ejecucion = CURRENT_TIMESTAMP,
                proxima_ejecucion = CURRENT_TIMESTAMP + ($1 * INTERVAL '1 minute'),
                actualizado_en = CURRENT_TIMESTAMP
            WHERE id_config = 1;
        `, [intervalo]);

        await registrarAuditoria(
            client,
            idUsuario,
            forzar ? 'BOLETA_AUTOMATICA_FORZADA' : 'BOLETA_AUTOMATICA',
            'comprobantes',
            comprobante.id_comprobante,
            null,
            { serie, correlativo, monto_total: totales.monto_total, peso_total: pesoTotal }
        );

        await client.query('COMMIT');
        return {
            generada: true,
            comprobante,
            cola: colaRes.rows[0]
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en boletaAutoService:', error);
        return { generada: false, motivo: error.message };
    } finally {
        client.release();
    }
}

function iniciarCronBoletasAutomaticas() {
    if (cronHandle) return;
    cronHandle = setInterval(async () => {
        if (ejecutandoCiclo) return;
        ejecutandoCiclo = true;
        try {
            await generarUnaBoletaAutomatica({ forzar: false });
        } catch (err) {
            console.error('Error en cron de boletas automáticas:', err.message);
        } finally {
            ejecutandoCiclo = false;
        }
    }, 30000);
    console.log('⏱️  Servicio de Boletas Automáticas inicializado (verificación cada 30s).');
}

module.exports = {
    iniciarCronBoletasAutomaticas,
    generarUnaBoletaAutomatica
};
