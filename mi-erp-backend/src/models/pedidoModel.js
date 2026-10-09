const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const Pedido = {

    //crear un pedido y descontar/reservar stock de forma segura (usando Transacciones)
    crearPedido: async (id_cliente, id_usuario, id_ubicacion, fecha_limite_despacho, items, solicitado_por = null) => {
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
                INSERT INTO pedidos (id_cliente, id_usuario, id_ubicacion, estado_pedido, fecha_limite_despacho, monto_total, solicitado_por)
                VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, $6)
                RETURNING *;
            `;
            const resultadoPedido = await client.query(queryPedido, [
                id_cliente, id_usuario, id_ubicacion, fecha_limite_despacho, monto_total, solicitado_por
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
                    WHERE id_producto = $2 AND id_ubicacion = $3;
                `;
                await client.query(queryInventario, [item.cantidad, item.id_producto, id_ubicacion]);
            }

            await registrarAuditoria(client, id_usuario, 'CREAR_PEDIDO', 'pedidos', nuevoPedido.id_pedido, null, nuevoPedido);

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
    obtenerParaCalendario: async (id_ubicacion, rol) => {
        try {
            let query = `
                SELECT 
                    p.id_pedido, p.estado_pedido, p.fecha_limite_despacho, p.monto_total, p.solicitado_por,
                    c.razon_social_o_nombre AS cliente, 
                    s.nombre AS ubicacion,
                    u.nombre AS creador
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                LEFT JOIN ubicaciones s ON p.id_ubicacion = s.id_ubicacion
                LEFT JOIN usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.fecha_limite_despacho >= date_trunc('week', now())
                  AND p.fecha_limite_despacho < date_trunc('week', now()) + interval '1 week'
            `;

            const params = [];
            if (rol !== 'Admin Central' && id_ubicacion) {
                query += ` AND p.id_ubicacion = $1`;
                params.push(id_ubicacion);
            }

            query += ` ORDER BY p.fecha_limite_despacho ASC;`;

            const resultado = await pool.query(query, params);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    },

    //cancelar pedido y liberar el stock reservado
    cancelarPedido: async (id_pedido, usuario) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //verificar que el pedido exista y este PENDIENTE
            const resPedido = await client.query("SELECT estado_pedido, id_ubicacion FROM pedidos WHERE id_pedido = $1", [id_pedido]);
            if (resPedido.rows.length === 0) throw new Error("Pedido no encontrado.");
            if (resPedido.rows[0].estado_pedido !== 'PENDIENTE') throw new Error("Solo se pueden cancelar pedidos pendientes.");

            const id_ubicacion = resPedido.rows[0].id_ubicacion;
            if (usuario.nombre_rol !== 'Admin Central' && id_ubicacion !== usuario.id_ubicacion) {
                throw new Error("No tienes permisos para cancelar pedidos de otra ubicacion.");
            }

            //cambiar el estado a CANCELADO
            await client.query("UPDATE pedidos SET estado_pedido = 'CANCELADO' WHERE id_pedido = $1", [id_pedido]);

            //devolver el stock (restar de cantidad_reservada)
            const resDetalles = await client.query("SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1", [id_pedido]);
            
            for (let item of resDetalles.rows) {
                await client.query(`
                    UPDATE inventario 
                    SET cantidad_reservada = cantidad_reservada - $1
                    WHERE id_producto = $2 AND id_ubicacion = $3;
                `, [item.cantidad, item.id_producto, id_ubicacion]);
            }

            await registrarAuditoria(client, usuario.id_usuario, 'CANCELAR_PEDIDO', 'pedidos', id_pedido, resPedido.rows[0], { estado_pedido: 'CANCELADO' });

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