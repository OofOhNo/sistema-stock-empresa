const express = require('express');
const router = express.Router();
const reunionController = require('../controllers/reunionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Ver calendario de reuniones
router.get('/', verificarToken, requierePermiso('reuniones', 'ver'), reunionController.listarReuniones);

// Programar una nueva reunion
router.post('/', verificarToken, requierePermiso('reuniones', 'editar'), reunionController.crearReunion);

module.exports = router;