const pool = require('../config/db');

//objeto que contendra todas nuestras funciones para usuarios
const Usuario = {
    
    //funcion para obtener todos los usuarios (y traer el nombre de su rol usando un JOIN)
    obtenerTodos: async () => {
        try {
            const query = `
                SELECT 
                    u.id_usuario, 
                    u.nombre_completo, 
                    u.email, 
                    u.sucursal_id,
                    r.nombre AS nombre_rol, -- Usamos 'AS' para que en el JSON salga bonito
                    u.creado_en
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol; -- ¡AQUÍ ESTABA EL ERROR CORREGIDO!
            `;
            //ejecutamos la consulta en la base de datos
            const resultado = await pool.query(query);
            
            //retornamos las filas encontradas
            return resultado.rows; 
        } catch (error) {
            //si la base de datos falla, lanzamos el error hacia arriba (al controlador)
            throw error;
        }
    },

    cambiarRol: async (id_usuario, nuevo_rol) => {
        try {
            const query = "UPDATE usuarios SET rol_id = (SELECT id_rol FROM roles WHERE nombre = $1) WHERE id_usuario = $2";
            await pool.query(query, [nuevo_rol, id_usuario]);
            return true;
        } catch (error) {
            throw error;
        }
    },

    buscarPorEmail: async (email) => {
        try {
            const query = `
                SELECT 
                    u.*, 
                    r.nombre AS nombre_rol 
                FROM usuarios u
                LEFT JOIN roles r ON u.rol_id = r.id_rol
                WHERE u.email = $1;
            `;
            //el $1 se reemplaza de forma segura por el email que pasamos
            const resultado = await pool.query(query, [email]);
            
            //retornamos el primer usuario que coincida (o undefined si no existe)
            return resultado.rows[0]; 
        } catch (error) {
            throw error;
        }
    }

};

module.exports = Usuario;

