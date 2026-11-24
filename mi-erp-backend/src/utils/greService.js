const {
    resolverModoIntegracion,
    construirPayloadApisperuGre,
    enviarGreApisperu,
    consultarGreTicketApisperu,
    normalizarUnidadSunat
} = require('./apisperuService');

function esModoDemoNubefact(configEmisor = {}) {
    const modo = resolverModoIntegracion(configEmisor);
    if (modo === 'APISPERU') return false;

    const rutaEnv = process.env.NUBEFACT_RUTA || configEmisor?.nubefact_ruta || '';
    const tokenEnv = process.env.NUBEFACT_TOKEN || configEmisor?.nubefact_token || '';

    return (
        !rutaEnv ||
        !tokenEnv ||
        modo === 'DEMO_NUBEFACT' ||
        rutaEnv.includes('demo-integrada-erp') ||
        tokenEnv === 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO'
    );
}

function obtenerCredencialesNubefact(configEmisor = {}) {
    const ruta = (process.env.NUBEFACT_RUTA || configEmisor?.nubefact_ruta || '').trim();
    const token = (process.env.NUBEFACT_TOKEN || configEmisor?.nubefact_token || '').trim();
    const authHeader = token.startsWith('Token ') || token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;
    return { ruta, token, authHeader };
}

function formatearFechaLimaDDMMYYYY(fechaInput = null) {
    if (typeof fechaInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaInput.trim())) {
        const [y, m, d] = fechaInput.trim().split('-');
        return `${d}-${m}-${y}`;
    }
    const iso = new Date(fechaInput || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
}

function mapearMotivoTrasladoSunat(motivo = 'Venta') {
    const raw = String(motivo || '').trim();
    if (/^\d{2}$/.test(raw)) return raw;
    const lower = raw.toLowerCase();
    if (lower.includes('compra')) return '02';
    if (lower.includes('tercero')) return '03';
    if (lower.includes('establecimiento') || lower.includes('traslado interno')) return '04';
    if (lower.includes('consignaci')) return '05';
    if (lower.includes('devoluci')) return '06';
    if (lower.includes('transformad') || lower.includes('recojo')) return '07';
    if (lower.includes('importaci')) return '08';
    if (lower.includes('exportaci')) return '09';
    if (lower.includes('confirmaci')) return '14';
    if (lower.includes('itinerante')) return '18';
    if (lower.includes('zona primaria')) return '19';
    if (lower.includes('otro')) return '13';
    return '01'; // Venta
}

function mapearTipoDocConductor(tipoDoc = '') {
    const t = String(tipoDoc || '').trim().toUpperCase();
    if (t === '1' || t.includes('DNI') || t.includes('IDENTIDAD')) return '1';
    if (t === '4' || t.includes('EXTRANJ')) return '4';
    if (t === '7' || t.includes('PASAPORTE')) return '7';
    if (t === '6' || t.includes('RUC')) return '6';
    return '1';
}

function dividirNombreConductor(nombreCompleto = '') {
    const partes = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return { nombre: 'CONDUCTOR', apellidos: 'PRINCIPAL' };
    if (partes.length === 1) return { nombre: partes[0], apellidos: partes[0] };
    if (partes.length === 2) return { nombre: partes[0], apellidos: partes[1] };
    // En catálogos de Perú suelen venir "APELLIDO_P APELLIDO_M NOMBRES..."
    return {
        apellidos: partes.slice(0, 2).join(' '),
        nombre: partes.slice(2).join(' ')
    };
}

function construirPayloadNubefactGre({
    tipoGre = 'REMITENTE',
    serie,
    correlativo,
    destTipo = '6',
    destNum = '',
    destRazon = '',
    destDireccion = '',
    destEmail = '',
    fechaInicio,
    motivoTraslado = 'Venta',
    pesoCalculado = 0,
    unidadPeso = 'KGM',
    numeroBultos = 1,
    modalidadTraslado = 'Privado',
    partidaUbigeo = '',
    partidaDireccion = '',
    llegadaUbigeo = '',
    llegadaDir = '',
    vehPlaca = '',
    condTipoDoc = '1',
    condNumDoc = '',
    condNombres = '',
    condLicencia = '',
    observaciones = '',
    documentoRelacionado = null,
    bienes = [],
    configEmisor = {}
}) {
    const tipoComprobanteNubefact = tipoGre === 'TRANSPORTISTA' ? 8 : 7;
    const tipoTransporte = String(modalidadTraslado || '').toLowerCase().includes('p') &&
        String(modalidadTraslado || '').toLowerCase().includes('blic')
        ? '01'
        : '02';
    const { nombre, apellidos } = dividirNombreConductor(condNombres);
    const placaLimpia = String(vehPlaca || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const motivoCodigo = mapearMotivoTrasladoSunat(motivoTraslado);

    const payload = {
        operacion: 'generar_guia',
        tipo_de_comprobante: tipoComprobanteNubefact,
        serie,
        numero: Number(correlativo),
        cliente_tipo_de_documento: Number(destTipo) || 6,
        cliente_numero_de_documento: String(destNum || '').trim(),
        cliente_denominacion: String(destRazon || '').trim(),
        cliente_direccion: String(destDireccion || llegadaDir || '').trim(),
        cliente_email: String(destEmail || '').trim(),
        fecha_de_emision: formatearFechaLimaDDMMYYYY(),
        fecha_de_inicio_de_traslado: formatearFechaLimaDDMMYYYY(fechaInicio),
        motivo_de_traslado: motivoCodigo,
        motivo_de_traslado_otros_descripcion: motivoCodigo === '13' ? String(motivoTraslado || 'Otros').slice(0, 70) : '',
        observaciones: String(observaciones || '').trim(),
        peso_bruto_total: Number(pesoCalculado || 0).toFixed(2),
        peso_bruto_unidad_de_medida: String(unidadPeso || 'KGM').toUpperCase(),
        numero_de_bultos: String(Math.max(1, parseInt(numeroBultos, 10) || 1)),
        tipo_de_transporte: tipoTransporte,
        transportista_placa_numero: placaLimpia,
        conductor_documento_tipo: mapearTipoDocConductor(condTipoDoc),
        conductor_documento_numero: String(condNumDoc || '').trim(),
        conductor_nombre: nombre,
        conductor_apellidos: apellidos,
        conductor_denominacion: String(condNombres || '').trim(),
        conductor_numero_licencia: String(condLicencia || '').trim().toUpperCase(),
        punto_de_partida_ubigeo: String(partidaUbigeo || '').trim(),
        punto_de_partida_direccion: String(partidaDireccion || '').trim(),
        punto_de_partida_codigo_establecimiento_sunat: '0000',
        punto_de_llegada_ubigeo: String(llegadaUbigeo || '').trim(),
        punto_de_llegada_direccion: String(llegadaDir || '').trim(),
        punto_de_llegada_codigo_establecimiento_sunat: '0000',
        enviar_automaticamente_a_la_sunat: configEmisor?.enviar_automaticamente_sunat !== false,
        enviar_automaticamente_al_cliente: Boolean(destEmail && configEmisor?.enviar_automaticamente_cliente !== false),
        items: (Array.isArray(bienes) ? bienes : []).map((b, idx) => ({
            unidad_de_medida: String(b.codigo_unidad_sunat || 'KGM').toUpperCase(),
            codigo: String(b.codigo_bien || `BIEN-${idx + 1}`).trim(),
            descripcion: String(b.descripcion || 'PRODUCTO').trim(),
            cantidad: Number(b.cantidad || 1)
        }))
    };

    if (documentoRelacionado?.serie && documentoRelacionado?.correlativo) {
        payload.documento_relacionado = [
            {
                tipo: String(documentoRelacionado.tipo_comprobante || '01'),
                serie: String(documentoRelacionado.serie),
                numero: String(documentoRelacionado.correlativo)
            }
        ];
    }

    return payload;
}

async function llamarNubefactGre(configEmisor, payload, timeoutMs = 15000) {
    const { ruta, authHeader } = obtenerCredencialesNubefact(configEmisor);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(ruta, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.errors) {
            throw new Error(data.errors || data.mensaje || `Error HTTP ${resp.status} desde NubeFact GRE`);
        }
        return data;
    } catch (err) {
        const msg = err?.name === 'AbortError'
            ? `Tiempo de espera agotado (${timeoutMs / 1000}s) al comunicar con NubeFact GRE.`
            : err.message;
        throw new Error(msg);
    } finally {
        clearTimeout(timeout);
    }
}

