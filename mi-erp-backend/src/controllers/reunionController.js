const pool = require('../config/db');
const Reunion = require('../models/reunionModel');
const { registrarAuditoria } = require('../utils/auditoria');

function resolverNivelUsuario(usuario = {}) {
    if (usuario.nombre_rol === 'Admin Central') return 1;
    const nivel = Number(usuario.nivel_jerarquia);
    return Number.isFinite(nivel) && nivel >= 1 ? nivel : 4;
}

function usuarioPuedeVerReunion(reunion, usuario) {
    const idUser = Number(usuario.id_usuario);
    const nivelLector = resolverNivelUsuario(usuario);
    if (Number(reunion.id_organizador) === idUser) return true;
    const asistentes = Array.isArray(reunion.asistentes) ? reunion.asistentes : [];
    if (asistentes.some((a) => Number(a.id_usuario) === idUser)) return true;
    if (reunion.es_general_nivel && nivelLector >= Number(reunion.organizador_nivel || 4)) {
        if (reunion.alcance === 'general') return true;
        if (reunion.alcance === 'ubicacion' && usuario.id_ubicacion && Number(reunion.id_ubicacion) === Number(usuario.id_ubicacion)) {
            return true;
        }
    }
    return false;
}

function validarDatosComunesReunion({ titulo, fecha_hora_inicio, fecha_hora_fin }) {
    if (!titulo || !String(titulo).trim() || !fecha_hora_inicio || !fecha_hora_fin) {
        return 'Faltan datos obligatorios: Título, Fecha/Hora de Inicio y Fecha/Hora de Fin.';
    }
    const ini = new Date(fecha_hora_inicio);
    const fin = new Date(fecha_hora_fin);
    if (Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime())) {
        return 'Las fechas y horas enviadas no tienen un formato válido.';
    }
    if (fin <= ini) {
        return 'La fecha y hora de finalización debe ser posterior a la hora de inicio.';
    }
    return null;
}

