-- DRAFT (Architect, 2026-11-16). NOT APPLIED. The owner must approve this routine in plain words before anything is applied.
-- Phase 3 Picklist: "Add to Picklist" / "Add all" (priority 1).
-- Contract: docs/oracle/contracts/know-where-cards-are.md section 5 (routes table) and section 14 (this batch).
-- Additive: one new function. No table or column change. Reversible: DROP FUNCTION (the rows it made stay as plain history).
--
--   create_move_list(p_user_id uuid, p_items jsonb) -> jsonb
--     p_items: [ { "copyId": 12, "to": { "kind": "deck", "deckId": 1, "deckCardId": 2 } },
--                { "copyId": 13, "to": { "kind": "location", "locationId": 3 } } ]      (1 to 500 items)
--   What it does: saves one waiting step per item, all under one new list id, so the all-decks Picklist has rows to show.
--   It does NOT move any card. A card only moves when Found it / Placed it is ticked (picklist_tick).
--   An item for a copy that is already In your hand starts as "found" (same rule as picklist_tick).
--
--   Safety: scoped to p_user_id on every read and write (another user's copy, deck, slot or box reads as copy_not_found /
--   target_not_found); SECURITY DEFINER with a pinned search_path; execute is granted to the server role only, so the route
--   must pass the signed-in user's id, never one from the browser. Same per-copy advisory lock as every placement routine
--   (taken in ascending copy order so two overlapping "Add all" calls cannot deadlock). One transaction: if anything raises,
--   no step is saved. Items that cannot be saved are returned in "skipped" with a reason (never silently dropped).
--   Idempotent: repeating the same call changes nothing; a copy already waiting with the same destination is returned in "unchanged".
--
--   Whole-call errors (RAISE EXCEPTION): bad_input, too_many_items.
--   Per-item skip reasons: bad_item, duplicate_in_request, copy_not_found, copy_missing, target_not_found, already_in_this_deck,
--   already_there, no_open_slot, copy_already_in_open_item.

