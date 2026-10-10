const { Pool } = require('pg');
require('dotenv').config();

// La cadena de conexión se lee de process.env.DATABASE_URL
if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Copiá .env.example a .env y configurá la cadena de conexión de Supabase o PostgreSQL.');
    process.exit(1);
}

function getSslConfig(connectionUrl) {
    if (!connectionUrl) return false;
    const lower = connectionUrl.toLowerCase();
    // En entornos locales o Docker interno con postgres local no se requiere SSL
    if (lower.includes('sslmode=disable') || lower.includes('localhost') || lower.includes('127.0.0.1')) {
        return false;
    }
    // Compatible con Supabase (puerto 5432 / 6543) y otros proveedores cloud
    return {
        rejectUnauthorized: process.env.DATABASE_SSL_STRICT === 'true'
    };
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(process.env.DATABASE_URL),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;