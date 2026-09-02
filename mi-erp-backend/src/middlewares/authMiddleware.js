const jwt = require('jsonwebtoken');

//guardia 1: verifica si la persona tiene una credencial (token)
const verificarToken = (req, res, next) => {
    //buscamos el token en las cabeceras (Headers) de la peticion
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ 
            exito: false, 
            mensaje: 'Acceso denegado. No enviaste un token de seguridad.' 
        });
    }

    try {
        //el formato suele ser "Bearer eyJhbGci...", así que le quitamos la palabra "Bearer "
        const tokenLimpio = token.replace('Bearer ', '');
        
        //verificamos que el token sea autentico usando tu JWT_SECRET del .env
        const decodificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        
        //guardamos los datos del usuario decodificado en la peticion para poder usarlos luego
        req.usuario = decodificado; 
        
        //le decimos que pase al siguiente nivel si esta todo en orden
        next(); 
    } catch (error) {
        res.status(400).json({ exito: false, mensaje: 'El token es inválido o ya expiró.' });
    }
};

//guardia 2: verifica si el rol del usuario es "Admin Central"
const esAdmin = (req, res, next) => {
    //cuando hagamos el login, guardaremos el nombre del rol dentro del token - aqui simplemente leemos esa informacion
    if (req.usuario.nombre_rol !== 'Admin Central') {
        return res.status(403).json({ 
            exito: false, 
            mensaje: 'Acceso prohibido. Se requieren permisos de Administrador.' 
        });
    }
    
    //si es Admin Central, lo dejamos pasar
    next();
};

module.exports = { verificarToken, esAdmin };