BEGIN;

-- Standalone polaroids pinned on the home cork board (not tied to a trip).
CREATE TABLE wall_photos (
  id text PRIMARY KEY,
  position integer NOT NULL,
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 120),
  meta text NOT NULL DEFAULT '' CHECK (length(meta) <= 200),
  orientation text CHECK (
    orientation IS NULL
    OR orientation IN ('landscape', 'portrait', 'square')
  ),
  storage_key text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wall_photos_position_unique UNIQUE (position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT wall_photos_storage_key_unique UNIQUE (storage_key)
);

CREATE INDEX wall_photos_position_idx ON wall_photos (position ASC, created_at ASC);

COMMIT;
