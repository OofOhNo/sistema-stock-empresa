-- ==============================================================================
-- MIGRACIÓN 032: TOPE MÁXIMO ACUMULADO PARA DETENER BOLETEADORA AUTOMÁTICA
-- ==============================================================================

BEGIN;

ALTER TABLE config_boletas_automaticas
    ADD COLUMN IF NOT EXISTS monto_tope_total NUMERIC(12,2) NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tope_acumulado_desde TIMESTAMP WITH TIME ZONE NULL DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS tope_alcanzado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_comprobantes_auto_periodo
    ON comprobantes (origen_facturacion, tipo_comprobante, estado_sunat, fecha_emision);

COMMIT;
