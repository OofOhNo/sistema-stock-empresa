const express = require('express');
const router = express.Router();
const facturaController = require('../controllers/facturaController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar comprobantes emitidos
router.get('/', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarComprobantes);

// Gráficos y métricas de facturación (Semanal, Mensual, Trimestral, Anual)
router.get('/graficos', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerGraficosFacturacion);

// Detalle completo de un comprobante para vista previa e impresión PDF propia
router.get('/:id/detalle', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerDetalleComprobante);

// Emitir comprobante electrónico (Factura '01' o Boleta '03')
router.post('/emitir', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.emitirComprobante);

// Anular comprobante emitiendo Nota de Crédito y devolviendo stock
router.post('/anular', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.anularComprobante);

module.exports = router;
