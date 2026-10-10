const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar clientes (con protección de celulares según permiso individual por cliente)
router.get('/', verificarToken, requierePermiso('clientes', 'ver'), clienteController.listarClientes);

// Crear cliente
router.post('/', verificarToken, requierePermiso('clientes', 'editar'), clienteController.crearCliente);

// Actualizar cliente
router.put('/:id', verificarToken, requierePermiso('clientes', 'editar'), clienteController.actualizarCliente);

// Obtener permisos de celulares de clientes de un usuario específico
router.get('/permisos-usuario/:id_usuario', verificarToken, requierePermiso('usuarios', 'ver'), clienteController.obtenerPermisosCelularUsuario);

// Asignar qué celulares de clientes puede ver un usuario específico
router.put('/permisos-usuario/:id_usuario', verificarToken, requierePermiso('usuarios', 'editar'), clienteController.actualizarPermisosCelularUsuario);

module.exports = router;
