-- APPLIED 2026-10-21 after owner approval.
-- Contract: docs/oracle/contracts/generic-basic-lands.md (§3A, §6, §8, §9).
--
-- 1. replace_deck_with_new_cards: rows may carry is_generic, generic_sleeved (and language for a
--    generic). A generic row writes a planned slot with the explicit flags and no copy.
--    Everything else is unchanged (CREATE OR REPLACE of 20261020120000, same signature and grants).
--    Apply BEFORE deploying the code that sends the new keys: the old function would silently
--    ignore them and store generics as ordinary planned slots.
-- 2. set_generic_basic_count: atomic add / lower / remove of the generic line of one basic type.
--
-- No existing row is updated. Lowering a count deletes only generic rows (no copies involved).
-- Undo: restore the 20261020120000 body; DROP FUNCTION public.set_generic_basic_count(integer, uuid, text, integer, text, text, text, text);

-- Notes carried over from 20261020120000: CREATE OR REPLACE FUNCTION only. No DROP, TRUNCATE, or DELETE of data.
--     (The function itself deletes the deck_cards of the deck it is called for,
--     exactly as before; a ManaBox import always calls it on a brand-new deck.)
--   - Signature (integer, uuid, jsonb) unchanged, so existing grants to
--     service_role still apply. Safe to re-run.
--   - Rows that pass none of the new keys behave exactly as before.
--   - Unknown values are rejected, never silently coerced (invalid_row_finish,
--     invalid_row_condition, invalid_row_language).
--   - jsonb_to_recordset ignores keys it does not know. So if app code that sends
--     language/condition is deployed BEFORE this migration, the old function
--     would silently drop them. Apply this migration first, then deploy code.
--
-- Atomicity: one function call = one transaction. If any row is invalid, the
-- whole call rolls back, including the deck_cards delete and every copy insert.
--
-- Multi-user: card ownership is checked against p_user_id for every row; the
-- deck is locked and checked against p_user_id; every inserted row carries
-- p_user_id. The function is SECURITY DEFINER and granted to service_role only.
--
-- Undo: restore the body from 20260926120000_import_maybeboard_relation.sql.

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
  v_row_finish text;
  v_row_requested_finish text;
  v_row_source_tag text;
  v_row_language text;
  v_row_condition text;
  v_generic_names text[] := ARRAY['Plains','Island','Swamp','Mountain','Forest','Wastes','Snow-Covered Plains','Snow-Covered Island','Snow-Covered Swamp','Snow-Covered Mountain','Snow-Covered Forest'];
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
      is_maybeboard boolean,
      finish text,
      source_tag text,
      language text,
      card_condition text,
      is_generic boolean,
      generic_sleeved boolean
    )
  LOOP
    IF v_row.card_name IS NULL OR btrim(v_row.card_name) = '' THEN
      RAISE EXCEPTION 'invalid_new_card_row'
        USING ERRCODE = 'P0001';
    END IF;

    -- Finish. Blank keeps the old behaviour (copy nonfoil, slot asks for nothing).
    IF v_row.finish IS NULL OR btrim(v_row.finish) = '' THEN
      v_row_finish := 'nonfoil';
      v_row_requested_finish := NULL;
    ELSIF v_row.finish IN ('nonfoil', 'foil', 'etched') THEN
      v_row_finish := v_row.finish;
      v_row_requested_finish := v_row.finish;
    ELSE
      RAISE EXCEPTION 'invalid_row_finish'
        USING ERRCODE = 'P0001';
    END IF;

    -- Language. Blank keeps the old behaviour (en). Shape-checked only; the app
    -- normalises to a known code before sending.
    IF v_row.language IS NULL OR btrim(v_row.language) = '' THEN
      v_row_language := 'en';
    ELSIF lower(btrim(v_row.language)) ~ '^[a-z]{2,4}$' THEN
      v_row_language := lower(btrim(v_row.language));
    ELSE
      RAISE EXCEPTION 'invalid_row_language'
        USING ERRCODE = 'P0001';
    END IF;

    -- Condition. NULL is allowed and means "none" (proxies, D-045 contract §4).
    IF v_row.card_condition IS NULL OR btrim(v_row.card_condition) = '' THEN
      v_row_condition := NULL;
    ELSIF v_row.card_condition IN (
      'near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged'
    ) THEN
      v_row_condition := v_row.card_condition;
    ELSE
      RAISE EXCEPTION 'invalid_row_condition'
        USING ERRCODE = 'P0001';
    END IF;

    v_row_source_tag := COALESCE(NULLIF(btrim(v_row.source_tag), ''), 'deck-import');

    -- Generic basic (contract generic-basic-lands §3, §8): a planned slot with the explicit flag.
    -- No copy, no ownership status. The art (scryfall_id / set_code) is image only and chosen
    -- by the app at write time. Language is kept on the slot as requested_language.
    IF COALESCE(v_row.is_generic, false) THEN
      IF NOT (v_row.card_name = ANY (v_generic_names)) THEN
        RAISE EXCEPTION 'invalid_generic_card_name'
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
        ownership_status,
        placement_source,
        requested_finish,
        requested_language,
        is_generic,
        generic_sleeved
      )
      VALUES (
        p_deck_id,
        v_row.card_name,
        v_row.scryfall_id,
        v_row.set_code,
        1,
        COALESCE(v_row.categories, '["Land"]'),
        false,
        p_user_id,
        NULL,
        NULL,
        NULL,
        v_row_requested_finish,
        CASE WHEN btrim(COALESCE(v_row.language, '')) = '' THEN NULL ELSE v_row_language END,
        true,
        COALESCE(v_row.generic_sleeved, true)
      );

      v_inserted_count := v_inserted_count + 1;
      CONTINUE;
    END IF;

    -- Planned slot only (Unsleeved, generic basics, maybeboard): no user_copies
    -- row. Unsleeved means "not in the deck, owned or not": the import neither
    -- creates nor links a copy. Language and condition have nowhere to live on a slot and are ignored;
    -- the finish is remembered as requested_finish (D-041).
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
        placement_source,
        requested_finish
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
        NULL,
        v_row_requested_finish
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
      language,
      condition,
      location_id,
      user_id
    )
    VALUES (
      v_row.card_id,
      COALESCE(v_row.printing_id, v_row.scryfall_id),
      COALESCE(v_row.is_proxy, false),
      v_row_source_tag,
      v_row_finish,
      v_row_language,
      v_row_condition,
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
      placement_source,
      requested_finish
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
      'import',
      v_row_requested_finish
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

CREATE OR REPLACE FUNCTION public.set_generic_basic_count(
  p_deck_id integer,
  p_user_id uuid,
  p_card_name text,
  p_count integer,
  p_finish text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_scryfall_id text DEFAULT NULL,
  p_set_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_names text[] := ARRAY['Plains','Island','Swamp','Mountain','Forest','Wastes','Snow-Covered Plains','Snow-Covered Island','Snow-Covered Swamp','Snow-Covered Mountain','Snow-Covered Forest'];
  v_current integer;
  v_tpl record;
  v_sleeved boolean;
  v_finish text;
  v_language text;
  v_scryfall text;
  v_set text;
  v_categories text;
  v_added integer := 0;
  v_removed integer := 0;
BEGIN
  IF p_card_name IS NULL OR NOT (p_card_name = ANY (v_names)) THEN
    RAISE EXCEPTION 'invalid_generic_card_name' USING ERRCODE = 'P0001';
  END IF;
  IF p_count IS NULL OR p_count < 0 THEN
    RAISE EXCEPTION 'invalid_generic_count' USING ERRCODE = 'P0001';
  END IF;
  IF p_finish IS NOT NULL AND p_finish NOT IN ('nonfoil', 'foil', 'etched') THEN
    RAISE EXCEPTION 'invalid_row_finish' USING ERRCODE = 'P0001';
  END IF;
  IF p_language IS NOT NULL AND lower(btrim(p_language)) !~ '^[a-z]{2,4}$' THEN
    RAISE EXCEPTION 'invalid_row_language' USING ERRCODE = 'P0001';
  END IF;

  -- Lock the deck (and verify ownership) so a double click cannot double-insert.
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*)::integer INTO v_current
  FROM deck_cards
  WHERE deck_id = p_deck_id AND user_id = p_user_id
    AND is_generic AND card_name = p_card_name;

  IF p_count < v_current THEN
    DELETE FROM deck_cards
    WHERE id IN (
      SELECT id FROM deck_cards
      WHERE deck_id = p_deck_id AND user_id = p_user_id
        AND is_generic AND card_name = p_card_name
      ORDER BY id DESC
      LIMIT v_current - p_count
    );
    GET DIAGNOSTICS v_removed = ROW_COUNT;
  ELSIF p_count > v_current THEN
    SELECT * INTO v_tpl
    FROM deck_cards
    WHERE deck_id = p_deck_id AND user_id = p_user_id
      AND is_generic AND card_name = p_card_name
    ORDER BY id
    LIMIT 1;

    IF FOUND THEN
      -- New rows inherit the line (state, finish, language, art).
      v_sleeved := v_tpl.generic_sleeved;
      v_finish := v_tpl.requested_finish;
      v_language := v_tpl.requested_language;
      v_scryfall := v_tpl.scryfall_id;
      v_set := v_tpl.set_code;
      v_categories := v_tpl.categories;
    ELSE
      v_sleeved := true;
      v_finish := p_finish;
      v_language := lower(btrim(p_language));
      v_scryfall := p_scryfall_id;
      v_set := p_set_code;
      v_categories := '["Land"]';
    END IF;

    INSERT INTO deck_cards (
      deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander,
      user_id, copy_id, ownership_status, placement_source,
      requested_finish, requested_language, is_generic, generic_sleeved
    )
    SELECT
      p_deck_id, p_card_name, v_scryfall, v_set, 1, v_categories, false,
      p_user_id, NULL, NULL, NULL,
      v_finish, v_language, true, v_sleeved
    FROM generate_series(1, p_count - v_current);
    GET DIAGNOSTICS v_added = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('success', true, 'added', v_added, 'removed', v_removed, 'count', p_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_generic_basic_count(integer, uuid, text, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_generic_basic_count(integer, uuid, text, integer, text, text, text, text) TO service_role;
