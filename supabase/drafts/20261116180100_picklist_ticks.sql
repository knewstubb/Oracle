-- Phase 3 Picklist, slice 2: Found it / Placed it / Can't find it with saved ticks.
--
-- STATUS: DRAFT, NOT APPLIED, NOT RUN ANYWHERE (no local Postgres or test account was available; the SQL has not even
-- been syntax-checked by a server). Needs Architect review and owner approval before it moves to supabase/migrations.
-- Additive: new functions only. No table or column change (move_items and the in_hand / missing columns are already live).
-- Contract: docs/oracle/contracts/know-where-cards-are.md sections 4 (B1 to B3), 5, 6, 7.
--
-- ONE entry point for the screen, so "create the item if the row has none, then tick" is a single transaction:
--   picklist_tick(p_user_id, p_action, p_copy_id, p_to jsonb) -> jsonb
--     p_action: 'found' | 'placed' | 'cant_find'
--     p_to:     { "kind": "deck", "deckId": 1, "deckCardId": 2 }  or  { "kind": "location", "locationId": 3 }
--   Same per-copy advisory lock as every placement RPC. Idempotent (a repeated tick returns the current state).
--   Placement source for the slot is 'manual' (owner clicked, D-009).
--   Errors (RAISE EXCEPTION, same style as assign_free_copy): copy_not_found, copy_missing, target_not_found,
--   wrong_state, no_open_slot, already_in_this_deck, not_in_hand, copy_already_in_open_item.
--
-- Not in this draft (later slices): undo_move_tick, cancel_move_item, resolve_missing_copy (Turned up),
-- record_move_looked_in and the look-next list, create_move_list.

