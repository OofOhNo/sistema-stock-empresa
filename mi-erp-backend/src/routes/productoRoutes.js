const express = require('express');
const router = express.Router();
const { 
    getAllProductos, 
    getProductoById, 
    createProducto, 
    updateProducto, 
    deleteProducto 
} = require('../controllers/productoController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);

router.get('/', getAllProductos);
router.get('/:id', getProductoById);
router.post('/', createProducto);
router.put('/:id', updateProducto);
router.delete('/:id', deleteProducto);

module.exports = router;
