BEGIN;

-- Sticky notes need room for a short multi-line body (title, lines, signature).
ALTER TABLE wall_objects
  DROP CONSTRAINT IF EXISTS wall_objects_label_check;

ALTER TABLE wall_objects
  ADD CONSTRAINT wall_objects_label_check CHECK (length(label) <= 2000);

COMMIT;
