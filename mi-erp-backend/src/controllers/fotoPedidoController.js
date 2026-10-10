const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FotoPedido = require('../models/fotoPedidoModel');

// Asegurar que exista el directorio de almacenamiento
const uploadDir = path.join(__dirname, '../../uploads/pedidos');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const unico = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, unico);
    }
});

const fileFilter = (req, file, cb) => {
    // Permitir imágenes comunes (jpg, jpeg, png, webp, heic)
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, WebP, etc.).'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 30 * 1024 * 1024 } // Hasta 30MB por foto de celular en alta resolución
});

const fotoPedidoController = {

    middlewareSubida: upload.single('foto'),

    subirFoto: async (req, res) => {
        try {
            const { id } = req.params; // id_pedido
            const { descripcion } = req.body;
            const id_usuario = req.usuario?.id_usuario || null;

            if (!req.file) {
                return res.status(400).json({
                    exito: false,
                    mensaje: 'Debe adjuntar una foto tomada con la cámara o seleccionada de la galería.'
                });
            }

            const url_foto = `/uploads/pedidos/${req.file.filename}`;
            const nuevaFoto = await FotoPedido.agregarFoto(
                Number(id),
                id_usuario,
                url_foto,
                req.file.filename,
                descripcion || 'Foto adjunta al pedido'
            );

            res.status(201).json({
                exito: true,
                mensaje: 'Foto adjuntada al pedido con éxito. Se conservará durante 2 meses.',
                foto: nuevaFoto
            });
        } catch (error) {
            console.error('Error al subir foto de pedido:', error);
            res.status(500).json({
                exito: false,
                mensaje: error.message || 'Error al procesar la foto'
            });
        }
    },

    listarFotos: async (req, res) => {
        try {
            const { id } = req.params;
            const fotos = await FotoPedido.obtenerPorPedido(Number(id));
            res.status(200).json({
                exito: true,
                cantidad: fotos.length,
                fotos: fotos
            });
        } catch (error) {
            console.error('Error al listar fotos del pedido:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al obtener fotos del pedido',
                error: error.message
            });
        }
    },

    eliminarFoto: async (req, res) => {
        try {
            const { id_foto } = req.params;
            const eliminada = await FotoPedido.eliminarFoto(Number(id_foto));
            if (!eliminada) {
                return res.status(404).json({ exito: false, mensaje: 'Foto no encontrada.' });
            }
            res.status(200).json({
                exito: true,
                mensaje: 'Foto eliminada correctamente.'
            });
        } catch (error) {
            console.error('Error al eliminar foto:', error);
            res.status(500).json({
                exito: false,
                mensaje: 'Error al eliminar foto',
                error: error.message
            });
        }
    }

};

module.exports = fotoPedidoController;

