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
const requierePermiso = require('../middlewares/requierePermiso');

router.use(verificarToken);

router.get('/', requierePermiso('productos', 'ver'), getAllProductos);
router.get('/:id', requierePermiso('productos', 'ver'), getProductoById);
router.post('/', requierePermiso('productos', 'editar'), createProducto);
router.put('/:id', requierePermiso('productos', 'editar'), updateProducto);
router.delete('/:id', requierePermiso('productos', 'editar'), deleteProducto);

module.exports = router;
