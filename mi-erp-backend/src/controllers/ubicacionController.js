const UbicacionModel = require('../models/ubicacionModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const ubicacionController = {

    listar: async (req, res) => {
        try {
            const ubicaciones = await UbicacionModel.getAll();
            res.json({ exito: true, datos: ubicaciones });
        } catch (error) {
            console.error('Error al listar ubicaciones:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener ubicaciones', error: error.message });
        }
    },

    obtenerPorId: async (req, res) => {
        try {
            const { id } = req.params;
            const ubicacion = await UbicacionModel.getById(id);
            if (!ubicacion) {
                return res.status(404).json({ exito: false, mensaje: 'Ubicación no encontrada' });
            }
            res.json({ exito: true, datos: ubicacion });
        } catch (error) {
            console.error('Error al obtener ubicación:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener ubicación', error: error.message });
        }
    },

    crear: async (req, res) => {
        const { nombre, id_division } = req.body;
        if (!nombre) {
            return res.status(400).json({ exito: false, mensaje: 'El nombre de la ubicación es obligatorio.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const nueva = await UbicacionModel.create({ nombre, id_division });

            await registrarAuditoria(
                client, 
                req.usuario?.id_usuario || null, 
                'CREAR_UBICACION', 
                'ubicaciones', 
                nueva.id_ubicacion, 
                null, 
                nueva
            );

            await client.query('COMMIT');
            res.status(201).json({ exito: true, mensaje: 'Ubicación creada exitosamente.', datos: nueva });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al crear ubicación:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al crear ubicación', error: error.message });
        } finally {
            client.release();
        }
    },

    actualizar: async (req, res) => {
        const { id } = req.params;
        const { nombre, id_division } = req.body;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const anterior = await UbicacionModel.getById(id);
            if (!anterior) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Ubicación no encontrada' });
            }

            const actualizada = await UbicacionModel.update(id, { nombre, id_division });

            await registrarAuditoria(
                client, 
                req.usuario?.id_usuario || null, 
                'ACTUALIZAR_UBICACION', 
                'ubicaciones', 
                Number(id), 
                anterior, 
                actualizada
            );

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: 'Ubicación actualizada correctamente.', datos: actualizada });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al actualizar ubicación:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al actualizar ubicación', error: error.message });
        } finally {
            client.release();
        }
    },

    eliminar: async (req, res) => {
        const { id } = req.params;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const anterior = await UbicacionModel.getById(id);
            if (!anterior) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Ubicación no encontrada' });
            }

            const eliminada = await UbicacionModel.delete(id);

            await registrarAuditoria(
                client, 
                req.usuario?.id_usuario || null, 
                'ELIMINAR_UBICACION', 
                'ubicaciones', 
                Number(id), 
                anterior, 
                null
            );

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: 'Ubicación eliminada correctamente.', datos: eliminada });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al eliminar ubicación:', error);
            res.status(400).json({ exito: false, mensaje: error.message });
        } finally {
            client.release();
        }
    },

    listarDivisiones: async (req, res) => {
        try {
            const divisiones = await UbicacionModel.getDivisiones();
            res.json({ exito: true, datos: divisiones });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'Error al obtener divisiones', error: error.message });
        }
    }

};

module.exports = ubicacionController;

