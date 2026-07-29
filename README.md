# Trip journal

A small private site for friends: share trip plans, upload travel photos, and download each other’s shots. Calm aesthetic, works on phone and desktop.

## Features

- **Trip list** — home cards for every journey
- **Itinerary** — day-by-day timeline
- **Gallery** — masonry layout, lightbox, single / bulk download
- **Upload** — drag-and-drop or multi-select, with your name for credit

## Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Customize trips

Edit `data/trips.json` to add or change trips and days. Refresh the page after saving.

Photos live under `public/uploads/<trip-id>/`, with metadata in `photos.json` in the same folder.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Local filesystem for photos (fine for a small group; swap to object storage for production cloud deploy)

## Roles

| Who | Can do |
|-----|--------|
| **You (admin)** | Log in at `/admin`, edit trip info, delete photos, moderate comments |
| **Friends** | View site, upload photos, post comments — no account |

### Admin setup

1. Copy `.env.example` → `.env.local` (local defaults: user `admin` / password `admin`)
2. On your **remote server**, set strong `ADMIN_USERNAME` + `ADMIN_PASSWORD` (never use `admin`/`admin` in production)
3. Restart the app after changing env
4. Open `/admin`

Day-by-day itinerary is still edited in `data/trips.json` for now.

## Note

Photo upload and comments only need a name (no friend login). Admin uses a single password cookie session.
