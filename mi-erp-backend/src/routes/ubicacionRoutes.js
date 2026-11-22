const express = require('express');
const router = express.Router();
const ubicacionController = require('../controllers/ubicacionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.use(verificarToken);

// Listar ubicaciones está disponible para cualquier empleado autenticado (usado en selectores de Stock, Pedidos, Calidad, Reuniones)
router.get('/', ubicacionController.listar);
router.get('/divisiones', ubicacionController.listarDivisiones);

// Gestión de Áreas / Divisiones (antes de /:id para no colisionar con el parámetro numérico)
router.post('/divisiones', requierePermiso('ubicaciones', 'editar'), ubicacionController.crearDivision);
router.put('/divisiones/:id', requierePermiso('ubicaciones', 'editar'), ubicacionController.actualizarDivision);
router.delete('/divisiones/:id', requierePermiso('ubicaciones', 'editar'), ubicacionController.eliminarDivision);

router.get('/:id', ubicacionController.obtenerPorId);

// Mutaciones exclusivas para usuarios con permiso de edición en Ubicaciones
router.post('/', requierePermiso('ubicaciones', 'editar'), ubicacionController.crear);
router.put('/:id', requierePermiso('ubicaciones', 'editar'), ubicacionController.actualizar);
router.delete('/:id', requierePermiso('ubicaciones', 'editar'), ubicacionController.eliminar);

module.exports = router;
