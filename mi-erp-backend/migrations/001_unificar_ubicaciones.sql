-- 001_unificar_ubicaciones.sql
-- Unificación de sucursales a ubicaciones y estandarización a id_ubicacion

BEGIN;

-- 1. Asegurar divisiones y ubicaciones
CREATE TABLE IF NOT EXISTS divisiones (
    id_division SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS ubicaciones (
    id_ubicacion SERIAL PRIMARY KEY,
    id_division INTEGER REFERENCES divisiones(id_division),
    nombre VARCHAR(100) NOT NULL
);

-- Asegurar división base
INSERT INTO divisiones (id_division, nombre)
VALUES (1, 'División Central')
ON CONFLICT (id_division) DO NOTHING;

-- 2. Copiar datos desde sucursales hacia ubicaciones
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sucursales') THEN
        INSERT INTO ubicaciones (id_ubicacion, id_division, nombre)
        SELECT id_sucursal, 1, nombre
        FROM sucursales
        ON CONFLICT (id_ubicacion) DO UPDATE SET nombre = EXCLUDED.nombre;
    ELSE
        INSERT INTO ubicaciones (id_ubicacion, id_division, nombre)
        VALUES (1, 1, 'Ubicación Principal')
        ON CONFLICT (id_ubicacion) DO NOTHING;
    END IF;
END $$;

SELECT setval('ubicaciones_id_ubicacion_seq', COALESCE((SELECT MAX(id_ubicacion) FROM ubicaciones), 1));

-- 3. Tabla usuarios: asegurar id_ubicacion, migrar y poner NOT NULL
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion);

DO $$
BEGIN
    -- Copiar de id_sucursal o sucursal_id si existen
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='id_sucursal') THEN
        UPDATE usuarios SET id_ubicacion = id_sucursal WHERE id_ubicacion IS NULL AND id_sucursal IS NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='sucursal_id') THEN
        UPDATE usuarios SET id_ubicacion = sucursal_id WHERE id_ubicacion IS NULL AND sucursal_id IS NOT NULL;
    END IF;
END $$;

-- Default para usuarios que no tenían asignación
UPDATE usuarios SET id_ubicacion = 1 WHERE id_ubicacion IS NULL;

-- Limpiar columnas deprecadas
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_id_sucursal_fkey;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_sucursal_id_fkey;
ALTER TABLE usuarios DROP COLUMN IF EXISTS id_sucursal;
ALTER TABLE usuarios DROP COLUMN IF EXISTS sucursal_id;
ALTER TABLE usuarios ALTER COLUMN id_ubicacion SET NOT NULL;

-- 4. Tabla inventario: migrar a id_ubicacion, actualizar constraints
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventario' AND column_name='id_sucursal') THEN
        UPDATE inventario SET id_ubicacion = id_sucursal WHERE id_ubicacion IS NULL AND id_sucursal IS NOT NULL;
    END IF;
END $$;

UPDATE inventario SET id_ubicacion = 1 WHERE id_ubicacion IS NULL;

ALTER TABLE inventario DROP CONSTRAINT IF EXISTS inventario_id_producto_id_sucursal_key;
ALTER TABLE inventario DROP CONSTRAINT IF EXISTS inventario_id_sucursal_fkey;
ALTER TABLE inventario DROP COLUMN IF EXISTS id_sucursal;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventario_id_producto_id_ubicacion_key'
    ) THEN
        ALTER TABLE inventario ADD CONSTRAINT inventario_id_producto_id_ubicacion_key UNIQUE (id_producto, id_ubicacion);
    END IF;
END $$;

ALTER TABLE inventario ALTER COLUMN id_ubicacion SET NOT NULL;

-- 5. Tabla movimientos_kardex: migrar a id_ubicacion y actualizar checks
ALTER TABLE movimientos_kardex ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='movimientos_kardex' AND column_name='id_sucursal') THEN
        UPDATE movimientos_kardex SET id_ubicacion = id_sucursal WHERE id_ubicacion IS NULL AND id_sucursal IS NOT NULL;
    END IF;
END $$;

UPDATE movimientos_kardex SET id_ubicacion = 1 WHERE id_ubicacion IS NULL;

ALTER TABLE movimientos_kardex DROP CONSTRAINT IF EXISTS movimientos_kardex_id_sucursal_fkey;
ALTER TABLE movimientos_kardex DROP COLUMN IF EXISTS id_sucursal;
ALTER TABLE movimientos_kardex ALTER COLUMN id_ubicacion SET NOT NULL;

-- Permitir SOLICITUD_ANULACION y RECHAZADO en estado de kardex
ALTER TABLE movimientos_kardex DROP CONSTRAINT IF EXISTS movimientos_kardex_estado_check;
ALTER TABLE movimientos_kardex ADD CONSTRAINT movimientos_kardex_estado_check
    CHECK (estado IN ('VIGENTE', 'ANULADO', 'SOLICITUD_ANULACION', 'RECHAZADO'));

-- 6. Tabla pedidos: migrar a id_ubicacion
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pedidos' AND column_name='id_sucursal') THEN
        UPDATE pedidos SET id_ubicacion = id_sucursal WHERE id_ubicacion IS NULL AND id_sucursal IS NOT NULL;
    END IF;
END $$;

UPDATE pedidos SET id_ubicacion = 1 WHERE id_ubicacion IS NULL;

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_id_sucursal_fkey;
ALTER TABLE pedidos DROP COLUMN IF EXISTS id_sucursal;
ALTER TABLE pedidos ALTER COLUMN id_ubicacion SET NOT NULL;

-- 7. Tabla reuniones y salas_reunion
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion);
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS alcance VARCHAR(50) DEFAULT 'general';

ALTER TABLE salas_reunion ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='salas_reunion' AND column_name='id_sucursal') THEN
        UPDATE salas_reunion SET id_ubicacion = id_sucursal WHERE id_ubicacion IS NULL AND id_sucursal IS NOT NULL;
    END IF;
END $$;
ALTER TABLE salas_reunion DROP CONSTRAINT IF EXISTS salas_reunion_id_sucursal_fkey;
ALTER TABLE salas_reunion DROP COLUMN IF EXISTS id_sucursal;

COMMIT;

