const express = require('express');
const router = express.Router();
const mensajeController = require('../controllers/mensajeController');
const { verificarToken } = require('../middlewares/authMiddleware');

const soloAdminCentral = (req, res, next) => {
    if (req.usuario.nombre_rol !== 'Admin Central') {
        return res.status(403).json({
            exito: false,
            mensaje: 'Acceso denegado. Solo el Admin Central tiene autorización para ver y supervisar mensajes.'
        });
    }
    next();
};

// Rutas de Mensajería y Supervisión exclusivas para Admin Central
router.use(verificarToken, soloAdminCentral);

router.post('/', mensajeController.enviarMensaje);
router.get('/contactos', mensajeController.listarContactos);
router.get('/chat/:id_otro', mensajeController.obtenerChat);
router.get('/supervision', mensajeController.supervisarConversaciones);
router.get('/supervision/:u1/:u2', mensajeController.supervisarChatPar);

module.exports = router;

