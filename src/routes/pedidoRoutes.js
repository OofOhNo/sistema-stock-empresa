const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
const { verificarToken } = require('../middlewares/authMiddleware');

//ruta para ver el calendario (GET)
router.get('/calendario', verificarToken, pedidoController.obtenerCalendarioLogistica);

//ruta para crear un nuevo pedido (POST)
router.post('/', verificarToken, pedidoController.nuevoPedido);

//ruta para cancelar un pedido (PUT)
router.put('/:id/cancelar', verificarToken, pedidoController.cancelarPedido);

module.exports = router;