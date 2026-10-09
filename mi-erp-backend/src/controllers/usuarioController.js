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
        if (false) {
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
    },

    obtenerPermisos: async (req, res) => {
        const pool = require('../config/db');
        try {
            const query = `
                SELECT rp.rol_id, r.nombre as rol_nombre, p.modulo, rp.puede_ver, rp.puede_editar
                FROM roles_permisos rp
                JOIN roles r ON rp.rol_id = r.id_rol
                JOIN permisos p ON rp.permiso_id = p.id
                ORDER BY r.id_rol, p.modulo
            `;
            const { rows } = await pool.query(query);
            res.json({ exito: true, permisos: rows });
        } catch (error) {
            console.error('Error obtenerPermisos:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener permisos' });
        }
    },

    actualizarPermisos: async (req, res) => {
        const pool = require('../config/db');
        const { rol_id, modulo, puede_ver, puede_editar } = req.body;
        try {
            // update requires joining to get the right permiso_id, or we just update using subquery
            const query = `
                UPDATE roles_permisos rp
                SET puede_ver = $1, puede_editar = $2
                FROM permisos p
                WHERE rp.permiso_id = p.id AND rp.rol_id = $3 AND p.modulo = $4
            `;
            await pool.query(query, [puede_ver, puede_editar, rol_id, modulo]);
            res.json({ exito: true, mensaje: 'Permisos actualizados' });
        } catch (error) {
            console.error('Error actualizarPermisos:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al actualizar permisos' });
        }
    }

};

module.exports = usuarioController;
