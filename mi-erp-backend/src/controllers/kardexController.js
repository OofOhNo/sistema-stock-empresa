const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const kardexController = {

    // 1. registrar un nuevo ingreso o salida manual (Solo suma huellas)
    registrarMovimiento: async (req, res) => {
        const { id_producto, id_ubicacion, cantidad, tipo_movimiento, motivo } = req.body;
        const id_usuario = req.usuario.id_usuario; // el token nos dice quien es

        if (!id_producto || !id_ubicacion || !cantidad || !tipo_movimiento || !motivo) {
            return res.status(400).json({ exito: false, mensaje: "Todos los campos son obligatorios." });
        }
        if (isNaN(cantidad) || cantidad <= 0) {
            return res.status(400).json({ exito: false, mensaje: "La cantidad debe ser un nÃºmero mayor a 0." });
        }
        if (tipo_movimiento !== 'INGRESO' && tipo_movimiento !== 'SALIDA') {
            return res.status(400).json({ exito: false, mensaje: "El tipo de movimiento debe ser INGRESO o SALIDA." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const cantidadNum = Number(cantidad);

            if (tipo_movimiento === 'SALIDA') {
                const stockCheck = await client.query('SELECT cantidad_fisica, cantidad_reservada FROM inventario WHERE id_producto = $1 AND id_ubicacion = $2', [id_producto, id_ubicacion]);
                if (stockCheck.rows.length === 0) {
                    throw new Error("El producto no existe en esta ubicacion.");
                }
                const disponible = stockCheck.rows[0].cantidad_fisica - stockCheck.rows[0].cantidad_reservada;
                if (disponible < cantidadNum) {
                    throw new Error(`Stock insuficiente. Disponible: ${disponible}, Solicitado: ${cantidadNum}`);
                }
            }

            // 1. guardamos la huella en el Kardex
            const queryKardex = `
                INSERT INTO movimientos_kardex (id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidad, motivo)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id_movimiento, fecha_movimiento;
            `;
            const resMovimiento = await client.query(queryKardex, [id_producto, id_ubicacion, id_usuario, tipo_movimiento, cantidadNum, motivo]);

            // 2. actualizamos la foto actual (la tabla inventario) para consultas rapidas
            let operador = tipo_movimiento === 'INGRESO' ? '+' : '-';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operador} $1 
                WHERE id_producto = $2 AND id_ubicacion = $3
            `, [cantidadNum, id_producto, id_ubicacion]);

            await registrarAuditoria(client, id_usuario, 'CREAR_MOVIMIENTO', 'movimientos_kardex', resMovimiento.rows[0].id_movimiento, null, { id_producto, id_ubicacion, cantidadNum, tipo_movimiento });

            await client.query('COMMIT');
            res.status(201).json({ exito: true, mensaje: "Movimiento registrado con huella de auditoría.", datos: resMovimiento.rows[0] });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    anularMovimiento: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSolicitante = req.usuario;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // buscamos el movimiento original y verificamos el tiempo en SQL directamente
            const { rows } = await client.query(`
                SELECT *, 
                       (now() - fecha_movimiento > interval '10 minutes') as pasado_10_min
                FROM movimientos_kardex 
                WHERE id_movimiento = $1
            `, [id_movimiento]);
            
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");
            
            const mov = rows[0];
            if (mov.estado === 'ANULADO') throw new Error("Este movimiento ya fue anulado.");
            if (mov.estado === 'SOLICITUD_ANULACION') throw new Error("Ya hay una solicitud de anulación pendiente.");

            // Validar propiedad del movimiento o permisos superiores
            // Asumimos que Admin Central (rol_id 1) o Gerente (rol_id 2) pueden anular de otros
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
                
                await registrarAuditoria(client, usuarioSolicitante.id_usuario, 'SOLICITAR_ANULACION_MOVIMIENTO', 'movimientos_kardex', id_movimiento, mov, { ...mov, estado: 'SOLICITUD_ANULACION' });

                await client.query('COMMIT');
                return res.json({ 
                    exito: true, 
                    mensaje: "Han pasado más de 10 minutos. Se ha creado una solicitud de anulación para que la apruebe un superior." 
                });
            }

            // anulamos en el Kardex definitivamente
            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'ANULADO', id_usuario_anulador = $1, fecha_anulacion = CURRENT_TIMESTAMP
                WHERE id_movimiento = $2
            `, [usuarioSolicitante.id_usuario, id_movimiento]);

            // revertimos matematicamente el inventario fisico
            let operadorReverso = mov.tipo_movimiento === 'INGRESO' ? '-' : '+';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operadorReverso} $1 
                WHERE id_producto = $2 AND id_ubicacion = $3
            `, [mov.cantidad, mov.id_producto, mov.id_ubicacion]);

            await registrarAuditoria(client, usuarioSolicitante.id_usuario, 'ANULAR_MOVIMIENTO', 'movimientos_kardex', id_movimiento, mov, { ...mov, estado: 'ANULADO' });

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: "Movimiento anulado y stock revertido con éxito." });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    }
};

module.exports = kardexController;
