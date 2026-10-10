const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('./src/config/db'); //solo con importarlo, se conecta a la BD

const app = express();

// Asegurar carpeta de uploads
const uploadsDir = path.join(__dirname, 'uploads/pedidos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Servir archivos estáticos de subida (fotos de pedidos y evidencias)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//middlewares globales (para que el servidor entienda JSON y acepte peticiones)
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

//ruta de prueba para ver si el servidor responde
app.get('/', (req, res) => {
  res.json({ mensaje: 'El backend del ERP está funcionando' });
});

//importamos rutas de usuarios
const usuarioRoutes = require('./src/routes/usuarioRoutes.js');
//le decimos a Express: "cualquier peticion que empiece con /api/usuarios, mandala a este archivo de rutas"
app.use('/api/usuarios', usuarioRoutes);

//rutas de autenticacion
const authRoutes = require('./src/routes/authRoutes.js');
app.use('/api/auth', authRoutes);

//rutas de stock
const stockRoutes = require('./src/routes/stockRoutes.js');
app.use('/api/stock', stockRoutes);

//rutas pedidos
const pedidoRoutes = require('./src/routes/pedidoRoutes.js');
app.use('/api/pedidos', pedidoRoutes);

//rutas reuniones
const reunionRoutes = require('./src/routes/reunionRoutes.js');
app.use('/api/reuniones', reunionRoutes);

//rutas facturacion
const facturaRoutes = require('./src/routes/facturaRoutes.js');
app.use('/api/facturacion', facturaRoutes);

//ruta kardex
const kardexRoutes = require('./src/routes/kardexRoutes.js');
app.use('/api/kardex', kardexRoutes);

//rutas productos
const productoRoutes = require('./src/routes/productoRoutes.js');
app.use('/api/productos', productoRoutes);

//rutas ubicaciones
const ubicacionRoutes = require('./src/routes/ubicacionRoutes.js');
app.use('/api/ubicaciones', ubicacionRoutes);

//rutas auditoria
const auditoriaRoutes = require('./src/routes/auditoriaRoutes.js');
app.use('/api/auditoria', auditoriaRoutes);

//rutas clientes
const clienteRoutes = require('./src/routes/clienteRoutes.js');
app.use('/api/clientes', clienteRoutes);

//rutas calidad y certificados
const calidadRoutes = require('./src/routes/calidadRoutes.js');
app.use('/api/calidad', calidadRoutes);

//rutas reportes de errores
const errorRoutes = require('./src/routes/errorRoutes.js');
app.use('/api/errores', errorRoutes);

//rutas organizacion y gerentes de sitio
const organizacionRoutes = require('./src/routes/organizacionRoutes.js');
app.use('/api/organizacion', organizacionRoutes);

//rutas busqueda global
const busquedaRoutes = require('./src/routes/busquedaRoutes.js');
app.use('/api/busqueda', busquedaRoutes);

//configurar el puerto y encender el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});