const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');

const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.get('/', verificarToken, requierePermiso('usuarios', 'ver'), usuarioController.listarUsuarios);
router.post('/', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.crearUsuario);

// Solicitudes de recuperación de contraseña olvidada (encargados con permiso de Editar en Personal y Roles)
router.get('/recuperaciones', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.listarSolicitudesRecuperacion);
router.put('/recuperaciones/:id_solicitud/descartar', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.descartarSolicitudRecuperacion);
router.put('/:id_usuario/restablecer-password', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.restablecerPasswordUsuario);

router.get('/roles', verificarToken, requierePermiso('usuarios', 'ver'), usuarioController.listarRoles);
router.post('/roles', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.crearRol);
router.put('/roles/:id_rol/ubicaciones-permiso', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.actualizarPermisoUbicacionesRol);

router.put('/:id_usuario/rol', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.cambiarRol);
router.put('/:id_usuario/configuracion', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.actualizarConfiguracion);
router.delete('/:id_usuario', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.eliminarUsuario);

router.get('/permisos', verificarToken, requierePermiso('usuarios', 'ver'), usuarioController.obtenerPermisos);
router.put('/permisos', verificarToken, requierePermiso('usuarios', 'editar'), usuarioController.actualizarPermisos);

module.exports = router;
