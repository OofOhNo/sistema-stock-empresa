#!/usr/bin/env node
/**
 * Runner de migraciones SQL numeradas (carpeta /migrations).
 * Compatible con Supabase, Docker, PostgreSQL local y proveedores Cloud.
 *
 * Uso:
 *   npm run migrate                      -> aplica las migraciones pendientes usando DATABASE_URL
 *   npm run migrate -- --status          -> muestra qué migraciones están aplicadas / pendientes
 *   npm run migrate -- --dry-run         -> ejecuta las pendientes dentro de UNA transacción y hace ROLLBACK
 *   npm run migrate -- --repair          -> sincroniza checksums si cambiaron saltos de línea entre sistemas
 *   npm run migrate -- --url "<conexion>" -> usa otra base (por ejemplo Supabase staging o rama de prueba)
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
const repairChecksums = flag('--repair') || flag('--repair-checksums');

if (!url) {
    console.error('Falta la cadena de conexión: definí DATABASE_URL en .env o pasá --url "<conexion>".');
    process.exit(1);
}

const LOCK_ID = 727274;

function calcularChecksum(sql) {
    // Normalizar saltos de línea (CRLF a LF) y trim para que sea idéntico en Windows, Linux y Docker
    const normalizado = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    return crypto.createHash('sha256').update(normalizado).digest('hex');
}

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
                checksum: calcularChecksum(sql),
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

function getSslConfig(connectionUrl) {
    if (!connectionUrl) return false;
    const lower = connectionUrl.toLowerCase();
    if (lower.includes('sslmode=disable') || lower.includes('localhost') || lower.includes('127.0.0.1')) {
        return false;
    }
    return {
        rejectUnauthorized: process.env.DATABASE_SSL_STRICT === 'true'
    };
}

(async () => {
    const client = new Client({
        connectionString: url,
        ssl: getSslConfig(url)
    });
    await client.connect();
    console.log(`Base de datos: ${destino(url)}${dryRun ? '  [DRY-RUN: no se guarda nada]' : ''}`);

    let lockAdquirido = false;
    try {
        try {
            await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
            lockAdquirido = true;
        } catch {
            console.log('ℹ Conexión sin soporte de pg_advisory_lock (modo pooler). Ejecutando con transacciones individuales.');
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version     VARCHAR(3) PRIMARY KEY,
                archivo     TEXT NOT NULL,
                checksum    CHAR(64) NOT NULL,
                aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);

        // Si la base es completamente nueva (no existe la tabla usuarios), inicializar desde schema.sql
        const { rows: testTable } = await client.query(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usuarios'"
        );
        if (testTable.length === 0) {
            console.log('ℹ Base de datos nueva/vacía detectada. Inicializando estructura desde schema.sql...');
            const schemaFile = path.join(__dirname, '..', 'schema.sql');
            if (fs.existsSync(schemaFile)) {
                const schemaSql = fs.readFileSync(schemaFile, 'utf8');
                await client.query(schemaSql);
                console.log('✔ Estructura base inicializada exitosamente desde schema.sql.');
            }
            await client.query(`
                INSERT INTO divisiones (id_division, nombre) VALUES (1, 'División Central') ON CONFLICT (id_division) DO NOTHING;
                INSERT INTO ubicaciones (id_ubicacion, id_division, nombre) VALUES (1, 1, 'Sede Principal') ON CONFLICT (id_ubicacion) DO NOTHING;
            `);
        }

        const { rows } = await client.query('SELECT version, archivo, checksum, aplicado_en FROM schema_migrations');
        const aplicadas = new Map(rows.map((r) => [r.version, r]));
        const migraciones = leerMigraciones();

        // Integridad: verificar que el checksum coincida
        for (const m of migraciones) {
            const a = aplicadas.get(m.version);
            if (a && a.checksum !== m.checksum) {
                if (repairChecksums) {
                    await client.query('UPDATE schema_migrations SET checksum = $1 WHERE version = $2', [m.checksum, m.version]);
                    console.log(`✔ Checksum sincronizado para ${m.archivo}`);
                } else {
                    throw new Error(`La migración ${m.archivo} ya fue aplicada y su checksum difiere. Ejecutá con --repair si se debió a cambios de saltos de línea (CRLF/LF).`);
                }
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
                console.log('DRY-RUN finalizado: se ejecutó ROLLBACK. Base intacta.');
            }
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
        if (lockAdquirido) {
            await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
        }
        await client.end();
    }
})().catch((err) => {
    console.error('Fallo en migraciones:', err.message);
    process.exit(1);
});
