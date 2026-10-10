const Cliente = require('../models/clienteModel');

const clienteController = {

    listarClientes: async (req, res) => {
        try {
            const esAdminCentral = req.usuario.nombre_rol === 'Admin Central';
            const clientes = await Cliente.obtenerTodos(req.usuario.id_usuario, esAdminCentral);
            res.status(200).json({
                exito: true,
                cantidad: clientes.length,
                es_admin: esAdminCentral,
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
    },

    obtenerPermisosCelularUsuario: async (req, res) => {
        try {
            const { id_usuario } = req.params;
            const clientesPermitidos = await Cliente.obtenerPermisosCelularUsuario(Number(id_usuario));
            res.status(200).json({
                exito: true,
                id_usuario: Number(id_usuario),
                clientes_permitidos: clientesPermitidos
            });
        } catch (error) {
            console.error('Error al obtener permisos de celular del usuario:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener permisos de celulares',
                error: error.message
            });
        }
    },

    actualizarPermisosCelularUsuario: async (req, res) => {
        try {
            const { id_usuario } = req.params;
            const { clientes_ids } = req.body;
            await Cliente.actualizarPermisosCelularUsuario(
                Number(id_usuario),
                clientes_ids || [],
                req.usuario.id_usuario
            );
            res.status(200).json({
                exito: true,
                mensaje: 'Permisos de visualización de celulares actualizados correctamente.'
            });
        } catch (error) {
            console.error('Error al actualizar permisos de celular del usuario:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al actualizar permisos',
                error: error.message
            });
        }
    }

};

module.exports = clienteController;
