const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../config/db');
const Mensaje = require('../models/mensajeModel');
const {
    vincularWhatsApp,
    desconectarWhatsApp,
    obtenerEstadoWhatsApp,
    enviarMensajeWhatsApp,
    crearGrupoWhatsApp,
    listarGruposWhatsApp,
    validarGrupoWhatsAppExistente,
    enviarMensajeGrupoWhatsApp,
    sincronizarGrupoEnWhatsApp,
    actualizarGrupoWhatsApp,
    actualizarParticipantesGrupoWhatsApp,
    salirGrupoWhatsApp,
    normalizarNumeroWhatsApp
} = require('../utils/whatsappService');

const uploadDirMensajes = path.join(__dirname, '../../uploads/mensajes');
if (!fs.existsSync(uploadDirMensajes)) {
    fs.mkdirSync(uploadDirMensajes, { recursive: true });
}

const EXTS_IMAGEN_CHAT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const EXTS_ARCHIVO_CHAT = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
    '.ppt', '.pptx', '.zip', '.rar', '.7z', '.json', '.xml'
]);

const storageAdjuntos = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDirMensajes),
    filename: (_req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const unico = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        cb(null, unico);
    }
});

const uploadAdjuntos = multer({
    storage: storageAdjuntos,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(String(file.originalname || '')).toLowerCase();
        const esImagen = Boolean(file.mimetype?.startsWith('image/')) && EXTS_IMAGEN_CHAT.has(ext);
        const esDoc = EXTS_ARCHIVO_CHAT.has(ext);
        if (esImagen || esDoc) {
            return cb(null, true);
        }
        return cb(
            new Error('Tipo de archivo no permitido. Usa fotos (JPG, PNG, WebP, GIF) o archivos (PDF, Word, Excel, CSV, TXT, ZIP, etc.).'),
            false
        );
    }
});

