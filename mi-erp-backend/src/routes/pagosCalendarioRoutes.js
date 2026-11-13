const express = require('express');
const router = express.Router();
const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');
const pagosCalendarioController = require('../controllers/pagosCalendarioController');

// Exclusivo para Admin Central
router.use(verificarToken, esAdmin);

router.get('/', pagosCalendarioController.listarPagos);
router.get('/alertas-inicio', pagosCalendarioController.alertasInicio);
router.post('/', pagosCalendarioController.crearPago);
router.put('/:id', pagosCalendarioController.actualizarPago);
router.patch('/:id/estado', pagosCalendarioController.cambiarEstado);
router.delete('/:id', pagosCalendarioController.eliminarPago);

module.exports = router;
