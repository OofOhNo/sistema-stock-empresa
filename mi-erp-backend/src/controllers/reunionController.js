const Reunion = require('../models/reunionModel');

const reunionController = {

    crearReunion: async (req, res) => {
        try {
            const {
                titulo,
                descripcion,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_sala,
                id_ubicacion,
                alcance,
                enlace_videollamada,
                id_pedido_relacionado,
                asistentes
            } = req.body;
            const id_organizador = req.usuario.id_usuario;

            if (!titulo || !String(titulo).trim()) {
                return res.status(400).json({ exito: false, mensaje: 'Escribe un título para el aviso o reunión.' });
            }
            if (!fecha_hora_inicio || !fecha_hora_fin) {
                return res.status(400).json({ exito: false, mensaje: 'Selecciona la fecha y hora de inicio y fin.' });
            }

            if (id_sala) {
                const salaDisponible = await Reunion.verificarDisponibilidadSala(id_sala, fecha_hora_inicio, fecha_hora_fin);
                if (!salaDisponible) {
                    return res.status(400).json({ 
                        exito: false, 
                        mensaje: 'La sala ya está ocupada en ese horario.' 
                    });
                }
            }

            const datosReunion = {
                titulo: String(titulo).trim(),
                descripcion: descripcion || null,
                fecha_hora_inicio,
                fecha_hora_fin,
                id_organizador,
                id_sala: id_sala ? Number(id_sala) : null,
                id_ubicacion: id_ubicacion ? Number(id_ubicacion) : null,
                alcance: alcance || (id_ubicacion ? 'ubicacion' : 'general'),
                enlace_videollamada: enlace_videollamada || null,
                id_pedido_relacionado: id_pedido_relacionado || null
            };

            const nuevaReunion = await Reunion.crearReunion(datosReunion, asistentes);

            res.status(201).json({
                exito: true,
                mensaje: 'Reunión o aviso programado con éxito.',
                datos: nuevaReunion
            });

        } catch (error) {
            console.error('Error al crear reunión:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error interno al guardar la reunión',
                error: error.message
            });
        }
    },

    listarReuniones: async (req, res) => {
        try {
            const { id_usuario, nombre_rol, id_ubicacion, puede_ver_otras_ubicaciones } = req.usuario;
            const reuniones = await Reunion.obtenerReuniones(id_usuario, nombre_rol, id_ubicacion, puede_ver_otras_ubicaciones);

            res.status(200).json({
                exito: true,
                cantidad: reuniones.length,
                eventos: reuniones
            });

        } catch (error) {
            console.error('Error al listar reuniones:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener la agenda de reuniones y avisos'
            });
        }
    }

};

module.exports = reunionController;
