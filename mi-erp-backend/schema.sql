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
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) DEFAULT 'Sede',
    activo BOOLEAN DEFAULT TRUE,
    id_gerente INTEGER,
    telefono_contacto VARCHAR(50),
    direccion_completa TEXT
);

-- 2. ROLES Y PERMISOS
CREATE SEQUENCE IF NOT EXISTS roles_id_seq;

CREATE TABLE IF NOT EXISTS roles (
    id_rol INTEGER PRIMARY KEY DEFAULT nextval('roles_id_seq'),
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    puede_ver_otras_ubicaciones BOOLEAN DEFAULT FALSE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER SEQUENCE roles_id_seq OWNED BY roles.id_rol;

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

-- 3. USUARIOS Y RECUPERACIÓN DE CONTRASEÑA
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
    tipo_afectacion_igv VARCHAR(2) NOT NULL DEFAULT '10' CHECK (tipo_afectacion_igv IN ('10', '20', '30', '40')),
    codigo_producto_sunat VARCHAR(20),
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
    tipo_documento VARCHAR(2) NOT NULL CHECK (tipo_documento IN ('0', '1', '4', '6', '7')),
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
    stock_descontado BOOLEAN NOT NULL DEFAULT false,
    despachado_en TIMESTAMP WITH TIME ZONE,
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

-- 7. FACTURACIÓN ELECTRÓNICA, CONFIGURACIÓN SUNAT/NUBEFACT Y COMPROBANTES
CREATE TABLE IF NOT EXISTS configuracion_empresa_sunat (
    id_config INTEGER PRIMARY KEY DEFAULT 1 CHECK (id_config = 1),
    ruc_emisor VARCHAR(11) NOT NULL DEFAULT '20600000001',
    razon_social VARCHAR(255) NOT NULL DEFAULT 'EMPRESA DEMO ERP S.A.C.',
    nombre_comercial VARCHAR(255) DEFAULT 'SISTEMA ERP PERÚ',
    direccion_fiscal VARCHAR(255) DEFAULT 'Av. Empresarial 100, Lima - Perú',
    ubigeo VARCHAR(6) DEFAULT '150101',
    modo_integracion VARCHAR(30) NOT NULL DEFAULT 'DEMO_NUBEFACT'
        CHECK (modo_integracion IN ('DEMO_NUBEFACT', 'NUBEFACT_REAL')),
    nubefact_ruta TEXT DEFAULT 'https://demo.nubefact.com/api/v1/demo-integrada-erp',
    nubefact_token TEXT DEFAULT 'DEMO_TOKEN_NUBEFACT_2026_ACTIVO',
    igv_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 18.00,
    detraccion_cuenta_bn VARCHAR(50) DEFAULT '00-000-000000',
    enviar_automaticamente_sunat BOOLEAN NOT NULL DEFAULT TRUE,
    enviar_automaticamente_cliente BOOLEAN NOT NULL DEFAULT TRUE,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS series_sunat (
    id_serie SERIAL PRIMARY KEY,
    tipo_comprobante VARCHAR(2) NOT NULL,
    serie VARCHAR(4) NOT NULL UNIQUE,
    ultimo_correlativo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comprobantes (
    id_comprobante SERIAL PRIMARY KEY,
    id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    tipo_comprobante VARCHAR(2) NOT NULL CHECK (tipo_comprobante IN ('01', '03', '07', '08')),
    serie VARCHAR(4) NOT NULL,
    correlativo INTEGER NOT NULL,
    monto_subtotal NUMERIC(10,2) NOT NULL,
    monto_gravada NUMERIC(10,2) DEFAULT 0,
    monto_exonerada NUMERIC(10,2) DEFAULT 0,
    monto_inafecta NUMERIC(10,2) DEFAULT 0,
    monto_igv NUMERIC(10,2) NOT NULL,
    monto_total NUMERIC(10,2) NOT NULL,
    forma_pago VARCHAR(20) DEFAULT 'CONTADO' CHECK (forma_pago IN ('CONTADO', 'CREDITO')),
    dias_credito INTEGER DEFAULT 0,
    fecha_vencimiento_cuota DATE,
    medio_pago_sunat VARCHAR(3) DEFAULT '008',
    tipo_operacion_sunat VARCHAR(4) DEFAULT '0101',
    aplica_detraccion BOOLEAN DEFAULT FALSE,
    codigo_detraccion VARCHAR(5),
    porcentaje_detraccion NUMERIC(5,2) DEFAULT 0,
    monto_detraccion NUMERIC(10,2) DEFAULT 0,
    id_comprobante_referencia INTEGER REFERENCES comprobantes(id_comprobante) ON DELETE SET NULL,
    codigo_motivo_nc VARCHAR(2),
    descripcion_motivo_nc TEXT,
    estado_sunat VARCHAR(50) DEFAULT 'PENDIENTE_ENVIO' CHECK (estado_sunat IN ('PENDIENTE_ENVIO', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'ANULADO')),
    codigo_hash TEXT,
    mensaje_cdr TEXT,
    cadena_qr TEXT,
    monto_en_letras VARCHAR(255),
    enlace_pdf TEXT,
    enlace_xml TEXT,
    enlace_cdr TEXT,
    xml_firmado TEXT,
    cdr_xml TEXT,
    respuesta_ose_json JSONB,
    modo_emision VARCHAR(30) DEFAULT 'DEMO_NUBEFACT',
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
    empresa_nombre VARCHAR(255) DEFAULT '[NOMBRE DE LA EMPRESA / RAZÓN SOCIAL]',
    empresa_ruc VARCHAR(30) DEFAULT '[RUC DE LA EMPRESA]',
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(50) NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'POR_VENCER', 'VENCIDO', 'SUSPENDIDO')),
    id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    id_cliente INTEGER REFERENCES clientes(id_cliente) ON DELETE SET NULL,
    cliente_nombre VARCHAR(255),
    cliente_ruc VARCHAR(20),
    senasa_resolucion VARCHAR(200) DEFAULT 'N° AUTORIZACIÓN SANITARIA / RESOLUCIÓN',
    ciudad_emision VARCHAR(100) DEFAULT 'Ciudad',
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

-- 12. PERMISOS ESPECÍFFICOS POR USUARIO PARA VER CELULARES DE CLIENTES
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
CREATE INDEX IF NOT EXISTS idx_fotos_pedidos_expira ON fotos_pedidos(expira_en);

-- 14. SISTEMA DE MENSAJERÍA INTERNA ENTRE EMPLEADOS (CON MODO SUPERVISIÓN SILENCIOSA)
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


-- ==============================================================================
-- 013: MEJORAS EN FACTURACIÓN, NOTAS DE PEDIDO, TIPOS DE PRODUCTO Y PESOS
-- ==============================================================================
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS peso_total NUMERIC(10,2) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS tipos_producto (
    id_tipo_producto SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_tipo_producto INTEGER REFERENCES tipos_producto(id_tipo_producto);

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

CREATE TABLE IF NOT EXISTS correlativos_internos (
    tipo_documento VARCHAR(30) PRIMARY KEY,
    ultimo_correlativo INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE comprobantes
    ADD COLUMN IF NOT EXISTS id_cliente INTEGER REFERENCES clientes(id_cliente),
    ADD COLUMN IF NOT EXISTS id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion),
    ADD COLUMN IF NOT EXISTS peso_total NUMERIC(10,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS cantidad_cuotas INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS origen_facturacion VARCHAR(20) DEFAULT 'PEDIDO',
    ADD COLUMN IF NOT EXISTS es_pago_dividido BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS monto_dividido NUMERIC(12,2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS porcentaje_dividido NUMERIC(5,2) DEFAULT NULL;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS seccion_facturacion VARCHAR(20) NOT NULL DEFAULT 'AMBAS';

-- ==============================================================================
-- 014: CARPETAS DE CLIENTES, BOLETAS AUTOMÁTICAS, GRE EG07 Y CALENDARIO DE PAGOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS carpetas_clientes (
    id_carpeta SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    color VARCHAR(30) NOT NULL DEFAULT 'indigo',
    descripcion TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS id_carpeta INTEGER REFERENCES carpetas_clientes(id_carpeta) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS config_boletas_automaticas (
    id_config INTEGER PRIMARY KEY DEFAULT 1,
    activo BOOLEAN NOT NULL DEFAULT FALSE,
    intervalo_minutos INTEGER NOT NULL DEFAULT 30,
    monto_minimo NUMERIC(10,2) NOT NULL DEFAULT 35.00,
    monto_maximo NUMERIC(10,2) NOT NULL DEFAULT 680.00,
    peso_minimo_item NUMERIC(10,2) NOT NULL DEFAULT 0.50,
    peso_maximo_item NUMERIC(10,2) NOT NULL DEFAULT 8.00,
    hora_inicio VARCHAR(5) NOT NULL DEFAULT '08:00',
    hora_fin VARCHAR(5) NOT NULL DEFAULT '20:00',
    solo_horario_laboral BOOLEAN NOT NULL DEFAULT FALSE,
    id_ubicacion INTEGER REFERENCES ubicaciones(id_ubicacion) ON DELETE SET NULL,
    auto_imprimir_navegador BOOLEAN NOT NULL DEFAULT TRUE,
    ultima_ejecucion TIMESTAMP WITH TIME ZONE,
    proxima_ejecucion TIMESTAMP WITH TIME ZONE,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cola_impresion_boletas (
    id_cola SERIAL PRIMARY KEY,
    id_comprobante INTEGER NOT NULL REFERENCES comprobantes(id_comprobante) ON DELETE CASCADE,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'IMPRESO', 'OMITIDO')),
    origen VARCHAR(30) NOT NULL DEFAULT 'AUTOMATICA',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    impreso_en TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS gre_puntos_partida (
    id_punto SERIAL PRIMARY KEY,
    tipo VARCHAR(80) NOT NULL DEFAULT '-',
    ubigeo VARCHAR(10) NOT NULL,
    domicilio TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ubigeo, domicilio)
);

CREATE TABLE IF NOT EXISTS gre_vehiculos (
    id_vehiculo SERIAL PRIMARY KEY,
    placa VARCHAR(20) NOT NULL UNIQUE,
    descripcion TEXT DEFAULT '',
    entidad_emisora VARCHAR(150) DEFAULT '',
    numero_autorizacion VARCHAR(100) DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gre_puntos_llegada_cliente (
    id_punto_llegada SERIAL PRIMARY KEY,
    ruc VARCHAR(20) NOT NULL,
    codigo_anexo VARCHAR(20) NOT NULL DEFAULT '0000',
    tipo VARCHAR(80) NOT NULL DEFAULT 'DOMICILIO FISCAL',
    ubigeo VARCHAR(10) DEFAULT '',
    direccion TEXT NOT NULL,
    departamento VARCHAR(100) DEFAULT '',
    provincia VARCHAR(100) DEFAULT '',
    distrito VARCHAR(100) DEFAULT '',
    origen VARCHAR(30) NOT NULL DEFAULT 'SUNAT',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ruc, direccion)
);

CREATE TABLE IF NOT EXISTS gre_conductores (
    id_conductor SERIAL PRIMARY KEY,
    licencia VARCHAR(30) NOT NULL,
    tipo_documento VARCHAR(60) NOT NULL DEFAULT 'DOCUMENTO NACIONAL DE IDENTIDAD',
    numero_documento VARCHAR(20) NOT NULL UNIQUE,
    apellidos_nombres VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gre_bienes_frecuentes (
    id_bien_frecuente SERIAL PRIMARY KEY,
    bien_normalizado BOOLEAN NOT NULL DEFAULT FALSE,
    codigo_bien VARCHAR(50),
    codigo_subpartida VARCHAR(50),
    codigo_sunat VARCHAR(50),
    codigo_gtin VARCHAR(50),
    descripcion TEXT NOT NULL,
    unidad_medida VARCHAR(20) NOT NULL DEFAULT 'KGM',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guias_remision (
    id_gre SERIAL PRIMARY KEY,
    id_comprobante INTEGER REFERENCES comprobantes(id_comprobante) ON DELETE SET NULL,
    id_pedido INTEGER REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    id_cliente INTEGER REFERENCES clientes(id_cliente) ON DELETE SET NULL,
    tipo_gre VARCHAR(20) NOT NULL DEFAULT 'REMITENTE',
    serie VARCHAR(10) NOT NULL DEFAULT 'EG07',
    correlativo INTEGER NOT NULL,
    comercio_exterior BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_traslado VARCHAR(80) NOT NULL DEFAULT 'Venta',
    fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio_traslado DATE NOT NULL DEFAULT CURRENT_DATE,
    punto_partida_ubigeo VARCHAR(10),
    punto_partida_direccion TEXT NOT NULL,
    punto_llegada_ubigeo VARCHAR(10),
    punto_llegada_direccion TEXT NOT NULL,
    destinatario_tipo_doc VARCHAR(10) DEFAULT '6',
    destinatario_num_doc VARCHAR(20),
    destinatario_razon_social VARCHAR(255),
    unidad_peso_bruto VARCHAR(20) NOT NULL DEFAULT 'KGM',
    peso_bruto_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    modalidad_traslado VARCHAR(30) NOT NULL DEFAULT 'Privado',
    retorno_envases_vacios BOOLEAN NOT NULL DEFAULT FALSE,
    retorno_vehiculo_vacio BOOLEAN NOT NULL DEFAULT FALSE,
    transbordo_programado BOOLEAN NOT NULL DEFAULT FALSE,
    traslado_vehiculo_m1_l BOOLEAN NOT NULL DEFAULT FALSE,
    vehiculo_placa VARCHAR(20),
    vehiculo_entidad_autoriz VARCHAR(150),
    vehiculo_num_autoriz VARCHAR(100),
    conductor_tipo_doc VARCHAR(60) DEFAULT 'DOCUMENTO NACIONAL DE IDENTIDAD',
    conductor_num_doc VARCHAR(20),
    conductor_nombres VARCHAR(255),
    conductor_licencia VARCHAR(30),
    bienes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    cadena_qr TEXT,
    estado_sunat VARCHAR(30) NOT NULL DEFAULT 'ACEPTADO',
    creado_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(serie, correlativo)
);

CREATE TABLE IF NOT EXISTS pagos_programados (
    id_pago SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'SUELDOS',
    beneficiario VARCHAR(200),
    monto NUMERIC(12,2) NOT NULL DEFAULT 0,
    moneda VARCHAR(10) NOT NULL DEFAULT 'PEN',
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADO')),
    fecha_pagado TIMESTAMP WITH TIME ZONE,
    recurrente_mensual BOOLEAN NOT NULL DEFAULT FALSE,
    notas TEXT,
    creado_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
