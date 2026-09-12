-- ============================================================
-- Migration 017: Atomic Deck Cards Diff RPC
--
-- Provides a single transactional function that applies a
-- deck-cards diff (deletes + inserts) atomically. Called by
-- applyDeckCardsDiff() in src/lib/deck-cards-diff.ts during
-- deck reimport to preserve enriched columns on persisting rows.
--
-- The function:
--   1. DELETEs rows by ID (cards removed from Archidekt source)
--   2. INSERTs new rows from JSONB (cards added in Archidekt source)
--
-- Both operations run within the same implicit PL/pgSQL
-- transaction — partial failure rolls back the entire operation,
-- leaving deck_cards in its pre-reimport state.
--
-- Security: SECURITY DEFINER bypasses RLS, matching the admin
-- client pattern used throughout the application.
-- ============================================================

CREATE OR REPLACE FUNCTION apply_deck_cards_diff(
  p_deck_id bigint,
  p_delete_ids bigint[],
  p_insert_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete removed cards (only within the specified deck for safety)
  IF array_length(p_delete_ids, 1) > 0 THEN
    DELETE FROM deck_cards
    WHERE id = ANY(p_delete_ids)
      AND deck_id = p_deck_id;
  END IF;

  -- Insert new cards from JSONB array
  IF jsonb_array_length(p_insert_rows) > 0 THEN
    INSERT INTO deck_cards (
      deck_id,
      card_name,
      scryfall_id,
      set_code,
      quantity,
      categories,
      is_commander,
      user_id,
      ownership_status,
      physical_copy_id
    )
    SELECT
      p_deck_id,
      (row_data->>'card_name'),
      (row_data->>'scryfall_id'),
      (row_data->>'set_code'),
      1,
      (row_data->>'categories'),
      COALESCE((row_data->>'is_commander')::boolean, false),
      (row_data->>'user_id'),
      NULL,
      NULL
    FROM jsonb_array_elements(p_insert_rows) AS row_data;
  END IF;
END;
$$;

-- Grant execute to application roles
GRANT EXECUTE ON FUNCTION apply_deck_cards_diff(bigint, bigint[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_deck_cards_diff(bigint, bigint[], jsonb) TO service_role;
