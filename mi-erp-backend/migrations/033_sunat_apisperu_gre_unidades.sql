-- ==============================================================================
-- MIGRACIÓN 033: NORMALIZACIÓN DE UNIDADES SUNAT Y CAMPOS GRE TRANSPORTISTA/PÚBLICO
-- ==============================================================================

BEGIN;

-- 1. Normalizar códigos de unidades_medida a Catálogo 03 / UN-ECE Rec 20 exigido por SUNAT/APIsPERU
DO $$
DECLARE
    v_id_bg INTEGER;
    v_id_bls INTEGER;
    v_id_sa INTEGER;
    v_id_sac INTEGER;
    v_id_dzn INTEGER;
    v_id_doc INTEGER;
    v_id_mil INTEGER;
    v_id_mll INTEGER;
BEGIN
    SELECT id_unidad INTO v_id_bg FROM unidades_medida WHERE UPPER(codigo) = 'BG' LIMIT 1;
    SELECT id_unidad INTO v_id_bls FROM unidades_medida WHERE UPPER(codigo) = 'BLS' LIMIT 1;
    IF v_id_bls IS NOT NULL THEN
        IF v_id_bg IS NOT NULL THEN
            UPDATE productos SET id_unidad = v_id_bg WHERE id_unidad = v_id_bls;
            DELETE FROM unidades_medida WHERE id_unidad = v_id_bls;
        ELSE
            UPDATE unidades_medida SET codigo = 'BG', simbolo = 'bolsa' WHERE id_unidad = v_id_bls;
        END IF;
    END IF;

    SELECT id_unidad INTO v_id_sa FROM unidades_medida WHERE UPPER(codigo) = 'SA' LIMIT 1;
    SELECT id_unidad INTO v_id_sac FROM unidades_medida WHERE UPPER(codigo) = 'SAC' LIMIT 1;
    IF v_id_sac IS NOT NULL THEN
        IF v_id_sa IS NOT NULL THEN
            UPDATE productos SET id_unidad = v_id_sa WHERE id_unidad = v_id_sac;
            DELETE FROM unidades_medida WHERE id_unidad = v_id_sac;
        ELSE
            UPDATE unidades_medida SET codigo = 'SA' WHERE id_unidad = v_id_sac;
        END IF;
    END IF;

    SELECT id_unidad INTO v_id_dzn FROM unidades_medida WHERE UPPER(codigo) = 'DZN' LIMIT 1;
    SELECT id_unidad INTO v_id_doc FROM unidades_medida WHERE UPPER(codigo) = 'DOC' LIMIT 1;
    IF v_id_doc IS NOT NULL THEN
        IF v_id_dzn IS NOT NULL THEN
            UPDATE productos SET id_unidad = v_id_dzn WHERE id_unidad = v_id_doc;
            DELETE FROM unidades_medida WHERE id_unidad = v_id_doc;
        ELSE
            UPDATE unidades_medida SET codigo = 'DZN' WHERE id_unidad = v_id_doc;
        END IF;
    END IF;

    SELECT id_unidad INTO v_id_mil FROM unidades_medida WHERE UPPER(codigo) = 'MIL' LIMIT 1;
    SELECT id_unidad INTO v_id_mll FROM unidades_medida WHERE UPPER(codigo) = 'MLL' LIMIT 1;
    IF v_id_mll IS NOT NULL THEN
        IF v_id_mil IS NOT NULL THEN
            UPDATE productos SET id_unidad = v_id_mil WHERE id_unidad = v_id_mll;
            DELETE FROM unidades_medida WHERE id_unidad = v_id_mll;
        ELSE
            UPDATE unidades_medida SET codigo = 'MIL' WHERE id_unidad = v_id_mll;
        END IF;
    END IF;
END $$;

-- 2. Campos en guias_remision para Transporte Público (01), GRE Transportista (31), bultos y observaciones
ALTER TABLE guias_remision
    ADD COLUMN IF NOT EXISTS transportista_ruc VARCHAR(11) NULL,
    ADD COLUMN IF NOT EXISTS transportista_razon_social VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS transportista_nro_mtc VARCHAR(50) NULL,
    ADD COLUMN IF NOT EXISTS remitente_tipo_doc VARCHAR(2) NULL,
    ADD COLUMN IF NOT EXISTS remitente_num_doc VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS remitente_razon_social VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS numero_de_bultos INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS observaciones TEXT NULL;

COMMIT;
