const express = require('express');
const router = express.Router();
const {
    getAllProductos,
    getProductoById,
    createProducto,
    updateProducto,
    deleteProducto,
    getUnidades,
    createUnidad,
    deleteUnidad,
    getTipos,
    createTipo,
    deleteTipo
} = require('../controllers/productoController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.use(verificarToken);

// Lectura disponible para cualquier usuario autenticado (necesaria para selectores de Pedidos, Inventario y Calidad)
router.get('/unidades', getUnidades);
router.post('/unidades', requierePermiso('productos', 'editar'), createUnidad);
router.delete('/unidades/:id', requierePermiso('productos', 'editar'), deleteUnidad);

router.get('/tipos', getTipos);
router.post('/tipos', requierePermiso('productos', 'editar'), createTipo);
router.delete('/tipos/:id', requierePermiso('productos', 'editar'), deleteTipo);

router.get('/', getAllProductos);
router.get('/:id', getProductoById);
router.post('/', requierePermiso('productos', 'editar'), createProducto);
router.put('/:id', requierePermiso('productos', 'editar'), updateProducto);
router.delete('/:id', requierePermiso('productos', 'editar'), deleteProducto);

module.exports = router;
