-- 011_recuperacion_password_y_consistencia.sql
-- 1. Solicitudes de recuperación de contraseña olvidada (avisos al encargado de Personal y Roles)
-- 2. Columnas de consistencia en ubicaciones, usuarios, pedidos y reuniones
-- 3. Limpieza de valores por defecto genéricos en certificados de calidad

-- 1. Tabla de solicitudes de recuperación de contraseña
CREATE TABLE IF NOT EXISTS solicitudes_recuperacion_password (
    id_solicitud SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    identificador_ingresado VARCHAR(255) NOT NULL,
    mensaje VARCHAR(300),
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ATENDIDA', 'DESCARTADA')),
    atendido_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    atendido_en TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_sol_recup_estado ON solicitudes_recuperacion_password(estado);
CREATE INDEX IF NOT EXISTS idx_sol_recup_usuario ON solicitudes_recuperacion_password(id_usuario);

-- 2. Columnas faltantes en ubicaciones y usuarios (evita errores en Organización y filtros de usuarios activos)
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) DEFAULT 'Sede Operativa';
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Control exacto de descuento de stock y fecha de despacho en pedidos
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS stock_descontado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS despachado_en TIMESTAMP WITH TIME ZONE;

UPDATE pedidos
SET stock_descontado = TRUE
WHERE estado_pedido = 'FACTURADO' AND stock_descontado = FALSE;

UPDATE pedidos
SET despachado_en = COALESCE(despachado_en, CURRENT_TIMESTAMP)
WHERE estado_pedido = 'DESPACHADO' AND despachado_en IS NULL;

-- 4. Valores por defecto genéricos en certificados de calidad
ALTER TABLE certificados_calidad ALTER COLUMN senasa_resolucion SET DEFAULT 'N° AUTORIZACIÓN SANITARIA';
ALTER TABLE certificados_calidad ALTER COLUMN ciudad_emision SET DEFAULT 'Ciudad';

-- 5. Columnas de ubicación y alcance en reuniones
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL;
ALTER TABLE reuniones ADD COLUMN IF NOT EXISTS alcance VARCHAR(50) DEFAULT 'general';

-- 6. Asegurar que todos los roles tengan entrada en roles_permisos para cada módulo existente sin pisar cambios manuales
INSERT INTO permisos (modulo, codigo_permiso, descripcion)
VALUES ('mensajes', 'mensajes_acceso', 'Acceso a la mensajería interna entre empleados')
ON CONFLICT (codigo_permiso) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT r.id_rol, p.id, (r.id_rol = 1 OR p.modulo = 'mensajes'), (r.id_rol = 1 OR p.modulo = 'mensajes')
FROM roles r
CROSS JOIN permisos p
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

