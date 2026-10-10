const Mensaje = require('../models/mensajeModel');

const mensajeController = {

    // Enviar un mensaje
    enviarMensaje: async (req, res) => {
        try {
            const id_emisor = req.usuario.id_usuario;
            const { id_receptor, mensaje } = req.body;

            if (!id_receptor) {
                return res.status(400).json({ exito: false, mensaje: 'Debes especificar el destinatario.' });
            }

            if (!mensaje || !mensaje.trim()) {
                return res.status(400).json({ exito: false, mensaje: 'El mensaje no puede estar vacío.' });
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

    // Obtener chat directo entre el usuario autenticado y otro colega
    obtenerChat: async (req, res) => {
        try {
            const id_usuario_actual = req.usuario.id_usuario;
            const id_otro = Number(req.params.id_otro);

            if (!id_otro) {
                return res.status(400).json({ exito: false, mensaje: 'ID de colega inválido.' });
            }

            const historial = await Mensaje.obtenerHistorial(id_usuario_actual, id_otro);

            // Marcar mensajes que me envió este colega como leídos
            await Mensaje.marcarLeidos(id_usuario_actual, id_otro);

            res.status(200).json({
                exito: true,
                datos: historial
            });
        } catch (error) {
            console.error('Error en obtenerChat:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener chat', error: error.message });
        }
    },

    // Listar compañeros de trabajo con contador de no leídos y último mensaje
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
            res.status(500).json({ exito: false, mensaje: 'Error al listar contactos', error: error.message });
        }
    },

    // =========================================================================
    // MODO SUPERVISIÓN SILENCIOSA (JEFATURA / ADMIN CENTRAL)
    // =========================================================================

    // Listar todas las conversaciones entre empleados para auditoría de jefatura
    supervisarConversaciones: async (req, res) => {
        try {
            const rol = req.usuario.nombre_rol;
            const esJefe = rol === 'Admin Central' || rol === 'Administrador' || rol === 'Gerente de Área';

            if (!esJefe) {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Acceso restringido. Solo la jefatura puede supervisar conversaciones internas.'
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

    // Auditar transcripción de un par de empleados SIN marcar como leído ni alertar
    supervisarChatPar: async (req, res) => {
        try {
            const rol = req.usuario.nombre_rol;
            const esJefe = rol === 'Admin Central' || rol === 'Administrador' || rol === 'Gerente de Área';

            if (!esJefe) {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Acceso restringido. Solo la jefatura puede supervisar conversaciones internas.'
                });
            }

            const u1 = Number(req.params.u1);
            const u2 = Number(req.params.u2);

            if (!u1 || !u2) {
                return res.status(400).json({ exito: false, mensaje: 'IDs de usuarios inválidos.' });
            }

            // Se obtiene la transcripción EXACTA sin alterar flags ni fechas de lectura
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

