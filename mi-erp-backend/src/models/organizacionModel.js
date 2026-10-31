const pool = require('../config/db');

const Organizacion = {
    obtenerOrganizacion: async () => {
        try {
            const sedesQuery = `
                SELECT 
                    u.id_ubicacion,
                    u.nombre AS nombre_sede,
                    COALESCE(d.nombre, 'Sede Operativa') AS tipo,
                    true AS activo,
                    u.direccion_completa,
                    u.telefono_contacto,
                    u.id_gerente,
                    g.nombre_completo AS nombre_gerente,
                    g.email AS email_gerente,
                    COUNT(usr.id_usuario) FILTER (WHERE COALESCE(usr.activo, true) = true)::int AS total_personal
                FROM ubicaciones u
                LEFT JOIN divisiones d ON u.id_division = d.id_division
                LEFT JOIN usuarios g ON u.id_gerente = g.id_usuario
                LEFT JOIN usuarios usr ON usr.id_ubicacion = u.id_ubicacion
                GROUP BY u.id_ubicacion, u.nombre, d.nombre, u.direccion_completa, u.telefono_contacto, u.id_gerente, g.nombre_completo, g.email
                ORDER BY u.id_ubicacion ASC;
            `;
            const resSedes = await pool.query(sedesQuery);

            const personalQuery = `
                SELECT 
                    usr.id_usuario,
                    usr.nombre_completo,
                    usr.email,
                    usr.id_ubicacion,
                    usr.rol_id,
                    r.nombre AS nombre_rol,
                    usr.area,
                    usr.puede_ver_celulares,
                    COALESCE(usr.activo, true) AS activo
                FROM usuarios usr
                LEFT JOIN roles r ON usr.rol_id = r.id_rol
                WHERE COALESCE(usr.activo, true) = true
                ORDER BY usr.nombre_completo ASC;
            `;
            const resPersonal = await pool.query(personalQuery);

            const sedesConPersonal = resSedes.rows.map(sede => ({
                ...sede,
                personal: resPersonal.rows.filter(p => p.id_ubicacion === sede.id_ubicacion)
            }));

            return {
                sedes: sedesConPersonal,
                todosUsuarios: resPersonal.rows
            };
        } catch (error) {
            throw error;
        }
    },

    actualizarGerenteSede: async (id_ubicacion, { id_gerente, telefono_contacto, direccion_completa }) => {
        try {
            const query = `
                UPDATE ubicaciones
                SET 
                    id_gerente = $1,
                    telefono_contacto = $2,
                    direccion_completa = $3
                WHERE id_ubicacion = $4
                RETURNING *;
            `;
            const res = await pool.query(query, [
                id_gerente ? Number(id_gerente) : null,
                telefono_contacto !== undefined ? (telefono_contacto || null) : null,
                direccion_completa !== undefined ? (direccion_completa || null) : null,
                id_ubicacion
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    }
};

module.exports = Organizacion;
