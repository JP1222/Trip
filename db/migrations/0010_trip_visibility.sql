BEGIN;

ALTER TABLE trips
  ADD COLUMN visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));

CREATE INDEX trips_visibility_position_idx
  ON trips (visibility, position, id);

COMMIT;
