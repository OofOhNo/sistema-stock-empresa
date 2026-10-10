const pool = require('../config/db');

const Organizacion = {
    obtenerOrganizacion: async () => {
        try {
            // 1. Obtener sedes con datos del gerente de sitio y conteo de personal
            const sedesQuery = `
                SELECT 
                    u.id_ubicacion,
                    u.nombre AS nombre_sede,
                    u.tipo,
                    u.activo,
                    u.direccion_completa,
                    u.telefono_contacto,
                    u.id_gerente,
                    g.nombre_completo AS nombre_gerente,
                    g.email AS email_gerente,
                    COUNT(usr.id_usuario) FILTER (WHERE usr.activo = true)::int AS total_personal
                FROM ubicaciones u
                LEFT JOIN usuarios g ON u.id_gerente = g.id_usuario
                LEFT JOIN usuarios usr ON usr.id_ubicacion = u.id_ubicacion
                GROUP BY u.id_ubicacion, u.nombre, u.tipo, u.activo, u.direccion_completa, u.telefono_contacto, u.id_gerente, g.nombre_completo, g.email
                ORDER BY u.id_ubicacion ASC;
            `;
            const resSedes = await pool.query(sedesQuery);

            // 2. Obtener lista detallada de personal agrupado o para la vista
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
                    usr.activo
                FROM usuarios usr
                LEFT JOIN roles r ON usr.rol_id = r.id_rol
                WHERE usr.activo = true
                ORDER BY usr.nombre_completo ASC;
            `;
            const resPersonal = await pool.query(personalQuery);

            // Combinar personal dentro de cada sede
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
                    telefono_contacto = COALESCE($2, telefono_contacto),
                    direccion_completa = COALESCE($3, direccion_completa)
                WHERE id_ubicacion = $4
                RETURNING *;
            `;
            const res = await pool.query(query, [
                id_gerente ? Number(id_gerente) : null,
                telefono_contacto || null,
                direccion_completa || null,
                id_ubicacion
            ]);
            return res.rows[0];
        } catch (error) {
            throw error;
        }
    }
};

module.exports = Organizacion;

