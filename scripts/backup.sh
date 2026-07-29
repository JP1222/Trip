#!/usr/bin/env bash
# Backup PostgreSQL + media volumes for the single-host trip stack.
# Usage:
#   ./scripts/backup.sh
#   BACKUP_ROOT=/var/backups/trip ./scripts/backup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/runtime/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-trip}"
POSTGRES_DB="${POSTGRES_DB:-trip}"

mkdir -p "$DEST"

echo "[backup] writing to $DEST"

if docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx "$POSTGRES_SERVICE"; then
  echo "[backup] dumping postgres via compose service '$POSTGRES_SERVICE'"
  docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl \
    > "$DEST/postgres.dump"
elif command -v pg_dump >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
  echo "[backup] dumping postgres via DATABASE_URL"
  pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl > "$DEST/postgres.dump"
else
  echo "[backup] ERROR: neither compose postgres nor local pg_dump+DATABASE_URL available" >&2
  exit 1
fi

if [[ -d "$ROOT/runtime/media-private" ]]; then
  echo "[backup] archiving media-private"
  tar -C "$ROOT/runtime" -czf "$DEST/media-private.tar.gz" media-private
fi
if [[ -d "$ROOT/runtime/media-public" ]]; then
  echo "[backup] archiving media-public"
  tar -C "$ROOT/runtime" -czf "$DEST/media-public.tar.gz" media-public
fi

# Optional: keep a copy of legacy uploads until cutover is complete.
if [[ -d "${LEGACY_UPLOADS_PATH:-$ROOT/public/uploads}" ]]; then
  echo "[backup] archiving legacy uploads (read-only reference)"
  tar -C "$(dirname "${LEGACY_UPLOADS_PATH:-$ROOT/public/uploads}")" \
    -czf "$DEST/legacy-uploads.tar.gz" \
    "$(basename "${LEGACY_UPLOADS_PATH:-$ROOT/public/uploads}")" || true
fi

cat > "$DEST/MANIFEST.txt" <<EOF
stamp=$STAMP
host=$(hostname 2>/dev/null || echo unknown)
postgres_dump=postgres.dump
media_private=media-private.tar.gz
media_public=media-public.tar.gz
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

# Prune old backups (default keep 14)
KEEP="${BACKUP_KEEP:-14}"
if [[ "$KEEP" =~ ^[0-9]+$ ]] && [[ "$KEEP" -gt 0 ]]; then
  ls -1dt "$BACKUP_ROOT"/20* 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    echo "[backup] pruning $old"
    rm -rf "$old"
  done
fi

echo "[backup] complete: $DEST"
ls -lh "$DEST"
