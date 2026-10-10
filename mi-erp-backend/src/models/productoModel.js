const pool = require('../config/db');

class ProductoModel {
    static async getAll(incluirInactivos = false) {
        let query = `
            SELECT 
                p.*,
                (p.precio_venta - COALESCE(p.precio_costo, 0)) AS margen,
                u.codigo AS codigo_unidad,
                u.simbolo AS simbolo_unidad,
                COALESCE(p.unidad_medida, u.nombre, 'Unidad') AS unidad_medida_nombre
            FROM productos p
            LEFT JOIN unidades_medida u ON p.id_unidad = u.id_unidad
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
                (p.precio_venta - COALESCE(p.precio_costo, 0)) AS margen,
                u.codigo AS codigo_unidad,
                u.simbolo AS simbolo_unidad,
                COALESCE(p.unidad_medida, u.nombre, 'Unidad') AS unidad_medida_nombre
            FROM productos p
            LEFT JOIN unidades_medida u ON p.id_unidad = u.id_unidad
            WHERE p.id_producto = $1
        `;
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async create(data) {
        const {
            sku, nombre, descripcion, id_categoria, 
            precio_venta, precio_costo, stock_minimo,
            id_unidad, unidad_medida
        } = data;
        
        const query = `
            INSERT INTO productos (
                sku, nombre, descripcion, id_categoria, 
                precio_venta, precio_costo, stock_minimo, 
                id_unidad, unidad_medida, activo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
            RETURNING *
        `;
        const values = [
            sku, nombre, descripcion, id_categoria,
            precio_venta, precio_costo || 0, stock_minimo || 5,
            id_unidad || null, unidad_medida || 'Unidad'
        ];
        
        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async update(id, data) {
        const {
            sku, nombre, descripcion, id_categoria, 
            precio_venta, precio_costo, stock_minimo, activo,
            id_unidad, unidad_medida
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
                activo = COALESCE($8, activo),
                id_unidad = COALESCE($9, id_unidad),
                unidad_medida = COALESCE($10, unidad_medida)
            WHERE id_producto = $11
            RETURNING *
        `;
        const values = [
            sku, nombre, descripcion, id_categoria,
            precio_venta, precio_costo, stock_minimo, activo,
            id_unidad || null, unidad_medida || null,
            id
        ];

        const { rows } = await pool.query(query, values);
        return rows[0];
    }

    static async delete(id) {
        const query = 'UPDATE productos SET activo = false WHERE id_producto = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }

    static async getUnidades() {
        const query = 'SELECT * FROM unidades_medida WHERE activo = true ORDER BY id_unidad ASC';
        const { rows } = await pool.query(query);
        return rows;
    }

    static async createUnidad({ codigo, nombre, simbolo }) {
        const query = `
            INSERT INTO unidades_medida (codigo, nombre, simbolo)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const { rows } = await pool.query(query, [
            codigo.trim().toUpperCase(),
            nombre.trim(),
            simbolo.trim()
        ]);
        return rows[0];
    }

    static async deleteUnidad(id) {
        const resCheck = await pool.query('SELECT COUNT(*) FROM productos WHERE id_unidad = $1', [id]);
        if (parseInt(resCheck.rows[0].count) > 0) {
            const query = 'UPDATE unidades_medida SET activo = false WHERE id_unidad = $1 RETURNING *';
            const { rows } = await pool.query(query, [id]);
            return rows[0];
        }
        const query = 'DELETE FROM unidades_medida WHERE id_unidad = $1 RETURNING *';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    }
}

module.exports = ProductoModel;
