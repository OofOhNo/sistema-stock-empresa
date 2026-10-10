const pool = require('../config/db');

const Usuario = {
    
    // Obtener todos los usuarios con su rol y ubicación
    obtenerTodos: async () => {
        try {
            const query = `
                SELECT 
                    u.id_usuario, 
                    u.nombre_completo, 
                    u.email, 
                    u.id_ubicacion,
                    ub.nombre AS nombre_ubicacion,
                    u.rol_id,
                    r.nombre AS nombre_rol,
                    u.puede_ver_celulares,
                    u.area,
                    u.activo,
                    u.creado_en
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                ORDER BY u.id_usuario ASC;
            `;
            const resultado = await pool.query(query);
            return resultado.rows; 
        } catch (error) {
            throw error;
        }
    },

    cambiarRol: async (id_usuario, nuevo_rol) => {
        try {
            let rolId = Number(nuevo_rol);
            if (isNaN(rolId)) {
                const resRol = await pool.query('SELECT id_rol FROM roles WHERE LOWER(nombre) = LOWER($1)', [nuevo_rol]);
                if (resRol.rows.length === 0) throw new Error('El rol especificado no existe.');
                rolId = resRol.rows[0].id_rol;
            } else {
                const resCheck = await pool.query('SELECT id_rol FROM roles WHERE id_rol = $1', [rolId]);
                if (resCheck.rows.length === 0) throw new Error('El ID de rol no existe.');
            }

            const query = "UPDATE usuarios SET rol_id = $1 WHERE id_usuario = $2 RETURNING *";
            const res = await pool.query(query, [rolId, id_usuario]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    actualizarConfiguracion: async (id_usuario, puede_ver_celulares, area) => {
        try {
            const query = `
                UPDATE usuarios 
                SET 
                    puede_ver_celulares = COALESCE($1, puede_ver_celulares),
                    area = COALESCE($2, area)
                WHERE id_usuario = $3 
                RETURNING *;
            `;
            const res = await pool.query(query, [puede_ver_celulares, area, id_usuario]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    buscarPorEmail: async (email) => {
        try {
            const query = `
                SELECT 
                    u.*, 
                    r.nombre AS nombre_rol,
                    ub.nombre AS nombre_ubicacion
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                WHERE u.email = $1;
            `;
            const resultado = await pool.query(query, [email]);
            return resultado.rows[0]; 
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Usuario;
