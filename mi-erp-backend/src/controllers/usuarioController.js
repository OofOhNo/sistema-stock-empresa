const Usuario = require('../models/usuarioModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const bcrypt = require('bcryptjs');

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
    },

    listarRoles: async (req, res) => {
        try {
            const roles = await Usuario.obtenerRoles();
            res.status(200).json({
                exito: true,
                datos: roles
            });
        } catch (error) {
            console.error('Error al listar roles:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al listar roles', error: error.message });
        }
    },

    crearRol: async (req, res) => {
        const { nombre, descripcion } = req.body;
        const usuarioSolicitante = req.usuario;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ exito: false, mensaje: 'El nombre del rol es obligatorio.' });
        }

        try {
            // Verificar si el rol ya existe
            const rolExistente = await pool.query('SELECT id_rol FROM roles WHERE LOWER(nombre) = LOWER($1)', [nombre.trim()]);
            if (rolExistente.rows.length > 0) {
                return res.status(400).json({ exito: false, mensaje: 'Ya existe un rol con ese nombre.' });
            }

            const nuevoRol = await Usuario.crearRol(nombre.trim(), descripcion);

            await registrarAuditoria(
                pool,
                usuarioSolicitante.id_usuario,
                'CREAR_ROL',
                'roles',
                nuevoRol.id_rol,
                null,
                nuevoRol
            );

            res.status(201).json({
                exito: true,
                mensaje: `Rol "${nuevoRol.nombre}" creado exitosamente y registrado en la matriz de permisos.`,
                rol: nuevoRol
            });
        } catch (error) {
            console.error('Error al crear rol:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al crear el rol', error: error.message });
        }
    },

    crearUsuario: async (req, res) => {
        const { nombre_completo, email, password, rol_id, id_ubicacion, area, puede_ver_celulares } = req.body;
        const usuarioSolicitante = req.usuario;

        if (!nombre_completo || !email || !password || !rol_id || !id_ubicacion) {
            return res.status(400).json({ 
                exito: false, 
                mensaje: 'Todos los campos son obligatorios: Nombre completo, Email, Contraseña, Rol y Sede/Ubicación.' 
            });
        }

        try {
            // Verificar si email ya existe
            const emailExistente = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = LOWER($1)', [email.trim()]);
            if (emailExistente.rows.length > 0) {
                return res.status(400).json({ exito: false, mensaje: 'El correo electrónico ya está registrado en el sistema.' });
            }

            // Verificar si rol existe
            const rolCheck = await pool.query('SELECT id_rol FROM roles WHERE id_rol = $1', [rol_id]);
            if (rolCheck.rows.length === 0) {
                return res.status(400).json({ exito: false, mensaje: 'El rol seleccionado no es válido.' });
            }

            // Verificar si ubicacion existe
            const ubCheck = await pool.query('SELECT id_ubicacion FROM ubicaciones WHERE id_ubicacion = $1', [id_ubicacion]);
            if (ubCheck.rows.length === 0) {
                return res.status(400).json({ exito: false, mensaje: 'La sede/ubicación seleccionada no es válida.' });
            }

            // Encriptar contraseña
            const password_hash = await bcrypt.hash(password, 10);

            const nuevoUsuario = await Usuario.crearUsuario({
                nombre_completo: nombre_completo.trim(),
                email: email.trim().toLowerCase(),
                password_hash,
                rol_id: Number(rol_id),
                id_ubicacion: Number(id_ubicacion),
                area: area || 'ADMINISTRACION',
                puede_ver_celulares: puede_ver_celulares === true
            });

            await registrarAuditoria(
                pool,
                usuarioSolicitante.id_usuario,
                'CREAR_USUARIO',
                'usuarios',
                nuevoUsuario.id_usuario,
                null,
                { nombre_completo: nuevoUsuario.nombre_completo, email: nuevoUsuario.email, rol_id, id_ubicacion }
            );

            res.status(201).json({
                exito: true,
                mensaje: `Usuario ${nuevoUsuario.nombre_completo} creado con éxito.`,
                usuario: nuevoUsuario
            });
        } catch (error) {
            console.error('Error al crear usuario:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al crear usuario', error: error.message });
        }
    },

    actualizarPermisoUbicacionesRol: async (req, res) => {
        const { id_rol } = req.params;
        const { puede_ver_otras_ubicaciones } = req.body;
        const adminSolicitante = req.usuario;

        if (adminSolicitante.nombre_rol !== 'Admin Central') {
            return res.status(403).json({ 
                exito: false, 
                mensaje: "Acceso denegado. Solo un Admin Central puede configurar los permisos de acceso entre ubicaciones." 
            });
        }

        try {
            const rolActualizado = await Usuario.actualizarPermisoOtrasUbicaciones(id_rol, puede_ver_otras_ubicaciones);
            await registrarAuditoria(
                pool,
                adminSolicitante.id_usuario,
                'ACTUALIZAR_PERMISO_UBICACIONES_ROL',
                'roles',
                Number(id_rol),
                null,
                { puede_ver_otras_ubicaciones }
            );

            res.status(200).json({
                exito: true,
                mensaje: `Permiso de sedes para el rol "${rolActualizado.nombre}" actualizado correctamente.`,
                rol: rolActualizado
            });
        } catch (error) {
            console.error('Error al actualizar permiso de sedes de rol:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al actualizar permiso de rol', error: error.message });
        }
    },

    eliminarUsuario: async (req, res) => {
        const { id_usuario } = req.params;
        const solicitante = req.usuario;

        const esAdminCentral = solicitante.nombre_rol === 'Admin Central' || solicitante.rol === 'Admin Central';
        if (!esAdminCentral) {
            return res.status(403).json({
                exito: false,
                mensaje: 'Acceso denegado. Solo un Admin Central puede eliminar empleados del sistema.'
            });
        }

        if (Number(id_usuario) === Number(solicitante.id_usuario)) {
            return res.status(400).json({
                exito: false,
                mensaje: 'No puedes eliminar tu propia cuenta de Admin Central.'
            });
        }

        try {
            const resultado = await Usuario.eliminarUsuario(id_usuario);
            if (!resultado.eliminado) {
                return res.status(404).json({ exito: false, mensaje: 'Empleado no encontrado.' });
            }

            await registrarAuditoria(
                pool,
                solicitante.id_usuario,
                'ELIMINAR_USUARIO',
                'usuarios',
                Number(id_usuario),
                null,
                { 
                    nombre: resultado.usuario?.nombre_completo, 
                    email: resultado.usuario?.email, 
                    softDelete: resultado.softDelete 
                }
            );

            res.status(200).json({
                exito: true,
                mensaje: `Empleado "${resultado.usuario?.nombre_completo || ''}" eliminado exitosamente.`,
                datos: resultado
            });
        } catch (error) {
            console.error('Error al eliminar usuario:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al eliminar usuario', error: error.message });
        }
    }

};

module.exports = usuarioController;
