-- ============================================================
-- Migration 016: Atomic Physical Copy Assignment RPC
--
-- Replaces the two-call clear-then-assign pattern in the API
-- route with a single transactional function. Uses advisory
-- locking to serialize concurrent claims on the same copy.
--
-- Critical guard: after acquiring the lock, re-validates that
-- the current holder (if any) has allocate=false. If the holder
-- has allocate=true, the copy is legitimately claimed — a Tier
-- 1/2 auto-assign has no business overwriting it. Raises
-- 'copy_already_claimed' which the route translates to a
-- friendly 409.
--
-- Returns JSON:
--   - success: boolean
--   - cleared_from_deck_card_id: integer (null if copy was free)
--   - already_assigned: boolean (idempotent case)
--
-- Race condition handling:
--   Two requests targeting the same physical_copy_id are
--   serialized by the advisory lock. The second caller either
--   sees the copy now held by an allocate=true deck (rejected)
--   or proceeds normally.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_physical_copy(
  p_target_deck_card_id INTEGER,
  p_physical_copy_id INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_holder_deck_card_id INTEGER;
  v_holder_allocate BOOLEAN;
  v_copy_is_proxy BOOLEAN;
  v_already_assigned BOOLEAN;
BEGIN
  -- Serialize concurrent attempts on this specific physical copy
  PERFORM pg_advisory_xact_lock(hashtext(p_physical_copy_id::TEXT));

  -- Check if the target already has this copy (idempotent case)
  SELECT EXISTS(
    SELECT 1 FROM deck_cards
    WHERE id = p_target_deck_card_id
      AND physical_copy_id = p_physical_copy_id
  ) INTO v_already_assigned;

  IF v_already_assigned THEN
    RETURN json_build_object('success', true, 'cleared_from_deck_card_id', NULL, 'already_assigned', true);
  END IF;

  -- Find any OTHER row currently holding this copy, locking it for update
  SELECT dc.id, d.allocate
    INTO v_holder_deck_card_id, v_holder_allocate
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.physical_copy_id = p_physical_copy_id
    AND dc.id != p_target_deck_card_id
  FOR UPDATE OF dc;

  -- Guard: if the holder's deck has allocate=true, this is a legitimate claim.
  -- A Tier 1/2 auto-assign cannot overwrite it — that's Tier 4 territory
  -- requiring the confirmation modal, not this code path.
  IF v_holder_deck_card_id IS NOT NULL AND v_holder_allocate THEN
    RAISE EXCEPTION 'copy_already_claimed'
      USING ERRCODE = 'P0001',
            HINT = 'The physical copy is held by a deck with allocate=true. Use the Tier 4 confirmation flow instead.';
  END IF;

  -- Clear the source row if it exists (holder has allocate=false, genuinely free)
  IF v_holder_deck_card_id IS NOT NULL THEN
    UPDATE deck_cards
    SET physical_copy_id = NULL,
        ownership_status = NULL
    WHERE id = v_holder_deck_card_id;
  END IF;

  -- Get proxy status for ownership_status
  SELECT is_proxy INTO v_copy_is_proxy
  FROM physical_copies
  WHERE id = p_physical_copy_id;

  -- Assign to target
  UPDATE deck_cards
  SET physical_copy_id = p_physical_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
  WHERE id = p_target_deck_card_id;

  RETURN json_build_object(
    'success', true,
    'cleared_from_deck_card_id', v_holder_deck_card_id,
    'already_assigned', false
  );
END;
$$;

-- Grant execute to application roles
GRANT EXECUTE ON FUNCTION assign_physical_copy(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_physical_copy(INTEGER, INTEGER) TO service_role;
