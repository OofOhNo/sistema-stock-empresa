-- 003_productos_auditoria_y_series.sql
-- Inclusión de baja lógica en productos, auditoría inmutable y series SUNAT

BEGIN;

-- 1. Productos: baja lógica (activo), costo y stock mínimo
ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_costo NUMERIC(12,2) DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INTEGER DEFAULT 5;

-- 2. Tabla auditoría e inmutabilidad
CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario INTEGER,
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    id_entidad INTEGER,
    antes JSONB,
    despues JSONB,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION block_auditoria_updates()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación denegada: El registro de auditoría es inmutable y no se puede modificar ni eliminar.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_auditoria_updates ON auditoria;
CREATE TRIGGER trg_block_auditoria_updates
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION block_auditoria_updates();

-- 3. Series SUNAT
CREATE TABLE IF NOT EXISTS series_sunat (
    id_serie SERIAL PRIMARY KEY,
    tipo_comprobante VARCHAR(2) NOT NULL,
    serie VARCHAR(4) NOT NULL UNIQUE,
    ultimo_correlativo INTEGER DEFAULT 0
);

INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo)
VALUES 
    ('01', 'F001', 0),
    ('03', 'B001', 0),
    ('07', 'FC01', 0),
    ('07', 'BC01', 0)
ON CONFLICT (serie) DO NOTHING;

COMMIT;

