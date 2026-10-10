const Cliente = require('../models/clienteModel');

const clienteController = {

    listarClientes: async (req, res) => {
        try {
            // Verificar si el usuario tiene permiso para ver celulares
            // Admin Central siempre puede verlos, o si tiene asignado el flag granular puede_ver_celulares
            const puedeVerCelulares = req.usuario.nombre_rol === 'Admin Central' || req.usuario.puede_ver_celulares === true;

            const clientes = await Cliente.obtenerTodos(puedeVerCelulares);
            res.status(200).json({
                exito: true,
                cantidad: clientes.length,
                puede_ver_celulares: puedeVerCelulares,
                datos: clientes
            });
        } catch (error) {
            console.error('Error al listar clientes:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener la lista de clientes',
                error: error.message
            });
        }
    },

    crearCliente: async (req, res) => {
        try {
            const nuevoCliente = await Cliente.crearCliente(req.body, req.usuario.id_usuario);
            res.status(201).json({
                exito: true,
                mensaje: 'Cliente registrado con éxito.',
                datos: nuevoCliente
            });
        } catch (error) {
            console.error('Error al crear cliente:', error);
            res.status(400).json({
                exito: false,
                mensaje: error.message || 'Error al registrar el cliente'
            });
        }
    },

    actualizarCliente: async (req, res) => {
        try {
            const { id } = req.params;
            const clienteActualizado = await Cliente.actualizarCliente(id, req.body, req.usuario.id_usuario);
            res.status(200).json({
                exito: true,
                mensaje: 'Cliente actualizado correctamente.',
                datos: clienteActualizado
            });
        } catch (error) {
            console.error('Error al actualizar cliente:', error);
            res.status(400).json({
                exito: false,
                mensaje: error.message || 'Error al actualizar el cliente'
            });
        }
    }

};

module.exports = clienteController;

