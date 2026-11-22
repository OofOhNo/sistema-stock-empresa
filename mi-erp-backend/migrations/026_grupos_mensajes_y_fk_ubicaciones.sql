-- ==============================================================================
-- MIGRACIÓN 026: GRUPOS TIPO WHATSAPP EN MENSAJES Y FIX FK EN UBICACIONES
-- ==============================================================================

BEGIN;

-- 1. Corregir claves foráneas de ubicaciones en notas_pedido y comprobantes (ON DELETE SET NULL)
DO $$
DECLARE
    fk_record RECORD;
BEGIN
    FOR fk_record IN
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND ccu.table_name = 'ubicaciones'
          AND tc.table_name IN ('notas_pedido', 'comprobantes')
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk_record.table_name, fk_record.constraint_name);
    END LOOP;
END $$;

ALTER TABLE public.notas_pedido
    ADD CONSTRAINT notas_pedido_id_ubicacion_fkey
    FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion) ON DELETE SET NULL;

ALTER TABLE public.comprobantes
    ADD CONSTRAINT comprobantes_id_ubicacion_fkey
    FOREIGN KEY (id_ubicacion) REFERENCES public.ubicaciones(id_ubicacion) ON DELETE SET NULL;

-- 2. Tablas de grupos de mensajería interna tipo WhatsApp
CREATE TABLE IF NOT EXISTS public.grupos_mensajes (
    id_grupo SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    descripcion TEXT NULL,
    creado_por INTEGER NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.grupos_mensajes_miembros (
    id_grupo INTEGER NOT NULL REFERENCES public.grupos_mensajes(id_grupo) ON DELETE CASCADE,
    id_usuario INTEGER NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    rol_grupo VARCHAR(20) NOT NULL DEFAULT 'MIEMBRO' CHECK (rol_grupo IN ('ADMIN', 'MIEMBRO')),
    unido_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_grupo, id_usuario)
);

CREATE TABLE IF NOT EXISTS public.grupos_mensajes_chat (
    id_mensaje_grupo SERIAL PRIMARY KEY,
    id_grupo INTEGER NOT NULL REFERENCES public.grupos_mensajes(id_grupo) ON DELETE CASCADE,
    id_emisor INTEGER NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    enviado_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_destinatarios_ok INTEGER NOT NULL DEFAULT 0,
    whatsapp_destinatarios_total INTEGER NOT NULL DEFAULT 0,
    creado_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.grupos_mensajes_lecturas (
    id_grupo INTEGER NOT NULL REFERENCES public.grupos_mensajes(id_grupo) ON DELETE CASCADE,
    id_usuario INTEGER NOT NULL REFERENCES public.usuarios(id_usuario) ON DELETE CASCADE,
    ultimo_mensaje_leido INTEGER NOT NULL DEFAULT 0,
    leido_en TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_grupo, id_usuario)
);

CREATE INDEX IF NOT EXISTS idx_grupos_mensajes_miembros_usuario
    ON public.grupos_mensajes_miembros (id_usuario);
CREATE INDEX IF NOT EXISTS idx_grupos_mensajes_chat_grupo_fecha
    ON public.grupos_mensajes_chat (id_grupo, creado_en ASC);

-- Proteger tablas de grupos frente a PostgREST (Supabase RLS)
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'grupos_mensajes',
        'grupos_mensajes_miembros',
        'grupos_mensajes_chat',
        'grupos_mensajes_lecturas'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', tbl);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', tbl);
        END IF;
    END LOOP;
END $$;

COMMIT;
