const express = require('express');
const router = express.Router();
const calidadController = require('../controllers/calidadController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.get('/', verificarToken, requierePermiso('calidad', 'ver'), calidadController.listarCertificados);
router.post('/', verificarToken, requierePermiso('calidad', 'editar'), calidadController.crearCertificado);
router.put('/:id', verificarToken, requierePermiso('calidad', 'editar'), calidadController.actualizarCertificado);
router.delete('/:id', verificarToken, requierePermiso('calidad', 'editar'), calidadController.eliminarCertificado);

module.exports = router;

