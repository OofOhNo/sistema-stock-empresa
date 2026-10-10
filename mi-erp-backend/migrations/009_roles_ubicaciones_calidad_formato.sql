-- ==============================================================================
-- MIGRACIÓN 009: Control de Acceso por Ubicación en Roles y Formato Oficial de Certificados de Calidad
-- ==============================================================================

-- 1. Control de acceso por ubicación en la tabla roles
ALTER TABLE roles ADD COLUMN IF NOT EXISTS puede_ver_otras_ubicaciones BOOLEAN DEFAULT FALSE;

-- Por defecto, Admin Central y Gerente de Área pueden ver todas las ubicaciones
UPDATE roles SET puede_ver_otras_ubicaciones = TRUE WHERE id_rol IN (1, 2);

-- 2. Campos para el Certificado de Calidad Oficial según formato SENASA / Procesos Cárnicos S.A.C.
ALTER TABLE certificados_calidad ADD COLUMN IF NOT EXISTS id_cliente INTEGER REFERENCES clientes(id_cliente) ON DELETE SET NULL;
ALTER TABLE certificados_calidad ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(255);
ALTER TABLE certificados_calidad ADD COLUMN IF NOT EXISTS cliente_ruc VARCHAR(20);
ALTER TABLE certificados_calidad ADD COLUMN IF NOT EXISTS senasa_resolucion VARCHAR(200) DEFAULT 'N° 000111-MINAGRI-SENASA-AREQUIPA';
ALTER TABLE certificados_calidad ADD COLUMN IF NOT EXISTS ciudad_emision VARCHAR(100) DEFAULT 'Arequipa';
ALTER TABLE certificados_calidad ADD COLUMN IF NOT EXISTS items_detalle JSONB DEFAULT '[]'::jsonb;

