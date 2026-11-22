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
                    COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END) AS nivel_jerarquia,
                    u.puede_ver_celulares,
                    u.area,
                    u.telefono_whatsapp,
                    COALESCE(u.seccion_facturacion, 'AMBAS') AS seccion_facturacion,
                    COALESCE(u.activo, true) AS activo,
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

            const query = `
                UPDATE usuarios
                SET rol_id = $1
                WHERE id_usuario = $2
                RETURNING id_usuario, nombre_completo, email, rol_id, id_ubicacion, area, puede_ver_celulares, seccion_facturacion, telefono_whatsapp, activo, creado_en;
            `;
            const res = await pool.query(query, [rolId, id_usuario]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    actualizarConfiguracion: async (
        id_usuario,
        puede_ver_celulares = null,
        area = null,
        seccion_facturacion = null,
        telefono_whatsapp = undefined,
        id_ubicacion = null
    ) => {
        try {
            const actualizaTel = telefono_whatsapp !== undefined;
            const telValor = actualizaTel ? (String(telefono_whatsapp || '').trim() || null) : null;
            const query = `
                UPDATE usuarios u
                SET 
                    puede_ver_celulares = COALESCE($1, u.puede_ver_celulares),
                    area = COALESCE($2, u.area),
                    seccion_facturacion = COALESCE($3, u.seccion_facturacion),
                    telefono_whatsapp = CASE WHEN $4::boolean THEN $5::varchar ELSE u.telefono_whatsapp END,
                    id_ubicacion = COALESCE($6::int, u.id_ubicacion)
                WHERE u.id_usuario = $7::int
                RETURNING u.id_usuario, u.nombre_completo, u.email, u.rol_id, u.id_ubicacion, u.area, u.puede_ver_celulares, u.seccion_facturacion, u.telefono_whatsapp,
                          (SELECT nombre FROM ubicaciones WHERE id_ubicacion = u.id_ubicacion) AS nombre_ubicacion;
            `;
            const res = await pool.query(query, [
                puede_ver_celulares === undefined ? null : puede_ver_celulares,
                area === undefined ? null : area,
                seccion_facturacion === undefined ? null : seccion_facturacion,
                actualizaTel,
                telValor,
                id_ubicacion ? Number(id_ubicacion) : null,
                id_usuario
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    buscarPorId: async (id_usuario) => {
        try {
            const query = `
                SELECT 
                    u.*, 
                    r.nombre AS nombre_rol,
                    COALESCE(r.puede_ver_otras_ubicaciones, false) AS puede_ver_otras_ubicaciones,
                    r.duracion_sesion_minutos,
                    COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END) AS nivel_jerarquia,
                    ub.nombre AS nombre_ubicacion
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                WHERE u.id_usuario = $1 AND COALESCE(u.activo, true) = true;
            `;
            const resultado = await pool.query(query, [id_usuario]);
            return resultado.rows[0];
        } catch (error) {
            throw error;
        }
    },

    buscarPorIdentificador: async (identificador) => {
        if (!identificador || !String(identificador).trim()) return null;
        const limpio = String(identificador).trim();

        // 1. Coincidencia exacta por correo
        const porEmail = await pool.query(`
            SELECT u.id_usuario, u.nombre_completo, u.email, r.nombre AS nombre_rol, ub.nombre AS nombre_ubicacion
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
            WHERE LOWER(TRIM(u.email)) = LOWER($1) AND COALESCE(u.activo, true) = true
            LIMIT 1;
        `, [limpio]);
        if (porEmail.rows.length > 0) return porEmail.rows[0];

        // 2. Coincidencia exacta por nombre completo
        const porNombreExacto = await pool.query(`
            SELECT u.id_usuario, u.nombre_completo, u.email, r.nombre AS nombre_rol, ub.nombre AS nombre_ubicacion
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
            WHERE LOWER(TRIM(u.nombre_completo)) = LOWER($1) AND COALESCE(u.activo, true) = true;
        `, [limpio]);
        if (porNombreExacto.rows.length === 1) return porNombreExacto.rows[0];

        // 3. Coincidencia parcial única por nombre
        if (limpio.length >= 3) {
            const porNombreParcial = await pool.query(`
                SELECT u.id_usuario, u.nombre_completo, u.email, r.nombre AS nombre_rol, ub.nombre AS nombre_ubicacion
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                WHERE u.nombre_completo ILIKE '%' || $1 || '%' AND COALESCE(u.activo, true) = true
                LIMIT 2;
            `, [limpio]);
            if (porNombreParcial.rows.length === 1) return porNombreParcial.rows[0];
        }

        return null;
    },

    buscarPorEmail: async (email) => {
        try {
            const query = `
                SELECT 
                    u.*, 
                    r.nombre AS nombre_rol,
                    COALESCE(r.puede_ver_otras_ubicaciones, false) AS puede_ver_otras_ubicaciones,
                    r.duracion_sesion_minutos,
                    COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END) AS nivel_jerarquia,
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
                    r.duracion_sesion_minutos,
                    COALESCE(r.nivel_jerarquia, CASE WHEN r.nombre = 'Admin Central' THEN 1 ELSE 4 END) AS nivel_jerarquia,
                    r.creado_en,
                    COUNT(u.id_usuario)::int AS total_usuarios
                FROM roles r
                LEFT JOIN usuarios u ON u.rol_id = r.id_rol AND COALESCE(u.activo, true) = true
                GROUP BY r.id_rol, r.nombre, r.descripcion, r.puede_ver_otras_ubicaciones, r.duracion_sesion_minutos, r.nivel_jerarquia, r.creado_en
                ORDER BY COALESCE(r.nivel_jerarquia, 4) ASC, r.id_rol ASC;
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

    actualizarDuracionSesion: async (rol_id, duracion_sesion_minutos) => {
        try {
            const valor = duracion_sesion_minutos && Number(duracion_sesion_minutos) > 0
                ? parseInt(duracion_sesion_minutos, 10)
                : null;
            const res = await pool.query(
                'UPDATE roles SET duracion_sesion_minutos = $1::int WHERE id_rol = $2::int RETURNING *',
                [valor, rol_id]
            );
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    actualizarNivelJerarquia: async (rol_id, nivel_jerarquia) => {
        try {
            const valor = parseInt(nivel_jerarquia, 10);
            const res = await pool.query(
                'UPDATE roles SET nivel_jerarquia = $1::int WHERE id_rol = $2::int RETURNING *',
                [valor, rol_id]
            );
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    crearRol: async (nombre, descripcion, duracion_sesion_minutos = null, nivel_jerarquia = 4) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const duracion = duracion_sesion_minutos && Number(duracion_sesion_minutos) > 0
                ? parseInt(duracion_sesion_minutos, 10)
                : null;
            const nivel = Number(nivel_jerarquia) >= 1 && Number(nivel_jerarquia) <= 10
                ? parseInt(nivel_jerarquia, 10)
                : 4;
            const insertRol = await client.query(
                `INSERT INTO roles (nombre, descripcion, duracion_sesion_minutos, nivel_jerarquia) VALUES ($1, $2, $3, $4) RETURNING *`,
                [nombre, descripcion || null, duracion, nivel]
            );
            const nuevoRol = insertRol.rows[0];

            // Inicializar roles_permisos para todos los permisos existentes (mensajes activo por defecto)
            await client.query(`
                INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
                SELECT $1, p.id, (p.modulo = 'mensajes'), (p.modulo = 'mensajes')
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

    crearUsuario: async ({ nombre_completo, email, password_hash, rol_id, id_ubicacion, area, puede_ver_celulares, seccion_facturacion = 'AMBAS', telefono_whatsapp = null }) => {
        try {
            const telLimpio = telefono_whatsapp ? String(telefono_whatsapp).trim() : null;
            const query = `
                INSERT INTO usuarios (
                    nombre_completo, email, password_hash, rol_id, id_ubicacion, 
                    area, puede_ver_celulares, seccion_facturacion, telefono_whatsapp, activo
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
                RETURNING id_usuario, nombre_completo, email, rol_id, id_ubicacion, area, puede_ver_celulares, seccion_facturacion, telefono_whatsapp, activo, creado_en;
            `;
            const res = await pool.query(query, [
                nombre_completo,
                email,
                password_hash,
                rol_id,
                id_ubicacion,
                area || 'ADMINISTRACION',
                puede_ver_celulares === true,
                ['AMBAS', 'PEDIDOS', 'MANUAL'].includes(String(seccion_facturacion).toUpperCase()) ? String(seccion_facturacion).toUpperCase() : 'AMBAS',
                telLimpio || null
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    },

    eliminarUsuario: async (id_usuario) => {
        try {
            await pool.query('DELETE FROM permisos_celulares_clientes WHERE id_usuario = $1', [id_usuario]);
            await pool.query('DELETE FROM solicitudes_recuperacion_password WHERE id_usuario = $1', [id_usuario]).catch(() => {});

            try {
                const resDelete = await pool.query(`
                    DELETE FROM usuarios
                    WHERE id_usuario = $1
                    RETURNING id_usuario, nombre_completo, email, rol_id, id_ubicacion, area, puede_ver_celulares, seccion_facturacion, telefono_whatsapp, activo, creado_en;
                `, [id_usuario]);
                if (resDelete.rows.length > 0) {
                    return { eliminado: true, softDelete: false, usuario: resDelete.rows[0] };
                }
            } catch (fkError) {
                const timestamp = Date.now();
                const resSoft = await pool.query(`
                    UPDATE usuarios 
                    SET activo = false, 
                        email = email || '.desactivado.' || $2
                    WHERE id_usuario = $1 
                    RETURNING id_usuario, nombre_completo, email, rol_id, id_ubicacion, area, puede_ver_celulares, seccion_facturacion, telefono_whatsapp, activo, creado_en;
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
