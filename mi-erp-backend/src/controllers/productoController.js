const ProductoModel = require('../models/productoModel');

const getAllProductos = async (req, res) => {
    try {
        const productos = await ProductoModel.getAll();
        res.status(200).json(productos);
    } catch (error) {
        console.error('Error fetching productos:', error);
        res.status(500).json({ message: 'Error fetching productos' });
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
        res.status(500).json({ message: 'Error fetching producto' });
    }
};

const createProducto = async (req, res) => {
    try {
        const nuevoProducto = await ProductoModel.create(req.body);
        res.status(201).json(nuevoProducto);
    } catch (error) {
        console.error('Error creating producto:', error);
        res.status(500).json({ message: 'Error creating producto' });
    }
};

const updateProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const productoActualizado = await ProductoModel.update(id, req.body);
        if (!productoActualizado) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.status(200).json(productoActualizado);
    } catch (error) {
        console.error('Error updating producto:', error);
        res.status(500).json({ message: 'Error updating producto' });
    }
};

const deleteProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const productoEliminado = await ProductoModel.delete(id);
        if (!productoEliminado) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        res.status(200).json({ message: 'Producto eliminado' });
    } catch (error) {
        console.error('Error deleting producto:', error);
        res.status(500).json({ message: 'Error deleting producto' });
    }
};

module.exports = {
    getAllProductos,
    getProductoById,
    createProducto,
    updateProducto,
    deleteProducto
};
