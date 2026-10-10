const Stock = require('../models/stockModel');

const stockController = {

    verInventario: async (req, res) => {
        try {
            const { nombre_rol, id_ubicacion, puede_ver_otras_ubicaciones } = req.usuario;
            const puedeVerTodo = nombre_rol === 'Admin Central' || puede_ver_otras_ubicaciones === true;

            // 1. Stock consolidado por producto:
            // Si tiene acceso global (Admin o rol con multi-sede), ve el consolidado de toda la empresa.
            // Si es un empleado sin multi-sede, ve únicamente el stock de su ubicación asignada.
            const stockTotal = puedeVerTodo 
                ? await Stock.obtenerStockGlobal() 
                : (id_ubicacion ? await Stock.obtenerStockPorUbicacion(id_ubicacion) : []);

            // 2. Stock por ubicación
            let stockPorUbicacion = [];
            const idUbicacionFiltro = req.query.id_ubicacion || req.query.ubicacion;

            if (puedeVerTodo) {
                if (idUbicacionFiltro) {
                    stockPorUbicacion = await Stock.obtenerStockPorUbicacion(idUbicacionFiltro);
                } else {
                    stockPorUbicacion = await Stock.obtenerStockPorTodasUbicaciones();
                }
            } else {
                // Empleado sin permiso de otras sedes: SOLO su ubicación asignada
                if (id_ubicacion) {
                    stockPorUbicacion = await Stock.obtenerStockPorUbicacion(id_ubicacion);
                } else {
                    stockPorUbicacion = [];
                }
            }

            const nombreUbicacionUsuario = req.usuario.nombre_ubicacion || stockPorUbicacion[0]?.nombre_ubicacion || 'Mi Sede';

            res.status(200).json({
                exito: true,
                puede_ver_otras_ubicaciones: puedeVerTodo,
                id_ubicacion_usuario: id_ubicacion,
                nombre_ubicacion_usuario: nombreUbicacionUsuario,
                stock_total: stockTotal,
                stock_por_ubicacion: stockPorUbicacion,
                cantidad: stockTotal.length,
                datos: stockTotal
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