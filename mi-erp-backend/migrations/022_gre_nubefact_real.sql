-- ==============================================================================
-- MIGRACIÓN 022: INTEGRACIÓN REAL NUBEFACT PARA GUÍAS DE REMISIÓN ELECTRÓNICA
-- ==============================================================================

BEGIN;

-- 1. Series configurables para GRE en NubeFact (T001 Remitente, V001 Transportista)
ALTER TABLE configuracion_empresa_sunat
    ADD COLUMN IF NOT EXISTS serie_gre_remitente VARCHAR(10) NOT NULL DEFAULT 'T001',
    ADD COLUMN IF NOT EXISTS serie_gre_transportista VARCHAR(10) NOT NULL DEFAULT 'V001';

INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES
    ('09', 'T001', 0),
    ('31', 'V001', 0)
ON CONFLICT (serie) DO NOTHING;

-- 2. Campos OSE / SUNAT reales en guias_remision (enlaces PDF/XML/CDR, hash y respuesta NubeFact)
ALTER TABLE guias_remision
    ADD COLUMN IF NOT EXISTS codigo_hash TEXT,
    ADD COLUMN IF NOT EXISTS mensaje_cdr TEXT,
    ADD COLUMN IF NOT EXISTS enlace_pdf TEXT,
    ADD COLUMN IF NOT EXISTS enlace_xml TEXT,
    ADD COLUMN IF NOT EXISTS enlace_cdr TEXT,
    ADD COLUMN IF NOT EXISTS modo_emision VARCHAR(30) DEFAULT 'DEMO_NUBEFACT',
    ADD COLUMN IF NOT EXISTS respuesta_ose_json JSONB,
    ADD COLUMN IF NOT EXISTS documento_relacionado_tipo VARCHAR(2),
    ADD COLUMN IF NOT EXISTS documento_relacionado_serie VARCHAR(10),
    ADD COLUMN IF NOT EXISTS documento_relacionado_numero INTEGER;

COMMIT;
