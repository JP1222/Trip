#!/usr/bin/env bash
# Fast Oracle deploy for the Trip stack (rsync + selective docker compose build).
#
# Usage:
#   ./scripts/deploy-oracle.sh              # default: web only (fastest common path)
#   ./scripts/deploy-oracle.sh web          # Next app only — no ffmpeg/worker rebuild
#   ./scripts/deploy-oracle.sh worker       # media-worker + migrate image only
#   ./scripts/deploy-oracle.sh media        # nginx config only (no image build)
#   ./scripts/deploy-oracle.sh migrate      # run DB migrations (uses existing worker image)
#   ./scripts/deploy-oracle.sh all          # full rebuild (web + worker + media)
#
# Env:
#   ORACLE_HOST=oracle          SSH host (default: oracle)
#   ORACLE_DIR=~/docker/trip    Remote project path
#   SKIP_RSYNC=1                Build/up only (code already on host)
#   DRY_RUN=1                   Print plan, do not execute remote build

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-web}"
HOST="${ORACLE_HOST:-oracle}"
REMOTE_DIR="${ORACLE_DIR:-~/docker/trip}"

rsync_code() {
  echo "==> rsync → ${HOST}:${REMOTE_DIR}"
  # --delete only for tracked app tree; never touch runtime/ media/ postgres
  rsync -az --delete \
    --exclude node_modules \
    --exclude .next \
    --exclude .git \
    --exclude '.env*' \
    --exclude 'public/uploads' \
    --exclude 'public/media' \
    --exclude uploads \
    --exclude runtime \
    --exclude data \
    --exclude '.pnpm-store' \
    --exclude 'tsconfig.tsbuildinfo' \
    --exclude '.DS_Store' \
    --exclude 'coverage' \
    --exclude '.claude' \
    --exclude '.grok' \
    "$ROOT/" "${HOST}:${REMOTE_DIR}/"
}

# Prefer BuildKit (cache mounts in Dockerfile). Compose v2 uses it by default.
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
export BUILDKIT_PROGRESS="${BUILDKIT_PROGRESS:-plain}"

remote_build_up() {
  local remote_cmd=$1
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] ssh ${HOST}: ${remote_cmd}"
    return 0
  fi
  # shellcheck disable=SC2029
  ssh "$HOST" "set -euo pipefail
cd ${REMOTE_DIR}
export DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1
${remote_cmd}
docker compose ps
"
}

usage() {
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

case "$TARGET" in
  -h|--help|help) usage ;;
esac

if [[ "${SKIP_RSYNC:-}" != "1" ]]; then
  case "$TARGET" in
    media)
      echo "==> rsync media config only"
      rsync -az \
        "$ROOT/docker/nginx-media.conf" \
        "${HOST}:${REMOTE_DIR}/docker/nginx-media.conf"
      rsync -az \
        "$ROOT/docker-compose.yml" \
        "${HOST}:${REMOTE_DIR}/docker-compose.yml"
      ;;
    migrate)
      : # no code required if image exists; still sync if scripts/db changed
      rsync_code
      ;;
    *)
      rsync_code
      ;;
  esac
else
  echo "==> SKIP_RSYNC=1 (using code already on ${HOST})"
fi

echo "==> deploy target: ${TARGET}"

case "$TARGET" in
  web)
    # Fast path: rebuild Next image only; do not rebuild worker/ffmpeg.
    # --no-deps: skip migrate oneshot (run ./scripts/deploy-oracle.sh migrate when schema changes).
    remote_build_up "
echo '→ building trip-web (runner) only…'
docker compose build trip
echo '→ recreating trip (no migrate/worker)…'
docker compose up -d --no-deps --force-recreate trip
"
    ;;
  worker)
    remote_build_up "
echo '→ building trip-worker (ffmpeg + scripts)…'
docker compose build migrate
echo '→ recreating media-worker…'
docker compose up -d --no-deps --force-recreate media-worker
"
    ;;
  media)
    remote_build_up "
echo '→ recreating nginx media (config bind-mount)…'
docker compose up -d --no-deps --force-recreate media
"
    ;;
  migrate)
    remote_build_up "
echo '→ running migrations…'
docker compose run --rm migrate pnpm db:migrate
"
    ;;
  all)
    remote_build_up "
echo '→ building trip + worker…'
docker compose build trip migrate
echo '→ up stack…'
docker compose up -d --build
"
    ;;
  *)
    echo "Unknown target: $TARGET" >&2
    usage
    ;;
esac

echo "==> done (${TARGET}). Smoke: curl -sS https://trip.jpzen.cn/api/health/live"
