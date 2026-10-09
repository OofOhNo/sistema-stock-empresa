const Stock = require('../models/stockModel');

const stockController = {

    verInventario: async (req, res) => {
        try {
            //el middleware de autenticacion guardo los datos del usuario en req.usuario
            const { nombre_rol, id_ubicacion } = req.usuario;

            let inventario;

            //si es Admin Central, puede ver el consolidado global o filtrar
            if (nombre_rol === 'Admin Central') {
                //si el jefe pasa un ?ubicacion=X en la URL, filtramos por esa ubicacion, sino global
                const ubicacionQuery = req.query.ubicacion;
                
                if (ubicacionQuery) {
                    inventario = await Stock.obtenerStockPorUbicacion(ubicacionQuery);
                } else {
                    inventario = await Stock.obtenerStockGlobal();
                }
            } else {
                //si es un empleado o jefe de division, SOLO puede ver el stock de su propia ubicacion asignada
                if (!id_ubicacion) {
                    return res.status(403).json({ 
                        exito: false, 
                        mensaje: 'No tienes una ubicacion asignada para ver el inventario.' 
                    });
                }
                inventario = await Stock.obtenerStockPorUbicacion(id_ubicacion);
            }

            res.status(200).json({
                exito: true,
                cantidad: inventario.length,
                datos: inventario
            });

        } catch (error) {
            console.error('Error en verInventario:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener el inventario',
                error: error.message
            });
        }
    }

};

module.exports = stockController;