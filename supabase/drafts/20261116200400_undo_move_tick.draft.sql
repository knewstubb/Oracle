-- DRAFT (Architect, 2026-11-16). NOT APPLIED. The owner must approve this routine in plain words before anything is applied.
-- Phase 3 Picklist: "Undo" for a tick (priority 4).
-- Contract: docs/oracle/contracts/know-where-cards-are.md section 7 (Undo of the latest tick), section 5, section 14.
-- Additive: one new function. Reversible: DROP FUNCTION.
--
--   undo_move_tick(p_user_id uuid, p_item_id bigint, p_expected_state text) -> jsonb
--     p_expected_state: the state the screen is showing: 'placed' | 'found' | 'missing'
--   What it does (one level only, the latest tick):
--     Placed it   -> back to In your hand (the slot or box it was placed in is emptied)
--     Found it    -> back where it was (its old deck slot if still empty, else its old box)
--     Can't find  -> off the Missing list; back In your hand if it had been found, otherwise back where it was
--   It never takes a slot someone else filled in the meantime (slot_claimed_elsewhere), and it refuses if the card has been
--   moved by something else since the tick (moved_since), so it can never undo a newer move by accident.
--
--   Why p_expected_state: a double tap must not undo two steps. If the step is no longer in the state the screen showed but is
--   already in the state this undo leads to, the call is a harmless repeat and returns "unchanged"; any other state is wrong_state.
--
--   Safety: scoped to p_user_id on every read and write; SECURITY DEFINER, pinned search_path, server role only. Same per-copy
--   advisory lock as picklist_tick (copy lock first, then the step row). One transaction: any refusal (including the card
--   identity guard) leaves everything as it was.
--   Errors: item_not_found, copy_not_found, wrong_state, moved_since, slot_claimed_elsewhere, copy_already_in_open_item,
--   card_identity_mismatch.
--   A step made from a card that was already In your hand has no "old place", so its Found it cannot be undone (wrong_state).

