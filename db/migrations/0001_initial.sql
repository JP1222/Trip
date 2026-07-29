BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version integer PRIMARY KEY,
  name text NOT NULL,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trips (
  id text PRIMARY KEY,
  position integer NOT NULL,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  destination text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'lived' CHECK (status IN ('lived', 'planned')),
  cover_gradient text NOT NULL DEFAULT '',
  cover_emoji text NOT NULL DEFAULT '✈️',
  cover_image text,
  showcase jsonb,
  location jsonb,
  summary text NOT NULL DEFAULT '',
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trips_date_order CHECK (end_date >= start_date),
  CONSTRAINT trips_position_unique UNIQUE (position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE trip_members (
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  PRIMARY KEY (trip_id, position)
);

CREATE TABLE trip_tips (
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position integer NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  PRIMARY KEY (trip_id, position)
);

CREATE TABLE trip_days (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position integer NOT NULL,
  day_number integer NOT NULL CHECK (day_number > 0),
  date date NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  UNIQUE (trip_id, position),
  UNIQUE (trip_id, day_number)
);

CREATE TABLE itinerary_items (
  id text PRIMARY KEY,
  day_id text NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position integer NOT NULL,
  time_label text,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description text,
  location_label text,
  category text CHECK (category IN ('food', 'stay', 'sight', 'activity', 'transport', 'shop', 'other')),
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  UNIQUE (day_id, position)
);

CREATE INDEX itinerary_items_trip_id_idx ON itinerary_items (trip_id);

CREATE TABLE trip_budgets (
  trip_id text PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  currency varchar(8) NOT NULL,
  limit_amount numeric(14, 2) CHECK (limit_amount IS NULL OR limit_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE budget_items (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trip_budgets(trip_id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  category text,
  paid_by text,
  UNIQUE (trip_id, position)
);

CREATE TYPE media_kind AS ENUM ('image', 'video', 'live_photo');
CREATE TYPE media_state AS ENUM ('pending', 'processing', 'ready', 'failed', 'deleted');

CREATE TABLE media (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind media_kind NOT NULL,
  state media_state NOT NULL DEFAULT 'pending',
  uploader text NOT NULL CHECK (length(uploader) BETWEEN 1 AND 80),
  caption text CHECK (caption IS NULL OR length(caption) <= 2000),
  original_name text NOT NULL,
  source_mime_type text NOT NULL,
  source_bytes bigint NOT NULL CHECK (source_bytes >= 0),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  taken_at text,
  device text,
  aperture double precision,
  shutter text,
  iso integer,
  focal_length double precision,
  focal_length_35 double precision,
  lens text,
  featured boolean NOT NULL DEFAULT false,
  featured_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  failure_code text,
  failure_message text,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_featured_time CHECK (NOT featured OR featured_at IS NOT NULL)
);

CREATE INDEX media_trip_sort_idx
  ON media (trip_id, featured DESC, featured_at DESC, uploaded_at DESC, id DESC)
  WHERE state <> 'deleted';
CREATE INDEX media_state_idx ON media (state, uploaded_at);

CREATE TYPE media_asset_role AS ENUM (
  'original',
  'live_original',
  'thumb',
  'grid',
  'preview',
  'download',
  'poster',
  'playback',
  'live_playback',
  'legacy_display',
  'legacy_playback',
  'legacy_live'
);

CREATE TABLE media_assets (
  id bigserial PRIMARY KEY,
  media_id text NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  role media_asset_role NOT NULL,
  storage_provider text NOT NULL DEFAULT 'local',
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  sha256 char(64),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_id, role),
  UNIQUE (storage_provider, storage_key)
);

CREATE INDEX media_assets_media_idx ON media_assets (media_id);

CREATE TABLE comments (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  media_id text REFERENCES media(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (length(author) BETWEEN 1 AND 40),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_trip_created_idx ON comments (trip_id, created_at DESC);
CREATE INDEX comments_media_created_idx ON comments (media_id, created_at DESC)
  WHERE media_id IS NOT NULL;

CREATE TYPE media_job_state AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled');

CREATE TABLE media_jobs (
  id bigserial PRIMARY KEY,
  media_id text NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('process_image', 'process_video', 'process_live_photo', 'purge_media')),
  state media_job_state NOT NULL DEFAULT 'pending',
  priority smallint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  worker_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (media_id, job_type)
);

CREATE INDEX media_jobs_claim_idx
  ON media_jobs (priority DESC, available_at, id)
  WHERE state IN ('pending', 'processing');

CREATE TABLE admin_sessions (
  id text PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  ip_hash char(64),
  user_agent text
);

CREATE INDEX admin_sessions_expiry_idx ON admin_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE trip_capabilities (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  CHECK (cardinality(scopes) > 0)
);

CREATE INDEX trip_capabilities_trip_idx ON trip_capabilities (trip_id)
  WHERE revoked_at IS NULL;

CREATE TABLE rate_limit_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX rate_limit_buckets_expiry_idx ON rate_limit_buckets (expires_at);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL CHECK (actor_type IN ('admin', 'capability', 'system')),
  actor_id text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  request_id text,
  ip_hash char(64),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_time_idx ON audit_events (occurred_at DESC);

CREATE TABLE legacy_import_runs (
  id text PRIMARY KEY,
  source_fingerprint char(64) NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  report jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;
