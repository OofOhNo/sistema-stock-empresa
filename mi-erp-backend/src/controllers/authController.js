const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const Usuario = require('../models/usuarioModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');
const { invalidarCacheSesionUsuario } = require('../middlewares/authMiddleware');

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

const MODULOS_TODOS = [
    'stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones',
    'productos', 'ubicaciones', 'clientes', 'calidad', 'errores',
    'organizacion', 'mensajes'
];

function parsearDominiosCorporativos(texto = '') {
    return String(texto || '')
        .split(/[\s,;]+/)
        .map((d) => d.trim().toLowerCase().replace(/^@+/, ''))
        .filter(Boolean);
}

async function obtenerConfiguracionAuth() {
    try {
        const res = await pool.query('SELECT * FROM configuracion_autenticacion WHERE id_config = 1');
        if (res.rows.length > 0) {
            const row = res.rows[0];
            return {
                google_habilitado: Boolean(row.google_habilitado),
                google_client_id: (row.google_client_id || process.env.GOOGLE_CLIENT_ID || '').trim(),
                dominios_corporativos: (row.dominios_corporativos || '').trim()
            };
        }
    } catch {
        // Fallback si la tabla aún no fue consultada
    }
    const envClient = (process.env.GOOGLE_CLIENT_ID || '').trim();
    return {
        google_habilitado: Boolean(envClient),
        google_client_id: envClient,
        dominios_corporativos: (process.env.GOOGLE_ALLOWED_DOMAINS || '').trim()
    };
}

async function construirPayloadUsuario(usuario, loginAtMs = Date.now()) {
    const puedeVerCelulares = usuario.puede_ver_celulares === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
    const puedeVerOtrasUbicaciones = usuario.puede_ver_otras_ubicaciones === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
    const area = usuario.area || 'ADMINISTRACION';
    const nivelJerarquia = usuario.nombre_rol === 'Admin Central'
        ? 1
        : Number(usuario.nivel_jerarquia || 4);
    const duracionMin = usuario.duracion_sesion_minutos && Number(usuario.duracion_sesion_minutos) > 0
        ? Number(usuario.duracion_sesion_minutos)
        : null;
    const sesionExpiraEn = duracionMin ? (loginAtMs + duracionMin * 60 * 1000) : null;

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
            nivel_jerarquia: nivelJerarquia,
            area: area,
            seccion_facturacion: usuario.seccion_facturacion || 'AMBAS',
            token_version: Number(usuario.token_version || 1),
            login_at: loginAtMs
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
            nivel_jerarquia: nivelJerarquia,
            area: area,
            seccion_facturacion: usuario.seccion_facturacion || 'AMBAS',
            telefono_whatsapp: usuario.telefono_whatsapp || null,
            duracion_sesion_minutos: duracionMin,
            login_at: loginAtMs,
            sesion_expira_en: sesionExpiraEn,
            permisos: permisosMap
        }
    };
}

