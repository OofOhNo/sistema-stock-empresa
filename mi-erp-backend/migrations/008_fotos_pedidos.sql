-- Migración 008: Tabla de fotos y evidencias adjuntas a pedidos con expiración a los 2 meses
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

