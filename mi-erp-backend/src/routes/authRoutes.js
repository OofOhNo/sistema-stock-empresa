const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');

// Configuración pública de métodos de acceso (ej. Google Workspace)
router.get('/config-publica', authController.configPublica);

// Inicio de sesión tradicional y con Google Workspace
router.post('/login', authController.login);
router.post('/google', authController.loginConGoogle);

// Configuración corporativa de Google Workspace (exclusivo Admin Central)
router.get('/config-corporativa', verificarToken, esAdmin, authController.obtenerConfigCorporativa);
router.put('/config-corporativa', verificarToken, esAdmin, authController.actualizarConfigCorporativa);

// Solicitud pública de recuperación de contraseña olvidada (avisa al encargado de Personal y Roles)
router.post('/solicitar-recuperacion', authController.solicitarRecuperacion);

// Perfil actualizado del usuario autenticado
router.get('/perfil', verificarToken, authController.perfil);

// Cambio voluntario de contraseña propia estando con sesión iniciada
router.put('/cambiar-password', verificarToken, authController.cambiarPasswordPropia);

module.exports = router;