const authController = {
    configPublica: async (req, res) => {
        try {
            const cfg = await obtenerConfiguracionAuth();
            res.status(200).json({
                exito: true,
                google_habilitado: Boolean(cfg.google_habilitado && cfg.google_client_id),
                google_client_id: cfg.google_habilitado ? cfg.google_client_id : '',
                dominios_corporativos: cfg.dominios_corporativos
            });
        } catch {
            res.status(200).json({
                exito: true,
                google_habilitado: false,
                google_client_id: '',
                dominios_corporativos: ''
            });
        }
    },

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

            const loginAtMs = Date.now();
            const { datosToken, usuarioFront } = await construirPayloadUsuario(usuario, loginAtMs);
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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

    loginConGoogle: async (req, res) => {
        try {
            const { credential } = req.body;
            if (!credential) {
                return res.status(400).json({ exito: false, mensaje: 'No se recibió la credencial de Google.' });
            }

            const cfg = await obtenerConfiguracionAuth();
            if (!cfg.google_habilitado || !cfg.google_client_id) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'El acceso con Google Workspace no está activado en este momento.'
                });
            }

            const client = new OAuth2Client(cfg.google_client_id);
            const ticket = await client.verifyIdToken({
                idToken: String(credential),
                audience: cfg.google_client_id
            });
            const payload = ticket.getPayload();

            if (!payload?.email || payload.email_verified !== true) {
                return res.status(401).json({
                    exito: false,
                    mensaje: 'Tu correo de Google no está verificado.'
                });
            }

            const emailGoogle = String(payload.email).trim().toLowerCase();
            const dominioEmail = emailGoogle.split('@')[1] || '';
            const dominiosPermitidos = parsearDominiosCorporativos(cfg.dominios_corporativos);

            if (dominiosPermitidos.length > 0 && !dominiosPermitidos.includes(dominioEmail)) {
                return res.status(403).json({
                    exito: false,
                    mensaje: `Solo se permiten correos corporativos autorizados (${dominiosPermitidos.map(d => '@' + d).join(', ')}).`
                });
            }

            const usuario = await Usuario.buscarPorEmail(emailGoogle);
            if (!usuario) {
                return res.status(403).json({
                    exito: false,
                    mensaje: `Tu correo corporativo (${emailGoogle}) aún no tiene una cuenta asignada en el sistema. Pídele al Admin Central que te registre en Personal y Roles con ese correo.`
                });
            }

            const loginAtMs = Date.now();
            const { datosToken, usuarioFront } = await construirPayloadUsuario(usuario, loginAtMs);
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

            await registrarAuditoria(
                pool,
                usuario.id_usuario,
                'LOGIN_GOOGLE',
                'usuarios',
                usuario.id_usuario,
                null,
                { email: emailGoogle, hd: payload.hd || null }
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Inicio de sesión con correo corporativo exitoso',
                token,
                usuario: usuarioFront
            });
        } catch (error) {
            console.error('Error en loginConGoogle:', error);
            res.status(401).json({
                exito: false,
                mensaje: 'No se pudo validar tu acceso con Google. Verifica el Client ID o intenta nuevamente.'
            });
        }
    },

    obtenerConfigCorporativa: async (req, res) => {
        try {
            const cfg = await obtenerConfiguracionAuth();
            res.status(200).json({ exito: true, config: cfg });
        } catch (error) {
            res.status(500).json({ exito: false, mensaje: 'No se pudo obtener la configuración corporativa.', error: error.message });
        }
    },

    actualizarConfigCorporativa: async (req, res) => {
        try {
            const { google_habilitado, google_client_id, dominios_corporativos } = req.body;
            const clientIdLimpio = String(google_client_id || '').trim();
            const dominiosLimpios = parsearDominiosCorporativos(dominios_corporativos).join(', ');
            const habilitadoFinal = Boolean(google_habilitado);

            if (habilitadoFinal && !clientIdLimpio) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Para habilitar el botón de Google Workspace debes ingresar el Client ID.'
                });
            }

            const { rows } = await pool.query(`
                INSERT INTO configuracion_autenticacion (id_config, google_habilitado, google_client_id, dominios_corporativos, actualizado_en)
                VALUES (1, $1::boolean, $2::varchar, $3::varchar, CURRENT_TIMESTAMP)
                ON CONFLICT (id_config) DO UPDATE SET
                    google_habilitado = EXCLUDED.google_habilitado,
                    google_client_id = EXCLUDED.google_client_id,
                    dominios_corporativos = EXCLUDED.dominios_corporativos,
                    actualizado_en = CURRENT_TIMESTAMP
                RETURNING *;
            `, [habilitadoFinal, clientIdLimpio, dominiosLimpios]);

            await registrarAuditoria(
                pool,
                req.usuario.id_usuario,
                'CONFIGURAR_LOGIN_GOOGLE',
                'usuarios',
                req.usuario.id_usuario,
                null,
                { google_habilitado: habilitadoFinal, dominios_corporativos: dominiosLimpios }
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Configuración de acceso con correo corporativo guardada.',
                config: rows[0]
            });
        } catch (error) {
            console.error('Error al guardar config corporativa:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al guardar la configuración corporativa.', error: error.message });
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

            // Conservar el timestamp original del login para respetar el límite fijo por rol
            const loginAtMs = Number(req.usuario?.login_at)
                || (req.usuario?.iat ? Number(req.usuario.iat) * 1000 : Date.now());

            const { datosToken, usuarioFront } = await construirPayloadUsuario(usuario, loginAtMs);
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

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
            if (nuevaLimpia.trim().length < 8) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'La nueva contraseña debe tener al menos 8 caracteres.'
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
            await pool.query(`
                UPDATE usuarios
                SET password_hash = $1,
                    password_actualizada_en = CURRENT_TIMESTAMP,
                    token_version = COALESCE(token_version, 1) + 1
                WHERE id_usuario = $2
            `, [nuevoHash, id_usuario]);
            invalidarCacheSesionUsuario(id_usuario);

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
