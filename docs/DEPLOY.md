# Production deploy (Oracle ARM + Traefik)

PostgreSQL is the **only** metadata store. JSON file mode has been removed.

## Topology

- `trip` — Next.js web (standalone); also has a `/media` fallback for local use
- `media` — nginx serving public derivatives under `/media/` (production)
- `media-worker` — Sharp/FFmpeg derivative pipeline
- `postgres` — metadata, sessions, capabilities, job queue
- Traefik (external) terminates TLS; routes `/media/` → nginx, everything else → `trip`

See [ADR 0001](./adr/0001-production-backend.md).

## First cutover

1. Fill `.env` from `.env.example` with strong `ADMIN_PASSWORD`, `APP_SECRET` (≥32 bytes), `POSTGRES_PASSWORD`, `APP_ORIGIN=https://your.host`, `DATABASE_URL`.
2. Stage legacy inputs (import only):
   - `data/trips.json` + `data/comments/`
   - binaries at `LEGACY_UPLOADS_PATH` (often `./public/uploads`)
3. `mkdir -p runtime/media-private runtime/media-public runtime/postgres runtime/backups`
4. Build and start:

```bash
docker compose up -d --build
```

5. Import legacy data (idempotent):

```bash
docker compose run --rm migrate pnpm db:import:legacy -- --dry-run
docker compose run --rm migrate pnpm db:import:legacy -- --commit
```

6. Smoke check:

```bash
docker compose run --rm -e BASE_URL=http://trip:3000 migrate pnpm smoke:backend
# or from host once the site is reachable:
# BASE_URL=https://trip.example.com DATABASE_URL=... pnpm smoke:backend
```

7. Confirm worker:

```bash
docker compose logs -f media-worker
# look for queue_snapshot / job_succeeded
```

8. **Rotate collaboration invites.** Plaintext `collabToken` values are not migrated; create new Share links in admin.

9. **Backfill legacy media into the derivative pipeline** (after import):

```bash
pnpm media:backfill -- --dry-run
pnpm media:backfill
# keep worker running until queue drains
pnpm worker:media
```

This copies each legacy file into private `original` / `live_original` keys and enqueues
`process_image` / `process_live_photo` / `process_video` jobs. Gallery items stay
`ready` while regenerating; once `grid` + `download` (`full.jpg`) exist the API serves
`/media/...` list thumbs (1080) and full stills for preview / cover / download.


## Local backend

```bash
docker compose -f docker-compose.local.yml up -d postgres
export DATABASE_URL=postgresql://trip:trip@127.0.0.1:5432/trip
export APP_SECRET=development-only-session-secret-not-for-prod
export ADMIN_PASSWORD=your-local-password-at-least-16
export APP_ORIGIN=http://localhost:3000
pnpm db:migrate
pnpm db:import:legacy -- --commit   # optional
pnpm worker:media                   # terminal 1
pnpm dev                            # terminal 2
# optional without worker: MEDIA_INLINE_PROCESS=1 pnpm dev
pnpm smoke:backend
```

## Observability

| Endpoint | Who | Purpose |
|----------|-----|---------|
| `GET /api/health/live` | load balancer | process up |
| `GET /api/health/ready` | orchestrator | DB + media roots; includes queue snapshot + warnings |
| `GET /api/admin/ops/metrics` | admin session | media/job counts, 24h failures, disk usage, hints |

Worker logs emit `queue_snapshot` while idle and structured `job_*` events while busy.

## Backup / restore

```bash
pnpm backup
# → runtime/backups/<timestamp>/{postgres.dump,media-*.tar.gz,MANIFEST.txt}

./scripts/restore.sh runtime/backups/<timestamp>
```

Keep off-host copies of `runtime/backups`. Test restore before trusting cutover.

## Health after deploy

- Ready returns 200 with `checks.*.ok`
- `details.queue.pending` should drain under worker load
- `GET /api/admin/ops/metrics` `healthHints` should be empty or explainable
