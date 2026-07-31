BEGIN;

-- Separate cork-widget transforms for phone vs desktop boards.
ALTER TABLE wall_objects
  ADD COLUMN mobile_x double precision,
  ADD COLUMN mobile_y double precision,
  ADD COLUMN mobile_rotate double precision,
  ADD COLUMN mobile_scale double precision;

-- Seed mobile from the existing (desktop) placement so nothing jumps.
UPDATE wall_objects
SET
  mobile_x = x,
  mobile_y = y,
  mobile_rotate = rotate,
  mobile_scale = scale
WHERE mobile_x IS NULL;

ALTER TABLE wall_objects
  ALTER COLUMN mobile_x SET NOT NULL,
  ALTER COLUMN mobile_y SET NOT NULL,
  ALTER COLUMN mobile_rotate SET NOT NULL,
  ALTER COLUMN mobile_scale SET NOT NULL;

ALTER TABLE wall_objects
  ADD CONSTRAINT wall_objects_mobile_x_check CHECK (mobile_x BETWEEN -25 AND 125),
  ADD CONSTRAINT wall_objects_mobile_y_check CHECK (mobile_y BETWEEN -25 AND 125),
  ADD CONSTRAINT wall_objects_mobile_scale_check CHECK (mobile_scale BETWEEN 0.25 AND 4);

COMMIT;