function aBooleano(valor) {
    return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

function limpiarArchivoTemporal(file) {
    if (file?.path) {
        fs.promises.unlink(file.path).catch(() => {});
    }
}

function construirAdjuntoMensaje(file) {
    if (!file) return null;
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const esImagen = Boolean(file.mimetype?.startsWith('image/')) && EXTS_IMAGEN_CHAT.has(ext);
    let nombre = String(file.originalname || 'archivo').replace(/[/\\:*?"<>|\r\n]/g, '_').trim();
    if (/[ÃÂ]/.test(nombre)) {
        try {
            const dec = Buffer.from(nombre, 'latin1').toString('utf8');
            if (!dec.includes('\uFFFD')) nombre = dec;
        } catch {
            // conservar original
        }
    }
    if (nombre.length > 250) nombre = nombre.slice(0, 250);
    return {
        url: `/api/mensajes/adjuntos/${file.filename}`,
        nombre: nombre || file.filename,
        tipo: esImagen ? 'IMAGEN' : 'ARCHIVO',
        mime: file.mimetype || 'application/octet-stream',
        tamano: Number(file.size) || 0,
        rutaLocal: file.path
    };
}

function adjuntoDesdeRegistro(msg) {
    if (!msg?.adjunto_url) return null;
    const nombreArchivo = path.basename(String(msg.adjunto_url));
    const rutaLocal = path.join(uploadDirMensajes, nombreArchivo);
    return {
        url: msg.adjunto_url,
        nombre: msg.adjunto_nombre || nombreArchivo,
        tipo: msg.adjunto_tipo || 'ARCHIVO',
        mime: msg.adjunto_mime || 'application/octet-stream',
        tamano: msg.adjunto_tamano || 0,
        rutaLocal
    };
}

const mensajeController = {

    middlewareAdjunto: uploadAdjuntos.single('archivo'),

    enviarMensaje: async (req, res) => {
        try {
            const id_emisor = req.usuario.id_usuario;
            const { id_receptor, mensaje = '', enviar_whatsapp = false } = req.body;
            const adjunto = construirAdjuntoMensaje(req.file);
            const textoLimpio = String(mensaje || '').trim();
            const quiereWhatsapp = aBooleano(enviar_whatsapp);

            if (!id_receptor) {
                limpiarArchivoTemporal(req.file);
                return res.status(400).json({ exito: false, mensaje: 'Elige a qué compañero quieres enviarle el mensaje.' });
            }

            if (!textoLimpio && !adjunto) {
                limpiarArchivoTemporal(req.file);
                return res.status(400).json({ exito: false, mensaje: 'Escribe un mensaje o adjunta una foto o archivo antes de enviarlo.' });
            }

            if (Number(id_emisor) === Number(id_receptor)) {
                limpiarArchivoTemporal(req.file);
                return res.status(400).json({ exito: false, mensaje: 'No puedes enviarte mensajes a ti mismo.' });
            }

            const nuevoMensaje = await Mensaje.enviar({
                id_emisor,
                id_receptor: Number(id_receptor),
                mensaje: textoLimpio,
                adjunto
            });

            let resultadoWhatsapp = null;
            if (quiereWhatsapp) {
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
                    const envio = await enviarMensajeWhatsApp(id_emisor, telefonoDestino, textoLimpio, adjunto);
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
            limpiarArchivoTemporal(req.file);
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

            const envio = await enviarMensajeWhatsApp(idUsuarioActual, telefonoDestino, msg.mensaje, adjuntoDesdeRegistro(msg));
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
    },

    // =========================================================================
    // GRUPOS TIPO WHATSAPP
    // =========================================================================

    listarGrupos: async (req, res) => {
        try {
            const grupos = await Mensaje.listarGruposUsuario(req.usuario.id_usuario);
            return res.status(200).json({ exito: true, datos: grupos });
        } catch (error) {
            console.error('Error en listarGrupos:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al cargar tus grupos.' });
        }
    },

    listarGruposWhatsAppHandler: async (req, res) => {
        try {
            const resWa = await listarGruposWhatsApp(req.usuario.id_usuario);
            return res.status(200).json({
                exito: true,
                ok: Boolean(resWa.ok),
                codigo: resWa.codigo || null,
                mensaje: resWa.mensaje || '',
                datos: resWa.grupos || []
            });
        } catch (error) {
            console.error('Error listando grupos de WhatsApp:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudieron consultar tus grupos de WhatsApp.' });
        }
    },

    descargarOServirAdjunto: async (req, res) => {
        try {
            const nombreArchivo = path.basename(String(req.params.archivo || ''));
            if (!nombreArchivo || nombreArchivo === '.' || nombreArchivo === '..') {
                return res.status(400).json({ exito: false, mensaje: 'Archivo inválido.' });
            }

            const rutaArchivo = path.join(uploadDirMensajes, nombreArchivo);
            if (!fs.existsSync(rutaArchivo)) {
                return res.status(404).json({ exito: false, mensaje: 'Archivo no encontrado.' });
            }

            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            const adjuntoUrl = `/api/mensajes/adjuntos/${nombreArchivo}`;
            const authInfo = await Mensaje.obtenerAdjuntoAutorizado(adjuntoUrl, req.usuario.id_usuario, esAdminCentral);
            if (!authInfo) {
                return res.status(403).json({ exito: false, mensaje: 'No tienes permiso para acceder a este archivo.' });
            }

            const nombreDescarga = authInfo.adjunto_nombre || nombreArchivo;
            if (req.query.download === '1' || req.query.download === 'true') {
                return res.download(rutaArchivo, nombreDescarga);
            }

            if (authInfo.adjunto_mime) {
                res.setHeader('Content-Type', authInfo.adjunto_mime);
            }
            res.setHeader('Cache-Control', 'private, max-age=86400');
            return res.sendFile(rutaArchivo);
        } catch (error) {
            console.error('Error sirviendo adjunto de mensajería:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo cargar el archivo adjunto.' });
        }
    },

    crearGrupo: async (req, res) => {
        try {
            const {
                nombre,
                descripcion = '',
                miembros = [],
                modo_whatsapp = 'CREAR_NUEVO',
                whatsapp_group_jid = null
            } = req.body;
            const nombreLimpio = String(nombre || '').trim();
            if (!nombreLimpio) {
                return res.status(400).json({ exito: false, mensaje: 'El nombre del grupo es obligatorio.' });
            }
            if (nombreLimpio.length > 120) {
                return res.status(400).json({ exito: false, mensaje: 'El nombre del grupo no debe superar 120 caracteres.' });
            }

            const modoFinal = ['CREAR_NUEVO', 'VINCULAR_EXISTENTE', 'SOLO_INTERNO'].includes(String(modo_whatsapp || '').toUpperCase())
                ? String(modo_whatsapp).toUpperCase()
                : 'CREAR_NUEVO';

            let jidValidado = null;
            let infoGrupoExistenteWa = null;
            if (modoFinal === 'VINCULAR_EXISTENTE') {
                const check = await validarGrupoWhatsAppExistente(req.usuario.id_usuario, whatsapp_group_jid);
                if (!check.valido) {
                    return res.status(400).json({
                        exito: false,
                        codigo: check.codigo,
                        mensaje: check.mensaje
                    });
                }
                jidValidado = check.grupo.jid;
                infoGrupoExistenteWa = check.grupo;
            }

            const descLimpia = String(descripcion || '').trim() || null;
            const listaMiembros = Array.isArray(miembros) ? miembros : [];
            let grupo = await Mensaje.crearGrupo({
                nombre: nombreLimpio,
                descripcion: descLimpia,
                id_creador: req.usuario.id_usuario,
                miembros_ids: listaMiembros
            });

            let waGrupo = null;
            if (modoFinal === 'VINCULAR_EXISTENTE' && jidValidado) {
                grupo = await Mensaje.asignarWhatsappGroupJid(grupo.id_grupo, jidValidado);
                waGrupo = {
                    creado: false,
                    vinculado_existente: true,
                    groupJid: jidValidado,
                    subject: infoGrupoExistenteWa?.nombre || nombreLimpio
                };
            } else if (modoFinal === 'CREAR_NUEVO') {
                const telefonosOtros = (grupo?.miembros || [])
                    .filter((m) => Number(m.id_usuario) !== Number(req.usuario.id_usuario))
                    .map((m) => m.telefono_whatsapp);

                waGrupo = await crearGrupoWhatsApp(req.usuario.id_usuario, {
                    nombre: nombreLimpio,
                    descripcion: descLimpia || '',
                    telefonosParticipantes: telefonosOtros
                });

                if (waGrupo?.creado && waGrupo.groupJid) {
                    grupo = await Mensaje.asignarWhatsappGroupJid(grupo.id_grupo, waGrupo.groupJid);
                }
            } else {
                waGrupo = { creado: false, vinculado_existente: false, solo_interno: true };
            }

            return res.status(201).json({
                exito: true,
                mensaje: waGrupo?.vinculado_existente
                    ? 'Grupo creado y vinculado al grupo existente de WhatsApp.'
                    : waGrupo?.creado
                    ? 'Grupo creado en el ERP y en WhatsApp.'
                    : 'Grupo creado correctamente.',
                datos: grupo,
                whatsapp_grupo: waGrupo
            });
        } catch (error) {
            console.error('Error en crearGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo crear el grupo.' });
        }
    },

    sincronizarGrupoWhatsapp: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if ((!membresia || membresia.rol_grupo !== 'ADMIN') && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'Solo un administrador del grupo puede sincronizarlo con WhatsApp.' });
            }
            let grupo = await Mensaje.obtenerGrupoPorId(idGrupo);
            if (!grupo) {
                return res.status(404).json({ exito: false, mensaje: 'Grupo no encontrado.' });
            }

            const jidManual = String(req.body?.whatsapp_group_jid || '').trim();
            if (jidManual) {
                const check = await validarGrupoWhatsAppExistente(req.usuario.id_usuario, jidManual);
                if (!check.valido) {
                    return res.status(400).json({
                        exito: false,
                        codigo: check.codigo,
                        mensaje: check.mensaje
                    });
                }
                grupo = await Mensaje.asignarWhatsappGroupJid(idGrupo, check.grupo.jid);
                return res.status(200).json({
                    exito: true,
                    sincronizado: true,
                    mensaje: `Grupo vinculado a "${check.grupo.nombre || 'grupo de WhatsApp'}".`,
                    whatsapp_grupo: { sincronizado: true, vinculado_existente: true, groupJid: check.grupo.jid },
                    datos: grupo
                });
            }

            const syncRes = await sincronizarGrupoEnWhatsApp(req.usuario.id_usuario, grupo);
            if (syncRes.sincronizado && syncRes.groupJid && !grupo.whatsapp_group_jid) {
                grupo = await Mensaje.asignarWhatsappGroupJid(idGrupo, syncRes.groupJid);
            }

            return res.status(200).json({
                exito: true,
                mensaje: syncRes.mensaje || (syncRes.sincronizado ? 'Grupo sincronizado con WhatsApp.' : 'No se pudo sincronizar con WhatsApp.'),
                sincronizado: Boolean(syncRes.sincronizado),
                whatsapp_grupo: syncRes,
                datos: grupo
            });
        } catch (error) {
            console.error('Error en sincronizarGrupoWhatsapp:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo sincronizar el grupo con WhatsApp.' });
        }
    },

    obtenerDetalleGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if (!membresia && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'No perteneces a este grupo.' });
            }
            const grupo = await Mensaje.obtenerGrupoPorId(idGrupo);
            if (!grupo) {
                return res.status(404).json({ exito: false, mensaje: 'Grupo no encontrado.' });
            }
            return res.status(200).json({ exito: true, datos: grupo });
        } catch (error) {
            console.error('Error en obtenerDetalleGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al consultar el grupo.' });
        }
    },

    actualizarGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if ((!membresia || membresia.rol_grupo !== 'ADMIN') && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'Solo un administrador del grupo puede editarlo.' });
            }
            const { nombre, descripcion } = req.body;
            const nombreLimpio = nombre !== undefined ? String(nombre || '').trim() : null;
            if (nombre !== undefined && !nombreLimpio) {
                return res.status(400).json({ exito: false, mensaje: 'El nombre del grupo no puede quedar vacío.' });
            }
            const grupo = await Mensaje.actualizarGrupo(idGrupo, {
                nombre: nombreLimpio,
                descripcion: descripcion !== undefined ? (String(descripcion || '').trim() || null) : null
            });
            if (grupo?.whatsapp_group_jid) {
                await actualizarGrupoWhatsApp(req.usuario.id_usuario, grupo.whatsapp_group_jid, {
                    nombre: nombreLimpio || grupo.nombre,
                    descripcion: descripcion !== undefined ? (String(descripcion || '').trim() || '') : undefined
                }).catch(() => {});
            }
            return res.status(200).json({ exito: true, mensaje: 'Grupo actualizado.', datos: grupo });
        } catch (error) {
            console.error('Error en actualizarGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo actualizar el grupo.' });
        }
    },

    agregarMiembrosGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if ((!membresia || membresia.rol_grupo !== 'ADMIN') && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'Solo un administrador del grupo puede agregar integrantes.' });
            }
            const miembros = Array.isArray(req.body?.miembros) ? req.body.miembros : [];
            if (miembros.length === 0) {
                return res.status(400).json({ exito: false, mensaje: 'Elige al menos un compañero para agregar.' });
            }
            let grupo = await Mensaje.agregarMiembrosGrupo(idGrupo, miembros);

            const idsAgregados = new Set(miembros.map(Number));
            const nuevosTelefonos = (grupo?.miembros || [])
                .filter((m) => idsAgregados.has(Number(m.id_usuario)))
                .map((m) => m.telefono_whatsapp);

            if (grupo?.whatsapp_group_jid) {
                await actualizarParticipantesGrupoWhatsApp(
                    req.usuario.id_usuario,
                    grupo.whatsapp_group_jid,
                    nuevosTelefonos,
                    'add'
                ).catch(() => {});
            } else {
                const telefonosOtros = (grupo?.miembros || [])
                    .filter((m) => Number(m.id_usuario) !== Number(req.usuario.id_usuario))
                    .map((m) => m.telefono_whatsapp);
                const waGrupo = await crearGrupoWhatsApp(req.usuario.id_usuario, {
                    nombre: grupo?.nombre,
                    descripcion: grupo?.descripcion || '',
                    telefonosParticipantes: telefonosOtros
                }).catch(() => null);
                if (waGrupo?.creado && waGrupo.groupJid) {
                    grupo = await Mensaje.asignarWhatsappGroupJid(idGrupo, waGrupo.groupJid);
                }
            }

            return res.status(200).json({ exito: true, mensaje: 'Integrantes agregados.', datos: grupo });
        } catch (error) {
            console.error('Error en agregarMiembrosGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo agregar participantes.' });
        }
    },

    cambiarRolMiembroGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            const idObjetivo = parseInt(req.params.id_usuario, 10);
            const nuevoRol = String(req.body?.rol_grupo || '').toUpperCase();
            if (!Number.isFinite(idGrupo) || !Number.isFinite(idObjetivo) || !['ADMIN', 'MIEMBRO'].includes(nuevoRol)) {
                return res.status(400).json({ exito: false, mensaje: 'Datos inválidos.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if ((!membresia || membresia.rol_grupo !== 'ADMIN') && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'Solo un administrador del grupo puede cambiar roles.' });
            }
            const grupo = await Mensaje.cambiarRolMiembroGrupo(idGrupo, idObjetivo, nuevoRol);
            if (grupo?.whatsapp_group_jid) {
                const miembroObj = (grupo.miembros || []).find((m) => Number(m.id_usuario) === idObjetivo);
                if (miembroObj?.telefono_whatsapp) {
                    await actualizarParticipantesGrupoWhatsApp(
                        req.usuario.id_usuario,
                        grupo.whatsapp_group_jid,
                        [miembroObj.telefono_whatsapp],
                        nuevoRol === 'ADMIN' ? 'promote' : 'demote'
                    ).catch(() => {});
                }
            }
            return res.status(200).json({ exito: true, mensaje: 'Rol actualizado.', datos: grupo });
        } catch (error) {
            return res.status(400).json({ exito: false, mensaje: error.message || 'No se pudo actualizar el rol.' });
        }
    },

    quitarOSalirGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            const idObjetivo = parseInt(req.params.id_usuario, 10);
            const idActual = Number(req.usuario.id_usuario);
            if (!Number.isFinite(idGrupo) || !Number.isFinite(idObjetivo)) {
                return res.status(400).json({ exito: false, mensaje: 'Parámetros inválidos.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, idActual);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            const esSalidaPropia = idObjetivo === idActual;
            if (!esSalidaPropia && (!membresia || membresia.rol_grupo !== 'ADMIN') && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'Solo un administrador del grupo puede quitar integrantes.' });
            }
            if (esSalidaPropia && !membresia) {
                return res.status(404).json({ exito: false, mensaje: 'Ya no eres parte de este grupo.' });
            }
            const grupoAntes = await Mensaje.obtenerGrupoPorId(idGrupo);
            const resultado = await Mensaje.quitarMiembroGrupo(idGrupo, idObjetivo);
            if (grupoAntes?.whatsapp_group_jid) {
                if (esSalidaPropia) {
                    await salirGrupoWhatsApp(idActual, grupoAntes.whatsapp_group_jid).catch(() => {});
                } else {
                    const miembroObj = (grupoAntes.miembros || []).find((m) => Number(m.id_usuario) === idObjetivo);
                    if (miembroObj?.telefono_whatsapp) {
                        await actualizarParticipantesGrupoWhatsApp(
                            idActual,
                            grupoAntes.whatsapp_group_jid,
                            [miembroObj.telefono_whatsapp],
                            'remove'
                        ).catch(() => {});
                    }
                }
            }
            return res.status(200).json({
                exito: true,
                mensaje: esSalidaPropia ? 'Saliste del grupo.' : 'Integrante eliminado del grupo.',
                ...resultado
            });
        } catch (error) {
            console.error('Error en quitarOSalirGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo actualizar la membresía del grupo.' });
        }
    },

    eliminarGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if ((!membresia || membresia.rol_grupo !== 'ADMIN') && !esAdminCentral) {
                return res.status(403).json({ exito: false, mensaje: 'Solo un administrador del grupo puede eliminarlo.' });
            }
            await Mensaje.eliminarGrupo(idGrupo);
            return res.status(200).json({ exito: true, mensaje: 'Grupo eliminado correctamente.' });
        } catch (error) {
            console.error('Error en eliminarGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'No se pudo eliminar el grupo.' });
        }
    },

    obtenerMensajesGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            const idUsuario = Number(req.usuario.id_usuario);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, idUsuario);
            if (!membresia) {
                return res.status(403).json({ exito: false, mensaje: 'No perteneces a este grupo.' });
            }
            const mensajes = await Mensaje.obtenerHistorialGrupo(idGrupo);
            await Mensaje.marcarGrupoLeido(idGrupo, idUsuario);
            return res.status(200).json({ exito: true, datos: mensajes });
        } catch (error) {
            console.error('Error en obtenerMensajesGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al cargar los mensajes del grupo.' });
        }
    },

    enviarMensajeGrupo: async (req, res) => {
        try {
            const idGrupo = parseInt(req.params.id_grupo, 10);
            const idEmisor = Number(req.usuario.id_usuario);
            const { mensaje = '', enviar_whatsapp = false } = req.body;
            const adjunto = construirAdjuntoMensaje(req.file);
            const textoLimpio = String(mensaje || '').trim();
            const quiereWhatsapp = aBooleano(enviar_whatsapp);

            if (!Number.isFinite(idGrupo)) {
                limpiarArchivoTemporal(req.file);
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const membresia = await Mensaje.esMiembroGrupo(idGrupo, idEmisor);
            if (!membresia) {
                limpiarArchivoTemporal(req.file);
                return res.status(403).json({ exito: false, mensaje: 'No perteneces a este grupo.' });
            }
            if (!textoLimpio && !adjunto) {
                limpiarArchivoTemporal(req.file);
                return res.status(400).json({ exito: false, mensaje: 'Escribe un mensaje o adjunta una foto o archivo antes de enviarlo.' });
            }

            const nuevoMsg = await Mensaje.enviarMensajeGrupo({
                id_grupo: idGrupo,
                id_emisor: idEmisor,
                mensaje: textoLimpio,
                adjunto
            });

            let resultadoWhatsapp = null;
            if (quiereWhatsapp) {
                const grupoDetalle = await Mensaje.obtenerGrupoPorId(idGrupo);
                const destinatariosWa = (grupoDetalle?.miembros || []).filter(
                    (m) => Number(m.id_usuario) !== idEmisor && Boolean(normalizarNumeroWhatsApp(m.telefono_whatsapp))
                );

                if (destinatariosWa.length === 0 && !grupoDetalle?.whatsapp_group_jid) {
                    resultadoWhatsapp = {
                        solicitado: true,
                        enviado: false,
                        codigo: 'SIN_NUMEROS_GRUPO',
                        mensaje: 'Guardado en el grupo, pero ningún otro integrante tiene WhatsApp registrado en Personal y Roles.'
                    };
                } else {
                    const estadoWa = obtenerEstadoWhatsApp(idEmisor, false);
                    if (!estadoWa.conectado) {
                        resultadoWhatsapp = {
                            solicitado: true,
                            enviado: false,
                            codigo: 'WHATSAPP_NO_CONECTADO',
                            mensaje: 'Guardado en el grupo. Tu cuenta aún no tiene vinculado su WhatsApp QR para enviarlo al grupo de WhatsApp.'
                        };
                    } else {
                        const resWaGrupo = await enviarMensajeGrupoWhatsApp(idEmisor, {
                            groupJid: grupoDetalle?.whatsapp_group_jid || null,
                            nombre: grupoDetalle?.nombre,
                            descripcion: grupoDetalle?.descripcion || '',
                            telefonosParticipantes: destinatariosWa.map((m) => m.telefono_whatsapp),
                            texto: textoLimpio,
                            adjunto
                        });

                        if (resWaGrupo.nuevoGroupJid) {
                            await Mensaje.asignarWhatsappGroupJid(idGrupo, resWaGrupo.nuevoGroupJid).catch(() => {});
                        }

                        const totalWa = Math.max(destinatariosWa.length, resWaGrupo.enviado ? 1 : 0);
                        const okCount = resWaGrupo.enviado ? totalWa : 0;
                        if (resWaGrupo.enviado) {
                            await Mensaje.marcarMensajeGrupoWhatsApp(nuevoMsg.id_mensaje_grupo, okCount, totalWa).catch(() => {});
                            nuevoMsg.enviado_whatsapp = true;
                            nuevoMsg.whatsapp_destinatarios_ok = okCount;
                            nuevoMsg.whatsapp_destinatarios_total = totalWa;
                        }

                        resultadoWhatsapp = {
                            solicitado: true,
                            enviado: Boolean(resWaGrupo.enviado),
                            codigo: resWaGrupo.codigo || null,
                            whatsapp_group_jid: resWaGrupo.groupJid || grupoDetalle?.whatsapp_group_jid || null,
                            grupo_creado_ahora: Boolean(resWaGrupo.creadoAhora),
                            enviados: okCount,
                            total_con_whatsapp: totalWa,
                            mensaje: resWaGrupo.mensaje
                        };
                    }
                }
            }

            return res.status(201).json({
                exito: true,
                mensaje: 'Mensaje enviado al grupo.',
                datos: nuevoMsg,
                ...(resultadoWhatsapp ? { whatsapp: resultadoWhatsapp } : {})
            });
        } catch (error) {
            limpiarArchivoTemporal(req.file);
            console.error('Error en enviarMensajeGrupo:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al enviar el mensaje al grupo.' });
        }
    },

    supervisarGrupos: async (req, res) => {
        try {
            if (req.usuario.nombre_rol !== 'Admin Central') {
                return res.status(403).json({ exito: false, mensaje: 'Acceso restringido únicamente al Admin Central.' });
            }
            const grupos = await Mensaje.supervisarGrupos();
            return res.status(200).json({ exito: true, datos: grupos });
        } catch (error) {
            console.error('Error en supervisarGrupos:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al cargar grupos en supervisión.' });
        }
    },

    supervisarGrupoDetalle: async (req, res) => {
        try {
            if (req.usuario.nombre_rol !== 'Admin Central') {
                return res.status(403).json({ exito: false, mensaje: 'Acceso restringido únicamente al Admin Central.' });
            }
            const idGrupo = parseInt(req.params.id_grupo, 10);
            if (!Number.isFinite(idGrupo)) {
                return res.status(400).json({ exito: false, mensaje: 'ID de grupo inválido.' });
            }
            const [grupo, mensajes] = await Promise.all([
                Mensaje.obtenerGrupoPorId(idGrupo),
                Mensaje.obtenerHistorialGrupo(idGrupo)
            ]);
            if (!grupo) {
                return res.status(404).json({ exito: false, mensaje: 'Grupo no encontrado.' });
            }
            return res.status(200).json({
                exito: true,
                modo_silencioso: true,
                grupo,
                datos: mensajes
            });
        } catch (error) {
            console.error('Error en supervisarGrupoDetalle:', error);
            return res.status(500).json({ exito: false, mensaje: 'Error al supervisar grupo.' });
        }
    }

};

module.exports = mensajeController;
