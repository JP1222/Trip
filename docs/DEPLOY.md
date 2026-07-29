# Production deploy (Oracle ARM + Traefik)

## Topology

- `trip` — Next.js web (standalone)
- `media-worker` — Sharp/FFmpeg derivative pipeline
- `postgres` — metadata, sessions, capabilities, job queue
- `media` — nginx serving public derivatives + legacy `/uploads`
- Traefik terminates TLS (external)

See [ADR 0001](./adr/0001-production-backend.md) for design decisions.

## First cutover

1. Fill `.env` from `.env.example` with strong `ADMIN_PASSWORD`, `APP_SECRET` (≥32 bytes), `POSTGRES_PASSWORD`, `APP_ORIGIN=https://your.host`, `DATABASE_URL`.
2. Copy legacy tree if needed:
   - `data/trips.json` + `data/comments/`
   - upload binaries at `LEGACY_UPLOADS_PATH` (default `./uploads` or `./public/uploads`)
3. Create media dirs: `mkdir -p runtime/media-private runtime/media-public runtime/postgres`
4. Build and start:

```bash
docker compose up -d --build
```

5. Import legacy data (idempotent):

```bash
docker compose run --rm migrate pnpm db:import:legacy -- --dry-run
docker compose run --rm migrate pnpm db:import:legacy -- --commit
```

6. Confirm worker is processing:

```bash
docker compose logs -f media-worker
```

7. Rotate admin password and recreate collaboration invites (old plaintext `collabToken` values are not migrated).

## Local backend (without Traefik)

```bash
docker compose -f docker-compose.local.yml up -d postgres
export DATABASE_URL=postgresql://trip:trip@127.0.0.1:5432/trip
export APP_SECRET=development-only-session-secret-not-for-prod
export ADMIN_PASSWORD=your-local-password
pnpm db:migrate
pnpm db:import:legacy -- --commit   # optional
pnpm worker:media                   # terminal 1
MEDIA_INLINE_PROCESS=1 pnpm dev     # or keep worker and omit inline
```

Without `DATABASE_URL`, the app still runs on JSON files (`data/trips.json`, `data/comments`, `public/uploads`) for offline UI work.

## Health

- Liveness: `GET /api/health/live`
- Readiness: `GET /api/health/ready` (Postgres + media volumes)

## Backup

- Postgres: `pg_dump` / volume snapshot of `runtime/postgres`
- Media: both `runtime/media-private` and `runtime/media-public` (and legacy uploads until derivatives finish)
