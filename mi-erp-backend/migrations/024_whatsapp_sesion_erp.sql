-- ==============================================================================
-- MIGRACIÓN 024: SESIÓN PERSISTENTE DE WHATSAPP (BAILEYS) Y REGISTRO DE ENVÍO
-- ==============================================================================

BEGIN;

-- Almacenamiento persistente de credenciales y llaves Signal de WhatsApp Web
CREATE TABLE IF NOT EXISTS whatsapp_auth_state (
    clave VARCHAR(255) PRIMARY KEY,
    datos TEXT NOT NULL,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Proteger credenciales de WhatsApp contra acceso público PostgREST (Supabase)
ALTER TABLE whatsapp_auth_state ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE whatsapp_auth_state FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE whatsapp_auth_state FROM authenticated';
    END IF;
END $$;

-- Trazabilidad en mensajes_internos de envío automático por WhatsApp
ALTER TABLE mensajes_internos
    ADD COLUMN IF NOT EXISTS enviado_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS enviado_whatsapp_en TIMESTAMP WITH TIME ZONE NULL;

COMMIT;
