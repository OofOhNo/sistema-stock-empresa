# ==============================================================================
# DOCKERFILE BACKEND (Node.js Express + Migraciones PostgreSQL)
# ==============================================================================
FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero para aprovechar cache de capas Docker
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el código de la aplicación y scripts de migración
COPY . .

# Exponer el puerto del servidor
EXPOSE 3000

# Al iniciar: ejecuta las migraciones automáticas en Supabase/PostgreSQL y luego levanta Express
CMD ["sh", "-c", "node scripts/migrate.js && node index.js"]

