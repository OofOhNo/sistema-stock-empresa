const pool = require('../config/db');

const kardexController = {

    // 1. registrar un nuevo ingreso o salida manual (Solo suma huellas)
    registrarMovimiento: async (req, res) => {
        const { id_producto, id_sucursal, cantidad, tipo_movimiento, motivo } = req.body;
        const id_usuario = req.usuario.id_usuario; // el token nos dice quien es

        if (!id_producto || !id_sucursal || !cantidad || !tipo_movimiento || !motivo) {
            return res.status(400).json({ exito: false, mensaje: "Todos los campos son obligatorios." });
        }
        if (isNaN(cantidad) || cantidad <= 0) {
            return res.status(400).json({ exito: false, mensaje: "La cantidad debe ser un número mayor a 0." });
        }
        if (tipo_movimiento !== 'INGRESO' && tipo_movimiento !== 'SALIDA') {
            return res.status(400).json({ exito: false, mensaje: "El tipo de movimiento debe ser INGRESO o SALIDA." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. guardamos la huella en el Kardex
            const queryKardex = `
                INSERT INTO movimientos_kardex (id_producto, id_sucursal, id_usuario, tipo_movimiento, cantidad, motivo)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id_movimiento, fecha_movimiento;
            `;
            const resMovimiento = await client.query(queryKardex, [id_producto, id_sucursal, id_usuario, tipo_movimiento, motivo]);

            // 2. actualizamos la foto actual (la tabla inventario) para consultas rapidas
            let operador = tipo_movimiento === 'INGRESO' ? '+' : '-';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operador} $1 
                WHERE id_producto = $2 AND id_sucursal = $3
            `, [cantidad, id_producto, id_sucursal]);

            await client.query('COMMIT');
            res.status(201).json({ exito: true, mensaje: "Movimiento registrado con huella de auditoría.", datos: resMovimiento.rows[0] });

        } catch (error) {
            await client.query('ROLLBACK');
            res.status(500).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    //anular un movimiento (regla de 10 minutos)
    anularMovimiento: async (req, res) => {
        const { id_movimiento } = req.params;
        const usuarioSolicitante = req.usuario;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            //buscamos el movimiento original
            const { rows } = await client.query("SELECT * FROM movimientos_kardex WHERE id_movimiento = $1", [id_movimiento]);
            if (rows.length === 0) throw new Error("Movimiento no encontrado.");
            
            const mov = rows[0];
            if (mov.estado === 'ANULADO') throw new Error("Este movimiento ya fue anulado.");

            // REGLA DE TIEMPO (10 minutos)
            const ahora = new Date();
            const fechaMov = new Date(mov.fecha_movimiento);
            const minutosPasados = (ahora - fechaMov) / (1000 * 60);

            //si es un empleado normal y pasaron mas de 10 min, BLOQUEAR
            if (usuarioSolicitante.nombre_rol !== 'Admin Central' && minutosPasados > 10) {
                throw new Error("Han pasado más de 10 minutos. No puedes deshacer este movimiento. Solicita ayuda a un Administrador.");
            }

            //si es empleado normal, solo puede anular SUS PROPIOS movimientos
            if (usuarioSolicitante.nombre_rol !== 'Admin Central' && mov.id_usuario !== usuarioSolicitante.id_usuario) {
                throw new Error("Solo un Administrador puede anular movimientos registrados por otros usuarios.");
            }

            //anulamos en el Kardex
            await client.query(`
                UPDATE movimientos_kardex 
                SET estado = 'ANULADO', id_usuario_anulador = $1, fecha_anulacion = CURRENT_TIMESTAMP
                WHERE id_movimiento = $2
            `, [usuarioSolicitante.id_usuario, id_movimiento]);

            //revertimos matematicamente el inventario fisico
            let operadorReverso = mov.tipo_movimiento === 'INGRESO' ? '-' : '+';
            await client.query(`
                UPDATE inventario 
                SET cantidad_fisica = cantidad_fisica ${operadorReverso} $1 
                WHERE id_producto = $2 AND id_sucursal = $3
            `, [mov.cantidad, mov.id_producto, mov.id_sucursal]);

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