CREATE OR REPLACE FUNCTION public.picklist_tick(
  p_user_id uuid,
  p_action text,
  p_copy_id integer,
  p_to jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_copy record;
  v_item record;
  v_slot record;
  v_to_kind text := p_to ->> 'kind';
  v_to_deck_id integer := NULLIF(p_to ->> 'deckId', '')::integer;
  v_to_slot_id integer := NULLIF(p_to ->> 'deckCardId', '')::integer;
  v_to_location_id integer := NULLIF(p_to ->> 'locationId', '')::integer;
  v_from_slot_id integer;
  v_from_deck_id integer;
  v_target_slot_id integer;
  v_card_name text;
  v_short_decks jsonb := '[]'::jsonb;
BEGIN
  IF p_action NOT IN ('found', 'placed', 'cant_find') THEN
    RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('collection-copy:' || p_copy_id::text, 0));

  SELECT uc.id, uc.user_id, uc.is_proxy, uc.missing, uc.in_hand, uc.location_id, c.card_name
  INTO v_copy
  FROM user_copies uc
  JOIN user_cards c ON c.id = uc.card_id
  WHERE uc.id = p_copy_id
  FOR UPDATE OF uc;

  IF NOT FOUND OR v_copy.user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate the target the screen asked for (it is the planned destination, also used when creating the item).
  IF v_to_kind = 'deck' THEN
    PERFORM 1 FROM decks d WHERE d.id = v_to_deck_id AND d.user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001'; END IF;
  ELSIF v_to_kind = 'location' THEN
    PERFORM 1 FROM user_locations l WHERE l.id = v_to_location_id AND l.user_id = p_user_id AND l.type = 'storage';
    IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001'; END IF;
  ELSE
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Where the copy sits now (deck slot or box); needed when the item is created and for Found / Can't find.
  SELECT dc.id, dc.deck_id INTO v_from_slot_id, v_from_deck_id
  FROM deck_cards dc
  WHERE dc.copy_id = p_copy_id AND dc.user_id = p_user_id
  LIMIT 1
  FOR UPDATE OF dc;

  -- The open item for this copy, or a new one (the unique open-item index prevents two lists claiming one copy).
  SELECT * INTO v_item
  FROM move_items mi
  WHERE mi.copy_id = p_copy_id AND mi.user_id = p_user_id AND mi.state IN ('to_find', 'found')
  FOR UPDATE;

  IF NOT FOUND THEN
    -- A Missing copy cannot start a move; an in-hand copy with no item can only be placed (it was picked up elsewhere).
    IF v_copy.missing THEN RAISE EXCEPTION 'copy_missing' USING ERRCODE = 'P0001'; END IF;
    IF p_action = 'placed' AND NOT v_copy.in_hand THEN RAISE EXCEPTION 'not_in_hand' USING ERRCODE = 'P0001'; END IF;
    IF v_to_kind = 'deck' AND v_from_deck_id IS NOT NULL AND v_from_deck_id = v_to_deck_id THEN
      RAISE EXCEPTION 'already_in_this_deck' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO move_items (
      user_id, list_id, copy_id, card_name,
      from_deck_id, from_deck_card_id, from_location_id,
      to_deck_id, to_deck_card_id, to_location_id, state, source,
      found_at
    ) VALUES (
      p_user_id, gen_random_uuid(), p_copy_id, v_copy.card_name,
      v_from_deck_id, v_from_slot_id, CASE WHEN v_from_slot_id IS NULL THEN v_copy.location_id ELSE NULL END,
      CASE WHEN v_to_kind = 'deck' THEN v_to_deck_id END,
      CASE WHEN v_to_kind = 'deck' THEN v_to_slot_id END,
      CASE WHEN v_to_kind = 'location' THEN v_to_location_id END,
      CASE WHEN v_copy.in_hand THEN 'found' ELSE 'to_find' END, 'manual',
      CASE WHEN v_copy.in_hand THEN now() END
    )
    RETURNING * INTO v_item;
  END IF;

  -- ---- Found it ----------------------------------------------------------------------------------
  IF p_action = 'found' THEN
    IF v_item.state = 'found' THEN
      RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'found', 'unchanged', true);
    END IF;
    IF v_item.state <> 'to_find' THEN RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001'; END IF;
    IF v_copy.missing THEN RAISE EXCEPTION 'copy_missing' USING ERRCODE = 'P0001'; END IF;

    -- Source deck keeps its planned slot and now reads short by one (B1, D-025).
    IF v_from_slot_id IS NOT NULL THEN
      UPDATE deck_cards
      SET copy_id = NULL, ownership_status = NULL, placement_source = NULL
      WHERE id = v_from_slot_id;
      SELECT jsonb_build_array(jsonb_build_object('deckId', d.id, 'deckName', d.name, 'cardName', v_copy.card_name))
      INTO v_short_decks FROM decks d WHERE d.id = v_from_deck_id;
    END IF;

    UPDATE user_copies SET location_id = NULL, in_hand = true WHERE id = p_copy_id;
    UPDATE move_items SET state = 'found', found_at = now() WHERE id = v_item.id;

    RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'found',
                              'source_deck_now_short', v_short_decks);
  END IF;

  -- ---- Can't find it -----------------------------------------------------------------------------
  IF p_action = 'cant_find' THEN
    IF v_item.state = 'missing' THEN
      RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'missing', 'unchanged', true);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('deckId', d.id, 'deckName', d.name, 'cardName', dc.card_name)), '[]'::jsonb)
    INTO v_short_decks
    FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
    WHERE dc.copy_id = p_copy_id AND dc.user_id = p_user_id;

    UPDATE deck_cards
    SET copy_id = NULL, ownership_status = NULL, placement_source = NULL
    WHERE copy_id = p_copy_id AND user_id = p_user_id;

    -- The trigger sets missing_since and clears in_hand; the CHECK forbids both at once, so set both explicitly.
    UPDATE user_copies SET missing = true, in_hand = false, location_id = NULL WHERE id = p_copy_id;
    UPDATE move_items SET state = 'missing', missing_at = now() WHERE id = v_item.id;

    RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'missing',
                              'decks_now_short', v_short_decks);
  END IF;

  -- ---- Placed it ---------------------------------------------------------------------------------
  IF v_item.state = 'placed' THEN
    RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'placed', 'unchanged', true);
  END IF;
  IF v_item.state <> 'found' OR NOT v_copy.in_hand THEN RAISE EXCEPTION 'not_in_hand' USING ERRCODE = 'P0001'; END IF;

  IF v_to_kind = 'deck' THEN
    -- The item's own slot if it is still empty, otherwise another empty slot for the same card in that deck (B2).
    v_card_name := v_copy.card_name;
    SELECT dc.id INTO v_target_slot_id
    FROM deck_cards dc
    JOIN decks d ON d.id = dc.deck_id
    WHERE dc.deck_id = v_to_deck_id AND dc.user_id = p_user_id AND d.user_id = p_user_id
      AND dc.copy_id IS NULL
      AND (dc.id = v_to_slot_id OR dc.card_name = v_card_name)
    ORDER BY (dc.id = v_to_slot_id) DESC, dc.id
    LIMIT 1
    FOR UPDATE OF dc;

    IF v_target_slot_id IS NULL THEN
      RAISE EXCEPTION 'no_open_slot' USING ERRCODE = 'P0001';
    END IF;

    -- in_hand false first so the guard trigger deck_cards_copy_must_be_available passes.
    UPDATE user_copies SET in_hand = false WHERE id = p_copy_id;
    UPDATE deck_cards
    SET copy_id = p_copy_id,
        ownership_status = CASE WHEN v_copy.is_proxy THEN 'proxy' ELSE 'original' END,
        placement_source = 'manual'
    WHERE id = v_target_slot_id;
    -- The identity trigger (trg_validate_deck_card_copy_identity) rolls this whole tick back if the card does not match.
    UPDATE user_copies SET location_id = NULL WHERE id = p_copy_id;
  ELSE
    UPDATE user_copies SET location_id = v_to_location_id, in_hand = false WHERE id = p_copy_id;
  END IF;

  UPDATE move_items
  SET state = 'placed', placed_at = now(),
      to_deck_id = CASE WHEN v_to_kind = 'deck' THEN v_to_deck_id END,
      to_deck_card_id = CASE WHEN v_to_kind = 'deck' THEN v_target_slot_id END,
      to_location_id = CASE WHEN v_to_kind = 'location' THEN v_to_location_id END
  WHERE id = v_item.id;

  RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'placed',
                            'filled_deck_card_id', v_target_slot_id);
END;
$function$;

-- Service role only, same pattern as the other placement RPCs.
REVOKE ALL ON FUNCTION public.picklist_tick(uuid, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.picklist_tick(uuid, text, integer, jsonb) TO service_role;

-- Rollback: DROP FUNCTION public.picklist_tick(uuid, text, integer, jsonb);
