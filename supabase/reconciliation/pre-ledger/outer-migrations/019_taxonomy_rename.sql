-- ============================================================
-- Migration 019: Card Status Taxonomy Rename & Expansion
--
-- Changes:
--   1. Add `missing` column to physical_copies (default false)
--   2. Add partial index on missing = true
--   3. Update deck_cards.ownership_status CHECK constraint
--      (remove 'not_owned', keep NULL / 'original' / 'proxy' / 'generic')
--   4. Migrate existing 'not_owned' values → NULL
--   5. Replace batch_assign_deck RPC with updated version
--
-- Refs: .kiro/specs/card-status-taxonomy-rename/design.md (Architecture)
-- ============================================================

-- ─── Step 1: Add missing column to physical_copies ───────────────────────────

ALTER TABLE physical_copies
  ADD COLUMN IF NOT EXISTS missing BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Step 2: Partial index for Missing copies ────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_physical_copies_missing
  ON physical_copies(missing) WHERE missing = true;

-- ─── Step 3: Update ownership_status CHECK constraint ────────────────────────
-- Old: CHECK (ownership_status IN ('original', 'proxy', 'not_owned'))
-- New: CHECK (ownership_status IS NULL OR ownership_status IN ('original', 'proxy', 'generic'))

ALTER TABLE deck_cards
  DROP CONSTRAINT IF EXISTS deck_cards_ownership_status_check;

ALTER TABLE deck_cards
  ADD CONSTRAINT deck_cards_ownership_status_check
  CHECK (ownership_status IS NULL OR ownership_status IN ('original', 'proxy', 'generic'));

-- ─── Step 4: Migrate 'not_owned' → NULL ──────────────────────────────────────
-- Unresolved slots now have NULL ownership_status; their status is computed
-- dynamically as unallocated/claimed/unowned at read time.

UPDATE deck_cards
  SET ownership_status = NULL
  WHERE ownership_status = 'not_owned';

-- ─── Step 5: Replace batch_assign_deck RPC ───────────────────────────────────
-- Updated to match new constraint (no 'not_owned' writes, NULL for clears)

CREATE OR REPLACE FUNCTION batch_assign_deck(p_assignments jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Step 1: Clear source assignments (Tier 3/4 reassigns)
  -- For any element where clear_deck_cards_id is not null,
  -- set physical_copy_id and ownership_status to NULL on that row.
  UPDATE deck_cards
  SET physical_copy_id = NULL,
      ownership_status = NULL
  WHERE id IN (
    SELECT (a->>'clear_deck_cards_id')::bigint
    FROM jsonb_array_elements(p_assignments) AS a
    WHERE a->>'clear_deck_cards_id' IS NOT NULL
  );

  -- Step 2: Apply new assignments
  -- For each element, update the target deck_cards row with the
  -- new physical_copy_id and ownership_status values.
  UPDATE deck_cards dc
  SET
    physical_copy_id = (a->>'physical_copy_id')::bigint,
    ownership_status = a->>'ownership_status'
  FROM (
    SELECT
      (elem->>'deck_cards_id')::bigint AS deck_cards_id,
      (elem->>'physical_copy_id')::bigint AS physical_copy_id,
      elem->>'ownership_status' AS ownership_status
    FROM jsonb_array_elements(p_assignments) AS elem
  ) a
  WHERE dc.id = a.deck_cards_id;
END;
$$;

-- Grant execute to application roles
GRANT EXECUTE ON FUNCTION batch_assign_deck(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_assign_deck(jsonb) TO service_role;
