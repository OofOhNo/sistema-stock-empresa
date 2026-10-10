-- 004_clientes_y_pedidos_despacho.sql
-- Nuevos campos para clientes, permisos granulares de celular, control horario (área),
-- opciones de etiquetado y sellado al vacío en pedidos, y estado LISTO_DESPACHO.

BEGIN;

-- 1. Ampliar tabla clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contacto VARCHAR(150);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cargo VARCHAR(100);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS celular VARCHAR(50);

-- Actualizar cliente inicial con datos de ejemplo si existen
UPDATE clientes 
SET nombre_comercial = 'Cliente Corporativo Principal',
    contacto = 'Ing. Carlos Mendoza',
    cargo = 'Jefe de Compras',
    celular = '+51 987 654 321'
WHERE id_cliente = 1 AND nombre_comercial IS NULL;

-- 2. Permiso granular y área en tabla usuarios
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS puede_ver_celulares BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area VARCHAR(50) NOT NULL DEFAULT 'ADMINISTRACION';

-- Usuarios administradores y gerentes ven celulares por defecto
UPDATE usuarios SET puede_ver_celulares = true WHERE rol_id IN (1, 2);

-- 3. Pedidos: etiquetado, sellado al vacío y estado LISTO_DESPACHO
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS etiquetado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS sellado_vacio BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_pedido_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_pedido_check 
    CHECK (estado_pedido IN ('PENDIENTE', 'LISTO_DESPACHO', 'FACTURADO', 'DESPACHADO', 'CANCELADO'));

-- 4. Registrar módulo de permisos de clientes
INSERT INTO permisos (modulo, codigo_permiso, descripcion)
VALUES ('clientes', 'MOD_CLIENTES', 'Módulo de clientes y contactos')
ON CONFLICT (codigo_permiso) DO NOTHING;

-- Matriz de permisos inicial para el nuevo módulo
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT r.id_rol, p.id, true, (r.id_rol IN (1, 2, 3))
FROM roles r
CROSS JOIN permisos p
WHERE p.codigo_permiso = 'MOD_CLIENTES'
ON CONFLICT (rol_id, permiso_id) DO UPDATE 
SET puede_ver = true, puede_editar = EXCLUDED.puede_editar;

COMMIT;

