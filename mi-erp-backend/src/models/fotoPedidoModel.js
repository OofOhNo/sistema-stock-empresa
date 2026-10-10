const pool = require('../config/db');
const fs = require('fs');
const path = require('path');

const FotoPedido = {

    // Purgar fotos expiradas (con más de 2 meses)
    purgarExpiradas: async () => {
        try {
            // 1. Obtener fotos vencidas para eliminar archivos físicos
            const resVencidas = await pool.query(`
                SELECT id_foto, url_foto, nombre_archivo 
                FROM fotos_pedidos 
                WHERE expira_en <= CURRENT_TIMESTAMP;
            `);

            for (const f of resVencidas.rows) {
                if (f.nombre_archivo) {
                    const rutaLocal = path.join(__dirname, '../../uploads/pedidos', f.nombre_archivo);
                    if (fs.existsSync(rutaLocal)) {
                        try { fs.unlinkSync(rutaLocal); } catch (e) { /* ignorar error de borrado físico */ }
                    }
                }
            }

            // 2. Eliminar de la base de datos
            await pool.query(`DELETE FROM fotos_pedidos WHERE expira_en <= CURRENT_TIMESTAMP;`);
        } catch (error) {
            console.error('Error al purgar fotos expiradas:', error);
        }
    },

    // Guardar una nueva foto asociada al pedido
    agregarFoto: async (id_pedido, id_usuario, url_foto, nombre_archivo, descripcion) => {
        try {
            // Primero purgar cualquier foto vieja que haya expirado
            await FotoPedido.purgarExpiradas();

            const query = `
                INSERT INTO fotos_pedidos (
                    id_pedido, id_usuario, url_foto, nombre_archivo, descripcion, expira_en
                )
                VALUES (
                    $1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '2 months'
                )
                RETURNING *;
            `;
            const { rows } = await pool.query(query, [
                id_pedido, 
                id_usuario, 
                url_foto, 
                nombre_archivo, 
                descripcion || null
            ]);
            return rows[0];
        } catch (error) {
            throw error;
        }
    },

    // Obtener fotos activas (no expiradas) de un pedido
    obtenerPorPedido: async (id_pedido) => {
        try {
            // Purgar expiradas
            await FotoPedido.purgarExpiradas();

            const query = `
                SELECT 
                    f.id_foto,
                    f.id_pedido,
                    f.id_usuario,
                    f.url_foto,
                    f.nombre_archivo,
                    f.descripcion,
                    f.creado_en,
                    f.expira_en,
                    u.nombre_completo AS subido_por
                FROM fotos_pedidos f
                LEFT JOIN usuarios u ON f.id_usuario = u.id_usuario
                WHERE f.id_pedido = $1 
                  AND f.expira_en > CURRENT_TIMESTAMP
                ORDER BY f.creado_en DESC;
            `;
            const { rows } = await pool.query(query, [id_pedido]);
            return rows;
        } catch (error) {
            throw error;
        }
    },

    // Eliminar foto específica
    eliminarFoto: async (id_foto) => {
        try {
            const res = await pool.query('SELECT * FROM fotos_pedidos WHERE id_foto = $1', [id_foto]);
            if (res.rows.length === 0) return null;

            const foto = res.rows[0];
            if (foto.nombre_archivo) {
                const rutaLocal = path.join(__dirname, '../../uploads/pedidos', foto.nombre_archivo);
                if (fs.existsSync(rutaLocal)) {
                    try { fs.unlinkSync(rutaLocal); } catch (e) {}
                }
            }

            await pool.query('DELETE FROM fotos_pedidos WHERE id_foto = $1', [id_foto]);
            return foto;
        } catch (error) {
            throw error;
        }
    }

};

module.exports = FotoPedido;

