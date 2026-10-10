const ErrorReporte = require('../models/errorModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const errorController = {
    listarErrores: async (req, res) => {
        try {
            const errores = await ErrorReporte.obtenerTodos();
            res.status(200).json({
                exito: true,
                cantidad: errores.length,
                datos: errores
            });
        } catch (error) {
            console.error('Error al listar reportes de errores:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al listar incidencias', error: error.message });
        }
    },

    crearError: async (req, res) => {
        const {
            codigo_incidencia,
            titulo,
            descripcion,
            area_modulo,
            severidad,
            id_usuario_asigna,
            id_pedido
        } = req.body;

        const id_usuario_reporta = req.usuario.id_usuario;

        if (!titulo || !descripcion || !area_modulo) {
            return res.status(400).json({
                exito: false,
                mensaje: 'Título, descripción y área/módulo son obligatorios.'
            });
        }

        try {
            const nuevo = await ErrorReporte.crear({
                codigo_incidencia,
                titulo,
                descripcion,
                area_modulo,
                severidad,
                id_usuario_reporta,
                id_usuario_asigna,
                id_pedido
            });

            await registrarAuditoria(
                pool,
                id_usuario_reporta,
                'REPORTAR_INCIDENCIA',
                'reportes_errores',
                nuevo.id_error,
                null,
                nuevo
            );

            res.status(201).json({
                exito: true,
                mensaje: 'Incidencia reportada correctamente.',
                error: nuevo
            });
        } catch (error) {
            console.error('Error al reportar incidencia:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al reportar incidencia', error: error.message });
        }
    },

    actualizarError: async (req, res) => {
        const { id } = req.params;
        const datos = req.body;
        const id_usuario = req.usuario.id_usuario;

        try {
            const anterior = await ErrorReporte.obtenerPorId(id);
            if (!anterior) {
                return res.status(404).json({ exito: false, mensaje: 'Incidencia no encontrada.' });
            }

            const actualizado = await ErrorReporte.actualizar(id, datos);

            await registrarAuditoria(
                pool,
                id_usuario,
                'ACTUALIZAR_INCIDENCIA',
                'reportes_errores',
                Number(id),
                anterior,
                actualizado
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Incidencia actualizada con éxito.',
                error: actualizado
            });
        } catch (error) {
            console.error('Error al actualizar incidencia:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al actualizar incidencia', error: error.message });
        }
    }
};

module.exports = errorController;