CREATE OR REPLACE FUNCTION public.undo_move_tick(
  p_user_id uuid,
  p_item_id bigint,
  p_expected_state text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
  v_copy record;
  v_target text;
  v_holder_id integer;
  v_slot record;
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL OR p_expected_state IS NULL
     OR p_expected_state NOT IN ('placed', 'found', 'missing') THEN
    RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_item FROM move_items mi WHERE mi.id = p_item_id AND mi.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_item.copy_id IS NULL THEN RAISE EXCEPTION 'copy_not_found' USING ERRCODE = 'P0001'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('collection-copy:' || v_item.copy_id::text, 0));

  SELECT * INTO v_item FROM move_items mi WHERE mi.id = p_item_id AND mi.user_id = p_user_id FOR UPDATE;

  -- Where this undo leads. For Can't find: back to found if it had been found first, else back to to_find.
  v_target := CASE p_expected_state
                WHEN 'placed' THEN 'found'
                WHEN 'found' THEN 'to_find'
                ELSE CASE WHEN v_item.found_at IS NOT NULL THEN 'found' ELSE 'to_find' END
              END;

  IF v_item.state <> p_expected_state THEN
    IF v_item.state = v_target THEN
      RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', v_item.state, 'unchanged', true);
    END IF;
    RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001';
  END IF;

  SELECT uc.id, uc.is_proxy, uc.missing, uc.in_hand, uc.location_id
  INTO v_copy
  FROM user_copies uc
  WHERE uc.id = v_item.copy_id AND uc.user_id = p_user_id
  FOR UPDATE OF uc;
  IF NOT FOUND THEN RAISE EXCEPTION 'copy_not_found' USING ERRCODE = 'P0001'; END IF;

  SELECT dc.id INTO v_holder_id
  FROM deck_cards dc
  WHERE dc.copy_id = v_item.copy_id AND dc.user_id = p_user_id
  LIMIT 1
  FOR UPDATE OF dc;

  -- Going back to an open state needs the copy to be free of any other open step (the one-open-step-per-copy rule).
  IF v_target IN ('found', 'to_find') AND p_expected_state <> 'found' THEN
    PERFORM 1 FROM move_items mi
    WHERE mi.copy_id = v_item.copy_id AND mi.user_id = p_user_id AND mi.state IN ('to_find', 'found') AND mi.id <> v_item.id;
    IF FOUND THEN RAISE EXCEPTION 'copy_already_in_open_item' USING ERRCODE = 'P0001'; END IF;
  END IF;

  -- ---- Placed it -> In your hand -----------------------------------------------------------------
  IF p_expected_state = 'placed' THEN
    IF v_item.to_deck_id IS NOT NULL THEN
      -- The card must still be sitting in the deck it was placed in.
      IF v_holder_id IS NULL THEN RAISE EXCEPTION 'moved_since' USING ERRCODE = 'P0001'; END IF;
      PERFORM 1 FROM deck_cards dc WHERE dc.id = v_holder_id AND dc.deck_id = v_item.to_deck_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'moved_since' USING ERRCODE = 'P0001'; END IF;
      UPDATE deck_cards SET copy_id = NULL, ownership_status = NULL, placement_source = NULL WHERE id = v_holder_id;
    ELSE
      IF v_holder_id IS NOT NULL OR v_copy.missing OR v_copy.in_hand
         OR v_copy.location_id IS DISTINCT FROM v_item.to_location_id THEN
        RAISE EXCEPTION 'moved_since' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    UPDATE user_copies SET in_hand = true, location_id = NULL, missing = false WHERE id = v_item.copy_id;
    UPDATE move_items SET state = 'found', placed_at = NULL WHERE id = v_item.id;
    RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'found', 'unchanged', false);
  END IF;

  -- ---- Can't find -> In your hand (it had been found first) --------------------------------------
  IF p_expected_state = 'missing' THEN
    IF NOT v_copy.missing OR v_holder_id IS NOT NULL THEN RAISE EXCEPTION 'moved_since' USING ERRCODE = 'P0001'; END IF;
    IF v_target = 'found' THEN
      UPDATE user_copies SET missing = false, in_hand = true, location_id = NULL WHERE id = v_item.copy_id;
      UPDATE move_items SET state = 'found', missing_at = NULL WHERE id = v_item.id;
      RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'found', 'unchanged', false);
    END IF;
  ELSE
    -- Found it -> back where it was. The card must still be In your hand.
    IF NOT v_copy.in_hand OR v_copy.missing OR v_holder_id IS NOT NULL THEN
      RAISE EXCEPTION 'moved_since' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ---- Back where it was (Found it undone, or Can't find undone for a card never found) -----------
  IF v_item.from_deck_card_id IS NOT NULL THEN
    SELECT dc.id, dc.copy_id INTO v_slot
    FROM deck_cards dc
    WHERE dc.id = v_item.from_deck_card_id AND dc.user_id = p_user_id
    FOR UPDATE OF dc;
    IF NOT FOUND OR v_slot.copy_id IS NOT NULL THEN
      RAISE EXCEPTION 'slot_claimed_elsewhere' USING ERRCODE = 'P0001';
    END IF;
    -- Off Missing / out of hand first so the "copy must be available" guard on deck_cards passes.
    UPDATE user_copies SET missing = false, in_hand = false, location_id = NULL WHERE id = v_item.copy_id;
    UPDATE deck_cards
    SET copy_id = v_item.copy_id,
        ownership_status = CASE WHEN v_copy.is_proxy THEN 'proxy' ELSE 'original' END,
        placement_source = 'manual'
    WHERE id = v_slot.id;
  ELSIF v_item.from_location_id IS NOT NULL THEN
    PERFORM 1 FROM user_locations l WHERE l.id = v_item.from_location_id AND l.user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'slot_claimed_elsewhere' USING ERRCODE = 'P0001'; END IF;
    UPDATE user_copies SET missing = false, in_hand = false, location_id = v_item.from_location_id WHERE id = v_item.copy_id;
  ELSE
    -- No recorded old place (the step started from a card already In your hand): nothing to put back.
    RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001';
  END IF;

  UPDATE move_items SET state = 'to_find', found_at = NULL, missing_at = NULL WHERE id = v_item.id;
  RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'to_find', 'unchanged', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_move_tick(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.undo_move_tick(uuid, bigint, text) TO service_role;

-- Rollback: DROP FUNCTION public.undo_move_tick(uuid, bigint, text);
