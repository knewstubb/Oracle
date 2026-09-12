-- ============================================================
-- Migration 018: Batch Assign Deck RPC
--
-- Provides a single transactional function that applies all
-- physical_copy_id + ownership_status assignments for a deck's
-- batch resolution pass atomically. Called by batchAssignDeck()
-- in src/lib/supply-pool.ts during warm-start resolution.
--
-- The function:
--   1. Clears source assignments (Tier 3 reassigns) — sets
--      physical_copy_id and ownership_status to NULL on rows
--      being freed for reassignment.
--   2. Applies new assignments — sets physical_copy_id and
--      ownership_status on the target deck_cards rows.
--
-- Both operations run within the same implicit PL/pgSQL
-- transaction — partial failure rolls back the entire operation,
-- leaving deck_cards in its pre-assignment state.
--
-- Security: SECURITY DEFINER bypasses RLS, matching the admin
-- client pattern used throughout the application.
-- ============================================================

CREATE OR REPLACE FUNCTION batch_assign_deck(
  p_assignments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Step 1: Clear source assignments (Tier 3 reassigns)
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
