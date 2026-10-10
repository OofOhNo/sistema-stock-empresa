const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const kardexController = {

    // Listar movimientos con filtro de ubicación y seguridad
    listarMovimientos: async (req, res) => {
        try {
            const { nombre_rol, id_ubicacion } = req.usuario;
            const ubicacionFiltro = req.query.id_ubicacion;

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
                    u.nombre_completo AS usuario_creador,
                    ua.nombre_completo AS usuario_anulador
                FROM movimientos_kardex k
                JOIN productos p ON k.id_producto = p.id_producto
                JOIN ubicaciones ub ON k.id_ubicacion = ub.id_ubicacion
                JOIN usuarios u ON k.id_usuario = u.id_usuario
                LEFT JOIN usuarios ua ON k.id_usuario_anulador = ua.id_usuario
            `;

            const params = [];

            // Regla de seguridad Etapa 3: Filtrar por ubicación
            if (nombre_rol === 'Admin Central') {
                if (ubicacionFiltro) {
                    query += ` WHERE k.id_ubicacion = $1`;
                    params.push(ubicacionFiltro);
                }
            } else {
                // Usuarios de sucursal solo ven los movimientos de su ubicación
                query += ` WHERE k.id_ubicacion = $1`;
                params.push(id_ubicacion);
            }

            query += ` ORDER BY k.fecha_movimiento DESC;`;

            const { rows } = await pool.query(query, params);
            res.status(200).json({ exito: true, movimientos: rows });
        } catch (error) {
            console.error("Error al obtener Kardex:", error);
            res.status(500).json({ exito: false, mensaje: "Error al obtener el historial del Kardex.", error: error.message });
        }
    },

    // 1. registrar un nuevo ingreso o salida manual (Solo suma huellas)
    registrarMovimiento: async (req, res) => {
        const { id_producto, id_ubicacion, cantidad, tipo_movimiento, motivo } = req.body;
        const id_usuario = req.usuario.id_usuario;
        const ubicacionMovimiento = id_ubicacion || req.usuario.id_ubicacion;

        if (!id_producto || !ubicacionMovimiento || !cantidad || !tipo_movimiento || !motivo) {
            return res.status(400).json({ exito: false, mensaje: "Todos los campos (producto, ubicación, cantidad, tipo y motivo) son obligatorios." });
        }

        const cantidadNum = Number(cantidad);
        if (isNaN(cantidadNum) || cantidadNum <= 0) {
            return res.status(400).json({ exito: false, mensaje: "La cantidad debe ser un número mayor a 0." });
        }

        if (tipo_movimiento !== 'INGRESO' && tipo_movimiento !== 'SALIDA') {
            return res.status(400).json({ exito: false, mensaje: "El tipo de movimiento debe ser INGRESO o SALIDA." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Asegurar que exista la fila de inventario para ese producto y ubicación
            let stockCheck = await client.query(
                'SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2 FOR UPDATE', 
                [id_producto, ubicacionMovimiento]
            );

            if (stockCheck.rows.length === 0) {
                // Si es INGRESO, creamos la fila inicial en inventario
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
                    throw new Error("El producto no cuenta con registro de inventario en esta ubicación.");
                }
            }

            const disponible = stockCheck.rows[0].cantidad_fisica - stockCheck.rows[0].cantidad_reservada;

            if (tipo_movimiento === 'SALIDA') {
                if (disponible < cantidadNum) {
                    throw new Error(`Stock insuficiente en esta ubicación. Disponible: ${disponible}, Solicitado: ${cantidadNum}`);
                }
            }

            // 1. guardamos la huella en el Kardex
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

            // 2. actualizamos la foto actual (la tabla inventario) para consultas rápidas
            let operador = tipo_movimiento === 'INGRESO' ? '+' : '-';
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
                { id_producto, id_ubicacion: ubicacionMovimiento, cantidadNum, tipo_movimiento, motivo }
            );

            await client.query('COMMIT');
            res.status(201).json({ 
                exito: true, 
                mensaje: "Movimiento registrado con huella de auditoría.", 
                datos: resMovimiento.rows[0] 
            });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    // Anular un movimiento (regla de los 10 minutos o superior)
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
            if (mov.estado === 'SOLICITUD_ANULACION') throw new Error("Ya hay una solicitud de anulación pendiente.");

            const esSuperior = usuarioSolicitante.nombre_rol === 'Admin Central' || usuarioSolicitante.nombre_rol === 'Gerente de Área';
            
            if (!esSuperior && mov.id_usuario !== usuarioSolicitante.id_usuario) {
                throw new Error("No tienes permiso para anular movimientos registrados por otros usuarios.");
            }

            // REGLA DE TIEMPO: si pasaron 10 min y no es superior, pasa a SOLICITUD_ANULACION
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
                    mensaje: "Han pasado más de 10 minutos. Se ha creado una solicitud de anulación para que la apruebe un superior." 
                });
            }

            // Anulación directa (dentro de los 10 mins o por Admin/Gerente)
            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'ANULADO', id_usuario_anulador = $1, fecha_anulacion = CURRENT_TIMESTAMP
                WHERE id_movimiento = $2
            `, [usuarioSolicitante.id_usuario, id_movimiento]);

            // Revertir matemáticamente el inventario físico
            let operadorReverso = mov.tipo_movimiento === 'INGRESO' ? '-' : '+';
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
            res.json({ exito: true, mensaje: "Movimiento anulado y stock revertido con éxito." });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    // Etapa 4: Aprobación de solicitudes de anulación por un superior
    aprobarAnulacion: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSuperior = req.usuario;

        const esSuperior = usuarioSuperior.nombre_rol === 'Admin Central' || usuarioSuperior.nombre_rol === 'Gerente de Área';
        if (!esSuperior) {
            return res.status(403).json({ exito: false, mensaje: "Acceso denegado. Solo un Admin Central o Gerente de Área puede aprobar anulaciones." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query('SELECT * FROM movimientos_kardex WHERE id_movimiento = $1 FOR UPDATE', [id_movimiento]);
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");

            const mov = rows[0];
            if (mov.estado !== 'SOLICITUD_ANULACION') {
                throw new Error(`El movimiento no está en estado de solicitud pendiente (estado actual: ${mov.estado}).`);
            }

            // Marcar como ANULADO
            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'ANULADO', id_usuario_anulador = $1, fecha_anulacion = CURRENT_TIMESTAMP
                WHERE id_movimiento = $2
            `, [usuarioSuperior.id_usuario, id_movimiento]);

            // Revertir inventario
            let operadorReverso = mov.tipo_movimiento === 'INGRESO' ? '-' : '+';
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
            res.json({ exito: true, mensaje: "Solicitud de anulación aprobada y stock revertido correctamente." });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    // Etapa 4: Rechazar solicitud de anulación
    rechazarAnulacion: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSuperior = req.usuario;

        const esSuperior = usuarioSuperior.nombre_rol === 'Admin Central' || usuarioSuperior.nombre_rol === 'Gerente de Área';
        if (!esSuperior) {
            return res.status(403).json({ exito: false, mensaje: "Acceso denegado. Solo un Admin Central o Gerente de Área puede rechazar anulaciones." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows } = await client.query('SELECT * FROM movimientos_kardex WHERE id_movimiento = $1 FOR UPDATE', [id_movimiento]);
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");

            const mov = rows[0];
            if (mov.estado !== 'SOLICITUD_ANULACION') {
                throw new Error(`El movimiento no está en estado de solicitud pendiente (estado actual: ${mov.estado}).`);
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
            res.json({ exito: true, mensaje: "Solicitud de anulación rechazada. El movimiento continúa vigente." });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    }
};

module.exports = kardexController;
