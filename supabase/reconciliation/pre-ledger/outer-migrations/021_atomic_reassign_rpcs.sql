-- ============================================================
-- Migration 021: Atomic Reassign RPCs
--
-- Two functions that guarantee all-or-nothing moves of physical
-- copies between deck slots. Replaces sequential API-layer
-- .update() calls that had a window where a copy could exist
-- in neither source nor target (crash between calls).
--
-- Pattern follows assign_physical_copy (migration 016):
-- single function call, single transaction, advisory lock
-- serialization on the physical_copy_id.
--
-- References:
--   .kiro/steering/convention-atomic-writes.md
--   src/app/api/allocation/reassign-to-deck/route.ts
--   src/app/api/allocation/assign-free-copy/route.ts
-- ============================================================


-- ─── reassign_to_deck ─────────────────────────────────────────────────
-- Atomically moves a physical copy from its current deck slot to an open
-- slot in the target deck for the same card.
--
-- Returns JSON:
--   - success: boolean
--   - source_deck_card_id: integer (the row that was cleared)
--   - target_deck_card_id: integer (the row that was filled)
--
-- Raises:
--   - 'copy_not_assigned': physical copy is not in any deck_cards row
--   - 'no_open_slot': target deck has no unresolved slot for this card
-- ============================================================

CREATE OR REPLACE FUNCTION reassign_to_deck(
  p_physical_copy_id INTEGER,
  p_target_deck_id INTEGER,
  p_card_name TEXT,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_source_deck_card_id INTEGER;
  v_target_deck_card_id INTEGER;
  v_is_proxy BOOLEAN;
  v_ownership_status TEXT;
BEGIN
  -- Serialize concurrent attempts on this physical copy
  PERFORM pg_advisory_xact_lock(hashtext(p_physical_copy_id::TEXT));

  -- 1. Find the source slot (where this copy currently lives)
  SELECT dc.id INTO v_source_deck_card_id
  FROM deck_cards dc
  WHERE dc.physical_copy_id = p_physical_copy_id
    AND dc.user_id = p_user_id
  FOR UPDATE;

  IF v_source_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'copy_not_assigned'
      USING ERRCODE = 'P0001',
            HINT = 'Physical copy is not currently assigned to any deck.';
  END IF;

  -- 2. Find an open slot in the target deck for this card
  SELECT dc.id INTO v_target_deck_card_id
  FROM deck_cards dc
  WHERE dc.deck_id = p_target_deck_id
    AND dc.card_name = p_card_name
    AND dc.user_id = p_user_id
    AND dc.physical_copy_id IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_target_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'no_open_slot'
      USING ERRCODE = 'P0001',
            HINT = 'Target deck has no unresolved slot for this card.';
  END IF;

  -- 3. Determine ownership status
  SELECT is_proxy INTO v_is_proxy
  FROM physical_copies
  WHERE id = p_physical_copy_id;

  v_ownership_status := CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END;

  -- 4. Atomic move: clear source, fill target (single transaction)
  UPDATE deck_cards
  SET physical_copy_id = NULL, ownership_status = NULL
  WHERE id = v_source_deck_card_id;

  UPDATE deck_cards
  SET physical_copy_id = p_physical_copy_id, ownership_status = v_ownership_status
  WHERE id = v_target_deck_card_id;

  RETURN json_build_object(
    'success', true,
    'source_deck_card_id', v_source_deck_card_id,
    'target_deck_card_id', v_target_deck_card_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reassign_to_deck(INTEGER, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reassign_to_deck(INTEGER, INTEGER, TEXT, UUID) TO service_role;


-- ─── assign_free_copy ─────────────────────────────────────────────────
-- Atomically assigns a free (unassigned) physical copy to an open slot
-- in the target deck. Guards against race conditions where the copy
-- might get assigned between the check and the write.
--
-- Returns JSON:
--   - success: boolean
--   - deck_card_id: integer (the slot that was filled)
--
-- Raises:
--   - 'copy_already_assigned': the copy is in a deck already
--   - 'no_open_slot': target deck has no unresolved slot for this card
-- ============================================================

CREATE OR REPLACE FUNCTION assign_free_copy(
  p_physical_copy_id INTEGER,
  p_target_deck_id INTEGER,
  p_card_name TEXT,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_holder INTEGER;
  v_target_deck_card_id INTEGER;
  v_is_proxy BOOLEAN;
  v_ownership_status TEXT;
BEGIN
  -- Serialize concurrent attempts on this physical copy
  PERFORM pg_advisory_xact_lock(hashtext(p_physical_copy_id::TEXT));

  -- 1. Verify the copy is not already assigned to any deck
  SELECT dc.id INTO v_existing_holder
  FROM deck_cards dc
  WHERE dc.physical_copy_id = p_physical_copy_id
  LIMIT 1;

  IF v_existing_holder IS NOT NULL THEN
    RAISE EXCEPTION 'copy_already_assigned'
      USING ERRCODE = 'P0001',
            HINT = 'Physical copy is already assigned to a deck. Use reassign_to_deck instead.';
  END IF;

  -- 2. Find an open slot in the target deck for this card
  SELECT dc.id INTO v_target_deck_card_id
  FROM deck_cards dc
  WHERE dc.deck_id = p_target_deck_id
    AND dc.card_name = p_card_name
    AND dc.user_id = p_user_id
    AND dc.physical_copy_id IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_target_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'no_open_slot'
      USING ERRCODE = 'P0001',
            HINT = 'Target deck has no unresolved slot for this card.';
  END IF;

  -- 3. Determine ownership status
  SELECT is_proxy INTO v_is_proxy
  FROM physical_copies
  WHERE id = p_physical_copy_id;

  v_ownership_status := CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END;

  -- 4. Fill the slot
  UPDATE deck_cards
  SET physical_copy_id = p_physical_copy_id, ownership_status = v_ownership_status
  WHERE id = v_target_deck_card_id;

  RETURN json_build_object(
    'success', true,
    'deck_card_id', v_target_deck_card_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_copy(INTEGER, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_free_copy(INTEGER, INTEGER, TEXT, UUID) TO service_role;
