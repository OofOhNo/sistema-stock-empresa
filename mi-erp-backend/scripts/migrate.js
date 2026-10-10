#!/usr/bin/env node
/**
 * Runner de migraciones SQL numeradas (carpeta /migrations).
 *
 * Uso:
 *   npm run migrate                      -> aplica las migraciones pendientes usando DATABASE_URL
 *   npm run migrate -- --status          -> muestra qué migraciones están aplicadas / pendientes
 *   npm run migrate -- --dry-run         -> ejecuta las pendientes dentro de UNA transacción y hace ROLLBACK
 *   npm run migrate -- --url "<conexion>" -> usa otra base (por ejemplo una rama de Neon para probar)
 *
 * Cada archivo se aplica en su propia transacción y queda registrado en schema_migrations
 * con un checksum. Si alguien edita una migración ya aplicada, el runner se niega a seguir.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valor = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};

const DIR = path.join(__dirname, '..', 'migrations');
const url = valor('--url') || process.env.DATABASE_URL;
const soloEstado = flag('--status');
const dryRun = flag('--dry-run');

if (!url) {
    console.error('Falta la cadena de conexión: definí DATABASE_URL en .env o pasá --url "<conexion>".');
    process.exit(1);
}

const LOCK_ID = 727274; // número arbitrario para pg_advisory_lock (evita dos runners a la vez)

function leerMigraciones() {
    if (!fs.existsSync(DIR)) {
        fs.mkdirSync(DIR, { recursive: true });
    }
    return fs.readdirSync(DIR)
        .filter((f) => /^\d{3}_.+\.sql$/.test(f))
        .sort()
        .map((archivo) => {
            const sql = fs.readFileSync(path.join(DIR, archivo), 'utf8');
            return {
                version: archivo.slice(0, 3),
                archivo,
                sql,
                checksum: crypto.createHash('sha256').update(sql).digest('hex'),
            };
        });
}

function destino(u) {
    try {
        const p = new URL(u);
        return `${p.hostname}${p.pathname}`;
    } catch {
        return '(url inválida)';
    }
}

(async () => {
    const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
    await client.connect();
    console.log(`Base de datos: ${destino(url)}${dryRun ? '  [DRY-RUN: no se guarda nada]' : ''}`);

    try {
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version     VARCHAR(3) PRIMARY KEY,
                archivo     TEXT NOT NULL,
                checksum    CHAR(64) NOT NULL,
                aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);

        const { rows } = await client.query('SELECT version, archivo, checksum, aplicado_en FROM schema_migrations');
        const aplicadas = new Map(rows.map((r) => [r.version, r]));
        const migraciones = leerMigraciones();

        // Integridad: una migración aplicada no puede cambiar
        for (const m of migraciones) {
            const a = aplicadas.get(m.version);
            if (a && a.checksum !== m.checksum) {
                throw new Error(`La migración ${m.archivo} ya fue aplicada y su contenido cambió. Creá una migración nueva en vez de editarla.`);
            }
        }

        const pendientes = migraciones.filter((m) => !aplicadas.has(m.version));

        if (soloEstado) {
            for (const m of migraciones) {
                const a = aplicadas.get(m.version);
                console.log(`${a ? '✔ aplicada ' : '· pendiente'}  ${m.archivo}${a ? `  (${a.aplicado_en.toISOString()})` : ''}`);
            }
            return;
        }

        if (pendientes.length === 0) {
            console.log('No hay migraciones pendientes.');
            return;
        }

        if (dryRun) {
            await client.query('BEGIN');
            try {
                for (const m of pendientes) {
                    process.stdout.write(`→ ${m.archivo} ... `);
                    await client.query(m.sql);
                    console.log('ok');
                }
            } finally {
                await client.query('ROLLBACK');
            }
            console.log('DRY-RUN completo: todas las migraciones corrieron sin error y se revirtieron.');
            return;
        }

        for (const m of pendientes) {
            process.stdout.write(`→ ${m.archivo} ... `);
            await client.query('BEGIN');
            try {
                await client.query(m.sql);
                await client.query(
                    'INSERT INTO schema_migrations (version, archivo, checksum) VALUES ($1, $2, $3)',
                    [m.version, m.archivo, m.checksum]
                );
                await client.query('COMMIT');
                console.log('ok');
            } catch (err) {
                await client.query('ROLLBACK');
                console.log('ERROR');
                throw new Error(`${m.archivo}: ${err.message}`);
            }
        }
        console.log(`Listo: ${pendientes.length} migración(es) aplicada(s).`);
    } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
        await client.end();
    }
})().catch((err) => {
    console.error('Fallo en migraciones:', err.message);
    process.exit(1);
});

