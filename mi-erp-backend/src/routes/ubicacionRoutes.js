const express = require('express');
const router = express.Router();
const ubicacionController = require('../controllers/ubicacionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.use(verificarToken);

// Listar ubicaciones y divisiones
router.get('/', requierePermiso('ubicaciones', 'ver'), ubicacionController.listar);
router.get('/divisiones', requierePermiso('ubicaciones', 'ver'), ubicacionController.listarDivisiones);
router.get('/:id', requierePermiso('ubicaciones', 'ver'), ubicacionController.obtenerPorId);

// Mutaciones
router.post('/', requierePermiso('ubicaciones', 'editar'), ubicacionController.crear);
router.put('/:id', requierePermiso('ubicaciones', 'editar'), ubicacionController.actualizar);
router.delete('/:id', requierePermiso('ubicaciones', 'editar'), ubicacionController.eliminar);

module.exports = router;

