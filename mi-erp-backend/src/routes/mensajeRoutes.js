const express = require('express');
const router = express.Router();
const mensajeController = require('../controllers/mensajeController');
const { verificarToken } = require('../middlewares/authMiddleware');

const soloAdminCentral = (req, res, next) => {
    if (req.usuario.nombre_rol !== 'Admin Central') {
        return res.status(403).json({
            exito: false,
            mensaje: 'Acceso denegado. Esta acción es exclusiva para Admin Central.'
        });
    }
    next();
};

// Rutas de mensajería interna entre todos los empleados autenticados
router.use(verificarToken);

router.post('/', mensajeController.enviarMensaje);
router.post('/:id/whatsapp', mensajeController.reenviarWhatsAppMensaje);
router.get('/contactos', mensajeController.listarContactos);
router.get('/no-leidos', mensajeController.contarNoLeidos);
router.get('/chat/:id_otro', mensajeController.obtenerChat);

// Estado e integración directa de WhatsApp (solo Admin Central vincula o desvincula QR)
router.get('/whatsapp/estado', mensajeController.estadoWhatsApp);
router.post('/whatsapp/vincular', soloAdminCentral, mensajeController.vincularWhatsAppHandler);
router.post('/whatsapp/desconectar', soloAdminCentral, mensajeController.desconectarWhatsAppHandler);

// Rutas de Supervisión Silenciosa: EXCLUSIVAS para Admin Central
router.get('/supervision', soloAdminCentral, mensajeController.supervisarConversaciones);
router.get('/supervision/:u1/:u2', soloAdminCentral, mensajeController.supervisarChatPar);

module.exports = router;
