-- Collection Foundation Phase 2/3: current-schema atomic card movements
--
-- All operations that change the relationship between user_copies.location_id
-- and deck_cards.copy_id live in Postgres transactions. The application passes
-- the authenticated user explicitly because these routes use the service-role
-- client and therefore cannot rely on auth.uid() for ownership checks.
--
-- Option A semantics:
--   - storage copy: user_copies.location_id points to a storage location
--   - sleeved copy: deck_cards.copy_id points to the copy and location_id is NULL
--   - planned slot: deck_cards.copy_id and ownership_status are both NULL

-- The previous live functions were created against retired table/column names.
-- Remove those signatures before recreating current-schema contracts.
DROP FUNCTION IF EXISTS public.assign_physical_copy(integer, integer);
DROP FUNCTION IF EXISTS public.assign_physical_copy(integer, integer, uuid);
DROP FUNCTION IF EXISTS public.assign_free_copy(integer, integer, text, uuid);
DROP FUNCTION IF EXISTS public.reassign_to_deck(integer, integer, text, uuid);
DROP FUNCTION IF EXISTS public.batch_assign_deck(jsonb);
DROP FUNCTION IF EXISTS public.apply_deck_cards_diff(bigint, bigint[], jsonb);
DROP FUNCTION IF EXISTS public.apply_deck_cards_diff(integer, integer[], jsonb);
DROP FUNCTION IF EXISTS public.mark_copy_missing(integer, uuid);

-- Return the one storage location that receives a released copy.
CREATE OR REPLACE FUNCTION public._default_storage_location_id(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location_id integer;
BEGIN
  SELECT id
  INTO v_location_id
  FROM user_locations
  WHERE user_id = p_user_id
    AND type = 'storage'
    AND is_default = true
  ORDER BY id
  LIMIT 1;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_storage_location_not_found'
      USING ERRCODE = 'P0001',
            HINT = 'The user must have a default storage location before a copy can be released.';
  END IF;

  RETURN v_location_id;
END;
$function$;

-- Shared implementation for normal assignment and confirmed force-claim.
CREATE OR REPLACE FUNCTION public._move_copy_to_slot(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid,
  p_force_claim boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target_deck_id integer;
  v_target_copy_id integer;
  v_copy_user_id uuid;
  v_copy_is_proxy boolean;
  v_copy_missing boolean;
  v_source_deck_card_id integer;
  v_source_allocate boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT dc.deck_id, dc.copy_id
  INTO v_target_deck_id, v_target_copy_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.id = p_target_deck_card_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  FOR UPDATE OF dc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT uc.user_id, uc.is_proxy, uc.missing
  INTO v_copy_user_id, v_copy_is_proxy, v_copy_missing
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_copy_missing THEN
    RAISE EXCEPTION 'copy_missing'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_target_copy_id = p_copy_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_assigned', true,
      'cleared_from_deck_card_id', NULL,
      'target_deck_card_id', p_target_deck_card_id
    );
  END IF;

  IF v_target_copy_id IS NOT NULL THEN
    RAISE EXCEPTION 'target_filled'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.id, d.allocate
  INTO v_source_deck_card_id, v_source_allocate
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id
    AND dc.id <> p_target_deck_card_id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_source_deck_card_id IS NOT NULL
     AND v_source_allocate
     AND NOT p_force_claim THEN
    RAISE EXCEPTION 'copy_already_claimed'
      USING ERRCODE = 'P0001',
            HINT = 'The copy is held by another deck and requires an explicit force-claim.';
  END IF;

  IF v_source_deck_card_id IS NOT NULL THEN
    UPDATE deck_cards
    SET copy_id = NULL,
        ownership_status = NULL
    WHERE id = v_source_deck_card_id;
  END IF;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
  WHERE id = p_target_deck_card_id;

  -- A deck slot is the location of record for a sleeved copy.
  UPDATE user_copies
  SET location_id = NULL
  WHERE id = p_copy_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_assigned', false,
    'cleared_from_deck_card_id', v_source_deck_card_id,
    'target_deck_card_id', p_target_deck_card_id,
    'target_deck_id', v_target_deck_id
  );
