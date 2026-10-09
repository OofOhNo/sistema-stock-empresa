const pool = require('../config/db');

const facturaController = {

    emitirComprobante: async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { id_pedido, tipo_comprobante } = req.body; // '01' para Factura, '03' para Boleta

            if (!id_pedido || !tipo_comprobante) {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Faltan datos obligatorios (id_pedido o tipo_comprobante).' });
            }
            if (tipo_comprobante !== '01' && tipo_comprobante !== '03') {
                await client.query('ROLLBACK');
                return res.status(400).json({ exito: false, mensaje: 'Tipo de comprobante inválido. Use "01" (Factura) o "03" (Boleta).' });
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
                    p.id_pedido, p.monto_total, p.id_sucursal,
                    c.tipo_documento, c.numero_documento, c.razon_social_o_nombre, c.direccion, c.email
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                WHERE p.id_pedido = $1;
            `;
            const resPedido = await client.query(queryPedido, [id_pedido]);
            const pedido = resPedido.rows[0];

            const queryDetalle = `
                SELECT 
                    pr.sku, pr.nombre AS descripcion, dp.cantidad, dp.precio_unitario, dp.subtotal
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
            
            const resCorrelativo = await client.query("SELECT MAX(correlativo) as max_corr FROM comprobantes WHERE serie = $1", [serie]);
            const maxCorr = resCorrelativo.rows[0].max_corr ? parseInt(resCorrelativo.rows[0].max_corr, 10) : 0;
            const correlativo = maxCorr + 1;

            //simulacion de respuesta SUNAT
            const respuestaSunat = {
                aceptada_por_sunat: true,
                codigo_hash: "HashB64EncodedSimuladoDeSunatEjemplo789123=",
                mensaje_cdr: "La factura ha sido aceptada exitosamente por la SUNAT."
            };

            //guardar el comprobante en la base de datos
            const queryComprobante = `
                INSERT INTO comprobantes (id_pedido, tipo_comprobante, serie, correlativo, monto_subtotal, monto_igv, monto_total, estado_sunat, codigo_hash, mensaje_cdr)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;
            const resComprobante = await client.query(queryComprobante, [
                id_pedido, 
                tipo_comprobante, 
                serie, 
                correlativo, 
                montoSubtotal.toFixed(2), // <--- Sin guion bajo
                montoIgv.toFixed(2),      // <--- Sin guion bajo
                montoTotal.toFixed(2), 
                'ACEPTADO', 
                respuestaSunat.codigo_hash, 
                respuestaSunat.mensaje_cdr
            ]);

            //CAMBIAR EL ESTADO DEL PEDIDO A FACTURADO PERMANENTEMENTE
            await client.query(`
                UPDATE pedidos 
                SET estado_pedido = 'FACTURADO' 
                WHERE id_pedido = $1;
            `, [id_pedido]);

            await client.query('COMMIT'); //todo ok, guardamos cambios

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
    }

};

module.exports = facturaController;