CREATE OR REPLACE FUNCTION public.create_move_list(
  p_user_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_list_id uuid := gen_random_uuid();
  v_row record;
  v_copy record;
  v_item record;
  v_created jsonb := '[]'::jsonb;
  v_unchanged jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_seen integer[] := ARRAY[]::integer[];
  v_to jsonb;
  v_idx integer;
  v_copy_id integer;
  v_kind text;
  v_deck_id integer;
  v_slot_id integer;
  v_loc_id integer;
  v_from_slot_id integer;
  v_from_deck_id integer;
  v_new_id bigint;
  v_state text;
BEGIN
  IF p_user_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'too_many_items' USING ERRCODE = 'P0001';
  END IF;

  -- Lock every copy named, lowest id first (consistent order, so overlapping calls queue instead of deadlocking).
  FOR v_row IN
    SELECT DISTINCT s.cid
    FROM (
      SELECT CASE WHEN jsonb_typeof(e) = 'object' AND (e ->> 'copyId') ~ '^[0-9]{1,9}$'
                  THEN (e ->> 'copyId')::integer END AS cid
      FROM jsonb_array_elements(p_items) AS e
    ) s
    WHERE s.cid IS NOT NULL
    ORDER BY s.cid
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('collection-copy:' || v_row.cid::text, 0));
  END LOOP;

  FOR v_row IN
    SELECT t.e AS item, t.ord AS ord FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, ord) ORDER BY t.ord
  LOOP
    v_idx := (v_row.ord - 1)::integer;
    v_copy_id := NULL; v_kind := NULL; v_deck_id := NULL; v_slot_id := NULL; v_loc_id := NULL;
    v_from_slot_id := NULL; v_from_deck_id := NULL;

    -- ---- Shape of the item ------------------------------------------------------------------------
    IF jsonb_typeof(v_row.item) <> 'object'
       OR (v_row.item ->> 'copyId') IS NULL OR (v_row.item ->> 'copyId') !~ '^[0-9]{1,9}$'
       OR jsonb_typeof(v_row.item -> 'to') IS DISTINCT FROM 'object' THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', NULL, 'reason', 'bad_item');
      CONTINUE;
    END IF;
    v_copy_id := (v_row.item ->> 'copyId')::integer;
    v_to := v_row.item -> 'to';
    v_kind := v_to ->> 'kind';
    IF (v_to ->> 'deckId') IS NOT NULL AND (v_to ->> 'deckId') !~ '^[0-9]{1,9}$'
       OR (v_to ->> 'deckCardId') IS NOT NULL AND (v_to ->> 'deckCardId') !~ '^[0-9]{1,9}$'
       OR (v_to ->> 'locationId') IS NOT NULL AND (v_to ->> 'locationId') !~ '^[0-9]{1,9}$'
       OR v_kind IS NULL OR v_kind NOT IN ('deck', 'location') THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'bad_item');
      CONTINUE;
    END IF;
    v_deck_id := NULLIF(v_to ->> 'deckId', '')::integer;
    v_slot_id := NULLIF(v_to ->> 'deckCardId', '')::integer;
    v_loc_id := NULLIF(v_to ->> 'locationId', '')::integer;

    IF v_copy_id = ANY (v_seen) THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'duplicate_in_request');
      CONTINUE;
    END IF;
    v_seen := v_seen || v_copy_id;

    -- ---- The copy (must be this user's) -----------------------------------------------------------
    SELECT uc.id, uc.is_proxy, uc.missing, uc.in_hand, uc.location_id, c.card_name
    INTO v_copy
    FROM user_copies uc
    JOIN user_cards c ON c.id = uc.card_id
    WHERE uc.id = v_copy_id AND uc.user_id = p_user_id
    FOR UPDATE OF uc;
    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'copy_not_found');
      CONTINUE;
    END IF;
    IF v_copy.missing THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'copy_missing');
      CONTINUE;
    END IF;

    -- ---- The destination (must be this user's) ----------------------------------------------------
    IF v_kind = 'deck' THEN
      PERFORM 1 FROM decks d WHERE d.id = v_deck_id AND d.user_id = p_user_id;
      IF NOT FOUND THEN
        v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'target_not_found');
        CONTINUE;
      END IF;
      IF v_slot_id IS NOT NULL THEN
        PERFORM 1 FROM deck_cards dc WHERE dc.id = v_slot_id AND dc.deck_id = v_deck_id AND dc.user_id = p_user_id;
        IF NOT FOUND THEN
          v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'target_not_found');
          CONTINUE;
        END IF;
      END IF;
      -- The deck must have an empty slot this card could fill (the planned slot, or another empty slot for the same card name).
      PERFORM 1 FROM deck_cards dc
      WHERE dc.deck_id = v_deck_id AND dc.user_id = p_user_id AND dc.copy_id IS NULL
        AND (dc.id = v_slot_id OR dc.card_name = v_copy.card_name);
      IF NOT FOUND THEN
        v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'no_open_slot');
        CONTINUE;
      END IF;
    ELSE
      PERFORM 1 FROM user_locations l WHERE l.id = v_loc_id AND l.user_id = p_user_id AND l.type = 'storage';
      IF NOT FOUND THEN
        v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'target_not_found');
        CONTINUE;
      END IF;
    END IF;

    -- ---- Already on an open step? Same destination = unchanged, different = skipped ----------------
    SELECT * INTO v_item
    FROM move_items mi
    WHERE mi.copy_id = v_copy_id AND mi.user_id = p_user_id AND mi.state IN ('to_find', 'found');
    IF FOUND THEN
      IF (v_kind = 'deck' AND v_item.to_deck_id IS NOT DISTINCT FROM v_deck_id)
         OR (v_kind = 'location' AND v_item.to_location_id IS NOT DISTINCT FROM v_loc_id) THEN
        v_unchanged := v_unchanged || jsonb_build_object('itemId', v_item.id, 'copyId', v_copy_id,
                                                         'state', v_item.state, 'listId', v_item.list_id);
      ELSE
        v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'copy_already_in_open_item');
      END IF;
      CONTINUE;
    END IF;

    -- ---- Where the copy sits now ---------------------------------------------------------------------
    SELECT dc.id, dc.deck_id INTO v_from_slot_id, v_from_deck_id
    FROM deck_cards dc
    WHERE dc.copy_id = v_copy_id AND dc.user_id = p_user_id
    LIMIT 1;

    IF v_kind = 'deck' AND v_from_deck_id IS NOT NULL AND v_from_deck_id = v_deck_id THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'already_in_this_deck');
      CONTINUE;
    END IF;
    IF v_kind = 'location' AND v_from_slot_id IS NULL AND NOT v_copy.in_hand AND v_copy.location_id IS NOT DISTINCT FROM v_loc_id THEN
      v_skipped := v_skipped || jsonb_build_object('index', v_idx, 'copyId', v_copy_id, 'reason', 'already_there');
      CONTINUE;
    END IF;

    v_state := CASE WHEN v_copy.in_hand THEN 'found' ELSE 'to_find' END;
    INSERT INTO move_items (
      user_id, list_id, copy_id, card_name,
      from_deck_id, from_deck_card_id, from_location_id,
      to_deck_id, to_deck_card_id, to_location_id, state, source, found_at
    ) VALUES (
      p_user_id, v_list_id, v_copy_id, v_copy.card_name,
      v_from_deck_id, v_from_slot_id, CASE WHEN v_from_slot_id IS NULL THEN v_copy.location_id ELSE NULL END,
      CASE WHEN v_kind = 'deck' THEN v_deck_id END,
      CASE WHEN v_kind = 'deck' THEN v_slot_id END,
      CASE WHEN v_kind = 'location' THEN v_loc_id END,
      v_state, 'manual',
      CASE WHEN v_copy.in_hand THEN now() END
    ) RETURNING id INTO v_new_id;

    v_created := v_created || jsonb_build_object('itemId', v_new_id, 'copyId', v_copy_id, 'state', v_state);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'list_id', CASE WHEN jsonb_array_length(v_created) > 0 THEN to_jsonb(v_list_id) ELSE 'null'::jsonb END,
    'created', v_created,
    'unchanged', v_unchanged,
    'skipped', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_move_list(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_move_list(uuid, jsonb) TO service_role;

-- Rollback: DROP FUNCTION public.create_move_list(uuid, jsonb);
