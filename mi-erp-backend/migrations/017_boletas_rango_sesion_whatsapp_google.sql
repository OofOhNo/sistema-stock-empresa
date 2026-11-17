-- ==============================================================================
-- MIGRACIÓN 017: BOLETAS RANGO ALEATORIO SIN STOCK, EXPIRACIÓN DE SESIÓN POR ROL,
-- WHATSAPP PUENTE DIRECTO EN EMPLEADOS Y LOGIN CORPORATIVO GOOGLE WORKSPACE
-- ==============================================================================

BEGIN;

-- 1. Rango aleatorio (minutos mínimo y máximo) en configuración de boletas automáticas
ALTER TABLE config_boletas_automaticas
    ADD COLUMN IF NOT EXISTS intervalo_min_minutos INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS intervalo_max_minutos INTEGER NOT NULL DEFAULT 10;

-- 2. Duración máxima fija de sesión (en minutos) por rol (NULL = sin límite automático)
ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS duracion_sesion_minutos INTEGER NULL;

-- 3. Teléfono WhatsApp directo por empleado para mensajería interna
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS telefono_whatsapp VARCHAR(30) NULL;

-- 4. Configuración dinámica para acceso con correo corporativo (Google Workspace)
CREATE TABLE IF NOT EXISTS configuracion_autenticacion (
    id_config INTEGER PRIMARY KEY DEFAULT 1,
    google_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
    google_client_id VARCHAR(255) NOT NULL DEFAULT '',
    dominios_corporativos VARCHAR(500) NOT NULL DEFAULT '',
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO configuracion_autenticacion (id_config, google_habilitado, google_client_id, dominios_corporativos)
VALUES (1, FALSE, '', '')
ON CONFLICT (id_config) DO NOTHING;

COMMIT;
