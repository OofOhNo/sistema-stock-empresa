const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { verificarToken } = require('../middlewares/authMiddleware');

//cualquier usuario con token valido puede consultar el inventario  (el controlador ya se encarga de filtrar segun su rol/sucursal)
router.get('/', verificarToken, stockController.verInventario);

module.exports = router;