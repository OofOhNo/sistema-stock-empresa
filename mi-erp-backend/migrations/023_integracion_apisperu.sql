-- ==============================================================================
-- MIGRACIÓN 023: INTEGRACIÓN OFICIAL CON APIsPERU (CPE + GRE 2022 + XML/CDR)
-- ==============================================================================

BEGIN;

-- 1. Ampliar modos de integración permitidos en configuracion_empresa_sunat
DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    SELECT c.conname
      INTO v_constraint_name
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
     WHERE n.nspname = 'public'
       AND t.relname = 'configuracion_empresa_sunat'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%modo_integracion%'
     LIMIT 1;

    IF v_constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.configuracion_empresa_sunat DROP CONSTRAINT %I', v_constraint_name);
    END IF;
END $$;

ALTER TABLE public.configuracion_empresa_sunat
    DROP CONSTRAINT IF EXISTS configuracion_empresa_sunat_modo_integracion_check;

ALTER TABLE public.configuracion_empresa_sunat
    ADD CONSTRAINT configuracion_empresa_sunat_modo_integracion_check
    CHECK (modo_integracion IN ('DEMO_NUBEFACT', 'NUBEFACT_REAL', 'APISPERU'));

-- 2. Credenciales APIsPERU y datos geográficos UBL 2.1 del emisor
ALTER TABLE public.configuracion_empresa_sunat
    ADD COLUMN IF NOT EXISTS apisperu_url TEXT DEFAULT 'https://facturacion.apisperu.com/api/v1',
    ADD COLUMN IF NOT EXISTS apisperu_token TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS departamento VARCHAR(100) DEFAULT 'LIMA',
    ADD COLUMN IF NOT EXISTS provincia VARCHAR(100) DEFAULT 'LIMA',
    ADD COLUMN IF NOT EXISTS distrito VARCHAR(100) DEFAULT 'LIMA';

-- 3. Soporte de CDR ZIP oficial de APIsPERU en comprobantes y guías de remisión
ALTER TABLE public.comprobantes
    ADD COLUMN IF NOT EXISTS cdr_zip_base64 TEXT;

ALTER TABLE public.guias_remision
    ADD COLUMN IF NOT EXISTS xml_firmado TEXT,
    ADD COLUMN IF NOT EXISTS cdr_xml TEXT,
    ADD COLUMN IF NOT EXISTS cdr_zip_base64 TEXT,
    ADD COLUMN IF NOT EXISTS ticket_sunat TEXT;

COMMIT;
