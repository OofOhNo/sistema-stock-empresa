const pool = require('./db');

async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('1. Agregando precio_costo y stock_minimo a productos...');
        await client.query(`
            ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_costo NUMERIC(12,2) DEFAULT 0;
            ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INTEGER DEFAULT 5;
        `);

        console.log('2. Modificando permisos y rol_permisos...');
        await client.query(`
            -- Si permisos ya existe, insertemos sin error
            INSERT INTO permisos (modulo, codigo_permiso, descripcion) 
            VALUES 
                ('stock', 'MOD_STOCK', 'Módulo de inventario'), 
                ('pedidos', 'MOD_PEDIDOS', 'Módulo de pedidos'), 
                ('usuarios', 'MOD_USUARIOS', 'Módulo de usuarios'), 
                ('facturacion', 'MOD_FACT', 'Módulo de facturación'), 
                ('reuniones', 'MOD_REUNIONES', 'Módulo de reuniones'), 
                ('productos', 'MOD_PRODUCTOS', 'Módulo de productos')
            ON CONFLICT DO NOTHING;

            -- Añadimos las columnas a roles_permisos (en lugar de rol_permisos)
            ALTER TABLE roles_permisos ADD COLUMN IF NOT EXISTS puede_ver BOOLEAN DEFAULT false;
            ALTER TABLE roles_permisos ADD COLUMN IF NOT EXISTS puede_editar BOOLEAN DEFAULT false;
        `);

        console.log('3. Creando Gerente de Área...');
        await client.query(`
            INSERT INTO roles (nombre, descripcion) VALUES ('Gerente de Área', 'Supervisión global de ventas y stock')
            ON CONFLICT DO NOTHING;
        `);

        console.log('4. Creando divisiones y ubicaciones...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS divisiones (
                id_division SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ubicaciones (
                id_ubicacion SERIAL PRIMARY KEY,
                id_division INTEGER REFERENCES divisiones(id_division),
                nombre VARCHAR(100) NOT NULL
            );
        `);
        // We might need to migrate `ubicaciones` to `ubicaciones`, but for now we create them.
        
        console.log('5. Agregando columnas a reuniones y pedidos...');
        await client.query(`
            ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS alcance VARCHAR(50) DEFAULT 'general';
            ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER;
            
            ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS solicitado_por VARCHAR(100);
        `);

        console.log('6. Creando tabla de auditoria y trigger...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS auditoria (
                id_auditoria SERIAL PRIMARY KEY,
                id_usuario INTEGER,
                accion VARCHAR(50),
                entidad VARCHAR(50),
                id_entidad INTEGER,
                antes JSONB,
                despues JSONB,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE OR REPLACE FUNCTION block_auditoria_updates()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'No se puede modificar ni eliminar el historial de auditoría.';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_block_auditoria_updates ON auditoria;
            CREATE TRIGGER trg_block_auditoria_updates
            BEFORE UPDATE OR DELETE ON auditoria
            FOR EACH ROW EXECUTE FUNCTION block_auditoria_updates();
        `);

        console.log('7. Series y correlativos SUNAT...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS series_sunat (
                id_serie SERIAL PRIMARY KEY,
                tipo_comprobante VARCHAR(2) NOT NULL,
                serie VARCHAR(4) NOT NULL UNIQUE,
                ultimo_correlativo INTEGER DEFAULT 0
            );
            INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) 
            VALUES ('01', 'F001', 0), ('03', 'B001', 0)
            ON CONFLICT DO NOTHING;
        `);

        await client.query('COMMIT');
        console.log('Migraciones completadas exitosamente.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error en migraciones:', e);
    } finally {
        client.release();
    }
}

runMigrations().then(() => process.exit(0));
