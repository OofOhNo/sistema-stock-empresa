-- ==============================================================================
-- MIGRACIÓN 020: CALENDARIO DE PAGOS INDIVIDUAL POR USUARIO Y MÓDULO DE PERMISOS
-- ==============================================================================

BEGIN;

-- 1. Propietario explícito en pagos_programados para que cada usuario vea y gestione solo su calendario
ALTER TABLE pagos_programados
    ADD COLUMN IF NOT EXISTS id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE CASCADE;

UPDATE pagos_programados
SET id_usuario = creado_por
WHERE id_usuario IS NULL
  AND creado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pagos_programados_usuario_fecha
    ON pagos_programados (id_usuario, fecha_vencimiento);

-- 2. Registrar calendario_pagos en permisos/roles_permisos (habilitado por defecto solo para Admin Central)
INSERT INTO permisos (modulo, codigo_permiso, descripcion)
VALUES ('calendario_pagos', 'MOD_CALENDARIO_PAGOS', 'Calendario individual de pagos programados')
ON CONFLICT (codigo_permiso) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT
    r.id_rol,
    p.id,
    (r.nombre = 'Admin Central' OR r.id_rol = 1),
    (r.nombre = 'Admin Central' OR r.id_rol = 1)
FROM roles r
CROSS JOIN permisos p
WHERE p.modulo = 'calendario_pagos'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

COMMIT;
