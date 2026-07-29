# Trip journal

A small private site for friends: share trip plans, upload travel photos, and download each other’s shots. Calm aesthetic, works on phone and desktop.

## Features

- **Trip list** — home polaroid wall for every journey
- **Itinerary** — day-by-day timeline + maps
- **Gallery** — masonry waterfall, lightbox, Live Photo hold-to-play, download
- **Upload** — drag-and-drop or multi-select, with your name for credit
- **Admin** — trips, photos, comments, wall board decorations

## Media model

| Use | Asset |
|-----|--------|
| List / waterfall / admin chips | `grid-1080.webp` (longest edge 1080) |
| Lightbox preview, home cover, download | `full.jpg` (full-resolution public still) |
| Private source | originals under `runtime/media-private` (not web-served) |
| Public derivatives | `runtime/media-public` → `/media/...` |

There is **no** runtime `public/uploads` gallery tree. That path is only for optional one-time legacy import.

## Run locally

```bash
pnpm install

# Postgres (local compose helper)
docker compose -f docker-compose.local.yml up -d postgres

# Env: copy .env.example → .env.local (DATABASE_URL, APP_SECRET, ADMIN_*)
pnpm db:migrate
pnpm worker:media   # terminal 1 — derivatives
pnpm dev            # terminal 2
```

Open [http://localhost:3000](http://localhost:3000). Admin: `/admin`.

Optional without a separate worker: `MEDIA_INLINE_PROCESS=1 pnpm dev`.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4
- PostgreSQL — trips, comments, media metadata, jobs, sessions
- Local media roots — private originals + public derivatives
- media-worker — Sharp / FFmpeg jobs (`process_image`, `process_live_photo`, `process_video`)

## Deploy (Oracle + Traefik)

Production: [https://trip.jpzen.cn](https://trip.jpzen.cn) · Admin: `/admin`

- Full topology and cutover: [`docs/DEPLOY.md`](./docs/DEPLOY.md)
- Host-specific rsync / Traefik notes: [`deploy/oracle-traefik.md`](./deploy/oracle-traefik.md)
- Architecture decision: [`docs/adr/0001-production-backend.md`](./docs/adr/0001-production-backend.md)

```bash
# After rsync on the server
cp .env.example .env   # strong secrets + DATABASE_URL + APP_ORIGIN
docker compose up -d --build
```

## Roles

| Who | Can do |
|-----|--------|
| **You (admin)** | Log in at `/admin`, edit trips, photos, wall, moderate comments |
| **Friends** | View site, upload photos, post comments — no account |

### Admin setup

1. Copy `.env.example` → `.env.local` (local) or `.env` (server)
2. Set strong `ADMIN_USERNAME` + `ADMIN_PASSWORD` on the server (never ship defaults)
3. Restart after changing env
4. Open `/admin`

## Legacy import (optional, one-time)

If you still have an old `data/trips.json` + file tree:

```bash
pnpm db:import:legacy -- --dry-run
pnpm db:import:legacy -- --commit
pnpm media:backfill
pnpm worker:media   # until the queue drains
```

Day-to-day edits go through admin / Postgres, not by hand-editing JSON.

## Note

Photo upload and comments only need a name (no friend login). Admin uses a single password cookie session.
