const ProductoModel = require('../models/productoModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const getAllProductos = async (req, res) => {
    try {
        const incluirInactivos = req.query.todos === 'true';
        const productos = await ProductoModel.getAll(incluirInactivos);
        res.status(200).json(productos);
    } catch (error) {
        console.error('Error fetching productos:', error);
        res.status(500).json({ message: 'Error fetching productos', error: error.message });
    }
};

const getProductoById = async (req, res) => {
    try {
        const { id } = req.params;
        const producto = await ProductoModel.getById(id);
        if (!producto) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.status(200).json(producto);
    } catch (error) {
        console.error('Error fetching producto by id:', error);
        res.status(500).json({ message: 'Error fetching producto', error: error.message });
    }
};

const createProducto = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const nuevoProducto = await ProductoModel.create(req.body);
        
        await registrarAuditoria(
            client, 
            req.usuario?.id_usuario || null, 
            'CREAR_PRODUCTO', 
            'productos', 
            nuevoProducto.id_producto, 
            null, 
            nuevoProducto
        );

        await client.query('COMMIT');
        res.status(201).json(nuevoProducto);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating producto:', error);
        res.status(500).json({ message: 'Error creating producto', error: error.message });
    } finally {
        client.release();
    }
};

const updateProducto = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');

        const anterior = await ProductoModel.getById(id);
        if (!anterior) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const productoActualizado = await ProductoModel.update(id, req.body);
        
        await registrarAuditoria(
            client, 
            req.usuario?.id_usuario || null, 
            'ACTUALIZAR_PRODUCTO', 
            'productos', 
            Number(id), 
            anterior, 
            productoActualizado
        );

        await client.query('COMMIT');
        res.status(200).json(productoActualizado);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating producto:', error);
        res.status(500).json({ message: 'Error updating producto', error: error.message });
    } finally {
        client.release();
    }
};

const deleteProducto = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN');

        const anterior = await ProductoModel.getById(id);
        if (!anterior) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        // Baja lógica
        const productoEliminado = await ProductoModel.delete(id);
        
        await registrarAuditoria(
            client, 
            req.usuario?.id_usuario || null, 
            'BAJA_LOGICA_PRODUCTO', 
            'productos', 
            Number(id), 
            anterior, 
            productoEliminado
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Producto dado de baja lógicamente (activo = false)', producto: productoEliminado });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting producto:', error);
        res.status(500).json({ message: 'Error deleting producto', error: error.message });
    } finally {
        client.release();
    }
};

const getUnidades = async (req, res) => {
    try {
        const unidades = await ProductoModel.getUnidades();
        res.status(200).json({ exito: true, unidades });
    } catch (error) {
        console.error('Error fetching unidades:', error);
        res.status(500).json({ exito: false, message: 'Error al obtener unidades de medida', error: error.message });
    }
};

const createUnidad = async (req, res) => {
    const { codigo, nombre, simbolo } = req.body;
    if (!codigo || !nombre || !simbolo) {
        return res.status(400).json({ exito: false, message: 'Código, nombre y símbolo son obligatorios.' });
    }
    try {
        const nueva = await ProductoModel.createUnidad({ codigo, nombre, simbolo });
        res.status(201).json({ exito: true, mensaje: 'Unidad de medida creada exitosamente.', unidad: nueva });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ 
                exito: false, 
                message: `Ya existe una unidad de medida registrada con el código "${codigo}".` 
            });
        }
        console.error('Error creating unidad:', error);
        res.status(500).json({ exito: false, message: 'Error al crear unidad de medida', error: error.message });
    }
};

const deleteUnidad = async (req, res) => {
    try {
        const { id } = req.params;
        const eliminada = await ProductoModel.deleteUnidad(id);
        if (!eliminada) {
            return res.status(404).json({ exito: false, message: 'Unidad de medida no encontrada.' });
        }
        res.status(200).json({ exito: true, message: 'Unidad de medida eliminada o retirada con éxito.' });
    } catch (error) {
        console.error('Error deleting unidad:', error);
        res.status(500).json({ exito: false, message: 'Error al eliminar unidad de medida', error: error.message });
    }
};

module.exports = {
    getAllProductos,
    getProductoById,
    createProducto,
    updateProducto,
    deleteProducto,
    getUnidades,
    createUnidad,
    deleteUnidad
};
