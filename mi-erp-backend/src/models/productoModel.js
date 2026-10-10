const pool = require('../config/db');

class ProductoModel {
    static async getAll(incluirInactivos = false) {
        let query = `
            SELECT 
                p.*,
                (p.precio_venta - COALESCE(p.precio_costo, 0)) AS margen
            FROM productos p
        `;
        if (!incluirInactivos) {
            query += ` WHERE p.activo = true`;
        }
        query += ` ORDER BY p.id_producto DESC`;
        
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
                precio_venta, precio_costo, stock_minimo, activo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            RETURNING *
        `;
        const values = [
            sku, nombre, descripcion, id_categoria,
            precio_venta, precio_costo || 0, stock_minimo || 5
        ];
        
        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async update(id, data) {
        const {
            sku, nombre, descripcion, id_categoria, 
            precio_venta, precio_costo, stock_minimo, activo
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
                stock_minimo = COALESCE($7, stock_minimo),
                activo = COALESCE($8, activo)
            WHERE id_producto = $9
            RETURNING *
        `;
        const values = [
            sku, nombre, descripcion, id_categoria,
            precio_venta, precio_costo, stock_minimo, activo,
            id
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    // Regla de Seguridad Etapa 3: Baja lógica (activo = false) en vez de DELETE
    static async delete(id) {
        const query = 'UPDATE productos SET activo = false WHERE id_producto = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }
}

module.exports = ProductoModel;
