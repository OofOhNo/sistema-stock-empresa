const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const { verificarToken } = require('../middlewares/authMiddleware');

//esta ruta sera POST, porque el usuario enviara datos (email y password)
router.post('/login', authController.login);
router.get('/perfil', verificarToken, authController.perfil);

module.exports = router;