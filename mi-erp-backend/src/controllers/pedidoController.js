const Pedido = require('../models/pedidoModel');

const pedidoController = {

    //crear un nuevo pedido
    nuevoPedido: async (req, res) => {
        try {
            const { id_cliente, fecha_limite_despacho, items, solicitado_por, etiquetado, sellado_vacio } = req.body;
            const id_usuario = req.usuario.id_usuario; //viene del token seguro
            const id_ubicacion = req.usuario.id_ubicacion; //ubicacion del empleado

            if (!items || items.length === 0) {
                return res.status(400).json({ exito: false, mensaje: 'El pedido debe contener al menos un producto.' });
            }

            if (!id_cliente) {
                return res.status(400).json({ exito: false, mensaje: 'Debe seleccionar un cliente para el pedido.' });
            }

            //si es admin central, puede especificar una ubicacion en el body, sino usa la suya
            const ubicacionPedido = req.body.id_ubicacion || id_ubicacion;
            if (!ubicacionPedido) {
                return res.status(400).json({ exito: false, mensaje: 'Debe especificar una ubicación para el pedido.' });
            }

            const pedidoCreado = await Pedido.crearPedido(
                id_cliente, id_usuario, ubicacionPedido, fecha_limite_despacho, items, solicitado_por, etiquetado, sellado_vacio
            );

            res.status(201).json({
                exito: true,
                mensaje: 'Pedido creado exitosamente y stock reservado.',
                datos: pedidoCreado
            });

        } catch (error) {
            console.error('Error al crear pedido:', error);
            res.status(400).json({
                exito: false,
                mensaje: error.message || 'Error al procesar el pedido'
            });
        }
    },

    //obtener eventos para el calendario de logistica y despachos
    obtenerCalendarioLogistica: async (req, res) => {
        try {
            const { nombre_rol, id_ubicacion, id_usuario } = req.usuario;
            const pedidosCalendario = await Pedido.obtenerParaCalendario(id_ubicacion, nombre_rol, id_usuario);

            res.status(200).json({
                exito: true,
                cantidad: pedidosCalendario.length,
                eventos: pedidosCalendario
            });

        } catch (error) {
            console.error('Error en calendario de logística:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener los datos del calendario de pedidos'
            });
        }
    },

    marcarListoDespacho: async (req, res) => {
        try {
            const { id } = req.params;
            const pedido = await Pedido.marcarListoDespacho(id, req.usuario);
            res.status(200).json({
                exito: true,
                mensaje: 'Pedido marcado como listo para despacho.',
                pedido
            });
        } catch (error) {
            console.error('Error al marcar listo para despacho:', error);
            res.status(400).json({ exito: false, mensaje: error.message });
        }
    },

    marcarDespachado: async (req, res) => {
        try {
            const { id } = req.params;
            const pedido = await Pedido.marcarDespachado(id, req.usuario);
            res.status(200).json({
                exito: true,
                mensaje: 'Pedido marcado como despachado.',
                pedido
            });
        } catch (error) {
            console.error('Error al marcar despachado:', error);
            res.status(400).json({ exito: false, mensaje: error.message });
        }
    },

    cancelarPedido: async (req, res) => {
        try {
            const { id } = req.params;
            await Pedido.cancelarPedido(id, req.usuario);
            
            res.status(200).json({
                exito: true,
                mensaje: 'Pedido cancelado y stock liberado correctamente.'
            });
        } catch (error) {
            console.error('Error al cancelar:', error);
            res.status(400).json({ exito: false, mensaje: error.message });
        }
    }

};

module.exports = pedidoController;
