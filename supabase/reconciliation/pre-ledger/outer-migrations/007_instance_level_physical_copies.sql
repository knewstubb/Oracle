-- ============================================================
-- Migration 007: Instance-Level Physical Copies
--
-- Normalizes physical_copies to one row per physical card instance.
-- Steps:
--   1. Explode rows where quantity > 1 into N individual rows
--   2. Delete rows where quantity = 0
--   3. Drop the unique index idx_physical_copies_group
--   4. Drop the quantity column
--   5. Add storage_location_id FK to storage_locations
--   6. Add source_tag column (nullable, max 100 chars)
--   7. Add new indexes for common query patterns
-- ============================================================

BEGIN;

-- ============================================================
-- Step 1: Drop the unique index idx_physical_copies_group FIRST
-- (on card_definition_id, scryfall_printing_id, is_foil, is_proxy)
-- Must happen before explosion — otherwise inserting duplicate
-- tuples for quantity > 1 rows violates the constraint.
-- ============================================================

DROP INDEX IF EXISTS idx_physical_copies_group;

-- ============================================================
-- Step 2: Explode rows with quantity > 1
-- For each row with quantity N > 1, insert N-1 copies preserving
-- all column values except id (auto-generated) and quantity.
-- ============================================================

INSERT INTO physical_copies (
  card_definition_id,
  scryfall_printing_id,
  is_proxy,
  proxy_for_definition_id,
  condition,
  is_foil,
  acquired_at,
  quantity,
  user_id,
  created_at
)
SELECT
  pc.card_definition_id,
  pc.scryfall_printing_id,
  pc.is_proxy,
  pc.proxy_for_definition_id,
  pc.condition,
  pc.is_foil,
  pc.acquired_at,
  1,
  pc.user_id,
  pc.created_at
FROM physical_copies pc
CROSS JOIN generate_series(2, pc.quantity) AS seq(n)
WHERE pc.quantity > 1;

-- Set remaining original rows to quantity = 1 (for consistency before drop)
UPDATE physical_copies SET quantity = 1 WHERE quantity > 1;

-- ============================================================
-- Step 3: Delete rows where quantity = 0
-- ============================================================

DELETE FROM physical_copies WHERE quantity = 0;

-- ============================================================
-- Step 4: Drop the quantity column
-- ============================================================

ALTER TABLE physical_copies DROP COLUMN quantity;

-- ============================================================
-- Step 5: Add storage_location_id column
-- Nullable FK referencing storage_locations(id) with ON DELETE SET NULL
-- ============================================================

ALTER TABLE physical_copies
  ADD COLUMN storage_location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL;

-- ============================================================
-- Step 6: Add source_tag column
-- Nullable TEXT, max 100 characters via CHECK constraint
-- Records the import origin of each instance.
-- ============================================================

ALTER TABLE physical_copies
  ADD COLUMN source_tag TEXT CHECK (source_tag IS NULL OR length(source_tag) <= 100);

-- ============================================================
-- Step 7: Add new indexes for common query patterns
-- ============================================================

-- Fast lookup: all copies for a user's card definition (rollup view, allocation)
CREATE INDEX idx_physical_copies_user_definition
  ON physical_copies(user_id, card_definition_id);

-- Fast lookup: source-scoped upsert matching (import pipeline sync mode)
CREATE INDEX idx_physical_copies_source_printing
  ON physical_copies(user_id, source_tag, scryfall_printing_id);

-- Fast lookup: copies by storage location (storage location panel)
CREATE INDEX idx_physical_copies_storage
  ON physical_copies(storage_location_id);

COMMIT;
