const express = require('express');
const router = express.Router();
const facturaController = require('../controllers/facturaController');
const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar comprobantes emitidos y alertas de crédito vencidas
router.get('/', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarComprobantes);
router.get('/vencidas', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarFacturasVencidas);
router.get('/estado-sunat', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.consultarEstadoSunat);
router.get('/consultar-ruc/:ruc', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.consultarRucPublico);
router.patch('/:id/estado-pago', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.actualizarEstadoPagoComprobante);

// Configuración tributaria del emisor, credenciales NubeFact (edición/prueba solo Admin Central) y Catálogos SUNAT
router.get('/configuracion', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerConfiguracionYCatalogos);
router.put('/configuracion', verificarToken, esAdmin, facturaController.actualizarConfiguracionSunat);
router.post('/probar-conexion', verificarToken, esAdmin, facturaController.probarConexionNubefact);

// Gráficos y métricas de facturación (Semanal, Mensual, Trimestral, Anual)
router.get('/graficos', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerGraficosFacturacion);

// Boletas automáticas y cola de impresión en segundo plano
router.get('/boletas-auto/config', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerConfigBoletasAuto);
router.put('/boletas-auto/config', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.actualizarConfigBoletasAuto);
router.post('/boletas-auto/reiniciar-tope', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.reiniciarTopeBoletasAuto);
router.get('/boletas-auto/resumen', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerResumenBoletasAuto);
router.post('/boletas-auto/generar-ahora', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.generarBoletaAutoAhora);
router.get('/boletas-auto/cola', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarColaImpresion);
router.patch('/boletas-auto/cola/:id/estado', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.actualizarEstadoColaImpresion);

// Guías de Remisión Electrónica (GRE EG07) y catálogos frecuentes
router.get('/gre/catalogos', verificarToken, requierePermiso(['facturacion', 'ubicaciones'], 'ver'), facturaController.listarCatalogosGre);
router.get('/gre/puntos-llegada/:ruc', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerPuntosLlegadaPorRuc);
router.post('/gre/puntos-llegada', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.guardarPuntoLlegadaRuc);
router.post('/gre/puntos-partida', verificarToken, esAdmin, facturaController.crearPuntoPartidaGre);
router.delete('/gre/puntos-partida/:id', verificarToken, esAdmin, facturaController.eliminarPuntoPartidaGre);
router.post('/gre/vehiculos', verificarToken, requierePermiso('ubicaciones', 'editar'), facturaController.crearVehiculoGre);
router.put('/gre/vehiculos/:id', verificarToken, requierePermiso('ubicaciones', 'editar'), facturaController.actualizarVehiculoGre);
router.delete('/gre/vehiculos/:id', verificarToken, requierePermiso('ubicaciones', 'editar'), facturaController.eliminarVehiculoGre);
router.post('/gre/conductores', verificarToken, esAdmin, facturaController.crearConductorGre);
router.delete('/gre/conductores/:id', verificarToken, esAdmin, facturaController.eliminarConductorGre);
router.get('/gre', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.listarGres);
router.post('/gre', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.emitirGreStandalone);
router.get('/gre/:id/detalle', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerDetalleGre);
router.get('/gre/:id/xml', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.descargarXmlGre);
router.get('/gre/:id/cdr', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.descargarCdrGre);
router.post('/gre/:id/consultar', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.consultarGreSunat);
router.post('/gre/:id/reenviar', verificarToken, requierePermiso('facturacion', 'editar'), facturaController.reenviarGreSunat);

// Detalle completo de un comprobante para vista previa e impresión PDF A4 reglamentaria
router.get('/:id/detalle', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.obtenerDetalleComprobante);
router.post('/:id/consultar-estado', verificarToken, requierePermiso('facturacion', 'ver'), facturaController.consultarEstadoComprobanteSunat);

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
