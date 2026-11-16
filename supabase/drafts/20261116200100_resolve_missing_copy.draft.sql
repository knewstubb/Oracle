-- DRAFT (Architect, 2026-11-16). NOT APPLIED. The owner must approve this routine in plain words before anything is applied.
-- Phase 3 Picklist: "Turned up" / "Found it" on the Missing page (priority 2).
-- Contract: docs/oracle/contracts/know-where-cards-are.md section 4 (B4), section 5, section 14.
-- Additive: one new function. No table or column change. Reversible: DROP FUNCTION.
--
--   resolve_missing_copy(p_user_id uuid, p_copy_id integer, p_to jsonb) -> jsonb
--     p_to: { "kind": "in_hand" }                                   -- "Found it": the card is in your hand now
--           { "kind": "location", "locationId": 3 }                 -- "Turned up" and put in a box
--           { "kind": "deck", "deckId": 1, "deckCardId": 2 }        -- "Turned up" and put in a deck that has an empty slot
--   What it does: takes the card off the Missing list and puts it in the chosen place. It never goes back into a deck slot
--   by itself (the owner chooses). Decks that were short because of it stay short until the card is placed in one.
--   The old Can't-find step stays on record as history; nothing is deleted.
--
--   Safety: scoped to p_user_id on every read and write; SECURITY DEFINER, pinned search_path, server role only (the route
--   passes the signed-in user's id). Same per-copy advisory lock as every placement routine. One transaction: if the
--   deck refuses the card (wrong card for that slot, slot taken) nothing changes and the card stays Missing.
--   Idempotent: a copy that is not Missing returns success with "unchanged" and changes nothing.
--
--   Errors: copy_not_found, target_not_found, no_open_slot, copy_already_assigned (still sits in a deck slot, which Missing
--   should never be), copy_already_in_open_item (a stale waiting step still names it; cancel that step first),
--   card_identity_mismatch (from the existing card guard).
--   Unlike the older unmark_copy_missing, this routine never picks a box for the owner; the owner chooses where it goes.

CREATE OR REPLACE FUNCTION public.resolve_missing_copy(
  p_user_id uuid,
  p_copy_id integer,
  p_to jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_copy record;
  v_kind text;
  v_deck_id integer;
  v_slot_id integer;
  v_loc_id integer;
  v_target_slot_id integer;
BEGIN
  IF p_user_id IS NULL OR p_copy_id IS NULL OR p_to IS NULL OR jsonb_typeof(p_to) <> 'object' THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF (p_to ->> 'deckId') IS NOT NULL AND (p_to ->> 'deckId') !~ '^[0-9]{1,9}$'
     OR (p_to ->> 'deckCardId') IS NOT NULL AND (p_to ->> 'deckCardId') !~ '^[0-9]{1,9}$'
     OR (p_to ->> 'locationId') IS NOT NULL AND (p_to ->> 'locationId') !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001';
  END IF;
  v_kind := p_to ->> 'kind';
  v_deck_id := NULLIF(p_to ->> 'deckId', '')::integer;
  v_slot_id := NULLIF(p_to ->> 'deckCardId', '')::integer;
  v_loc_id := NULLIF(p_to ->> 'locationId', '')::integer;
  IF v_kind IS NULL OR v_kind NOT IN ('in_hand', 'location', 'deck') THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('collection-copy:' || p_copy_id::text, 0));

  SELECT uc.id, uc.is_proxy, uc.missing, uc.in_hand, uc.location_id, c.card_name
  INTO v_copy
  FROM user_copies uc
  JOIN user_cards c ON c.id = uc.card_id
  WHERE uc.id = p_copy_id AND uc.user_id = p_user_id
  FOR UPDATE OF uc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'copy_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Harmless repeat (double tap, second device): already off the Missing list.
  IF NOT v_copy.missing THEN
    RETURN jsonb_build_object('success', true, 'unchanged', true,
                              'state', CASE WHEN v_copy.in_hand THEN 'in_hand' ELSE 'not_missing' END);
  END IF;

  -- Check the destination before touching anything.
  IF v_kind = 'location' THEN
    PERFORM 1 FROM user_locations l WHERE l.id = v_loc_id AND l.user_id = p_user_id AND l.type = 'storage';
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001'; END IF;
  ELSIF v_kind = 'deck' THEN
    PERFORM 1 FROM decks d WHERE d.id = v_deck_id AND d.user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001'; END IF;
    IF v_slot_id IS NOT NULL THEN
      PERFORM 1 FROM deck_cards dc WHERE dc.id = v_slot_id AND dc.deck_id = v_deck_id AND dc.user_id = p_user_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001'; END IF;
    END IF;
  END IF;

  -- A Missing copy should hold no deck slot. If it somehow does, refuse rather than guess.
  PERFORM 1 FROM deck_cards dc WHERE dc.copy_id = p_copy_id AND dc.user_id = p_user_id FOR UPDATE OF dc;
  IF FOUND THEN RAISE EXCEPTION 'copy_already_assigned' USING ERRCODE = 'P0001'; END IF;

  -- A leftover waiting step naming this copy would be left stale by the move; the owner cancels it first.
  PERFORM 1 FROM move_items mi
  WHERE mi.copy_id = p_copy_id AND mi.user_id = p_user_id AND mi.state IN ('to_find', 'found');
  IF FOUND THEN RAISE EXCEPTION 'copy_already_in_open_item' USING ERRCODE = 'P0001'; END IF;

  IF v_kind = 'in_hand' THEN
    UPDATE user_copies SET missing = false, in_hand = true, location_id = NULL WHERE id = p_copy_id;
    RETURN jsonb_build_object('success', true, 'unchanged', false, 'state', 'in_hand');
  END IF;

  IF v_kind = 'location' THEN
    UPDATE user_copies SET missing = false, in_hand = false, location_id = v_loc_id WHERE id = p_copy_id;
    RETURN jsonb_build_object('success', true, 'unchanged', false, 'state', 'in_box', 'location_id', v_loc_id);
  END IF;

  -- Deck: the named empty slot, otherwise another empty slot for the same card name.
  SELECT dc.id INTO v_target_slot_id
  FROM deck_cards dc
  WHERE dc.deck_id = v_deck_id AND dc.user_id = p_user_id AND dc.copy_id IS NULL
    AND (dc.id = v_slot_id OR dc.card_name = v_copy.card_name)
  ORDER BY (dc.id = v_slot_id) DESC, dc.id
  LIMIT 1
  FOR UPDATE OF dc;
  IF v_target_slot_id IS NULL THEN RAISE EXCEPTION 'no_open_slot' USING ERRCODE = 'P0001'; END IF;

  -- Off the Missing list first so the "copy must be available" guard on deck_cards passes.
  UPDATE user_copies SET missing = false, in_hand = false, location_id = NULL WHERE id = p_copy_id;
  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy.is_proxy THEN 'proxy' ELSE 'original' END,
      placement_source = 'manual'
  WHERE id = v_target_slot_id;
  -- The identity guard rolls the whole call back if this card does not match the slot.

  RETURN jsonb_build_object('success', true, 'unchanged', false, 'state', 'in_deck',
                            'filled_deck_card_id', v_target_slot_id, 'deck_id', v_deck_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_missing_copy(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_missing_copy(uuid, integer, jsonb) TO service_role;

-- Rollback: DROP FUNCTION public.resolve_missing_copy(uuid, integer, jsonb);
