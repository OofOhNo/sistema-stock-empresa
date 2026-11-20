const express = require('express');
const router = express.Router();
const reunionController = require('../controllers/reunionController');

const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// Agenda de reuniones y usuarios elegibles por nivel jerárquico
router.get('/', verificarToken, requierePermiso('reuniones', 'ver'), reunionController.listarReuniones);
router.get('/invitables', verificarToken, requierePermiso('reuniones', 'ver'), reunionController.listarInvitables);

// Agendar y editar reuniones (edición permitida máximo hasta 10 min antes del inicio)
router.post('/', verificarToken, requierePermiso('reuniones', 'editar'), reunionController.crearReunion);
router.put('/:id', verificarToken, requierePermiso('reuniones', 'editar'), reunionController.actualizarReunion);

module.exports = router;
