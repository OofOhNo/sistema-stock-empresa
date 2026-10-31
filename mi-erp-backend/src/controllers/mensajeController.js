const Mensaje = require('../models/mensajeModel');

const mensajeController = {

    enviarMensaje: async (req, res) => {
        try {
            const id_emisor = req.usuario.id_usuario;
            const { id_receptor, mensaje } = req.body;

            if (!id_receptor) {
                return res.status(400).json({ exito: false, mensaje: 'Elige a qué compañero quieres enviarle el mensaje.' });
            }

            if (!mensaje || !mensaje.trim()) {
                return res.status(400).json({ exito: false, mensaje: 'Escribe un mensaje antes de enviarlo.' });
            }

            if (Number(id_emisor) === Number(id_receptor)) {
                return res.status(400).json({ exito: false, mensaje: 'No puedes enviarte mensajes a ti mismo.' });
            }

            const nuevoMensaje = await Mensaje.enviar({
                id_emisor,
                id_receptor: Number(id_receptor),
                mensaje: mensaje.trim()
            });

            res.status(201).json({
                exito: true,
                mensaje: 'Mensaje enviado',
                datos: nuevoMensaje
            });
        } catch (error) {
            console.error('Error en enviarMensaje:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al enviar mensaje', error: error.message });
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
