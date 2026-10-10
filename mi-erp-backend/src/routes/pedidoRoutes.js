const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

const fotoPedidoController = require('../controllers/fotoPedidoController');

//ruta para ver el calendario (GET)
router.get('/calendario', verificarToken, requierePermiso('pedidos', 'ver'), pedidoController.obtenerCalendarioLogistica);

//ruta para crear un nuevo pedido (POST)
router.post('/', verificarToken, requierePermiso('pedidos', 'editar'), pedidoController.nuevoPedido);

//ruta para cancelar un pedido (PUT)
router.put('/:id/cancelar', verificarToken, requierePermiso('pedidos', 'editar'), pedidoController.cancelarPedido);

//rutas de gestion de despacho (PUT)
router.put('/:id/listo-despacho', verificarToken, requierePermiso('pedidos', 'editar'), pedidoController.marcarListoDespacho);
router.put('/:id/despachar', verificarToken, requierePermiso('pedidos', 'editar'), pedidoController.marcarDespachado);

//rutas de fotos y evidencias adjuntas (Móvil / Calendario de pedidos)
router.get('/:id/fotos', verificarToken, requierePermiso('pedidos', 'ver'), fotoPedidoController.listarFotos);
router.post('/:id/fotos', verificarToken, requierePermiso('pedidos', 'editar'), fotoPedidoController.middlewareSubida, fotoPedidoController.subirFoto);
router.delete('/fotos/:id_foto', verificarToken, requierePermiso('pedidos', 'editar'), fotoPedidoController.eliminarFoto);

module.exports = router;
