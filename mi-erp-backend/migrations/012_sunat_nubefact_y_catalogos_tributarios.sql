-- ==============================================================================
-- MIGRACIÓN 012: INTEGRACIÓN SUNAT / NUBEFACT API V1 Y CATÁLOGOS TRIBUTARIOS PERÚ
-- ==============================================================================

-- 1. Tabla de configuración tributaria del emisor y conexión NubeFact / SUNAT
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

INSERT INTO configuracion_empresa_sunat (
    id_config, ruc_emisor, razon_social, nombre_comercial, direccion_fiscal, ubigeo, modo_integracion
) VALUES (
    1, '20600000001', 'EMPRESA DEMO ERP S.A.C.', 'SISTEMA ERP PERÚ', 'Av. Empresarial 100, Lima - Perú', '150101', 'DEMO_NUBEFACT'
) ON CONFLICT (id_config) DO NOTHING;

-- 2. Ampliar Catálogo 06 de Tipos de Documento en clientes ('1'=DNI, '6'=RUC, '4'=CE, '7'=Pasaporte, '0'=Sin doc/Varios)
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_tipo_documento_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_tipo_documento_check
    CHECK (tipo_documento IN ('0', '1', '4', '6', '7'));

-- 3. Añadir Catálogo 07 (Tipo de Afectación del IGV) y Código Producto SUNAT en productos
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS tipo_afectacion_igv VARCHAR(2) NOT NULL DEFAULT '10',
    ADD COLUMN IF NOT EXISTS codigo_producto_sunat VARCHAR(20);

ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_tipo_afectacion_igv_check;
ALTER TABLE productos ADD CONSTRAINT productos_tipo_afectacion_igv_check
    CHECK (tipo_afectacion_igv IN ('10', '20', '30', '40'));

-- Asegurar unidades de medida oficiales del Catálogo 03 de SUNAT
INSERT INTO unidades_medida (codigo, nombre, simbolo, activo) VALUES
    ('NIU', 'Unidad', 'UND', TRUE),
    ('KGM', 'Kilogramo', 'KG', TRUE),
    ('GRM', 'Gramo', 'GR', TRUE),
    ('LTR', 'Litro', 'LT', TRUE),
    ('BX',  'Caja', 'CAJA', TRUE),
    ('PK',  'Paquete', 'PAQ', TRUE),
    ('BG',  'Bolsa', 'BOL', TRUE),
    ('TNE', 'Tonelada', 'TM', TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- 4. Ampliar series_sunat con las series oficiales F001, B001, FC01, BC01, FD01, BD01
INSERT INTO series_sunat (tipo_comprobante, serie, ultimo_correlativo) VALUES
    ('01', 'F001', 0),
    ('03', 'B001', 0),
    ('07', 'FC01', 0),
    ('07', 'BC01', 0),
    ('08', 'FD01', 0),
    ('08', 'BD01', 0)
ON CONFLICT (serie) DO NOTHING;

-- 5. Añadir campos tributarios completos (Catálogos 09, 51, 54, 59, QR, Letras, XML/CDR y enlaces NubeFact) a comprobantes
ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS comprobantes_tipo_comprobante_check;
ALTER TABLE comprobantes ADD CONSTRAINT comprobantes_tipo_comprobante_check
    CHECK (tipo_comprobante IN ('01', '03', '07', '08'));

ALTER TABLE comprobantes DROP CONSTRAINT IF EXISTS comprobantes_estado_sunat_check;
ALTER TABLE comprobantes ADD CONSTRAINT comprobantes_estado_sunat_check
    CHECK (estado_sunat IN ('PENDIENTE_ENVIO', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'ANULADO'));

ALTER TABLE comprobantes
    ADD COLUMN IF NOT EXISTS monto_gravada NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monto_exonerada NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monto_inafecta NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS medio_pago_sunat VARCHAR(3) DEFAULT '008',
    ADD COLUMN IF NOT EXISTS tipo_operacion_sunat VARCHAR(4) DEFAULT '0101',
    ADD COLUMN IF NOT EXISTS aplica_detraccion BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS codigo_detraccion VARCHAR(5),
    ADD COLUMN IF NOT EXISTS porcentaje_detraccion NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monto_detraccion NUMERIC(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS id_comprobante_referencia INTEGER REFERENCES comprobantes(id_comprobante) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS codigo_motivo_nc VARCHAR(2),
    ADD COLUMN IF NOT EXISTS descripcion_motivo_nc TEXT,
    ADD COLUMN IF NOT EXISTS cadena_qr TEXT,
    ADD COLUMN IF NOT EXISTS monto_en_letras VARCHAR(255),
    ADD COLUMN IF NOT EXISTS enlace_pdf TEXT,
    ADD COLUMN IF NOT EXISTS enlace_xml TEXT,
    ADD COLUMN IF NOT EXISTS enlace_cdr TEXT,
    ADD COLUMN IF NOT EXISTS xml_firmado TEXT,
    ADD COLUMN IF NOT EXISTS cdr_xml TEXT,
    ADD COLUMN IF NOT EXISTS respuesta_ose_json JSONB,
    ADD COLUMN IF NOT EXISTS modo_emision VARCHAR(30) DEFAULT 'DEMO_NUBEFACT';

-- Rellenar monto_gravada en comprobantes existentes donde sea 0
UPDATE comprobantes
SET monto_gravada = monto_subtotal
WHERE COALESCE(monto_gravada, 0) = 0 AND monto_subtotal > 0;

