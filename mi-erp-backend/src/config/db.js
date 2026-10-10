const { Pool } = require('pg');
require('dotenv').config();

// La cadena de conexión SOLO se lee del entorno (.env). Nunca debe quedar escrita en el código.
if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL. Copiá .env.example a .env y completá la cadena de conexión de Neon.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true }
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;