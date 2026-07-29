BEGIN;

-- Free-placed board trinkets (vinyl, pins, clips, notes) on the cork surface.
-- Coordinates are percentages of the cork surface box (0–100), so layout is responsive.
CREATE TABLE wall_objects (
  id text PRIMARY KEY,
  catalog_id text NOT NULL,
  kind text NOT NULL DEFAULT 'widget'
    CHECK (kind IN ('widget', 'pin', 'clip', 'note')),
  x double precision NOT NULL DEFAULT 50
    CHECK (x BETWEEN -25 AND 125),
  y double precision NOT NULL DEFAULT 50
    CHECK (y BETWEEN -25 AND 125),
  rotate double precision NOT NULL DEFAULT 0,
  scale double precision NOT NULL DEFAULT 1
    CHECK (scale BETWEEN 0.25 AND 4),
  z integer NOT NULL DEFAULT 0,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wall_objects_z_idx ON wall_objects (z ASC, created_at ASC);

COMMIT;
