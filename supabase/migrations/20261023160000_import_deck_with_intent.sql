-- ARCHITECT REVIEW 2026-10-23: APPROVE WITH CHANGES. Small SQL changes already made in this file (alert variables, REVOKE from anon).
-- See docs/oracle/reports/2026-10-23-architect-m2-review.md. Apply this file as-is; the remaining changes are in route code.
-- M2. Architect approved with changes (included); owner approved applying 2026-10-23. Moved here from contracts/drafts.
-- Owner approved the idea in Round 18.
-- Contract: docs/oracle/contracts/import-intent.md §5 (save semantics) and §7 (row M2).
-- Needs M1 (deck_card_alerts) first. M1 is applied (20261023140000).
--
-- Adds ONE new function, public.import_deck_with_intent(p_deck_id, p_user_id, p_rows). It fills a brand-new,
-- EMPTY deck from the rows the app sends after it has recomputed ownership on the server.
-- Per row `action`:
--   add_sleeved   new copy added to the collection and sleeved here            (as replace_deck_with_new_cards)
--   add_unsleeved new copy added to the collection, slot left planned ("Added, not sleeved")
--   sleeve_owned  an owned FREE copy is linked to the slot (picked here, under lock)
--   move          an owned copy held in from_deck_id is re-linked to this deck's slot; the donor slot is left
--                 planned (same as release_deck_copies / _move_copy_to_slot). Nothing is deleted.
--   move_skipped  new copy added and sleeved here; one deck_card_alerts row per holder deck (alert_deck_ids)
--   planned       planned slot only, no copy (Unowned / owned but Unsleeved)
--   generic       generic basic slot, no copy (as replace_deck_with_new_cards)
--
-- DEVIATION FROM THE CONTRACT TEXT (for the Architect to rule on): the contract says the route picks the copy id and
-- passes it as link_copy_id. This draft instead passes a DESCRIPTOR (link_printing_id, link_is_proxy, wanted finish)
-- and the function picks the concrete copy under lock. Reasons: ownership facts never expose copy ids (by design);
-- the pick and the verify happen in one transaction, so there is no stale-id window; two identical rows pick two
-- different copies. A copy that cannot be found/locked is NOT an error: that slot is saved planned and returned in
-- needs_a_look (reason copy_no_longer_free / copy_no_longer_in_deck), exactly as contract §5 step 3.
--
-- LOCKING: pg_try_advisory_xact_lock on 'collection-copy:<id>' (same key names as the movement functions). It never
-- waits, so two imports cannot deadlock; a contended copy is simply not used (-> needs_a_look).
--
-- SAFETY: CREATE OR REPLACE FUNCTION only. The function NEVER deletes anything: no DELETE, no TRUNCATE, no DROP.
-- It refuses a deck that already has slots (deck_not_empty). It never touches user_copies of other users (every
-- lookup filters by p_user_id) and never deletes user_copies or deck_cards. Its only UPDATEs: the donor slot of a
-- move (copy_id/ownership_status/placement_source cleared, as release_deck_copies does) and user_copies.location_id
-- of a copy that is now sleeved. SECURITY DEFINER, search_path = public, granted to service_role only.
-- Atomic: any exception rolls back every insert, move and alert of the call.
-- Undo: DROP FUNCTION public.import_deck_with_intent(integer, uuid, jsonb);  (it only exists to be called by the import route)
--
-- Row keys (jsonb): action, row_index, card_id, card_name, printing_id, scryfall_id, set_code, categories,
-- is_commander, is_proxy, finish, source_tag, language, card_condition, is_generic, generic_sleeved,
-- link_printing_id, link_is_proxy, from_deck_id, alert_deck_ids (array of integers).
-- row_index is the position the app uses to map needs_a_look back to a (row, copy); the function only echoes it.

