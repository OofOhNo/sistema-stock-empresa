-- 005_roles_calidad_errores_sitios.sql
-- Certificados de calidad y sanidad, reporte de incidencias/errores, gerentes de sitio y organización

BEGIN;

-- 1. Ampliar ubicaciones para gerentes de sitio
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS id_gerente INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(50);
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS direccion_completa VARCHAR(255);

-- Asignar a Mariana como gerente de sitio de la Ubicación 1
UPDATE ubicaciones 
SET id_gerente = 3, 
    telefono_contacto = '+51 987 111 222',
    direccion_completa = 'Av. Central 450, Parque Industrial'
WHERE id_ubicacion = 1 AND id_gerente IS NULL;

-- 2. Tabla de Certificados de Calidad y Sanidad
CREATE TABLE IF NOT EXISTS certificados_calidad (
    id_certificado SERIAL PRIMARY KEY,
    codigo_certificado VARCHAR(100) NOT NULL UNIQUE,
    tipo_certificado VARCHAR(100) NOT NULL,
    lote_o_producto VARCHAR(150),
    entidad_emisora VARCHAR(150) NOT NULL,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(50) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'POR_VENCER', 'VENCIDO', 'SUSPENDIDO')),
    id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    archivo_url TEXT,
    observaciones TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Registros de ejemplo de Calidad y Sanidad
INSERT INTO certificados_calidad (
    codigo_certificado, tipo_certificado, lote_o_producto, entidad_emisora, 
    fecha_emision, fecha_vencimiento, estado, id_ubicacion, id_usuario, observaciones
)
VALUES 
    ('CERT-SAN-2026-001', 'Registro Sanitario de Alimentos', 'Lote General Almacén', 'DIGESA', CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE + INTERVAL '300 days', 'VIGENTE', 1, 3, 'Conformidad microbiológica y físico-química aprobada'),
    ('CERT-HACCP-2026-08', 'Certificación HACCP Inocuidad', 'Línea de Empaque al Vacío', 'SGS del Perú', CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE + INTERVAL '240 days', 'VIGENTE', 1, 3, 'Auditoría anual de puntos críticos de control aprobada con 98%'),
    ('CERT-BPM-2026-14', 'Buenas Prácticas de Manufactura', 'Área de Despacho y Etiquetado', 'SENASA', CURRENT_DATE - INTERVAL '200 days', CURRENT_DATE + INTERVAL '20 days', 'POR_VENCER', 1, 3, 'Programar re-inspección antes de la fecha de vencimiento')
ON CONFLICT (codigo_certificado) DO NOTHING;

-- 3. Tabla de Reportes de Errores e Incidencias
CREATE TABLE IF NOT EXISTS reportes_errores (
    id_error SERIAL PRIMARY KEY,
    codigo_incidencia VARCHAR(50) NOT NULL UNIQUE,
    titulo VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    area_modulo VARCHAR(100) NOT NULL,
    severidad VARCHAR(20) NOT NULL CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
    estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESCARTADO')),
    id_usuario_reporta INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    id_usuario_asigna INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    solucion_adoptada TEXT,
    fecha_reporte TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_solucion TIMESTAMP
);

-- Incidencias de ejemplo
INSERT INTO reportes_errores (
    codigo_incidencia, titulo, descripcion, area_modulo, severidad, estado, id_usuario_reporta, solucion_adoptada
)
VALUES 
    ('INC-2026-001', 'Diferencia en conteo físico de monitores', 'El kardex registraba 16 y en tarima física se contaron 15 unidades', 'Stock / Kardex', 'MEDIA', 'RESUELTO', 3, 'Se cuadró inventario con movimiento de ajuste debidamente autorizado'),
    ('INC-2026-002', 'Etiqueta de cliente con código de barras ilegible', 'El escáner del transportista no leía la etiqueta de despacho', 'Despacho', 'BAJA', 'RESUELTO', 3, 'Se calibró la impresora térmica y se reemplazó el rollo de etiquetas'),
    ('INC-2026-003', 'Retraso de transporte por clima en ruta norte', 'Camión de reparto detenido en peaje por mantenimiento de vía', 'Despacho', 'ALTA', 'EN_REVISION', 3, NULL)
ON CONFLICT (codigo_incidencia) DO NOTHING;

-- 4. Registrar nuevos módulos en permisos
INSERT INTO permisos (modulo, codigo_permiso, descripcion)
VALUES 
    ('calidad', 'MOD_CALIDAD', 'Módulo de certificados de calidad y sanidad'),
    ('errores', 'MOD_ERRORES', 'Módulo de reportes de errores e incidencias'),
    ('organizacion', 'MOD_ORGANIZACION', 'Módulo de organización y gerentes de sitio')
ON CONFLICT (codigo_permiso) DO NOTHING;

-- Asignar permisos a roles existentes
INSERT INTO roles_permisos (rol_id, permiso_id, puede_ver, puede_editar)
SELECT r.id_rol, p.id, true, (r.id_rol IN (1, 2, 3))
FROM roles r
CROSS JOIN permisos p
WHERE p.codigo_permiso IN ('MOD_CALIDAD', 'MOD_ERRORES', 'MOD_ORGANIZACION')
ON CONFLICT (rol_id, permiso_id) DO UPDATE 
SET puede_ver = true, puede_editar = EXCLUDED.puede_editar;

COMMIT;
