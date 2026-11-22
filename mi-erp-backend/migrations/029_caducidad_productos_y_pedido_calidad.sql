-- ==============================================================================
-- MIGRACIÓN 029: CADUCIDAD PROMEDIO EN PRODUCTOS (OPCIONAL) Y VÍNCULO OPCIONAL
-- DE PEDIDO EN CERTIFICADOS DE CALIDAD
-- ==============================================================================

BEGIN;

-- 1. Tiempo promedio hasta caducidad en días para productos (opcional)
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS dias_caducidad_promedio INTEGER NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_productos_dias_caducidad_positivo'
    ) THEN
        ALTER TABLE productos
            ADD CONSTRAINT chk_productos_dias_caducidad_positivo
            CHECK (dias_caducidad_promedio IS NULL OR dias_caducidad_promedio > 0);
    END IF;
END $$;

-- 2. Relación opcional con pedido al emitir un certificado de calidad
ALTER TABLE certificados_calidad
    ADD COLUMN IF NOT EXISTS id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_certificados_calidad_id_pedido
    ON certificados_calidad (id_pedido)
    WHERE id_pedido IS NOT NULL;

COMMIT;
