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
                    p.id_unidad,
                    COALESCE(p.unidad_medida, um.nombre, 'Unidad') AS unidad_medida,
                    COALESCE(um.simbolo, 'und') AS simbolo_unidad,
                    s.id_ubicacion,
                    s.nombre AS nombre_ubicacion,
                    i.cantidad_fisica,
                    i.cantidad_reservada,
                    (i.cantidad_fisica - i.cantidad_reservada) AS cantidad_disponible,
                    i.ultima_actualizacion
                FROM inventario i
                JOIN productos p ON i.id_producto = p.id_producto
                JOIN ubicaciones s ON i.id_ubicacion = s.id_ubicacion
                LEFT JOIN unidades_medida um ON p.id_unidad = um.id_unidad
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
                    p.id_unidad,
                    COALESCE(p.unidad_medida, um.nombre, 'Unidad') AS unidad_medida,
                    COALESCE(um.simbolo, 'und') AS simbolo_unidad,
                    COALESCE(SUM(i.cantidad_fisica), 0) AS total_fisico,
                    COALESCE(SUM(i.cantidad_reservada), 0) AS total_reservado,
                    COALESCE(SUM(i.cantidad_fisica - i.cantidad_reservada), 0) AS total_disponible
                FROM productos p
                LEFT JOIN inventario i ON p.id_producto = i.id_producto
                LEFT JOIN unidades_medida um ON p.id_unidad = um.id_unidad
                WHERE p.activo = true
                GROUP BY p.id_producto, p.sku, p.nombre, p.precio_venta, p.stock_minimo, p.id_unidad, p.unidad_medida, um.nombre, um.simbolo
                ORDER BY p.nombre ASC;
            `;
            const resultado = await pool.query(query);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    },

    // REGLA DE NEGOCIO ETAPA 4: Alertas de stock mínimo reales (sin falsos positivos por CROSS JOIN)
    obtenerAlertasStockMinimo: async (idUbicacion = null) => {
        try {
            if (idUbicacion) {
                const query = `
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
                            ELSE 'BAJO'
                        END AS nivel_alerta
                    FROM inventario i
                    JOIN productos p ON i.id_producto = p.id_producto
                    JOIN ubicaciones u ON i.id_ubicacion = u.id_ubicacion
                    WHERE p.activo = true
                      AND i.id_ubicacion = $1
                      AND (i.cantidad_fisica - i.cantidad_reservada) <= p.stock_minimo
                    ORDER BY cantidad_disponible ASC, p.nombre ASC;
                `;
                const resultado = await pool.query(query, [idUbicacion]);
                return resultado.rows;
            } else {
                const query = `
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
                            ELSE 'BAJO'
                        END AS nivel_alerta
                    FROM inventario i
                    JOIN productos p ON i.id_producto = p.id_producto
                    JOIN ubicaciones u ON i.id_ubicacion = u.id_ubicacion
                    WHERE p.activo = true
                      AND (i.cantidad_fisica - i.cantidad_reservada) <= p.stock_minimo

                    UNION ALL

                    SELECT 
                        p.id_producto,
                        p.sku,
                        p.nombre AS nombre_producto,
                        p.stock_minimo,
                        p.precio_venta,
                        NULL AS id_ubicacion,
                        'Sin stock asignado' AS nombre_ubicacion,
                        0 AS cantidad_fisica,
                        0 AS cantidad_reservada,
                        0 AS cantidad_disponible,
                        'CRITICO' AS nivel_alerta
                    FROM productos p
                    WHERE p.activo = true
                      AND NOT EXISTS (
                          SELECT 1 FROM inventario inv WHERE inv.id_producto = p.id_producto
                      )

                    ORDER BY cantidad_disponible ASC, nombre_producto ASC;
                `;
                const resultado = await pool.query(query);
                return resultado.rows;
            }
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Stock;