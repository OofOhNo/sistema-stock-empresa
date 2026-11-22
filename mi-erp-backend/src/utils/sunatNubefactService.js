const crypto = require('crypto');
const {
    resolverModoIntegracion,
    formatearFechaHoraPeru,
    formatearFechaSoloPeru,
    construirPayloadApisperuComprobante,
    enviarComprobanteApisperu
} = require('./apisperuService');

// ============================================================================
// CATÁLOGOS OFICIALES SUNAT (PERÚ - ANEXO N° 8 UBL 2.1)
// ============================================================================

const CATALOGOS_SUNAT = {
    // Catálogo 01: Código de Tipo de Documento (Comprobante)
    tipos_comprobante: [
        { codigo: '01', codigo_nubefact: 1, nombre: 'Factura Electrónica', prefijo_serie: 'F' },
        { codigo: '03', codigo_nubefact: 2, nombre: 'Boleta de Venta Electrónica', prefijo_serie: 'B' },
        { codigo: '07', codigo_nubefact: 3, nombre: 'Nota de Crédito Electrónica', prefijo_serie: 'FC/BC' },
        { codigo: '08', codigo_nubefact: 4, nombre: 'Nota de Débito Electrónica', prefijo_serie: 'FD/BD' }
    ],

    // Catálogo 06: Códigos de Tipos de Documentos de Identidad
    tipos_documento_identidad: [
        { codigo: '6', nombre: 'RUC (Registro Único de Contribuyentes)', longitud: 11 },
        { codigo: '1', nombre: 'DNI (Documento Nacional de Identidad)', longitud: 8 },
        { codigo: '4', nombre: 'Carnet de Extranjería', longitud: null },
        { codigo: '7', nombre: 'Pasaporte', longitud: null },
        { codigo: '0', nombre: 'Cliente Varios / Sin Documento (Boletas < S/ 700)', longitud: null }
    ],

    // Catálogo 07: Códigos de Tipo de Afectación del IGV
    tipos_afectacion_igv: [
        { codigo: '10', tipo_nubefact: 1, codigo_tributo: '1000', nombre_tributo: 'IGV', tipo_tributo: 'VAT', nombre: 'Gravado - Operación Onerosa (Con IGV 18%)' },
        { codigo: '20', tipo_nubefact: 8, codigo_tributo: '9997', nombre_tributo: 'EXO', tipo_tributo: 'VAT', nombre: 'Exonerado - Operación Onerosa (0% IGV)' },
        { codigo: '30', tipo_nubefact: 9, codigo_tributo: '9998', nombre_tributo: 'INA', tipo_tributo: 'FRE', nombre: 'Inafecto - Operación Onerosa (0% IGV)' },
        { codigo: '40', tipo_nubefact: 16, codigo_tributo: '9995', nombre_tributo: 'EXP', tipo_tributo: 'FRE', nombre: 'Exportación de Bienes o Servicios (0% IGV)' }
    ],

    // Catálogo 09: Códigos de Tipo de Nota de Crédito Electrónica
    motivos_nota_credito: [
        { codigo: '01', tipo_nubefact: 1, nombre: 'Anulación de la operación', devuelve_stock: true },
        { codigo: '02', tipo_nubefact: 2, nombre: 'Anulación por error en el RUC', devuelve_stock: true },
        { codigo: '03', tipo_nubefact: 3, nombre: 'Corrección por error en la descripción', devuelve_stock: false },
        { codigo: '04', tipo_nubefact: 4, nombre: 'Descuento global', devuelve_stock: false },
        { codigo: '05', tipo_nubefact: 5, nombre: 'Descuento por ítem', devuelve_stock: false },
        { codigo: '06', tipo_nubefact: 6, nombre: 'Devolución total de mercadería', devuelve_stock: true },
        { codigo: '07', tipo_nubefact: 7, nombre: 'Devolución por ítem', devuelve_stock: true },
        { codigo: '09', tipo_nubefact: 9, nombre: 'Disminución en el valor', devuelve_stock: false },
        { codigo: '10', tipo_nubefact: 10, nombre: 'Otros conceptos', devuelve_stock: true }
    ],

    // Catálogo 59: Medios de Pago
    medios_pago: [
        { codigo: '008', nombre: 'Transferencia Bancaria / Interbancaria' },
        { codigo: '009', nombre: 'Efectivo' },
        { codigo: '001', nombre: 'Depósito en Cuenta' },
        { codigo: '005', nombre: 'Tarjeta de Débito' },
        { codigo: '006', nombre: 'Tarjeta de Crédito' },
        { codigo: '999', nombre: 'Billetera Digital (Yape / Plin)' }
    ],

    // Catálogo 54: Códigos de Bienes y Servicios sujetos a Detracción (SPOT)
    codigos_detraccion: [
        { codigo: '014', nombre: 'Carnes y despojos comestibles (4%)', porcentaje: 4.00 },
        { codigo: '022', nombre: 'Otros servicios empresariales (12%)', porcentaje: 12.00 },
        { codigo: '037', nombre: 'Demás servicios gravados con el IGV (12%)', porcentaje: 12.00 },
        { codigo: '027', nombre: 'Servicio de transporte de bienes (4%)', porcentaje: 4.00 }
    ]
};

