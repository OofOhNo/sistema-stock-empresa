const express = require('express');
const router = express.Router();
const errorController = require('../controllers/errorController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Ver bandeja de problemas reportados
router.get('/', verificarToken, requierePermiso('errores', 'ver'), errorController.listarErrores);

// Cualquier empleado con sesión iniciada puede reportar un problema desde el botón de ayuda
router.post('/', verificarToken, errorController.crearError);

// Actualizar estado / resolver un problema reportado
router.put('/:id', verificarToken, requierePermiso('errores', 'editar'), errorController.actualizarError);

module.exports = router;
