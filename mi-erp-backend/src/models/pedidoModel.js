const pool = require('../config/db');

const Pedido = {

    //crear un pedido y descontar/reservar stock de forma segura (usando Transacciones)
    crearPedido: async (id_cliente, id_usuario, id_sucursal, fecha_limite_despacho, items) => {
        //las transacciones aseguran que si algo falla, no se rompa la base de datos
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN'); //iniciamos transaccion

            //calcular el monto total sumando los items
            let monto_total = 0;
            items.forEach(item => {
                monto_total += item.cantidad * item.precio_unitario;
            });

            //insertar la cabecera del pedido
            const queryPedido = `
                INSERT INTO pedidos (id_cliente, id_usuario, id_sucursal, estado_pedido, fecha_limite_despacho, monto_total)
                VALUES ($1, $2, $3, 'PENDIENTE', $4, $5)
                RETURNING *;
            `;
            const resultadoPedido = await client.query(queryPedido, [
                id_cliente, id_usuario, id_sucursal, fecha_limite_despacho, monto_total
            ]);
            const nuevoPedido = resultadoPedido.rows[0];

            //insertar los detalles y actualizar el inventario (reservar stock)
            for (let item of items) {
                const subtotal = item.cantidad * item.precio_unitario;

                //insertar detalle
                const queryDetalle = `
                    INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
                    VALUES ($1, $2, $3, $4, $5);
                `;
                await client.query(queryDetalle, [
                    nuevoPedido.id_pedido, item.id_producto, item.cantidad, item.precio_unitario, subtotal
                ]);

                //actualizar inventario (aumentamos la cantidad_reservada)
                const queryInventario = `
                    UPDATE inventario 
                    SET cantidad_reservada = cantidad_reservada + $1
                    WHERE id_producto = $2 AND id_sucursal = $3;
                `;
                await client.query(queryInventario, [item.cantidad, item.id_producto, id_sucursal]);
            }

            await client.query('COMMIT'); //todo salio bien, guardamos cambios permanentemente
            return nuevoPedido;

        } catch (error) {
            await client.query('ROLLBACK'); //hubo un error, deshacemos todo
            throw error;
        } finally {
            client.release(); //liberamos la conexion
        }
    },

    //obtener los pedidos para el calendario de logistica
    obtenerParaCalendario: async (id_sucursal, rol) => {
        try {
            let query = `
                SELECT 
                    p.id_pedido, p.estado_pedido, p.fecha_limite_despacho, p.monto_total, 
                    c.razon_social_o_nombre AS cliente, 
                    s.nombre AS sucursal,
                    u.nombre AS creador
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                LEFT JOIN sucursales s ON p.id_sucursal = s.id_sucursal
                LEFT JOIN usuarios u ON p.id_usuario = u.id_usuario
            `;

            //si no es Admin Central, filtramos estrictamente por su sucursal
            const params = [];
            if (rol !== 'Admin Central' && id_sucursal) {
                query += ` WHERE p.id_sucursal = $1`;
                params.push(id_sucursal);
            }

            query += ` ORDER BY p.fecha_limite_despacho ASC;`;

            const resultado = await pool.query(query, params);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    },

    //cancelar pedido y liberar el stock reservado
    cancelarPedido: async (id_pedido) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //verificar que el pedido exista y este PENDIENTE
            const resPedido = await client.query("SELECT estado_pedido, id_sucursal FROM pedidos WHERE id_pedido = $1", [id_pedido]);
            if (resPedido.rows.length === 0) throw new Error("Pedido no encontrado.");
            if (resPedido.rows[0].estado_pedido !== 'PENDIENTE') throw new Error("Solo se pueden cancelar pedidos pendientes.");

            const id_sucursal = resPedido.rows[0].id_sucursal;

            //cambiar el estado a CANCELADO
            await client.query("UPDATE pedidos SET estado_pedido = 'CANCELADO' WHERE id_pedido = $1", [id_pedido]);

            //devolver el stock (restar de cantidad_reservada)
            const resDetalles = await client.query("SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1", [id_pedido]);
            
            for (let item of resDetalles.rows) {
                await client.query(`
                    UPDATE inventario 
                    SET cantidad_reservada = cantidad_reservada - $1
                    WHERE id_producto = $2 AND id_sucursal = $3;
                `, [item.cantidad, item.id_producto, id_sucursal]);
            }

            await client.query('COMMIT');
            return true;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

};

module.exports = Pedido;