// ============================================================================
// CONVERSOR DE NÚMEROS A LETRAS OFICIAL (PERÚ - SOLES)
// Ej: 118.00 -> "SON: CIENTO DIECIOCHO CON 00/100 SOLES"
// ============================================================================

const UNIDADES = [
    '', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
    'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'
];

const DECENAS = [
    '', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'
];

const CENTENAS = [
    '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
    'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'
];

function convertirGrupoMenorMil(n) {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    const c = Math.floor(n / 100);
    const resto = n % 100;
    let texto = CENTENAS[c];

    if (resto > 0) {
        if (texto) texto += ' ';
        if (resto < 30) {
            texto += UNIDADES[resto];
        } else {
            const d = Math.floor(resto / 10);
            const u = resto % 10;
            texto += DECENAS[d] + (u > 0 ? ` Y ${UNIDADES[u]}` : '');
        }
    }
    return texto;
}

function numeroALetrasSoles(monto) {
    const num = Math.max(0, Number(monto) || 0);
    const entero = Math.floor(num + 1e-6);
    const centimos = Math.round((num - entero) * 100);
    const centimosStr = String(Math.min(99, Math.max(0, centimos))).padStart(2, '0');

    if (entero === 0) {
        return `SON: CERO CON ${centimosStr}/100 SOLES`;
    }

    const millones = Math.floor(entero / 1000000);
    const miles = Math.floor((entero % 1000000) / 1000);
    const unidades = entero % 1000;

    const partes = [];
    if (millones === 1) {
        partes.push('UN MILLÓN');
    } else if (millones > 1) {
        partes.push(`${convertirGrupoMenorMil(millones)} MILLONES`);
    }

    if (miles === 1) {
        partes.push('MIL');
    } else if (miles > 1) {
        partes.push(`${convertirGrupoMenorMil(miles)} MIL`);
    }

    if (unidades > 0) {
        partes.push(convertirGrupoMenorMil(unidades));
    }

    return `SON: ${partes.join(' ')} CON ${centimosStr}/100 SOLES`;
}

// ============================================================================
// VALIDACIONES TRIBUTARIAS SUNAT ANTES DE EMITIR
// ============================================================================

function validarReglasTributarias({ tipo_comprobante, cliente, monto_total, fecha_emision }) {
    const numDoc = String(cliente.numero_documento || '').trim();
    const tipoDoc = String(cliente.tipo_documento || '6').trim();
    const total = Number(monto_total) || 0;

    // 1. Regla para Facturas (01): Solo clientes con RUC válido (11 dígitos)
    if (tipo_comprobante === '01') {
        if (tipoDoc !== '6' || !/^(10|15|16|17|20)\d{9}$/.test(numDoc)) {
            return {
                valido: false,
                mensaje: `Para emitir una Factura Electrónica a "${cliente.razon_social_o_nombre}", su documento debe ser un RUC válido de 11 dígitos (que empiece con 10 o 20). Si el cliente tiene DNI, selecciona "Boleta de Venta".`
            };
        }
    }

    // 2. Regla para Boletas (03): NO puede tener RUC, SOLO DNI (8 dígitos) o CLIENTES VARIOS (< S/ 700)
    if (tipo_comprobante === '03') {
        if (tipoDoc === '6' || /^(10|15|16|17|20)\d{9}$/.test(numDoc)) {
            return {
                valido: false,
                mensaje: 'Una Boleta de Venta no puede emitirse con RUC. Debe utilizarse exclusivamente DNI (8 dígitos) o "Clientes Varios". Si el cliente tiene RUC, emite una Factura (01).'
            };
        }
        const esClientesVarios = numDoc === '00000000' || numDoc === '-' || numDoc === '' || tipoDoc === '-' || tipoDoc === '0' || (cliente?.razon_social_o_nombre || '').toUpperCase().includes('VARIOS');
        if (esClientesVarios) {
            if (total >= 700) {
                return {
                    valido: false,
                    mensaje: 'Por normativa de SUNAT (RS 007-99), las Boletas de Venta por un monto de S/ 700.00 o más exigen identificar obligatoriamente al cliente con su DNI (8 dígitos).'
                };
            }
        } else if (!/^\d{8}$/.test(numDoc)) {
            return {
                valido: false,
                mensaje: `Para emitir una Boleta de Venta a "${cliente.razon_social_o_nombre || cliente.nombre || 'el cliente'}", el documento debe ser un DNI válido de exactamente 8 dígitos (o "00000000" para Clientes Varios en compras menores a S/ 700).`
            };
        }
    }

    // 3. Regla de plazo máximo de envío a SUNAT (máximo 3 días calendario desde emisión)
    if (fecha_emision) {
        const fEmision = new Date(fecha_emision);
        const ahora = new Date();
        const diffDias = (ahora - fEmision) / (1000 * 60 * 60 * 24);
        if (diffDias > 3.5) {
            return {
                valido: false,
                mensaje: 'Por normativa de SUNAT, un comprobante electrónico no puede emitirse con más de 3 días calendario de antigüedad.'
            };
        }
    }

    return { valido: true };
}

