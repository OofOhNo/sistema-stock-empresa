const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authController = require('../controllers/authController');

const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');

const limiterLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        exito: false,
        mensaje: 'Demasiados intentos fallidos de inicio de sesión. Espera 15 minutos e intenta nuevamente.'
    }
});

const limiterRecuperacion = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        exito: false,
        mensaje: 'Has enviado demasiadas solicitudes seguidas. Espera 15 minutos antes de volver a intentarlo.'
    }
});

// Configuración pública de métodos de acceso (ej. Google Workspace)
router.get('/config-publica', authController.configPublica);

// Inicio de sesión tradicional y con Google Workspace
router.post('/login', limiterLogin, authController.login);
router.post('/google', limiterLogin, authController.loginConGoogle);

// Configuración corporativa de Google Workspace (exclusivo Admin Central)
router.get('/config-corporativa', verificarToken, esAdmin, authController.obtenerConfigCorporativa);
router.put('/config-corporativa', verificarToken, esAdmin, authController.actualizarConfigCorporativa);

// Solicitud pública de recuperación de contraseña olvidada (avisa al encargado de Personal y Roles)
router.post('/solicitar-recuperacion', limiterRecuperacion, authController.solicitarRecuperacion);

// Perfil actualizado del usuario autenticado
router.get('/perfil', verificarToken, authController.perfil);

// Cambio voluntario de contraseña propia estando con sesión iniciada
router.put('/cambiar-password', verificarToken, authController.cambiarPasswordPropia);

module.exports = router;
