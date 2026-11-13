const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const kardexController = {

    // Listar movimientos con filtro de ubicación y seguridad
    listarMovimientos: async (req, res) => {
        try {
            const { nombre_rol, id_ubicacion, puede_ver_otras_ubicaciones } = req.usuario;
            const ubicacionFiltro = req.query.id_ubicacion;
            const puedeVerTodas = nombre_rol === 'Admin Central' || puede_ver_otras_ubicaciones === true;

            let query = `
                SELECT 
                    k.id_movimiento, 
                    k.tipo_movimiento, 
                    k.cantidad, 
                    k.motivo, 
                    k.fecha_movimiento, 
                    k.estado,
                    k.id_ubicacion,
                    ub.nombre AS nombre_ubicacion,
                    p.id_producto,
                    p.nombre AS nombre_producto, 
                    p.sku,
                    COALESCE(p.unidad_medida, 'Unidad') AS unidad_medida,
                    COALESCE(u.nombre_completo, 'Sistema Automático') AS usuario_creador,
                    ua.nombre_completo AS usuario_anulador
                FROM movimientos_kardex k
                JOIN productos p ON k.id_producto = p.id_producto
                JOIN ubicaciones ub ON k.id_ubicacion = ub.id_ubicacion
                LEFT JOIN usuarios u ON k.id_usuario = u.id_usuario
                LEFT JOIN usuarios ua ON k.id_usuario_anulador = ua.id_usuario
            `;

            const params = [];

            if (puedeVerTodas) {
                if (ubicacionFiltro) {
                    query += ` WHERE k.id_ubicacion = $1`;
                    params.push(ubicacionFiltro);
                }
            } else {
                query += ` WHERE k.id_ubicacion = $1`;
                params.push(id_ubicacion);
            }

            query += ` ORDER BY k.fecha_movimiento DESC;`;

            const { rows } = await pool.query(query, params);
            res.status(200).json({ exito: true, movimientos: rows });
        } catch (error) {
            console.error("Error al obtener movimientos:", error);
            res.status(500).json({ exito: false, mensaje: "Error al obtener el historial de entradas y salidas.", error: error.message });
        }
    },

    // Registrar un nuevo ingreso o salida manual
    registrarMovimiento: async (req, res) => {
        const { id_producto, id_ubicacion, cantidad, tipo_movimiento, motivo } = req.body;
        const id_usuario = req.usuario.id_usuario;
        const puedeVerTodas = req.usuario.nombre_rol === 'Admin Central' || req.usuario.puede_ver_otras_ubicaciones === true;
        const ubicacionMovimiento = (puedeVerTodas && id_ubicacion) ? id_ubicacion : req.usuario.id_ubicacion;

        if (!id_producto || !ubicacionMovimiento || !cantidad || !tipo_movimiento || !motivo) {
            return res.status(400).json({ exito: false, mensaje: "Por favor completa todos los datos: producto, sede, cantidad, tipo y motivo." });
        }

        const cantidadNum = Number(cantidad);
        if (isNaN(cantidadNum) || cantidadNum <= 0) {
            return res.status(400).json({ exito: false, mensaje: "La cantidad debe ser mayor a 0." });
        }

        if (tipo_movimiento !== 'INGRESO' && tipo_movimiento !== 'SALIDA') {
            return res.status(400).json({ exito: false, mensaje: "El tipo debe ser Entrada (INGRESO) o Salida (SALIDA)." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let stockCheck = await client.query(
                'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE', 
                [id_producto, ubicacionMovimiento]
            );

            if (stockCheck.rows.length === 0) {
                if (tipo_movimiento === 'INGRESO') {
                    await client.query(
                        'INSERT INTO inventario (id_producto, id_ubicacion, cantidad_fisica, cantidad_reservada) VALUES ($1, $2, 0, 0)',
                        [id_producto, ubicacionMovimiento]
                    );
                    stockCheck = await client.query(
                        'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE', 
                        [id_producto, ubicacionMovimiento]
                    );
                } else {
                    throw new Error("Este producto todavía no tiene stock registrado en esta sede.");
                }
            }

            const disponible = Number(stockCheck.rows[0].cantidad_fisica) - Number(stockCheck.rows[0].cantidad_reservada);

            if (tipo_movimiento === 'SALIDA' && disponible < cantidadNum) {
                throw new Error(`No hay suficiente stock disponible en esta sede. Disponible: ${disponible}, Solicitado: ${cantidadNum}.`);
            }

            const queryKardex = `
                INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id_movimiento, fecha_movimiento;
            `;
            const resMovimiento = await client.query(queryKardex, [
                id_producto, 
                ubicacionMovimiento, 
                id_usuario, 
                tipo_movimiento, 
                cantidadNum, 
                motivo
            ]);

            const operador = tipo_movimiento === 'INGRESO' ? '+' : '-';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operador} $1,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id_producto = $2 AND id_ubicacion = $3
            `, [cantidadNum, id_producto, ubicacionMovimiento]);

            await registrarAuditoria(
                client, 
                id_usuario, 
                'CREAR_MOVIMIENTO_KARDEX', 
                'movimientos_kardex', 
                resMovimiento.rows[0].id_movimiento, 
                null, 
                { id_producto, id_ubicacion: ubicacionMovimiento, cantidad: cantidadNum, tipo_movimiento, motivo }
            );

            await client.query('COMMIT');
            res.status(201).json({ 
                exito: true, 
                mensaje: tipo_movimiento === 'INGRESO' ? "¡Entrada de mercadería registrada con éxito!" : "¡Salida de mercadería registrada con éxito!", 
                datos: resMovimiento.rows[0] 
            });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    // Anular un movimiento (dentro de 10 minutos o superior)
    anularMovimiento: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSolicitante = req.usuario;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query(`
                SELECT *, 
                       (now() - fecha_movimiento > interval '10 minutes') as pasado_10_min
                FROM movimientos_kardex 
                WHERE id_movimiento = $1
                FOR UPDATE
            `, [id_movimiento]);
            
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");
            
            const mov = rows[0];
            if (mov.estado === 'ANULADO') throw new Error("Este movimiento ya fue anulado.");
            if (mov.estado === 'SOLICITUD_ANULACION') throw new Error("Ya se pidió la anulación de este movimiento y está esperando aprobación.");

            const esSuperior = usuarioSolicitante.nombre_rol === 'Admin Central' || usuarioSolicitante.nombre_rol === 'Gerente de Área';
            
            if (!esSuperior && mov.id_usuario !== usuarioSolicitante.id_usuario) {
                throw new Error("Solo puedes anular movimientos que hayas registrado tú mismo.");
            }

            if (!esSuperior && mov.pasado_10_min) {
                await client.query(`
                    UPDATE movimientos_kardex 
                    SET estado = 'SOLICITUD_ANULACION'
                    WHERE id_movimiento = $1
                `, [id_movimiento]);
                
                await registrarAuditoria(
                    client, 
                    usuarioSolicitante.id_usuario, 
                    'SOLICITAR_ANULACION_MOVIMIENTO', 
                    'movimientos_kardex', 
                    id_movimiento, 
                    mov, 
                    { ...mov, estado: 'SOLICITUD_ANULACION' }
                );

                await client.query('COMMIT');
                return res.json({ 
                    exito: true, 
                    mensaje: "Pasaron más de 10 minutos. Se envió una solicitud para que tu encargado apruebe la anulación." 
                });
            }

            // Si se anula un INGRESO, verificar que no deje el stock disponible negativo
            if (mov.tipo_movimiento === 'INGRESO') {
                const invRes = await client.query(
                    'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE',
                    [mov.id_producto, mov.id_ubicacion]
                );
                if (invRes.rows.length > 0) {
                    const disp = Number(invRes.rows[0].cantidad_fisica) - Number(invRes.rows[0].cantidad_reservada);
                    if (disp < Number(mov.cantidad)) {
                        throw new Error(`No se puede anular esta entrada porque parte de esa mercadería ya fue vendida o reservada (disponible actual: ${disp}).`);
                    }
                }
            }

            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'ANULADO', id_usuario_anulador = $1, fecha_anulacion = CURRENT_TIMESTAMP
                WHERE id_movimiento = $2
            `, [usuarioSolicitante.id_usuario, id_movimiento]);

            const operadorReverso = mov.tipo_movimiento === 'INGRESO' ? '-' : '+';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operadorReverso} $1,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id_producto = $2 AND id_ubicacion = $3
            `, [mov.cantidad, mov.id_producto, mov.id_ubicacion]);

            await registrarAuditoria(
                client, 
                usuarioSolicitante.id_usuario, 
                'ANULAR_MOVIMIENTO', 
                'movimientos_kardex', 
                id_movimiento, 
                mov, 
                { ...mov, estado: 'ANULADO' }
            );

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: "Movimiento anulado y stock corregido con éxito." });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    aprobarAnulacion: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSuperior = req.usuario;

        const esSuperior = usuarioSuperior.nombre_rol === 'Admin Central' || usuarioSuperior.nombre_rol === 'Gerente de Área';
        if (!esSuperior) {
            return res.status(403).json({ exito: false, mensaje: "Solo un Admin Central o Gerente de Área puede aprobar anulaciones." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query('SELECT * FROM movimientos_kardex WHERE id_movimiento = $1 FOR UPDATE', [id_movimiento]);
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");

            const mov = rows[0];
            if (mov.estado !== 'SOLICITUD_ANULACION') {
                throw new Error("Este movimiento no tiene una solicitud pendiente.");
            }

            if (mov.tipo_movimiento === 'INGRESO') {
                const invRes = await client.query(
                    'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE',
                    [mov.id_producto, mov.id_ubicacion]
                );
                if (invRes.rows.length > 0) {
                    const disp = Number(invRes.rows[0].cantidad_fisica) - Number(invRes.rows[0].cantidad_reservada);
                    if (disp < Number(mov.cantidad)) {
                        throw new Error(`No se puede aprobar la anulación porque parte de ese stock ya fue vendido o reservado (disponible: ${disp}).`);
                    }
                }
            }

            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'ANULADO', id_usuario_anulador = $1, fecha_anulacion = CURRENT_TIMESTAMP
                WHERE id_movimiento = $2
            `, [usuarioSuperior.id_usuario, id_movimiento]);

            const operadorReverso = mov.tipo_movimiento === 'INGRESO' ? '-' : '+';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operadorReverso} $1,
                    ultima_actualizacion = CURRENT_TIMESTAMP
                WHERE id_producto = $2 AND id_ubicacion = $3
            `, [mov.cantidad, mov.id_producto, mov.id_ubicacion]);

            await registrarAuditoria(
                client, 
                usuarioSuperior.id_usuario, 
                'APROBAR_ANULACION_KARDEX', 
                'movimientos_kardex', 
                id_movimiento, 
                mov, 
                { ...mov, estado: 'ANULADO', aprobado_por: usuarioSuperior.id_usuario }
            );

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: "Solicitud aprobada y stock corregido correctamente." });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    rechazarAnulacion: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSuperior = req.usuario;

        const esSuperior = usuarioSuperior.nombre_rol === 'Admin Central' || usuarioSuperior.nombre_rol === 'Gerente de Área';
        if (!esSuperior) {
            return res.status(403).json({ exito: false, mensaje: "Solo un Admin Central o Gerente de Área puede rechazar anulaciones." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query('SELECT * FROM movimientos_kardex WHERE id_movimiento = $1 FOR UPDATE', [id_movimiento]);
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");

            const mov = rows[0];
            if (mov.estado !== 'SOLICITUD_ANULACION') {
                throw new Error("Este movimiento no tiene una solicitud pendiente.");
            }

            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'VIGENTE'
                WHERE id_movimiento = $1
            `, [id_movimiento]);

            await registrarAuditoria(
                client, 
                usuarioSuperior.id_usuario, 
                'RECHAZAR_ANULACION_KARDEX', 
                'movimientos_kardex', 
                id_movimiento, 
                mov, 
                { ...mov, estado: 'VIGENTE', rechazado_por: usuarioSuperior.id_usuario }
            );

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: "Solicitud rechazada. El movimiento sigue activo." });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    }
};

module.exports = kardexController;
