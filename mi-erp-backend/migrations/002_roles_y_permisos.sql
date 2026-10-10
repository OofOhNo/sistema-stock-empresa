-- 002_roles_y_permisos.sql
-- Inicialización y sincronización de roles, módulos de permisos y matriz de acceso

BEGIN;

-- 1. Roles estándar
INSERT INTO roles (id_rol, nombre, descripcion)
VALUES 
    (1, 'Admin Central', 'Acceso total y configuración del sistema'),
    (2, 'Gerente de Área', 'Supervisión global de operaciones y sucursales'),
    (3, 'Jefe de División', 'Control operativo de sucursal y logística'),
    (4, 'Empleado Normal', 'Operación diaria en tienda/almacén')
ON CONFLICT (id_rol) DO UPDATE 
SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion;

SELECT setval('roles_id_seq', COALESCE((SELECT MAX(id_rol) FROM roles), 1));

-- 2. Módulos y permisos base
INSERT INTO permisos (modulo, codigo_permiso, descripcion)
VALUES
    ('stock', 'MOD_STOCK', 'Módulo de inventario y kardex'),
    ('pedidos', 'MOD_PEDIDOS', 'Módulo de pedidos y órdenes'),
    ('usuarios', 'MOD_USUARIOS', 'Módulo de personal y permisos'),
    ('facturacion', 'MOD_FACT', 'Módulo de comprobantes electrónicos'),
    ('reuniones', 'MOD_REUNIONES', 'Módulo de agenda y salas'),
    ('productos', 'MOD_PRODUCTOS', 'Módulo de catálogo y precios'),
    ('ubicaciones', 'MOD_UBICACIONES', 'Módulo de sucursales y divisiones')
ON CONFLICT (codigo_permiso) DO UPDATE 
SET modulo = EXCLUDED.modulo, descripcion = EXCLUDED.descripcion;

-- Asegurar columnas en roles_permisos
ALTER TABLE roles_permisos ADD COLUMN IF NOT EXISTS puede_ver BOOLEAN DEFAULT false;
ALTER TABLE roles_permisos ADD COLUMN IF NOT EXISTS puede_editar BOOLEAN DEFAULT false;

-- 3. Matriz de permisos inicial para todos los roles y módulos
-- Admin Central (rol_id 1): Todo habilitado
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT 1, id, true, true
FROM permisos
WHERE modulo IN ('stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones', 'productos', 'ubicaciones')
ON CONFLICT (rol_id, permiso_id) DO UPDATE 
SET puede_ver = true, puede_editar = true;

-- Gerente de Área (rol_id 2): Todo habilitado excepto edición de usuarios/roles
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT 2, id, true, (modulo != 'usuarios')
FROM permisos
WHERE modulo IN ('stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones', 'productos', 'ubicaciones')
ON CONFLICT (rol_id, permiso_id) DO UPDATE 
SET puede_ver = EXCLUDED.puede_ver, puede_editar = EXCLUDED.puede_editar;

-- Jefe de División (rol_id 3): Stock, pedidos, reuniones y productos
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT 3, id, 
    modulo IN ('stock', 'pedidos', 'reuniones', 'productos', 'facturacion', 'ubicaciones'),
    modulo IN ('stock', 'pedidos', 'reuniones')
FROM permisos
WHERE modulo IN ('stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones', 'productos', 'ubicaciones')
ON CONFLICT (rol_id, permiso_id) DO UPDATE 
SET puede_ver = EXCLUDED.puede_ver, puede_editar = EXCLUDED.puede_editar;

-- Empleado Normal (rol_id 4): Stock, pedidos, facturación
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT 4, id, 
    modulo IN ('stock', 'pedidos', 'facturacion', 'reuniones', 'productos'),
    modulo IN ('stock', 'pedidos', 'facturacion')
FROM permisos
WHERE modulo IN ('stock', 'pedidos', 'usuarios', 'facturacion', 'reuniones', 'productos', 'ubicaciones')
ON CONFLICT (rol_id, permiso_id) DO UPDATE 
SET puede_ver = EXCLUDED.puede_ver, puede_editar = EXCLUDED.puede_editar;

COMMIT;

