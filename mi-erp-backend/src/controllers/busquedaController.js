const pool = require('../config/db');

const mesesMap = {
    enero: 1, ene: 1,
    febrero: 2, feb: 2,
    marzo: 3, mar: 3,
    abril: 4, abr: 4,
    mayo: 5, may: 5,
    junio: 6, jun: 6,
    julio: 7, jul: 7,
    agosto: 8, ago: 8,
    setiembre: 9, septiembre: 9, set: 9, sep: 9,
    octubre: 10, oct: 10,
    noviembre: 11, nov: 11,
    diciembre: 12, dic: 12
};

function parsearParametrosBusqueda(rawQuery) {
    if (!rawQuery || typeof rawQuery !== 'string') return {};

    let texto = rawQuery.trim().toLowerCase();
    let cliente = null;
    let dia = null;
    let mes = null;
    let anio = null;

    // 1. Extraer cliente si viene con "cliente: ..." o "en: ..."
    const clienteMatch = texto.match(/(?:cliente|en|de)\s*:\s*([^,;]+)/i);
    if (clienteMatch) {
        cliente = clienteMatch[1].trim();
        texto = texto.replace(clienteMatch[0], ' ');
    }

    // 2. Extraer formato "5 de noviembre" o "05 de noviembre"
    const diaMesMatch = texto.match(/(\b\d{1,2}\b)\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)\b/i);
    if (diaMesMatch) {
        dia = parseInt(diaMesMatch[1], 10);
        mes = mesesMap[diaMesMatch[2].toLowerCase()];
        texto = texto.replace(diaMesMatch[0], ' ');
    } else {
        // Buscar mes solo
        for (const [nombreMes, numMes] of Object.entries(mesesMap)) {
            const regexMes = new RegExp(`\\b${nombreMes}\\b`, 'i');
            if (regexMes.test(texto)) {
                mes = numMes;
                texto = texto.replace(regexMes, ' ');
                break;
            }
        }
    }

    // 3. Extraer año (e.g. 2024, 2025, 2026)
    const anioMatch = texto.match(/\b(202[0-9])\b/);
    if (anioMatch) {
        anio = parseInt(anioMatch[1], 10);
        texto = texto.replace(anioMatch[0], ' ');
    }

    // 4. Limpiar tokens restantes
    // Eliminar palabras de enlace comunes como 'de', 'el', 'la', 'los', 'en', comas y dos puntos
    const palabrasSueltas = texto
        .replace(/[,;:]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 0 && !['de', 'el', 'la', 'los', 'del', 'para', 'y'].includes(w));

    const terminoLibre = palabrasSueltas.join(' ').trim();

    return {
        cliente,
        dia,
        mes,
        anio,
        terminoLibre
    };
}

