-- ==============================================================================
-- SCHEMA COMPLETO - SISTEMA ERP STOCK Y FACTURACIÓN (SINGLE SOURCE OF TRUTH)
-- ==============================================================================

-- 1. DIVISIONES Y UBICACIONES
CREATE TABLE IF NOT EXISTS divisiones (
    id_division SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS ubicaciones (
    id_ubicacion SERIAL PRIMARY KEY,
    id_division INTEGER REFERENCES divisiones(id_division) ON DELETE RESTRICT,
    nombre VARCHAR(100) NOT NULL
);

-- 2. ROLES Y PERMISOS
CREATE TABLE IF NOT EXISTS roles (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    puede_ver_otras_ubicaciones BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permisos (
    id SERIAL PRIMARY KEY,
    modulo VARCHAR(50) NOT NULL,
    codigo_permiso VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles_permisos (
    rol_id INTEGER NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
    permiso_id INTEGER NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
    puede_ver BOOLEAN DEFAULT false,
    puede_editar BOOLEAN DEFAULT false,
    PRIMARY KEY (rol_id, permiso_id)
);

-- 3. USUARIOS
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol_id INTEGER NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,
    id_ubicacion INTEGER NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    puede_ver_celulares BOOLEAN NOT NULL DEFAULT false,
    area VARCHAR(50) NOT NULL DEFAULT 'ADMINISTRACION',
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. CATEGORÍAS Y PRODUCTOS
CREATE TABLE IF NOT EXISTS categorias (
    id_categoria SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS unidades_medida (
    id_unidad SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    simbolo VARCHAR(20) NOT NULL,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS productos (
    id_producto SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    id_categoria INTEGER REFERENCES categorias(id_categoria) ON DELETE SET NULL,
    id_unidad INTEGER REFERENCES unidades_medida(id_unidad) ON DELETE SET NULL,
    unidad_medida VARCHAR(50) DEFAULT 'Unidad',
    precio_venta NUMERIC(10,2) NOT NULL,
    precio_costo NUMERIC(12,2) DEFAULT 0,
    stock_minimo INTEGER DEFAULT 5,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. INVENTARIO Y KARDEX
CREATE TABLE IF NOT EXISTS inventario (
    id_inventario SERIAL PRIMARY KEY,
    id_producto INTEGER NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_ubicacion INTEGER NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE CASCADE,
    cantidad_fisica INTEGER DEFAULT 0,
    cantidad_reservada INTEGER DEFAULT 0,
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT inventario_id_producto_id_ubicacion_key UNIQUE (id_producto, id_ubicacion)
);

CREATE TABLE IF NOT EXISTS movimientos_kardex (
    id_movimiento SERIAL PRIMARY KEY,
    id_producto INTEGER NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    id_ubicacion INTEGER NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('INGRESO', 'SALIDA', 'RESERVA', 'LIBERACION')),
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    motivo VARCHAR(150) NOT NULL,
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'ANULADO', 'SOLICITUD_ANULACION', 'RECHAZADO')),
    id_usuario_anulador INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_anulacion TIMESTAMP
);

-- 6. CLIENTES, PEDIDOS Y DETALLE
CREATE TABLE IF NOT EXISTS clientes (
    id_cliente SERIAL PRIMARY KEY,
    tipo_documento VARCHAR(2) NOT NULL CHECK (tipo_documento IN ('1', '6', '4')),
    numero_documento VARCHAR(15) NOT NULL UNIQUE,
    razon_social_o_nombre VARCHAR(255) NOT NULL,
    nombre_comercial VARCHAR(255),
    contacto VARCHAR(150),
    cargo VARCHAR(100),
    celular VARCHAR(50),
    direccion VARCHAR(255),
    email VARCHAR(150),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido SERIAL PRIMARY KEY,
    id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente) ON DELETE RESTRICT,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    id_ubicacion INTEGER NOT NULL REFERENCES ubicaciones(id_ubicacion) ON DELETE RESTRICT,
    estado_pedido VARCHAR(50) DEFAULT 'PENDIENTE' CHECK (estado_pedido IN ('PENDIENTE', 'LISTO_DESPACHO', 'FACTURADO', 'DESPACHADO', 'CANCELADO')),
    fecha_limite_despacho TIMESTAMP,
    monto_total NUMERIC(10,2) NOT NULL,
    etiquetado BOOLEAN NOT NULL DEFAULT false,
    sellado_vacio BOOLEAN NOT NULL DEFAULT false,
    usuario_creador VARCHAR(100) DEFAULT 'Sistema',
    solicitado_por VARCHAR(100),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_pedidos (
    id_detalle SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    id_producto INTEGER NOT NULL REFERENCES productos(id_producto) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL
);

-- 7. FACTURACIÓN ELECTRÓNICA Y COMPROBANTES
CREATE TABLE IF NOT EXISTS series_sunat (
    id_serie SERIAL PRIMARY KEY,
    tipo_comprobante VARCHAR(2) NOT NULL,
    serie VARCHAR(4) NOT NULL UNIQUE,
    ultimo_correlativo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comprobantes (
    id_comprobante SERIAL PRIMARY KEY,
    id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    tipo_comprobante VARCHAR(2) NOT NULL CHECK (tipo_comprobante IN ('01', '03', '07')),
    serie VARCHAR(4) NOT NULL,
    correlativo INTEGER NOT NULL,
    monto_subtotal NUMERIC(10,2) NOT NULL,
    monto_igv NUMERIC(10,2) NOT NULL,
    monto_total NUMERIC(10,2) NOT NULL,
    forma_pago VARCHAR(20) DEFAULT 'CONTADO' CHECK (forma_pago IN ('CONTADO', 'CREDITO')),
    dias_credito INTEGER DEFAULT 0,
    fecha_vencimiento_cuota DATE,
    estado_sunat VARCHAR(50) DEFAULT 'PENDIENTE_ENVIO' CHECK (estado_sunat IN ('PENDIENTE_ENVIO', 'ACEPTADO', 'RECHAZADO', 'ANULADO')),
    codigo_hash TEXT,
    mensaje_cdr TEXT,
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT comprobantes_tipo_comprobante_serie_correlativo_key UNIQUE (tipo_comprobante, serie, correlativo)
);

CREATE TABLE IF NOT EXISTS pagos (
    id_pago SERIAL PRIMARY KEY,
    id_comprobante INTEGER REFERENCES comprobantes(id_comprobante) ON DELETE CASCADE,
    metodo_pago VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('EFECTIVO', 'TARJETA_CREDITO', 'TARJETA_DEBITO', 'YAPE', 'PLIN', 'TRANSFERENCIA')),
    monto NUMERIC(10,2) NOT NULL,
    fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. REUNIONES Y AGENDA
CREATE TABLE IF NOT EXISTS salas_reunion (
    id_sala SERIAL PRIMARY KEY,
    id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    nombre VARCHAR(100) NOT NULL,
    capacidad INTEGER,
    activa BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS reuniones (
    id_reunion SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    descripcion TEXT,
    fecha_hora_inicio TIMESTAMP NOT NULL,
    fecha_hora_fin TIMESTAMP NOT NULL,
    id_organizador INTEGER REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_sala INTEGER REFERENCES salas_reunion(id_sala) ON DELETE SET NULL,
    id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    alcance VARCHAR(50) DEFAULT 'general',
    enlace_videollamada VARCHAR(255),
    id_pedido_relacionado INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    estado VARCHAR(50) DEFAULT 'PROGRAMADA' CHECK (estado IN ('PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA')),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asistentes_reunion (
    id_reunion INTEGER NOT NULL REFERENCES reuniones(id_reunion) ON DELETE CASCADE,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    estado_invitacion VARCHAR(50) DEFAULT 'PENDIENTE' CHECK (estado_invitacion IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA', 'TENTATIVA')),
    PRIMARY KEY (id_reunion, id_usuario)
);

-- 9. AUDITORÍA INMUTABLE
CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria SERIAL PRIMARY KEY,
    id_usuario INTEGER,
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    id_entidad INTEGER,
    antes JSONB,
    despues JSONB,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION block_auditoria_updates()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación denegada: El registro de auditoría es inmutable y no se puede modificar ni eliminar.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_auditoria_updates ON auditoria;
CREATE TRIGGER trg_block_auditoria_updates
BEFORE UPDATE OR DELETE ON auditoria
FOR EACH ROW EXECUTE FUNCTION block_auditoria_updates();

-- 10. CALIDAD Y SANIDAD (CERTIFICADOS)
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
    id_cliente INTEGER REFERENCES clientes(id_cliente) ON DELETE SET NULL,
    cliente_nombre VARCHAR(255),
    cliente_ruc VARCHAR(20),
    senasa_resolucion VARCHAR(200) DEFAULT 'N° 000111-MINAGRI-SENASA-AREQUIPA',
    ciudad_emision VARCHAR(100) DEFAULT 'Arequipa',
    items_detalle JSONB DEFAULT '[]'::jsonb,
    archivo_url TEXT,
    observaciones TEXT,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. REPORTES DE ERRORES E INCIDENCIAS
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

-- 12. PERMISOS ESPECÍFICOS POR USUARIO PARA VER CELULARES DE CLIENTES
CREATE TABLE IF NOT EXISTS permisos_celulares_clientes (
    id_permiso SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_usuario_cliente_celular UNIQUE (id_usuario, id_cliente)
);

CREATE INDEX IF NOT EXISTS idx_permisos_celulares_usuario ON permisos_celulares_clientes(id_usuario);

-- 13. FOTOS Y EVIDENCIAS ADJUNTAS A PEDIDOS CON VIGENCIA DE 2 MESES
CREATE TABLE IF NOT EXISTS fotos_pedidos (
    id_foto SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    url_foto TEXT NOT NULL,
    nombre_archivo VARCHAR(255),
    descripcion TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expira_en TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '2 months')
);

CREATE INDEX IF NOT EXISTS idx_fotos_pedidos_pedido ON fotos_pedidos(id_pedido);
CREATE INDEX IF NOT EXISTS idx_fotos_pedidos_expira ON fotos_pedidos(expira_en);-- 14. SISTEMA DE MENSAJERÍA INTERNA ENTRE EMPLEADOS (CON MODO SUPERVISIÓN SILENCIOSA)
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
