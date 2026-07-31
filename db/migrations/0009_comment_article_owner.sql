BEGIN;

-- Comments can belong to a trip OR an article (exactly one), same XOR as media.
ALTER TABLE comments
  ALTER COLUMN trip_id DROP NOT NULL;

ALTER TABLE comments
  ADD COLUMN article_id text REFERENCES articles(id) ON DELETE CASCADE;

ALTER TABLE comments
  ADD CONSTRAINT comments_owner_xor CHECK (
    (trip_id IS NOT NULL AND article_id IS NULL)
    OR (trip_id IS NULL AND article_id IS NOT NULL)
  );

CREATE INDEX comments_article_created_idx
  ON comments (article_id, created_at DESC, id DESC)
  WHERE article_id IS NOT NULL;

COMMIT;
