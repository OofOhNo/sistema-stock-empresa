const pool = require('../config/db');
const Mensaje = require('../models/mensajeModel');
const {
    vincularWhatsApp,
    desconectarWhatsApp,
    obtenerEstadoWhatsApp,
    enviarMensajeWhatsApp,
    normalizarNumeroWhatsApp
} = require('../utils/whatsappService');

const mensajeController = {

    enviarMensaje: async (req, res) => {
        try {
            const id_emisor = req.usuario.id_usuario;
            const { id_receptor, mensaje, enviar_whatsapp = false } = req.body;

            if (!id_receptor) {
                return res.status(400).json({ exito: false, mensaje: 'Elige a qué compañero quieres enviarle el mensaje.' });
            }

            if (!mensaje || !mensaje.trim()) {
                return res.status(400).json({ exito: false, mensaje: 'Escribe un mensaje antes de enviarlo.' });
            }

            if (Number(id_emisor) === Number(id_receptor)) {
                return res.status(400).json({ exito: false, mensaje: 'No puedes enviarte mensajes a ti mismo.' });
            }

            const textoLimpio = mensaje.trim();
            const nuevoMensaje = await Mensaje.enviar({
                id_emisor,
                id_receptor: Number(id_receptor),
                mensaje: textoLimpio
            });

            let resultadoWhatsapp = null;
            if (Boolean(enviar_whatsapp)) {
                const { rows: recRows } = await pool.query(
                    'SELECT telefono_whatsapp FROM usuarios WHERE id_usuario = $1::int LIMIT 1;',
                    [Number(id_receptor)]
                );
                const telefonoDestino = recRows[0]?.telefono_whatsapp || '';
                if (!normalizarNumeroWhatsApp(telefonoDestino)) {
                    resultadoWhatsapp = {
                        solicitado: true,
                        enviado: false,
                        codigo: 'SIN_NUMERO',
                        mensaje: 'Guardado en el chat interno, pero este compañero no tiene WhatsApp registrado en Personal y Roles.'
                    };
                } else {
                    // Enviar únicamente el mensaje plano desde el WhatsApp del propio emisor
                    const envio = await enviarMensajeWhatsApp(id_emisor, telefonoDestino, textoLimpio);
                    if (envio.enviado) {
                        await Mensaje.marcarEnviadoWhatsApp(nuevoMensaje.id_mensaje).catch(() => {});
                        nuevoMensaje.enviado_whatsapp = true;
                        resultadoWhatsapp = {
                            solicitado: true,
                            enviado: true,
                            numero: envio.numero,
                            mensaje: 'Enviado al chat interno y por WhatsApp.'
                        };
                    } else {
                        resultadoWhatsapp = {
                            solicitado: true,
                            enviado: false,
                            codigo: envio.codigo,
                            mensaje: `Guardado en el chat interno. WhatsApp no enviado: ${envio.mensaje}`
                        };
                    }
                }
            }

            res.status(201).json({
                exito: true,
                mensaje: 'Mensaje enviado',
                datos: nuevoMensaje,
                ...(resultadoWhatsapp ? { whatsapp: resultadoWhatsapp } : {})
            });
        } catch (error) {
            console.error('Error en enviarMensaje:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al enviar mensaje', error: error.message });
        }
    },

    reenviarWhatsAppMensaje: async (req, res) => {
        try {
            const idUsuarioActual = Number(req.usuario.id_usuario);
            const idMensaje = parseInt(req.params.id, 10);
            if (!Number.isFinite(idMensaje)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de mensaje inválido.' });
            }

            const msg = await Mensaje.obtenerPorId(idMensaje);
            if (!msg) {
                return res.status(404).json({ exito: false, mensaje: 'Mensaje no encontrado.' });
            }

            const soyEmisor = Number(msg.id_emisor) === idUsuarioActual;
            const soyReceptor = Number(msg.id_receptor) === idUsuarioActual;
            if (!soyEmisor && !soyReceptor) {
                return res.status(403).json({ exito: false, mensaje: 'No tienes permiso para reenviar este mensaje.' });
            }

            const telefonoDestino = soyEmisor ? msg.telefono_receptor : msg.telefono_emisor;
            if (!normalizarNumeroWhatsApp(telefonoDestino)) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Este compañero aún no tiene un número de WhatsApp válido en Personal y Roles.'
                });
            }

            const envio = await enviarMensajeWhatsApp(idUsuarioActual, telefonoDestino, msg.mensaje);
            if (!envio.enviado) {
                const status = envio.codigo === 'WHATSAPP_NO_CONECTADO' ? 503 : 400;
                return res.status(status).json({
                    exito: false,
                    codigo: envio.codigo,
                    mensaje: envio.mensaje
                });
            }

            await Mensaje.marcarEnviadoWhatsApp(msg.id_mensaje).catch(() => {});
            return res.status(200).json({
                exito: true,
                mensaje: 'Mensaje enviado automáticamente por WhatsApp.',
                numero: envio.numero
            });
        } catch (error) {
            console.error('Error en reenviarWhatsAppMensaje:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error interno al enviar por WhatsApp.' });
        }
    },

    estadoWhatsApp: async (req, res) => {
        try {
            return res.status(200).json({
                exito: true,
                ...obtenerEstadoWhatsApp(req.usuario.id_usuario, true)
            });
        } catch (error) {
            console.error('Error consultando estado WhatsApp:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo consultar el estado de WhatsApp.' });
        }
    },

    vincularWhatsAppHandler: async (req, res) => {
        try {
            const forzarNuevoQr = Boolean(req.body?.forzar_nuevo_qr);
            const estado = await vincularWhatsApp(req.usuario.id_usuario, { forzarNuevoQr });
            return res.status(200).json({
                exito: true,
                ...estado
            });
        } catch (error) {
            console.error('Error iniciando vinculación WhatsApp:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo generar el código QR de WhatsApp.' });
        }
    },

    desconectarWhatsAppHandler: async (req, res) => {
        try {
            const estado = await desconectarWhatsApp(req.usuario.id_usuario);
            return res.status(200).json({
                exito: true,
                mensaje: 'Sesión de WhatsApp desvinculada correctamente.',
                ...estado
            });
        } catch (error) {
            console.error('Error desconectando WhatsApp:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo desconectar WhatsApp.' });
        }
    },

    obtenerChat: async (req, res) => {
        try {
            const id_usuario_actual = req.usuario.id_usuario;
            const id_otro = Number(req.params.id_otro);

            if (!id_otro) {
                return res.status(400).json({ exito: false, mensaje: 'Compañero inválido.' });
            }

            const historial = await Mensaje.obtenerHistorial(id_usuario_actual, id_otro);
            await Mensaje.marcarLeidos(id_usuario_actual, id_otro);

            res.status(200).json({
                exito: true,
                datos: historial
            });
        } catch (error) {
            console.error('Error en obtenerChat:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al abrir la conversación', error: error.message });
        }
    },

    listarContactos: async (req, res) => {
        try {
            const id_usuario_actual = req.usuario.id_usuario;
            const contactos = await Mensaje.obtenerContactos(id_usuario_actual);

            res.status(200).json({
                exito: true,
                datos: contactos
            });
        } catch (error) {
            console.error('Error en listarContactos:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al cargar compañeros', error: error.message });
        }
    },

    contarNoLeidos: async (req, res) => {
        try {
            const total = await Mensaje.contarNoLeidos(req.usuario.id_usuario);
            res.status(200).json({ exito: true, no_leidos: total });
        } catch (error) {
            res.status(500).json({ exito: false, no_leidos: 0 });
        }
    },

    // =========================================================================
    // MODO SUPERVISIÓN SILENCIOSA (EXCLUSIVO ADMIN CENTRAL)
    // =========================================================================

    supervisarConversaciones: async (req, res) => {
        try {
            if (req.usuario.nombre_rol !== 'Admin Central') {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Acceso restringido únicamente al Admin Central.'
                });
            }

            const conversaciones = await Mensaje.supervisarTodasLasConversaciones();

            res.status(200).json({
                exito: true,
                es_jefe: true,
                total: conversaciones.length,
                datos: conversaciones
            });
        } catch (error) {
            console.error('Error en supervisarConversaciones:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al supervisar conversaciones', error: error.message });
        }
    },

    supervisarChatPar: async (req, res) => {
        try {
            if (req.usuario.nombre_rol !== 'Admin Central') {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Acceso restringido únicamente al Admin Central.'
                });
            }

            const u1 = Number(req.params.u1);
            const u2 = Number(req.params.u2);

            if (!u1 || !u2) {
                return res.status(400).json({ exito: false, mensaje: 'Usuarios inválidos.' });
            }

            const mensajes = await Mensaje.supervisarChatPar(u1, u2);

            res.status(200).json({
                exito: true,
                modo_silencioso: true,
                datos: mensajes
            });
        } catch (error) {
            console.error('Error en supervisarChatPar:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al supervisar chat', error: error.message });
        }
    }

};

module.exports = mensajeController;
