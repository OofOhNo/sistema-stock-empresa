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
                    u.creado_en,
                    (SELECT COUNT(*) FROM permisos_celulares_clientes pcc WHERE pcc.id_usuario = u.id_usuario)::int AS total_clientes_autorizados
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                WHERE COALESCE(u.activo, true) = true
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
                    COALESCE(r.puede_ver_otras_ubicaciones, false) AS puede_ver_otras_ubicaciones,
                    ub.nombre AS nombre_ubicacion
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1)) AND COALESCE(u.activo, true) = true;
            `;
            const resultado = await pool.query(query, [email]);
            return resultado.rows[0]; 
        } catch (error) {
            throw error;
        }
    },

    obtenerRoles: async () => {
        try {
            const query = `
                SELECT 
                    r.id_rol, 
                    r.nombre, 
                    r.descripcion, 
                    COALESCE(r.puede_ver_otras_ubicaciones, false) AS puede_ver_otras_ubicaciones,
                    r.creado_en,
                    COUNT(u.id_usuario)::int AS total_usuarios
                FROM roles r
                LEFT JOIN usuarios u ON u.rol_id = r.id_rol AND u.activo = true
                GROUP BY r.id_rol, r.nombre, r.descripcion, r.puede_ver_otras_ubicaciones, r.creado_en
                ORDER BY r.id_rol ASC;
            `;
            const res = await pool.query(query);
            return res.rows;
        } catch (error) {
            throw error;
        }
    },

    actualizarPermisoOtrasUbicaciones: async (rol_id, puede_ver_otras_ubicaciones) => {
        try {
            const res = await pool.query(
                'UPDATE roles SET puede_ver_otras_ubicaciones = $1 WHERE id_rol = $2 RETURNING *',
                [Boolean(puede_ver_otras_ubicaciones), rol_id]
            );
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    crearRol: async (nombre, descripcion) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const insertRol = await client.query(
                `INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING *`,
                [nombre, descripcion || null]
            );
            const nuevoRol = insertRol.rows[0];

            // Inicializar roles_permisos para todos los permisos existentes (por defecto en false)
            await client.query(`
                INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
                SELECT $1, p.id, false, false
                FROM permisos p
                ON CONFLICT (rol_id, permiso_id) DO NOTHING;
            `, [nuevoRol.id_rol]);

            await client.query('COMMIT');
            return nuevoRol;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    crearUsuario: async ({ nombre_completo, email, password_hash, rol_id, id_ubicacion, area, puede_ver_celulares }) => {
        try {
            const query = `
                INSERT INTO usuarios (
                    nombre_completo, email, password_hash, rol_id, id_ubicacion, 
                    area, puede_ver_celulares, activo
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, true)
                RETURNING id_usuario, nombre_completo, email, rol_id, id_ubicacion, area, puede_ver_celulares, activo, creado_en;
            `;
            const res = await pool.query(query, [
                nombre_completo,
                email,
                password_hash,
                rol_id,
                id_ubicacion,
                area || 'ADMINISTRACION',
                puede_ver_celulares === true
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    eliminarUsuario: async (id_usuario) => {
        try {
            // Eliminar referencias secundarias de permisos
            await pool.query('DELETE FROM permisos_celulares_clientes WHERE id_usuario = $1', [id_usuario]);

            // Intentar eliminación física
            try {
                const resDelete = await pool.query('DELETE FROM usuarios WHERE id_usuario = $1 RETURNING *', [id_usuario]);
                if (resDelete.rows.length > 0) {
                    return { eliminado: true, softDelete: false, usuario: resDelete.rows[0] };
                }
            } catch (fkError) {
                // Si existe historial relacionado con clave foránea (pedidos, facturas, kardex, etc.)
                // aplicamos borrado lógico (soft-delete) y liberamos el email para reuso futuro
                const timestamp = Date.now();
                const resSoft = await pool.query(`
                    UPDATE usuarios 
                    SET activo = false, 
                        email = email || '.desactivado.' || $2
                    WHERE id_usuario = $1 
                    RETURNING *
                `, [id_usuario, timestamp]);
                
                if (resSoft.rows.length > 0) {
                    return { eliminado: true, softDelete: true, usuario: resSoft.rows[0] };
                }
            }

            return { eliminado: false };
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Usuario;
