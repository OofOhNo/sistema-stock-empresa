const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const MODULOS_TODOS = [
    'stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones',
    'productos', 'ubicaciones', 'clientes', 'calidad', 'errores',
    'organizacion', 'mensajes'
];

async function construirPayloadUsuario(usuario) {
    const puedeVerCelulares = usuario.puede_ver_celulares === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
    const puedeVerOtrasUbicaciones = usuario.puede_ver_otras_ubicaciones === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
    const area = usuario.area || 'ADMINISTRACION';

    const permisosMap = {};
    if (usuario.rol_id) {
        const resPerm = await pool.query(`
            SELECT p.modulo, rp.puede_ver, rp.puede_editar
            FROM roles_permisos rp
            JOIN permisos p ON rp.permiso_id = p.id
            WHERE rp.rol_id = $1
        `, [usuario.rol_id]);
        resPerm.rows.forEach(p => {
            permisosMap[p.modulo] = { puede_ver: Boolean(p.puede_ver), puede_editar: Boolean(p.puede_editar) };
        });
    }

    if (usuario.nombre_rol === 'Admin Central') {
        MODULOS_TODOS.forEach(mod => {
            permisosMap[mod] = { puede_ver: true, puede_editar: true };
        });
    }

    return {
        datosToken: {
            id_usuario: usuario.id_usuario,
            email: usuario.email,
            nombre_rol: usuario.nombre_rol,
            id_ubicacion: usuario.id_ubicacion,
            nombre_ubicacion: usuario.nombre_ubicacion || 'Sede Central',
            puede_ver_celulares: puedeVerCelulares,
            puede_ver_otras_ubicaciones: puedeVerOtrasUbicaciones,
            area: area
        },
        usuarioFront: {
            id_usuario: usuario.id_usuario,
            nombre: usuario.nombre_completo,
            email: usuario.email,
            rol: usuario.nombre_rol,
            id_ubicacion: usuario.id_ubicacion,
            nombre_ubicacion: usuario.nombre_ubicacion || 'Sede Central',
            puede_ver_celulares: puedeVerCelulares,
            puede_ver_otras_ubicaciones: puedeVerOtrasUbicaciones,
            area: area,
            permisos: permisosMap
        }
    };
}