CREATE OR REPLACE FUNCTION public.import_deck_with_intent(
  p_deck_id integer,
  p_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_cand record;
  v_new_copy_id integer;
  v_picked_copy_id integer;
  v_picked_is_proxy boolean;
  v_picked_printing text;
  v_donor_slot_id integer;
  v_default_location_id integer;
  v_row_finish text;
  v_row_requested_finish text;
  v_row_source_tag text;
  v_row_language text;
  v_row_condition text;
  v_alert_deck text;
  v_alert_slot_id integer;
  v_alert_copy_id integer;
  v_alert_rows integer;
  v_inserted_count integer := 0;
  v_moved_count integer := 0;
  v_alerts_created integer := 0;
  v_needs jsonb := '[]'::jsonb;
  v_generic_names text[] := ARRAY['Plains','Island','Swamp','Mountain','Forest','Wastes','Snow-Covered Plains','Snow-Covered Island','Snow-Covered Swamp','Snow-Covered Mountain','Snow-Covered Forest'];
BEGIN
  -- The deck must be the caller's. Locked so a double submit cannot fill it twice.
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- This function only fills an empty deck. It never replaces or deletes slots.
  IF EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = p_deck_id) THEN
    RAISE EXCEPTION 'deck_not_empty' USING ERRCODE = 'P0001';
  END IF;

  v_default_location_id := public._default_storage_location_id(p_user_id);

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS rows(
      action text,
      row_index integer,
      card_id integer,
      card_name text,
      printing_id text,
      scryfall_id text,
      set_code text,
      categories text,
      is_commander boolean,
      is_proxy boolean,
      finish text,
      source_tag text,
      language text,
      card_condition text,
      is_generic boolean,
      generic_sleeved boolean,
      link_printing_id text,
      link_is_proxy boolean,
      from_deck_id integer,
      alert_deck_ids jsonb
    )
  LOOP
    IF v_row.action IS NULL OR v_row.action NOT IN
       ('add_sleeved','add_unsleeved','sleeve_owned','move','move_skipped','planned','generic') THEN
      RAISE EXCEPTION 'invalid_row_action' USING ERRCODE = 'P0001';
    END IF;
    IF v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
      RAISE EXCEPTION 'invalid_new_card_row' USING ERRCODE = 'P0001';
    END IF;

    -- Finish / language / condition: same checks as replace_deck_with_new_cards.
    IF v_row.finish IS NULL OR btrim(v_row.finish) = '' THEN
      v_row_finish := 'nonfoil';
      v_row_requested_finish := NULL;
    ELSIF v_row.finish IN ('nonfoil', 'foil', 'etched') THEN
      v_row_finish := v_row.finish;
      v_row_requested_finish := v_row.finish;
    ELSE
      RAISE EXCEPTION 'invalid_row_finish' USING ERRCODE = 'P0001';
    END IF;

    IF v_row.language IS NULL OR btrim(v_row.language) = '' THEN
      v_row_language := 'en';
    ELSIF lower(btrim(v_row.language)) ~ '^[a-z]{2,4}$' THEN
      v_row_language := lower(btrim(v_row.language));
    ELSE
      RAISE EXCEPTION 'invalid_row_language' USING ERRCODE = 'P0001';
    END IF;

    IF v_row.card_condition IS NULL OR btrim(v_row.card_condition) = '' THEN
      v_row_condition := NULL;
    ELSIF v_row.card_condition IN ('near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged') THEN
      v_row_condition := v_row.card_condition;
    ELSE
      RAISE EXCEPTION 'invalid_row_condition' USING ERRCODE = 'P0001';
    END IF;

    v_row_source_tag := COALESCE(NULLIF(btrim(v_row.source_tag), ''), 'deck-import');

    -- ── generic basic: planned slot with the explicit flags, no copy ────────────────────────────
    IF v_row.action = 'generic' THEN
      IF NOT (v_row.card_name = ANY (v_generic_names)) THEN
        RAISE EXCEPTION 'invalid_generic_card_name' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO deck_cards (
        deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
        copy_id, ownership_status, placement_source, requested_finish, requested_language,
        is_generic, generic_sleeved
      ) VALUES (
        p_deck_id, v_row.card_name, v_row.scryfall_id, v_row.set_code, 1,
        COALESCE(v_row.categories, '["Land"]'), false, p_user_id,
        NULL, NULL, NULL, v_row_requested_finish,
        CASE WHEN btrim(COALESCE(v_row.language, '')) = '' THEN NULL ELSE v_row_language END,
        true, COALESCE(v_row.generic_sleeved, true)
      );
      v_inserted_count := v_inserted_count + 1;
      CONTINUE;
    END IF;

    -- ── planned slot only (Unowned, or owned but Unsleeved) ─────────────────────────────────────
    IF v_row.action = 'planned' THEN
      INSERT INTO deck_cards (
        deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
        copy_id, ownership_status, placement_source, requested_finish
      ) VALUES (
        p_deck_id, v_row.card_name, v_row.scryfall_id, v_row.set_code, 1,
        COALESCE(v_row.categories, '["Maybeboard"]'), COALESCE(v_row.is_commander, false), p_user_id,
        NULL, NULL, NULL, v_row_requested_finish
      );
      v_inserted_count := v_inserted_count + 1;
      CONTINUE;
    END IF;

    -- Everything below concerns a real card: its user_cards row must be the caller's.
    IF v_row.card_id IS NULL THEN
      RAISE EXCEPTION 'invalid_new_card_row' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM user_cards uc WHERE uc.id = v_row.card_id AND uc.user_id = p_user_id) THEN
      RAISE EXCEPTION 'card_not_found' USING ERRCODE = 'P0001';
    END IF;

    -- ── new copies: add_sleeved / move_skipped (sleeved), add_unsleeved (collection only) ────────
    IF v_row.action IN ('add_sleeved', 'move_skipped', 'add_unsleeved') THEN
      INSERT INTO user_copies (
        card_id, printing_id, is_proxy, source_tag, finish, language, condition, location_id, user_id
      ) VALUES (
        v_row.card_id,
        COALESCE(v_row.printing_id, v_row.scryfall_id),
        COALESCE(v_row.is_proxy, false),
        v_row_source_tag,
        v_row_finish,
        v_row_language,
        v_row_condition,
        CASE WHEN v_row.action = 'add_unsleeved' THEN v_default_location_id ELSE NULL END,
        p_user_id
      )
      RETURNING id INTO v_new_copy_id;

      IF v_row.action = 'add_unsleeved' THEN
        INSERT INTO deck_cards (
          deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
          copy_id, ownership_status, placement_source, requested_finish
        ) VALUES (
          p_deck_id, v_row.card_name, v_row.scryfall_id, v_row.set_code, 1, v_row.categories,
          COALESCE(v_row.is_commander, false), p_user_id, NULL, NULL, NULL, v_row_requested_finish
        );
      ELSE
        INSERT INTO deck_cards (
          deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
          copy_id, ownership_status, placement_source, requested_finish
        ) VALUES (
          p_deck_id, v_row.card_name, v_row.scryfall_id, v_row.set_code, 1, v_row.categories,
          COALESCE(v_row.is_commander, false), p_user_id, v_new_copy_id,
          CASE WHEN COALESCE(v_row.is_proxy, false) THEN 'proxy' ELSE 'original' END,
          'import', v_row_requested_finish
        );
      END IF;
      v_inserted_count := v_inserted_count + 1;

      -- Skipped move: one alert per holder deck, on the slot there that still holds a copy of this card.
      IF v_row.action = 'move_skipped' AND v_row.alert_deck_ids IS NOT NULL
         AND jsonb_typeof(v_row.alert_deck_ids) = 'array' THEN
        FOR v_alert_deck IN SELECT DISTINCT jsonb_array_elements_text(v_row.alert_deck_ids) LOOP
          -- Only the caller's own decks, never this new deck.
          IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = v_alert_deck::integer AND d.user_id = p_user_id)
             OR v_alert_deck::integer = p_deck_id THEN
            CONTINUE;
          END IF;
          -- (Architect review: two plain integers instead of a record variable; SELECT INTO sets both to NULL
          -- when no slot matches, so there is no "record not assigned" edge case.)
          SELECT dc.id, dc.copy_id INTO v_alert_slot_id, v_alert_copy_id
          FROM deck_cards dc
          JOIN user_copies uc ON uc.id = dc.copy_id
          WHERE dc.deck_id = v_alert_deck::integer
            AND dc.user_id = p_user_id
            AND uc.user_id = p_user_id
            AND uc.card_id = v_row.card_id
            AND NOT EXISTS (
              SELECT 1 FROM deck_card_alerts a WHERE a.deck_card_id = dc.id AND a.status = 'open'
            )
          ORDER BY dc.id
          LIMIT 1;
          IF v_alert_slot_id IS NOT NULL THEN
            INSERT INTO deck_card_alerts (user_id, deck_id, deck_card_id, copy_id, card_name, caused_by_deck_id)
            VALUES (p_user_id, v_alert_deck::integer, v_alert_slot_id, v_alert_copy_id,
                    v_row.card_name, p_deck_id)
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_alert_rows = ROW_COUNT;
            v_alerts_created := v_alerts_created + v_alert_rows;
          END IF;
        END LOOP;
      END IF;
      CONTINUE;
    END IF;

    -- ── sleeve_owned: pick a FREE copy matching the descriptor, under lock ──────────────────────
    IF v_row.action = 'sleeve_owned' THEN
      v_picked_copy_id := NULL;
      FOR v_cand IN
        SELECT uc.id, uc.is_proxy, uc.printing_id
        FROM user_copies uc
        WHERE uc.user_id = p_user_id
          AND uc.card_id = v_row.card_id
          AND uc.missing = false
          AND uc.printing_id = v_row.link_printing_id
          AND uc.is_proxy = COALESCE(v_row.link_is_proxy, false)
        ORDER BY (uc.finish = v_row_finish) DESC, uc.id
      LOOP
        IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-copy:' || v_cand.id::text, 0)) THEN
          CONTINUE;
        END IF;
        -- Re-check after the lock: still free, still the user's, still not missing.
        IF EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.copy_id = v_cand.id) THEN
          CONTINUE;
        END IF;
        PERFORM 1 FROM user_copies uc
        WHERE uc.id = v_cand.id AND uc.user_id = p_user_id AND uc.missing = false
        FOR UPDATE;
        IF FOUND THEN
          v_picked_copy_id := v_cand.id;
          v_picked_is_proxy := v_cand.is_proxy;
          v_picked_printing := v_cand.printing_id;
          EXIT;
        END IF;
      END LOOP;

      IF v_picked_copy_id IS NULL THEN
        -- Not an error: planned slot, listed as "needs a look".
        INSERT INTO deck_cards (
          deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
          copy_id, ownership_status, placement_source, requested_finish
        ) VALUES (
          p_deck_id, v_row.card_name, v_row.scryfall_id, v_row.set_code, 1, v_row.categories,
          COALESCE(v_row.is_commander, false), p_user_id, NULL, NULL, NULL, v_row_requested_finish
        );
        v_needs := v_needs || jsonb_build_object('row_index', v_row.row_index, 'reason', 'copy_no_longer_free');
      ELSE
        INSERT INTO deck_cards (
          deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
          copy_id, ownership_status, placement_source, requested_finish
        ) VALUES (
          p_deck_id, v_row.card_name, v_picked_printing, v_row.set_code, 1, v_row.categories,
          COALESCE(v_row.is_commander, false), p_user_id, v_picked_copy_id,
          CASE WHEN v_picked_is_proxy THEN 'proxy' ELSE 'original' END,
          'import', v_row_requested_finish
        );
        UPDATE user_copies SET location_id = NULL WHERE id = v_picked_copy_id AND user_id = p_user_id;
      END IF;
      v_inserted_count := v_inserted_count + 1;
      CONTINUE;
    END IF;

    -- ── move: take a matching copy from from_deck_id (owner confirmed on the review) ────────────
    IF v_row.action = 'move' THEN
      v_picked_copy_id := NULL;
      IF v_row.from_deck_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM decks d WHERE d.id = v_row.from_deck_id AND d.user_id = p_user_id)
         AND v_row.from_deck_id <> p_deck_id THEN
        FOR v_cand IN
          SELECT dc.id AS slot_id, uc.id AS copy_id, uc.is_proxy, uc.printing_id
          FROM deck_cards dc
          JOIN user_copies uc ON uc.id = dc.copy_id
          WHERE dc.deck_id = v_row.from_deck_id
            AND dc.user_id = p_user_id
            AND uc.user_id = p_user_id
            AND uc.card_id = v_row.card_id
            AND uc.missing = false
            AND uc.printing_id = v_row.link_printing_id
            AND uc.is_proxy = COALESCE(v_row.link_is_proxy, false)
          ORDER BY (uc.finish = v_row_finish) DESC, uc.id
        LOOP
          IF NOT pg_try_advisory_xact_lock(hashtextextended('collection-copy:' || v_cand.copy_id::text, 0)) THEN
            CONTINUE;
          END IF;
          -- Re-check under the lock: the donor slot still holds this copy.
          PERFORM 1 FROM deck_cards dc
          WHERE dc.id = v_cand.slot_id AND dc.copy_id = v_cand.copy_id AND dc.user_id = p_user_id
          FOR UPDATE;
          IF FOUND THEN
            v_picked_copy_id := v_cand.copy_id;
            v_picked_is_proxy := v_cand.is_proxy;
            v_picked_printing := v_cand.printing_id;
            v_donor_slot_id := v_cand.slot_id;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF v_picked_copy_id IS NULL THEN
        INSERT INTO deck_cards (
          deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
          copy_id, ownership_status, placement_source, requested_finish
        ) VALUES (
          p_deck_id, v_row.card_name, v_row.scryfall_id, v_row.set_code, 1, v_row.categories,
          COALESCE(v_row.is_commander, false), p_user_id, NULL, NULL, NULL, v_row_requested_finish
        );
        v_needs := v_needs || jsonb_build_object('row_index', v_row.row_index, 'reason', 'copy_no_longer_in_deck');
      ELSE
        -- Donor slot stays as a planned slot (same as release_deck_copies). Nothing is deleted.
        UPDATE deck_cards
        SET copy_id = NULL, ownership_status = NULL, placement_source = NULL
        WHERE id = v_donor_slot_id AND user_id = p_user_id;

        INSERT INTO deck_cards (
          deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id,
          copy_id, ownership_status, placement_source, requested_finish
        ) VALUES (
          p_deck_id, v_row.card_name, v_picked_printing, v_row.set_code, 1, v_row.categories,
          COALESCE(v_row.is_commander, false), p_user_id, v_picked_copy_id,
          CASE WHEN v_picked_is_proxy THEN 'proxy' ELSE 'original' END,
          'import', v_row_requested_finish
        );
        UPDATE user_copies SET location_id = NULL WHERE id = v_picked_copy_id AND user_id = p_user_id;
        v_moved_count := v_moved_count + 1;
      END IF;
      v_inserted_count := v_inserted_count + 1;
      CONTINUE;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count,
    'moved_count', v_moved_count,
    'alerts_created', v_alerts_created,
    'needs_a_look', v_needs
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.import_deck_with_intent(integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_deck_with_intent(integer, uuid, jsonb) TO service_role;
