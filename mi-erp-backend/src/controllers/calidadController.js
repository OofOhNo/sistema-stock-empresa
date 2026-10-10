const Calidad = require('../models/calidadModel');
const pool = require('../config/db');
const { registrarAuditoria } = require('../utils/auditoria');

const calidadController = {
    listarCertificados: async (req, res) => {
        try {
            const certificados = await Calidad.obtenerTodos();
            res.status(200).json({
                exito: true,
                cantidad: certificados.length,
                datos: certificados
            });
        } catch (error) {
            console.error('Error al listar certificados de calidad:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al obtener certificados de calidad', error: error.message });
        }
    },

    crearCertificado: async (req, res) => {
        const {
            codigo_certificado,
            tipo_certificado,
            lote_o_producto,
            entidad_emisora,
            fecha_emision,
            fecha_vencimiento,
            estado,
            id_ubicacion,
            id_cliente,
            cliente_nombre,
            cliente_ruc,
            senasa_resolucion,
            ciudad_emision,
            items_detalle,
            archivo_url,
            observaciones
        } = req.body;

        const id_usuario = req.usuario.id_usuario;

        // Si viene con items_detalle, calcular fecha_vencimiento y lote_o_producto si faltan
        let fechaVencFinal = fecha_vencimiento;
        if (!fechaVencFinal && Array.isArray(items_detalle) && items_detalle.length > 0) {
            fechaVencFinal = items_detalle[0].fecha_vencimiento;
        }
        if (!fechaVencFinal) {
            // Default 1 año
            const fv = new Date();
            fv.setFullYear(fv.getFullYear() + 1);
            fechaVencFinal = fv.toISOString().split('T')[0];
        }

        const fechaEmisionFinal = fecha_emision || new Date().toISOString().split('T')[0];

        // Generar código único si no se envió
        const codigoFinal = codigo_certificado && codigo_certificado.trim() !== '' 
            ? codigo_certificado.trim() 
            : `CERT-${Date.now().toString().slice(-6)}`;

        try {
            // Validar unicidad de código
            const check = await pool.query('SELECT id_certificado FROM certificados_calidad WHERE LOWER(codigo_certificado) = LOWER($1)', [codigoFinal]);
            if (check.rows.length > 0) {
                return res.status(400).json({ exito: false, mensaje: 'Ya existe un certificado con este código.' });
            }

            const nuevo = await Calidad.crear({
                codigo_certificado: codigoFinal,
                tipo_certificado: tipo_certificado || 'Certificado de Calidad SENASA',
                lote_o_producto: lote_o_producto || (Array.isArray(items_detalle) ? items_detalle.map(i => `${i.producto} (${i.lote})`).join(', ') : null),
                entidad_emisora: entidad_emisora || 'PROCESOS CÁRNICOS S.A.C.',
                fecha_emision: fechaEmisionFinal,
                fecha_vencimiento: fechaVencFinal,
                estado: estado || 'VIGENTE',
                id_ubicacion: id_ubicacion ? Number(id_ubicacion) : null,
                id_usuario,
                id_cliente: id_cliente ? Number(id_cliente) : null,
                cliente_nombre: cliente_nombre || null,
                cliente_ruc: cliente_ruc || null,
                senasa_resolucion: senasa_resolucion || 'N° 000111-MINAGRI-SENASA-AREQUIPA',
                ciudad_emision: ciudad_emision || 'Arequipa',
                items_detalle: Array.isArray(items_detalle) ? items_detalle : [],
                archivo_url,
                observaciones
            });

            await registrarAuditoria(
                pool,
                id_usuario,
                'CREAR_CERTIFICADO_CALIDAD',
                'certificados_calidad',
                nuevo.id_certificado,
                null,
                nuevo
            );

            res.status(201).json({
                exito: true,
                mensaje: 'Certificado de calidad registrado correctamente.',
                certificado: nuevo
            });
        } catch (error) {
            console.error('Error al registrar certificado:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al registrar certificado', error: error.message });
        }
    },

    actualizarCertificado: async (req, res) => {
        const { id } = req.params;
        const datos = req.body;
        const id_usuario = req.usuario.id_usuario;

        try {
            const anterior = await Calidad.obtenerPorId(id);
            if (!anterior) {
                return res.status(404).json({ exito: false, mensaje: 'Certificado no encontrado.' });
            }

            const actualizado = await Calidad.actualizar(id, datos);

            await registrarAuditoria(
                pool,
                id_usuario,
                'ACTUALIZAR_CERTIFICADO_CALIDAD',
                'certificados_calidad',
                Number(id),
                anterior,
                actualizado
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Certificado actualizado correctamente.',
                certificado: actualizado
            });
        } catch (error) {
            console.error('Error al actualizar certificado:', error);
            res.status(500).json({ exito: false, mensaje: 'Error interno al actualizar certificado', error: error.message });
        }
    },

    eliminarCertificado: async (req, res) => {
        const { id } = req.params;
        const id_usuario = req.usuario.id_usuario;

        try {
            const anterior = await Calidad.obtenerPorId(id);
            if (!anterior) {
                return res.status(404).json({ exito: false, mensaje: 'Certificado no encontrado.' });
            }

            const eliminado = await Calidad.eliminar(id);

            await registrarAuditoria(
                pool,
                id_usuario,
                'ELIMINAR_CERTIFICADO_CALIDAD',
                'certificados_calidad',
                Number(id),
                anterior,
                null
            );

            res.status(200).json({
                exito: true,
                mensaje: 'Certificado eliminado correctamente.',
                certificado: eliminado
            });
        } catch (error) {
            console.error('Error al eliminar certificado:', error);
            res.status(500).json({ exito: false, mensaje: 'Error al eliminar certificado', error: error.message });
        }
    }
};

module.exports = calidadController;

