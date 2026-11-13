-- ==============================================================================
-- MIGRACIÓN 015: DESCRIPCIÓN INTERNA DE VEHÍCULOS Y PUNTOS DE LLEGADA POR RUC SUNAT
-- ==============================================================================

BEGIN;

ALTER TABLE gre_vehiculos
    ADD COLUMN IF NOT EXISTS descripcion TEXT DEFAULT '';

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

COMMIT;
