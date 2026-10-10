-- Migración 007: Permisos específicos por usuario para ver números de teléfono de clientes
CREATE TABLE IF NOT EXISTS permisos_celulares_clientes (
    id_permiso SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_usuario_cliente_celular UNIQUE (id_usuario, id_cliente)
);

CREATE INDEX IF NOT EXISTS idx_permisos_celulares_usuario ON permisos_celulares_clientes(id_usuario);