function validarDatosMinimosGreReal(payload) {
    if (!/^\d{6}$/.test(payload.punto_de_partida_ubigeo)) {
        throw new Error('Para emitir una GRE real a SUNAT, el Ubigeo del Punto de Partida debe tener 6 dígitos (ej. 040101).');
    }
    if (!/^\d{6}$/.test(payload.punto_de_llegada_ubigeo)) {
        throw new Error('Para emitir una GRE real a SUNAT, el Ubigeo del Punto de Llegada debe tener 6 dígitos.');
    }
    if (!payload.cliente_numero_de_documento) {
        throw new Error('Falta el número de documento (RUC/DNI) del destinatario de la GRE.');
    }
    if (payload.tipo_de_transporte === '02') {
        if (!payload.transportista_placa_numero) {
            throw new Error('Falta la placa del vehículo para transporte privado en la GRE.');
        }
        if (!payload.conductor_documento_numero || !payload.conductor_numero_licencia) {
            throw new Error('Falta el documento o licencia de conducir del conductor para la GRE.');
        }
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        throw new Error('La GRE debe incluir al menos un bien a transportar.');
    }
}

async function enviarGreAOse({ payloadNubefact, apisperuParams = null, configEmisor, cadenaQrLocal }) {
    const modo = resolverModoIntegracion(configEmisor);

    if (modo === 'APISPERU' && apisperuParams) {
        const payloadApisperu = construirPayloadApisperuGre(apisperuParams);
        return await enviarGreApisperu({
            payloadApisperu,
            configEmisor,
            cadenaQrLocal
        });
    }

    if (esModoDemoNubefact(configEmisor)) {
        return {
            modo_emision: 'DEMO_NUBEFACT',
            estado_sunat: 'ACEPTADO',
            codigo_hash: null,
            ticket_sunat: null,
            mensaje_cdr: 'GRE emitida en modo DEMO Sandbox (sin envío fiscal a SUNAT).',
            cadena_qr: cadenaQrLocal,
            enlace_pdf: null,
            enlace_xml: null,
            enlace_cdr: null,
            xml_firmado: null,
            cdr_xml: null,
            cdr_zip_base64: null,
            respuesta_ose_json: {
                modo: 'DEMO_NUBEFACT_GRE',
                aceptada_por_sunat: true,
                payload_enviado: payloadNubefact
            }
        };
    }

    validarDatosMinimosGreReal(payloadNubefact);
    let data = await llamarNubefactGre(configEmisor, payloadNubefact, 15000);

    // Las GRE en SUNAT son asíncronas: si aún está en proceso, consultar una vez tras 1.2s
    if (data.aceptada_por_sunat !== true) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
            const consulta = await llamarNubefactGre(configEmisor, {
                operacion: 'consultar_guia',
                tipo_de_comprobante: payloadNubefact.tipo_de_comprobante,
                serie: payloadNubefact.serie,
                numero: String(payloadNubefact.numero)
            }, 10000);
            data = { ...data, ...consulta };
        } catch {
            // Si aún está procesando en SUNAT, quedará como PENDIENTE_ENVIO para consultar luego
        }
    }

    const aceptada = data.aceptada_por_sunat === true;
    return {
        modo_emision: 'NUBEFACT_REAL',
        estado_sunat: aceptada ? 'ACEPTADO' : 'PENDIENTE_ENVIO',
        codigo_hash: data.codigo_hash || null,
        ticket_sunat: null,
        mensaje_cdr: data.sunat_description || data.mensaje || (aceptada ? 'La guía de remisión ha sido aceptada por SUNAT.' : 'GRE enviada a NubeFact; esperando confirmación CDR de SUNAT.'),
        cadena_qr: data.cadena_para_codigo_qr || cadenaQrLocal,
        enlace_pdf: data.enlace_del_pdf || data.enlace || null,
        enlace_xml: data.enlace_del_xml || null,
        enlace_cdr: data.enlace_del_cdr || null,
        xml_firmado: null,
        cdr_xml: null,
        cdr_zip_base64: null,
        respuesta_ose_json: {
            ...data,
            payload_enviado: payloadNubefact
        }
    };
}

