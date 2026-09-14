-- Reconcile an explicitly confirmed physical deck import in one transaction.
--
-- Theorycrafted imports only create Planned rows. New-cards imports create and
-- sleeve new copies through replace_deck_with_new_cards. Built imports are
-- different: the imported list is the owner's statement of physical reality,
-- so this function preserves matching assignments, pulls free storage copies,
-- releases removed assignments, and reports shortages without taking copies
-- from other decks.

DROP FUNCTION IF EXISTS public.reconcile_built_deck(integer, uuid, jsonb);

CREATE FUNCTION public.reconcile_built_deck(
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

  -- Serialize physical reconciliation for this user. This prevents two
  -- simultaneous Built imports from choosing the same free copy in opposite
  -- orders while still keeping copy-level locks for the invariant boundary.
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

  -- Lock copies already sleeved in this deck before deciding which rows can be
  -- released. This keeps reimport removal and concurrent allocation ordered.
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

  -- Process each desired identity and quantity. Existing rows are matched
  -- first, preferring already-sleeved rows so valid physical assignments stay.
  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS rows(
      card_name text,
      scryfall_id text,
      set_code text,
      categories text,
      is_commander boolean,
      quantity integer,
      is_generic_land boolean
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

      -- Generic basic-land rows intentionally remain Planned and do not
      -- require an individually tracked physical copy.
      IF COALESCE(v_row.is_generic_land, false) THEN
        CONTINUE;
      END IF;

      -- Prefer the requested printing, then any free copy of the same card.
      -- A free copy must still be in a storage location and must not already
      -- be referenced by a deck slot.
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
            ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
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

    IF v_group_unresolved > 0 AND NOT COALESCE(v_row.is_generic_land, false) THEN
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

  -- Anything not matched by the imported physical list is no longer in this
  -- Built deck. Release its copy before deleting the slot, in this transaction.
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

REVOKE ALL ON FUNCTION public.reconcile_built_deck(integer, uuid, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_built_deck(integer, uuid, jsonb) TO service_role;
