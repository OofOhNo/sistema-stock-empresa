const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');
const pagosCalendarioController = require('../controllers/pagosCalendarioController');

// Cada usuario con permiso de calendario_pagos solo ve y gestiona su propio calendario individual
router.use(verificarToken);

router.get('/', requierePermiso('calendario_pagos', 'ver'), pagosCalendarioController.listarPagos);
router.get('/alertas-inicio', requierePermiso('calendario_pagos', 'ver'), pagosCalendarioController.alertasInicio);
router.post('/', requierePermiso('calendario_pagos', 'editar'), pagosCalendarioController.crearPago);
router.put('/:id', requierePermiso('calendario_pagos', 'editar'), pagosCalendarioController.actualizarPago);
router.patch('/:id/estado', requierePermiso('calendario_pagos', 'editar'), pagosCalendarioController.cambiarEstado);
router.delete('/:id', requierePermiso('calendario_pagos', 'editar'), pagosCalendarioController.eliminarPago);

module.exports = router;
