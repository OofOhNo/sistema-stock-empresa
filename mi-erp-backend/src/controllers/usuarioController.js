const Usuario = require('../models/usuarioModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const usuarioController = {

    listarUsuarios: async (req, res) => {
        try {
            const usuarios = await Usuario.obtenerTodos();
            res.status(200).json({
                exito: true,
                cantidad: usuarios.length,
                datos: usuarios
            });
        } catch (error) {
            console.error('Error en listarUsuarios:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Ocurrió un error al intentar obtener los usuarios',
                error: error.message
            });
        }
    },

    cambiarRol: async (req, res) => {
        const { id_usuario } = req.params;
        const { nuevo_rol } = req.body;
        const adminSolicitante = req.usuario;

        // Seguridad Etapa 3: Solo Admin Central puede cambiar roles
        if (adminSolicitante.nombre_rol !== 'Admin Central') {
            return res.status(403).json({ 
                exito: false, 
                mensaje: "Acceso denegado. Solo un Admin Central puede cambiar roles." 
            });
        }

        // Seguridad Etapa 3: Impedir que alguien se ascienda o modifique a sí mismo
        if (Number(id_usuario) === Number(adminSolicitante.id_usuario)) {
            return res.status(403).json({ 
                exito: false, 
                mensaje: "Por motivos de seguridad y separación de poderes, no puedes modificar tu propio rol o permisos." 
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const usuarioAnterior = await client.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id_usuario]);
            if (usuarioAnterior.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: "Usuario no encontrado." });
            }

            // Resolver rolId numérico si vino nombre
            let rolId = Number(nuevo_rol);
            if (isNaN(rolId)) {
                const r = await client.query('SELECT id_rol FROM roles WHERE LOWER(nombre) = LOWER($1)', [nuevo_rol]);
                if (r.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ exito: false, mensaje: "El rol especificado no existe." });
                }
                rolId = r.rows[0].id_rol;
            }

            const resUpdate = await client.query(
                "UPDATE usuarios SET rol_id = $1 WHERE id_usuario = $2 RETURNING *",
                [rolId, id_usuario]
            );

            await registrarAuditoria(
                client, 
                adminSolicitante.id_usuario, 
                'CAMBIAR_ROL_USUARIO', 
                'usuarios', 
                Number(id_usuario), 
                { rol_id: usuarioAnterior.rows[0].rol_id }, 
                { rol_id: rolId }
            );

            await client.query('COMMIT');
            
            res.status(200).json({ 
                exito: true, 
                mensaje: `Rol de usuario actualizado correctamente a ${nuevo_rol}.`,
                usuario: resUpdate.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Error al actualizar rol:", error);
            res.status(500).json({ exito: false, mensaje: "Error al modificar los permisos.", error: error.message });
        } finally {
            client.release();
        }
    },

    obtenerPermisos: async (req, res) => {
        try {
            const query = `
                SELECT 
                    rp.rol_id, 
                    r.nombre AS nombre_rol, 
                    p.id AS permiso_id,
                    p.modulo, 
                    rp.puede_ver, 
                    rp.puede_editar
                FROM roles_permisos rp
                JOIN roles r ON rp.rol_id = r.id_rol
                JOIN permisos p ON rp.permiso_id = p.id
                ORDER BY r.id_rol, p.modulo;
            `;
            const { rows } = await pool.query(query);
            res.json({ 
                exito: true, 
                datos: rows, 
                permisos: rows 
            });
        } catch (error) {
            console.error('Error obtenerPermisos:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener permisos' });
        }
    },

    actualizarPermisos: async (req, res) => {
        const { rol_id, modulo, puede_ver, puede_editar } = req.body;
        const adminSolicitante = req.usuario;

        if (adminSolicitante.nombre_rol !== 'Admin Central') {
            return res.status(403).json({ exito: false, mensaje: "Solo un Admin Central puede configurar la matriz de permisos." });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // UPSERT en la grilla usando (rol_id, modulo)
            const queryUpsert = `
                INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
                SELECT $1, p.id, COALESCE($2, false), COALESCE($3, false)
                FROM permisos p
                WHERE p.modulo = $4
                ON CONFLICT (rol_id, permiso_id)
                DO UPDATE SET 
                    puede_ver = CASE WHEN $2 IS NOT NULL THEN EXCLUDED.puede_ver ELSE roles_permisos.puede_ver END,
                    puede_editar = CASE WHEN $3 IS NOT NULL THEN EXCLUDED.puede_editar ELSE roles_permisos.puede_editar END;
            `;
            await client.query(queryUpsert, [rol_id, puede_ver, puede_editar, modulo]);

            await registrarAuditoria(
                client, 
                adminSolicitante.id_usuario, 
                'ACTUALIZAR_PERMISOS', 
                'roles_permisos', 
                rol_id, 
                null, 
                { rol_id, modulo, puede_ver, puede_editar }
            );

            await client.query('COMMIT');
            res.json({ exito: true, mensaje: 'Permisos actualizados correctamente en la base de datos.' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error actualizarPermisos:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al actualizar permisos', error: error.message });
        } finally {
            client.release();
        }
    },

    actualizarConfiguracion: async (req, res) => {
        const { id_usuario } = req.params;
        const { puede_ver_celulares, area } = req.body;
        const adminSolicitante = req.usuario;

        if (adminSolicitante.nombre_rol !== 'Admin Central') {
            return res.status(403).json({ 
                exito: false, 
                mensaje: "Acceso denegado. Solo un Admin Central puede modificar los permisos y área de un usuario." 
            });
        }

        try {
            const actualizado = await Usuario.actualizarConfiguracion(id_usuario, puede_ver_celulares, area);
            res.status(200).json({
                exito: true,
                mensaje: 'Configuración de usuario actualizada correctamente.',
                usuario: actualizado
            });
        } catch (error) {
            console.error('Error al actualizar configuración de usuario:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al actualizar usuario', error: error.message });
        }
    }

};

module.exports = usuarioController;
