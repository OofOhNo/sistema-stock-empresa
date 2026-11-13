const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar clientes (disponible para selectores en Pedidos/Facturación; los celulares siguen protegidos por permiso individual)
router.get('/carpetas', verificarToken, clienteController.listarCarpetas);
router.post('/carpetas', verificarToken, requierePermiso('clientes', 'editar'), clienteController.crearCarpeta);
router.put('/carpetas/:id', verificarToken, requierePermiso('clientes', 'editar'), clienteController.actualizarCarpeta);
router.delete('/carpetas/:id', verificarToken, requierePermiso('clientes', 'editar'), clienteController.eliminarCarpeta);
router.patch('/:id/carpeta', verificarToken, requierePermiso('clientes', 'editar'), clienteController.moverClienteCarpeta);

// RUTAS DE CLIENTES
router.get('/', verificarToken, clienteController.listarClientes);

// Crear cliente
router.post('/', verificarToken, requierePermiso('clientes', 'editar'), clienteController.crearCliente);

// Actualizar cliente
router.put('/:id', verificarToken, requierePermiso('clientes', 'editar'), clienteController.actualizarCliente);

// Obtener permisos de celulares de clientes de un usuario específico
router.get('/permisos-usuario/:id_usuario', verificarToken, requierePermiso('usuarios', 'ver'), clienteController.obtenerPermisosCelularUsuario);

// Asignar qué celulares de clientes puede ver un usuario específico
router.put('/permisos-usuario/:id_usuario', verificarToken, requierePermiso('usuarios', 'editar'), clienteController.actualizarPermisosCelularUsuario);

module.exports = router;
