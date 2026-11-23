-- ==============================================================================
-- MIGRACIÓN 030: CONTROL EXPLÍCITO "DECRECE STOCK (SÍ / NO)" EN FACTURACIÓN
-- ==============================================================================

BEGIN;

ALTER TABLE comprobantes
    ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE notas_pedido
    ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE config_boletas_automaticas
    ADD COLUMN IF NOT EXISTS decrece_stock BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE guias_remision
    ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
