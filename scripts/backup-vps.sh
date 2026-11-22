#!/usr/bin/env bash
# ==============================================================================
# RESPALDO DIARIO AUTOMÁTICO PARA VPS (BASE DE DATOS SUPABASE + FOTOS UPLOADS)
# ==============================================================================
# Instalación en el servidor VPS (ejecuta todos los días a las 03:00 AM):
#   chmod +x /opt/erp/scripts/backup-vps.sh
#   (crontab -l 2>/dev/null; echo "0 3 * * * /opt/erp/scripts/backup-vps.sh >> /var/log/erp-backup.log 2>&1") | crontab -
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/erp}"
BACKUP_DIR="${BACKUP_DIR:-/opt/erp-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${APP_DIR}/mi-erp-backend/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] No se encontró $ENV_FILE"
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
if [ -z "$DATABASE_URL" ]; then
  echo "[ERROR] DATABASE_URL no está definido en $ENV_FILE"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Iniciando respaldo de Supabase..."
docker run --rm postgres:16-alpine \
  pg_dump "$DATABASE_URL" --no-owner --no-acl -F c \
  > "${BACKUP_DIR}/db_${TIMESTAMP}.dump"

if [ -d "${APP_DIR}/mi-erp-backend/uploads" ]; then
  tar -czf "${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz" -C "${APP_DIR}/mi-erp-backend" uploads
fi

find "$BACKUP_DIR" -type f \( -name 'db_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Iseconds)] Respaldo completado en ${BACKUP_DIR}."
