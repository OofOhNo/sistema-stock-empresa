const Calidad = require('../models/calidadModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const calidadController = {
    listarCertificados: async (req, res) => {
        try {
            const certificados = await Calidad.obtenerTodos();
            res.status(200).json({
                exito: true,
                cantidad: certificados.length,
                datos: certificados
            });
        } catch (error) {
            console.error('Error al listar certificados de calidad:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener certificados de calidad', error: error.message });
        }
    },

    crearCertificado: async (req, res) => {
        const {
            codigo_certificado,
            tipo_certificado,
            lote_o_producto,
            entidad_emisora,
            fecha_emision,
            fecha_vencimiento,
            estado,
            id_ubicacion,
            archivo_url,
            observaciones
        } = req.body;

        const id_usuario = req.usuario.id_usuario;

        if (!tipo_certificado || !entidad_emisora || !fecha_emision || !fecha_vencimiento) {
            return res.status(400).json({
                exito: false,
                mensaje: 'Los campos tipo_certificado, entidad_emisora, fecha_emision y fecha_vencimiento son obligatorios.'
            });
        }

        // Generar código único si no se envió
        const codigoFinal = codigo_certificado && codigo_certificado.trim() !== '' 
            ? codigo_certificado.trim() 
            : `CERT-${Date.now().toString().slice(-6)}`;

        try {
            // Validar unicidad de código
            const check = await pool.query('SELECT id_certificado FROM certificados_calidad WHERE LOWER(codigo_certificado) = LOWER($1)', [codigoFinal]);
            if (check.rows.length > 0) {
                return res.status(400).json({ exito: false, mensaje: 'Ya existe un certificado con este código.' });
            }

            const nuevo = await Calidad.crear({
                codigo_certificado: codigoFinal,
                tipo_certificado,
                lote_o_producto,
                entidad_emisora,
                fecha_emision,
                fecha_vencimiento,
                estado,
                id_ubicacion: id_ubicacion ? Number(id_ubicacion) : null,
                id_usuario,
                archivo_url,
                observaciones
            });

            await registrarAuditoria(
                pool,
                id_usuario,
                'CREAR_CERTIFICADO_CALIDAD',
                'certificados_calidad',
                nuevo.id_certificado,
                null,
                nuevo
            );

            res.status(201).json({
                exito: true,
                mensaje: 'Certificado de calidad registrado correctamente.',
                certificado: nuevo
            });
        } catch (error) {
            console.error('Error al registrar certificado:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al registrar certificado', error: error.message });
        }
    },

    actualizarCertificado: async (req, res) => {
        const { id } = req.params;
        const datos = req.body;
        const id_usuario = req.usuario.id_usuario;

        try {
            const anterior = await Calidad.obtenerPorId(id);
            if (!anterior) {
                return res.status(404).json({ exito: false, mensaje: 'Certificado no encontrado.' });
            }

            const actualizado = await Calidad.actualizar(id, datos);

            await registrarAuditoria(
                pool,
                id_usuario,
                'ACTUALIZAR_CERTIFICADO_CALIDAD',
                'certificados_calidad',
                Number(id),
                anterior,
                actualizado
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Certificado actualizado correctamente.',
                certificado: actualizado
            });
        } catch (error) {
            console.error('Error al actualizar certificado:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al actualizar certificado', error: error.message });
        }
    },

    eliminarCertificado: async (req, res) => {
        const { id } = req.params;
        const id_usuario = req.usuario.id_usuario;

        try {
            const anterior = await Calidad.obtenerPorId(id);
            if (!anterior) {
                return res.status(404).json({ exito: false, mensaje: 'Certificado no encontrado.' });
            }

            const eliminado = await Calidad.eliminar(id);

            await registrarAuditoria(
                pool,
                id_usuario,
                'ELIMINAR_CERTIFICADO_CALIDAD',
                'certificados_calidad',
                Number(id),
                anterior,
                null
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Certificado eliminado correctamente.',
                certificado: eliminado
            });
        } catch (error) {
            console.error('Error al eliminar certificado:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al eliminar certificado', error: error.message });
        }
    }
};

module.exports = calidadController;

