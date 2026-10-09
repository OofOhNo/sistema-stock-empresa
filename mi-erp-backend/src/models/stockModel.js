const pool = require('../config/db');

const Stock = {

    //ver el stock de una ubicacion especifica
    obtenerStockPorUbicacion: async (idUbicacion) => {
        try {
            const query = `
                SELECT 
                    p.id_producto,
                    p.sku,
                    p.nombre AS nombre_producto,
                    p.precio_venta,
                    s.nombre AS nombre_ubicacion,
                    i.cantidad_fisica,
                    i.cantidad_reservada,
                    (i.cantidad_fisica - i.cantidad_reservada) AS cantidad_disponible,
                    i.ultima_actualizacion
                FROM inventario i
                JOIN productos p ON i.id_producto = p.id_producto
                JOIN ubicaciones s ON i.id_ubicacion = s.id_ubicacion
                WHERE i.id_ubicacion = $1;
            `;
            const resultado = await pool.query(query, [idUbicacion]);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    },

    //ver el stock global consolidado de toda la empresa (para Jefe / Admin)
    obtenerStockGlobal: async () => {
        try {
            const query = `
                SELECT 
                    p.id_producto,
                    p.sku,
                    p.nombre AS nombre_producto,
                    p.precio_venta,
                    SUM(i.cantidad_fisica) AS total_fisico,
                    SUM(i.cantidad_reservada) AS total_reservado,
                    SUM(i.cantidad_fisica - i.cantidad_reservada) AS total_disponible
                FROM productos p
                LEFT JOIN inventario i ON p.id_producto = i.id_producto
                GROUP BY p.id_producto, p.sku, p.nombre, p.precio_venta;
            `;
            const resultado = await pool.query(query);
            return resultado.rows;
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Stock;