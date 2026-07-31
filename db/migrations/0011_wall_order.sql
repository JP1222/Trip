BEGIN;

-- Interleaved cork-board order for trips, board photos, and articles.
-- slot_key is "trip:<id>" | "photo:<id>" | "article:<id>".
CREATE TABLE wall_order (
  slot_key text PRIMARY KEY,
  position integer NOT NULL,
  CONSTRAINT wall_order_position_unique UNIQUE (position)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX wall_order_position_idx ON wall_order (position ASC);

COMMIT;
