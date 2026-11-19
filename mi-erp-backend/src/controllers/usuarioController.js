const Usuario = require('../models/usuarioModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const { invalidarCacheSesionTodos, invalidarCacheSesionUsuario } = require('../middlewares/authMiddleware');
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
        const esAdminCentral = adminSolicitante.nombre_rol === 'Admin Central';

        // Impedir que alguien modifique su propio rol
        if (Number(id_usuario) === Number(adminSolicitante.id_usuario)) {
            return res.status(403).json({ 
                exito: false, 
                mensaje: 'Por seguridad, no puedes cambiar tu propio rol.' 
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const usuarioAnterior = await client.query(`
                SELECT u.*, r.nombre AS nombre_rol_actual
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                WHERE u.id_usuario = $1
            `, [id_usuario]);
            if (usuarioAnterior.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado.' });
            }

            if (!esAdminCentral && usuarioAnterior.rows[0].nombre_rol_actual === 'Admin Central') {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Solo un Admin Central puede modificar a otro Admin Central.'
                });
            }

            let rolId = Number(nuevo_rol);
            let nombreRolDestino = '';
            if (isNaN(rolId)) {
                const r = await client.query('SELECT id_rol, nombre FROM roles WHERE LOWER(nombre) = LOWER($1)', [nuevo_rol]);
                if (r.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ exito: false, mensaje: 'El rol seleccionado no existe.' });
                }
                rolId = r.rows[0].id_rol;
                nombreRolDestino = r.rows[0].nombre;
            } else {
                const r = await client.query('SELECT id_rol, nombre FROM roles WHERE id_rol = $1', [rolId]);
                if (r.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ exito: false, mensaje: 'El rol seleccionado no existe.' });
                }
                nombreRolDestino = r.rows[0].nombre;
            }

            if (!esAdminCentral && nombreRolDestino === 'Admin Central') {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Solo un Admin Central puede asignar el rol de Admin Central.'
                });
            }

            const resUpdate = await client.query(
                'UPDATE usuarios SET rol_id = $1 WHERE id_usuario = $2 RETURNING id_usuario, nombre_completo, email, rol_id, id_ubicacion, area',
                [rolId, id_usuario]
            );

            await registrarAuditoria(
                client, 
                adminSolicitante.id_usuario, 
                'CAMBIAR_ROL_USUARIO', 
                'usuarios', 
                Number(id_usuario), 
                { rol_id: usuarioAnterior.rows[0].rol_id, rol: usuarioAnterior.rows[0].nombre_rol_actual }, 
                { rol_id: rolId, rol: nombreRolDestino }
            );

            await client.query('COMMIT');
            
            res.status(200).json({ 
                exito: true, 
                mensaje: `Rol actualizado correctamente a "${nombreRolDestino}".`,
                usuario: resUpdate.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al actualizar rol:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al cambiar el rol.', error: error.message });
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

        // Proteger el rol Admin Central para que nunca quede bloqueado
        if (Number(rol_id) === 1) {
            return res.status(400).json({
                exito: false,
                mensaje: 'El rol Admin Central siempre tiene acceso completo por seguridad.'
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resRolObj = await client.query('SELECT id_rol, nombre FROM roles WHERE id_rol = $1::int', [rol_id]);
            if (resRolObj.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado.' });
            }
            const nombreRolObjetivo = resRolObj.rows[0].nombre;
            if (nombreRolObjetivo === 'Admin Central') {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    exito: false,
                    mensaje: 'El rol Admin Central siempre tiene acceso completo por seguridad.'
                });
            }

            // Evitar que un usuario se quite a su propio rol el acceso a Personal y Roles (auto-bloqueo)
            const esPropioRol = nombreRolObjetivo === adminSolicitante.nombre_rol;
            const esModuloUsuarios = String(modulo || '').toLowerCase() === 'usuarios';
            if (esPropioRol && esModuloUsuarios && (puede_ver === false || puede_editar === false)) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    exito: false,
                    mensaje: 'No puedes quitarte a tu propio rol el permiso de Personal y Roles porque quedarías sin acceso a esta pantalla.'
                });
            }

            const queryUpsert = `
                INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
                SELECT $1::int, p.id, COALESCE($2::boolean, false), COALESCE($3::boolean, false)
                FROM permisos p
                WHERE p.modulo = $4::varchar
                ON CONFLICT (rol_id, permiso_id)
                DO UPDATE SET 
                    puede_ver = CASE WHEN $2::boolean IS NOT NULL THEN EXCLUDED.puede_ver ELSE roles_permisos.puede_ver END,
                    puede_editar = CASE WHEN $3::boolean IS NOT NULL THEN EXCLUDED.puede_editar ELSE roles_permisos.puede_editar END;
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
            res.json({ exito: true, mensaje: 'Permisos guardados correctamente.' });
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
        const { puede_ver_celulares, area, seccion_facturacion, telefono_whatsapp } = req.body;

        try {
            const actualizado = await Usuario.actualizarConfiguracion(
                id_usuario,
                puede_ver_celulares,
                area,
                seccion_facturacion,
                telefono_whatsapp
            );
            res.status(200).json({
                exito: true,
                mensaje: 'Configuración de empleado actualizada correctamente.',
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
        const { nombre, descripcion, duracion_sesion_minutos } = req.body;
        const usuarioSolicitante = req.usuario;

        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ exito: false, mensaje: 'El nombre del rol es obligatorio.' });
        }

        try {
            const rolExistente = await pool.query('SELECT id_rol FROM roles WHERE LOWER(nombre) = LOWER($1)', [nombre.trim()]);
            if (rolExistente.rows.length > 0) {
                return res.status(400).json({ exito: false, mensaje: 'Ya existe un rol con ese nombre.' });
            }

            const nuevoRol = await Usuario.crearRol(nombre.trim(), descripcion, duracion_sesion_minutos);

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
                mensaje: `Rol "${nuevoRol.nombre}" creado con éxito. Ahora puedes activar qué pestañas puede ver en la pestaña de Permisos.`,
                rol: nuevoRol
            });
        } catch (error) {
            console.error('Error al crear rol:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al crear el rol', error: error.message });
        }
    },

    crearUsuario: async (req, res) => {
        const { nombre_completo, email, password, id_ubicacion, area, puede_ver_celulares, seccion_facturacion, telefono_whatsapp } = req.body;
        const rol_id = req.body.rol_id ?? req.body.id_rol;
        const usuarioSolicitante = req.usuario;
        const esAdminCentral = usuarioSolicitante.nombre_rol === 'Admin Central';

        if (!nombre_completo || !email || !password || !rol_id || !id_ubicacion) {
            return res.status(400).json({ 
                exito: false, 
                mensaje: 'Por favor completa todos los campos: Nombre completo, Correo, Contraseña, Rol y Sede.' 
            });
        }

        if (String(password).trim().length < 4) {
            return res.status(400).json({
                exito: false,
                mensaje: 'La contraseña debe tener al menos 4 letras o números.'
            });
        }

        try {
            const emailExistente = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(email) = LOWER($1)', [email.trim()]);
            if (emailExistente.rows.length > 0) {
                return res.status(400).json({ exito: false, mensaje: 'Ese correo electrónico ya pertenece a otro empleado en el sistema.' });
            }

            const rolCheck = await pool.query('SELECT id_rol, nombre FROM roles WHERE id_rol = $1', [rol_id]);
            if (rolCheck.rows.length === 0) {
                return res.status(400).json({ exito: false, mensaje: 'El rol seleccionado no es válido.' });
            }

            if (!esAdminCentral && rolCheck.rows[0].nombre === 'Admin Central') {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Solo un Admin Central puede crear otro usuario con rol Admin Central.'
                });
            }

            const ubCheck = await pool.query('SELECT id_ubicacion FROM ubicaciones WHERE id_ubicacion = $1', [id_ubicacion]);
            if (ubCheck.rows.length === 0) {
                return res.status(400).json({ exito: false, mensaje: 'La sede seleccionada no es válida.' });
            }

            const password_hash = await bcrypt.hash(String(password), 10);

            const nuevoUsuario = await Usuario.crearUsuario({
                nombre_completo: nombre_completo.trim(),
                email: email.trim().toLowerCase(),
                password_hash,
                rol_id: Number(rol_id),
                id_ubicacion: Number(id_ubicacion),
                area: area || 'ADMINISTRACION',
                puede_ver_celulares: puede_ver_celulares === true,
                seccion_facturacion: seccion_facturacion || 'AMBAS',
                telefono_whatsapp: telefono_whatsapp || null
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
                mensaje: `Empleado "${nuevoUsuario.nombre_completo}" registrado con éxito.`,
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
                mensaje: `Acceso a otras sedes actualizado para el rol "${rolActualizado.nombre}".`,
                rol: rolActualizado
            });
        } catch (error) {
            console.error('Error al actualizar permiso de sedes de rol:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al actualizar permiso de rol', error: error.message });
        }
    },

    actualizarDuracionSesionRol: async (req, res) => {
        const idRol = parseInt(req.params.id_rol, 10);
        const { duracion_sesion_minutos } = req.body;
        const solicitante = req.usuario;
        const esAdminCentral = solicitante.nombre_rol === 'Admin Central';

        if (!idRol || Number.isNaN(idRol)) {
            return res.status(400).json({ exito: false, mensaje: 'Rol inválido.' });
        }

        let valorFinal = null;
        if (duracion_sesion_minutos !== null && duracion_sesion_minutos !== undefined && duracion_sesion_minutos !== '') {
            const num = parseInt(duracion_sesion_minutos, 10);
            if (Number.isNaN(num) || num < 1 || num > 525600) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'El tiempo de sesión debe estar entre 1 minuto y 525600 minutos (1 año), o vacío para no expirar.'
                });
            }
            valorFinal = num;
        }

        try {
            const rolCheck = await pool.query('SELECT id_rol, nombre, duracion_sesion_minutos FROM roles WHERE id_rol = $1', [idRol]);
            if (rolCheck.rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Rol no encontrado.' });
            }
            if (!esAdminCentral && rolCheck.rows[0].nombre === 'Admin Central') {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Solo un Admin Central puede modificar el tiempo de sesión de Admin Central.'
                });
            }

            const rolActualizado = await Usuario.actualizarDuracionSesion(idRol, valorFinal);
            invalidarCacheSesionTodos();

            await registrarAuditoria(
                pool,
                solicitante.id_usuario,
                'ACTUALIZAR_DURACION_SESION_ROL',
                'roles',
                idRol,
                { duracion_sesion_minutos: rolCheck.rows[0].duracion_sesion_minutos },
                { duracion_sesion_minutos: valorFinal }
            );

            res.status(200).json({
                exito: true,
                mensaje: valorFinal
                    ? `Sesión máxima del rol "${rolActualizado.nombre}" configurada correctamente.`
                    : `El rol "${rolActualizado.nombre}" ya no cerrará sesión por tiempo.`,
                rol: rolActualizado
            });
        } catch (error) {
            console.error('Error al actualizar duración de sesión del rol:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al guardar el tiempo de sesión del rol.', error: error.message });
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
                mensaje: 'No puedes eliminar tu propia cuenta.'
            });
        }

        try {
            const resultado = await Usuario.eliminarUsuario(id_usuario);
            if (!resultado.eliminado) {
                return res.status(404).json({ exito: false, mensaje: 'Empleado no encontrado.' });
            }
            invalidarCacheSesionUsuario(id_usuario);

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
                mensaje: `Empleado "${resultado.usuario?.nombre_completo || ''}" eliminado correctamente.`,
                datos: resultado
            });
        } catch (error) {
            console.error('Error al eliminar usuario:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al eliminar usuario', error: error.message });
        }
    },

    // =========================================================================
    // RECUPERACIÓN Y RESTABLECIMIENTO DE CONTRASEÑAS POR ENCARGADO DE ROLES
    // =========================================================================

    listarSolicitudesRecuperacion: async (req, res) => {
        try {
            const { rows } = await pool.query(`
                SELECT 
                    s.id_solicitud,
                    s.id_usuario,
                    s.identificador_ingresado,
                    s.mensaje,
                    s.estado,
                    s.creado_en,
                    u.nombre_completo,
                    u.email,
                    r.nombre AS nombre_rol,
                    ub.nombre AS nombre_ubicacion
                FROM solicitudes_recuperacion_password s
                LEFT JOIN usuarios u ON s.id_usuario = u.id_usuario
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                LEFT JOIN ubicaciones ub ON u.id_ubicacion = ub.id_ubicacion
                WHERE s.estado = 'PENDIENTE'
                ORDER BY s.creado_en DESC;
            `);

            res.status(200).json({
                exito: true,
                total_pendientes: rows.length,
                solicitudes: rows
            });
        } catch (error) {
            console.error('Error al listar solicitudes de recuperación:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'No se pudieron cargar las solicitudes de recuperación de contraseña.'
            });
        }
    },

    restablecerPasswordUsuario: async (req, res) => {
        const { id_usuario } = req.params;
        const { nueva_password } = req.body;
        const encargado = req.usuario;
        const esAdminCentral = encargado.nombre_rol === 'Admin Central';

        if (!nueva_password || String(nueva_password).trim().length < 4) {
            return res.status(400).json({
                exito: false,
                mensaje: 'La nueva contraseña debe tener al menos 4 letras o números.'
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const resUser = await client.query(`
                SELECT u.id_usuario, u.nombre_completo, u.email, r.nombre AS nombre_rol
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                WHERE u.id_usuario = $1 AND COALESCE(u.activo, true) = true
                FOR UPDATE OF u;
            `, [id_usuario]);

            if (resUser.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ exito: false, mensaje: 'Empleado no encontrado.' });
            }

            const empleado = resUser.rows[0];

            // Un encargado que no sea Admin Central no puede cambiarle la contraseña al Admin Central
            if (!esAdminCentral && empleado.nombre_rol === 'Admin Central') {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Solo un Admin Central puede restablecer la contraseña de una cuenta Admin Central.'
                });
            }

            const passwordHash = await bcrypt.hash(String(nueva_password), 10);

            await client.query(
                'UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2',
                [passwordHash, id_usuario]
            );

            // Marcar como atendidas todas las solicitudes pendientes de este usuario
            await client.query(`
                UPDATE solicitudes_recuperacion_password
                SET estado = 'ATENDIDA',
                    atendido_por = $1,
                    atendido_en = CURRENT_TIMESTAMP
                WHERE estado = 'PENDIENTE'
                  AND (id_usuario = $2 OR LOWER(TRIM(identificador_ingresado)) = LOWER($3));
            `, [encargado.id_usuario, id_usuario, empleado.email]);

            await registrarAuditoria(
                client,
                encargado.id_usuario,
                'RESTABLECER_PASSWORD_USUARIO',
                'usuarios',
                Number(id_usuario),
                null,
                { empleado: empleado.nombre_completo, email: empleado.email }
            );

            await client.query('COMMIT');

            res.status(200).json({
                exito: true,
                mensaje: `¡Listo! Ya se guardó la nueva contraseña para ${empleado.nombre_completo}.`
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error al restablecer contraseña:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Ocurrió un error al guardar la nueva contraseña.'
            });
        } finally {
            client.release();
        }
    },

    descartarSolicitudRecuperacion: async (req, res) => {
        const { id_solicitud } = req.params;
        const encargado = req.usuario;

        try {
            const { rows } = await pool.query(`
                UPDATE solicitudes_recuperacion_password
                SET estado = 'DESCARTADA',
                    atendido_por = $1,
                    atendido_en = CURRENT_TIMESTAMP
                WHERE id_solicitud = $2
                RETURNING *;
            `, [encargado.id_usuario, id_solicitud]);

            if (rows.length === 0) {
                return res.status(404).json({ exito: false, mensaje: 'Aviso no encontrado.' });
            }

            res.status(200).json({
                exito: true,
                mensaje: 'Aviso descartado correctamente.'
            });
        } catch (error) {
            console.error('Error al descartar solicitud:', error);
            res.status(500).json({ exito: false, mensaje: 'No se pudo descartar el aviso.' });
        }
    }

};

module.exports = usuarioController;
