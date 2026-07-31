BEGIN;

ALTER TABLE budget_items
  ADD COLUMN amount_mode text NOT NULL DEFAULT 'total'
  CHECK (amount_mode IN ('total', 'each'));

COMMIT;
