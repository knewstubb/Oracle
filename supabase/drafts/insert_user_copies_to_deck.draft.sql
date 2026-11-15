-- DRAFT. NOT APPLIED. Not in supabase/migrations on purpose, so no tool applies it by accident.
--
-- insert_user_copies_to_deck: import copies and place them into one deck in a SINGLE transaction
-- (contract 4c, "one all-or-nothing database operation"). Either every copy is saved and placed or
-- nothing is. Needed before DECK_DESTINATION_ENABLED in src/lib/import-destination.ts can be turned on.
--
-- Placement ladder per copy, in file order (mirrors src/lib/import-deck-placement.ts, which the unit tests cover):
--   1. basic land -> an empty tracked basic slot of that name, else Unsorted ('basic_land')
--   2. an empty main-deck slot for the same card: exact printing + finish first, then lowest id
--   3. card not listed on the main deck -> a NEW slot holding the copy, up to p_max_copies per card
--   4. otherwise Unsorted with a reason: 'maybeboard_only' or 'already_filled'
--   Any copy that fails inside its own sub-block -> Unsorted ('could_not_place'); the import itself still succeeds.
--
-- Colour-identity and legality are NOT checked here (owner decision: they warn, never block). The caller
-- checks them after this returns and only warns.
--
-- Row keys (jsonb): the keys insert_user_copies already takes (card_id, printing_id, finish, language,
-- is_proxy, proxy_for_card_id, card_condition, purchase_price, acquired_at, source_tag) plus
-- card_name, scryfall_id, set_code, categories (text, e.g. '["Creature"]'), is_basic_land (boolean).
-- location_id is ignored: copies placed in the deck have no location; unsorted ones go to the default.
--
-- Returns: { success, deck_id, inserted_ids, outcomes: [{ index, copy_id, kind: filled|added|unsorted,
--            deck_card_id, reason }], counts: { filled, added, unsorted } }
-- Raises: deck_not_found (deck is not the caller's).
--
-- OPEN POINTS for review before applying:
--   * the deck_cards identity trigger (migrations 20260916065742, 20260917102547) must accept the new-slot insert;
--   * new slots set quantity 1 and requested_finish from the copy, like import_deck_with_intent does.

CREATE OR REPLACE FUNCTION public.insert_user_copies_to_deck(
  p_user_id uuid,
  p_deck_id integer,
  p_rows jsonb,
  p_max_copies integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_inserted jsonb;
  v_result jsonb := '[]'::jsonb;
  v_row record;
  v_copy_id integer;
  v_is_proxy boolean;
  v_slot_id integer;
  v_main_count integer;
  v_maybe_count integer;
  v_kind text;
  v_reason text;
  v_filled integer := 0;
  v_added integer := 0;
  v_unsorted integer := 0;
  v_default_location integer;
  v_cap integer := GREATEST(COALESCE(p_max_copies, 1), 1);
BEGIN
  -- Serialise imports into the same deck, and prove the deck is the caller's.
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(jsonb_array_length(p_rows), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'deck_id', p_deck_id, 'inserted_ids', '[]'::jsonb,
      'outcomes', '[]'::jsonb, 'counts', jsonb_build_object('filled', 0, 'added', 0, 'unsorted', 0));
  END IF;

  -- Save every copy first (all rows without a location, so they start in Unsorted).
  v_inserted := (public.insert_user_copies(p_user_id, (
    SELECT jsonb_agg(elem - 'location_id') FROM jsonb_array_elements(p_rows) elem
  )))->'inserted_ids';

  v_default_location := public._ensure_default_storage_location_id(p_user_id);

  FOR v_row IN
    SELECT (t.ord - 1)::integer AS idx, t.elem AS elem
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(elem, ord)
    ORDER BY t.ord
  LOOP
    v_copy_id := (v_inserted->>(v_row.idx))::integer;
    v_is_proxy := COALESCE((v_row.elem->>'is_proxy')::boolean, false);
    v_slot_id := NULL;
    v_kind := 'unsorted';
    v_reason := NULL;

    BEGIN  -- per-copy sub-block: a failure here sends only this copy to Unsorted
      -- Steps 1-2: an empty main-deck slot of this card, exact printing + finish first, then lowest id.
      SELECT dc.id INTO v_slot_id
      FROM deck_cards dc
      WHERE dc.deck_id = p_deck_id AND dc.user_id = p_user_id AND dc.copy_id IS NULL
        AND lower(btrim(dc.card_name)) = lower(btrim(v_row.elem->>'card_name'))
        AND dc.categories NOT LIKE '%Maybeboard%'
      ORDER BY (dc.scryfall_id IS NOT NULL AND dc.scryfall_id::text = v_row.elem->>'printing_id'
                AND COALESCE(dc.requested_finish, 'nonfoil') = COALESCE(v_row.elem->>'finish', 'nonfoil')) DESC,
               dc.id
      LIMIT 1
      FOR UPDATE OF dc SKIP LOCKED;

      IF v_slot_id IS NOT NULL THEN
        UPDATE deck_cards
        SET copy_id = v_copy_id,
            ownership_status = CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END,
            placement_source = 'import'
        WHERE id = v_slot_id;
        UPDATE user_copies SET location_id = NULL WHERE id = v_copy_id;
        v_kind := 'filled';
        v_filled := v_filled + 1;
      ELSIF COALESCE((v_row.elem->>'is_basic_land')::boolean, false) THEN
        v_reason := 'basic_land';
      ELSE
        SELECT count(*) FILTER (WHERE categories NOT LIKE '%Maybeboard%'),
               count(*) FILTER (WHERE categories LIKE '%Maybeboard%')
        INTO v_main_count, v_maybe_count
        FROM deck_cards
        WHERE deck_id = p_deck_id AND user_id = p_user_id
          AND lower(btrim(card_name)) = lower(btrim(v_row.elem->>'card_name'));

        IF v_main_count = 0 AND v_maybe_count > 0 THEN
          v_reason := 'maybeboard_only';
        ELSIF v_main_count < v_cap THEN
          -- Step 3: not listed (or below the format limit) -> a new slot holding this copy.
          INSERT INTO deck_cards (
            deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
            copy_id, ownership_status, placement_source, requested_finish
          ) VALUES (
            p_deck_id, v_row.elem->>'card_name', v_row.elem->>'scryfall_id', v_row.elem->>'set_code', 1,
            COALESCE(v_row.elem->>'categories', '[]'), false, p_user_id,
            v_copy_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END, 'import',
            COALESCE(v_row.elem->>'finish', 'nonfoil')
          ) RETURNING id INTO v_slot_id;
          UPDATE user_copies SET location_id = NULL WHERE id = v_copy_id;
          v_kind := 'added';
          v_added := v_added + 1;
        ELSE
          v_reason := 'already_filled';
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Undo this copy's partial work only, and park it in Unsorted.
      v_slot_id := NULL;
      v_kind := 'unsorted';
      v_reason := 'could_not_place';
      UPDATE user_copies SET location_id = v_default_location WHERE id = v_copy_id;
    END;

    IF v_kind = 'unsorted' THEN
      v_unsorted := v_unsorted + 1;
    END IF;

    v_result := v_result || jsonb_build_object(
      'index', v_row.idx, 'copy_id', v_copy_id, 'kind', v_kind, 'deck_card_id', v_slot_id, 'reason', v_reason);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deck_id', p_deck_id,
    'inserted_ids', v_inserted,
    'outcomes', v_result,
    'counts', jsonb_build_object('filled', v_filled, 'added', v_added, 'unsorted', v_unsorted)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_user_copies_to_deck(uuid, integer, jsonb, integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_user_copies_to_deck(uuid, integer, jsonb, integer) TO service_role;
