const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:tu_contraseña_local@localhost:5432/base_de_datos',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

module.exports = pool;