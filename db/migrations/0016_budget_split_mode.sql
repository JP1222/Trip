BEGIN;

ALTER TABLE budget_items
  ADD COLUMN split_mode text NOT NULL DEFAULT 'equal'
  CHECK (split_mode IN ('equal', 'none'));

COMMIT;