END;
$function$;

-- Normal explicit assignment. A copy held by an allocating deck requires the
-- separate force-claim contract so the UI can distinguish the confirmation path.
CREATE OR REPLACE FUNCTION public.assign_physical_copy(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public._move_copy_to_slot(
    p_target_deck_card_id,
    p_copy_id,
    p_user_id,
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_claim_copy(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public._move_copy_to_slot(
    p_target_deck_card_id,
    p_copy_id,
    p_user_id,
    true
  );
END;
$function$;

-- Assign a copy that is currently free in storage to an open slot.
CREATE OR REPLACE FUNCTION public.assign_free_copy(
  p_copy_id integer,
  p_target_deck_id integer,
  p_card_name text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
  v_copy_is_proxy boolean;
  v_copy_missing boolean;
  v_existing_holder integer;
  v_target_deck_card_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT uc.user_id, uc.is_proxy, uc.missing
  INTO v_copy_user_id, v_copy_is_proxy, v_copy_missing
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_copy_missing THEN
    RAISE EXCEPTION 'copy_missing'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.id
  INTO v_existing_holder
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_existing_holder IS NOT NULL THEN
    RAISE EXCEPTION 'copy_already_assigned'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.id
  INTO v_target_deck_card_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.deck_id = p_target_deck_id
    AND dc.card_name = p_card_name
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
    AND dc.copy_id IS NULL
  ORDER BY dc.id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_target_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'no_open_slot'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
  WHERE id = v_target_deck_card_id;

  UPDATE user_copies
  SET location_id = NULL
  WHERE id = p_copy_id;

  RETURN jsonb_build_object(
    'success', true,
    'deck_card_id', v_target_deck_card_id
  );
END;
$function$;

-- Move a copy from one deck slot to an open slot in another deck.
CREATE OR REPLACE FUNCTION public.reassign_to_deck(
  p_copy_id integer,
  p_target_deck_id integer,
  p_card_name text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
  v_copy_is_proxy boolean;
  v_copy_missing boolean;
  v_source_deck_card_id integer;
  v_target_deck_card_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT uc.user_id, uc.is_proxy, uc.missing
  INTO v_copy_user_id, v_copy_is_proxy, v_copy_missing
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_copy_missing THEN
    RAISE EXCEPTION 'copy_missing'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.id
  INTO v_source_deck_card_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_source_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'copy_not_assigned'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.id
  INTO v_target_deck_card_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.deck_id = p_target_deck_id
    AND dc.card_name = p_card_name
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
    AND dc.copy_id IS NULL
  ORDER BY dc.id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_target_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'no_open_slot'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE id = v_source_deck_card_id;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
  WHERE id = v_target_deck_card_id;

  UPDATE user_copies
  SET location_id = NULL
  WHERE id = p_copy_id;

  RETURN jsonb_build_object(
    'success', true,
    'source_deck_card_id', v_source_deck_card_id,
    'target_deck_card_id', v_target_deck_card_id
  );
END;
$function$;

-- Undo either to storage (NULL restore target) or to the original deck slot.
CREATE OR REPLACE FUNCTION public.undo_copy_move(
  p_current_deck_card_id integer,
  p_copy_id integer,
  p_restore_deck_card_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
  v_copy_missing boolean;
  v_current_copy_id integer;
  v_restore_copy_id integer;
  v_default_location_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT uc.user_id, uc.missing
  INTO v_copy_user_id, v_copy_missing
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_copy_missing THEN
    RAISE EXCEPTION 'copy_missing'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.copy_id
  INTO v_current_copy_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.id = p_current_deck_card_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  FOR UPDATE OF dc;

  IF NOT FOUND OR v_current_copy_id <> p_copy_id THEN
    RAISE EXCEPTION 'current_assignment_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_restore_deck_card_id IS NULL THEN
    v_default_location_id := public._default_storage_location_id(p_user_id);

    UPDATE deck_cards
    SET copy_id = NULL,
        ownership_status = NULL
    WHERE id = p_current_deck_card_id;

    UPDATE user_copies
    SET location_id = v_default_location_id
    WHERE id = p_copy_id;

    RETURN jsonb_build_object(
      'success', true,
      'restored_to_storage_location_id', v_default_location_id
    );
  END IF;

  SELECT dc.copy_id
  INTO v_restore_copy_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.id = p_restore_deck_card_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  FOR UPDATE OF dc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'restore_target_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_restore_deck_card_id = p_current_deck_card_id THEN
    RETURN jsonb_build_object('success', true, 'already_restored', true);
  END IF;

  IF v_restore_copy_id IS NOT NULL THEN
    RAISE EXCEPTION 'slot_claimed_elsewhere'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE id = p_current_deck_card_id;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE
        WHEN (SELECT is_proxy FROM user_copies WHERE id = p_copy_id)
          THEN 'proxy'
        ELSE 'original'
      END
  WHERE id = p_restore_deck_card_id;

  UPDATE user_copies
  SET location_id = NULL
  WHERE id = p_copy_id;

  RETURN jsonb_build_object(
    'success', true,
    'restored_to_deck_card_id', p_restore_deck_card_id
  );
END;
$function$;

-- Create a proxy and sleeve it into a slot in the same transaction.
CREATE OR REPLACE FUNCTION public.add_proxy_to_slot(
  p_target_deck_card_id integer,
  p_card_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target_copy_id integer;
  v_card_user_id uuid;
  v_oracle_id text;
  v_printing_id text;
  v_new_copy_id integer;
BEGIN
  SELECT dc.copy_id
  INTO v_target_copy_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.id = p_target_deck_card_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  FOR UPDATE OF dc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_target_copy_id IS NOT NULL THEN
    RAISE EXCEPTION 'target_filled'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT uc.user_id, uc.oracle_id
  INTO v_card_user_id, v_oracle_id
  FROM user_cards uc
  WHERE uc.id = p_card_id
  FOR UPDATE;

  IF NOT FOUND OR v_card_user_id <> p_user_id THEN
    RAISE EXCEPTION 'card_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT rp.scryfall_id::text
  INTO v_printing_id
  FROM ref_printings rp
  WHERE rp.oracle_id::text = v_oracle_id
  ORDER BY rp.released_at DESC NULLS LAST, rp.scryfall_id
  LIMIT 1;

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
    p_card_id,
    v_printing_id,
    true,
    'manual',
    'nonfoil',
    NULL,
    p_user_id
  )
  RETURNING id INTO v_new_copy_id;

  UPDATE deck_cards
  SET copy_id = v_new_copy_id,
      ownership_status = 'proxy'
  WHERE id = p_target_deck_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'copy_id', v_new_copy_id,
    'deck_card_id', p_target_deck_card_id
  );
END;
$function$;

-- Mark missing and unlink in one transaction. Missing copies stay locationless.
CREATE OR REPLACE FUNCTION public.mark_copy_missing(
  p_copy_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
  v_already_missing boolean;
  v_affected_deck_ids integer[];
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT uc.user_id, uc.missing
  INTO v_copy_user_id, v_already_missing
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_already_missing THEN
    RETURN jsonb_build_object(
      'success', true,
      'affected_deck_ids', '[]'::jsonb
    );
  END IF;

  SELECT array_agg(DISTINCT dc.deck_id ORDER BY dc.deck_id)
  INTO v_affected_deck_ids
  FROM deck_cards dc
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id;

  UPDATE user_copies
  SET missing = true,
      location_id = NULL
  WHERE id = p_copy_id;

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE copy_id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'affected_deck_ids', to_jsonb(COALESCE(v_affected_deck_ids, ARRAY[]::integer[]))
  );
END;
$function$;

-- Apply a composition diff atomically. A diff may not silently delete a
-- sleeved slot; the caller must resolve that physical movement explicitly.
CREATE OR REPLACE FUNCTION public.apply_deck_cards_diff(
  p_deck_id integer,
  p_user_id uuid,
  p_delete_ids integer[],
  p_insert_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
  v_row record;
  v_delete_ids integer[] := COALESCE(p_delete_ids, ARRAY[]::integer[]);
  v_insert_rows jsonb := COALESCE(p_insert_rows, '[]'::jsonb);
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

  IF COALESCE(array_length(v_delete_ids, 1), 0) > 0 THEN
    IF (
      SELECT count(*)
      FROM unnest(v_delete_ids) AS ids(id)
    ) <> (
      SELECT count(DISTINCT id)
      FROM unnest(v_delete_ids) AS ids(id)
    ) THEN
      RAISE EXCEPTION 'duplicate_delete_id'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1
    FROM deck_cards dc
    WHERE dc.id = ANY(v_delete_ids)
      AND dc.deck_id = p_deck_id
      AND dc.user_id = p_user_id
    FOR UPDATE;

    IF (
      SELECT count(*)
      FROM deck_cards dc
      WHERE dc.id = ANY(v_delete_ids)
        AND dc.deck_id = p_deck_id
        AND dc.user_id = p_user_id
    ) <> COALESCE(array_length(v_delete_ids, 1), 0) THEN
      RAISE EXCEPTION 'deck_card_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM deck_cards dc
      WHERE dc.id = ANY(v_delete_ids)
        AND dc.copy_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'assigned_row_in_diff'
        USING ERRCODE = 'P0001',
              HINT = 'A sleeved card must be explicitly released before its slot is removed.';
    END IF;

    DELETE FROM deck_cards
    WHERE id = ANY(v_delete_ids)
      AND deck_id = p_deck_id
      AND user_id = p_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  END IF;

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(v_insert_rows) AS rows(
      card_name text,
      scryfall_id text,
      set_code text,
      categories text,
      is_commander boolean
    )
  LOOP
    IF v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
      RAISE EXCEPTION 'invalid_insert_row'
        USING ERRCODE = 'P0001';
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
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count,
    'inserted_count', v_inserted_count
  );
END;
$function$;

-- Apply a whole deck's physical assignments atomically. Each JSON object uses
-- deckCardsId, copyId, and optionally clearDeckCardsId for a Tier 3 move.
CREATE OR REPLACE FUNCTION public.batch_assign_deck(
  p_deck_id integer,
  p_user_id uuid,
  p_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_assignment jsonb;
  v_copy_id integer;
  v_target_deck_card_id integer;
  v_source_deck_card_id integer;
  v_target_existing_copy_id integer;
  v_holder_deck_card_id integer;
  v_copy_user_id uuid;
  v_copy_is_proxy boolean;
  v_copy_missing boolean;
  v_assigned_count integer := 0;
  v_seen_copy_ids integer[] := ARRAY[]::integer[];
  v_seen_target_ids integer[] := ARRAY[]::integer[];
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

  -- Lock every contested copy in deterministic order before touching slots.
  FOR v_copy_id IN
    SELECT DISTINCT COALESCE(
      NULLIF(value->>'copyId', ''),
      NULLIF(value->>'physicalCopyId', '')
    )::integer AS copy_id
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS entries(value)
    WHERE COALESCE(
      NULLIF(value->>'copyId', ''),
      NULLIF(value->>'physicalCopyId', '')
    ) IS NOT NULL
    ORDER BY copy_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );
  END LOOP;

  FOR v_assignment IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS entries(value)
  LOOP
    v_copy_id := COALESCE(
      NULLIF(v_assignment->>'copyId', ''),
      NULLIF(v_assignment->>'physicalCopyId', '')
    )::integer;
    v_target_deck_card_id := COALESCE(
      NULLIF(v_assignment->>'deckCardsId', ''),
      NULLIF(v_assignment->>'deck_card_id', '')
    )::integer;
    v_source_deck_card_id := NULLIF(
      COALESCE(
        NULLIF(v_assignment->>'clearDeckCardsId', ''),
        NULLIF(v_assignment->>'clear_deck_cards_id', '')
      ),
      ''
    )::integer;

    IF v_copy_id IS NULL OR v_target_deck_card_id IS NULL THEN
      RAISE EXCEPTION 'invalid_assignment'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_copy_id = ANY(v_seen_copy_ids) THEN
      RAISE EXCEPTION 'duplicate_copy_in_batch'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_target_deck_card_id = ANY(v_seen_target_ids) THEN
      RAISE EXCEPTION 'duplicate_target_in_batch'
        USING ERRCODE = 'P0001';
    END IF;
    v_seen_copy_ids := array_append(v_seen_copy_ids, v_copy_id);
    v_seen_target_ids := array_append(v_seen_target_ids, v_target_deck_card_id);

    SELECT dc.copy_id
    INTO v_target_existing_copy_id
    FROM deck_cards dc
    WHERE dc.id = v_target_deck_card_id
      AND dc.deck_id = p_deck_id
      AND dc.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'target_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_target_existing_copy_id IS NOT NULL THEN
      RAISE EXCEPTION 'target_filled'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT uc.user_id, uc.is_proxy, uc.missing
    INTO v_copy_user_id, v_copy_is_proxy, v_copy_missing
    FROM user_copies uc
    WHERE uc.id = v_copy_id
    FOR UPDATE;

    IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
      RAISE EXCEPTION 'copy_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_copy_missing THEN
      RAISE EXCEPTION 'copy_missing'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT dc.id
    INTO v_holder_deck_card_id
    FROM deck_cards dc
    WHERE dc.copy_id = v_copy_id
      AND dc.user_id = p_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_holder_deck_card_id IS NOT NULL THEN
      IF v_source_deck_card_id IS NULL
         OR v_source_deck_card_id <> v_holder_deck_card_id THEN
        RAISE EXCEPTION 'copy_already_assigned'
          USING ERRCODE = 'P0001';
      END IF;

      UPDATE deck_cards
      SET copy_id = NULL,
          ownership_status = NULL
      WHERE id = v_holder_deck_card_id;
    ELSIF v_source_deck_card_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_assignment_mismatch'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE deck_cards
    SET copy_id = v_copy_id,
        ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
    WHERE id = v_target_deck_card_id;

    UPDATE user_copies
    SET location_id = NULL
    WHERE id = v_copy_id;

    v_assigned_count := v_assigned_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'assigned_count', v_assigned_count
  );
END;
$function$;

-- Release all sleeved copies in one deck back to the user's default storage.
CREATE OR REPLACE FUNCTION public.release_deck_copies(
  p_deck_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_default_location_id integer;
  v_copy_id integer;
  v_released_count integer := 0;
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

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE deck_id = p_deck_id
    AND user_id = p_user_id
    AND copy_id IS NOT NULL;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'released_count', v_released_count,
    'target_location_id', v_default_location_id
  );
END;
$function$;

-- Release copies and delete a deck in one transaction.
CREATE OR REPLACE FUNCTION public.delete_deck_with_release(
  p_deck_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_default_location_id integer;
  v_copy_id integer;
  v_released_count integer := 0;
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

  SELECT count(*)
  INTO v_released_count
  FROM deck_cards
  WHERE deck_id = p_deck_id
    AND user_id = p_user_id
    AND copy_id IS NOT NULL;

  DELETE FROM deck_cards
  WHERE deck_id = p_deck_id
    AND user_id = p_user_id;

  DELETE FROM decks
  WHERE id = p_deck_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'released_count', v_released_count
  );
END;
$function$;

-- Release one copy from every slot that references it.
CREATE OR REPLACE FUNCTION public.unassign_copy_to_storage(
  p_copy_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
  v_copy_missing boolean;
  v_default_location_id integer;
  v_unassigned_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT uc.user_id, uc.missing
  INTO v_copy_user_id, v_copy_missing
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_copy_missing THEN
    v_default_location_id := public._default_storage_location_id(p_user_id);
  END IF;

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE copy_id = p_copy_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_unassigned_count = ROW_COUNT;

  UPDATE user_copies
  SET location_id = CASE WHEN v_copy_missing THEN NULL ELSE v_default_location_id END
  WHERE id = p_copy_id;

  RETURN jsonb_build_object(
    'success', true,
    'copy_id', p_copy_id,
    'unassigned_count', v_unassigned_count,
    'location_id', CASE WHEN v_copy_missing THEN NULL ELSE v_default_location_id END
  );
END;
$function$;

-- Delete a copy and let its FK references become planned slots atomically.
CREATE OR REPLACE FUNCTION public.delete_user_copy(
  p_copy_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT uc.user_id
  INTO v_copy_user_id
  FROM user_copies uc
  WHERE uc.id = p_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM user_copies
  WHERE id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'copy_id', p_copy_id);
END;
$function$;

-- AI batch delta. Added slots are planned; removed sleeved copies are returned
-- to storage in the same transaction as the slot deletion.
CREATE OR REPLACE FUNCTION public.apply_ai_deck_delta(
  p_deck_id integer,
  p_user_id uuid,
  p_additions jsonb,
  p_remove_deck_card_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_default_location_id integer;
  v_copy_id integer;
  v_row record;
  v_added_count integer := 0;
  v_removed_count integer := 0;
  v_remove_ids integer[] := COALESCE(p_remove_deck_card_ids, ARRAY[]::integer[]);
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

  IF COALESCE(array_length(v_remove_ids, 1), 0) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM deck_cards dc
      WHERE dc.id = ANY(v_remove_ids)
        AND (dc.deck_id <> p_deck_id OR dc.user_id <> p_user_id)
    ) THEN
      RAISE EXCEPTION 'deck_card_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    FOR v_copy_id IN
      SELECT DISTINCT dc.copy_id
      FROM deck_cards dc
      WHERE dc.id = ANY(v_remove_ids)
        AND dc.copy_id IS NOT NULL
      ORDER BY dc.copy_id
    LOOP
      PERFORM pg_advisory_xact_lock(
        hashtextextended('collection-copy:' || v_copy_id::text, 0)
      );
    END LOOP;

    v_default_location_id := public._default_storage_location_id(p_user_id);

    UPDATE user_copies uc
    SET location_id = CASE WHEN uc.missing THEN NULL ELSE v_default_location_id END
    WHERE uc.user_id = p_user_id
      AND uc.id IN (
        SELECT dc.copy_id
        FROM deck_cards dc
        WHERE dc.id = ANY(v_remove_ids)
          AND dc.copy_id IS NOT NULL
      );

    DELETE FROM deck_cards
    WHERE id = ANY(v_remove_ids)
      AND deck_id = p_deck_id
      AND user_id = p_user_id;

    GET DIAGNOSTICS v_removed_count = ROW_COUNT;
  END IF;

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_additions, '[]'::jsonb)) AS rows(
      card_name text,
      scryfall_id text,
      set_code text,
      categories text,
      quantity integer,
      is_commander boolean
    )
  LOOP
    IF v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
      RAISE EXCEPTION 'invalid_addition'
        USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_row.quantity, 1) < 1 OR COALESCE(v_row.quantity, 1) > 100 THEN
      RAISE EXCEPTION 'invalid_quantity'
        USING ERRCODE = 'P0001';
    END IF;

    FOR v_copy_id IN 1..COALESCE(v_row.quantity, 1)
    LOOP
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
      );

      v_added_count := v_added_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'added_count', v_added_count,
    'removed_count', v_removed_count
  );
END;
$function$;

-- Replace a deck's new_cards contents atomically after card identities have
-- been resolved by the application. Newly-created copies are immediately
-- sleeved, so they intentionally have location_id = NULL.
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
      is_proxy boolean
    )
  LOOP
    IF v_row.card_id IS NULL OR v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
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
      v_card_copy_id,
      CASE WHEN COALESCE(v_row.is_proxy, false) THEN 'proxy' ELSE 'original' END
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

-- The helper is only callable through the public contracts above.
REVOKE ALL ON FUNCTION public._default_storage_location_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._move_copy_to_slot(integer, integer, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assign_physical_copy(integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_claim_copy(integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_free_copy(integer, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reassign_to_deck(integer, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_copy_move(integer, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_proxy_to_slot(integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_copy_missing(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_deck_cards_diff(integer, uuid, integer[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.batch_assign_deck(integer, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_deck_copies(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_deck_with_release(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unassign_copy_to_storage(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_copy(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_ai_deck_delta(integer, uuid, jsonb, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_deck_with_new_cards(integer, uuid, jsonb) TO service_role;
