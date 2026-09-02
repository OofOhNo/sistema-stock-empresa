const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');

//importamos nuestros guardias
const { verificarToken, esAdmin } = require('../middlewares/authMiddleware');

//colocamos los guardias EN MEDIO de la ruta y el controlador - el orden importa: primero verifica el token, luego verifica el rol, luego muestra los datos
router.get('/', verificarToken, esAdmin, usuarioController.listarUsuarios);

router.put('/:id_usuario/rol', verificarToken, usuarioController.cambiarRol);

module.exports = router;