async function obtenerCatalogosGre(dbClient) {
    const [puntos, vehiculos, conductores, bienes] = await Promise.all([
        dbClient.query('SELECT * FROM gre_puntos_partida WHERE activo = TRUE ORDER BY id_punto ASC'),
        dbClient.query('SELECT * FROM gre_vehiculos WHERE activo = TRUE ORDER BY id_vehiculo ASC'),
        dbClient.query('SELECT * FROM gre_conductores WHERE activo = TRUE ORDER BY id_conductor ASC'),
        dbClient.query('SELECT * FROM gre_bienes_frecuentes ORDER BY id_bien_frecuente DESC')
    ]);
    return {
        puntos_partida: puntos.rows,
        vehiculos: vehiculos.rows,
        conductores: conductores.rows,
        bienes_frecuentes: bienes.rows
    };
}

function armarApisperuGreParams({
    tipoGre, serie, correlativo, destTipo, destNum, destRazon, destDireccion, destEmail,
    fechaInicio, motivoTraslado, pesoCalculado, unidadPeso, numeroBultos,
    modalidadTraslado, partidaUbigeo, partidaDireccion, llegadaUbigeo, llegadaDir,
    vehPlaca, vehEntidad, vehNumAutoriz, condTipoDoc, condNumDoc, condNombres, condLicencia,
    transportistaRuc = '', transportistaRazon = '', transportistaMtc = '',
    remitenteTipoDoc = '6', remitenteNumDoc = '', remitenteRazonSocial = '',
    observaciones, trasladoVehiculoM1L, retornoEnvasesVacios, retornoVehiculoVacio, transbordoProgramado,
    documentoRelacionado, bienes, configEmisor
}) {
    const tipoTransporte = String(modalidadTraslado || '').toLowerCase().includes('p') &&
        String(modalidadTraslado || '').toLowerCase().includes('blic')
        ? '01'
        : '02';
    const { nombre, apellidos } = dividirNombreConductor(condNombres);
    return {
        tipoGre,
        serie,
        correlativo,
        destTipo,
        destNum,
        destRazon,
        destDireccion,
        destEmail,
        fechaInicio,
        motivoCodigo: mapearMotivoTrasladoSunat(motivoTraslado),
        desTraslado: motivoTraslado || 'Venta',
        pesoCalculado,
        unidadPeso: normalizarUnidadSunat(unidadPeso, 'KGM'),
        numeroBultos,
        tipoTransporte,
        partidaUbigeo,
        partidaDireccion,
        llegadaUbigeo,
        llegadaDir,
        vehPlaca,
        vehEntidad,
        vehNumAutoriz,
        condTipoDoc: mapearTipoDocConductor(condTipoDoc),
        condNumDoc,
        condNombre: nombre,
        condApellidos: apellidos,
        condLicencia,
        transportistaRuc,
        transportistaRazon,
        transportistaMtc,
        remitenteTipoDoc,
        remitenteNumDoc,
        remitenteRazonSocial,
        observaciones,
        trasladoVehiculoM1L: Boolean(trasladoVehiculoM1L),
        retornoEnvasesVacios: Boolean(retornoEnvasesVacios),
        retornoVehiculoVacio: Boolean(retornoVehiculoVacio),
        transbordoProgramado: Boolean(transbordoProgramado),
        documentoRelacionado,
        bienes,
        configEmisor
    };
}

/**
 * Emite una Guía de Remisión Electrónica (enviando a APIsPERU o NubeFact según configuración)
 * y la vincula automáticamente con el comprobante (Factura 01) emitido si aplica.
 */
