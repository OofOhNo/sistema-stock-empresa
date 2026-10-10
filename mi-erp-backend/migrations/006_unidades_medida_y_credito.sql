-- 006_unidades_medida_y_credito.sql
-- 1. Unidades de Medida para productos (formatos configurables y creables)
-- 2. Forma de pago en facturas (Contado / Crédito con vencimiento)

BEGIN;

-- 1. Tabla de Unidades de Medida
CREATE TABLE IF NOT EXISTS unidades_medida (
    id_unidad SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    simbolo VARCHAR(20) NOT NULL,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Formatos base (Catálogo estándar SUNAT y comercial)
INSERT INTO unidades_medida (codigo, nombre, simbolo)
VALUES 
    ('NIU', 'Unidad', 'und'),
    ('KGM', 'Kilogramo', 'kg'),
    ('GRM', 'Gramo', 'g'),
    ('LTR', 'Litro', 'L'),
    ('BX', 'Caja', 'caja'),
    ('PK', 'Paquete', 'paq'),
    ('SAC', 'Saco', 'saco'),
    ('BLS', 'Bolsa', 'bolsa'),
    ('DOC', 'Docena', 'doc'),
    ('MLL', 'Millar', 'millar')
ON CONFLICT (codigo) DO NOTHING;

-- Ampliar tabla productos con unidad de medida
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_medida VARCHAR(50) DEFAULT 'Unidad';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_unidad INTEGER REFERENCES unidades_medida(id_unidad) ON DELETE SET NULL;

-- Asignar unidad por defecto a productos existentes
UPDATE productos 
SET id_unidad = (SELECT id_unidad FROM unidades_medida WHERE codigo = 'NIU' LIMIT 1),
    unidad_medida = 'Unidad'
WHERE id_unidad IS NULL;

-- 2. Ampliar comprobantes con forma de pago (Contado / Crédito)
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS forma_pago VARCHAR(20) DEFAULT 'CONTADO' CHECK (forma_pago IN ('CONTADO', 'CREDITO'));
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS dias_credito INTEGER DEFAULT 0;
ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS fecha_vencimiento_cuota DATE;

-- Asignar CONTADO a comprobantes existentes
UPDATE comprobantes 
SET forma_pago = 'CONTADO', dias_credito = 0
WHERE forma_pago IS NULL;

COMMIT;

