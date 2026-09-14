-- Collection Foundation Phase 2/3: close the atomic movement boundary
--
-- The application uses createAdminClient() after requireAuth(), so movement RPCs
-- are intentionally callable only by service_role. The user_id argument remains
-- an explicit ownership guard inside every function; browser clients cannot call
-- these SECURITY DEFINER functions directly.

-- ---------------------------------------------------------------------------
-- Default storage helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._ensure_default_storage_location_id(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_location_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('default-storage:' || p_user_id::text, 0)
  );

  SELECT id
  INTO v_location_id
  FROM user_locations
  WHERE user_id = p_user_id
    AND type = 'storage'
    AND is_default = true
  ORDER BY id
  LIMIT 1
  FOR UPDATE;

  IF v_location_id IS NOT NULL THEN
    RETURN v_location_id;
  END IF;

  BEGIN
    INSERT INTO user_locations (
      name,
      type,
      deck_id,
      color,
      sort_order,
      user_id,
      is_default
    )
    VALUES (
      'Unsorted',
      'storage',
      NULL,
      '#6B7280',
      0,
      p_user_id,
      true
    )
    RETURNING id INTO v_location_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id
    INTO v_location_id
    FROM user_locations
    WHERE user_id = p_user_id
      AND type = 'storage'
      AND is_default = true
    ORDER BY id
    LIMIT 1;
  END;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'default_storage_location_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_location_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Atomic storage placement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_copy_to_storage(
  p_copy_id integer,
  p_location_id integer,
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
  v_target_location_id integer;
  v_holder_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  IF p_location_id IS NULL THEN
    v_target_location_id := public._ensure_default_storage_location_id(p_user_id);
  ELSE
    SELECT id
    INTO v_target_location_id
    FROM user_locations
    WHERE id = p_location_id
      AND user_id = p_user_id
      AND type = 'storage'
    FOR UPDATE;

    IF v_target_location_id IS NULL THEN
      RAISE EXCEPTION 'storage_location_not_found'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

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

  SELECT dc.id
  INTO v_holder_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  ORDER BY dc.id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_holder_id IS NOT NULL THEN
    RAISE EXCEPTION 'copy_already_assigned'
      USING ERRCODE = 'P0001',
            HINT = 'Release the copy from its deck slot before moving it to storage.';
  END IF;

  UPDATE user_copies
  SET location_id = v_target_location_id
  WHERE id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'copy_id', p_copy_id,
    'location_id', v_target_location_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_copies_to_storage(
  p_copy_ids integer[],
  p_location_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_requested_count integer := COALESCE(cardinality(p_copy_ids), 0);
  v_owned_count integer;
  v_target_location_id integer;
  v_copy_id integer;
BEGIN
  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'updated_count', 0);
  END IF;

  IF (
    SELECT count(*) FROM unnest(p_copy_ids) AS ids(id)
  ) <> (
    SELECT count(DISTINCT id) FROM unnest(p_copy_ids) AS ids(id)
  ) THEN
    RAISE EXCEPTION 'duplicate_copy_id'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_location_id IS NULL THEN
    v_target_location_id := public._ensure_default_storage_location_id(p_user_id);
  ELSE
    SELECT id
    INTO v_target_location_id
    FROM user_locations
    WHERE id = p_location_id
      AND user_id = p_user_id
      AND type = 'storage'
    FOR UPDATE;

    IF v_target_location_id IS NULL THEN
      RAISE EXCEPTION 'storage_location_not_found'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  FOR v_copy_id IN
    SELECT id
    FROM unnest(p_copy_ids) AS ids(id)
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );
  END LOOP;

  SELECT count(*)
  INTO v_owned_count
  FROM user_copies
  WHERE id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  IF v_owned_count <> v_requested_count THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_copies uc
    JOIN deck_cards dc ON dc.copy_id = uc.id
    JOIN decks d ON d.id = dc.deck_id
    WHERE uc.id = ANY(p_copy_ids)
      AND uc.user_id = p_user_id
      AND dc.user_id = p_user_id
      AND d.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'copy_already_assigned'
      USING ERRCODE = 'P0001',
            HINT = 'Release all selected copies from their deck slots before moving them to storage.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM user_copies
    WHERE id = ANY(p_copy_ids)
      AND user_id = p_user_id
      AND missing = true
  ) THEN
    RAISE EXCEPTION 'copy_missing'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE user_copies
  SET location_id = v_target_location_id
  WHERE id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_requested_count,
    'location_id', v_target_location_id
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Atomic proxy-to-original replacement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.replace_proxy_with_original(
  p_deck_card_id integer,
  p_original_copy_id integer,
  p_proxy_storage_location_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_proxy_copy_id integer;
  v_proxy_user_id uuid;
  v_original_user_id uuid;
  v_original_is_proxy boolean;
  v_original_missing boolean;
  v_holder_id integer;
  v_target_location_id integer;
  v_low_copy_id integer;
  v_high_copy_id integer;
BEGIN
  SELECT dc.copy_id
  INTO v_proxy_copy_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.id = p_deck_card_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
    AND dc.ownership_status = 'proxy'
  FOR UPDATE OF dc;

  IF NOT FOUND OR v_proxy_copy_id IS NULL THEN
    RAISE EXCEPTION 'proxy_slot_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_proxy_copy_id = p_original_copy_id THEN
    RAISE EXCEPTION 'replacement_copy_matches_proxy'
      USING ERRCODE = 'P0001';
  END IF;

  v_low_copy_id := LEAST(v_proxy_copy_id, p_original_copy_id);
  v_high_copy_id := GREATEST(v_proxy_copy_id, p_original_copy_id);
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || v_low_copy_id::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || v_high_copy_id::text, 0)
  );

  IF p_proxy_storage_location_id IS NULL THEN
    v_target_location_id := public._ensure_default_storage_location_id(p_user_id);
  ELSE
    SELECT id
    INTO v_target_location_id
    FROM user_locations
    WHERE id = p_proxy_storage_location_id
      AND user_id = p_user_id
      AND type = 'storage'
    FOR UPDATE;

    IF v_target_location_id IS NULL THEN
      RAISE EXCEPTION 'storage_location_not_found'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT uc.user_id
  INTO v_proxy_user_id
  FROM user_copies uc
  WHERE uc.id = v_proxy_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_proxy_user_id <> p_user_id THEN
    RAISE EXCEPTION 'proxy_copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT uc.user_id, uc.is_proxy, uc.missing
  INTO v_original_user_id, v_original_is_proxy, v_original_missing
  FROM user_copies uc
  WHERE uc.id = p_original_copy_id
  FOR UPDATE;

  IF NOT FOUND OR v_original_user_id <> p_user_id THEN
    RAISE EXCEPTION 'original_copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_original_is_proxy THEN
    RAISE EXCEPTION 'replacement_copy_is_proxy'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_original_missing THEN
    RAISE EXCEPTION 'replacement_copy_missing'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.id
  INTO v_holder_id
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_original_copy_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  ORDER BY dc.id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_holder_id IS NOT NULL THEN
    RAISE EXCEPTION 'replacement_copy_already_assigned'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE deck_cards
  SET copy_id = p_original_copy_id,
      ownership_status = 'original'
  WHERE id = p_deck_card_id
    AND user_id = p_user_id;

  UPDATE user_copies
  SET location_id = NULL
  WHERE id = p_original_copy_id
    AND user_id = p_user_id;

  UPDATE user_copies
  SET location_id = v_target_location_id
  WHERE id = v_proxy_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'deck_card_id', p_deck_card_id,
    'original_copy_id', p_original_copy_id,
    'released_proxy_copy_id', v_proxy_copy_id,
    'proxy_location_id', v_target_location_id
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Atomic bulk proxy creation and sleeving
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_proxies_to_slots(
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
  v_target_deck_card_id integer;
  v_target_copy_id integer;
  v_target_card_name text;
  v_oracle_id text;
  v_printing_id text;
  v_card_id integer;
  v_created_count integer := 0;
  v_seen_target_ids integer[] := ARRAY[]::integer[];
BEGIN
  FOR v_assignment IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_assignments, '[]'::jsonb)) AS entries(value)
  LOOP
    v_target_deck_card_id := NULLIF(v_assignment->>'deck_card_id', '')::integer;
    v_target_card_name := btrim(COALESCE(v_assignment->>'card_name', ''));

    IF v_target_deck_card_id IS NULL OR v_target_card_name = '' THEN
      RAISE EXCEPTION 'invalid_proxy_assignment'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_target_deck_card_id = ANY(v_seen_target_ids) THEN
      RAISE EXCEPTION 'duplicate_target_in_batch'
        USING ERRCODE = 'P0001';
    END IF;
    v_seen_target_ids := array_append(v_seen_target_ids, v_target_deck_card_id);

    SELECT dc.copy_id, dc.card_name
    INTO v_target_copy_id, v_target_card_name
    FROM deck_cards dc
    JOIN decks d ON d.id = dc.deck_id
    WHERE dc.id = v_target_deck_card_id
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

    IF v_target_card_name <> btrim(COALESCE(v_assignment->>'card_name', '')) THEN
      RAISE EXCEPTION 'card_mismatch'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT rp.oracle_id::text, rp.scryfall_id::text
    INTO v_oracle_id, v_printing_id
    FROM ref_printings rp
    WHERE rp.name = v_target_card_name
    ORDER BY rp.released_at DESC NULLS LAST, rp.scryfall_id
    LIMIT 1;

    IF v_oracle_id IS NULL THEN
      RAISE EXCEPTION 'card_printing_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-card:' || p_user_id::text || ':' || v_oracle_id, 0)
    );

    SELECT uc.id
    INTO v_card_id
    FROM user_cards uc
    WHERE uc.user_id = p_user_id
      AND uc.oracle_id = v_oracle_id
    ORDER BY uc.id
    LIMIT 1
    FOR UPDATE;

    IF v_card_id IS NULL THEN
      INSERT INTO user_cards (oracle_id, card_name, user_id)
      VALUES (v_oracle_id, v_target_card_name, p_user_id)
      RETURNING id INTO v_card_id;
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
      v_card_id,
      v_printing_id,
      true,
      'manual',
      'nonfoil',
      NULL,
      p_user_id
    )
    RETURNING id INTO v_target_copy_id;

    UPDATE deck_cards
    SET copy_id = v_target_copy_id,
        ownership_status = 'proxy'
    WHERE id = v_target_deck_card_id
      AND user_id = p_user_id;

    v_created_count := v_created_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Atomic collection copy insertion/synchronisation helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._insert_user_copy_rows(
  p_user_id uuid,
  p_rows jsonb,
  p_default_location_id integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_location_id integer;
  v_inserted_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS rows(
      card_id integer,
      printing_id text,
      finish text,
      language text,
      is_proxy boolean,
      proxy_for_card_id integer,
      card_condition text,
      purchase_price numeric,
      acquired_at text,
      source_tag text,
      location_id integer
    )
  LOOP
    IF v_row.card_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM user_cards uc
      WHERE uc.id = v_row.card_id
        AND uc.user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'card_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    v_location_id := COALESCE(v_row.location_id, p_default_location_id);

    IF v_location_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM user_locations ul
      WHERE ul.id = v_location_id
        AND ul.user_id = p_user_id
        AND ul.type = 'storage'
    ) THEN
      RAISE EXCEPTION 'storage_location_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO user_copies (
      card_id,
      printing_id,
      finish,
      language,
      is_proxy,
      proxy_for_card_id,
      condition,
      purchase_price,
      acquired_at,
      source_tag,
      location_id,
      user_id
    )
    VALUES (
      v_row.card_id,
      v_row.printing_id,
      COALESCE(v_row.finish, 'nonfoil'),
      COALESCE(v_row.language, 'en'),
      COALESCE(v_row.is_proxy, false),
      v_row.proxy_for_card_id,
      v_row.card_condition,
      v_row.purchase_price,
      v_row.acquired_at,
      v_row.source_tag,
      v_location_id,
      p_user_id
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_user_copies(
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
  v_inserted_count integer;
BEGIN
  IF COALESCE(jsonb_array_length(p_rows), 0) = 0 THEN
    RETURN jsonb_build_object('success', true, 'inserted_count', 0);
  END IF;

  v_default_location_id := public._ensure_default_storage_location_id(p_user_id);
  v_inserted_count := public._insert_user_copy_rows(
    p_user_id,
    p_rows,
    v_default_location_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'inserted_count', v_inserted_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_collection_sync(
  p_user_id uuid,
  p_remove_copy_ids integer[],
  p_insert_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_remove_ids integer[] := COALESCE(p_remove_copy_ids, ARRAY[]::integer[]);
  v_requested_count integer := COALESCE(cardinality(v_remove_ids), 0);
  v_owned_count integer;
  v_copy_id integer;
  v_default_location_id integer;
  v_inserted_count integer := 0;
  v_removed_count integer := 0;
BEGIN
  IF (
    SELECT count(*) FROM unnest(v_remove_ids) AS ids(id)
  ) <> (
    SELECT count(DISTINCT id) FROM unnest(v_remove_ids) AS ids(id)
  ) THEN
    RAISE EXCEPTION 'duplicate_copy_id'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_copy_id IN
    SELECT id
    FROM unnest(v_remove_ids) AS ids(id)
    ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );
  END LOOP;

  IF v_requested_count > 0 THEN
    SELECT count(*)
    INTO v_owned_count
    FROM user_copies
    WHERE id = ANY(v_remove_ids)
      AND user_id = p_user_id;

    IF v_owned_count <> v_requested_count THEN
      RAISE EXCEPTION 'copy_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE deck_cards
    SET copy_id = NULL,
        ownership_status = NULL
    WHERE copy_id = ANY(v_remove_ids)
      AND user_id = p_user_id;

    DELETE FROM user_copies
    WHERE id = ANY(v_remove_ids)
      AND user_id = p_user_id;

    GET DIAGNOSTICS v_removed_count = ROW_COUNT;
  END IF;

  IF COALESCE(jsonb_array_length(p_insert_rows), 0) > 0 THEN
    v_default_location_id := public._ensure_default_storage_location_id(p_user_id);
    v_inserted_count := public._insert_user_copy_rows(
      p_user_id,
      p_insert_rows,
      v_default_location_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'removed_count', v_removed_count,
    'inserted_count', v_inserted_count
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Storage-location deletion: never let FK ON DELETE SET NULL orphan copies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_storage_location(
  p_location_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_is_default boolean;
  v_default_location_id integer;
  v_moved_count integer := 0;
BEGIN
  SELECT is_default
  INTO v_is_default
  FROM user_locations
  WHERE id = p_location_id
    AND user_id = p_user_id
    AND type = 'storage'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_location_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_is_default THEN
    RAISE EXCEPTION 'default_storage_location_cannot_be_deleted'
      USING ERRCODE = 'P0001';
  END IF;

  v_default_location_id := public._ensure_default_storage_location_id(p_user_id);

  UPDATE user_copies
  SET location_id = v_default_location_id
  WHERE location_id = p_location_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;

  DELETE FROM user_locations
  WHERE id = p_location_id
    AND user_id = p_user_id
    AND type = 'storage';

  RETURN jsonb_build_object(
    'success', true,
    'moved_count', v_moved_count,
    'target_location_id', v_default_location_id
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Strengthen existing deletion and AI contracts
-- ---------------------------------------------------------------------------

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

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE copy_id = p_copy_id
    AND user_id = p_user_id;

  DELETE FROM user_copies
  WHERE id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'copy_id', p_copy_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_copies(
  p_copy_ids integer[],
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_id integer;
  v_requested_count integer := COALESCE(cardinality(p_copy_ids), 0);
  v_owned_count integer;
  v_deleted_count integer := 0;
BEGIN
  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'deleted_count', 0);
  END IF;

  IF (
    SELECT count(*) FROM unnest(p_copy_ids) AS ids(id)
  ) <> (
    SELECT count(DISTINCT id) FROM unnest(p_copy_ids) AS ids(id)
  ) THEN
    RAISE EXCEPTION 'duplicate_copy_id'
      USING ERRCODE = 'P0001';
  END IF;

  FOR v_copy_id IN
    SELECT id FROM unnest(p_copy_ids) AS ids(id) ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );
  END LOOP;

  SELECT count(*)
  INTO v_owned_count
  FROM user_copies
  WHERE id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  IF v_owned_count <> v_requested_count THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL
  WHERE copy_id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  DELETE FROM user_copies
  WHERE id = ANY(p_copy_ids)
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_deleted_count
  );
END;
$function$;

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
  v_requested_count integer := COALESCE(cardinality(v_remove_ids), 0);
  v_found_count integer;
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

  IF v_requested_count > 0 THEN
    IF (
      SELECT count(*) FROM unnest(v_remove_ids) AS ids(id)
    ) <> (
      SELECT count(DISTINCT id) FROM unnest(v_remove_ids) AS ids(id)
    ) THEN
      RAISE EXCEPTION 'duplicate_deck_card_id'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*)
    INTO v_found_count
    FROM deck_cards dc
    WHERE dc.id = ANY(v_remove_ids)
      AND dc.deck_id = p_deck_id
      AND dc.user_id = p_user_id;

    IF v_found_count <> v_requested_count THEN
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

    v_default_location_id := public._ensure_default_storage_location_id(p_user_id);

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

-- The service role is the only caller. Routes authenticate the user first and
-- every function still checks the supplied user_id against owned rows.
REVOKE ALL ON FUNCTION public._ensure_default_storage_location_id(uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.move_copy_to_storage(integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.move_copies_to_storage(integer[], integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.replace_proxy_with_original(integer, integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.add_proxies_to_slots(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public._insert_user_copy_rows(uuid, jsonb, integer) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.insert_user_copies(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.apply_collection_sync(uuid, integer[], jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.delete_storage_location(integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.assign_physical_copy(integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.force_claim_copy(integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.assign_free_copy(integer, integer, text, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.reassign_to_deck(integer, integer, text, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.undo_copy_move(integer, integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.add_proxy_to_slot(integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.mark_copy_missing(integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.apply_deck_cards_diff(integer, uuid, integer[], jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.batch_assign_deck(integer, uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.release_deck_copies(integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.delete_deck_with_release(integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.unassign_copy_to_storage(integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.delete_user_copy(integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.delete_user_copies(integer[], uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.apply_ai_deck_delta(integer, uuid, jsonb, integer[]) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.replace_deck_with_new_cards(integer, uuid, jsonb) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.move_copy_to_storage(integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_copies_to_storage(integer[], integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_proxy_with_original(integer, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_proxies_to_slots(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_user_copies(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_collection_sync(uuid, integer[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_storage_location(integer, uuid) TO service_role;
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
GRANT EXECUTE ON FUNCTION public.delete_user_copies(integer[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_ai_deck_delta(integer, uuid, jsonb, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_deck_with_new_cards(integer, uuid, jsonb) TO service_role;
