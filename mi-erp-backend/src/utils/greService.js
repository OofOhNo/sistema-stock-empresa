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

/**
 * Emite una Guía de Remisión Electrónica (Serie EG07) y la vincula automáticamente
 * con el comprobante (Factura 01) emitido.
 * Los "Documentos relacionados" se gestionan aquí internamente sin exponerse en la UI.
 */
async function crearGreInterna(client, {
    id_comprobante = null,
    id_pedido = null,
    cliente = null,
    items = [],
    peso_bruto_total = null,
    gre = {},
    configEmisor = {},
    idUsuario = null
}) {
    const serie = 'EG07';
    const resSerie = await client.query(
        'SELECT ultimo_correlativo FROM series_sunat WHERE serie = $1 FOR UPDATE',
        [serie]
    );

    let correlativo = 932;
    if (resSerie.rows.length === 0) {
        await client.query(
            'INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES ($1, $2, $3)',
            ['09', serie, correlativo]
        );
    } else {
        correlativo = resSerie.rows[0].ultimo_correlativo + 1;
        await client.query(
            'UPDATE series_sunat SET ultimo_correlativo = $1 WHERE serie = $2',
            [correlativo, serie]
        );
    }

    // Punto de partida: si viene id_punto_partida, resolver desde catálogo; sino tomar textos o default DOMICILIO FISCAL
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
            partidaUbigeo = '040101';
            partidaDireccion = configEmisor.direccion_fiscal || 'OTR. ZONA N 24 Y 25 MZ. 12 P.J. SEMIRURAL PACHACUTEC AREQUIPA';
        }
    }

    // Vehículo frecuente o manual
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
    } else if (!vehPlaca) {
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
    } else if (!condNumDoc && !condNombres) {
        const defC = await client.query('SELECT * FROM gre_conductores WHERE activo = TRUE ORDER BY id_conductor ASC LIMIT 1');
        if (defC.rows.length > 0) {
            condTipoDoc = defC.rows[0].tipo_documento;
            condNumDoc = defC.rows[0].numero_documento;
            condNombres = defC.rows[0].apellidos_nombres;
            condLicencia = defC.rows[0].licencia;
        }
    }

    const bienes = Array.isArray(gre.bienes) && gre.bienes.length > 0
        ? gre.bienes
        : (Array.isArray(items) ? items : []).map((it, idx) => ({
            orden: idx + 1,
            bien_normalizado: Boolean(it.bien_normalizado),
            codigo_bien: it.codigo_bien || it.codigo || '',
            codigo_subpartida: it.codigo_subpartida || '',
            codigo_sunat: it.codigo_sunat || '',
            codigo_gtin: it.codigo_gtin || '',
            descripcion: it.descripcion || it.nombre || 'PRODUCTO',
            unidad_medida: it.unidad_medida || 'Kilogramo',
            codigo_unidad_sunat: it.codigo_unidad_sunat || 'KGM',
            cantidad: Number(it.peso || it.cantidad || 1)
        }));

    // Si Admin marcó guardar algún bien frecuente
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

    const pesoCalculado = Number(peso_bruto_total) > 0
        ? +Number(peso_bruto_total).toFixed(2)
        : +bienes.reduce((acc, b) => acc + (Number(b.cantidad) || 0), 0).toFixed(2);

    const destTipo = gre.destinatario_tipo_doc || cliente?.tipo_documento || '6';
    const destNum = gre.destinatario_num_doc || cliente?.numero_documento || '';
    const destRazon = gre.destinatario_razon_social || cliente?.razon_social_o_nombre || '';
    const llegadaDir = gre.punto_llegada_direccion || cliente?.direccion || 'DIRECCIÓN DEL CLIENTE';
    const llegadaUbigeo = gre.punto_llegada_ubigeo || '';
    const fechaInicio = gre.fecha_inicio_traslado || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

    const rucEmisor = configEmisor?.ruc_emisor || '20608725394';
    const cadenaQr = `https://e-factura.sunat.gob.pe/v1/contribuyente/gre/comprobantes/descargaqr?hashqr=${rucEmisor}-09-${serie}-${String(correlativo).padStart(8, '0')}`;

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
            bienes_json, cadena_qr, estado_sunat, creado_por
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
            $31, $32, 'ACEPTADO', $33
        )
        RETURNING *, TO_CHAR(fecha_inicio_traslado, 'YYYY-MM-DD') AS fecha_inicio_traslado_iso;
    `, [
        id_comprobante,
        id_pedido,
        cliente?.id_cliente || null,
        gre.tipo_gre === 'TRANSPORTISTA' ? 'TRANSPORTISTA' : 'REMITENTE',
        serie,
        correlativo,
        Boolean(gre.comercio_exterior),
        gre.motivo_traslado || 'Venta',
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
        gre.modalidad_traslado || 'Privado',
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
        cadenaQr,
        idUsuario
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

module.exports = {
    obtenerCatalogosGre,
    crearGreInterna,
    consultarPuntosLlegadaPorRuc
};
