-- ==============================================================================
-- MIGRACIÓN 018: ESTADO DE PAGO EN FACTURAS A CRÉDITO, JERARQUÍA POR ROLES Y
-- REDISEÑO DE REUNIONES (CALENDARIO, INVITADOS, TEMAS/OBJETIVOS, EDICIÓN <= 10 MIN)
-- ==============================================================================

BEGIN;

-- 1. Control de cobranza / pago para comprobantes a crédito
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'comprobantes' AND column_name = 'estado_pago'
    ) THEN
        ALTER TABLE comprobantes
            ADD COLUMN estado_pago VARCHAR(20) NOT NULL DEFAULT 'PAGADO',
            ADD COLUMN fecha_pago TIMESTAMPTZ NULL,
            ADD COLUMN pagado_por INTEGER NULL REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

        ALTER TABLE comprobantes
            ADD CONSTRAINT comprobantes_estado_pago_check
            CHECK (estado_pago IN ('PENDIENTE', 'PAGADO'));

        UPDATE comprobantes
        SET estado_pago = CASE
            WHEN forma_pago = 'CREDITO'
                 AND COALESCE(estado_sunat, '') != 'ANULADO'
                 AND tipo_comprobante IN ('01', '03')
            THEN 'PENDIENTE'
            ELSE 'PAGADO'
        END;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comprobantes_credito_vencimiento
    ON comprobantes (forma_pago, estado_pago, fecha_vencimiento_cuota)
    WHERE forma_pago = 'CREDITO' AND estado_pago = 'PENDIENTE';

-- 2. Nivel jerárquico en roles (1 = máxima autoridad ... valores mayores = menor jerarquía)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'roles' AND column_name = 'nivel_jerarquia'
    ) THEN
        ALTER TABLE roles
            ADD COLUMN nivel_jerarquia INTEGER NOT NULL DEFAULT 4;

        ALTER TABLE roles
            ADD CONSTRAINT roles_nivel_jerarquia_check
            CHECK (nivel_jerarquia BETWEEN 1 AND 20);

        UPDATE roles SET nivel_jerarquia = 1 WHERE nombre = 'Admin Central';
        UPDATE roles SET nivel_jerarquia = 2 WHERE nombre != 'Admin Central' AND nombre ILIKE '%Gerente%';
        UPDATE roles SET nivel_jerarquia = 3 WHERE nombre != 'Admin Central' AND nombre NOT ILIKE '%Gerente%' AND nombre ILIKE '%Jefe%';
    END IF;
END $$;

-- 3. Rediseño de reuniones: temas/objetivos, visibilidad jerárquica y timestamps con zona horaria
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reuniones' AND column_name = 'es_general_nivel'
    ) THEN
        ALTER TABLE reuniones
            ADD COLUMN es_general_nivel BOOLEAN NOT NULL DEFAULT FALSE;

        -- Preservar visibilidad general en reuniones históricas creadas antes de esta migración
        UPDATE reuniones
        SET es_general_nivel = TRUE
        WHERE alcance IN ('general', 'ubicacion');
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reuniones' AND column_name = 'tipo_evento'
    ) THEN
        ALTER TABLE reuniones
            ADD COLUMN tipo_evento VARCHAR(30) NOT NULL DEFAULT 'reunion';

        UPDATE reuniones
        SET tipo_evento = 'imprevisto'
        WHERE titulo ILIKE '[IMPREVISTO]%';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reuniones'
          AND column_name = 'fecha_hora_inicio'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE reuniones
            ALTER COLUMN fecha_hora_inicio TYPE TIMESTAMPTZ USING fecha_hora_inicio AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reuniones'
          AND column_name = 'fecha_hora_fin'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE reuniones
            ALTER COLUMN fecha_hora_fin TYPE TIMESTAMPTZ USING fecha_hora_fin AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'reuniones'
          AND column_name = 'creado_en'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE reuniones
            ALTER COLUMN creado_en TYPE TIMESTAMPTZ USING creado_en AT TIME ZONE 'UTC';
    END IF;
END $$;

ALTER TABLE reuniones
    ADD COLUMN IF NOT EXISTS temas_objetivos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_reuniones_fecha_inicio
    ON reuniones (fecha_hora_inicio);

COMMIT;
