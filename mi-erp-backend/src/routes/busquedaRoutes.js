const express = require('express');
const router = express.Router();
const busquedaController = require('../controllers/busquedaController');
const { verificarToken } = require('../middlewares/authMiddleware');

// La búsqueda general está disponible para todos los usuarios autenticados
router.get('/global', verificarToken, busquedaController.buscarGlobal);

module.exports = router;

