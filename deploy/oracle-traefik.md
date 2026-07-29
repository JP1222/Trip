# Deploy Trip on Oracle + Traefik

Target host: `oracle`  
Public URL: **https://trip.jpzen.cn**  
Proxy: existing Traefik on `traefik-servicenet` (Cloudflare DNS ACME)

Stack: **Postgres + Next.js + media-worker + nginx `/media`**.  
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

## Update after code change

```bash
rsync -avz --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude '.env*' --exclude 'public/uploads' --exclude 'public/media' \
  --exclude uploads --exclude runtime --exclude data --exclude '.pnpm-store' \
  ./ oracle:~/docker/trip/
ssh oracle 'cd ~/docker/trip && docker compose up -d --build'
```

## Notes

- Build **on the server** (arm64 Ampere) so `sharp` matches the CPU.
- Public derivatives are under `runtime/media-public` (served as `/media/...`), not `public/uploads`.
- Traefik labels match other apps on `traefik-servicenet` + production cert resolver.
- No host port 3000 — avoids clash with other services.