async function crearGreInterna(client, {
    id_comprobante = null,
    id_pedido = null,
    cliente = null,
    items = [],
    peso_bruto_total = null,
    gre = {},
    configEmisor = {},
    idUsuario = null,
    noLanzarSiFallaOse = false
}) {
    const tipoGre = gre.tipo_gre === 'TRANSPORTISTA' ? 'TRANSPORTISTA' : 'REMITENTE';
    const tipoCodSunat = tipoGre === 'TRANSPORTISTA' ? '31' : '09';
    const serie = String(
        gre.serie ||
        (tipoGre === 'TRANSPORTISTA'
            ? (configEmisor?.serie_gre_transportista || 'V001')
            : (configEmisor?.serie_gre_remitente || 'T001'))
    ).trim().toUpperCase();

    const resSerie = await client.query(
        'SELECT ultimo_correlativo FROM series_sunat WHERE serie = $1 FOR UPDATE',
        [serie]
    );

    let correlativo = 1;
    if (resSerie.rows.length === 0) {
        await client.query(
            'INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES ($1, $2, $3)',
            [tipoCodSunat, serie, correlativo]
        );
    } else {
        correlativo = resSerie.rows[0].ultimo_correlativo + 1;
        await client.query(
            'UPDATE series_sunat SET ultimo_correlativo = $1 WHERE serie = $2',
            [correlativo, serie]
        );
    }

    // Punto de partida
    let partidaUbigeo = gre.punto_partida_ubigeo || '';
    let partidaDireccion = gre.punto_partida_direccion || '';
    if (gre.id_punto_partida) {
        const ptRes = await client.query('SELECT * FROM gre_puntos_partida WHERE id_punto = $1', [gre.id_punto_partida]);
        if (ptRes.rows.length > 0) {
            partidaUbigeo = ptRes.rows[0].ubigeo;
            partidaDireccion = ptRes.rows[0].domicilio;
        }
    }
    if (!partidaDireccion) {
        const defPt = await client.query('SELECT * FROM gre_puntos_partida WHERE activo = TRUE ORDER BY id_punto ASC LIMIT 1');
        if (defPt.rows.length > 0) {
            partidaUbigeo = defPt.rows[0].ubigeo;
            partidaDireccion = defPt.rows[0].domicilio;
        } else {
            partidaUbigeo = configEmisor?.ubigeo || '040101';
            partidaDireccion = configEmisor?.direccion_fiscal || 'OTR. ZONA N 24 Y 25 MZ. 12 P.J. SEMIRURAL PACHACUTEC AREQUIPA';
        }
    }

    const modalidadTraslado = gre.modalidad_traslado || 'Privado';
    const esTransportePublico = String(modalidadTraslado || '').toLowerCase().includes('p') &&
        String(modalidadTraslado || '').toLowerCase().includes('blic');
    const esM1L = Boolean(gre.traslado_vehiculo_m1_l);
    const requiereVehiculoYChofer = (!esTransportePublico && !esM1L) || tipoGre === 'TRANSPORTISTA';

    // Vehículo frecuente o manual (no autocompletar en transporte público ni en M1/L)
    let vehPlaca = gre.vehiculo_placa || '';
    let vehEntidad = gre.vehiculo_entidad_autoriz || '';
    let vehNumAutoriz = gre.vehiculo_num_autoriz || '';
    if (gre.id_vehiculo) {
        const vRes = await client.query('SELECT * FROM gre_vehiculos WHERE id_vehiculo = $1', [gre.id_vehiculo]);
        if (vRes.rows.length > 0) {
            vehPlaca = vRes.rows[0].placa;
            vehEntidad = vRes.rows[0].entidad_emisora || '';
            vehNumAutoriz = vRes.rows[0].numero_autorizacion || '';
        }
    } else if (!vehPlaca && requiereVehiculoYChofer) {
        const defV = await client.query('SELECT * FROM gre_vehiculos WHERE activo = TRUE ORDER BY id_vehiculo ASC LIMIT 1');
        if (defV.rows.length > 0) vehPlaca = defV.rows[0].placa;
    }

    // Conductor frecuente o manual
    let condTipoDoc = gre.conductor_tipo_doc || 'DOCUMENTO NACIONAL DE IDENTIDAD';
    let condNumDoc = gre.conductor_num_doc || '';
    let condNombres = gre.conductor_nombres || '';
    let condLicencia = gre.conductor_licencia || '';
    if (gre.id_conductor) {
        const cRes = await client.query('SELECT * FROM gre_conductores WHERE id_conductor = $1', [gre.id_conductor]);
        if (cRes.rows.length > 0) {
            condTipoDoc = cRes.rows[0].tipo_documento;
            condNumDoc = cRes.rows[0].numero_documento;
            condNombres = cRes.rows[0].apellidos_nombres;
            condLicencia = cRes.rows[0].licencia;
        }
    } else if (!condNumDoc && !condNombres && requiereVehiculoYChofer) {
        const defC = await client.query('SELECT * FROM gre_conductores WHERE activo = TRUE ORDER BY id_conductor ASC LIMIT 1');
        if (defC.rows.length > 0) {
            condTipoDoc = defC.rows[0].tipo_documento;
            condNumDoc = defC.rows[0].numero_documento;
            condNombres = defC.rows[0].apellidos_nombres;
            condLicencia = defC.rows[0].licencia;
        }
    }

    const transportistaRuc = String(gre.transportista_ruc || '').trim();
    const transportistaRazon = String(gre.transportista_razon_social || '').trim();
    const transportistaMtc = String(gre.transportista_nro_mtc || '').trim();
    const remitenteTipoDoc = String(gre.remitente_tipo_doc || '6').trim();
    const remitenteNumDoc = String(gre.remitente_num_doc || '').trim();
    const remitenteRazonSocial = String(gre.remitente_razon_social || '').trim();
    const numeroBultos = Math.max(1, parseInt(gre.numero_de_bultos, 10) || 1);
    const observacionesGre = String(gre.observaciones || '').trim();

    const bienes = Array.isArray(gre.bienes) && gre.bienes.length > 0
        ? gre.bienes.map((b, idx) => ({
            ...b,
            orden: b.orden || idx + 1,
            codigo_unidad_sunat: normalizarUnidadSunat(b.codigo_unidad_sunat || b.unidad_medida, 'KGM')
        }))
        : (Array.isArray(items) ? items : []).map((it, idx) => {
            const codigoUnidadSunat = normalizarUnidadSunat(
                it.codigo_unidad_sunat || (it.unidad_medida ? it.unidad_medida : 'KGM'),
                'KGM'
            );
            const unidadMedida = it.unidad_medida || (codigoUnidadSunat === 'KGM' ? 'Kilogramo' : 'Unidad');
            const cant = Number(it.cantidad);
            const peso = Number(it.peso);
            const esUnidadPeso = codigoUnidadSunat === 'KGM' || codigoUnidadSunat === 'GRM';
            const cantidadFinal = cant > 0 ? cant : (esUnidadPeso && peso > 0 ? peso : 1);
            return {
                orden: idx + 1,
                bien_normalizado: Boolean(it.bien_normalizado),
                codigo_bien: it.codigo_bien || it.codigo || it.sku || '',
                codigo_subpartida: it.codigo_subpartida || '',
                codigo_sunat: it.codigo_sunat || '',
                codigo_gtin: it.codigo_gtin || '',
                descripcion: it.descripcion || it.nombre || 'PRODUCTO',
                unidad_medida: unidadMedida,
                codigo_unidad_sunat: codigoUnidadSunat,
                cantidad: cantidadFinal
            };
        });

    if (Array.isArray(gre.bienes_guardar_frecuente)) {
        for (const bf of gre.bienes_guardar_frecuente) {
            if (bf?.descripcion) {
                await client.query(`
                    INSERT INTO gre_bienes_frecuentes (
                        bien_normalizado, codigo_bien, codigo_subpartida, codigo_sunat, codigo_gtin, descripcion, unidad_medida
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7);
                `, [
                    Boolean(bf.bien_normalizado),
                    bf.codigo_bien || null,
                    bf.codigo_subpartida || null,
                    bf.codigo_sunat || null,
                    bf.codigo_gtin || null,
                    bf.descripcion.trim(),
                    bf.codigo_unidad_sunat || bf.unidad_medida || 'KGM'
                ]);
            }
        }
    }

    const pesoItems = (Array.isArray(items) ? items : [])
        .reduce((acc, it) => acc + (Number(it.peso) || 0), 0);
    const pesoCalculado = Number(peso_bruto_total) > 0
        ? +Number(peso_bruto_total).toFixed(2)
        : +(pesoItems > 0
            ? pesoItems
            : bienes.reduce((acc, b) => acc + (Number(b.cantidad) || 0), 0)).toFixed(2);

    const destTipo = gre.destinatario_tipo_doc || cliente?.tipo_documento || '6';
    const destNum = gre.destinatario_num_doc || cliente?.numero_documento || '';
    const destRazon = gre.destinatario_razon_social || cliente?.razon_social_o_nombre || '';
    const llegadaDir = gre.punto_llegada_direccion || cliente?.direccion || 'DIRECCIÓN DEL CLIENTE';
    const llegadaUbigeo = gre.punto_llegada_ubigeo || '';
    const fechaInicio = gre.fecha_inicio_traslado || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const motivoTraslado = gre.motivo_traslado || 'Venta';
    const modalidadTraslado = gre.modalidad_traslado || 'Privado';

    let docRel = null;
    if (id_comprobante) {
        const resDocRel = await client.query(
            'SELECT tipo_comprobante, serie, correlativo FROM comprobantes WHERE id_comprobante = $1',
            [id_comprobante]
        );
        if (resDocRel.rows.length > 0) docRel = resDocRel.rows[0];
    }

    const rucEmisor = configEmisor?.ruc_emisor || '20608725394';
    const cadenaQrLocal = `https://e-factura.sunat.gob.pe/v1/contribuyente/gre/comprobantes/descargaqr?hashqr=${rucEmisor}-${tipoCodSunat}-${serie}-${String(correlativo).padStart(8, '0')}`;

    const grePayloadParams = {
        tipoGre,
        serie,
        correlativo,
        destTipo,
        destNum,
        destRazon,
        destDireccion: cliente?.direccion || llegadaDir,
        destEmail: cliente?.email || '',
        fechaInicio,
        motivoTraslado,
        pesoCalculado,
        unidadPeso: gre.unidad_peso_bruto || 'KGM',
        numeroBultos: gre.numero_de_bultos || 1,
        modalidadTraslado,
        partidaUbigeo,
        partidaDireccion,
        llegadaUbigeo,
        llegadaDir,
        vehPlaca,
        vehEntidad,
        vehNumAutoriz,
        condTipoDoc,
        condNumDoc,
        condNombres,
        condLicencia,
        observaciones: gre.observaciones || '',
        trasladoVehiculoM1L: gre.traslado_vehiculo_m1_l,
        retornoEnvasesVacios: gre.retorno_envases_vacios,
        retornoVehiculoVacio: gre.retorno_vehiculo_vacio,
        transbordoProgramado: gre.transbordo_programado,
        documentoRelacionado: docRel,
        bienes,
        configEmisor
    };

    const payloadNubefact = construirPayloadNubefactGre(grePayloadParams);
    const apisperuParams = armarApisperuGreParams(grePayloadParams);

    let resultadoOse;
    try {
        resultadoOse = await enviarGreAOse({
            payloadNubefact,
            apisperuParams,
            configEmisor,
            cadenaQrLocal
        });
    } catch (err) {
        if (!noLanzarSiFallaOse) {
            throw err;
        }
        // Si la Factura (01) ya fue aceptada por SUNAT, guardamos la GRE como OBSERVADO para reintentar sin perder la factura
        const modoFallback = resolverModoIntegracion(configEmisor);
        resultadoOse = {
            modo_emision: modoFallback,
            estado_sunat: 'OBSERVADO',
            codigo_hash: null,
            ticket_sunat: null,
            mensaje_cdr: err.message,
            cadena_qr: cadenaQrLocal,
            enlace_pdf: null,
            enlace_xml: null,
            enlace_cdr: null,
            xml_firmado: null,
            cdr_xml: null,
            cdr_zip_base64: null,
            respuesta_ose_json: {
                errors: err.message,
                payload_enviado: modoFallback === 'APISPERU' ? apisperuParams : payloadNubefact
            }
        };
    }

    const { rows } = await client.query(`
        INSERT INTO guias_remision (
            id_comprobante, id_pedido, id_cliente,
            tipo_gre, serie, correlativo, comercio_exterior, motivo_traslado,
            fecha_inicio_traslado,
            punto_partida_ubigeo, punto_partida_direccion,
            punto_llegada_ubigeo, punto_llegada_direccion,
            destinatario_tipo_doc, destinatario_num_doc, destinatario_razon_social,
            unidad_peso_bruto, peso_bruto_total, modalidad_traslado,
            retorno_envases_vacios, retorno_vehiculo_vacio, transbordo_programado, traslado_vehiculo_m1_l,
            vehiculo_placa, vehiculo_entidad_autoriz, vehiculo_num_autoriz,
            conductor_tipo_doc, conductor_num_doc, conductor_nombres, conductor_licencia,
            bienes_json, cadena_qr, estado_sunat,
            codigo_hash, ticket_sunat, mensaje_cdr, enlace_pdf, enlace_xml, enlace_cdr,
            xml_firmado, cdr_xml, cdr_zip_base64,
            modo_emision, respuesta_ose_json,
            documento_relacionado_tipo, documento_relacionado_serie, documento_relacionado_numero,
            creado_por
        )
        VALUES (
            $1, $2, $3,
            $4, $5, $6, $7, $8,
            $9::date,
            $10, $11,
            $12, $13,
            $14, $15, $16,
            $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26,
            $27, $28, $29, $30,
            $31, $32, $33,
            $34, $35, $36, $37, $38, $39,
            $40, $41, $42,
            $43, $44,
            $45, $46, $47,
            $48
        )
        RETURNING *, TO_CHAR(fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso;
    `, [
        id_comprobante,
        id_pedido,
        cliente?.id_cliente || null,
        tipoGre,
        serie,
        correlativo,
        Boolean(gre.comercio_exterior),
        motivoTraslado,
        fechaInicio,
        partidaUbigeo,
        partidaDireccion,
        llegadaUbigeo,
        llegadaDir,
        destTipo,
        destNum,
        destRazon,
        gre.unidad_peso_bruto || 'KGM',
        pesoCalculado,
        modalidadTraslado,
        Boolean(gre.retorno_envases_vacios),
        Boolean(gre.retorno_vehiculo_vacio),
        Boolean(gre.transbordo_programado),
        Boolean(gre.traslado_vehiculo_m1_l),
        vehPlaca,
        vehEntidad,
        vehNumAutoriz,
        condTipoDoc,
        condNumDoc,
        condNombres,
        condLicencia,
        JSON.stringify(bienes),
        resultadoOse.cadena_qr,
        resultadoOse.estado_sunat,
        resultadoOse.codigo_hash,
        resultadoOse.ticket_sunat || null,
        resultadoOse.mensaje_cdr,
        resultadoOse.enlace_pdf,
        resultadoOse.enlace_xml,
        resultadoOse.enlace_cdr,
        resultadoOse.xml_firmado || null,
        resultadoOse.cdr_xml || null,
        resultadoOse.cdr_zip_base64 || null,
        resultadoOse.modo_emision,
        JSON.stringify(resultadoOse.respuesta_ose_json || {}),
        docRel?.tipo_comprobante || null,
        docRel?.serie || null,
        docRel?.correlativo ? Number(docRel.correlativo) : null,
        idUsuario
    ]);

    const greCreada = rows[0];
    if ((greCreada.xml_firmado && !greCreada.enlace_xml) || ((greCreada.cdr_xml || greCreada.cdr_zip_base64) && !greCreada.enlace_cdr)) {
        const xmlPath = greCreada.xml_firmado ? `/api/facturacion/gre/${greCreada.id_gre}/xml` : null;
        const cdrPath = (greCreada.cdr_xml || greCreada.cdr_zip_base64) ? `/api/facturacion/gre/${greCreada.id_gre}/cdr` : null;
        const updGre = await client.query(`
            UPDATE guias_remision
            SET enlace_xml = COALESCE(enlace_xml, $1),
                enlace_cdr = COALESCE(enlace_cdr, $2)
            WHERE id_gre = $3
            RETURNING *, TO_CHAR(fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso;
        `, [xmlPath, cdrPath, greCreada.id_gre]);
        return updGre.rows[0];
    }

    return greCreada;
}

