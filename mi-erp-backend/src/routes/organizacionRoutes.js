const express = require('express');
const router = express.Router();
const organizacionController = require('../controllers/organizacionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.get('/', verificarToken, requierePermiso('organizacion', 'ver'), organizacionController.obtenerOrganizacion);
router.put('/gerente/:id_ubicacion', verificarToken, requierePermiso('organizacion', 'editar'), organizacionController.actualizarGerenteSede);

module.exports = router;

