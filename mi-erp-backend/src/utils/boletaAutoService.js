const pool = require('../config/db');
const { registrarAuditoria } = require('./auditoria');
const {
    numeroALetrasSoles,
    calcularDesgloseTributario,
    generarXmlUbl21YDatosSunat,
    emitirComprobanteEnOse
} = require('./sunatNubefactService');

let timeoutHandle = null;
let watcherHandle = null;
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
        departamento: 'AREQUIPA',
        provincia: 'AREQUIPA',
        distrito: 'CERRO COLORADO',
        modo_integracion: process.env.APISPERU_MODO || process.env.NUBEFACT_MODO || 'DEMO_NUBEFACT',
        nubefact_ruta: process.env.NUBEFACT_RUTA || 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
        nubefact_token: process.env.NUBEFACT_TOKEN || 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
        apisperu_url: process.env.APISPERU_URL || 'https://facturacion.apisperu.com/api/v1',
        apisperu_token: process.env.APISPERU_TOKEN || '',
        igv_porcentaje: 18.00
    };
}

function dentroDeHorarioLima(horaInicio = '08:00', horaFin = '20:00') {
    const ahora = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        hourCycle: 'h23'
    });
    if (horaInicio <= horaFin) {
        return ahora >= horaInicio && ahora <= horaFin;
    }
    // Soporte si el horario cruza medianoche (ej. 22:00 a 04:00)
    return ahora >= horaInicio || ahora <= horaFin;
}

function redondearPasoPeso(valor, paso = 0.25) {
    return +(Math.round(valor / paso) * paso).toFixed(2);
}

/**
 * Calcula una fecha aleatoria exacta al segundo entre minMinutos y maxMinutos.
 * Ejemplo: rango 5 a 10 min => cualquier segundo entre 300s y 600s (ej. 5m 53s, 8m 02s).
 */