/**
 * Consulta el estado en APIsPERU o NubeFact de una GRE ya emitida y actualiza su CDR/estado.
 */
async function consultarGreEnNubefact(dbPool, idGre, configEmisor) {
    const resGre = await dbPool.query('SELECT * FROM guias_remision WHERE id_gre = $1', [idGre]);
    if (resGre.rows.length === 0) {
        throw new Error('Guía de Remisión no encontrada.');
    }
    const greRow = resGre.rows[0];
    if (greRow.modo_emision === 'DEMO_NUBEFACT' || resolverModoIntegracion(configEmisor) === 'DEMO_NUBEFACT') {
        return greRow;
    }

    if (greRow.modo_emision === 'APISPERU' || resolverModoIntegracion(configEmisor) === 'APISPERU') {
        const resTicket = await consultarGreTicketApisperu(greRow, configEmisor);
        const enlaceCdrNuevo = (resTicket.cdr_xml || resTicket.cdr_zip_base64)
            ? `/api/facturacion/gre/${idGre}/cdr`
            : null;
        const enlaceXmlNuevo = greRow.xml_firmado ? `/api/facturacion/gre/${idGre}/xml` : null;

        const { rows } = await dbPool.query(`
            UPDATE guias_remision
            SET estado_sunat = $1,
                mensaje_cdr = COALESCE($2, mensaje_cdr),
                cdr_xml = COALESCE($3, cdr_xml),
                cdr_zip_base64 = COALESCE($4, cdr_zip_base64),
                enlace_xml = COALESCE(enlace_xml, $5),
                enlace_cdr = COALESCE(enlace_cdr, $6),
                respuesta_ose_json = COALESCE(respuesta_ose_json, '{}'::jsonb) || $7::jsonb
            WHERE id_gre = $8
            RETURNING *, TO_CHAR(fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso;
        `, [
            resTicket.estado_sunat,
            resTicket.mensaje_cdr,
            resTicket.cdr_xml,
            resTicket.cdr_zip_base64,
            enlaceXmlNuevo,
            enlaceCdrNuevo,
            JSON.stringify({ status: resTicket.respuesta_ose_json }),
            idGre
        ]);
        return rows[0];
    }

    const tipoComp = greRow.tipo_gre === 'TRANSPORTISTA' ? 8 : 7;
    const data = await llamarNubefactGre(configEmisor, {
        operacion: 'consultar_guia',
        tipo_de_comprobante: tipoComp,
        serie: greRow.serie,
        numero: String(greRow.correlativo)
    }, 12000);

    const aceptada = data.aceptada_por_sunat === true;
    const estadoNuevo = aceptada ? 'ACEPTADO' : (data.errors ? 'OBSERVADO' : 'PENDIENTE_ENVIO');

    const { rows } = await dbPool.query(`
        UPDATE guias_remision
        SET estado_sunat = $1,
            codigo_hash = COALESCE($2, codigo_hash),
            mensaje_cdr = COALESCE($3, mensaje_cdr),
            cadena_qr = COALESCE($4, cadena_qr),
            enlace_pdf = COALESCE($5, enlace_pdf),
            enlace_xml = COALESCE($6, enlace_xml),
            enlace_cdr = COALESCE($7, enlace_cdr),
            respuesta_ose_json = COALESCE(respuesta_ose_json, '{}'::jsonb) || $8::jsonb
        WHERE id_gre = $9
        RETURNING *, TO_CHAR(fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso;
    `, [
        estadoNuevo,
        data.codigo_hash || null,
        data.sunat_description || data.mensaje || null,
        data.cadena_para_codigo_qr || null,
        data.enlace_del_pdf || data.enlace || null,
        data.enlace_del_xml || null,
        data.enlace_del_cdr || null,
        JSON.stringify(data),
        idGre
    ]);
    return rows[0];
}

