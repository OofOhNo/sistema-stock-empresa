const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_6by3AngHmzDW@ep-jolly-glitter-a5q9ovi4-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

module.exports = pool;