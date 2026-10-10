const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Consultar el inventario (filtrado por rol/ubicación)
router.get('/', verificarToken, requierePermiso('stock', 'ver'), stockController.verInventario);

// Etapa 4: Alertas de stock mínimo
router.get('/alertas', verificarToken, requierePermiso('stock', 'ver'), stockController.obtenerAlertas);

module.exports = router;