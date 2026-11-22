const express = require('express');
const router = express.Router();
const mensajeController = require('../controllers/mensajeController');
const { verificarToken } = require('../middlewares/authMiddleware');

const soloAdminCentral = (req, res, next) => {
    if (req.usuario.nombre_rol !== 'Admin Central') {
        return res.status(403).json({
            exito: false,
            mensaje: 'Acceso denegado. Solo el Admin Central puede supervisar conversaciones.'
        });
    }
    next();
};

// Rutas de mensajería interna entre todos los empleados autenticados
router.use(verificarToken);

router.get('/contactos', mensajeController.listarContactos);
router.get('/no-leidos', mensajeController.contarNoLeidos);
router.get('/chat/:id_otro', mensajeController.obtenerChat);

// Grupos tipo WhatsApp
router.get('/grupos', mensajeController.listarGrupos);
router.post('/grupos', mensajeController.crearGrupo);
router.get('/grupos/:id_grupo', mensajeController.obtenerDetalleGrupo);
router.put('/grupos/:id_grupo', mensajeController.actualizarGrupo);
router.post('/grupos/:id_grupo/miembros', mensajeController.agregarMiembrosGrupo);
router.patch('/grupos/:id_grupo/miembros/:id_usuario/rol', mensajeController.cambiarRolMiembroGrupo);
router.delete('/grupos/:id_grupo/miembros/:id_usuario', mensajeController.quitarOSalirGrupo);
router.delete('/grupos/:id_grupo', mensajeController.eliminarGrupo);
router.get('/grupos/:id_grupo/mensajes', mensajeController.obtenerMensajesGrupo);
router.post('/grupos/:id_grupo/mensajes', mensajeController.enviarMensajeGrupo);

// Cada usuario vincula, consulta y administra su propia sesión individual de WhatsApp QR
router.get('/whatsapp/estado', mensajeController.estadoWhatsApp);
router.post('/whatsapp/vincular', mensajeController.vincularWhatsAppHandler);
router.post('/whatsapp/desconectar', mensajeController.desconectarWhatsAppHandler);

// Rutas de Supervisión Silenciosa: EXCLUSIVAS para Admin Central
router.get('/supervision', soloAdminCentral, mensajeController.supervisarConversaciones);
router.get('/supervision/:u1/:u2', soloAdminCentral, mensajeController.supervisarChatPar);
router.get('/supervision-grupos', soloAdminCentral, mensajeController.supervisarGrupos);
router.get('/supervision-grupos/:id_grupo', soloAdminCentral, mensajeController.supervisarGrupoDetalle);

router.post('/', mensajeController.enviarMensaje);
router.post('/:id/whatsapp', mensajeController.reenviarWhatsAppMensaje);

module.exports = router;
