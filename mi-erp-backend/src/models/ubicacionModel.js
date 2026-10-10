const pool = require('../config/db');

const UbicacionModel = {
    getAll: async () => {
        const query = `
            SELECT 
                u.id_ubicacion, 
                u.nombre, 
                u.id_division, 
                d.nombre AS nombre_division,
                COUNT(DISTINCT us.id_usuario) AS total_usuarios,
                COUNT(DISTINCT i.id_producto) AS total_productos
            FROM ubicaciones u
            LEFT JOIN divisiones d ON u.id_division = d.id_division
            LEFT JOIN usuarios us ON u.id_ubicacion = us.id_ubicacion
            LEFT JOIN inventario i ON u.id_ubicacion = i.id_ubicacion
            GROUP BY u.id_ubicacion, u.nombre, u.id_division, d.nombre
            ORDER BY u.id_ubicacion ASC;
        `;
        const { rows } = await pool.query(query);
        return rows;
    },

    getById: async (id) => {
        const query = `
            SELECT u.*, d.nombre AS nombre_division
            FROM ubicaciones u
            LEFT JOIN divisiones d ON u.id_division = d.id_division
            WHERE u.id_ubicacion = $1;
        `;
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    },

    create: async ({ nombre, id_division }) => {
        const query = `
            INSERT INTO ubicaciones (nombre, id_division)
            VALUES ($1, $2)
            RETURNING *;
        `;
        const { rows } = await pool.query(query, [nombre, id_division || 1]);
        return rows[0];
    },

    update: async (id, { nombre, id_division }) => {
        const query = `
            UPDATE ubicaciones
            SET nombre = COALESCE($1, nombre),
                id_division = COALESCE($2, id_division)
            WHERE id_ubicacion = $3
            RETURNING *;
        `;
        const { rows } = await pool.query(query, [nombre, id_division, id]);
        return rows[0];
    },

    delete: async (id) => {
        // Verificar si tiene dependencias críticas
        const check = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios WHERE id_ubicacion = $1) AS usuarios,
                (SELECT COUNT(*) FROM pedidos WHERE id_ubicacion = $1) AS pedidos,
                (SELECT COUNT(*) FROM inventario WHERE id_ubicacion = $1 AND cantidad_fisica > 0) AS inventario
        `, [id]);

        const counts = check.rows[0];
        if (counts.usuarios > 0 || counts.pedidos > 0 || counts.inventario > 0) {
            throw new Error(`No se puede eliminar la ubicación: tiene ${counts.usuarios} usuarios, ${counts.pedidos} pedidos o stock físico activo asociado.`);
        }

        const query = 'DELETE FROM ubicaciones WHERE id_ubicacion = $1 RETURNING *;';
        const { rows } = await pool.query(query, [id]);
        return rows[0];
    },

    getDivisiones: async () => {
        const query = 'SELECT * FROM divisiones ORDER BY id_division ASC;';
        const { rows } = await pool.query(query);
        return rows;
    }
};

module.exports = UbicacionModel;