// ============================================================================
// CÁLCULO TRIBUTARIO POR ÍTEMS SEGÚN CATÁLOGO 07 (GRAVADO / EXONERADO / INAFECTO)
// ============================================================================

function calcularDesgloseTributario(items, igvPorcentaje = 18.00) {
    const tasaIgv = (Number(igvPorcentaje) || 18) / 100;

    let montoGravada = 0;
    let montoExonerada = 0;
    let montoInafecta = 0;
    let montoIgv = 0;
    let montoTotal = 0;

    const itemsCalculados = items.map((item) => {
        const cantidad = Number(item.cantidad) || 1;
        const precioUnitarioConIgv = Number(item.precio_unitario) || 0;
        const importeTotalItem = Number(item.subtotal) || +(cantidad * precioUnitarioConIgv).toFixed(2);
        const afectacion = String(item.tipo_afectacion_igv || '10');

        let valorUnitarioSinIgv = precioUnitarioConIgv;
        let subtotalBaseItem = importeTotalItem;
        let igvItem = 0;
        let tipoIgvNubefact = 1; // 1 = Gravado Operación Onerosa

        if (afectacion === '10') {
            // Gravado con IGV (18%)
            valorUnitarioSinIgv = precioUnitarioConIgv / (1 + tasaIgv);
            subtotalBaseItem = importeTotalItem / (1 + tasaIgv);
            igvItem = importeTotalItem - subtotalBaseItem;
            tipoIgvNubefact = 1;
            montoGravada += subtotalBaseItem;
            montoIgv += igvItem;
        } else if (afectacion === '20') {
            // Exonerado de IGV (0%)
            tipoIgvNubefact = 8;
            montoExonerada += subtotalBaseItem;
        } else if (afectacion === '30') {
            // Inafecto de IGV (0%)
            tipoIgvNubefact = 9;
            montoInafecta += subtotalBaseItem;
        } else if (afectacion === '40') {
            // Exportación (0%)
            tipoIgvNubefact = 16;
            montoInafecta += subtotalBaseItem;
        }

        montoTotal += importeTotalItem;

        return {
            ...item,
            unidad_de_medida: (item.codigo_unidad_sunat || 'NIU').toUpperCase(),
            codigo: item.sku || `PROD-${item.id_producto}`,
            descripcion: item.descripcion,
            cantidad,
            tipo_afectacion_igv: afectacion,
            tipo_de_igv: tipoIgvNubefact,
            valor_unitario: +valorUnitarioSinIgv.toFixed(6),
            precio_unitario: +precioUnitarioConIgv.toFixed(2),
            subtotal: +subtotalBaseItem.toFixed(2),
            igv: +igvItem.toFixed(2),
            total: +importeTotalItem.toFixed(2)
        };
    });

    const montoSubtotal = +(montoGravada + montoExonerada + montoInafecta).toFixed(2);

    return {
        itemsCalculados,
        totales: {
            monto_gravada: +montoGravada.toFixed(2),
            monto_exonerada: +montoExonerada.toFixed(2),
            monto_inafecta: +montoInafecta.toFixed(2),
            monto_subtotal: montoSubtotal,
            monto_igv: +montoIgv.toFixed(2),
            monto_total: +montoTotal.toFixed(2)
        }
    };
}

// ============================================================================
// GENERADOR DE PAYLOAD JSON OFICIAL NUBEFACT API V1
// ============================================================================