const busquedaController = {
    buscarGlobal: async (req, res) => {
        const { q } = req.query;
        if (!q || q.trim() === '') {
            return res.status(200).json({
                exito: true,
                consulta: '',
                total: 0,
                facturas: [],
                pedidos: []
            });
        }

        const parsed = parsearParametrosBusqueda(q);
        const { cliente, dia, mes, anio, terminoLibre } = parsed;

        try {
            // --- 1. BÚSQUEDA DE COMPROBANTES (FACTURAS/BOLETAS) ---
            const whereComprobantes = [];
            const paramsComp = [];
            let pIdxComp = 1;

            if (dia) {
                whereComprobantes.push(`EXTRACT(DAY FROM c.fecha_emision) = $${pIdxComp++}`);
                paramsComp.push(dia);
            }
            if (mes) {
                whereComprobantes.push(`EXTRACT(MONTH FROM c.fecha_emision) = $${pIdxComp++}`);
                paramsComp.push(mes);
            }
            if (anio) {
                whereComprobantes.push(`EXTRACT(YEAR FROM c.fecha_emision) = $${pIdxComp++}`);
                paramsComp.push(anio);
            }
            if (cliente) {
                whereComprobantes.push(`(cl.razon_social_o_nombre ILIKE $${pIdxComp} OR cl.nombre_comercial ILIKE $${pIdxComp} OR cl.numero_documento ILIKE $${pIdxComp})`);
                paramsComp.push(`%${cliente}%`);
                pIdxComp++;
            }
            if (terminoLibre) {
                whereComprobantes.push(`(
                    c.serie ILIKE $${pIdxComp} OR 
                    c.correlativo::text ILIKE $${pIdxComp} OR 
                    CONCAT(c.serie, '-', c.correlativo) ILIKE $${pIdxComp} OR 
                    cl.razon_social_o_nombre ILIKE $${pIdxComp} OR 
                    cl.nombre_comercial ILIKE $${pIdxComp} OR 
                    cl.numero_documento ILIKE $${pIdxComp} OR 
                    c.tipo_comprobante ILIKE $${pIdxComp}
                )`);
                paramsComp.push(`%${terminoLibre}%`);
                pIdxComp++;
            }

            const whereCompClause = whereComprobantes.length > 0 ? `WHERE ${whereComprobantes.join(' AND ')}` : '';
            const queryComprobantes = `
                SELECT 
                    c.id_comprobante,
                    c.id_pedido,
                    c.tipo_comprobante,
                    c.serie,
                    c.correlativo,
                    CONCAT(c.serie, '-', LPAD(c.correlativo::text, 6, '0')) AS codigo_formateado,
                    c.monto_total,
                    c.estado_sunat,
                    c.fecha_emision,
                    cl.razon_social_o_nombre AS cliente_nombre,
                    cl.nombre_comercial AS cliente_comercial,
                    cl.numero_documento AS cliente_ruc
                FROM comprobantes c
                LEFT JOIN pedidos p ON c.id_pedido = p.id_pedido
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                ${whereCompClause}
                ORDER BY c.fecha_emision DESC
                LIMIT 25;
            `;
            const resComprobantes = await pool.query(queryComprobantes, paramsComp);

            // --- 2. BÚSQUEDA DE PEDIDOS ---
            const wherePedidos = [];
            const paramsPed = [];
            let pIdxPed = 1;

            if (dia) {
                wherePedidos.push(`EXTRACT(DAY FROM p.creado_en) = $${pIdxPed++}`);
                paramsPed.push(dia);
            }
            if (mes) {
                wherePedidos.push(`EXTRACT(MONTH FROM p.creado_en) = $${pIdxPed++}`);
                paramsPed.push(mes);
            }
            if (anio) {
                wherePedidos.push(`EXTRACT(YEAR FROM p.creado_en) = $${pIdxPed++}`);
                paramsPed.push(anio);
            }
            if (cliente) {
                wherePedidos.push(`(cl.razon_social_o_nombre ILIKE $${pIdxPed} OR cl.nombre_comercial ILIKE $${pIdxPed} OR cl.numero_documento ILIKE $${pIdxPed})`);
                paramsPed.push(`%${cliente}%`);
                pIdxPed++;
            }
            if (terminoLibre) {
                wherePedidos.push(`(
                    p.id_pedido::text ILIKE $${pIdxPed} OR 
                    cl.razon_social_o_nombre ILIKE $${pIdxPed} OR 
                    cl.nombre_comercial ILIKE $${pIdxPed} OR 
                    cl.numero_documento ILIKE $${pIdxPed} OR 
                    p.solicitado_por ILIKE $${pIdxPed} OR 
                    p.usuario_creador ILIKE $${pIdxPed} OR 
                    p.estado_pedido ILIKE $${pIdxPed}
                )`);
                paramsPed.push(`%${terminoLibre}%`);
                pIdxPed++;
            }

            const wherePedClause = wherePedidos.length > 0 ? `WHERE ${wherePedidos.join(' AND ')}` : '';
            const queryPedidos = `
                SELECT 
                    p.id_pedido,
                    p.id_cliente,
                    p.estado_pedido,
                    p.monto_total,
                    p.solicitado_por,
                    p.usuario_creador,
                    p.etiquetado,
                    p.sellado_vacio,
                    p.creado_en,
                    cl.razon_social_o_nombre AS cliente_nombre,
                    cl.nombre_comercial AS cliente_comercial,
                    cl.numero_documento AS cliente_ruc
                FROM pedidos p
                LEFT JOIN clientes cl ON p.id_cliente = cl.id_cliente
                ${wherePedClause}
                ORDER BY p.creado_en DESC
                LIMIT 25;
            `;
            const resPedidos = await pool.query(queryPedidos, paramsPed);

            res.status(200).json({
                exito: true,
                consulta: q,
                criterios: parsed,
                total: resComprobantes.rows.length + resPedidos.rows.length,
                facturas: resComprobantes.rows,
                pedidos: resPedidos.rows
            });

        } catch (error) {
            console.error('Error en búsqueda global:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al realizar la búsqueda', error: error.message });
        }
    }
};

module.exports = busquedaController;

