# Deploy Trip on Oracle + Traefik

Target host: `oracle`  
Public URL: **https://trip.jpzen.cn**  
Proxy: existing Traefik on `traefik-servicenet` (Cloudflare DNS ACME)

Stack: **Postgres + Next.js + media-worker + nginx (`/media`)**.  
Traefik (existing host) terminates TLS:
- `PathPrefix(/media/)` → `media` (nginx), priority 100  
- everything else on `trip.jpzen.cn` → `trip` web  

See [`docs/DEPLOY.md`](../docs/DEPLOY.md) for topology and first cutover.

## Sync code from Mac

```bash
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude 'public/uploads' --exclude 'public/media' \
  --exclude uploads --exclude runtime --exclude '.pnpm-store' \
  ./ oracle:~/docker/trip/
```

Do **not** rsync-delete host `runtime/` or media volumes from a Mac tree that lacks them.

## First deploy / media

```bash
# Optional: one-time legacy import sources only
rsync -avz ./data/ oracle:~/docker/trip/data/
# If you still have a legacy binary tree for import:
# rsync -avz ./uploads/ oracle:~/docker/trip/uploads/

ssh oracle 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/docker/trip
mkdir -p data runtime/media-private runtime/media-public runtime/postgres runtime/backups uploads

# Create .env once (DATABASE_URL, POSTGRES_PASSWORD, APP_SECRET, ADMIN_*, APP_ORIGIN)
# then:
docker compose up -d --build
docker compose run --rm migrate pnpm db:migrate
# optional first import:
# docker compose run --rm migrate pnpm db:import:legacy -- --commit
# docker compose run --rm migrate pnpm media:backfill
docker compose ps
REMOTE
```

## Update after code change (preferred)

From your Mac (repo root). **Default is web-only** — does not rebuild ffmpeg/worker:

```bash
pnpm deploy:oracle          # same as: pnpm deploy:oracle:web
# or:
./scripts/deploy-oracle.sh web
```

| Target | When | Approx. cost |
|--------|------|----------------|
| `web` (default) | UI / API / CSS | Next build only |
| `worker` | media pipeline / scripts / `db/` worker code | ffmpeg image (cached) |
| `media` | `docker/nginx-media.conf` only | recreate nginx, no build |
| `migrate` | new SQL under `db/migrations` | oneshot container |
| `all` | first cutover / Dockerfile base change | full stack |

```bash
pnpm deploy:oracle:worker
pnpm deploy:oracle:media
./scripts/deploy-oracle.sh migrate
pnpm deploy:oracle:all
```

### Manual equivalent (web only)

```bash
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude 'public/uploads' --exclude 'public/media' \
  --exclude uploads --exclude runtime --exclude data --exclude '.pnpm-store' \
  ./ oracle:~/docker/trip/
ssh oracle 'cd ~/docker/trip && docker compose build trip && docker compose up -d --no-deps --force-recreate trip'
```

Avoid bare `docker compose up -d --build` for day-to-day deploys: it rebuilds **web + worker** (ffmpeg apt) every time.

## Notes

- Build **on the server** (arm64 Ampere) so `sharp` matches the CPU. Dockerfile uses BuildKit cache mounts (pnpm / Next / apt / npm) so the **2nd** web deploy is much faster.
- Public derivatives live in `runtime/media-public` and are served by nginx as `/media/...` (not `public/uploads`).
- Compose services: `postgres`, `migrate` (oneshot), `trip`, `media-worker`, `media`.
- Ensure media files are world-readable (`chmod -R a+rX runtime/media-public`) so nginx user `101` can read them.
- No host port 3000 — avoids clash with other services.
