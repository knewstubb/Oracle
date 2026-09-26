-- Task T-20: Import Archidekt maybeboard and sideboard cards into Oracle's
-- maybeboard relation (D-005, D-018).
--
-- The normalizer now returns maybeboard/sideboard cards separately, and the
-- importers include them in the write payload with a per-row `is_maybeboard`
-- flag. This migration teaches the two import RPCs about that flag:
--
--   1. reconcile_built_deck:
--        - matches existing rows within the same relation (so a card that is
--          both in the deck and on the maybeboard stays two slots),
--        - inserts maybeboard rows as planned slots with copy_id NULL,
--        - never allocates a physical copy to a maybeboard row and never
--          reports a maybeboard row as a shortfall.
--
--   2. replace_deck_with_new_cards:
--        - maybeboard rows are inserted as planned slots and do NOT create a
--          user_copies row (a maybeboard card is not a physical deck card).
--
-- Reversibility: forward-only. The extra jsonb field is ignored by the previous
-- function signatures if a caller omits it, so old callers keep working; to
-- fully reverse, restore the function bodies from 20260925220000_placement_source.sql.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. replace_deck_with_new_cards — maybeboard rows create no collection copies
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.replace_deck_with_new_cards(
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
  v_copy_id integer;
  v_card_copy_id integer;
  v_row record;
  v_removed_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
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
    SELECT DISTINCT dc.copy_id
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

  UPDATE user_copies uc
  SET location_id = CASE WHEN uc.missing THEN NULL ELSE v_default_location_id END
  WHERE uc.user_id = p_user_id
    AND uc.id IN (
      SELECT dc.copy_id
      FROM deck_cards dc
      WHERE dc.deck_id = p_deck_id
        AND dc.user_id = p_user_id
        AND dc.copy_id IS NOT NULL
    );

  DELETE FROM deck_cards
  WHERE deck_id = p_deck_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS rows(
      card_id integer,
      card_name text,
      printing_id text,
      scryfall_id text,
      set_code text,
      categories text,
      is_commander boolean,
      is_proxy boolean,
      is_maybeboard boolean
    )
  LOOP
    IF v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
      RAISE EXCEPTION 'invalid_new_card_row'
        USING ERRCODE = 'P0001';
    END IF;

    -- Maybeboard relation: a planned slot only. No user_cards/user_copies row
    -- is created because the card is not part of the physical deck (D-005/D-018).
    IF COALESCE(v_row.is_maybeboard, false) THEN
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
        ownership_status,
        placement_source
      )
      VALUES (
        p_deck_id,
        v_row.card_name,
        v_row.scryfall_id,
        v_row.set_code,
        1,
        COALESCE(v_row.categories, '["Maybeboard"]'),
        false,
        p_user_id,
        NULL,
        NULL,
        NULL
      );

      v_inserted_count := v_inserted_count + 1;
      CONTINUE;
    END IF;

    IF v_row.card_id IS NULL THEN
      RAISE EXCEPTION 'invalid_new_card_row'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM user_cards uc
      WHERE uc.id = v_row.card_id
        AND uc.user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'card_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO user_copies (
      card_id,
      printing_id,
      is_proxy,
      source_tag,
      finish,
      location_id,
      user_id
    )
    VALUES (
      v_row.card_id,
      COALESCE(v_row.printing_id, v_row.scryfall_id),
      COALESCE(v_row.is_proxy, false),
      'deck-import',
      'nonfoil',
      NULL,
      p_user_id
    )
    RETURNING id INTO v_card_copy_id;

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
      ownership_status,
      placement_source
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
      v_card_copy_id,
      CASE WHEN COALESCE(v_row.is_proxy, false) THEN 'proxy' ELSE 'original' END,
      'import'
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'removed_count', v_removed_count,
    'inserted_count', v_inserted_count
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. reconcile_built_deck — relation-aware matching, no maybeboard allocation
--    Body taken from 20260925220000_placement_source.sql with only the
--    maybeboard relation changes described at the top of this file.
-- ═══════════════════════════════════════════════════════════════════════════

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
      SELECT dc.id, dc.copy_id
      INTO v_existing
      FROM deck_cards dc
      WHERE dc.deck_id = p_deck_id
        AND dc.user_id = p_user_id
        AND dc.card_name = v_row.card_name
        AND dc.scryfall_id IS NOT DISTINCT FROM v_row.scryfall_id
        AND COALESCE(dc.categories LIKE '%Maybeboard%', false)
              = COALESCE(v_row.is_maybeboard, false)
        AND NOT (dc.id = ANY(v_match_ids))
      ORDER BY (dc.copy_id IS NOT NULL) DESC, dc.id
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_match_ids := array_append(v_match_ids, v_existing.id);
        IF v_existing.copy_id IS NOT NULL THEN
          v_group_assigned := v_group_assigned + 1;
          v_assigned_count := v_assigned_count + 1;
        ELSE
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

      IF COALESCE(v_row.is_generic_land, false) THEN
        CONTINUE;
      END IF;

      SELECT uc.id, uc.is_proxy
      INTO v_copy_id, v_copy_is_proxy
      FROM user_copies uc
      JOIN user_cards ucard ON ucard.id = uc.card_id
      WHERE uc.user_id = p_user_id
        AND ucard.card_name = v_row.card_name
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
      ORDER BY
        CASE WHEN v_row.scryfall_id IS NOT NULL
                  AND uc.printing_id = v_row.scryfall_id THEN 0 ELSE 1 END,
        uc.id
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
