BEGIN;

ALTER TABLE articles
  ADD COLUMN wall_style text NOT NULL DEFAULT 'none'
    CHECK (wall_style IN ('none', 'polaroid', 'note'));

COMMIT;
