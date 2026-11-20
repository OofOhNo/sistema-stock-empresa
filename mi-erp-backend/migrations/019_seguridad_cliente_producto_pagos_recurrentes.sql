-- ==============================================================================
-- MIGRACIÓN 019: SEGURIDAD (INVALIDACIÓN DE SESIONES POR CAMBIO DE CLAVE),
-- CLIENTE HABITUAL EN PRODUCTOS Y PAGOS RECURRENTES MULTI-MES INMEDIATOS
-- ==============================================================================

BEGIN;

-- 1. Invalidación de tokens JWT emitidos antes de un cambio/restablecimiento de contraseña
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS password_actualizada_en TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- 2. Recuadro de cliente que suele consumir / pedir cada producto
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS cliente_habitual VARCHAR(255) NULL;

-- 3. Serie recurrente mensual inmediata para pagos programados (aparecen en meses futuros aunque no se pague el mes actual)
ALTER TABLE pagos_programados
    ADD COLUMN IF NOT EXISTS id_pago_origen INTEGER NULL,
    ADD COLUMN IF NOT EXISTS periodo_ym VARCHAR(7) NULL,
    ADD COLUMN IF NOT EXISTS dia_recurrencia SMALLINT NULL;

DO $$
BEGIN
    UPDATE pagos_programados
    SET id_pago_origen = id_pago,
        periodo_ym = COALESCE(periodo_ym, TO_CHAR(fecha_vencimiento, 'YYYY-MM')),
        dia_recurrencia = COALESCE(dia_recurrencia, EXTRACT(DAY FROM fecha_vencimiento)::smallint)
    WHERE recurrente_mensual = TRUE
      AND id_pago_origen IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_serie_periodo_unico
    ON pagos_programados (id_pago_origen, periodo_ym)
    WHERE id_pago_origen IS NOT NULL AND periodo_ym IS NOT NULL;

COMMIT;
