const express = require('express');
const router = express.Router();
const facturaController = require('../controllers/facturaController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar comprobantes emitidos
router.get('/', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarComprobantes);

// Emitir comprobante electrónico (Factura '01' o Boleta '03')
router.post('/emitir', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.emitirComprobante);

// Anular comprobante emitiendo Nota de Crédito
router.post('/anular', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.anularComprobante);

module.exports = router;