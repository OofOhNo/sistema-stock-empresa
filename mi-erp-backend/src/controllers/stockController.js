const Stock = require('../models/stockModel');

const stockController = {

    verInventario: async (req, res) => {
        try {
            const { nombre_rol, id_ubicacion } = req.usuario;

            let inventario;

            if (nombre_rol === 'Admin Central') {
                const ubicacionQuery = req.query.ubicacion || req.query.id_ubicacion;
                if (ubicacionQuery) {
                    inventario = await Stock.obtenerStockPorUbicacion(ubicacionQuery);
                } else {
                    inventario = await Stock.obtenerStockGlobal();
                }
            } else {
                if (!id_ubicacion) {
                    return res.status(403).json({ 
                        exito: false, 
                        mensaje: 'No tienes una ubicación asignada para ver el inventario.' 
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
    },

    // REGLA DE NEGOCIO ETAPA 4: Endpoint de alertas de stock mínimo
    obtenerAlertas: async (req, res) => {
        try {
            const { nombre_rol, id_ubicacion } = req.usuario;
            const ubicacionFiltro = (nombre_rol === 'Admin Central') 
                ? (req.query.id_ubicacion || null) 
                : id_ubicacion;

            const alertas = await Stock.obtenerAlertasStockMinimo(ubicacionFiltro);

            res.status(200).json({
                exito: true,
                cantidad: alertas.length,
                alertas: alertas
            });
        } catch (error) {
            console.error('Error en obtenerAlertas:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener alertas de stock mínimo',
                error: error.message
            });
        }
    }

};

module.exports = stockController;