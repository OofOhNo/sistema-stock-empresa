const pool = require('../config/db');

const UbicacionModel = {
    getAll: async () => {
        const query = `
            SELECT 
                u.id_ubicacion, 
                u.nombre, 
                u.id_division, 
                d.nombre AS nombre_division,
                COUNT(DISTINCT us.id_usuario) FILTER (WHERE COALESCE(us.activo, true) = true) AS total_usuarios,
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

    getById: async (id, db = pool) => {
        const query = `
            SELECT u.*, d.nombre AS nombre_division
            FROM ubicaciones u
            LEFT JOIN divisiones d ON u.id_division = d.id_division
            WHERE u.id_ubicacion = $1;
        `;
        const { rows } = await db.query(query, [id]);
        return rows[0];
    },

    create: async ({ nombre, id_division }, db = pool) => {
        const query = `
            INSERT INTO ubicaciones (nombre, id_division)
            VALUES ($1, $2)
            RETURNING *;
        `;
        const { rows } = await db.query(query, [nombre, id_division || 1]);
        return rows[0];
    },

    update: async (id, { nombre, id_division }, db = pool) => {
        const query = `
            UPDATE ubicaciones
            SET nombre = COALESCE($1, nombre),
                id_division = COALESCE($2, id_division)
            WHERE id_ubicacion = $3
            RETURNING *;
        `;
        const { rows } = await db.query(query, [nombre, id_division, id]);
        return rows[0];
    },

    delete: async (id, db = pool) => {
        // Verificar si tiene dependencias críticas
        const check = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios WHERE id_ubicacion = $1) AS usuarios,
                (SELECT COUNT(*) FROM pedidos WHERE id_ubicacion = $1) AS pedidos,
                (SELECT COUNT(*) FROM inventario WHERE id_ubicacion = $1 AND cantidad_fisica > 0) AS inventario
        `, [id]);

        const counts = check.rows[0];
        if (Number(counts.usuarios) > 0 || Number(counts.pedidos) > 0 || Number(counts.inventario) > 0) {
            throw new Error(`No se puede eliminar la ubicación: tiene ${counts.usuarios} usuarios, ${counts.pedidos} pedidos o stock físico activo asociado.`);
        }

        const query = 'DELETE FROM ubicaciones WHERE id_ubicacion = $1 RETURNING *;';
        const { rows } = await db.query(query, [id]);
        return rows[0];
    },

    getDivisiones: async () => {
        const query = `
            SELECT
                d.id_division,
                d.nombre,
                COUNT(u.id_ubicacion)::int AS total_ubicaciones
            FROM divisiones d
            LEFT JOIN ubicaciones u ON u.id_division = d.id_division
            GROUP BY d.id_division, d.nombre
            ORDER BY d.id_division ASC;
        `;
        const { rows } = await pool.query(query);
        return rows;
    },

    getDivisionById: async (id, db = pool) => {
        const { rows } = await db.query('SELECT * FROM divisiones WHERE id_division = $1::int', [id]);
        return rows[0] || null;
    },

    createDivision: async ({ nombre }, db = pool) => {
        const limpio = String(nombre || '').trim();
        const dup = await db.query('SELECT id_division FROM divisiones WHERE LOWER(TRIM(nombre)) = LOWER($1)', [limpio]);
        if (dup.rows.length > 0) {
            throw new Error(`Ya existe un área / división llamada "${limpio}".`);
        }
        const { rows } = await db.query(
            'INSERT INTO divisiones (nombre) VALUES ($1) RETURNING *, 0::int AS total_ubicaciones;',
            [limpio]
        );
        return rows[0];
    },

    updateDivision: async (id, { nombre }, db = pool) => {
        const limpio = String(nombre || '').trim();
        const dup = await db.query(
            'SELECT id_division FROM divisiones WHERE LOWER(TRIM(nombre)) = LOWER($1) AND id_division <> $2::int',
            [limpio, id]
        );
        if (dup.rows.length > 0) {
            throw new Error(`Ya existe otra área / división llamada "${limpio}".`);
        }
        const { rows } = await db.query(
            'UPDATE divisiones SET nombre = $1 WHERE id_division = $2::int RETURNING *;',
            [limpio, id]
        );
        return rows[0] || null;
    },

    deleteDivision: async (id, db = pool) => {
        const countRes = await db.query(`
            SELECT
                (SELECT COUNT(*)::int FROM divisiones) AS total_divisiones,
                (SELECT COUNT(*)::int FROM ubicaciones WHERE id_division = $1::int) AS ubicaciones_asociadas
        `, [id]);
        const { total_divisiones, ubicaciones_asociadas } = countRes.rows[0];
        if (ubicaciones_asociadas > 0) {
            throw new Error(`No se puede eliminar esta área / división porque tiene ${ubicaciones_asociadas} sede(s) asignada(s). Cámbialas a otra área primero.`);
        }
        if (total_divisiones <= 1) {
            throw new Error('Debe existir al menos un área / división registrada en el sistema.');
        }
        const { rows } = await db.query('DELETE FROM divisiones WHERE id_division = $1::int RETURNING *;', [id]);
        return rows[0] || null;
    }
};

module.exports = UbicacionModel;

