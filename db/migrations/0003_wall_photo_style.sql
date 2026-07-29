BEGIN;

-- Display style for board prints: frame, crop aspect, relative size on the wall.
ALTER TABLE wall_photos
  ADD COLUMN IF NOT EXISTS frame_style text NOT NULL DEFAULT 'polaroid'
    CHECK (frame_style IN ('polaroid', 'borderless', 'thin_white')),
  ADD COLUMN IF NOT EXISTS display_size text NOT NULL DEFAULT 'md'
    CHECK (display_size IN ('sm', 'md', 'lg')),
  ADD COLUMN IF NOT EXISTS aspect text NOT NULL DEFAULT 'auto'
    CHECK (aspect IN ('auto', 'landscape', 'portrait', 'square'));

COMMIT;
