const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).trim().length < 32) {
  console.error('FATAL: Debes definir JWT_SECRET en .env con al menos 32 caracteres antes de iniciar el servidor.');
  process.exit(1);
}

const db = require('./src/config/db'); //solo con importarlo, se conecta a la BD
const { verificarToken } = require('./src/middlewares/authMiddleware');
const requierePermiso = require('./src/middlewares/requierePermiso');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: false,
  hsts: process.env.ENABLE_HSTS === 'true'
}));

const origenesPermitidos = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:80,http://localhost')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (!process.env.CORS_ORIGIN) {
  console.warn('AVISO: CORS_ORIGIN no está definido en .env; usando solo orígenes locales por defecto.');
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origenesPermitidos.includes(origin)) {
      return callback(null, true);
    }
    const err = new Error(`Origen no permitido por CORS: ${origin}`);
    err.status = 403;
    return callback(err);
  },
  credentials: true
}));

const limiterGeneralApi = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6000,
  standardHeaders: true,
  legacyHeaders: false,
  // Las rutas públicas de autenticación tienen limitadores propios en authRoutes.js
  skip: (req) =>
    req.path.startsWith('/auth/login') ||
    req.path.startsWith('/auth/google') ||
    req.path.startsWith('/auth/solicitar-recuperacion'),
  message: {
    exito: false,
    mensaje: 'Demasiadas peticiones desde esta dirección. Espera unos minutos e intenta de nuevo.'
  }
});

// Asegurar carpeta de uploads
const uploadsDir = path.join(__dirname, 'uploads/pedidos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/api', limiterGeneralApi);

// Archivos de evidencias protegidos: solo usuarios autenticados con permiso de Pedidos
const servirUploadsProtegidos = express.static(path.join(__dirname, 'uploads'));
app.use('/uploads', verificarToken, requierePermiso('pedidos', 'ver'), servirUploadsProtegidos);
app.use('/api/uploads', verificarToken, requierePermiso('pedidos', 'ver'), servirUploadsProtegidos);

//ruta de prueba para ver si el servidor responde
app.get('/', (req, res) => {
  res.json({ mensaje: 'El backend del ERP está funcionando' });
});

// Healthcheck completo (API + conectividad a Supabase/PostgreSQL)
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ ok: true, db: 'ok' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'error', mensaje: err.message });
  }
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

//rutas mensajeria interna
const mensajeRoutes = require('./src/routes/mensajeRoutes.js');
app.use('/api/mensajes', mensajeRoutes);

const pagosCalendarioRoutes = require('./src/routes/pagosCalendarioRoutes.js');
app.use('/api/pagos-calendario', pagosCalendarioRoutes);

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ exito: false, mensaje: 'La imagen supera el tamaño máximo permitido (30 MB).' });
  }
  if (err.status === 403) {
    return res.status(403).json({ exito: false, mensaje: err.message });
  }
  if (err.message && err.message.includes('Solo se permiten archivos de imagen')) {
    return res.status(400).json({ exito: false, mensaje: err.message });
  }
  console.error('Error no controlado en API:', err.message);
  return res.status(err.status || 500).json({ exito: false, mensaje: 'Error interno en el servidor.' });
});

//configurar el puerto y encender el servidor
const { iniciarCronBoletasAutomaticas } = require('./src/utils/boletaAutoService');
const { iniciarWhatsAppSiTieneSesion } = require('./src/utils/whatsappService');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  iniciarCronBoletasAutomaticas();
  iniciarWhatsAppSiTieneSesion();
});