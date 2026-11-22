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
        if (!nombre || !String(nombre).trim()) {
            return res.status(400).json({ exito: false, mensaje: 'El nombre de la ubicación es obligatorio.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (id_division) {
                const div = await UbicacionModel.getDivisionById(Number(id_division), client);
                if (!div) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ exito: false, mensaje: 'El área / división seleccionada no existe.' });
                }
            }

            const nueva = await UbicacionModel.create({
                nombre: String(nombre).trim(),
                id_division: id_division ? Number(id_division) : undefined
            }, client);

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
            if (error.code === '23505') {
                return res.status(400).json({ exito: false, mensaje: 'Ya existe una ubicación con ese nombre.' });
            }
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
            const anterior = await UbicacionModel.getById(id, client);
            if (!anterior) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Ubicación no encontrada' });
            }

            if (id_division) {
                const div = await UbicacionModel.getDivisionById(Number(id_division), client);
                if (!div) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ exito: false, mensaje: 'El área / división seleccionada no existe.' });
                }
            }

            const actualizada = await UbicacionModel.update(id, {
                nombre: nombre !== undefined ? String(nombre).trim() : null,
                id_division: id_division ? Number(id_division) : null
            }, client);

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
            if (error.code === '23505') {
                return res.status(400).json({ exito: false, mensaje: 'Ya existe una ubicación con ese nombre.' });
            }
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
            const anterior = await UbicacionModel.getById(id, client);
            if (!anterior) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Ubicación no encontrada' });
            }

            const eliminada = await UbicacionModel.delete(id, client);

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
    },

    crearDivision: async (req, res) => {
        const nombre = String(req.body?.nombre || '').trim();
        if (!nombre) {
            return res.status(400).json({ exito: false, mensaje: 'El nombre del área o división es obligatorio.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const nueva = await UbicacionModel.createDivision({ nombre }, client);
            await registrarAuditoria(
                client,
                req.usuario?.id_usuario || null,
                'CREAR_DIVISION',
                'divisiones',
                nueva.id_division,
                null,
                nueva
            );
            await client.query('COMMIT');
            res.status(201).json({ exito: true, mensaje: `Área / división "${nueva.nombre}" creada correctamente.`, datos: nueva });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message || 'No se pudo crear el área / división.' });
        } finally {
            client.release();
        }
    },

    actualizarDivision: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const nombre = String(req.body?.nombre || '').trim();
        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ exito: false, mensaje: 'ID de división inválido.' });
        }
        if (!nombre) {
            return res.status(400).json({ exito: false, mensaje: 'El nombre del área o división es obligatorio.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const anterior = await UbicacionModel.getDivisionById(id, client);
            if (!anterior) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Área / división no encontrada.' });
            }

            const actualizada = await UbicacionModel.updateDivision(id, { nombre }, client);
            await registrarAuditoria(
                client,
                req.usuario?.id_usuario || null,
                'ACTUALIZAR_DIVISION',
                'divisiones',
                id,
                anterior,
                actualizada
            );
            await client.query('COMMIT');
            res.json({ exito: true, mensaje: `Área / división actualizada a "${actualizada.nombre}".`, datos: actualizada });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message || 'No se pudo actualizar el área / división.' });
        } finally {
            client.release();
        }
    },

    eliminarDivision: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (!id || Number.isNaN(id)) {
            return res.status(400).json({ exito: false, mensaje: 'ID de división inválido.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const anterior = await UbicacionModel.getDivisionById(id, client);
            if (!anterior) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Área / división no encontrada.' });
            }

            const eliminada = await UbicacionModel.deleteDivision(id, client);
            await registrarAuditoria(
                client,
                req.usuario?.id_usuario || null,
                'ELIMINAR_DIVISION',
                'divisiones',
                id,
                anterior,
                null
            );
            await client.query('COMMIT');
            res.json({ exito: true, mensaje: `Área / división "${eliminada.nombre}" eliminada.`, datos: eliminada });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(400).json({ exito: false, mensaje: error.message || 'No se pudo eliminar el área / división.' });
        } finally {
            client.release();
        }
    }

};

module.exports = ubicacionController;

