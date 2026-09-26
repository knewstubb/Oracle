-- Task T-21: Built-deck import must assign a physical copy only when the
-- sleeved copy is the exact printing the deck lists (D-021).
--
-- D-021 locks instance-level accuracy: the app must know which physical copy is
-- in which deck, and that copy must be the exact printing (`scryfall_id`) the
-- deck asks for. Before this migration `reconcile_built_deck` preferred a
-- printing match but fell back to any owned copy of the same card name
-- (20260925220000_placement_source.sql lines 1399-1407, carried into
-- 20260926120000_import_maybeboard_relation.sql), so slots could be assigned a
-- copy whose printing differed from the deck list (T-13 report section 6: 124
-- such slots).
--
-- This migration replaces `reconcile_built_deck` so that it:
--
--   1. leaves an inserted slot Planned unless a free copy of the exact printing
--      is in default storage — there is no name-only fallback; and
--   2. on re-import, treats an existing slot whose sleeved copy is a different
--      printing as unresolved: the copy is released to default storage and the
--      slot is left Planned. Correctly matching assignments are still preserved.
--
-- Maybeboard slots (D-005/D-018), generic basic-land slots and manual proxy
-- assignments are exempt: they never allocate or track a real owned copy of a
-- specific printing, so they keep their previous behaviour. The function
-- signature is unchanged, so existing callers keep working.
--
-- Reversibility: forward-only. To restore the previous fallback, re-apply the
-- `reconcile_built_deck` body from
-- 20260926120000_import_maybeboard_relation.sql.