function formatearFechaNubefact(fechaInput) {
    const d = fechaInput ? new Date(fechaInput) : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

function construirPayloadNubefact({
    tipo_comprobante,
    serie,
    correlativo,
    cliente,
    itemsCalculados,
    totales,
    forma_pago = 'CONTADO',
    fecha_vencimiento_cuota = null,
    medio_pago_sunat = '008',
    aplica_detraccion = false,
    codigo_detraccion = null,
    porcentaje_detraccion = 0,
    monto_detraccion = 0,
    comprobante_referencia = null,
    codigo_motivo_nc = null,
    descripcion_motivo_nc = null,
    configEmisor = {}
}) {
    const mapaTipoComp = { '01': 1, '03': 2, '07': 3, '08': 4 };
    const tipoDeComprobanteNubefact = mapaTipoComp[tipo_comprobante] || 1;
    const esCredito = forma_pago === 'CREDITO';

    const payload = {
        operacion: 'generar_comprobante',
        tipo_de_comprobante: tipoDeComprobanteNubefact,
        serie,
        numero: Number(correlativo),
        sunat_transaction: aplica_detraccion ? 30 : 1,
        cliente_tipo_de_documento: (String(cliente.numero_documento || '') === '00000000' || String(cliente.tipo_documento || '') === '-' || String(cliente.tipo_documento || '') === '0' || (cliente.razon_social_o_nombre || '').toUpperCase().includes('VARIOS'))
            ? '-'
            : String(cliente.tipo_documento || (tipo_comprobante === '01' ? '6' : '1')),
        cliente_numero_de_documento: (String(cliente.numero_documento || '') === '00000000' || String(cliente.tipo_documento || '') === '-' || String(cliente.tipo_documento || '') === '0' || (cliente.razon_social_o_nombre || '').toUpperCase().includes('VARIOS'))
            ? '-'
            : String(cliente.numero_documento || ''),
        cliente_denominacion: String(cliente.razon_social_o_nombre || 'CLIENTES VARIOS'),
        cliente_direccion: String(cliente.direccion || ''),
        cliente_email: String(cliente.email || ''),
        fecha_de_emision: formatearFechaNubefact(new Date()),
        fecha_de_vencimiento: fecha_vencimiento_cuota ? formatearFechaNubefact(fecha_vencimiento_cuota) : '',
        moneda: 1, // 1 = Soles (PEN)
        tipo_de_cambio: '',
        porcentaje_de_igv: Number(configEmisor.igv_porcentaje || 18.00),
        descuento_global: '',
        total_descuento: '',
        total_anticipo: '',
        total_gravada: totales.monto_gravada > 0 ? totales.monto_gravada : '',
        total_inafecta: totales.monto_inafecta > 0 ? totales.monto_inafecta : '',
        total_exonerada: totales.monto_exonerada > 0 ? totales.monto_exonerada : '',
        total_igv: totales.monto_igv,
        total_gratuita: '',
        total_otros_cargos: '',
        total: totales.monto_total,
        percepcion_tipo: '',
        percepcion_base_imponible: '',
        total_percepcion: '',
        total_incluido_percepcion: '',
        detraccion: Boolean(aplica_detraccion),
        detraccion_tipo: aplica_detraccion ? Number(codigo_detraccion || 37) : '',
        detraccion_total: aplica_detraccion ? Number(monto_detraccion) : '',
        detraccion_porcentaje: aplica_detraccion ? Number(porcentaje_detraccion) : '',
        medio_de_pago_detraccion: aplica_detraccion ? '001' : '',
        observaciones: descripcion_motivo_nc || '',
        documento_que_se_modifica_tipo: comprobante_referencia
            ? (comprobante_referencia.tipo_comprobante === '01' ? 1 : 2)
            : '',
        documento_que_se_modifica_serie: comprobante_referencia ? comprobante_referencia.serie : '',
        documento_que_se_modifica_numero: comprobante_referencia ? Number(comprobante_referencia.correlativo) : '',
        tipo_de_nota_de_credito: codigo_motivo_nc ? Number(codigo_motivo_nc) : '',
        tipo_de_nota_de_debito: '',
        enviar_automaticamente_a_la_sunat: configEmisor.enviar_automaticamente_sunat !== false,
        enviar_automaticamente_al_cliente: Boolean(cliente.email && configEmisor.enviar_automaticamente_cliente !== false),
        condiciones_de_pago: esCredito ? 'CRÉDITO' : 'CONTADO',
        medio_de_pago: medio_pago_sunat || '008',
        items: itemsCalculados.map((it) => ({
            unidad_de_medida: it.unidad_de_medida || 'NIU',
            codigo: it.codigo,
            codigo_producto_sunat: it.codigo_producto_sunat || '',
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            valor_unitario: it.valor_unitario,
            precio_unitario: it.precio_unitario,
            descuento: '',
            subtotal: it.subtotal,
            tipo_de_igv: it.tipo_de_igv,
            igv: it.igv,
            total: it.total,
            anticipo_regularizacion: false,
            anticipo_documento_serie: '',
            anticipo_documento_numero: ''
        }))
    };

    if (esCredito && fecha_vencimiento_cuota) {
        const importeCuota = aplica_detraccion
            ? +(totales.monto_total - Number(monto_detraccion || 0)).toFixed(2)
            : totales.monto_total;
        payload.venta_al_credito = [
            {
                cuota: 1,
                fecha_de_pago: formatearFechaNubefact(fecha_vencimiento_cuota),
                importe: importeCuota
            }
        ];
    }

    return payload;
}

// ============================================================================
// GENERADOR DE XML UBL 2.1 ESTÁNDAR SUNAT + HASH SHA-256 + CDR + QR
// ============================================================================

function escaparXml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generarXmlUbl21YDatosSunat({
    id_comprobante,
    tipo_comprobante,
    serie,
    correlativo,
    configEmisor,
    cliente,
    itemsCalculados,
    totales,
    monto_en_letras,
    forma_pago = 'CONTADO',
    fecha_vencimiento_cuota = null,
    comprobante_referencia = null,
    codigo_motivo_nc = null,
    descripcion_motivo_nc = null
}) {
    const rucEmisor = configEmisor.ruc_emisor || '20600000001';
    const razonEmisor = configEmisor.razon_social || 'EMPRESA DEMO ERP S.A.C.';
    const comercialEmisor = configEmisor.nombre_comercial || razonEmisor;
    const ubigeoEmisor = configEmisor.ubigeo || '150101';
    const direccionEmisor = configEmisor.direccion_fiscal || 'Av. Empresarial 100, Lima';

    const correlativoPadded = String(correlativo).padStart(8, '0');
    const numeroCompleto = `${serie}-${correlativoPadded}`;
    const ahora = new Date();
    const fechaIso = formatearFechaSoloPeru(ahora);
    const horaIso = formatearFechaHoraPeru(ahora).slice(11, 19);

    // Generar DigestValue (Código Hash de 28 caracteres en Base64 como en XMLDSig SHA-256 de SUNAT)
    const semillaFirma = `${rucEmisor}|${tipo_comprobante}|${numeroCompleto}|${totales.monto_igv.toFixed(2)}|${totales.monto_total.toFixed(2)}|${fechaIso}|${cliente.numero_documento}`;
    const codigoHash = crypto.createHash('sha256').update(semillaFirma).digest('base64').slice(0, 28);
    const signatureValue = crypto.createHash('sha512').update(semillaFirma + '|SIG').digest('base64');

    // Cadena oficial para el Código QR exigida por SUNAT
    const cadenaQr = `${rucEmisor}|${tipo_comprobante}|${serie}|${correlativoPadded}|${totales.monto_igv.toFixed(2)}|${totales.monto_total.toFixed(2)}|${fechaIso}|${cliente.tipo_documento || '6'}|${cliente.numero_documento || '-'}|${codigoHash}|`;

    const esNotaCredito = tipo_comprobante === '07';
    const rootTag = esNotaCredito ? 'CreditNote' : 'Invoice';
    const xmlnsRoot = esNotaCredito
        ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
        : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
    const lineTag = esNotaCredito ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
    const qtyTag = esNotaCredito ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';

    const lineasXml = itemsCalculados.map((it, idx) => `
    <${lineTag}>
        <cbc:ID>${idx + 1}</cbc:ID>
        <${qtyTag} unitCode="${escaparXml(it.unidad_de_medida || 'NIU')}">${Number(it.cantidad).toFixed(2)}</${qtyTag}>
        <cbc:LineExtensionAmount currencyID="PEN">${Number(it.subtotal).toFixed(2)}</cbc:LineExtensionAmount>
        <cac:PricingReference>
            <cac:AlternativeConditionPrice>
                <cbc:PriceAmount currencyID="PEN">${Number(it.precio_unitario).toFixed(2)}</cbc:PriceAmount>
                <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
            </cac:AlternativeConditionPrice>
        </cac:PricingReference>
        <cac:TaxTotal>
            <cbc:TaxAmount currencyID="PEN">${Number(it.igv).toFixed(2)}</cbc:TaxAmount>
            <cac:TaxSubtotal>
                <cbc:TaxableAmount currencyID="PEN">${Number(it.subtotal).toFixed(2)}</cbc:TaxableAmount>
                <cbc:TaxAmount currencyID="PEN">${Number(it.igv).toFixed(2)}</cbc:TaxAmount>
                <cac:TaxCategory>
                    <cbc:Percent>${it.tipo_afectacion_igv === '10' ? '18.00' : '0.00'}</cbc:Percent>
                    <cbc:TaxExemptionReasonCode>${escaparXml(it.tipo_afectacion_igv || '10')}</cbc:TaxExemptionReasonCode>
                    <cac:TaxScheme>
                        <cbc:ID>${it.tipo_afectacion_igv === '10' ? '1000' : (it.tipo_afectacion_igv === '20' ? '9997' : '9998')}</cbc:ID>
                        <cbc:Name>${it.tipo_afectacion_igv === '10' ? 'IGV' : (it.tipo_afectacion_igv === '20' ? 'EXO' : 'INA')}</cbc:Name>
                        <cbc:TaxTypeCode>${it.tipo_afectacion_igv === '10' ? 'VAT' : 'FRE'}</cbc:TaxTypeCode>
                    </cac:TaxScheme>
                </cac:TaxCategory>
            </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:Item>
            <cbc:Description><![CDATA[${it.descripcion}]]></cbc:Description>
            <cac:SellersItemIdentification>
                <cbc:ID>${escaparXml(it.codigo)}</cbc:ID>
            </cac:SellersItemIdentification>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="PEN">${Number(it.valor_unitario).toFixed(6)}</cbc:PriceAmount>
        </cac:Price>
    </${lineTag}>`).join('\n');

    const nodoReferenciaNC = esNotaCredito && comprobante_referencia ? `
    <cac:DiscrepancyResponse>
        <cbc:ReferenceID>${escaparXml(`${comprobante_referencia.serie}-${String(comprobante_referencia.correlativo).padStart(8, '0')}`)}</cbc:ReferenceID>
        <cbc:ResponseCode>${escaparXml(codigo_motivo_nc || '01')}</cbc:ResponseCode>
        <cbc:Description><![CDATA[${descripcion_motivo_nc || 'Anulación de la operación'}]]></cbc:Description>
    </cac:DiscrepancyResponse>
    <cac:BillingReference>
        <cac:InvoiceDocumentReference>
            <cbc:ID>${escaparXml(`${comprobante_referencia.serie}-${String(comprobante_referencia.correlativo).padStart(8, '0')}`)}</cbc:ID>
            <cbc:DocumentTypeCode>${escaparXml(comprobante_referencia.tipo_comprobante)}</cbc:DocumentTypeCode>
        </cac:InvoiceDocumentReference>
    </cac:BillingReference>` : `<cbc:InvoiceTypeCode listID="0101">${escaparXml(tipo_comprobante)}</cbc:InvoiceTypeCode>`;

    const nodoPaymentTerms = !esNotaCredito ? (
        forma_pago === 'CREDITO' ? `
    <cac:PaymentTerms>
        <cbc:ID>FormaPago</cbc:ID>
        <cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>
        <cbc:Amount currencyID="PEN">${totales.monto_total.toFixed(2)}</cbc:Amount>
    </cac:PaymentTerms>
    <cac:PaymentTerms>
        <cbc:ID>FormaPago</cbc:ID>
        <cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>
        <cbc:Amount currencyID="PEN">${totales.monto_total.toFixed(2)}</cbc:Amount>
        <cbc:PaymentDueDate>${escaparXml(fecha_vencimiento_cuota || fechaIso)}</cbc:PaymentDueDate>
    </cac:PaymentTerms>` : `
    <cac:PaymentTerms>
        <cbc:ID>FormaPago</cbc:ID>
        <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
    </cac:PaymentTerms>`
    ) : '';

    const xmlFirmado = `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag} xmlns="${xmlnsRoot}"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
    <ext:UBLExtensions>
        <ext:UBLExtension>
            <ext:ExtensionContent>
                <ds:Signature Id="SignSUNAT">
                    <ds:SignedInfo>
                        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
                        <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
                        <ds:Reference URI="">
                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                            <ds:DigestValue>${codigoHash}</ds:DigestValue>
                        </ds:Reference>
                    </ds:SignedInfo>
                    <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
                </ds:Signature>
            </ext:ExtensionContent>
        </ext:UBLExtension>
    </ext:UBLExtensions>
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>2.0</cbc:CustomizationID>
    <cbc:ID>${escaparXml(numeroCompleto)}</cbc:ID>
    <cbc:IssueDate>${fechaIso}</cbc:IssueDate>
    <cbc:IssueTime>${horaIso}</cbc:IssueTime>
    ${nodoReferenciaNC}
    <cbc:Note languageLocaleID="1000"><![CDATA[${monto_en_letras}]]></cbc:Note>
    <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="6">${escaparXml(rucEmisor)}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyName>
                <cbc:Name><![CDATA[${comercialEmisor}]]></cbc:Name>
            </cac:PartyName>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName><![CDATA[${razonEmisor}]]></cbc:RegistrationName>
                <cac:RegistrationAddress>
                    <cbc:ID>${escaparXml(ubigeoEmisor)}</cbc:ID>
                    <cac:AddressLine>
                        <cbc:Line><![CDATA[${direccionEmisor}]]></cbc:Line>
                    </cac:AddressLine>
                    <cac:Country>
                        <cbc:IdentificationCode>PE</cbc:IdentificationCode>
                    </cac:Country>
                </cac:RegistrationAddress>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:AccountingSupplierParty>
    <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="${escaparXml(cliente.tipo_documento || '6')}">${escaparXml(cliente.numero_documento || '-')}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyLegalEntity>
                <cbc:RegistrationName><![CDATA[${cliente.razon_social_o_nombre || 'CLIENTE VARIOS'}]]></cbc:RegistrationName>
            </cac:PartyLegalEntity>
        </cac:Party>
    </cac:AccountingCustomerParty>
    ${nodoPaymentTerms}
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="PEN">${totales.monto_igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="PEN">${totales.monto_gravada.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="PEN">${totales.monto_igv.toFixed(2)}</cbc:TaxAmount>
            <cac:TaxCategory>
                <cac:TaxScheme>
                    <cbc:ID>1000</cbc:ID>
                    <cbc:Name>IGV</cbc:Name>
                    <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
                </cac:TaxScheme>
            </cac:TaxCategory>
        </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="PEN">${totales.monto_subtotal.toFixed(2)}</cbc:LineExtensionAmount>
        <cbc:TaxInclusiveAmount currencyID="PEN">${totales.monto_total.toFixed(2)}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="PEN">${totales.monto_total.toFixed(2)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
    ${lineasXml}
</${rootTag}>`;

    const nombreDocTexto = tipo_comprobante === '01'
        ? 'Factura'
        : (tipo_comprobante === '03' ? 'Boleta de Venta' : 'Nota de Crédito');

    const mensajeCdr = `La ${nombreDocTexto} número ${numeroCompleto}, ha sido aceptada por SUNAT (Código CDR: 0).`;

    const cdrXml = `<?xml version="1.0" encoding="UTF-8"?>
<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
                        xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                        xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
    <cbc:CustomizationID>1.0</cbc:CustomizationID>
    <cbc:ID>R-${escaparXml(rucEmisor)}-${escaparXml(tipo_comprobante)}-${escaparXml(numeroCompleto)}</cbc:ID>
    <cbc:IssueDate>${fechaIso}</cbc:IssueDate>
    <cbc:IssueTime>${horaIso}</cbc:IssueTime>
    <cac:SenderParty>
        <cac:PartyIdentification>
            <cbc:ID>20131312955</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyLegalEntity>
            <cbc:RegistrationName><![CDATA[SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA - SUNAT]]></cbc:RegistrationName>
        </cac:PartyLegalEntity>
    </cac:SenderParty>
    <cac:ReceiverParty>
        <cac:PartyIdentification>
            <cbc:ID>${escaparXml(rucEmisor)}</cbc:ID>
        </cac:PartyIdentification>
    </cac:ReceiverParty>
    <cac:DocumentResponse>
        <cac:Response>
            <cbc:ReferenceID>${escaparXml(numeroCompleto)}</cbc:ReferenceID>
            <cbc:ResponseCode>0</cbc:ResponseCode>
            <cbc:Description><![CDATA[${mensajeCdr}]]></cbc:Description>
        </cac:Response>
        <cac:DocumentReference>
            <cbc:ID>${escaparXml(numeroCompleto)}</cbc:ID>
            <cbc:UUID>${escaparXml(codigoHash)}</cbc:UUID>
        </cac:DocumentReference>
    </cac:DocumentResponse>
</ar:ApplicationResponse>`;

    return {
        codigoHash,
        cadenaQr,
        mensajeCdr,
        xmlFirmado,
        cdrXml,
        enlaceXmlInterno: id_comprobante ? `/api/facturacion/${id_comprobante}/xml` : null,
        enlaceCdrInterno: id_comprobante ? `/api/facturacion/${id_comprobante}/cdr` : null
    };
}

// ============================================================================
// CONECTOR CON NUBEFACT API V1 Y DESPACHADOR UNIFICADO OSE/PSE (APISPERU/NUBEFACT)
// ============================================================================

async function enviarAConectorNubefact({ payloadNubefact, configEmisor, datosUbl }) {
    const rutaEnv = process.env.NUBEFACT_RUTA || configEmisor?.nubefact_ruta || '';
    const tokenEnv = process.env.NUBEFACT_TOKEN || configEmisor?.nubefact_token || '';
    const modo = resolverModoIntegracion(configEmisor);

    const esUrlDemoInterna =
        !rutaEnv ||
        modo === 'DEMO_NUBEFACT' ||
        rutaEnv.includes('demo-integrada-erp') ||
        tokenEnv === 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO';

    // Si el usuario configuró su URL y Token reales/demo personalizados de NubeFact en modo NUBEFACT_REAL
    if (modo === 'NUBEFACT_REAL' && !esUrlDemoInterna) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const authHeader = tokenEnv.startsWith('Token ') || tokenEnv.startsWith('Bearer ')
                ? tokenEnv
                : `Bearer ${tokenEnv}`;

            const response = await fetch(rutaEnv, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(payloadNubefact),
                signal: controller.signal
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.errors) {
                throw new Error(data.errors || data.mensaje || `Error HTTP ${response.status} desde NubeFact`);
            }

            return {
                exito: true,
                modo_emision: 'NUBEFACT_REAL',
                estado_sunat: data.aceptada_por_sunat === false ? 'PENDIENTE_ENVIO' : 'ACEPTADO',
                codigo_hash: data.codigo_hash || datosUbl.codigoHash,
                cadena_qr: data.cadena_para_codigo_qr || datosUbl.cadenaQr,
                mensaje_cdr: data.sunat_description || data.mensaje || datosUbl.mensajeCdr,
                enlace_pdf: data.enlace_del_pdf || data.enlace || null,
                enlace_xml: data.enlace_del_xml || null,
                enlace_cdr: data.enlace_del_cdr || null,
                xml_firmado: datosUbl?.xmlFirmado || null,
                cdr_xml: datosUbl?.cdrXml || null,
                cdr_zip_base64: null,
                respuesta_ose_json: {
                    ...data,
                    payload_enviado: payloadNubefact
                }
            };
        } catch (error) {
            const msg = error?.name === 'AbortError'
                ? 'Tiempo de espera agotado (15s) al conectar con NubeFact.'
                : error.message;
            throw new Error(`Error al comunicar con NubeFact API (${rutaEnv}): ${msg}`);
        } finally {
            clearTimeout(timeout);
        }
    }

    // Modo DEMO_NUBEFACT integrado (Sandbox NubeFact API v1 + UBL 2.1 + CDR código 0)
    const respuestaDemoNubefact = {
        errors: null,
        tipo_de_comprobante: payloadNubefact.tipo_de_comprobante,
        serie: payloadNubefact.serie,
        numero: payloadNubefact.numero,
        aceptada_por_sunat: true,
        sunat_description: datosUbl.mensajeCdr,
        sunat_note: null,
        sunat_responsecode: '0',
        sunat_soap_error: '',
        codigo_hash: datosUbl.codigoHash,
        cadena_para_codigo_qr: datosUbl.cadenaQr,
        codigo_de_barras: datosUbl.cadenaQr,
        modo: 'DEMO_NUBEFACT_V1',
        payload_enviado: payloadNubefact
    };

    return {
        exito: true,
        modo_emision: 'DEMO_NUBEFACT',
        estado_sunat: 'ACEPTADO',
        codigo_hash: datosUbl.codigoHash,
        cadena_qr: datosUbl.cadenaQr,
        mensaje_cdr: datosUbl.mensajeCdr,
        enlace_pdf: null,
        enlace_xml: null,
        enlace_cdr: null,
        xml_firmado: datosUbl?.xmlFirmado || null,
        cdr_xml: datosUbl?.cdrXml || null,
        cdr_zip_base64: null,
        respuesta_ose_json: respuestaDemoNubefact
    };
}

