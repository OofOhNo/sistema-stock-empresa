const express = require('express');
const router = express.Router();
const organizacionController = require('../controllers/organizacionController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

router.get('/', verificarToken, requierePermiso(['organizacion', 'ubicaciones'], 'ver'), organizacionController.obtenerOrganizacion);
router.put('/gerente/:id_ubicacion', verificarToken, requierePermiso(['organizacion', 'ubicaciones'], 'editar'), organizacionController.actualizarGerenteSede);

module.exports = router;
