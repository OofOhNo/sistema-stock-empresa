const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const Pedido = {

    // Crear un pedido con PRECIOS VALIDADOS DESDE EL SERVIDOR (Seguridad Etapa 3)
    crearPedido: async (id_cliente, id_usuario, id_ubicacion, fecha_limite_despacho, items, solicitado_por = null, etiquetado = false, sellado_vacio = false) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            let monto_total = 0;
            const itemsValidados = [];

            // REGLA DE SEGURIDAD ETAPA 3: Precios exclusivamente desde la base de datos (servidor)
            for (const item of items) {
                const cant = parseInt(item.cantidad, 10);
                if (isNaN(cant) || cant <= 0) {
                    throw new Error(`Cantidad inválida para el producto ID ${item.id_producto}.`);
                }

                // Consultar precio y estado real del producto en la DB
                const resProd = await client.query(
                    'SELECT id_producto, nombre, precio_venta, activo FROM productos WHERE id_producto = $1',
                    [item.id_producto]
                );

                if (resProd.rows.length === 0) {
                    throw new Error(`El producto con ID ${item.id_producto} no existe.`);
                }
                const prodDB = resProd.rows[0];
                if (!prodDB.activo) {
                    throw new Error(`El producto "${prodDB.nombre}" está inactivo y no puede ser vendido.`);
                }

                const precioServidor = parseFloat(prodDB.precio_venta);
                const subtotal = cant * precioServidor;
                monto_total += subtotal;

                // Verificar stock disponible en la ubicación
                const resStock = await client.query(
                    'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE',
                    [item.id_producto, id_ubicacion]
                );

                if (resStock.rows.length === 0) {
                    throw new Error(`No hay registro de stock para "${prodDB.nombre}" en la ubicación seleccionada.`);
                }
                const inv = resStock.rows[0];
                const disponible = inv.cantidad_fisica - inv.cantidad_reservada;
                if (disponible < cant) {
                    throw new Error(`Stock insuficiente para "${prodDB.nombre}". Disponible: ${disponible}, Solicitado: ${cant}.`);
                }

                itemsValidados.push({
                    id_producto: item.id_producto,
                    cantidad: cant,
                    precio_unitario: precioServidor,
                    subtotal: subtotal
                });
            }

            // Insertar cabecera del pedido
            const queryPedido = `
                INSERT INTO pedidos (id_cliente, id_usuario, id_ubicacion, estado_pedido, fecha_limite_despacho, monto_total, solicitado_por, etiquetado, sellado_vacio)
                VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, $6, $7, $8)
                RETURNING *;
            `;
            const resultadoPedido = await client.query(queryPedido, [
                id_cliente, id_usuario, id_ubicacion, fecha_limite_despacho, monto_total.toFixed(2), solicitado_por, Boolean(etiquetado), Boolean(sellado_vacio)
            ]);
            const nuevoPedido = resultadoPedido.rows[0];

            // Insertar detalles y reservar stock
            for (const item of itemsValidados) {
                const queryDetalle = `
                    INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
                    VALUES ($1, $2, $3, $4, $5);
                `;
                await client.query(queryDetalle, [
                    nuevoPedido.id_pedido, item.id_producto, item.cantidad, item.precio_unitario, item.subtotal.toFixed(2)
                ]);

                // Aumentar cantidad_reservada
                await client.query(`
                    UPDATE inventario 
                    SET cantidad_reservada = cantidad_reservada + $1,
                        ultima_actualizacion = CURRENT_TIMESTAMP
                    WHERE id_producto = $2 AND id_ubicacion = $3;
                `, [item.cantidad, item.id_producto, id_ubicacion]);
            }

            await registrarAuditoria(
                client, 
                id_usuario, 
                'CREAR_PEDIDO', 
                'pedidos', 
                nuevoPedido.id_pedido, 
                null, 
                nuevoPedido
            );

            await client.query('COMMIT');
            return nuevoPedido;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    // Obtener los pedidos para el calendario de logística y despachos
    obtenerParaCalendario: async (id_ubicacion, rol) => {
        try {
            let query = `
                SELECT 
                    p.id_pedido, 
                    p.id_cliente,
                    p.estado_pedido, 
                    p.fecha_limite_despacho, 
                    p.monto_total, 
                    p.etiquetado,
                    p.sellado_vacio,
                    p.solicitado_por,
                    p.id_ubicacion,
                    c.numero_documento AS ruc_cliente,
                    c.razon_social_o_nombre AS cliente, 
                    c.nombre_comercial,
                    c.contacto,
                    c.cargo,
                    c.celular,
                    s.nombre AS ubicacion,
                    u.nombre_completo AS creador
                FROM pedidos p
                JOIN clientes c ON p.id_cliente = c.id_cliente
                LEFT JOIN ubicaciones s ON p.id_ubicacion = s.id_ubicacion
                LEFT JOIN usuarios u ON p.id_usuario = u.id_usuario
                WHERE p.fecha_limite_despacho >= date_trunc('week', now()) - interval '8 weeks'
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

    marcarListoDespacho: async (id_pedido, usuario) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const resPedido = await client.query('SELECT * FROM pedidos WHERE id_pedido = $1 FOR UPDATE', [id_pedido]);
            if (resPedido.rows.length === 0) throw new Error('Pedido no encontrado.');
            
            const anterior = resPedido.rows[0];
            const resUpdate = await client.query(
                "UPDATE pedidos SET estado_pedido = 'LISTO_DESPACHO' WHERE id_pedido = $1 RETURNING *",
                [id_pedido]
            );

            await registrarAuditoria(
                client,
                usuario.id_usuario,
                'LISTO_DESPACHO_PEDIDO',
                'pedidos',
                id_pedido,
                anterior,
                resUpdate.rows[0]
            );

            await client.query('COMMIT');
            return resUpdate.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    marcarDespachado: async (id_pedido, usuario) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const resPedido = await client.query('SELECT * FROM pedidos WHERE id_pedido = $1 FOR UPDATE', [id_pedido]);
            if (resPedido.rows.length === 0) throw new Error('Pedido no encontrado.');
            
            const anterior = resPedido.rows[0];
            const resUpdate = await client.query(
                "UPDATE pedidos SET estado_pedido = 'DESPACHADO' WHERE id_pedido = $1 RETURNING *",
                [id_pedido]
            );

            await registrarAuditoria(
                client,
                usuario.id_usuario,
                'DESPACHAR_PEDIDO',
                'pedidos',
                id_pedido,
                anterior,
                resUpdate.rows[0]
            );

            await client.query('COMMIT');
            return resUpdate.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    // Cancelar pedido y liberar el stock reservado
    cancelarPedido: async (id_pedido, usuario) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resPedido = await client.query(
                "SELECT estado_pedido, id_ubicacion FROM pedidos WHERE id_pedido = $1 FOR UPDATE", 
                [id_pedido]
            );
            if (resPedido.rows.length === 0) throw new Error("Pedido no encontrado.");
            if (resPedido.rows[0].estado_pedido !== 'PENDIENTE') throw new Error("Solo se pueden cancelar pedidos pendientes.");

            const id_ubicacion = resPedido.rows[0].id_ubicacion;
            if (usuario.nombre_rol !== 'Admin Central' && id_ubicacion !== usuario.id_ubicacion) {
                throw new Error("No tienes permisos para cancelar pedidos de otra ubicación.");
            }

            await client.query("UPDATE pedidos SET estado_pedido = 'CANCELADO' WHERE id_pedido = $1", [id_pedido]);

            // Devolver el stock (restar de cantidad_reservada)
            const resDetalles = await client.query("SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1", [id_pedido]);
            
            for (let item of resDetalles.rows) {
                await client.query(`
                    UPDATE inventario 
                    SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                        ultima_actualizacion = CURRENT_TIMESTAMP
                    WHERE id_producto = $2 AND id_ubicacion = $3;
                `, [item.cantidad, item.id_producto, id_ubicacion]);
            }

            await registrarAuditoria(
                client, 
                usuario.id_usuario, 
                'CANCELAR_PEDIDO', 
                'pedidos', 
                id_pedido, 
                resPedido.rows[0], 
                { estado_pedido: 'CANCELADO' }
            );

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