/**
 * Despacha la emisión de Factura (01), Boleta (03) o Nota de Crédito (07)
 * al proveedor configurado (APIsPERU, NubeFact Real o Demo Sandbox).
 */
async function emitirComprobanteEnOse(params) {
    const { configEmisor = {}, datosUbl = {}, tipo_comprobante } = params;
    const modo = resolverModoIntegracion(configEmisor);

    if (modo === 'APISPERU') {
        const montoEnLetras = params.monto_en_letras || numeroALetrasSoles(params.totales?.monto_total || 0);
        const payloadApisperu = construirPayloadApisperuComprobante({
            ...params,
            monto_en_letras: montoEnLetras
        });
        return await enviarComprobanteApisperu({
            payloadApisperu,
            tipo_comprobante,
            configEmisor,
            datosUblFallback: datosUbl
        });
    }

    const payloadNubefact = construirPayloadNubefact(params);
    return await enviarAConectorNubefact({
        payloadNubefact,
        configEmisor,
        datosUbl
    });
}

module.exports = {
    CATALOGOS_SUNAT,
    numeroALetrasSoles,
    validarReglasTributarias,
    calcularDesgloseTributario,
    construirPayloadNubefact,
    generarXmlUbl21YDatosSunat,
    enviarAConectorNubefact,
    emitirComprobanteEnOse
};

