-- ==============================================================================
-- MIGRACIÓN 014: CARPETAS DE CLIENTES, BOLETAS AUTOMÁTICAS + IMPRESIÓN EN SEGUNDO PLANO,
-- GUÍAS DE REMISIÓN ELECTRÓNICAS (GRE EG07) Y CALENDARIO DE PAGOS (ADMIN CENTRAL)
-- ==============================================================================

BEGIN;

-- 1. CARPETAS PERSONALIZADAS PARA CLIENTES
CREATE TABLE IF NOT EXISTS carpetas_clientes (
    id_carpeta SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    color VARCHAR(30) NOT NULL DEFAULT 'indigo',
    descripcion TEXT,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS id_carpeta INTEGER REFERENCES carpetas_clientes(id_carpeta) ON DELETE SET NULL;

-- 2. CONFIGURACIÓN DEL GENERADOR AUTOMÁTICO DE BOLETAS Y COLA DE IMPRESIÓN
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

INSERT INTO config_boletas_automaticas (id_config, id_ubicacion)
VALUES (1, (SELECT id_ubicacion FROM ubicaciones ORDER BY id_ubicacion ASC LIMIT 1))
ON CONFLICT (id_config) DO NOTHING;

CREATE TABLE IF NOT EXISTS cola_impresion_boletas (
    id_cola SERIAL PRIMARY KEY,
    id_comprobante INTEGER NOT NULL REFERENCES comprobantes(id_comprobante) ON DELETE CASCADE,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'IMPRESO', 'OMITIDO')),
    origen VARCHAR(30) NOT NULL DEFAULT 'AUTOMATICA',
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    impreso_en TIMESTAMP WITH TIME ZONE
);

-- 3. GUÍA DE REMISIÓN ELECTRÓNICA (GRE - REMITENTE EG07) Y CATÁLOGOS FRECUENTES
INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo)
VALUES ('09', 'EG07', 931)
ON CONFLICT (serie) DO NOTHING;

CREATE TABLE IF NOT EXISTS gre_puntos_partida (
    id_punto SERIAL PRIMARY KEY,
    tipo VARCHAR(80) NOT NULL DEFAULT '-',
    ubigeo VARCHAR(10) NOT NULL,
    domicilio TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ubigeo, domicilio)
);

INSERT INTO gre_puntos_partida (tipo, ubigeo, domicilio) VALUES
    ('DOMICILIO FISCAL', '040101', 'OTR. ZONA N 24 Y 25 MZ. 12 P.J. SEMIRURAL PACHACUTEC (SUBLOTE 7A-1 ZN H) AREQUIPA - AREQUIPA - AREQUIPA'),
    ('-', '150140', 'AV. AYACUCHO MZ. H LOTE. 9 DPTO. 101 URB. LIGURIA LIMA - LIMA - SANTIAGO DE SURCO')
ON CONFLICT (ubigeo, domicilio) DO NOTHING;

CREATE TABLE IF NOT EXISTS gre_vehiculos (
    id_vehiculo SERIAL PRIMARY KEY,
    placa VARCHAR(20) NOT NULL UNIQUE,
    entidad_emisora VARCHAR(150) DEFAULT '',
    numero_autorizacion VARCHAR(100) DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gre_vehiculos (placa) VALUES
    ('BEG445'),
    ('VCB764'),
    ('ADD066'),
    ('VAR891')
ON CONFLICT (placa) DO NOTHING;

CREATE TABLE IF NOT EXISTS gre_conductores (
    id_conductor SERIAL PRIMARY KEY,
    licencia VARCHAR(30) NOT NULL,
    tipo_documento VARCHAR(60) NOT NULL DEFAULT 'DOCUMENTO NACIONAL DE IDENTIDAD',
    numero_documento VARCHAR(20) NOT NULL UNIQUE,
    apellidos_nombres VARCHAR(255) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO gre_conductores (licencia, tipo_documento, numero_documento, apellidos_nombres) VALUES
    ('U46531963', 'DOCUMENTO NACIONAL DE IDENTIDAD', '46531963', 'CALERO VALDANO GRISEL DANITZA'),
    ('Q41912221', 'DOCUMENTO NACIONAL DE IDENTIDAD', '41912221', 'ICAZA TOSONI BRENDA PAOLA'),
    ('U10006980', 'DOCUMENTO NACIONAL DE IDENTIDAD', '10006980', 'ARAMAYO GUEVARA JAVIER GUSTAVO'),
    ('H29563135', 'DOCUMENTO NACIONAL DE IDENTIDAD', '29563135', 'SOSA ALFARO WALTER EDUARDO')
ON CONFLICT (numero_documento) DO NOTHING;

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

-- 4. CALENDARIO DE PAGOS (SOLO ADMIN CENTRAL)
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

COMMIT;
