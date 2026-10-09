const Usuario = require('../models/usuarioModel');

const usuarioController = {

    listarUsuarios: async (req, res) => {
        try {
            // le pedimos al modelo que busque los datos
            const usuarios = await Usuario.obtenerTodos();
            
            // respondemos al frontend (React) con un JSON exitoso
            res.status(200).json({
                exito: true,
                cantidad: usuarios.length,
                datos: usuarios // <-- IMPORTANTE: lo enviamos como "datos"
            });

        } catch (error) {
            console.error('Error en listarUsuarios:', error);
            // si algo salio mal, enviamos un mensaje de error claro
            res.status(500).json({
                exito: false,
                mensaje: 'Ocurrio un error al intentar obtener los usuarios',
                error: error.message
            });
        }
    },

    cambiarRol: async (req, res) => {
        const { id_usuario } = req.params;
        const { nuevo_rol } = req.body;
        const adminSolicitante = req.usuario; // el usuario que hace la peticion (desde el token)

        // validacion estricta: solo el Admin Central puede cambiar roles
        if (adminSolicitante.nombre_rol !== 'Admin Central') {
            return res.status(403).json({ exito: false, mensaje: "Acceso denegado. Solo un Administrador puede cambiar roles." });
        }

        try {
            // usamos el modelo para actualizar en la DB
            await Usuario.cambiarRol(id_usuario, nuevo_rol);
            
            res.status(200).json({ 
                exito: true, 
                mensaje: `Rol actualizado correctamente a ${nuevo_rol}.` 
            });
        } catch (error) {
            console.error("Error al actualizar rol:", error);
            res.status(500).json({ exito: false, mensaje: "Error al modificar los permisos." });
        }
    }

};

module.exports = usuarioController;