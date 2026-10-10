const express = require('express');
const router = express.Router();
const kardexController = require('../controllers/kardexController');
const { verificarToken } = require('../middlewares/authMiddleware');
const requierePermiso = require('../middlewares/requierePermiso');

// --- RUTAS DEL KARDEX ---

// 1. Obtener historial del Kardex (filtrado por ubicación para roles operativos)
router.get('/', verificarToken, requierePermiso('stock', 'ver'), kardexController.listarMovimientos);

// 2. Registrar movimiento manual (Ingreso o Salida)
router.post('/movimiento', verificarToken, requierePermiso('stock', 'editar'), kardexController.registrarMovimiento);

// 3. Anular movimiento (directo <= 10 min o pasa a solicitud)
router.put('/:id_movimiento/anular', verificarToken, requierePermiso('stock', 'editar'), kardexController.anularMovimiento);

// 4. Etapa 4: Aprobar solicitud de anulación (Admin / Gerente)
router.put('/:id_movimiento/aprobar', verificarToken, requierePermiso('stock', 'editar'), kardexController.aprobarAnulacion);

// 5. Etapa 4: Rechazar solicitud de anulación (Admin / Gerente)
router.put('/:id_movimiento/rechazar', verificarToken, requierePermiso('stock', 'editar'), kardexController.rechazarAnulacion);

module.exports = router;
