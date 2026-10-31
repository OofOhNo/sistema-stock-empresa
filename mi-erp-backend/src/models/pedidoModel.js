const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const Pedido = {

    // Crear un pedido con precios validados desde el servidor
    crearPedido: async (id_cliente, id_usuario, id_ubicacion, fecha_limite_despacho, items, solicitado_por = null, etiquetado = false, sellado_vacio = false) => {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            let monto_total = 0;
            const itemsValidados = [];

            for (const item of items) {
                const cant = parseInt(item.cantidad, 10);
                if (isNaN(cant) || cant <= 0) {
                    throw new Error(`La cantidad ingresada no es válida.`);
                }

                const resProd = await client.query(
                    'SELECT id_producto, nombre, precio_venta, activo FROM productos WHERE id_producto = $1',
                    [item.id_producto]
                );

                if (resProd.rows.length === 0) {
                    throw new Error(`Uno de los productos seleccionados no existe.`);
                }
                const prodDB = resProd.rows[0];
                if (!prodDB.activo) {
                    throw new Error(`El producto "${prodDB.nombre}" está desactivado y no puede venderse.`);
                }

                const precioServidor = parseFloat(prodDB.precio_venta);
                const subtotal = cant * precioServidor;
                monto_total += subtotal;

                const resStock = await client.query(
                    'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE',
                    [item.id_producto, id_ubicacion]
                );

                if (resStock.rows.length === 0) {
                    throw new Error(`No hay stock registrado para "${prodDB.nombre}" en esta sede.`);
                }
                const inv = resStock.rows[0];
                const disponible = inv.cantidad_fisica - inv.cantidad_reservada;
                if (disponible < cant) {
                    throw new Error(`Stock insuficiente para "${prodDB.nombre}" en esta sede. Disponible: ${disponible}, Pedido: ${cant}.`);
                }

                itemsValidados.push({
                    id_producto: item.id_producto,
                    cantidad: cant,
                    precio_unitario: precioServidor,
                    subtotal: subtotal
                });
            }

            const queryPedido = `
                INSERT INTO pedidos (
                    id_cliente, id_usuario, id_ubicacion, estado_pedido, 
                    fecha_limite_despacho, monto_total, solicitado_por, 
                    etiquetado, sellado_vacio, stock_descontado
                )
                VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, $6, $7, $8, false)
                RETURNING *;
            `;
            const resultadoPedido = await client.query(queryPedido, [
                id_cliente, id_usuario, id_ubicacion, fecha_limite_despacho, monto_total.toFixed(2), solicitado_por, Boolean(etiquetado), Boolean(sellado_vacio)
            ]);
            const nuevoPedido = resultadoPedido.rows[0];

            for (const item of itemsValidados) {
                await client.query(`
                    INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, precio_unitario, subtotal)
                    VALUES ($1, $2, $3, $4, $5);
                `, [
                    nuevoPedido.id_pedido, item.id_producto, item.cantidad, item.precio_unitario, item.subtotal.toFixed(2)
                ]);

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

    // Obtener los pedidos para el calendario de logística, despacho y facturación
    obtenerParaCalendario: async (id_ubicacion, rol, id_usuario = null, puede_ver_otras_ubicaciones = false) => {
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
                    COALESCE(p.stock_descontado, false) AS stock_descontado,
                    p.despachado_en,
                    EXISTS (
                        SELECT 1 FROM comprobantes comp
                        WHERE comp.id_pedido = p.id_pedido
                          AND comp.tipo_comprobante IN ('01', '03')
                          AND comp.estado_sunat != 'ANULADO'
                    ) AS tiene_factura,
                    (
                        SELECT comp.id_comprobante FROM comprobantes comp
                        WHERE comp.id_pedido = p.id_pedido
                          AND comp.tipo_comprobante IN ('01', '03')
                          AND comp.estado_sunat != 'ANULADO'
                        ORDER BY comp.id_comprobante DESC LIMIT 1
                    ) AS id_comprobante_activo,
                    (
                        SELECT CONCAT(comp.serie, '-', LPAD(comp.correlativo::text, 6, '0'))
                        FROM comprobantes comp
                        WHERE comp.id_pedido = p.id_pedido
                          AND comp.tipo_comprobante IN ('01', '03')
                          AND comp.estado_sunat != 'ANULADO'
                        ORDER BY comp.id_comprobante DESC LIMIT 1
                    ) AS numero_comprobante,
                    (SELECT COUNT(*) FROM fotos_pedidos fp WHERE fp.id_pedido = p.id_pedido AND fp.expira_en > CURRENT_TIMESTAMP)::int AS total_fotos,
                    c.numero_documento AS ruc_cliente,
                    c.tipo_documento AS tipo_documento_cliente,
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
                WHERE (
                    p.fecha_limite_despacho IS NULL
                    OR p.fecha_limite_despacho >= date_trunc('week', now()) - interval '16 weeks'
                    OR p.estado_pedido IN ('PENDIENTE', 'LISTO_DESPACHO')
                )
            `;

            const params = [];
            const puedeVerTodasUbicaciones = rol === 'Admin Central' || puede_ver_otras_ubicaciones === true;

            if (!puedeVerTodasUbicaciones) {
                if (id_ubicacion) {
                    query += ` AND p.id_ubicacion = $1`;
                    params.push(id_ubicacion);
                } else {
                    query += ` AND 1 = 0`;
                }
            }

            query += ` ORDER BY COALESCE(p.fecha_limite_despacho, p.creado_en) ASC, p.id_pedido DESC;`;

            const resultado = await pool.query(query, params);

            let permitidosSet = new Set();
            if (rol !== 'Admin Central' && id_usuario) {
                const resPermisos = await pool.query(
                    'SELECT id_cliente FROM permisos_celulares_clientes WHERE id_usuario = $1',
                    [id_usuario]
                );
                permitidosSet = new Set(resPermisos.rows.map(r => r.id_cliente));
            }

            return resultado.rows.map(row => {
                const puedeVer = rol === 'Admin Central' || permitidosSet.has(row.id_cliente);
                return {
                    ...row,
                    celular: puedeVer ? row.celular : null
                };
            });
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
            if (anterior.estado_pedido === 'CANCELADO') {
                throw new Error('No se puede preparar un pedido cancelado.');
            }
            if (anterior.estado_pedido === 'DESPACHADO') {
                throw new Error('Este pedido ya fue despachado.');
            }

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
            if (anterior.estado_pedido === 'CANCELADO') {
                throw new Error('No se puede despachar un pedido cancelado.');
            }

            // Si aún no se había descontado el stock físico (ej: se despacha antes de facturar), descontarlo una única vez
            if (!anterior.stock_descontado) {
                const resDetalles = await client.query(
                    'SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1',
                    [id_pedido]
                );

                for (const item of resDetalles.rows) {
                    await client.query(`
                        INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                        VALUES ($1, $2, $3, 'SALIDA', $4, $5);
                    `, [
                        item.id_producto,
                        anterior.id_ubicacion,
                        usuario.id_usuario || anterior.id_usuario,
                        item.cantidad,
                        `Salida por Despacho de Pedido #${id_pedido}`
                    ]);

                    await client.query(`
                        UPDATE inventario
                        SET cantidad_fisica = cantidad_fisica - $1,
                            cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                            ultima_actualizacion = CURRENT_TIMESTAMP
                        WHERE id_producto = $2 AND id_ubicacion = $3;
                    `, [item.cantidad, item.id_producto, anterior.id_ubicacion]);
                }
            }

            const resUpdate = await client.query(`
                UPDATE pedidos
                SET estado_pedido = 'DESPACHADO',
                    stock_descontado = true,
                    despachado_en = COALESCE(despachado_en, CURRENT_TIMESTAMP)
                WHERE id_pedido = $1
                RETURNING *;
            `, [id_pedido]);

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

    // Cancelar pedido (Pendiente o Listo para Despacho sin factura activa) y liberar stock
    cancelarPedido: async (id_pedido, usuario) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resPedido = await client.query(
                "SELECT * FROM pedidos WHERE id_pedido = $1 FOR UPDATE", 
                [id_pedido]
            );
            if (resPedido.rows.length === 0) throw new Error("Pedido no encontrado.");

            const pedido = resPedido.rows[0];
            if (pedido.estado_pedido === 'CANCELADO') {
                throw new Error("Este pedido ya está cancelado.");
            }

            // Verificar que no tenga un comprobante electrónico vigente
            const resComp = await client.query(`
                SELECT serie, correlativo
                FROM comprobantes
                WHERE id_pedido = $1 AND tipo_comprobante IN ('01', '03') AND estado_sunat != 'ANULADO'
                LIMIT 1;
            `, [id_pedido]);

            if (resComp.rows.length > 0) {
                const c = resComp.rows[0];
                throw new Error(`Este pedido ya tiene el comprobante ${c.serie}-${c.correlativo} emitido. Anula primero el comprobante en la pestaña Facturación.`);
            }

            if (pedido.estado_pedido !== 'PENDIENTE' && pedido.estado_pedido !== 'LISTO_DESPACHO') {
                throw new Error("Solo se pueden cancelar pedidos que aún no hayan salido de almacén.");
            }

            const puedeVerTodas = usuario.nombre_rol === 'Admin Central' || usuario.puede_ver_otras_ubicaciones === true;
            if (!puedeVerTodas && pedido.id_ubicacion !== usuario.id_ubicacion) {
                throw new Error("No tienes permiso para cancelar pedidos de otra sede.");
            }

            const resDetalles = await client.query("SELECT id_producto, cantidad FROM detalle_pedidos WHERE id_pedido = $1", [id_pedido]);
            
            for (const item of resDetalles.rows) {
                if (pedido.stock_descontado) {
                    await client.query(`
                        UPDATE inventario 
                        SET cantidad_fisica = cantidad_fisica + $1,
                            ultima_actualizacion = CURRENT_TIMESTAMP
                        WHERE id_producto = $2 AND id_ubicacion = $3;
                    `, [item.cantidad, item.id_producto, pedido.id_ubicacion]);

                    await client.query(`
                        INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                        VALUES ($1, $2, $3, 'INGRESO', $4, $5);
                    `, [
                        item.id_producto,
                        pedido.id_ubicacion,
                        usuario.id_usuario,
                        item.cantidad,
                        `Devolución por Cancelación de Pedido #${id_pedido}`
                    ]);
                } else {
                    await client.query(`
                        UPDATE inventario 
                        SET cantidad_reservada = GREATEST(0, cantidad_reservada - $1),
                            ultima_actualizacion = CURRENT_TIMESTAMP
                        WHERE id_producto = $2 AND id_ubicacion = $3;
                    `, [item.cantidad, item.id_producto, pedido.id_ubicacion]);
                }
            }

            await client.query(
                "UPDATE pedidos SET estado_pedido = 'CANCELADO', stock_descontado = false WHERE id_pedido = $1",
                [id_pedido]
            );

            await registrarAuditoria(
                client, 
                usuario.id_usuario, 
                'CANCELAR_PEDIDO', 
                'pedidos', 
                id_pedido, 
                pedido, 
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
