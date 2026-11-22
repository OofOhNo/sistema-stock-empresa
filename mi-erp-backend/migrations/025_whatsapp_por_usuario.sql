-- ==============================================================================
-- MIGRACIÓN 025: SESIÓN DE WHATSAPP INDIVIDUAL POR USUARIO
-- ==============================================================================
-- Permite que cada usuario del ERP vincule su propio WhatsApp mediante QR,
-- de modo que al usar "Enviar + WhatsApp" salga desde su propio número y llegue
-- directamente al chat del destinatario (sin prefijos ni rebotes al chat propio).

BEGIN;

DO $$
DECLARE
    tiene_columna BOOLEAN;
    creds_json TEXT;
    wa_digits TEXT;
    usuario_match INTEGER;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'whatsapp_auth_state'
          AND column_name = 'id_usuario'
    ) INTO tiene_columna;

    IF NOT tiene_columna THEN
        ALTER TABLE whatsapp_auth_state
            ADD COLUMN id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE CASCADE;

        -- Detectar el propietario actual comparando los últimos 7 dígitos de creds.me.id
        SELECT datos INTO creds_json
        FROM whatsapp_auth_state
        WHERE clave = 'creds'
        LIMIT 1;

        IF creds_json IS NOT NULL THEN
            BEGIN
                wa_digits := split_part(
                    split_part((creds_json::jsonb -> 'me' ->> 'id'), '@', 1),
                    ':',
                    1
                );
                wa_digits := regexp_replace(COALESCE(wa_digits, ''), '\D', '', 'g');
            EXCEPTION WHEN OTHERS THEN
                wa_digits := '';
            END;
        END IF;

        IF LENGTH(COALESCE(wa_digits, '')) >= 7 THEN
            SELECT u.id_usuario INTO usuario_match
            FROM usuarios u
            WHERE COALESCE(u.activo, TRUE) = TRUE
              AND RIGHT(regexp_replace(COALESCE(u.telefono_whatsapp, ''), '\D', '', 'g'), 7) = RIGHT(wa_digits, 7)
            ORDER BY u.id_usuario ASC
            LIMIT 1;
        END IF;

        IF usuario_match IS NULL THEN
            SELECT u.id_usuario INTO usuario_match
            FROM usuarios u
            LEFT JOIN roles r ON u.rol_id = r.id_rol
            WHERE COALESCE(u.activo, TRUE) = TRUE
              AND r.nombre = 'Admin Central'
            ORDER BY u.id_usuario ASC
            LIMIT 1;
        END IF;

        IF usuario_match IS NOT NULL THEN
            UPDATE whatsapp_auth_state
            SET id_usuario = usuario_match
            WHERE id_usuario IS NULL;
        ELSE
            DELETE FROM whatsapp_auth_state WHERE id_usuario IS NULL;
        END IF;

        ALTER TABLE whatsapp_auth_state ALTER COLUMN id_usuario SET NOT NULL;
        ALTER TABLE whatsapp_auth_state DROP CONSTRAINT IF EXISTS whatsapp_auth_state_pkey;
        ALTER TABLE whatsapp_auth_state ADD PRIMARY KEY (id_usuario, clave);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_state_usuario
    ON whatsapp_auth_state (id_usuario);

COMMIT;
