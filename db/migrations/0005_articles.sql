BEGIN;

CREATE TABLE articles (
  id text PRIMARY KEY,
  slug text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  excerpt text NOT NULL DEFAULT '' CHECK (length(excerpt) <= 500),
  body_md text NOT NULL DEFAULT '',
  cover_image text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT articles_slug_unique UNIQUE (slug),
  CONSTRAINT articles_published_at_when_published CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  )
);

CREATE INDEX articles_status_published_at_idx
  ON articles (status, published_at DESC NULLS LAST, updated_at DESC);

CREATE INDEX articles_updated_at_idx ON articles (updated_at DESC);

COMMIT;
