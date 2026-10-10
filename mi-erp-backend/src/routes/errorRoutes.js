const express = require('express');
const router = express.Router();
const errorController = require('../controllers/errorController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.get('/', verificarToken, requierePermiso('errores', 'ver'), errorController.listarErrores);
router.post('/', verificarToken, requierePermiso('errores', 'editar'), errorController.crearError);
router.put('/:id', verificarToken, requierePermiso('errores', 'editar'), errorController.actualizarError);

module.exports = router;

