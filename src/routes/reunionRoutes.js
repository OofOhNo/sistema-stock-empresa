const express = require('express');
const router = express.Router();
const reunionController = require('../controllers/reunionController');
const { verificarToken } = require('../middlewares/authMiddleware');

//ver calendario de reuniones
router.get('/', verificarToken, reunionController.listarReuniones);

//programar una nueva reunion
router.post('/', verificarToken, reunionController.crearReunion);

module.exports = router;