/**
 * Reenvía a APIsPERU o NubeFact una GRE que quedó en estado OBSERVADO o PENDIENTE_ENVIO.
 */
async function reenviarGreEnNubefact(dbPool, idGre, configEmisor) {
    const resGre = await dbPool.query(`
        SELECT g.*, TO_CHAR(g.fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso,
               c.email AS cliente_email, c.direccion AS cliente_direccion
        FROM guias_remision g
        LEFT JOIN clientes c ON g.id_cliente = c.id_cliente
        WHERE g.id_gre = $1
    `, [idGre]);
    if (resGre.rows.length === 0) {
        throw new Error('Guía de Remisión no encontrada.');
    }
    const g = resGre.rows[0];
    const docRel = g.documento_relacionado_serie && g.documento_relacionado_numero
        ? {
            tipo_comprobante: g.documento_relacionado_tipo || '01',
            serie: g.documento_relacionado_serie,
            correlativo: g.documento_relacionado_numero
        }
        : null;

    const grePayloadParams = {
        tipoGre: g.tipo_gre,
        serie: g.serie,
        correlativo: g.correlativo,
        destTipo: g.destinatario_tipo_doc,
        destNum: g.destinatario_num_doc,
        destRazon: g.destinatario_razon_social,
        destDireccion: g.cliente_direccion || g.punto_llegada_direccion,
        destEmail: g.cliente_email || '',
        fechaInicio: g.fecha_inicio_traslado_iso,
        motivoTraslado: g.motivo_traslado,
        pesoCalculado: Number(g.peso_bruto_total || 0),
        unidadPeso: g.unidad_peso_bruto || 'KGM',
        modalidadTraslado: g.modalidad_traslado || 'Privado',
        partidaUbigeo: g.punto_partida_ubigeo,
        partidaDireccion: g.punto_partida_direccion,
        llegadaUbigeo: g.punto_llegada_ubigeo,
        llegadaDir: g.punto_llegada_direccion,
        vehPlaca: g.vehiculo_placa,
        vehEntidad: g.vehiculo_entidad_autoriz,
        vehNumAutoriz: g.vehiculo_num_autoriz,
        condTipoDoc: g.conductor_tipo_doc,
        condNumDoc: g.conductor_num_doc,
        condNombres: g.conductor_nombres,
        condLicencia: g.conductor_licencia,
        trasladoVehiculoM1L: g.traslado_vehiculo_m1_l,
        retornoEnvasesVacios: g.retorno_envases_vacios,
        retornoVehiculoVacio: g.retorno_vehiculo_vacio,
        transbordoProgramado: g.transbordo_programado,
        documentoRelacionado: docRel,
        bienes: Array.isArray(g.bienes_json) ? g.bienes_json : [],
        configEmisor
    };

    const payloadNubefact = construirPayloadNubefactGre(grePayloadParams);
    const apisperuParams = armarApisperuGreParams(grePayloadParams);

    const resultadoOse = await enviarGreAOse({
        payloadNubefact,
        apisperuParams,
        configEmisor,
        cadenaQrLocal: g.cadena_qr
    });

    const enlaceXmlFinal = resultadoOse.enlace_xml || (resultadoOse.xml_firmado ? `/api/facturacion/gre/${idGre}/xml` : null);
    const enlaceCdrFinal = resultadoOse.enlace_cdr || ((resultadoOse.cdr_xml || resultadoOse.cdr_zip_base64) ? `/api/facturacion/gre/${idGre}/cdr` : null);

    const { rows } = await dbPool.query(`
        UPDATE guias_remision
        SET estado_sunat = $1,
            codigo_hash = $2,
            ticket_sunat = $3,
            mensaje_cdr = $4,
            cadena_qr = $5,
            enlace_pdf = $6,
            enlace_xml = $7,
            enlace_cdr = $8,
            xml_firmado = COALESCE($9, xml_firmado),
            cdr_xml = COALESCE($10, cdr_xml),
            cdr_zip_base64 = COALESCE($11, cdr_zip_base64),
            modo_emision = $12,
            respuesta_ose_json = $13::jsonb
        WHERE id_gre = $14
        RETURNING *, TO_CHAR(fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso;
    `, [
        resultadoOse.estado_sunat,
        resultadoOse.codigo_hash,
        resultadoOse.ticket_sunat || null,
        resultadoOse.mensaje_cdr,
        resultadoOse.cadena_qr,
        resultadoOse.enlace_pdf,
        enlaceXmlFinal,
        enlaceCdrFinal,
        resultadoOse.xml_firmado || null,
        resultadoOse.cdr_xml || null,
        resultadoOse.cdr_zip_base64 || null,
        resultadoOse.modo_emision,
        JSON.stringify(resultadoOse.respuesta_ose_json || {}),
        idGre
    ]);
    return rows[0];
}

