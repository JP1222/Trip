BEGIN;

-- Article album (separate from inline body images). Cover still lives on
-- articles.cover_image; this table is the selectable library + Highlights.
CREATE TABLE article_media (
  id text PRIMARY KEY,
  article_id text NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  storage_key text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 2000),
  uploader text NOT NULL DEFAULT 'Peng' CHECK (length(uploader) BETWEEN 1 AND 80),
  device text,
  aperture double precision,
  shutter text,
  iso integer,
  featured boolean NOT NULL DEFAULT false,
  featured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_media_storage_key_unique UNIQUE (storage_key),
  CONSTRAINT article_media_featured_time CHECK (
    NOT featured OR featured_at IS NOT NULL
  )
);

CREATE INDEX article_media_article_sort_idx
  ON article_media (
    article_id,
    featured DESC,
    featured_at DESC NULLS LAST,
    position ASC,
    created_at DESC,
    id DESC
  );

COMMIT;
