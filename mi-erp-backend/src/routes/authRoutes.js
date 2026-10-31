const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { verificarToken } = require('../middlewares/authMiddleware');

// Inicio de sesión
router.post('/login', authController.login);

// Solicitud pública de recuperación de contraseña olvidada (avisa al encargado de Personal y Roles)
router.post('/solicitar-recuperacion', authController.solicitarRecuperacion);

// Perfil actualizado del usuario autenticado
router.get('/perfil', verificarToken, authController.perfil);

// Cambio voluntario de contraseña propia estando con sesión iniciada
router.put('/cambiar-password', verificarToken, authController.cambiarPasswordPropia);

module.exports = router;
