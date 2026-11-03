-- ==============================================================================
-- MIGRACIÓN 013: MEJORAS EN FACTURACIÓN, NOTAS DE PEDIDO, TIPOS DE PRODUCTO Y PESOS
-- ==============================================================================

BEGIN;

-- 1. Actualizar datos fijos oficiales de la Empresa Emisora del sistema
UPDATE configuracion_empresa_sunat
SET ruc_emisor = '20608725394',
    razon_social = 'PROCESOS CARNICOS S.A.C.',
    nombre_comercial = 'PROCESOS CÁRNICOS S.A.C.'
WHERE id_config = 1;

-- 2. Añadir campo peso_total a pedidos
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS peso_total NUMERIC(10,2) DEFAULT NULL;

-- 3. Tabla de Tipos de Producto
CREATE TABLE IF NOT EXISTS tipos_producto (
    id_tipo_producto SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tipos_producto (nombre, descripcion) VALUES
    ('Carnes y Cortes', 'Cortes de vacuno, porcino, ovino y aves'),
    ('Embutidos y Chacinados', 'Chorizos, salchichas, fiambres y jamones'),
    ('Vísceras y Menudencias', 'Hígado, corazón, mondongo y menudos'),
    ('Insumos y Condimentos', 'Especias, sales, marinados y aditivos'),
    ('Empaques y Envasado', 'Bolsas al vacío, bandejas y etiquetas')
ON CONFLICT (nombre) DO NOTHING;

-- 4. Vincular tipo de producto a la tabla productos
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS id_tipo_producto INTEGER REFERENCES tipos_producto(id_tipo_producto);

-- Asignar tipo 1 por defecto a los productos que no lo tengan
UPDATE productos 
SET id_tipo_producto = 1 
WHERE id_tipo_producto IS NULL;

-- 5. Tabla de Notas de Pedido (Documento comercial interno imprimible no tributario)
CREATE TABLE IF NOT EXISTS notas_pedido (
    id_nota_pedido SERIAL PRIMARY KEY,
    correlativo INTEGER NOT NULL,
    numero_nota VARCHAR(60) NOT NULL UNIQUE,
    id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    id_cliente INTEGER REFERENCES clientes(id_cliente) ON DELETE SET NULL,
    cliente_nombre VARCHAR(255) NOT NULL,
    cliente_documento VARCHAR(50),
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_texto VARCHAR(100),
    id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion),
    id_usuario INTEGER REFERENCES usuarios(id_usuario),
    peso_total NUMERIC(10,2) NOT NULL DEFAULT 0,
    monto_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado VARCHAR(30) NOT NULL DEFAULT 'EMITIDO' CHECK (estado IN ('EMITIDO', 'ANULADO')),
    observaciones TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_notas_pedido (
    id_detalle SERIAL PRIMARY KEY,
    id_nota_pedido INTEGER NOT NULL REFERENCES notas_pedido(id_nota_pedido) ON DELETE CASCADE,
    id_producto INTEGER REFERENCES productos(id_producto) ON DELETE SET NULL,
    descripcion VARCHAR(255) NOT NULL,
    peso NUMERIC(10,2) NOT NULL DEFAULT 0,
    cantidad NUMERIC(10,2) NOT NULL DEFAULT 1,
    precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Correlativo interno atómico para Notas de Pedido
CREATE TABLE IF NOT EXISTS correlativos_internos (
    tipo_documento VARCHAR(30) PRIMARY KEY,
    ultimo_correlativo INTEGER NOT NULL DEFAULT 0
);

INSERT INTO correlativos_internos (tipo_documento, ultimo_correlativo)
VALUES ('NOTA_PEDIDO', 0)
ON CONFLICT (tipo_documento) DO NOTHING;

-- 6. Ampliar comprobantes para peso, cuotas, división de pagos y origen manual
ALTER TABLE comprobantes
    ADD COLUMN IF NOT EXISTS id_cliente INTEGER REFERENCES clientes(id_cliente),
    ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion),
    ADD COLUMN IF NOT EXISTS peso_total NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS cantidad_cuotas INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS origen_facturacion VARCHAR(20) DEFAULT 'PEDIDO',
    ADD COLUMN IF NOT EXISTS es_pago_dividido BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS monto_dividido NUMERIC(12,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS porcentaje_dividido NUMERIC(5,2) DEFAULT NULL;

-- 7. Permiso de sección de facturación en usuarios (AMBAS, PEDIDOS, MANUAL)
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS seccion_facturacion VARCHAR(20) NOT NULL DEFAULT 'AMBAS';

UPDATE usuarios 
SET seccion_facturacion = 'AMBAS'
WHERE seccion_facturacion IS NULL;

COMMIT;
