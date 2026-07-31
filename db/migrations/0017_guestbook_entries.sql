BEGIN;

-- Site guestbook (Airbnb-style visitor book — not cork sticky notes).
CREATE TABLE guestbook_entries (
  id text PRIMARY KEY,
  author text NOT NULL
    CHECK (length(author) BETWEEN 1 AND 40),
  body text NOT NULL
    CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX guestbook_entries_created_at_idx
  ON guestbook_entries (created_at DESC, id DESC);

COMMIT;
