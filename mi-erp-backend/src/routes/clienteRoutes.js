const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Listar clientes (con protección de celulares según permiso)
router.get('/', verificarToken, requierePermiso('clientes', 'ver'), clienteController.listarClientes);

// Crear cliente
router.post('/', verificarToken, requierePermiso('clientes', 'editar'), clienteController.crearCliente);

// Actualizar cliente
router.put('/:id', verificarToken, requierePermiso('clientes', 'editar'), clienteController.actualizarCliente);

module.exports = router;

