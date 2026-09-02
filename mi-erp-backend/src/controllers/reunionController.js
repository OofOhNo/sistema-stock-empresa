const Reunion = require('../models/reunionModel');

const reunionController = {

    crearReunion: async (req, res) => {
        try {
            const { titulo, descripcion, fecha_hora_inicio, fecha_hora_fin, id_sala, enlace_videollamada, id_pedido_relacionado, asistentes } = req.body;
            const id_organizador = req.usuario.id_usuario; // Viene del token

            //validar que la sala este libre en ese horario (si aplica)
            if (id_sala) {
                const salaDisponible = await Reunion.verificarDisponibilidadSala(id_sala, fecha_hora_inicio, fecha_hora_fin);
                if (!salaDisponible) {
                    return res.status(400).json({ 
                        exito: false, 
                        mensaje: 'La sala de reuniones ya está ocupada en ese rango horario.' 
                    });
                }
            }

            //crear la reunion
            const datosReunion = {
                titulo, descripcion, fecha_hora_inicio, fecha_hora_fin, 
                id_organizador, id_sala, enlace_videollamada, id_pedido_relacionado
            };

            const nuevaReunion = await Reunion.crearReunion(datosReunion, asistentes);

            res.status(201).json({
                exito: true,
                mensaje: 'Reunión programada exitosamente.',
                datos: nuevaReunion
            });

        } catch (error) {
            console.error('Error al crear reunión:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error interno al programar la reunión',
                error: error.message
            });
        }
    },

    listarReuniones: async (req, res) => {
        try {
            const { id_usuario, nombre_rol } = req.usuario;
            const reuniones = await Reunion.obtenerReuniones(id_usuario, nombre_rol);

            res.status(200).json({
                exito: true,
                cantidad: reuniones.length,
                eventos: reuniones
            });

        } catch (error) {
            console.error('Error al listar reuniones:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener el calendario de reuniones'
            });
        }
    }

};

module.exports = reunionController;