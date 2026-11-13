-- Migración 016: Soporte decimal (NUMERIC(12,2)) para stock en kg y usuario nullable en kardex automático

ALTER TABLE inventario
    ALTER COLUMN cantidad_fisica TYPE NUMERIC(12,2) USING ROUND(cantidad_fisica::numeric, 2),
    ALTER COLUMN cantidad_reservada TYPE NUMERIC(12,2) USING ROUND(cantidad_reservada::numeric, 2);

ALTER TABLE movimientos_kardex
    ALTER COLUMN cantidad TYPE NUMERIC(12,2) USING ROUND(cantidad::numeric, 2),
    ALTER COLUMN id_usuario DROP NOT NULL;
