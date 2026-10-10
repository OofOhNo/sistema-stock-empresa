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

module.exports = {
    getAllProductos,
    getProductoById,
    createProducto,
    updateProducto,
    deleteProducto
};
