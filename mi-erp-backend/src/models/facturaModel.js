const pool = require('../config/db');

const Factura = {

    //obtener los datos completos de un pedido para armar la factura
    obtenerDatosParaFactura: async (id_pedido) => {
        try {
            const queryPedido = `
                SELECT 
                    p.id_pedido, p.monto_total, p.id_sucursal,
                    c.tipo_documento, c.numero_documento, c.razon_social_o_nombre, c.direccion, c.email
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                WHERE p.id_pedido = $1;
            `;
            const resPedido = await pool.query(queryPedido, [id_pedido]);
            if (resPedido.rows.length === 0) return null;

            const pedido = resPedido.rows[0];

            //obtener los detalles (productos) del pedido
            const queryDetalle = `
                SELECT 
                    pr.sku, pr.nombre AS descripcion, dp.cantidad, dp.precio_unitario, dp.subtotal
                FROM detalle_pedidos dp
                JOIN productos pr ON dp.id_producto = pr.id_producto
                WHERE dp.id_pedido = $1;
            `;
            const resDetalle = await pool.query(queryDetalle, [id_pedido]);

            return {
                ...pedido,
                items: resDetalle.rows
            };
        } catch (error) {
            throw error;
        }
    },

    //guardar el comprobante generado en la base de datos
    guardarComprobanteYActualizarPedido: async (datosComprobante, id_pedido) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //VALIDACION CLAVE: verificar que el pedido estr PENDIENTE
            const resPedidoCheck = await client.query("SELECT estado_pedido FROM pedidos WHERE id_pedido = $1", [id_pedido]);
            if (resPedidoCheck.rows.length === 0) {
                throw new Error("El pedido no existe.");
            }
            if (resPedidoCheck.rows.length > 0 && resPedidoCheck.rows[0].estado_pedido !== 'PENDIENTE') {
                throw new Error("Este pedido ya ha sido facturado o cancelado anteriormente.");
            }

            //guardar el comprobante
            const { tipo_comprobante, serie, correlativo, monto_subtotal, monto_igv, monto_total, estado_sunat, codigo_hash, mensaje_cdr } = datosComprobante;
            const queryComprobante = `
                INSERT INTO comprobantes (id_pedido, tipo_comprobante, serie, correlativo, monto_subtotal, monto_igv, monto_total, estado_sunat, codigo_hash, mensaje_cdr)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;
            const resComprobante = await client.query(queryComprobante, [
                id_pedido, tipo_comprobante, serie, correlativo, 
                monto_subtotal, monto_igv, monto_total, 
                estado_sunat, codigo_hash, mensaje_cdr
            ]);

            //ACTUALIZAR AUTOMATICAMENTE EL ESTADO DEL PEDIDO A FACTURADO
            const queryActualizarPedido = `
                UPDATE pedidos 
                SET estado_pedido = 'FACTURADO' 
                WHERE id_pedido = $1;
            `;
            await client.query(queryActualizarPedido, [id_pedido]);

            await client.query('COMMIT');
            return resComprobante.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

};

module.exports = Factura;