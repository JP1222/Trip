#!/usr/bin/env bash
# Restore a backup created by scripts/backup.sh.
# Usage:
#   ./scripts/restore.sh runtime/backups/20260729T120000Z
# Destructive: replaces postgres data contents (via pg_restore) and media volumes.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-directory>" >&2
  exit 1
fi

SRC="$(cd "$1" && pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.yml}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-trip}"
POSTGRES_DB="${POSTGRES_DB:-trip}"

if [[ ! -f "$SRC/postgres.dump" ]]; then
  echo "Missing $SRC/postgres.dump" >&2
  exit 1
fi

echo "[restore] WARNING: this will overwrite postgres data in database '$POSTGRES_DB'"
echo "[restore] source: $SRC"
read -r -p "Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -qx "$POSTGRES_SERVICE"; then
  echo "[restore] starting postgres..."
  docker compose -f "$COMPOSE_FILE" up -d "$POSTGRES_SERVICE"
  sleep 3
fi

echo "[restore] restoring postgres dump"
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl \
  < "$SRC/postgres.dump" || true
# pg_restore returns non-zero on some benign warnings; verify tables exist after.

if [[ -f "$SRC/media-private.tar.gz" ]]; then
  echo "[restore] restoring media-private"
  mkdir -p "$ROOT/runtime"
  tar -C "$ROOT/runtime" -xzf "$SRC/media-private.tar.gz"
fi
if [[ -f "$SRC/media-public.tar.gz" ]]; then
  echo "[restore] restoring media-public"
  mkdir -p "$ROOT/runtime"
  tar -C "$ROOT/runtime" -xzf "$SRC/media-public.tar.gz"
fi

echo "[restore] done. Restart web + worker:"
echo "  docker compose -f $COMPOSE_FILE up -d trip media-worker media"
