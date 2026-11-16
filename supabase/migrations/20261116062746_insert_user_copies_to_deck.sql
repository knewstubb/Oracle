-- APPLIED 2026-11-16 to project udocxsyzzvrceiuupprj as version 20261116062746 (owner approved 2026-11-16).
-- REVIEWED version of insert_user_copies_to_deck.draft.sql (Architect review, 2026-11-13).
-- Smoke-tested first inside a rolled-back transaction (3 real cards, then 500 rows in about 0.4 s).
-- Reversible: DROP FUNCTION public.insert_user_copies_to_deck(uuid, integer, jsonb, integer);
-- Additive only: creates one function. No table, column, trigger or policy changes.
--
-- Checked read-only against the live project (udocxsyzzvrceiuupprj) on 2026-11-13. What was changed vs the draft:
--   1. GRANTS: also REVOKE from anon. New functions in this project are executable by anon by default, so
--      "REVOKE FROM PUBLIC, authenticated" alone left anyone with the public key able to call it with any user id.
--   2. LOCKING: after locking the deck row, also lock every slot row of the deck, and drop SKIP LOCKED.
--      SKIP LOCKED could skip a slot that another writer was holding and then create a duplicate slot.
--   3. ORDER: the rows handed to insert_user_copies are now aggregated in file order (the draft had no ORDER BY, so
--      copy ids could be matched to the wrong file rows).
--   4. GENERIC SLOTS: never fill a generic (untracked) basic slot (the table forbids a copy on one).
--   5. NEW SLOT identity: card name and printing come from the owned copy itself, so the deck-card identity trigger
--      always accepts the new slot. Finish and proxy flag also come from the saved copy, not the file row.
--   6. A new slot is never created with a Maybeboard category, and categories falls back to ["Other"], not "[]".
--   7. COUNTS: tallied after each copy's sub-block (PL/pgSQL variables are not rolled back by a sub-block failure),
--      plus a final check that filled + added + unsorted = rows imported, and proxies placed.
--   8. ERRORS: the per-copy "could not place" net now catches only expected business/constraint errors, not every error,
--      so a real bug fails the whole import instead of quietly dumping copies into Unsorted.
--   9. Basic land names are also recognised on the database side, in case the caller's flag is missing.
--
-- Placement ladder per copy, in file order (mirrors src/lib/import-deck-placement.ts):
--   1. an empty, non-generic main-deck slot of the same card: exact printing + finish first, then lowest id
--      (this is also how a basic land fills an empty tracked basic slot)
--   2. basic land with no such slot -> Unsorted ('basic_land')
--   3. card only on the Maybeboard -> Unsorted ('maybeboard_only')
--   4. card listed on the main deck fewer than p_max_copies times (counting slots made earlier in this same import)
--      -> a NEW slot holding the copy ('added'); otherwise Unsorted ('already_filled')
--   Any copy whose own placement raises an expected error -> Unsorted ('could_not_place'); the import still succeeds.
--
-- Colour identity and legality are NOT checked here (owner decision: warn, never block).
--
-- Row keys (jsonb): card_id, printing_id, finish, language, is_proxy, proxy_for_card_id, card_condition,
-- purchase_price, acquired_at, source_tag (as insert_user_copies) plus card_name, scryfall_id, set_code,
-- categories (text, e.g. '["Creature"]'), is_basic_land (boolean). location_id is ignored.
--
-- Returns: { success, deck_id, inserted_ids, outcomes: [{ index, copy_id, kind: filled|added|unsorted,
--            deck_card_id, reason }], counts: { filled, added, unsorted, proxies_placed } }
-- Raises: deck_not_found (deck is not the caller's), invalid_copy_rows, copy_count_mismatch, import_count_mismatch,
--         and anything insert_user_copies raises (card_not_found, ...). Any raise rolls back the whole import.

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
  v_copy record;
  v_copy_id integer;
  v_slot_id integer;
  v_main_count integer;
  v_maybe_count integer;
  v_kind text;
  v_reason text;
  v_is_basic boolean;
  v_finish text;
  v_ownership text;
  v_categories text;
  v_filled integer := 0;
  v_added integer := 0;
  v_unsorted integer := 0;
  v_proxies integer := 0;
  v_total integer;
  v_default_location integer;
  v_cap integer := GREATEST(COALESCE(p_max_copies, 1), 1);
BEGIN
  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_copy_rows' USING ERRCODE = 'P0001';
  END IF;
  v_total := COALESCE(jsonb_array_length(p_rows), 0);

  -- Prove the deck is the caller's and serialise imports into it. FOR UPDATE on the deck row also makes anyone
  -- adding a card to this deck (their insert takes a share lock on the deck row) wait until we finish.
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('success', true, 'deck_id', p_deck_id, 'inserted_ids', '[]'::jsonb,
      'outcomes', '[]'::jsonb,
      'counts', jsonb_build_object('filled', 0, 'added', 0, 'unsorted', 0, 'proxies_placed', 0));
  END IF;

  -- Freeze the deck's slots for the rest of this transaction (waits for any writer that is mid-change, e.g. a
  -- manual assign). After this no one can fill or edit these slots until we commit.
  PERFORM 1 FROM deck_cards WHERE deck_id = p_deck_id ORDER BY id FOR UPDATE;

  -- Save every copy first, in FILE ORDER, with no location so they start in Unsorted.
  v_inserted := (public.insert_user_copies(p_user_id, (
    SELECT jsonb_agg(t.elem - 'location_id' ORDER BY t.ord)
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(elem, ord)
  )))->'inserted_ids';

  IF jsonb_array_length(v_inserted) <> v_total THEN
    RAISE EXCEPTION 'copy_count_mismatch' USING ERRCODE = 'P0001';
  END IF;

  v_default_location := public._ensure_default_storage_location_id(p_user_id);

  FOR v_row IN
    SELECT (t.ord - 1)::integer AS idx, t.elem AS elem
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(elem, ord)
    ORDER BY t.ord
  LOOP
    v_copy_id := (v_inserted->>(v_row.idx))::integer;
    v_slot_id := NULL;
    v_kind := 'unsorted';
    v_reason := NULL;

    -- The saved copy is the source of truth for name, printing, finish and proxy flag.
    SELECT uc.printing_id, uc.finish, uc.is_proxy, c.card_name
    INTO v_copy
    FROM user_copies uc
    JOIN user_cards c ON c.id = uc.card_id
    WHERE uc.id = v_copy_id AND uc.user_id = p_user_id;

    v_finish := CASE WHEN v_copy.finish IN ('nonfoil', 'foil', 'etched') THEN v_copy.finish ELSE 'nonfoil' END;
    v_ownership := CASE WHEN v_copy.is_proxy THEN 'proxy' ELSE 'original' END;
    v_is_basic := COALESCE((v_row.elem->>'is_basic_land')::boolean, false)
      OR lower(btrim(v_copy.card_name)) IN
         ('plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
          'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
          'snow-covered mountain', 'snow-covered forest');

    BEGIN  -- per-copy sub-block: an expected failure here sends only this copy to Unsorted
      -- Fill: an empty, tracked (non-generic), non-Maybeboard slot of this card; exact printing + finish first.
      SELECT dc.id INTO v_slot_id
      FROM deck_cards dc
      WHERE dc.deck_id = p_deck_id AND dc.user_id = p_user_id AND dc.copy_id IS NULL
        AND NOT dc.is_generic
        AND lower(btrim(dc.card_name)) = lower(btrim(v_copy.card_name))
        AND COALESCE(dc.categories, '') NOT LIKE '%Maybeboard%'
      ORDER BY (dc.scryfall_id IS NOT NULL AND dc.scryfall_id = v_copy.printing_id
                AND COALESCE(dc.requested_finish, 'nonfoil') = v_finish) DESC,
               dc.id
      LIMIT 1;   -- rows are already locked above; no SKIP LOCKED

      IF v_slot_id IS NOT NULL THEN
        UPDATE deck_cards
        SET copy_id = v_copy_id,
            ownership_status = v_ownership,
            placement_source = 'import'
        WHERE id = v_slot_id;
        UPDATE user_copies SET location_id = NULL WHERE id = v_copy_id;
        v_kind := 'filled';
      ELSIF v_is_basic THEN
        v_reason := 'basic_land';
      ELSE
        SELECT count(*) FILTER (WHERE COALESCE(categories, '') NOT LIKE '%Maybeboard%'),
               count(*) FILTER (WHERE COALESCE(categories, '') LIKE '%Maybeboard%')
        INTO v_main_count, v_maybe_count
        FROM deck_cards
        WHERE deck_id = p_deck_id AND user_id = p_user_id
          AND lower(btrim(card_name)) = lower(btrim(v_copy.card_name));

        IF v_main_count = 0 AND v_maybe_count > 0 THEN
          v_reason := 'maybeboard_only';
        ELSIF v_main_count < v_cap THEN
          v_categories := COALESCE(NULLIF(btrim(v_row.elem->>'categories'), ''), '["Other"]');
          IF v_categories LIKE '%Maybeboard%' THEN
            v_categories := '["Other"]';
          END IF;
          -- Name and printing come from the owned copy, so the identity trigger accepts the new slot.
          INSERT INTO deck_cards (
            deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
            copy_id, ownership_status, placement_source, requested_finish
          ) VALUES (
            p_deck_id, v_copy.card_name,
            COALESCE(NULLIF(btrim(v_copy.printing_id), ''), NULLIF(btrim(v_row.elem->>'scryfall_id'), '')),
            NULLIF(btrim(v_row.elem->>'set_code'), ''), 1, v_categories, false, p_user_id,
            v_copy_id, v_ownership, 'import', v_finish
          ) RETURNING id INTO v_slot_id;
          UPDATE user_copies SET location_id = NULL WHERE id = v_copy_id;
          v_kind := 'added';
        ELSE
          v_reason := 'already_filled';
        END IF;
      END IF;
    EXCEPTION WHEN SQLSTATE 'P0001' OR check_violation OR unique_violation OR foreign_key_violation THEN
      -- Expected business/constraint failures only (identity mismatch, copy not available, slot rule).
      -- The sub-block's own writes are already undone; park this copy in Unsorted.
      v_slot_id := NULL;
      v_kind := 'unsorted';
      v_reason := 'could_not_place';
      UPDATE user_copies SET location_id = v_default_location WHERE id = v_copy_id;
    END;

    -- Tally AFTER the sub-block so a rolled-back copy can never be counted as placed.
    IF v_kind = 'filled' THEN
      v_filled := v_filled + 1;
    ELSIF v_kind = 'added' THEN
      v_added := v_added + 1;
    ELSE
      v_unsorted := v_unsorted + 1;
    END IF;
    IF v_kind IN ('filled', 'added') AND v_copy.is_proxy THEN
      v_proxies := v_proxies + 1;
    END IF;

    v_result := v_result || jsonb_build_object(
      'index', v_row.idx, 'copy_id', v_copy_id, 'kind', v_kind, 'deck_card_id', v_slot_id, 'reason', v_reason);
  END LOOP;

  IF v_filled + v_added + v_unsorted <> v_total THEN
    RAISE EXCEPTION 'import_count_mismatch' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deck_id', p_deck_id,
    'inserted_ids', v_inserted,
    'outcomes', v_result,
    'counts', jsonb_build_object('filled', v_filled, 'added', v_added, 'unsorted', v_unsorted,
                                 'proxies_placed', v_proxies)
  );
END;
$function$;

-- service_role only. anon must be revoked explicitly: Supabase grants new functions to anon by default.
REVOKE ALL ON FUNCTION public.insert_user_copies_to_deck(uuid, integer, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_user_copies_to_deck(uuid, integer, jsonb, integer) TO service_role;
