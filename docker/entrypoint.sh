#!/bin/sh
set -e

# Writable paths (bind mounts / volumes)
mkdir -p /app/data/comments /app/public/uploads

# First boot: seed trips.json if the data volume is empty
if [ ! -f /app/data/trips.json ]; then
  if [ -f /app/seed/data/trips.json ]; then
    echo "[entrypoint] Seeding data/trips.json from image seed…"
    cp /app/seed/data/trips.json /app/data/trips.json
  else
    echo "[entrypoint] WARNING: no trips.json seed found"
    echo "[]" > /app/data/trips.json
  fi
fi

# Ensure uploads placeholder exists
if [ ! -f /app/public/uploads/.gitkeep ]; then
  touch /app/public/uploads/.gitkeep 2>/dev/null || true
fi

echo "[entrypoint] Starting Trip (HOST=${HOSTNAME:-0.0.0.0} PORT=${PORT:-3000})"
exec "$@"