CREATE OR REPLACE FUNCTION public.reconcile_built_deck(
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
  v_default_location_id integer;
  v_row record;
  v_existing record;
  v_copy_id integer;
  v_copy_is_proxy boolean;
  v_target_id integer;
  v_quantity integer;
  v_index integer;
  v_match_ids integer[] := ARRAY[]::integer[];
  v_assigned_count integer := 0;
  v_released_count integer := 0;
  v_inserted_count integer := 0;
  v_deleted_count integer := 0;
  v_group_assigned integer;
  v_group_unresolved integer;
  v_total_copies integer;
  v_free_copies integer;
  v_claimed_copies integer;
  v_claimed_decks jsonb;
  v_conflicts jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_built_import_rows'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('built-import-user:' || p_user_id::text, 0)
  );

  PERFORM 1
  FROM decks
  WHERE id = p_deck_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  v_default_location_id := public._default_storage_location_id(p_user_id);

  FOR v_copy_id IN
    SELECT dc.copy_id
    FROM deck_cards dc
    WHERE dc.deck_id = p_deck_id
      AND dc.user_id = p_user_id
      AND dc.copy_id IS NOT NULL
    ORDER BY dc.copy_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );
  END LOOP;

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS rows(
      card_name text,
      scryfall_id text,
      set_code text,
      categories text,
      is_commander boolean,
      quantity integer,
      is_generic_land boolean,
      is_maybeboard boolean
    )
  LOOP
    IF v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
      RAISE EXCEPTION 'invalid_built_import_row'
        USING ERRCODE = 'P0001';
    END IF;

    v_quantity := COALESCE(v_row.quantity, 1);
    IF v_quantity < 1 OR v_quantity > 100 THEN
      RAISE EXCEPTION 'invalid_built_import_quantity'
        USING ERRCODE = 'P0001';
    END IF;

    v_group_assigned := 0;
    v_group_unresolved := 0;

    FOR v_index IN 1..v_quantity
    LOOP
      -- Join the sleeved copy so a matched row can be checked against D-021.
      -- FOR UPDATE OF dc only: the outer-joined copy may be NULL.
      SELECT dc.id, dc.copy_id,
             copy.printing_id AS copy_printing_id,
             copy.is_proxy AS copy_is_proxy
      INTO v_existing
      FROM deck_cards dc
      LEFT JOIN user_copies copy ON copy.id = dc.copy_id
      WHERE dc.deck_id = p_deck_id
        AND dc.user_id = p_user_id
        AND dc.card_name = v_row.card_name
        AND dc.scryfall_id IS NOT DISTINCT FROM v_row.scryfall_id
        AND COALESCE(dc.categories LIKE '%Maybeboard%', false)
              = COALESCE(v_row.is_maybeboard, false)
        AND NOT (dc.id = ANY(v_match_ids))
      -- Prefer a row that is already validly assigned (exact printing, or an
      -- exempt proxy/generic/maybeboard slot), then an unassigned row, and only
      -- then a mismatched assignment that this pass will release. This stops a
      -- duplicate mismatched row from consuming the match and evicting a
      -- correct assignment.
      ORDER BY
        CASE
          WHEN dc.copy_id IS NULL THEN 1
          WHEN COALESCE(copy.is_proxy, false)
               OR COALESCE(v_row.is_maybeboard, false)
               OR COALESCE(v_row.is_generic_land, false) THEN 0
          WHEN v_row.scryfall_id IS NOT NULL
               AND copy.printing_id = v_row.scryfall_id THEN 0
          ELSE 2
        END,
        dc.id
      LIMIT 1
      FOR UPDATE OF dc;

      IF FOUND THEN
        v_match_ids := array_append(v_match_ids, v_existing.id);

        IF v_existing.copy_id IS NULL THEN
          v_group_unresolved := v_group_unresolved + 1;
          CONTINUE;
        END IF;

        -- Maybeboard slots are never allocated (D-005/D-018), generic lands do
        -- not track an individual copy, and a proxy stands in for a card rather
        -- than being an owned printing (D-019). Keep their previous behaviour.
        IF COALESCE(v_row.is_maybeboard, false)
           OR COALESCE(v_row.is_generic_land, false)
           OR COALESCE(v_existing.copy_is_proxy, false) THEN
          v_group_assigned := v_group_assigned + 1;
          v_assigned_count := v_assigned_count + 1;
          CONTINUE;
        END IF;

        -- D-021: keep the assignment only when the sleeved copy is the exact
        -- printing the deck lists. Otherwise release it to storage and leave
        -- the slot Planned.
        IF v_row.scryfall_id IS NOT NULL
           AND v_existing.copy_printing_id = v_row.scryfall_id THEN
          v_group_assigned := v_group_assigned + 1;
          v_assigned_count := v_assigned_count + 1;
        ELSE
          UPDATE user_copies
          SET location_id = CASE WHEN COALESCE(missing, false) THEN NULL ELSE v_default_location_id END
          WHERE id = v_existing.copy_id
            AND user_id = p_user_id;

          UPDATE deck_cards
          SET copy_id = NULL,
              ownership_status = NULL,
              placement_source = NULL
          WHERE id = v_existing.id
            AND deck_id = p_deck_id
            AND user_id = p_user_id;

          v_released_count := v_released_count + 1;
          v_group_unresolved := v_group_unresolved + 1;
        END IF;
        CONTINUE;
      END IF;

      INSERT INTO deck_cards (
        deck_id,
        card_name,
        scryfall_id,
        set_code,
        quantity,
        categories,
        is_commander,
        user_id,
        copy_id,
        ownership_status
      )
      VALUES (
        p_deck_id,
        v_row.card_name,
        v_row.scryfall_id,
        v_row.set_code,
        1,
        v_row.categories,
        COALESCE(v_row.is_commander, false),
        p_user_id,
        NULL,
        NULL
      )
      RETURNING id INTO v_target_id;

      v_inserted_count := v_inserted_count + 1;
      v_match_ids := array_append(v_match_ids, v_target_id);

      -- Maybeboard slots are never allocated a physical copy (D-005/D-018).
      IF COALESCE(v_row.is_maybeboard, false) THEN
        CONTINUE;
      END IF;

      -- Generic basic-land rows intentionally remain Planned and do not
      -- require an individually tracked physical copy.
      IF COALESCE(v_row.is_generic_land, false) THEN
        CONTINUE;
      END IF;

      -- D-021: only a free copy of the exact scryfall printing is eligible.
      -- There is no fallback to another printing of the same card name.
      SELECT uc.id, uc.is_proxy
      INTO v_copy_id, v_copy_is_proxy
      FROM user_copies uc
      JOIN user_cards ucard ON ucard.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND ucard.card_name = v_row.card_name
        AND v_row.scryfall_id IS NOT NULL
        AND uc.printing_id = v_row.scryfall_id
        AND COALESCE(uc.missing, false) = false
        AND uc.location_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM user_locations ul
          WHERE ul.id = uc.location_id
            AND ul.user_id = p_user_id
            AND ul.type = 'storage'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM deck_cards held
          WHERE held.copy_id = uc.id
        )
      ORDER BY uc.id
      LIMIT 1
      FOR UPDATE OF uc;

      IF FOUND THEN
        UPDATE deck_cards
        SET copy_id = v_copy_id,
            ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END,
            placement_source = 'import'
        WHERE id = v_target_id
          AND deck_id = p_deck_id
          AND user_id = p_user_id;

        UPDATE user_copies
        SET location_id = NULL
        WHERE id = v_copy_id
          AND user_id = p_user_id;

        v_group_assigned := v_group_assigned + 1;
        v_assigned_count := v_assigned_count + 1;
      ELSE
        v_group_unresolved := v_group_unresolved + 1;
      END IF;
    END LOOP;

    IF v_group_unresolved > 0
       AND NOT COALESCE(v_row.is_generic_land, false)
       AND NOT COALESCE(v_row.is_maybeboard, false) THEN
      SELECT
        count(*)::integer,
        count(*) FILTER (
          WHERE COALESCE(uc.missing, false) = false
            AND uc.location_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM user_locations ul
              WHERE ul.id = uc.location_id
                AND ul.user_id = p_user_id
                AND ul.type = 'storage'
            )
            AND NOT EXISTS (
              SELECT 1
              FROM deck_cards held
              WHERE held.copy_id = uc.id
            )
        )::integer,
        count(*) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM deck_cards held
            WHERE held.copy_id = uc.id
          )
        )::integer
      INTO v_total_copies, v_free_copies, v_claimed_copies
      FROM user_copies uc
      JOIN user_cards ucard ON ucard.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND ucard.card_name = v_row.card_name;

      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('deckId', d.id, 'deckName', d.name)),
        '[]'::jsonb
      )
      INTO v_claimed_decks
      FROM deck_cards held
      JOIN decks d ON d.id = held.deck_id
      JOIN user_copies held_copy ON held_copy.id = held.copy_id
      JOIN user_cards held_card ON held_card.id = held_copy.card_id
      WHERE held.user_id = p_user_id
        AND held_copy.user_id = p_user_id
        AND held_card.card_name = v_row.card_name;

      v_conflicts := v_conflicts || jsonb_build_array(
        jsonb_build_object(
          'cardName', v_row.card_name,
          'scryfallId', v_row.scryfall_id,
          'requested', v_quantity,
          'assigned', v_group_assigned,
          'unresolved', v_group_unresolved,
          'reason', CASE
            WHEN COALESCE(v_total_copies, 0) = 0 THEN 'unowned'
            WHEN COALESCE(v_free_copies, 0) = 0 AND COALESCE(v_claimed_copies, 0) > 0 THEN 'claimed'
            ELSE 'no_free_copy'
          END,
          'claimedDecks', v_claimed_decks
        )
      );
    END IF;
  END LOOP;

  FOR v_existing IN
    SELECT dc.id, dc.copy_id
    FROM deck_cards dc
    WHERE dc.deck_id = p_deck_id
      AND dc.user_id = p_user_id
      AND NOT (dc.id = ANY(v_match_ids))
    ORDER BY dc.id
    FOR UPDATE
  LOOP
    IF v_existing.copy_id IS NOT NULL THEN
      UPDATE user_copies
      SET location_id = CASE WHEN COALESCE(missing, false) THEN NULL ELSE v_default_location_id END
      WHERE id = v_existing.copy_id
        AND user_id = p_user_id;
      v_released_count := v_released_count + 1;
    END IF;

    DELETE FROM deck_cards
    WHERE id = v_existing.id
      AND deck_id = p_deck_id
      AND user_id = p_user_id;
    v_deleted_count := v_deleted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'assigned_count', v_assigned_count,
    'shortfall_count', COALESCE((
      SELECT sum((entry->>'unresolved')::integer)
      FROM jsonb_array_elements(v_conflicts) entry
    ), 0),
    'released_count', v_released_count,
    'inserted_count', v_inserted_count,
    'deleted_count', v_deleted_count,
    'conflicts', v_conflicts
  );
END;
$function$;
