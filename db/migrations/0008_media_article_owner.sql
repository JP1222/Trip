BEGIN;

-- Media can belong to a trip OR an article (exactly one).
ALTER TABLE media
  ALTER COLUMN trip_id DROP NOT NULL;

ALTER TABLE media
  ADD COLUMN article_id text REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE media
  ADD CONSTRAINT media_owner_xor CHECK (
    (trip_id IS NOT NULL AND article_id IS NULL)
    OR (trip_id IS NULL AND article_id IS NOT NULL)
  );

DROP INDEX IF EXISTS media_trip_sort_idx;

CREATE INDEX media_trip_sort_idx
  ON media (trip_id, featured DESC, featured_at DESC, uploaded_at DESC, id DESC)
  WHERE trip_id IS NOT NULL AND state <> 'deleted';

CREATE INDEX media_article_sort_idx
  ON media (article_id, featured DESC, featured_at DESC, uploaded_at DESC, id DESC)
  WHERE article_id IS NOT NULL AND state <> 'deleted';

-- Retire the short-lived parallel article album table (0007).
DROP TABLE IF EXISTS article_media;

COMMIT;
