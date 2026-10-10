const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');

//importamos nuestros guardias
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

//colocamos los guardias EN MEDIO de la ruta y el controlador - el orden importa: primero verifica el token, luego verifica el rol, luego muestra los datos
router.get('/', verificarToken, requierePermiso('usuarios', 'ver'), usuarioController.listarUsuarios);
router.post('/', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.crearUsuario);

router.get('/roles', verificarToken, requierePermiso('usuarios', 'ver'), usuarioController.listarRoles);
router.post('/roles', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.crearRol);

router.put('/:id_usuario/rol', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.cambiarRol);
router.put('/:id_usuario/configuracion', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.actualizarConfiguracion);

router.get('/permisos', verificarToken, requierePermiso('usuarios', 'ver'), usuarioController.obtenerPermisos);
router.put('/permisos', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.actualizarPermisos);

module.exports = router;
