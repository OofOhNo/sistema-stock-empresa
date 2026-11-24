-- ==============================================================================
-- MIGRACIÓN 031: CLIENTE DIRECTO OCASIONAL EN COMPROBANTES (SIN REGISTRAR EN CLIENTES)
-- ==============================================================================

BEGIN;

ALTER TABLE comprobantes
    ADD COLUMN IF NOT EXISTS cliente_tipo_doc VARCHAR(2) NULL,
    ADD COLUMN IF NOT EXISTS cliente_numero_doc VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS cliente_direccion VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS cliente_email VARCHAR(150) NULL;

COMMIT;
