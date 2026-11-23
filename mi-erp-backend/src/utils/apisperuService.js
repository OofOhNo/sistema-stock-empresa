const zlib = require('zlib');

const DEFAULT_APISPERU_URL = 'https://facturacion.apisperu.com/api/v1';

/**
 * Determina el modo de integración OSE/PSE activo combinando variables de entorno
 * (si se configuraron explícitamente) y la configuración guardada en Supabase.
 */
function resolverModoIntegracion(configEmisor = {}) {
    const modoEnv = process.env.APISPERU_MODO || process.env.NUBEFACT_MODO || '';
    const modoBd = configEmisor?.modo_integracion || 'DEMO_NUBEFACT';
    const raw = String(modoEnv || modoBd).trim().toUpperCase();
    if (raw === 'APISPERU' || raw === 'NUBEFACT_REAL') return raw;
    return 'DEMO_NUBEFACT';
}

/**
 * Normaliza la URL base de APIsPERU y valida que exista un Bearer Token real.
 */
function obtenerCredencialesApisperu(configEmisor = {}) {
    let baseUrl = String(
        process.env.APISPERU_URL || configEmisor?.apisperu_url || DEFAULT_APISPERU_URL
    ).trim();

    baseUrl = baseUrl
        .replace(/\/+(invoice|note|despatch|companies|sale)\/.*$/i, '')
        .replace(/\/+$/, '');

    if (!baseUrl) baseUrl = DEFAULT_APISPERU_URL;

    const token = String(
        process.env.APISPERU_TOKEN || configEmisor?.apisperu_token || ''
    ).trim();

    return { baseUrl, token };
}

/**
 * Formatea una fecha a ISO-8601 en zona horaria Perú (-05:00): YYYY-MM-DDTHH:mm:ss-05:00.
 */
