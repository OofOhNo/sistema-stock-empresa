-- ==============================================================================
-- MIGRACIÓN 021: ACTIVAR ROW LEVEL SECURITY (RLS) EN TABLAS PÚBLICAS (SUPABASE)
-- ==============================================================================
-- Protege todas las tablas del esquema public frente a accesos externos vía
-- Supabase Data API (roles anon / authenticated), mientras la conexión directa
-- del backend Node.js (rol postgres con BYPASSRLS) mantiene acceso completo.
-- ==============================================================================

DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND NOT rowsecurity
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    END LOOP;
END $$;
