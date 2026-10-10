const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');

const authController = {
    login: async (req, res) => {
        try {
            //recibimos el email y la contraseña que envio el usuario
            const { email, password } = req.body;
            console.log("1. Intentando iniciar sesión con email:", email);

            //buscamos si el usuario existe en la base de datos
            const usuario = await Usuario.buscarPorEmail(email);
            if (!usuario) {
                console.log("Usuario no encontrado en la BD");
                return res.status(401).json({ exito: false, mensaje: 'Email o contraseña incorrectos.' });
            }

            console.log("2. Usuario encontrado:", usuario.email);

            //comparamos la contraseña encriptada (!!NUNCA!! guardar contraseñas en texto plano (algo aaprendi en ciberseguridad xd))
            const passwordCorrecto = await bcrypt.compare(password, usuario.password_hash);
            console.log("3. ¿Contraseña correcta?:", passwordCorrecto);
            if (!passwordCorrecto) {
                return res.status(401).json({ exito: false, mensaje: 'Email o contraseña incorrectos.' });
            }

            //si todo esta bien, creamos el Token (la credencial) - guardamos su ID, su email y su rol dentro del token
            const datosToken = {
                id_usuario: usuario.id_usuario,
                email: usuario.email,
                nombre_rol: usuario.nombre_rol,
                id_ubicacion: usuario.id_ubicacion
            };

            //firmamos el token, expira en 8 horas
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: '8h' });

            //respondemos enviando el token al frontend
            res.status(200).json({
                exito: true,
                mensaje: 'Login exitoso',
                token: token, //la llave
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nombre: usuario.nombre_completo,
                    rol: usuario.nombre_rol,
                    id_ubicacion: usuario.id_ubicacion
                }
            });

        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno del servidor.', error: error.message });
        }
    }
};

module.exports = authController;