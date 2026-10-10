const Organizacion = require('../models/organizacionModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const organizacionController = {
    obtenerOrganizacion: async (req, res) => {
        try {
            const data = await Organizacion.obtenerOrganizacion();
            res.status(200).json({
                exito: true,
                sedes: data.sedes,
                todosUsuarios: data.todosUsuarios
            });
        } catch (error) {
            console.error('Error al obtener estructura de organización:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener organización', error: error.message });
        }
    },

    actualizarGerenteSede: async (req, res) => {
        const { id_ubicacion } = req.params;
        const { id_gerente, telefono_contacto, direccion_completa } = req.body;
        const usuarioSolicitante = req.usuario;

        try {
            // Verificar si el usuario a asignar como gerente existe
            if (id_gerente) {
                const userCheck = await pool.query('SELECT id_usuario, nombre_completo FROM usuarios WHERE id_usuario = $1', [id_gerente]);
                if (userCheck.rows.length === 0) {
                    return res.status(400).json({ exito: false, mensaje: 'El usuario seleccionado para gerente no existe.' });
                }
            }

            const sedeAnterior = await pool.query('SELECT * FROM ubicaciones WHERE id_ubicacion = $1', [id_ubicacion]);
            if (sedeAnterior.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Sede no encontrada.' });
            }

            const actualizada = await Organizacion.actualizarGerenteSede(id_ubicacion, {
                id_gerente,
                telefono_contacto,
                direccion_completa
            });

            await registrarAuditoria(
                pool,
                usuarioSolicitante.id_usuario,
                'ASIGNAR_GERENTE_SEDE',
                'ubicaciones',
                Number(id_ubicacion),
                sedeAnterior.rows[0],
                actualizada
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Datos del gerente y sede actualizados correctamente.',
                sede: actualizada
            });
        } catch (error) {
            console.error('Error al actualizar gerente de sede:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al actualizar gerente de sede', error: error.message });
        }
    }
};

module.exports = organizacionController;

