const express = require('express');
const router = express.Router();
const facturaController = require('../controllers/facturaController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar comprobantes emitidos
router.get('/', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarComprobantes);

// Configuración tributaria del emisor, credenciales NubeFact y Catálogos SUNAT
router.get('/configuracion', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerConfiguracionYCatalogos);
router.put('/configuracion', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.actualizarConfiguracionSunat);
router.post('/probar-conexion', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.probarConexionNubefact);

// Gráficos y métricas de facturación (Semanal, Mensual, Trimestral, Anual)
router.get('/graficos', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerGraficosFacturacion);

// Detalle completo de un comprobante para vista previa e impresión PDF A4 reglamentaria
router.get('/:id/detalle', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerDetalleComprobante);

// Descarga de XML UBL 2.1 firmado y Constancia de Recepción CDR de SUNAT
router.get('/:id/xml', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.descargarXmlComprobante);
router.get('/:id/cdr', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.descargarCdrComprobante);

// Emitir comprobante electrónico (Factura '01' o Boleta '03')
router.post('/emitir', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.emitirComprobante);

// Emitir comprobante electrónico manual sin pedido previo (Venta directa con descuento de stock)
router.post('/emitir-manual', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.emitirComprobanteManual);

// Notas de Pedido (Documento comercial interno imprimible con formato específico)
router.get('/notas-pedido', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarNotasPedido);
router.post('/notas-pedido', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.crearNotaPedido);
router.get('/notas-pedido/:id', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerDetalleNotaPedido);

// Anular comprobante emitiendo Nota de Crédito ('07' con Catálogo 09) y devolviendo stock
router.post('/anular', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.anularComprobante);

module.exports = router;
