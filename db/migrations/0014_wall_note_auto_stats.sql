BEGIN;

ALTER TABLE wall_notes
  ADD COLUMN auto_stats boolean NOT NULL DEFAULT false;

-- The seeded board intro note keeps regenerating like the old hardcoded sticky.
UPDATE wall_notes
SET auto_stats = true
WHERE id = 'wall-note-board';

COMMIT;
