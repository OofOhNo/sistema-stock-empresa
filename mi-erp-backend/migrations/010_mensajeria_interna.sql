-- Migración 010: Sistema de Mensajería Interna entre Empleados con Supervisión Silenciosa de Jefatura

CREATE TABLE IF NOT EXISTS mensajes_internos (
    id_mensaje SERIAL PRIMARY KEY,
    id_emisor INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_receptor INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    mensaje TEXT NOT NULL,
    leido BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mensajes_emisor ON mensajes_internos(id_emisor);
CREATE INDEX IF NOT EXISTS idx_mensajes_receptor ON mensajes_internos(id_receptor);
CREATE INDEX IF NOT EXISTS idx_mensajes_creado_en ON mensajes_internos(creado_en);

-- Agregar permiso 'mensajes' para la matriz de permisos
INSERT INTO permisos (modulo, codigo_permiso, descripcion)
VALUES ('mensajes', 'mensajes_acceso', 'Acceso a la mensajería interna entre empleados')
ON CONFLICT (codigo_permiso) DO NOTHING;

-- Activar permiso en todos los roles existentes
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT r.id_rol, p.id, true, true
FROM roles r, permisos p
WHERE p.modulo = 'mensajes'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

