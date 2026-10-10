const pool = require('../config/db');

const Stock = {

    // Ver el stock de una ubicación específica
    obtenerStockPorUbicacion: async (idUbicacion) => {
        try {
            const query = `
                SELECT 
                    p.id_producto,
                    p.sku,
                    p.nombre AS nombre_producto,
                    p.precio_venta,
                    p.stock_minimo,
                    s.id_ubicacion,
                    s.nombre AS nombre_ubicacion,
                    i.cantidad_fisica,
                    i.cantidad_reservada,
                    (i.cantidad_fisica - i.cantidad_reservada) AS cantidad_disponible,
                    i.ultima_actualizacion
                FROM inventario i
                JOIN productos p ON i.id_producto = p.id_producto
                JOIN ubicaciones s ON i.id_ubicacion = s.id_ubicacion
                WHERE i.id_ubicacion = $1 AND p.activo = true
                ORDER BY p.nombre ASC;
            `;
            const resultado = await pool.query(query, [idUbicacion]);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    },

    // Ver el stock global consolidado de toda la empresa (para Jefe / Admin)
    obtenerStockGlobal: async () => {
        try {
            const query = `
                SELECT 
                    p.id_producto,
                    p.sku,
                    p.nombre AS nombre_producto,
                    p.precio_venta,
                    p.stock_minimo,
                    COALESCE(SUM(i.cantidad_fisica), 0) AS total_fisico,
                    COALESCE(SUM(i.cantidad_reservada), 0) AS total_reservado,
                    COALESCE(SUM(i.cantidad_fisica - i.cantidad_reservada), 0) AS total_disponible
                FROM productos p
                LEFT JOIN inventario i ON p.id_producto = i.id_producto
                WHERE p.activo = true
                GROUP BY p.id_producto, p.sku, p.nombre, p.precio_venta, p.stock_minimo
                ORDER BY p.nombre ASC;
            `;
            const resultado = await pool.query(query);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    },

    // REGLA DE NEGOCIO ETAPA 4: Alertas de stock mínimo
    obtenerAlertasStockMinimo: async (idUbicacion = null) => {
        try {
            let query = `
                SELECT 
                    p.id_producto,
                    p.sku,
                    p.nombre AS nombre_producto,
                    p.stock_minimo,
                    p.precio_venta,
                    u.id_ubicacion,
                    u.nombre AS nombre_ubicacion,
                    COALESCE(i.cantidad_fisica, 0) AS cantidad_fisica,
                    COALESCE(i.cantidad_reservada, 0) AS cantidad_reservada,
                    COALESCE(i.cantidad_fisica - i.cantidad_reservada, 0) AS cantidad_disponible,
                    CASE 
                        WHEN COALESCE(i.cantidad_fisica - i.cantidad_reservada, 0) <= 0 THEN 'CRITICO'
                        WHEN COALESCE(i.cantidad_fisica - i.cantidad_reservada, 0) <= p.stock_minimo THEN 'BAJO'
                        ELSE 'NORMAL'
                    END AS nivel_alerta
                FROM productos p
                CROSS JOIN ubicaciones u
                LEFT JOIN inventario i ON p.id_producto = i.id_producto AND u.id_ubicacion = i.id_ubicacion
                WHERE p.activo = true
            `;
            const params = [];
            if (idUbicacion) {
                query += ` AND u.id_ubicacion = $1`;
                params.push(idUbicacion);
            }
            query += ` AND (COALESCE(i.cantidad_fisica - i.cantidad_reservada, 0) <= p.stock_minimo)
                       ORDER BY cantidad_disponible ASC;`;
            const resultado = await pool.query(query, params);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Stock;