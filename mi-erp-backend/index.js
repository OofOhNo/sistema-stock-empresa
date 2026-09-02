const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./src/config/db'); //solo con importarlo, se conecta a la BD

const app = express();

//middlewares globales (para que el servidor entienda JSON y acepte peticiones)
app.use(cors());
app.use(express.json());

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
const kardexRoutes = require('./routes/kardexRoutes.js');
app.use('/api/kardex', kardexRoutes);

//configurar el puerto y encender el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});