async function consultarPuntosLlegadaPorRuc(dbPool, rucRaw) {
    const ruc = String(rucRaw || '').trim();
    const resultadosExistentes = async () => {
        if (!ruc) return [];
        const r = await dbPool.query(`
            SELECT * FROM gre_puntos_llegada_cliente
            WHERE ruc = $1 AND activo = TRUE
            ORDER BY CASE WHEN codigo_anexo = '0000' THEN 0 ELSE 1 END, codigo_anexo ASC, id_punto_llegada ASC;
        `, [ruc]);
        return r.rows;
    };

    if (!ruc) return [];

    // Asegurar dirección guardada del cliente en BD como respaldo/opción
    try {
        const cliRes = await dbPool.query(
            'SELECT direccion FROM clientes WHERE numero_documento = $1 AND direccion IS NOT NULL AND TRIM(direccion) != \'\' LIMIT 1',
            [ruc]
        );
        if (cliRes.rows.length > 0) {
            await dbPool.query(`
                INSERT INTO gre_puntos_llegada_cliente (ruc, codigo_anexo, tipo, ubigeo, direccion, origen)
                VALUES ($1, 'CLI1', 'DIRECCIÓN REGISTRADA', '', $2, 'CLIENTE')
                ON CONFLICT (ruc, direccion) DO NOTHING;
            `, [ruc, cliRes.rows[0].direccion.trim()]);
        }
    } catch {
        // No bloquear si falla respaldo de cliente
    }

    // Consultar SUNAT por RUC si es RUC válido de 11 dígitos
    if (/^(10|15|16|17|20)\d{9}$/.test(ruc)) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4500);
            const resp = await fetch(`https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(ruc)}`, {
                signal: ctrl.signal
            });
            clearTimeout(timer);

            if (resp.ok) {
                const data = await resp.json();
                const dirBase = String(data.direccion || '').trim();
                const locPartes = [data.departamento, data.provincia, data.distrito]
                    .map((s) => String(s || '').trim())
                    .filter((s) => s && s !== '-');
                const direccionCompleta = [dirBase, locPartes.join(' - ')].filter(Boolean).join(' ');
                if (direccionCompleta) {
                    await dbPool.query(`
                        INSERT INTO gre_puntos_llegada_cliente (
                            ruc, codigo_anexo, tipo, ubigeo, direccion,
                            departamento, provincia, distrito, origen
                        )
                        VALUES ($1, '0000', 'DOMICILIO FISCAL', $2, $3, $4, $5, $6, 'SUNAT')
                        ON CONFLICT (ruc, direccion) DO UPDATE SET
                            tipo = EXCLUDED.tipo,
                            ubigeo = COALESCE(NULLIF(EXCLUDED.ubigeo, ''), gre_puntos_llegada_cliente.ubigeo),
                            departamento = EXCLUDED.departamento,
                            provincia = EXCLUDED.provincia,
                            distrito = EXCLUDED.distrito;
                    `, [
                        ruc,
                        String(data.ubigeo || '').trim(),
                        direccionCompleta,
                        String(data.departamento || '').trim(),
                        String(data.provincia || '').trim(),
                        String(data.distrito || '').trim()
                    ]);
                }
            }
        } catch {
            // Silencioso: si SUNAT/apis.net.pe no responde, devolver lo guardado en BD
        }

        // Si hay token configurado para anexos v2, consultar establecimientos anexos
        const tokenV2 = process.env.APISNET_TOKEN || '';
        if (tokenV2) {
            try {
                const ctrl2 = new AbortController();
                const timer2 = setTimeout(() => ctrl2.abort(), 4500);
                const respAnexos = await fetch(`https://api.apis.net.pe/v2/sunat/ruc/anexos?numero=${encodeURIComponent(ruc)}`, {
                    headers: { Authorization: `Bearer ${tokenV2}` },
                    signal: ctrl2.signal
                });
                clearTimeout(timer2);
                if (respAnexos.ok) {
                    const listaAnexos = await respAnexos.json();
                    const arr = Array.isArray(listaAnexos) ? listaAnexos : (listaAnexos?.anexos || []);
                    for (const ax of arr) {
                        const dirAx = [ax.direccion, ax.departamento, ax.provincia, ax.distrito]
                            .map((s) => String(s || '').trim())
                            .filter((s) => s && s !== '-')
                            .join(' ');
                        if (dirAx) {
                            await dbPool.query(`
                                INSERT INTO gre_puntos_llegada_cliente (
                                    ruc, codigo_anexo, tipo, ubigeo, direccion,
                                    departamento, provincia, distrito, origen
                                )
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SUNAT_ANEXO')
                                ON CONFLICT (ruc, direccion) DO UPDATE SET
                                    ubigeo = COALESCE(NULLIF(EXCLUDED.ubigeo, ''), gre_puntos_llegada_cliente.ubigeo),
                                    tipo = EXCLUDED.tipo;
                            `, [
                                ruc,
                                String(ax.codigo || 'ANEXO'),
                                String(ax.tipoEstablecimiento || 'ESTABLECIMIENTO ANEXO'),
                                String(ax.ubigeo || ''),
                                dirAx,
                                String(ax.departamento || ''),
                                String(ax.provincia || ''),
                                String(ax.distrito || '')
                            ]);
                        }
                    }
                }
            } catch {
                // Continuar con los ya almacenados
            }
        }
    }

    return await resultadosExistentes();
}

