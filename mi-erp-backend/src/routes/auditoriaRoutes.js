const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoriaController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Solo usuarios con permiso para ver personal / administración pueden consultar auditoría
router.get('/', verificarToken, requierePermiso('usuarios', 'ver'), auditoriaController.listar);

module.exports = router;

