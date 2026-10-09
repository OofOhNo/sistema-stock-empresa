const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

//ruta para ver el calendario (GET)
router.get('/calendario', verificarToken, requierePermiso('pedidos', 'ver'), pedidoController.obtenerCalendarioLogistica);

//ruta para crear un nuevo pedido (POST)
router.post('/', verificarToken, requierePermiso('pedidos', 'editar'), pedidoController.nuevoPedido);

//ruta para cancelar un pedido (PUT)
router.put('/:id/cancelar', verificarToken, requierePermiso('pedidos', 'editar'), pedidoController.cancelarPedido);

module.exports = router;
