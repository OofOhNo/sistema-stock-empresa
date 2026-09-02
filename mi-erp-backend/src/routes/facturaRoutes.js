const express = require('express');
const router = express.Router();
const facturaController = require('../controllers/facturaController');
const { verificarToken } = require('../middlewares/authMiddleware');

//emitir comprobante electronico (Factura '01' o Boleta '03') ligado a un pedido
router.post('/emitir', verificarToken, facturaController.emitirComprobante);

module.exports = router;