function formatearFechaHoraPeru(fechaInput = null) {
    const date = fechaInput ? new Date(fechaInput) : new Date();
    const fecha = date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const hora = date.toLocaleTimeString('en-GB', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    return `${fecha}T${hora}-05:00`;
}

/**
 * Devuelve solo YYYY-MM-DD en zona horaria America/Lima.
 */
function formatearFechaSoloPeru(fechaInput = null) {
    if (typeof fechaInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaInput.trim())) {
        return fechaInput.trim();
    }
    const date = fechaInput ? new Date(fechaInput) : new Date();
    return date.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/**
 * Suma N días calendario a una fecha YYYY-MM-DD sin desfases por huso horario.
 */
function sumarDiasYmd(ymd, dias) {
    const [y, m, d] = ymd.split('-').map(Number);
    const utc = new Date(Date.UTC(y, m - 1, d + dias));
    return utc.toISOString().slice(0, 10);
}

/**
 * Extrae el archivo XML contenido dentro de un CDR ZIP en Base64 devuelto por SUNAT/APIsPERU.
 * No requiere librerías externas: lee el Central Directory y descomprime Deflate (método 8) o Stored (0).
 */
function extraerXmlDeZipBase64(cdrZipBase64) {
    if (!cdrZipBase64 || typeof cdrZipBase64 !== 'string') return null;
    try {
        const cleanB64 = cdrZipBase64.replace(/\s+/g, '');
        const buf = Buffer.from(cleanB64, 'base64');
        if (buf.length < 22) return null;

        // Buscar End of Central Directory (0x06054b50) desde el final
        let eocdOffset = -1;
        const minOffset = Math.max(0, buf.length - 65557);
        for (let i = buf.length - 22; i >= minOffset; i -= 1) {
            if (buf.readUInt32LE(i) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) return null;

        const totalEntries = buf.readUInt16LE(eocdOffset + 10);
        let offset = buf.readUInt32LE(eocdOffset + 16);

        for (let idx = 0; idx < totalEntries && offset + 46 <= buf.length; idx += 1) {
            if (buf.readUInt32LE(offset) !== 0x02014b50) break;

            const compressionMethod = buf.readUInt16LE(offset + 10);
            const compressedSize = buf.readUInt32LE(offset + 20);
            const fileNameLength = buf.readUInt16LE(offset + 28);
            const extraLength = buf.readUInt16LE(offset + 30);
            const commentLength = buf.readUInt16LE(offset + 32);
            const localHeaderOffset = buf.readUInt32LE(offset + 42);

            const fileName = buf.toString('utf8', offset + 46, offset + 46 + fileNameLength);
            offset += 46 + fileNameLength + extraLength + commentLength;

            if (!fileName.toLowerCase().endsWith('.xml') || fileName.startsWith('__MACOSX')) {
                continue;
            }
            if (localHeaderOffset + 30 > buf.length || buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
                continue;
            }

            const lfNameLen = buf.readUInt16LE(localHeaderOffset + 26);
            const lfExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + lfNameLen + lfExtraLen;
            const dataEnd = dataStart + compressedSize;
            if (dataEnd > buf.length) continue;

            const compressedSlice = buf.subarray(dataStart, dataEnd);
            if (compressionMethod === 0) {
                return compressedSlice.toString('utf8');
            }
            if (compressionMethod === 8) {
                return zlib.inflateRawSync(compressedSlice).toString('utf8');
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Construye el nodo `company` según el esquema Company/Address de APIsPERU.
 */
function construirCompanyApisperu(configEmisor = {}) {
    const ruc = String(configEmisor.ruc_emisor || '').trim();
    const razonSocial = String(configEmisor.razon_social || 'PROCESOS CARNICOS S.A.C.').trim();
    const nombreComercial = String(configEmisor.nombre_comercial || razonSocial).trim();
    const ubigueo = /^\d{6}$/.test(String(configEmisor.ubigeo || '').trim())
        ? String(configEmisor.ubigeo).trim()
        : '150101';

    return {
        ruc,
        razonSocial,
        nombreComercial,
        address: {
            ubigueo,
            codigoPais: 'PE',
            departamento: String(configEmisor.departamento || 'LIMA').trim().toUpperCase(),
            provincia: String(configEmisor.provincia || 'LIMA').trim().toUpperCase(),
            distrito: String(configEmisor.distrito || 'LIMA').trim().toUpperCase(),
            urbanizacion: '-',
            direccion: String(configEmisor.direccion_fiscal || 'DIRECCIÓN FISCAL').trim()
        }
    };
}

/**
 * Construye el nodo `client` cumpliendo Catálogo 06 de SUNAT (mapeando '-' a '0' para Varios).
 */
function construirClientApisperu(cliente = {}) {
    const numRaw = String(cliente.numero_documento || '').trim();
    const tipoRaw = String(cliente.tipo_documento || '').trim();
    const nombreRaw = String(cliente.razon_social_o_nombre || 'CLIENTES VARIOS').trim();

    const esVarios =
        !numRaw ||
        numRaw === '-' ||
        numRaw === '00000000' ||
        tipoRaw === '-' ||
        tipoRaw === '0' ||
        nombreRaw.toUpperCase().includes('VARIOS');

    const tipoDoc = esVarios
        ? '0'
        : (/^(10|15|16|17|20)\d{9}$/.test(numRaw) ? '6' : (tipoRaw || '1'));
    const numDoc = esVarios ? '00000000' : numRaw;

    const clientObj = {
        tipoDoc,
        numDoc,
        rznSocial: nombreRaw || 'CLIENTES VARIOS',
        address: {
            direccion: String(cliente.direccion || '-').trim() || '-'
        }
    };
    if (cliente.email && String(cliente.email).includes('@')) {
        clientObj.email = String(cliente.email).trim();
    }
    return clientObj;
}

/**
 * Calcula cuotas en soles garantizando fecha futura respecto a emisión y suma exacta al céntimo.
 */
function construirCuotasCreditoApisperu({ montoNeto, diasCredito = 30, cantidadCuotas = 1, fechaVencimiento = null }) {
    const hoyPeru = formatearFechaSoloPeru();
    const dias = Math.max(1, parseInt(diasCredito, 10) || 30);
    const nCuotas = Math.max(1, Math.min(12, parseInt(cantidadCuotas, 10) || 1));

    let fechaBaseFin = fechaVencimiento ? formatearFechaSoloPeru(fechaVencimiento) : sumarDiasYmd(hoyPeru, dias);
    if (fechaBaseFin <= hoyPeru) {
        fechaBaseFin = sumarDiasYmd(hoyPeru, Math.max(1, dias));
    }

    const totalCentavos = Math.round(Number(montoNeto) * 100);
    const baseCentavos = Math.floor(totalCentavos / nCuotas);
    const cuotas = [];

    for (let i = 0; i < nCuotas; i += 1) {
        const centavosCuota = i === nCuotas - 1
            ? totalCentavos - baseCentavos * (nCuotas - 1)
            : baseCentavos;

        let fechaCuotaYmd;
        if (nCuotas === 1) {
            fechaCuotaYmd = fechaBaseFin;
        } else {
            const diasPorCuota = Math.max(1, Math.round((dias * (i + 1)) / nCuotas));
            fechaCuotaYmd = sumarDiasYmd(hoyPeru, diasPorCuota);
            if (i > 0 && fechaCuotaYmd <= cuotas[i - 1].fechaYmd) {
                fechaCuotaYmd = sumarDiasYmd(cuotas[i - 1].fechaYmd, 1);
            }
        }

        cuotas.push({
            fechaYmd: fechaCuotaYmd,
            moneda: 'PEN',
            monto: +(centavosCuota / 100).toFixed(2),
            fechaPago: `${fechaCuotaYmd}T00:00:00-05:00`
        });
    }

    return cuotas.map(({ moneda, monto, fechaPago }) => ({ moneda, monto, fechaPago }));
}

/**
 * Construye el payload JSON oficial de APIsPERU para Facturas (01), Boletas (03) o Notas de Crédito (07).
 */
function construirPayloadApisperuComprobante({
    tipo_comprobante,
    serie,
    correlativo,
    cliente,
    itemsCalculados = [],
    totales = {},
    forma_pago = 'CONTADO',
    dias_credito = 30,
    cantidad_cuotas = 1,
    fecha_vencimiento_cuota = null,
    aplica_detraccion = false,
    codigo_detraccion = '014',
    porcentaje_detraccion = 0,
    monto_detraccion = 0,
    comprobante_referencia = null,
    codigo_motivo_nc = null,
    descripcion_motivo_nc = null,
    monto_en_letras = '',
    configEmisor = {}
}) {
    const company = construirCompanyApisperu(configEmisor);
    const client = construirClientApisperu(cliente);
    const fechaEmision = formatearFechaHoraPeru();

    // Calcular totales directamente desde las líneas redondeadas para evitar desfases de 1 céntimo en SUNAT
    let sumGravadas = 0;
    let sumExoneradas = 0;
    let sumInafectas = 0;
    let sumExportacion = 0;
    let sumIgv = 0;

    const tasaConfig = Number(configEmisor.igv_porcentaje || 18);

    const details = itemsCalculados.map((it) => {
        const tipAfe = String(it.tipo_afectacion_igv || '10');
        const cant = Number(it.cantidad) || 1;
        const mtoBase = +Number(it.subtotal || 0).toFixed(2);
        const igvLinea = tipAfe === '10' ? +Number(it.igv || 0).toFixed(2) : 0;
        const valorUnit = Number(it.valor_unitario || 0);
        const precioUnit = Number(it.precio_unitario || 0);

        if (tipAfe === '10') {
            sumGravadas += mtoBase;
            sumIgv += igvLinea;
        } else if (tipAfe === '20') {
            sumExoneradas += mtoBase;
        } else if (tipAfe === '40') {
            sumExportacion += mtoBase;
        } else {
            sumInafectas += mtoBase;
        }

        return {
            codProducto: String(it.codigo || it.sku || 'PROD').slice(0, 30),
            unidad: String(it.unidad_de_medida || 'NIU').toUpperCase(),
            descripcion: String(it.descripcion || 'PRODUCTO').trim().slice(0, 250),
            cantidad: +cant.toFixed(4),
            mtoValorUnitario: +valorUnit.toFixed(6),
            mtoValorVenta: mtoBase,
            mtoBaseIgv: mtoBase,
            porcentajeIgv: tipAfe === '10' ? tasaConfig : 0,
            igv: igvLinea,
            tipAfeIgv: tipAfe,
            totalImpuestos: igvLinea,
            mtoPrecioUnitario: +precioUnit.toFixed(2)
        };
    });

    const mtoOperGravadas = +sumGravadas.toFixed(2);
    const mtoOperExoneradas = +sumExoneradas.toFixed(2);
    const mtoOperInafectas = +sumInafectas.toFixed(2);
    const mtoOperExportacion = +sumExportacion.toFixed(2);
    const mtoIGV = +sumIgv.toFixed(2);
    const valorVenta = +(mtoOperGravadas + mtoOperExoneradas + mtoOperInafectas + mtoOperExportacion).toFixed(2);
    const totalCalculado = +(valorVenta + mtoIGV).toFixed(2);
    const mtoImpVenta = totalCalculado > 0 ? totalCalculado : +Number(totales.monto_total || 0).toFixed(2);

    const textoLetras = String(monto_en_letras || '').replace(/^SON:\s*/i, 'SON ').trim() || 'SON CERO CON 00/100 SOLES';
    const legends = [{ code: '1000', value: textoLetras }];

    const basePayload = {
        ublVersion: '2.1',
        tipoDoc: String(tipo_comprobante),
        serie: String(serie),
        correlativo: String(correlativo),
        fechaEmision,
        client,
        company,
        tipoMoneda: 'PEN',
        mtoIGV,
        totalImpuestos: mtoIGV,
        mtoImpVenta,
        details,
        legends
    };

    if (mtoOperGravadas > 0) basePayload.mtoOperGravadas = mtoOperGravadas;
    if (mtoOperExoneradas > 0) basePayload.mtoOperExoneradas = mtoOperExoneradas;
    if (mtoOperInafectas > 0) basePayload.mtoOperInafectas = mtoOperInafectas;
    if (mtoOperExportacion > 0) basePayload.mtoOperExportacion = mtoOperExportacion;

    if (tipo_comprobante === '07') {
        const refSerie = comprobante_referencia?.serie || 'F001';
        const refCorr = String(comprobante_referencia?.correlativo || 1);
        return {
            ...basePayload,
            tipDocAfectado: String(comprobante_referencia?.tipo_comprobante || '01'),
            numDocfectado: `${refSerie}-${refCorr}`,
            codMotivo: String(codigo_motivo_nc || '01').padStart(2, '0'),
            desMotivo: String(descripcion_motivo_nc || 'ANULACIÓN DE LA OPERACIÓN').trim().slice(0, 250)
        };
    }

    const tieneDetraccion = Boolean(aplica_detraccion && tipo_comprobante === '01');
    const esFacturaCredito = tipo_comprobante === '01' && String(forma_pago).toUpperCase() === 'CREDITO';
    const montoDetFinal = tieneDetraccion ? +Number(monto_detraccion || 0).toFixed(2) : 0;

    basePayload.tipoOperacion = tieneDetraccion ? '1001' : '0101';
    basePayload.valorVenta = valorVenta;
    basePayload.subTotal = mtoImpVenta;

    if (esFacturaCredito) {
        const montoNetoCredito = Math.max(0, +(mtoImpVenta - montoDetFinal).toFixed(2));
        basePayload.formaPago = {
            moneda: 'PEN',
            tipo: 'Credito',
            monto: montoNetoCredito
        };
        basePayload.cuotas = construirCuotasCreditoApisperu({
            montoNeto: montoNetoCredito,
            diasCredito: dias_credito,
            cantidadCuotas: cantidad_cuotas,
            fechaVencimiento: fecha_vencimiento_cuota
        });
        basePayload.fecVencimiento = basePayload.cuotas[basePayload.cuotas.length - 1]?.fechaPago || fechaEmision;
    } else {
        basePayload.formaPago = {
            moneda: 'PEN',
            tipo: 'Contado'
        };
    }

    if (tieneDetraccion) {
        const ctaBn = String(configEmisor.detraccion_cuenta_bn || '').trim();
        if (!ctaBn || ctaBn === '00-000-000000') {
            throw new Error('Configura tu número de cuenta corriente de detracciones del Banco de la Nación real en "Configuración SUNAT" antes de emitir con detracción.');
        }
        basePayload.detraccion = {
            codBienDetraccion: String(codigo_detraccion || '014').padStart(3, '0'),
            codMedioPago: '001',
            ctaBanco: ctaBn,
            percent: Number(porcentaje_detraccion || 4),
            mount: montoDetFinal
        };
        basePayload.legends.push({ code: '2006', value: 'Operación sujeta a detracción' });
    }

    return basePayload;
}

/**
 * Extrae el mensaje legible ante errores HTTP 400/401/500 o rechazos SUNAT de APIsPERU.
 */
function extraerMensajeErrorApisperu(status, data, textFallback = '') {
    if (status === 401 || status === 403) {
        return `APIsPERU rechazó la autorización (${status}). Verifica el Token de tu empresa en Configuración SUNAT.`;
    }
    if (Array.isArray(data) && data.length > 0) {
        return data
            .map((e) => (e?.field ? `${e.field}: ${e.message}` : (e?.message || JSON.stringify(e))))
            .join(' | ');
    }
    if (data?.sunatResponse?.error) {
        const err = data.sunatResponse.error;
        return `SUNAT [${err.code || 'ERR'}]: ${err.message || 'Comprobante rechazado por SUNAT'}`;
    }
    if (typeof data?.error === 'string' && data.error.trim()) {
        return data.error.trim();
    }
    if (data?.error?.message) {
        return `SUNAT [${data.error.code || 'ERR'}]: ${data.error.message}`;
    }
    if (data?.message) return String(data.message);
    if (textFallback) return textFallback.slice(0, 300);
    return `Error HTTP ${status} al comunicarse con APIsPERU.`;
}

/**
 * Wrapper HTTP JSON para APIsPERU con Authorization Bearer y timeout configurable.
 */
async function llamarApisperuJson(baseUrl, path, { method = 'POST', token, body = null, timeoutMs = 20000 } = {}) {
    if (!token) {
        throw new Error('Falta configurar el Token de APIsPERU en Facturación -> Configuración SUNAT.');
    }
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const opts = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            signal: controller.signal
        };
        if (body !== null && method !== 'GET') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }

        const resp = await fetch(url, opts);
        const rawText = await resp.text();
        let data = null;
        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch {
            data = null;
        }

        if (!resp.ok) {
            throw new Error(extraerMensajeErrorApisperu(resp.status, data, rawText));
        }
        return data || {};
    } catch (err) {
        if (err?.name === 'AbortError') {
            throw new Error(`Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s) al conectar con APIsPERU.`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Envía Factura (01), Boleta (03) o Nota de Crédito (07) a APIsPERU y devuelve el formato unificado del ERP.
 */
async function enviarComprobanteApisperu({ payloadApisperu, tipo_comprobante, configEmisor, datosUblFallback = {} }) {
    const { baseUrl, token } = obtenerCredencialesApisperu(configEmisor);
    const endpoint = tipo_comprobante === '07' || tipo_comprobante === '08'
        ? '/note/send'
        : '/invoice/send';

    const data = await llamarApisperuJson(baseUrl, endpoint, {
        method: 'POST',
        token,
        body: payloadApisperu,
        timeoutMs: 25000
    });

    const sunatResp = data.sunatResponse || {};
    if (sunatResp.success === false || sunatResp.error) {
        const err = sunatResp.error || {};
        throw new Error(`SUNAT rechazó el comprobante [${err.code || 'ERR'}]: ${err.message || 'Error en validación SUNAT.'}`);
    }

    const cdrResp = sunatResp.cdrResponse || {};
    const cdrZipBase64 = sunatResp.cdrZip || null;
    const cdrXmlExtraido = extraerXmlDeZipBase64(cdrZipBase64);
    const xmlFirmado = data.xml || datosUblFallback.xmlFirmado || null;
    const codigoHash = data.hash || datosUblFallback.codigoHash || null;

    const fechaSolo = String(payloadApisperu.fechaEmision || formatearFechaHoraPeru()).slice(0, 10);
    const correlativoPadded = String(payloadApisperu.correlativo).padStart(8, '0');
    const cadenaQr = `${payloadApisperu.company.ruc}|${payloadApisperu.tipoDoc}|${payloadApisperu.serie}|${correlativoPadded}|${Number(payloadApisperu.mtoIGV || 0).toFixed(2)}|${Number(payloadApisperu.mtoImpVenta || 0).toFixed(2)}|${fechaSolo}|${payloadApisperu.client.tipoDoc}|${payloadApisperu.client.numDoc}|${codigoHash || ''}|`;

    const notasCdr = Array.isArray(cdrResp.notes) && cdrResp.notes.length > 0
        ? ` | Observaciones SUNAT: ${cdrResp.notes.join('; ')}`
        : '';
    const mensajeCdr = (cdrResp.description || datosUblFallback.mensajeCdr || 'Comprobante aceptado por SUNAT.') + notasCdr;

    return {
        exito: true,
        modo_emision: 'APISPERU',
        estado_sunat: cdrResp.accepted === false ? 'OBSERVADO' : 'ACEPTADO',
        codigo_hash: codigoHash,
        cadena_qr: cadenaQr,
        mensaje_cdr: mensajeCdr,
        enlace_pdf: null,
        enlace_xml: null,
        enlace_cdr: null,
        xml_firmado: xmlFirmado,
        cdr_xml: cdrXmlExtraido || datosUblFallback.cdrXml || null,
        cdr_zip_base64: cdrZipBase64,
        respuesta_ose_json: {
            hash: codigoHash,
            sunatResponse: {
                success: sunatResp.success,
                cdrResponse: cdrResp,
                tiene_cdr_zip: Boolean(cdrZipBase64)
            },
            payload_enviado: payloadApisperu
        }
    };
}

/**
 * Construye el payload JSON oficial UBL 2022 para APIsPERU POST /despatch/send.
 */
function construirPayloadApisperuGre({
    tipoGre = 'REMITENTE',
    serie,
    correlativo,
    destTipo = '6',
    destNum = '',
    destRazon = '',
    destDireccion = '',
    destEmail = '',
    fechaInicio,
    motivoCodigo = '01',
    desTraslado = 'Venta',
    pesoCalculado = 0,
    unidadPeso = 'KGM',
    numeroBultos = 1,
    tipoTransporte = '02', // '01' Público, '02' Privado
    partidaUbigeo = '',
    partidaDireccion = '',
    llegadaUbigeo = '',
    llegadaDir = '',
    vehPlaca = '',
    vehEntidad = '',
    vehNumAutoriz = '',
    condTipoDoc = '1',
    condNumDoc = '',
    condNombre = '',
    condApellidos = '',
    condLicencia = '',
    observaciones = '',
    trasladoVehiculoM1L = false,
    retornoEnvasesVacios = false,
    retornoVehiculoVacio = false,
    transbordoProgramado = false,
    documentoRelacionado = null,
    bienes = [],
    configEmisor = {},
    transportistaRuc = '',
    transportistaRazon = '',
    transportistaMtc = ''
}) {
    const company = construirCompanyApisperu(configEmisor);
    const tipoDoc = tipoGre === 'TRANSPORTISTA' ? '31' : '09';
    const fechaEmision = formatearFechaHoraPeru();
    const fechaInicioYmd = formatearFechaSoloPeru(fechaInicio);
    const fecTrasladoIso = `${fechaInicioYmd}T00:00:00-05:00`;

    const indicadores = [];
    if (trasladoVehiculoM1L) indicadores.push('SUNAT_Envio_IndicadorTrasladoVehiculoM1L');
    if (retornoEnvasesVacios) indicadores.push('SUNAT_Envio_IndicadorRetornoVehiculoEnvaseVacio');
    if (retornoVehiculoVacio) indicadores.push('SUNAT_Envio_IndicadorRetornoVehiculoVacio');

    const envio = {
        codTraslado: String(motivoCodigo || '01').padStart(2, '0'),
        desTraslado: String(desTraslado || 'Venta').trim().slice(0, 100),
        modTraslado: tipoTransporte,
        fecTraslado: fecTrasladoIso,
        fecEntregaBienes: fecTrasladoIso,
        indTransbordo: Boolean(transbordoProgramado),
        pesoTotal: +Number(pesoCalculado || 0.1).toFixed(2),
        undPesoTotal: String(unidadPeso || 'KGM').toUpperCase(),
        numBultos: Math.max(1, parseInt(numeroBultos, 10) || 1),
        partida: {
            ubigeo: String(partidaUbigeo || '').trim(),
            direccion: String(partidaDireccion || '').trim().slice(0, 200)
        },
        llegada: {
            ubigeo: String(llegadaUbigeo || '').trim(),
            direccion: String(llegadaDir || '').trim().slice(0, 200)
        }
    };

    if (indicadores.length > 0) {
        envio.indicadores = Array.from(new Set(indicadores));
    }

    const placaLimpia = String(vehPlaca || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (tipoTransporte === '02') {
        if (placaLimpia) {
            envio.vehiculo = { placa: placaLimpia };
            if (vehNumAutoriz) envio.vehiculo.nroAutorizacion = String(vehNumAutoriz).trim();
            if (vehEntidad && /^\d{2}$/.test(String(vehEntidad).trim())) {
                envio.vehiculo.codEmisor = String(vehEntidad).trim();
            }
        }
        if (condNumDoc || !trasladoVehiculoM1L) {
            envio.choferes = [{
                tipo: 'Principal',
                tipoDoc: String(condTipoDoc || '1'),
                nroDoc: String(condNumDoc || '').trim(),
                nombres: String(condNombre || 'CONDUCTOR').trim(),
                apellidos: String(condApellidos || 'PRINCIPAL').trim(),
                licencia: String(condLicencia || '').trim().toUpperCase()
            }];
        }
    } else {
        envio.transportista = {
            tipoDoc: '6',
            numDoc: String(transportistaRuc || configEmisor.ruc_emisor || '').trim(),
            rznSocial: String(transportistaRazon || configEmisor.razon_social || '').trim()
        };
        if (transportistaMtc) envio.transportista.nroMtc = String(transportistaMtc).trim();
        if (placaLimpia) envio.transportista.placa = placaLimpia;
    }

    const destinatario = {
        tipoDoc: String(destTipo || '6'),
        numDoc: String(destNum || '').trim(),
        rznSocial: String(destRazon || '').trim(),
        address: {
            direccion: String(destDireccion || llegadaDir || '-').trim()
        }
    };
    if (destEmail && String(destEmail).includes('@')) {
        destinatario.email = String(destEmail).trim();
    }

    const payload = {
        version: 2022,
        tipoDoc,
        serie: String(serie),
        correlativo: String(correlativo),
        fechaEmision,
        company,
        destinatario,
        envio,
        details: (Array.isArray(bienes) ? bienes : []).map((b, idx) => ({
            codigo: String(b.codigo_bien || b.sku || `BIEN-${idx + 1}`).trim().slice(0, 30),
            descripcion: String(b.descripcion || 'PRODUCTO').trim().slice(0, 250),
            unidad: String(b.codigo_unidad_sunat || 'KGM').toUpperCase(),
            cantidad: +Number(b.cantidad || 1).toFixed(4)
        }))
    };

    if (observaciones && String(observaciones).trim()) {
        payload.observacion = String(observaciones).trim().slice(0, 250);
    }

    if (tipoDoc === '31') {
        payload.remitente = {
            tipoDoc: '6',
            numDoc: company.ruc,
            rznSocial: company.razonSocial
        };
    }

    if (documentoRelacionado?.serie && documentoRelacionado?.correlativo) {
        const tipoRel = String(documentoRelacionado.tipo_comprobante || '01');
        payload.addDocs = [{
            tipo: tipoRel,
            tipoDesc: tipoRel === '01' ? 'Factura' : (tipoRel === '03' ? 'Boleta de Venta' : 'Comprobante'),
            nro: `${documentoRelacionado.serie}-${documentoRelacionado.correlativo}`,
            emisor: company.ruc
        }];
    }

    return payload;
}

/**
 * Envía una GRE 2022 a APIsPERU y realiza polling inicial de su ticket para obtener CDR.
 */
async function enviarGreApisperu({ payloadApisperu, configEmisor, cadenaQrLocal }) {
    const { baseUrl, token } = obtenerCredencialesApisperu(configEmisor);

    if (!/^\d{6}$/.test(payloadApisperu.envio?.partida?.ubigeo || '')) {
        throw new Error('Para emitir una GRE real a SUNAT, el Ubigeo del Punto de Partida debe tener 6 dígitos (ej. 040101).');
    }
    if (!/^\d{6}$/.test(payloadApisperu.envio?.llegada?.ubigeo || '')) {
        throw new Error('Para emitir una GRE real a SUNAT, el Ubigeo del Punto de Llegada debe tener 6 dígitos.');
    }
    if (!payloadApisperu.destinatario?.numDoc) {
        throw new Error('Falta el número de documento (RUC/DNI) del destinatario de la GRE.');
    }
    const esM1L = Array.isArray(payloadApisperu.envio?.indicadores)
        && payloadApisperu.envio.indicadores.includes('SUNAT_Envio_IndicadorTrasladoVehiculoM1L');
    if (payloadApisperu.envio?.modTraslado === '02' && !esM1L) {
        if (!payloadApisperu.envio?.vehiculo?.placa) {
            throw new Error('Falta la placa del vehículo para transporte privado en la GRE.');
        }
        const chofer = payloadApisperu.envio?.choferes?.[0];
        if (!chofer?.nroDoc || !chofer?.licencia) {
            throw new Error('Falta el documento o licencia de conducir del conductor para la GRE.');
        }
    }
    if (!Array.isArray(payloadApisperu.details) || payloadApisperu.details.length === 0) {
        throw new Error('La GRE debe incluir al menos un bien a transportar.');
    }

    const sendResp = await llamarApisperuJson(baseUrl, '/despatch/send', {
        method: 'POST',
        token,
        body: payloadApisperu,
        timeoutMs: 25000
    });

    const sunatResp = sendResp.sunatResponse || {};
    if (sunatResp.success === false || sunatResp.error) {
        const err = sunatResp.error || {};
        throw new Error(`SUNAT rechazó la GRE [${err.code || 'ERR'}]: ${err.message || 'Error en envío de GRE.'}`);
    }

    const ticket = sunatResp.ticket || null;
    const xmlFirmado = sendResp.xml || null;
    const codigoHash = sendResp.hash || null;

    let cdrZipBase64 = sunatResp.cdrZip || null;
    let cdrResp = sunatResp.cdrResponse || null;
    let statusResp = null;

    if (ticket && !cdrResp) {
        for (const delayMs of [1400, 1800]) {
            await new Promise((r) => setTimeout(r, delayMs));
            try {
                statusResp = await llamarApisperuJson(
                    baseUrl,
                    `/despatch/status?ticket=${encodeURIComponent(ticket)}&ruc=${encodeURIComponent(payloadApisperu.company.ruc)}`,
                    { method: 'GET', token, timeoutMs: 12000 }
                );
                if (statusResp.cdrResponse || statusResp.error || (statusResp.code && statusResp.code !== '98')) {
                    cdrResp = statusResp.cdrResponse || null;
                    cdrZipBase64 = statusResp.cdrZip || cdrZipBase64;
                    break;
                }
            } catch {
                // Si el polling rápido falla por timeout temporal, el usuario puede consultar luego con el ticket guardado
            }
        }
    }

    if (statusResp?.error) {
        throw new Error(`SUNAT observó/rechazó la GRE [${statusResp.error.code || 'ERR'}]: ${statusResp.error.message || 'Error al procesar ticket GRE.'}`);
    }

    const aceptada = cdrResp?.accepted === true;
    const rechazadaCdr = cdrResp && cdrResp.accepted === false;
    if (rechazadaCdr) {
        throw new Error(`SUNAT rechazó la GRE [${cdrResp.code || 'CDR'}]: ${cdrResp.description || 'GRE rechazada.'}`);
    }

    const cdrXml = extraerXmlDeZipBase64(cdrZipBase64);
    const notasCdr = Array.isArray(cdrResp?.notes) && cdrResp.notes.length > 0
        ? ` | Observaciones SUNAT: ${cdrResp.notes.join('; ')}`
        : '';

    const estadoSunat = aceptada ? 'ACEPTADO' : 'PENDIENTE_ENVIO';
    const mensajeCdr = aceptada
        ? ((cdrResp?.description || 'La Guía de Remisión ha sido aceptada por SUNAT.') + notasCdr)
        : `GRE enviada a SUNAT (Ticket: ${ticket || 'pendiente'}). Usa "Consultar" en unos segundos para descargar su CDR.`;

    return {
        modo_emision: 'APISPERU',
        estado_sunat: estadoSunat,
        codigo_hash: codigoHash,
        ticket_sunat: ticket,
        mensaje_cdr: mensajeCdr,
        cadena_qr: cadenaQrLocal,
        enlace_pdf: null,
        enlace_xml: null,
        enlace_cdr: null,
        xml_firmado: xmlFirmado,
        cdr_xml: cdrXml,
        cdr_zip_base64: cdrZipBase64,
        respuesta_ose_json: {
            hash: codigoHash,
            ticket,
            send: {
                success: sunatResp.success,
                ticket
            },
            status: statusResp
                ? {
                    code: statusResp.code,
                    success: statusResp.success,
                    cdrResponse: statusResp.cdrResponse,
                    error: statusResp.error
                }
                : null,
            payload_enviado: payloadApisperu
        }
    };
}

/**
 * Consulta el ticket GRE en APIsPERU (/despatch/status) para obtener el CDR definitivo.
 */
async function consultarGreTicketApisperu(greRow, configEmisor) {
    const ticket = greRow?.ticket_sunat || greRow?.respuesta_ose_json?.ticket;
    if (!ticket) {
        throw new Error('Esta GRE no tiene un ticket de SUNAT registrado todavía. Usa "Reenviar" para enviarla nuevamente.');
    }
    const { baseUrl, token } = obtenerCredencialesApisperu(configEmisor);
    const ruc = String(configEmisor?.ruc_emisor || '').trim();
    const qs = `ticket=${encodeURIComponent(ticket)}${ruc ? `&ruc=${encodeURIComponent(ruc)}` : ''}`;

    const data = await llamarApisperuJson(baseUrl, `/despatch/status?${qs}`, {
        method: 'GET',
        token,
        timeoutMs: 15000
    });

    const cdrResp = data.cdrResponse || null;
    const aceptada = cdrResp?.accepted === true;
    const tieneError = Boolean(data.error) || (cdrResp && cdrResp.accepted === false);

    let estadoNuevo = 'PENDIENTE_ENVIO';
    if (aceptada) estadoNuevo = 'ACEPTADO';
    else if (tieneError) estadoNuevo = 'OBSERVADO';

    const cdrZipBase64 = data.cdrZip || null;
    const cdrXml = extraerXmlDeZipBase64(cdrZipBase64);
    const notasCdr = Array.isArray(cdrResp?.notes) && cdrResp.notes.length > 0
        ? ` | Observaciones SUNAT: ${cdrResp.notes.join('; ')}`
        : '';

    const mensajeCdr = data.error
        ? `SUNAT [${data.error.code || 'ERR'}]: ${data.error.message}`
        : (cdrResp?.description
            ? `${cdrResp.description}${notasCdr}`
            : (data.code === '98' ? `SUNAT sigue procesando el ticket ${ticket}. Intenta consultar en unos segundos.` : null));

    return {
        estado_sunat: estadoNuevo,
        mensaje_cdr: mensajeCdr,
        cdr_xml: cdrXml,
        cdr_zip_base64: cdrZipBase64,
        respuesta_ose_json: {
            code: data.code,
            success: data.success,
            cdrResponse: cdrResp,
            error: data.error || null
        }
    };
}

/**
 * Prueba de conectividad y token real contra APIsPERU sin emitir comprobantes fiscales en SUNAT.
 */
async function probarConexionApisperu({ configEmisor = {}, apisperuUrl, apisperuToken }) {
    const tempConfig = {
        ...configEmisor,
        ...(apisperuUrl !== undefined ? { apisperu_url: apisperuUrl } : {}),
        ...(apisperuToken !== undefined ? { apisperu_token: apisperuToken } : {})
    };
    const { baseUrl, token } = obtenerCredencialesApisperu(tempConfig);
    if (!token) {
        throw new Error('Ingresa el Token de APIsPERU antes de probar la conexión.');
    }

    // 1. Validar autorización Bearer JWT mediante /sale/qr (endpoint liviano sin requerir envío a SUNAT)
    await llamarApisperuJson(baseUrl, '/sale/qr', {
        method: 'POST',
        token,
        body: {
            ruc: String(tempConfig.ruc_emisor || '20608725394'),
            tipo: '01',
            serie: 'F001',
            numero: '1',
            emision: formatearFechaHoraPeru(),
            igv: 18,
            total: 118,
            clienteTipo: '6',
            clienteNumero: '20000000001'
        },
        timeoutMs: 12000
    }).catch((err) => {
        throw new Error(`No se pudo validar el Token con APIsPERU (${baseUrl}): ${err.message}`);
    });

    // 2. Validar opcionalmente si el certificado digital ya permite firmar XML (/invoice/xml no envía a SUNAT)
    let xmlFirmadoOk = false;
    let advertenciaCertificado = '';
    try {
        await llamarApisperuJson(baseUrl, '/invoice/xml', {
            method: 'POST',
            token,
            body: {
                ublVersion: '2.1',
                tipoOperacion: '0101',
                tipoDoc: '01',
                serie: 'F001',
                correlativo: '1',
                fechaEmision: formatearFechaHoraPeru(),
                formaPago: { moneda: 'PEN', tipo: 'Contado' },
                tipoMoneda: 'PEN',
                client: {
                    tipoDoc: '6',
                    numDoc: '20000000002',
                    rznSocial: 'CLIENTE PRUEBA S.A.C.',
                    address: { direccion: 'AV. PRUEBA 123' }
                },
                company: construirCompanyApisperu(tempConfig),
                mtoOperGravadas: 100,
                mtoIGV: 18,
                totalImpuestos: 18,
                valorVenta: 100,
                subTotal: 118,
                mtoImpVenta: 118,
                details: [{
                    codProducto: 'P001',
                    unidad: 'NIU',
                    descripcion: 'PRUEBA DE FIRMA DIGITAL',
                    cantidad: 1,
                    mtoValorUnitario: 100,
                    mtoValorVenta: 100,
                    mtoBaseIgv: 100,
                    porcentajeIgv: 18,
                    igv: 18,
                    tipAfeIgv: '10',
                    totalImpuestos: 18,
                    mtoPrecioUnitario: 118
                }],
                legends: [{ code: '1000', value: 'SON CIENTO DIECIOCHO CON 00/100 SOLES' }]
            },
            timeoutMs: 15000
        });
        xmlFirmadoOk = true;
    } catch (err) {
        advertenciaCertificado = err.message;
    }

    return {
        exito: true,
        modo: 'APISPERU',
        xml_firmado_ok: xmlFirmadoOk,
        mensaje: xmlFirmadoOk
            ? `Conexión exitosa con APIsPERU (${baseUrl}). Token válido y certificado digital listo para firmar XML UBL 2.1 para RUC ${tempConfig.ruc_emisor}.`
            : `Token de APIsPERU válido y servidor conectado (${baseUrl}), pero falta completar el certificado digital en el panel de APIsPERU (${advertenciaCertificado}).`
    };
}

module.exports = {
    DEFAULT_APISPERU_URL,
    resolverModoIntegracion,
    obtenerCredencialesApisperu,
    formatearFechaHoraPeru,
    formatearFechaSoloPeru,
    extraerXmlDeZipBase64,
    construirCompanyApisperu,
    construirClientApisperu,
    construirPayloadApisperuComprobante,
    enviarComprobanteApisperu,
    construirPayloadApisperuGre,
    enviarGreApisperu,
    consultarGreTicketApisperu,
    llamarApisperuJson,
    probarConexionApisperu
};