/**
 * Consulta datos básicos (Razón Social y Dirección) de un RUC peruano en base local o SUNAT/APIs.net.pe
 * sin registrar obligatoriamente al destinatario en la tabla clientes.
 */
async function consultarDatosRucSunat(dbPool, rucRaw) {
    const ruc = String(rucRaw || '').trim();
    if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) {
        return {
            valido: false,
            encontrado: false,
            ruc,
            mensaje: 'El RUC debe tener exactamente 11 dígitos válidos (iniciar con 10, 15, 16, 17 o 20).'
        };
    }

    let cliLocal = null;
    try {
        const resCli = await dbPool.query(
            'SELECT id_cliente, razon_social_o_nombre, nombre_comercial, direccion, email FROM clientes WHERE numero_documento = $1 LIMIT 1',
            [ruc]
        );
        if (resCli.rows.length > 0) cliLocal = resCli.rows[0];
    } catch {
        // Ignorar error de consulta local
    }

    let razonSocial = '';
    let direccion = '';
    let ubigeo = '';
    let estado = '';
    let condicion = '';

    const intentarParsearSunat = (data) => {
        if (!data || typeof data !== 'object') return;
        const nombre = String(data.nombre || data.razonSocial || data.razon_social || '').trim();
        const dirBase = String(data.direccion || '').trim();
        const locPartes = [data.departamento, data.provincia, data.distrito]
            .map((s) => String(s || '').trim())
            .filter((s) => s && s !== '-');
        const dirComp = [dirBase, locPartes.join(' - ')].filter(Boolean).join(' ').trim();
        if (nombre) razonSocial = nombre;
        if (dirComp) direccion = dirComp;
        if (data.ubigeo) ubigeo = String(data.ubigeo).trim();
        if (data.estado) estado = String(data.estado).trim();
        if (data.condicion) condicion = String(data.condicion).trim();
    };

    const tokenV2 = process.env.APISNET_TOKEN || '';
    if (tokenV2) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4500);
            const resp = await fetch(`https://api.apis.net.pe/v2/sunat/ruc?numero=${encodeURIComponent(ruc)}`, {
                headers: { Authorization: `Bearer ${tokenV2}` },
                signal: ctrl.signal
            });
            clearTimeout(timer);
            if (resp.ok) intentarParsearSunat(await resp.json());
        } catch {
            // Intentar fallback v1
        }
    }

    if (!razonSocial) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4500);
            const resp = await fetch(`https://api.apis.net.pe/v1/ruc?numero=${encodeURIComponent(ruc)}`, {
                signal: ctrl.signal
            });
            clearTimeout(timer);
            if (resp.ok) intentarParsearSunat(await resp.json());
        } catch {
            // Silencioso: el usuario igual puede escribir razón social manualmente
        }
    }

    if (!razonSocial && cliLocal) {
        razonSocial = String(cliLocal.razon_social_o_nombre || cliLocal.nombre_comercial || '').trim();
    }
    if (!direccion && cliLocal?.direccion) {
        direccion = String(cliLocal.direccion).trim();
    }

    return {
        valido: true,
        encontrado: Boolean(razonSocial),
        ruc,
        razon_social: razonSocial,
        direccion,
        ubigeo,
        estado,
        condicion,
        email: cliLocal?.email || '',
        en_base_clientes: Boolean(cliLocal)
    };
}

module.exports = {
    obtenerCatalogosGre,
    crearGreInterna,
    consultarGreEnNubefact,
    reenviarGreEnNubefact,
    consultarPuntosLlegadaPorRuc,
    consultarDatosRucSunat
};
