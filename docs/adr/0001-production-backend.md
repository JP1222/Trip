# ADR 0001: Production backend, data store, and media pipeline

- Status: Accepted
- Date: 2026-07-29
- Owners: Trip application maintainers

## Context

The current application stores trips, comments, and media metadata in JSON files and writes uploaded binaries directly under `public/uploads`. Concurrent requests can overwrite each other, a crash can truncate metadata, uploads are buffered entirely in application memory, and videos are served without a derivative pipeline. Authentication uses a deterministic cookie and collaboration secrets are stored in plaintext. These properties are not suitable for an Internet-facing deployment.

The initial production target is one ARM64 Oracle host behind Traefik. The current library contains about 1,507 logical media items and 7.9 GiB of files. The expected audience is small, but uploads are bursty and image/video processing is CPU- and memory-intensive. The design must be reliable on one host and allow a later move to S3-compatible object storage without rewriting application data.

## Decision

### Runtime topology

Run four services with Docker Compose:

1. Traefik terminates TLS and enforces the outer request limit.
2. The Next.js web service handles HTML, metadata APIs, authentication, authorization, and streamed media ingestion.
3. PostgreSQL 17 stores all mutable metadata, sessions, hashed capabilities, rate-limit state, audit records, and the durable media-job queue.
4. A single-concurrency media worker validates and transforms files with Sharp and FFmpeg. Image work may use two concurrent slots after memory measurements; video work remains single-concurrency on the initial host.

Redis is intentionally not required. Workers claim durable jobs from PostgreSQL with `FOR UPDATE SKIP LOCKED` and use leases, bounded retries, and idempotent output keys.

### Data ownership

PostgreSQL is the source of truth for trips, itinerary data, media metadata, comments, sessions, capabilities, jobs, and audit history. Media bytes are never stored in PostgreSQL.

The schema normalizes entities that need independent updates or integrity constraints:

- `trips`, `trip_members`, `trip_tips`, `trip_days`, `itinerary_items`
- `trip_budgets`, `budget_items`
- `media`, `media_assets`, `comments`
- `media_jobs`, `admin_sessions`, `trip_capabilities`, `audit_events`

Map presentation and showcase data remain JSONB because they are read and replaced as a document and are not queried independently. Foreign keys cascade only where deletion is unambiguous. Trip and media records use version/status columns so partial work is observable instead of disappearing.

### Media storage

Use a storage adapter with two roots in the initial deployment:

- private originals/staging: `/app/media-private`
- public, immutable derivatives: `/app/media-public`

Database rows store relative storage keys, never absolute paths or public URLs. Keys are deterministic and versioned, for example `trips/{tripId}/{mediaId}/v1/grid.webp`. This makes retries idempotent and permits an S3/R2 adapter later.

New images retain a private original and publish stripped derivatives:

- `thumb`: 480 px WebP, quality 72
- `grid`: 960 px WebP, quality 78
- `preview`: 1,920 px WebP, quality 82
- `download`: up to 2,560 px JPEG, quality 85

The worker reads EXIF before transformation, records safe camera fields in PostgreSQL, and removes embedded metadata (including GPS) from public derivatives. Legacy JPEGs are registered as `legacy_display`; they are not falsely represented as originals.

Videos are probed before publication. Compatible H.264/AAC MP4 files are remuxed with fast-start; other inputs are transcoded to browser-compatible H.264/AAC with a bounded resolution/frame rate. Each video receives a WebP poster. Live Photos are one logical `media` row with still and motion assets. MP4 byte-range serving is sufficient at the current scale; HLS is deferred.

Uploads stream into a same-filesystem staging file while enforcing byte limits and computing SHA-256. A short database transaction creates the media/assets/job records, then the worker moves them through `pending -> processing -> ready` or `failed`. Files are published with atomic rename. Delete moves assets to recoverable trash before asynchronous purge.

### API and security

- Public reading remains enabled to preserve current product behavior. Writes require either an admin session or a scoped, expiring trip capability.
- Admin login creates a random server-side session; only a session-token hash is stored. Sessions can expire and be revoked.
- Collaboration/upload capability tokens are random, scoped, expiring, and stored only as hashes. Existing plaintext tokens are invalidated during migration.
- Mutating cookie-authenticated routes validate `Origin`; all input has explicit length/range limits.
- Login, comment, upload, and download endpoints use database-backed rate limits and per-trip quotas.
- File eligibility is based on inspected content and FFprobe/Sharp results, not client MIME or filename alone.
- Health endpoints are separate: liveness checks the process; readiness checks PostgreSQL and writable media volumes. Logs are structured JSON and security-sensitive mutations write audit events.

### Operations

Schema migrations run once under a PostgreSQL advisory lock before the web service becomes ready. The legacy importer is idempotent, preserves IDs and timestamps, validates row/file counts, and records its checkpoint. Unknown legacy directories are reported/quarantined rather than silently attached or deleted.

Backups have two independent parts: PostgreSQL dumps/base backups and encrypted incremental copies of both media roots to off-host storage. Deployment never synchronizes over persistent data directories. Restore is tested before cutover.

## Alternatives considered

### Keep JSON and add file locks

Rejected. Locks could reduce lost updates in one process but do not provide relational integrity, safe multi-process jobs, searchable audit history, migrations, or robust backup/restore semantics.

### SQLite in WAL mode

Viable for a permanently single-process application, and operationally simpler. Rejected for this production upgrade because the design deliberately separates web and media-worker processes and should permit future replicas or object storage without another database migration. PostgreSQL adds one service but removes several concurrency and queue compromises.

### Store media in PostgreSQL

Rejected. Multi-gigabyte binaries would make database backups, replication, caching, and delivery unnecessarily expensive. PostgreSQL stores checksums and keys; the storage layer owns bytes.

### Require S3-compatible storage immediately

Deferred. Object storage is a strong later target, but introducing a cloud dependency and data-egress policy is not required for the initial single-host deployment. The storage interface and key model are designed so this is a configuration/adapter change.

### Redis-backed queue

Rejected for the current workload. PostgreSQL job claiming is durable, transactional with media metadata, and adequate for one worker. Redis can be introduced only if measured queue pressure justifies it.

## Consequences

Positive:

- concurrent writes become transactional and crash-safe;
- expensive media processing no longer blocks web requests;
- originals, public derivatives, and legacy files have explicit semantics;
- sessions/capabilities can be revoked and audited;
- future object-storage migration does not change business tables or URLs.

Costs and risks:

- PostgreSQL and FFmpeg add operational components;
- local media remains unavailable if the single host or disk fails, so off-host backups are mandatory;
- the legacy collection needs a staged import and background derivative generation;
- public-read behavior is preserved; making the whole site private would be a separate product decision.

## Rollout and rollback

1. Deploy PostgreSQL, migrations, private/public media volumes, and the worker without routing writes to them.
2. Run the importer in dry-run mode, review counts and quarantined directories, then import idempotently.
3. Generate legacy derivatives in the background and validate checksums/sample playback.
4. Cut over web traffic to the Postgres-backed image. Keep the legacy upload tree mounted read-only for nginx until derivatives and cover URLs are fully migrated.
5. Rotate all admin and collaboration secrets at cutover (plaintext collab tokens are not imported).

### Follow-up decision (2026-07-29)

Runtime dual-mode (JSON files when `DATABASE_URL` is unset) was **removed**. PostgreSQL is mandatory for web, worker, auth, rate limits, and comments. `data/trips.json` and `data/comments/*` remain import sources only via `pnpm db:import:legacy`.

Rollback switches the application to the previous image and a restored Postgres/media backup. Persistent database/media volumes are never deleted by an application rollback.
