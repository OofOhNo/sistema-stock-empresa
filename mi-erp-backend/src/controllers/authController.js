const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Usuario = require('../models/usuarioModel');
const pool = require('../config/db');

const authController = {
    login: async (req, res) => {
        try {
            //recibimos el email y la contraseña que envio el usuario
            const { email, password } = req.body;
            const emailLimpio = email ? String(email).trim().toLowerCase() : '';
            console.log("1. Intentando iniciar sesión con email:", emailLimpio);

            //buscamos si el usuario existe en la base de datos
            const usuario = await Usuario.buscarPorEmail(emailLimpio);
            if (!usuario) {
                console.log("Usuario no encontrado en la BD");
                return res.status(401).json({ exito: false, mensaje: 'Email o contraseña incorrectos.' });
            }

            console.log("2. Usuario encontrado:", usuario.email);

            //comparamos la contraseña encriptada
            const passwordCorrecto = await bcrypt.compare(password, usuario.password_hash);
            if (!passwordCorrecto) {
                return res.status(401).json({ exito: false, mensaje: 'Email o contraseña incorrectos.' });
            }

            //si todo esta bien, creamos el Token (la credencial) - guardamos su ID, su email y su rol dentro del token
            const puedeVerCelulares = usuario.puede_ver_celulares === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
            const puedeVerOtrasUbicaciones = usuario.puede_ver_otras_ubicaciones === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
            const area = usuario.area || 'ADMINISTRACION';

            // Consultar matriz de permisos del rol
            const permisosMap = {};
            if (usuario.rol_id) {
                const resPerm = await pool.query(`
                    SELECT p.modulo, rp.puede_ver, rp.puede_editar
                    FROM roles_permisos rp
                    JOIN permisos p ON rp.permiso_id = p.id
                    WHERE rp.rol_id = $1
                `, [usuario.rol_id]);
                resPerm.rows.forEach(p => {
                    permisosMap[p.modulo] = { puede_ver: p.puede_ver, puede_editar: p.puede_editar };
                });
            }

            if (usuario.nombre_rol === 'Admin Central') {
                ['stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones', 'productos', 'ubicaciones', 'clientes', 'calidad', 'errores', 'organizacion', 'mensajes'].forEach(mod => {
                    permisosMap[mod] = { puede_ver: true, puede_editar: true };
                });
            }

            const datosToken = {
                id_usuario: usuario.id_usuario,
                email: usuario.email,
                nombre_rol: usuario.nombre_rol,
                id_ubicacion: usuario.id_ubicacion,
                nombre_ubicacion: usuario.nombre_ubicacion || 'Sede Central',
                puede_ver_celulares: puedeVerCelulares,
                puede_ver_otras_ubicaciones: puedeVerOtrasUbicaciones,
                area: area
            };

            //firmamos el token, expira en 8 horas
            const token = jwt.sign(datosToken, process.env.JWT_SECRET, { expiresIn: '8h' });

            //respondemos enviando el token al frontend
            res.status(200).json({
                exito: true,
                mensaje: 'Login exitoso',
                token: token,
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nombre: usuario.nombre_completo,
                    email: usuario.email,
                    rol: usuario.nombre_rol,
                    id_ubicacion: usuario.id_ubicacion,
                    nombre_ubicacion: usuario.nombre_ubicacion || 'Sede Central',
                    puede_ver_celulares: puedeVerCelulares,
                    puede_ver_otras_ubicaciones: puedeVerOtrasUbicaciones,
                    area: area,
                    permisos: permisosMap
                }
            });

        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno del servidor.', error: error.message });
        }
    },

    perfil: async (req, res) => {
        try {
            const usuario = await Usuario.buscarPorEmail(req.usuario.email);
            if (!usuario) {
                return res.status(404).json({ exito: false, mensaje: 'Usuario no encontrado.' });
            }
            const puedeVerCelulares = usuario.puede_ver_celulares === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
            const puedeVerOtrasUbicaciones = usuario.puede_ver_otras_ubicaciones === true || usuario.rol_id === 1 || usuario.nombre_rol === 'Admin Central';
            const area = usuario.area || 'ADMINISTRACION';

            // Consultar matriz de permisos del rol
            const permisosMap = {};
            if (usuario.rol_id) {
                const resPerm = await pool.query(`
                    SELECT p.modulo, rp.puede_ver, rp.puede_editar
                    FROM roles_permisos rp
                    JOIN permisos p ON rp.permiso_id = p.id
                    WHERE rp.rol_id = $1
                `, [usuario.rol_id]);
                resPerm.rows.forEach(p => {
                    permisosMap[p.modulo] = { puede_ver: p.puede_ver, puede_editar: p.puede_editar };
                });
            }

            if (usuario.nombre_rol === 'Admin Central') {
                ['stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones', 'productos', 'ubicaciones', 'clientes', 'calidad', 'errores', 'organizacion', 'mensajes'].forEach(mod => {
                    permisosMap[mod] = { puede_ver: true, puede_editar: true };
                });
            }

            res.status(200).json({
                exito: true,
                usuario: {
                    id_usuario: usuario.id_usuario,
                    nombre: usuario.nombre_completo,
                    email: usuario.email,
                    rol: usuario.nombre_rol,
                    id_ubicacion: usuario.id_ubicacion,
                    nombre_ubicacion: usuario.nombre_ubicacion || 'Sede Central',
                    puede_ver_celulares: puedeVerCelulares,
                    puede_ver_otras_ubicaciones: puedeVerOtrasUbicaciones,
                    area: area,
                    permisos: permisosMap
                }
            });
        } catch (error) {
            console.error('Error en perfil:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno del servidor.' });
        }
    }
};

module.exports = authController;