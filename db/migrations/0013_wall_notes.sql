BEGIN;

-- Grid sticky notes (one cell in the polaroid row — not free-floating decor).
CREATE TABLE wall_notes (
  id text PRIMARY KEY,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wall_notes_updated_at_idx ON wall_notes (updated_at DESC);

COMMIT;
