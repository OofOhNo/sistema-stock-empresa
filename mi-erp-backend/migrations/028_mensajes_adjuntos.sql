-- Agrega soporte para archivos y fotos adjuntas en mensajes directos y grupos.
ALTER TABLE public.mensajes_internos
    ADD COLUMN IF NOT EXISTS adjunto_url TEXT,
    ADD COLUMN IF NOT EXISTS adjunto_nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS adjunto_tipo VARCHAR(20),
    ADD COLUMN IF NOT EXISTS adjunto_mime VARCHAR(120),
    ADD COLUMN IF NOT EXISTS adjunto_tamano BIGINT;

ALTER TABLE public.grupos_mensajes_chat
    ADD COLUMN IF NOT EXISTS adjunto_url TEXT,
    ADD COLUMN IF NOT EXISTS adjunto_nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS adjunto_tipo VARCHAR(20),
    ADD COLUMN IF NOT EXISTS adjunto_mime VARCHAR(120),
    ADD COLUMN IF NOT EXISTS adjunto_tamano BIGINT;
