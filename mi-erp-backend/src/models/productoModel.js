const pool = require('../config/db');

class ProductoModel {
    static async getAll() {
        const query = `
            SELECT 
                p.*,
                (p.precio_venta - COALESCE(p.precio_costo, 0)) AS margen
            FROM productos p
            ORDER BY p.id_producto DESC
        `;
        const { rows } = await pool.query(query);
        return rows;
    }

    static async getById(id) {
        const query = `
            SELECT 
                p.*,
                (p.precio_venta - COALESCE(p.precio_costo, 0)) AS margen
            FROM productos p
            WHERE p.id_producto = $1
        `;
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async create(data) {
        const {
            sku, nombre, descripcion, id_categoria, 
            precio_venta, precio_costo, stock_minimo
        } = data;
        
        const query = `
            INSERT INTO productos (
                sku, nombre, descripcion, id_categoria, 
                precio_venta, precio_costo, stock_minimo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [
            sku, nombre, descripcion, id_categoria,
            precio_venta, precio_costo, stock_minimo
        ];
        
        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async update(id, data) {
        const {
            sku, nombre, descripcion, id_categoria, 
            precio_venta, precio_costo, stock_minimo
        } = data;

        const query = `
            UPDATE productos 
            SET 
                sku = COALESCE($1, sku),
                nombre = COALESCE($2, nombre),
                descripcion = COALESCE($3, descripcion),
                id_categoria = COALESCE($4, id_categoria),
                precio_venta = COALESCE($5, precio_venta),
                precio_costo = COALESCE($6, precio_costo),
                stock_minimo = COALESCE($7, stock_minimo)
            WHERE id_producto = $8
            RETURNING *
        `;
        const values = [
            sku, nombre, descripcion, id_categoria,
            precio_venta, precio_costo, stock_minimo,
            id
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async delete(id) {
        const query = 'DELETE FROM productos WHERE id_producto = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }
}

module.exports = ProductoModel;