const reunionController = {
    listarInvitables: async (req, res) => {
        try {
            const miNivel = resolverNivelUsuario(req.usuario);
            const [usuarios, salasRes] = await Promise.all([
                Reunion.obtenerUsuariosInvitables(miNivel),
                pool.query('SELECT id_sala, nombre, capacidad, id_ubicacion FROM salas_reunion WHERE COALESCE(activa, true) = true ORDER BY nombre ASC').catch(() => ({ rows: [] }))
            ]);

            return res.status(200).json({
                exito: true,
                mi_nivel: miNivel,
                usuarios,
                salas: salasRes.rows
            });
        } catch (error) {
            console.error('Error al listar usuarios invitables:', error);
            return res.status(500).json({
                exito: false,
                mensaje: 'No se pudo cargar la lista de usuarios invitables.'
            });
        }
    },

    crearReunion: async (req, res) => {
        const {
            titulo,
            descripcion,
            fecha_hora_inicio,
            fecha_hora_fin,
            id_sala,
            alcance,
            id_ubicacion,
            enlace_videollamada,
            id_pedido_relacionado,
            tipo_evento,
            es_general_nivel,
            temas_objetivos,
            asistentes_ids
        } = req.body;

        const id_organizador = req.usuario.id_usuario;
        const miNivel = resolverNivelUsuario(req.usuario);

        const errorValidacion = validarDatosComunesReunion({ titulo, fecha_hora_inicio, fecha_hora_fin });
        if (errorValidacion) {
            return res.status(400).json({ exito: false, mensaje: errorValidacion });
        }

        try {
            const esGeneral = Boolean(es_general_nivel);
            const asistentesLimpios = Reunion.limpiarAsistentesIds(asistentes_ids);
            if (!esGeneral && asistentesLimpios.length === 0) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Selecciona al menos un participante o activa "Visible para mi nivel o inferior".'
                });
            }

            const checkJerarquia = await Reunion.validarInvitadosJerarquia(asistentesLimpios, miNivel);
            if (!checkJerarquia.valido) {
                return res.status(checkJerarquia.status || 403).json({
                    exito: false,
                    mensaje: checkJerarquia.mensaje
                });
            }

            if (id_sala) {
                const libre = await Reunion.verificarDisponibilidadSala(id_sala, fecha_hora_inicio, fecha_hora_fin);
                if (!libre) {
                    return res.status(409).json({
                        exito: false,
                        mensaje: 'La sala seleccionada ya está reservada en ese horario. Elige otra sala u horario.'
                    });
                }
            }

            const alcanceFinal = esGeneral
                ? (alcance === 'ubicacion' ? 'ubicacion' : 'general')
                : 'invitados';

            if (alcanceFinal === 'ubicacion' && !id_ubicacion && !req.usuario.id_ubicacion) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Debes indicar la sede correspondiente cuando el alcance es por sede.'
                });
            }

            const nuevaReunion = await Reunion.crearReunion({
                titulo: String(titulo).trim(),
                descripcion: descripcion ? String(descripcion).trim() : null,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_organizador,
                id_sala: id_sala ? parseInt(id_sala, 10) : null,
                id_ubicacion: alcanceFinal === 'ubicacion'
                    ? (id_ubicacion ? parseInt(id_ubicacion, 10) : req.usuario.id_ubicacion)
                    : null,
                alcance: alcanceFinal,
                enlace_videollamada: enlace_videollamada ? String(enlace_videollamada).trim() : null,
                id_pedido_relacionado: id_pedido_relacionado ? parseInt(id_pedido_relacionado, 10) : null,
                tipo_evento: tipo_evento === 'imprevisto' ? 'imprevisto' : 'reunion',
                es_general_nivel: esGeneral,
                temas_objetivos: Reunion.normalizarTemasObjetivos(temas_objetivos),
                asistentes_ids: checkJerarquia.ids
            });

            await registrarAuditoria(
                pool,
                id_organizador,
                'CREAR_REUNION',
                'reuniones',
                nuevaReunion.id_reunion,
                null,
                {
                    titulo: nuevaReunion.titulo,
                    tipo_evento: nuevaReunion.tipo_evento,
                    asistentes_count: checkJerarquia.ids.length,
                    temas_count: (nuevaReunion.temas_objetivos || []).length
                }
            );

            return res.status(201).json({
                exito: true,
                mensaje: 'Reunión programada correctamente.',
                reunion: nuevaReunion
            });
        } catch (error) {
            console.error('Error al crear reunión:', error);
            return res.status(500).json({
                exito: false,
                mensaje: 'Error interno al guardar la reunión',
                error: error.message
            });
        }
    },

    actualizarReunion: async (req, res) => {
        const idReunion = parseInt(req.params.id, 10);
        if (!Number.isFinite(idReunion) || idReunion <= 0) {
            return res.status(400).json({ exito: false, mensaje: 'ID de reunión inválido.' });
        }

        const {
            titulo,
            descripcion,
            fecha_hora_inicio,
            fecha_hora_fin,
            id_sala,
            alcance,
            id_ubicacion,
            enlace_videollamada,
            tipo_evento,
            es_general_nivel,
            temas_objetivos,
            asistentes_ids,
            estado
        } = req.body;

        const errorValidacion = validarDatosComunesReunion({ titulo, fecha_hora_inicio, fecha_hora_fin });
        if (errorValidacion) {
            return res.status(400).json({ exito: false, mensaje: errorValidacion });
        }

        try {
            const actual = await Reunion.obtenerPorId(idReunion);
            if (!actual) {
                return res.status(404).json({ exito: false, mensaje: 'Reunión no encontrada.' });
            }

            if (!usuarioPuedeVerReunion(actual, req.usuario)) {
                return res.status(403).json({ exito: false, mensaje: 'No tienes acceso a esta reunión.' });
            }

            const esOrganizador = Number(actual.id_organizador) === Number(req.usuario.id_usuario);
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            if (!esOrganizador && !esAdminCentral) {
                return res.status(403).json({
                    exito: false,
                    mensaje: 'Solo el organizador de la reunión o el Admin Central pueden editarla.'
                });
            }

            if (Number(actual.minutos_para_inicio) < 10) {
                return res.status(400).json({
                    exito: false,
                    codigo: 'VENTANA_EDICION_CERRADA',
                    mensaje: 'El tiempo límite de edición expiró: las reuniones solo pueden editarse como máximo hasta 10 minutos antes de iniciar.'
                });
            }

            const miNivel = resolverNivelUsuario(req.usuario);
            const esGeneral = Boolean(es_general_nivel);
            const asistentesLimpios = Reunion.limpiarAsistentesIds(asistentes_ids);
            if (!esGeneral && asistentesLimpios.length === 0) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Selecciona al menos un participante o activa "Visible para mi nivel o inferior".'
                });
            }

            const checkJerarquia = await Reunion.validarInvitadosJerarquia(asistentesLimpios, miNivel);
            if (!checkJerarquia.valido) {
                return res.status(checkJerarquia.status || 403).json({
                    exito: false,
                    mensaje: checkJerarquia.mensaje
                });
            }

            if (id_sala) {
                const libre = await Reunion.verificarDisponibilidadSala(id_sala, fecha_hora_inicio, fecha_hora_fin, idReunion);
                if (!libre) {
                    return res.status(409).json({
                        exito: false,
                        mensaje: 'La sala seleccionada ya está reservada en ese horario.'
                    });
                }
            }

            const alcanceFinal = esGeneral
                ? (alcance === 'ubicacion' ? 'ubicacion' : 'general')
                : 'invitados';

            const resultado = await Reunion.actualizarReunion(idReunion, {
                titulo: String(titulo).trim(),
                descripcion: descripcion ? String(descripcion).trim() : null,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_sala: id_sala ? parseInt(id_sala, 10) : null,
                id_ubicacion: alcanceFinal === 'ubicacion'
                    ? (id_ubicacion ? parseInt(id_ubicacion, 10) : actual.id_ubicacion)
                    : null,
                alcance: alcanceFinal,
                enlace_videollamada: enlace_videollamada ? String(enlace_videollamada).trim() : null,
                tipo_evento: tipo_evento === 'imprevisto' ? 'imprevisto' : 'reunion',
                es_general_nivel: esGeneral,
                temas_objetivos: Reunion.normalizarTemasObjetivos(temas_objetivos),
                asistentes_ids: checkJerarquia.ids,
                estado: estado || actual.estado
            });

            if (!resultado.ok) {
                return res.status(resultado.status || 400).json({
                    exito: false,
                    codigo: resultado.codigo,
                    mensaje: resultado.mensaje
                });
            }

            await registrarAuditoria(
                pool,
                req.usuario.id_usuario,
                'EDITAR_REUNION',
                'reuniones',
                idReunion,
                { titulo: actual.titulo, fecha_hora_inicio: actual.fecha_hora_inicio, estado: actual.estado },
                { titulo: resultado.reunion.titulo, fecha_hora_inicio: resultado.reunion.fecha_hora_inicio, estado: resultado.reunion.estado }
            );

            return res.status(200).json({
                exito: true,
                mensaje: 'Reunión actualizada correctamente.',
                reunion: resultado.reunion
            });
        } catch (error) {
            console.error('Error al actualizar reunión:', error);
            return res.status(500).json({
                exito: false,
                mensaje: 'Error interno al actualizar la reunión.',
                error: error.message
            });
        }
    },

    listarReuniones: async (req, res) => {
        try {
            const miNivel = resolverNivelUsuario(req.usuario);
            const reuniones = await Reunion.obtenerReuniones({
                id_usuario: req.usuario.id_usuario,
                id_ubicacion: req.usuario.id_ubicacion,
                nivel_jerarquia: miNivel
            });

            return res.status(200).json({
                exito: true,
                mi_nivel: miNivel,
                cantidad: reuniones.length,
                eventos: reuniones
            });
        } catch (error) {
            console.error('Error al listar reuniones:', error);
            return res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener la agenda de reuniones y avisos'
            });
        }
    }
};

module.exports = reunionController;
