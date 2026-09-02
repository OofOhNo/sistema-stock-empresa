const express = require('express');
const router = express.Router();
const kardexController = require('../controllers/kardexController');
const { verificarToken } = require('../middlewares/authMiddleware');
const pool = require('../config/db');

// --- RUTAS DEL KARDEX ---

// 1. obtener todo el historial de movimientos (Kardex)
// usamos directamente pool.query aqui para hacerlo rapido (es un GET)
router.get('/', verificarToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                k.id_movimiento, k.tipo_movimiento, k.cantidad, k.motivo, k.fecha_movimiento, k.estado,
                p.nombre AS nombre_producto, 
                u.nombre AS usuario_creador,
                ua.nombre AS usuario_anulador
            FROM movimientos_kardex k
            JOIN productos p ON k.id_producto = p.id_producto
            JOIN usuarios u ON k.id_usuario = u.id_usuario
            LEFT JOIN usuarios ua ON k.id_usuario_anulador = ua.id_usuario
            ORDER BY k.fecha_movimiento DESC;
        `;
        const { rows } = await pool.query(query);
        
        res.status(200).json({ exito: true, movimientos: rows });
    } catch (error) {
        console.error("Error al obtener Kardex:", error);
        res.status(500).json({ exito: false, mensaje: "Error al obtener el historial del Kardex." });
    }
});

// 2. registrar un nuevo movimiento manual (Ingreso o Salida)
router.post('/movimiento', verificarToken, kardexController.registrarMovimiento);

// 3. anular un movimiento existente (pasa por la regla de los 10 minutos)
router.put('/:id_movimiento/anular', verificarToken, kardexController.anularMovimiento);


module.exports = router;