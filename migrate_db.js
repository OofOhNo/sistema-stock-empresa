const pool = require('./mi-erp-backend/src/config/db');

async function migrate() {
    try {
        console.log('Creating divisiones and ubicaciones...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS divisiones (
                id_division SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ubicaciones (
                id_ubicacion SERIAL PRIMARY KEY,
                id_division INT REFERENCES divisiones(id_division),
                nombre VARCHAR(100) NOT NULL
            );
        `);
        
        console.log('Inserting default division and ubicacion if not exists...');
        const resDiv = await pool.query(`SELECT * FROM divisiones LIMIT 1`);
        if (resDiv.rows.length === 0) {
            const inserted = await pool.query(`INSERT INTO divisiones (nombre) VALUES ('Central') RETURNING id_division`);
            const divId = inserted.rows[0].id_division;
            await pool.query(`INSERT INTO ubicaciones (id_division, nombre) VALUES ($1, 'Sucursal Principal')`, [divId]);
        }

        console.log('Updating inventario and movimientos_kardex to use id_ubicacion...');
        await pool.query(`
            ALTER TABLE inventario ADD COLUMN IF NOT EXISTS id_ubicacion INT REFERENCES ubicaciones(id_ubicacion);
            ALTER TABLE movimientos_kardex ADD COLUMN IF NOT EXISTS id_ubicacion INT REFERENCES ubicaciones(id_ubicacion);
        `);

        console.log('Updating usuarios to use id_ubicacion...');
        await pool.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id_ubicacion INT REFERENCES ubicaciones(id_ubicacion);
        `);
        
        console.log('Inserting Gerente de Área into roles if not exists...');
        const resRole = await pool.query(`SELECT * FROM roles WHERE nombre = 'Gerente de Área'`);
        if (resRole.rows.length === 0) {
            await pool.query(`INSERT INTO roles (nombre) VALUES ('Gerente de Área')`);
        }

        console.log('Creating auditoria table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS auditoria (
                id SERIAL PRIMARY KEY,
                id_usuario INT REFERENCES usuarios(id_usuario),
                accion VARCHAR(50) NOT NULL,
                entidad VARCHAR(50) NOT NULL,
                id_entidad INT NOT NULL,
                antes JSONB,
                despues JSONB,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        console.log('Creating trigger for auditoria...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION block_auditoria_modifications()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Updates and Deletes are not allowed on auditoria table';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS block_auditoria_trigger ON auditoria;
            CREATE TRIGGER block_auditoria_trigger
            BEFORE UPDATE OR DELETE ON auditoria
            FOR EACH ROW EXECUTE FUNCTION block_auditoria_modifications();
        `);

        console.log('Done!');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

migrate();