function calcularProximaEjecucionAleatoria(minMinutos = 5, maxMinutos = 10) {
    const minM = Math.max(1, Math.min(1440, parseInt(minMinutos || 5, 10) || 5));
    const maxM = Math.max(minM, Math.min(1440, parseInt(maxMinutos || minM, 10) || minM));
    const minSeg = minM * 60;
    const maxSeg = maxM * 60;
    const segAleatorios = minSeg + Math.floor(Math.random() * (maxSeg - minSeg + 1));
    return {
        fecha: new Date(Date.now() + segAleatorios * 1000),
        segundos: segAleatorios
    };
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
        const minMin = Math.max(1, parseInt(cfg.intervalo_min_minutos ?? cfg.intervalo_minutos ?? 5, 10) || 5);
        const maxMin = Math.max(minMin, parseInt(cfg.intervalo_max_minutos ?? cfg.intervalo_minutos ?? 10, 10) || minMin);

        if (!forzar) {
            if (!cfg.activo) {
                await client.query('ROLLBACK');
                return { generada: false, motivo: 'Generador desactivado.' };
            }
            if (cfg.solo_horario_laboral && !dentroDeHorarioLima(cfg.hora_inicio, cfg.hora_fin)) {
                // Quedarse en espera durante la noche y limpiar proxima_ejecucion para iniciar limpio al día siguiente
                if (cfg.proxima_ejecucion) {
                    await client.query(
                        'UPDATE config_boletas_automaticas SET proxima_ejecucion = NULL WHERE id_config = 1'
                    );
                    await client.query('COMMIT');
                } else {
                    await client.query('ROLLBACK');
                }
                return { generada: false, motivo: 'En espera: fuera del horario configurado.' };
            }
            // Tolerancia de 1 segundo para evitar desfasar un timer preciso
            if (cfg.proxima_ejecucion && (new Date(cfg.proxima_ejecucion).getTime() - Date.now()) > 1000) {
                await client.query('ROLLBACK');
                return { generada: false, motivo: 'Aún no cumple el intervalo aleatorio.' };
            }
        }

        // Sede emisora de la boleta (solo para registro fiscal; no descuenta stock)
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

        // Seleccionar cualquier producto activo con precio > 0 sin revisar inventario ni descontar stock
        const prodRes = await client.query(`
            SELECT
                p.id_producto, p.sku, p.nombre, p.precio_venta,
                p.unidad_medida, p.tipo_afectacion_igv,
                COALESCE(um.codigo, 'KGM') AS codigo_unidad_sunat
            FROM productos p
            LEFT JOIN unidades_medida um ON p.id_unidad = um.id_unidad
            WHERE p.activo = TRUE
              AND p.precio_venta > 0
              AND p.precio_venta * $1::numeric < 700
            ORDER BY RANDOM()
            LIMIT 12;
        `, [pesoMinItem]);

        if (prodRes.rows.length === 0) {
            const siguiente = calcularProximaEjecucionAleatoria(minMin, maxMin);
            await client.query(
                `UPDATE config_boletas_automaticas
                 SET proxima_ejecucion = CASE WHEN activo THEN $1::timestamptz ELSE NULL END
                 WHERE id_config = 1`,
                [siguiente.fecha.toISOString()]
            );
            await client.query('COMMIT');
            return {
                generada: false,
                motivo: `No hay productos activos con precio compatible (< S/ 700 para porción de ${pesoMinItem.toFixed(2)} kg).`
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
            const restanteDinero = Math.min(698 - acumulado, objetivoMonto - acumulado);

            if (restanteDinero < precio * pesoMinItem && itemsElegidos.length > 0) {
                continue;
            }

            const maxKgPosiblePorMonto = Math.floor(((698 - acumulado) / precio) / 0.25) * 0.25;
            const maxKgPosible = Math.min(pesoMaxItem, maxKgPosiblePorMonto);

            if (maxKgPosible < pesoMinItem) continue;

            // Elegir peso realista >= 0.50 kg
            const topeDeseado = Math.min(
                maxKgPosible,
                Math.max(pesoMinItem, restanteDinero > 0 ? restanteDinero / precio : pesoMinItem)
            );
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

        // Nota: La boletera automática NO descuenta stock ni altera Kardex por requerimiento del negocio.
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

        const respuestaOse = await emitirComprobanteEnOse({
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
            monto_en_letras: montoEnLetras,
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
                enlace_pdf, enlace_xml, enlace_cdr, xml_firmado, cdr_xml, cdr_zip_base64,
                respuesta_ose_json, modo_emision, peso_total, cantidad_cuotas,
                origen_facturacion, items_json
            )
            VALUES (
                NULL, $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, 'CONTADO', 0, NULL,
                '008', '0101', FALSE,
                $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22,
                $23, $24, $25, 1,
                'AUTOMATICA', $26
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
            respuestaOse.xml_firmado || datosUbl.xmlFirmado,
            respuestaOse.cdr_xml || datosUbl.cdrXml,
            respuestaOse.cdr_zip_base64 || null,
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

        const siguiente = calcularProximaEjecucionAleatoria(minMin, maxMin);
        const nuevaProxima = cfg.activo ? siguiente.fecha.toISOString() : null;

        await client.query(`
            UPDATE config_boletas_automaticas
            SET ultima_ejecucion = CURRENT_TIMESTAMP,
                proxima_ejecucion = $1::timestamptz,
                actualizado_en = CURRENT_TIMESTAMP
            WHERE id_config = 1;
        `, [nuevaProxima]);

        await registrarAuditoria(
            client,
            idUsuario,
            forzar ? 'BOLETA_AUTOMATICA_FORZADA' : 'BOLETA_AUTOMATICA',
            'comprobantes',
            comprobante.id_comprobante,
            null,
            { serie, correlativo, monto_total: totales.monto_total, peso_total: pesoTotal, descuenta_stock: false }
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

async function ejecutarCicloAutomatico() {
    if (ejecutandoCiclo) return;
    ejecutandoCiclo = true;
    try {
        await generarUnaBoletaAutomatica({ forzar: false });
    } catch (err) {
        console.error('Error en ejecución automática de boletas:', err.message);
    } finally {
        ejecutandoCiclo = false;
        await reprogramarBoletasAutomaticas();
    }
}

/**
 * Programa un temporizador exacto al segundo para la próxima boleta automática,
 * respetando el rango aleatorio y el horario configurado.
 */
async function reprogramarBoletasAutomaticas() {
    if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
    }

    try {
        const resCfg = await pool.query('SELECT * FROM config_boletas_automaticas WHERE id_config = 1');
        const cfg = resCfg.rows[0];
        if (!cfg || !cfg.activo) return;

        if (cfg.solo_horario_laboral && !dentroDeHorarioLima(cfg.hora_inicio, cfg.hora_fin)) {
            if (cfg.proxima_ejecucion) {
                await pool.query('UPDATE config_boletas_automaticas SET proxima_ejecucion = NULL WHERE id_config = 1');
            }
            return;
        }

        let proxima = cfg.proxima_ejecucion ? new Date(cfg.proxima_ejecucion) : null;
        if (!proxima || Number.isNaN(proxima.getTime())) {
            const minMin = Math.max(1, parseInt(cfg.intervalo_min_minutos ?? cfg.intervalo_minutos ?? 5, 10) || 5);
            const maxMin = Math.max(minMin, parseInt(cfg.intervalo_max_minutos ?? cfg.intervalo_minutos ?? 10, 10) || minMin);
            const calculada = calcularProximaEjecucionAleatoria(minMin, maxMin);
            proxima = calculada.fecha;
            await pool.query(
                'UPDATE config_boletas_automaticas SET proxima_ejecucion = $1::timestamptz WHERE id_config = 1',
                [proxima.toISOString()]
            );
        }

        const delayMs = Math.max(200, proxima.getTime() - Date.now());
        timeoutHandle = setTimeout(() => {
            void ejecutarCicloAutomatico();
        }, Math.min(delayMs, 2147483640));
    } catch (err) {
        console.error('Error reprogramando temporizador de boletas:', err.message);
    }
}

function iniciarCronBoletasAutomaticas() {
    if (watcherHandle) return;
    void reprogramarBoletasAutomaticas();
    // Vigía cada 15s para retomar automáticamente al llegar la hora de inicio del día siguiente
    watcherHandle = setInterval(async () => {
        if (ejecutandoCiclo || timeoutHandle) return;
        try {
            const resCfg = await pool.query(
                'SELECT activo, solo_horario_laboral, hora_inicio, hora_fin FROM config_boletas_automaticas WHERE id_config = 1'
            );
            const cfg = resCfg.rows[0];
            if (!cfg?.activo) return;
            if (!cfg.solo_horario_laboral || dentroDeHorarioLima(cfg.hora_inicio, cfg.hora_fin)) {
                await reprogramarBoletasAutomaticas();
            }
        } catch (err) {
            console.error('Error en vigía de boletas automáticas:', err.message);
        }
    }, 15000);
    console.log('⏱️  Servicio de Boletas Automáticas inicializado (programación aleatoria precisa al segundo, sin descuento de stock).');
}

module.exports = {
    iniciarCronBoletasAutomaticas,
    reprogramarBoletasAutomaticas,
    generarUnaBoletaAutomatica,
    calcularProximaEjecucionAleatoria,
    dentroDeHorarioLima
};