const authController = {
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            const emailLimpio = email ? String(email).trim().toLowerCase() : '';

            if (!emailLimpio || !password) {
                return res.status(400).json({ exito: false, mensaje: 'Por favor escribe tu correo y tu contraseña.' });
            }

            const usuario = await Usuario.buscarPorEmail(emailLimpio);
            if (!usuario) {
                return res.status(401).json({ exito: false, mensaje: 'Correo o contraseña incorrectos. Revisa que estén bien escritos.' });
            }

            const pwdStr = String(password);
            const passwordCorrecto = (await bcrypt.compare(pwdStr, usuario.password_hash))
                || (pwdStr !== pwdStr.trim() && await bcrypt.compare(pwdStr.trim(), usuario.password_hash));
            if (!passwordCorrecto) {
                return res.status(401).json({ exito: false, mensaje: 'Correo o contraseña incorrectos. Revisa que estén bien escritos.' });
            }

            const { datosToken, usuarioFront } = await construirPayloadUsuario(usuario);
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: '8h' });

            res.status(200).json({
                exito: true,
                mensaje: 'Inicio de sesión exitoso',
                token: token,
                usuario: usuarioFront
            });
        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ exito: false, mensaje: 'No se pudo conectar con el servidor en este momento.', error: error.message });
        }
    },

    perfil: async (req, res) => {
        try {
            const usuario = req.usuario?.id_usuario
                ? await Usuario.buscarPorId(req.usuario.id_usuario)
                : await Usuario.buscarPorEmail(req.usuario?.email);

            if (!usuario) {
                return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado o inactivo.' });
            }

            const { datosToken, usuarioFront } = await construirPayloadUsuario(usuario);
            // Emitir también un token fresco para mantener rol/área/sede sincronizados
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: '8h' });

            res.status(200).json({
                exito: true,
                token,
                usuario: usuarioFront
            });
        } catch (error) {
            console.error('Error en perfil:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno del servidor.' });
        }
    },

    solicitarRecuperacion: async (req, res) => {
        try {
            const { identificador, mensaje } = req.body;
            const idLimpio = identificador ? String(identificador).trim() : '';

            if (!idLimpio || idLimpio.length < 2) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Por favor escribe tu correo electrónico o tu nombre completo para saber quién eres.'
                });
            }

            const usuarioEncontrado = await Usuario.buscarPorIdentificador(idLimpio);
            const idUsuarioMatch = usuarioEncontrado ? usuarioEncontrado.id_usuario : null;
            const notaLimpia = mensaje ? String(mensaje).trim().slice(0, 300) : null;

            // Evitar duplicados si la persona apretó el botón varias veces seguidas
            const existente = await pool.query(`
                SELECT id_solicitud
                FROM solicitudes_recuperacion_password
                WHERE estado = 'PENDIENTE'
                  AND (
                    ($1::int IS NOT NULL AND id_usuario = $1::int)
                    OR LOWER(TRIM(identificador_ingresado)) = LOWER($2)
                  )
                ORDER BY creado_en DESC
                LIMIT 1;
            `, [idUsuarioMatch, idLimpio]);

            if (existente.rows.length > 0) {
                await pool.query(`
                    UPDATE solicitudes_recuperacion_password
                    SET creado_en = CURRENT_TIMESTAMP,
                        mensaje = COALESCE($1, mensaje)
                    WHERE id_solicitud = $2
                `, [notaLimpia, existente.rows[0].id_solicitud]);
            } else {
                const insertRes = await pool.query(`
                    INSERT INTO solicitudes_recuperacion_password (id_usuario, identificador_ingresado, mensaje, estado)
                    VALUES ($1, $2, $3, 'PENDIENTE')
                    RETURNING id_solicitud;
                `, [idUsuarioMatch, idLimpio, notaLimpia]);

                await registrarAuditoria(
                    pool,
                    idUsuarioMatch,
                    'SOLICITAR_RECUPERACION_PASSWORD',
                    'usuarios',
                    idUsuarioMatch,
                    null,
                    { id_solicitud: insertRes.rows[0].id_solicitud, identificador: idLimpio }
                );
            }

            return res.status(200).json({
                exito: true,
                mensaje: '¡Listo! Ya le enviamos el aviso al encargado de Personal y Roles para que te dé una nueva contraseña.'
            });
        } catch (error) {
            console.error('Error en solicitarRecuperacion:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'No se pudo enviar el aviso en este momento. Avísale directamente al encargado de Personal y Roles.'
            });
        }
    },

    cambiarPasswordPropia: async (req, res) => {
        try {
            const id_usuario = req.usuario.id_usuario;
            const { password_actual, password_nueva } = req.body;

            if (!password_actual || !password_nueva) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Por favor escribe tu contraseña actual y tu nueva contraseña.'
                });
            }

            const nuevaLimpia = String(password_nueva);
            if (nuevaLimpia.trim().length < 4) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'La nueva contraseña debe tener al menos 4 letras o números.'
                });
            }

            const usuario = await Usuario.buscarPorId(id_usuario);
            if (!usuario) {
                return res.status(404).json({ exito: false, mensaje: 'No se encontró tu cuenta de usuario.' });
            }

            const pwdActualStr = String(password_actual);
            const coincideActual = (await bcrypt.compare(pwdActualStr, usuario.password_hash))
                || (pwdActualStr !== pwdActualStr.trim() && await bcrypt.compare(pwdActualStr.trim(), usuario.password_hash));
            if (!coincideActual) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Tu contraseña actual no es correcta. Verifícala con el botón del ojito e intenta de nuevo.'
                });
            }

            const nuevoHash = await bcrypt.hash(nuevaLimpia, 10);
            await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2', [nuevoHash, id_usuario]);

            // Si tenía alguna solicitud de recuperación abierta, marcarla atendida
            await pool.query(`
                UPDATE solicitudes_recuperacion_password
                SET estado = 'ATENDIDA', atendido_por = $1, atendido_en = CURRENT_TIMESTAMP
                WHERE id_usuario = $1 AND estado = 'PENDIENTE'
            `, [id_usuario]);

            await registrarAuditoria(
                pool,
                id_usuario,
                'CAMBIAR_PROPIA_PASSWORD',
                'usuarios',
                id_usuario,
                null,
                { cambio_voluntario: true }
            );

            res.status(200).json({
                exito: true,
                mensaje: '¡Tu contraseña se cambió con éxito! La próxima vez que entres usa tu nueva contraseña.'
            });
        } catch (error) {
            console.error('Error en cambiarPasswordPropia:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Ocurrió un problema al guardar tu nueva contraseña.'
            });
        }
    }
};

module.exports = authController;
