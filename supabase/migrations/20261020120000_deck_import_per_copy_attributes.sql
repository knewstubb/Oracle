-- APPROVED by the owner 2026-10-20 for the Developer to apply (order: see contract §12
-- step 2). NOT YET APPLIED. Originally drafted by the Architect.
-- Task: import row editing, per-copy attributes (contract:
--   docs/oracle/contracts/import-row-editing.md, §8).
--
-- Forward-only. Reversible in practice: restore the previous function body
-- (see "Undo" below). No data is changed; rows already written are untouched.
--
-- What this does
--   Extends `replace_deck_with_new_cards` (the single atomic deck-import write)
--   so each row of p_rows may carry, per physical copy:
--     finish       text   nonfoil | foil | etched      (default nonfoil)
--     language     text   lower-case code, e.g. en, ja (default en)
--     card_condition text near_mint | lightly_played | moderately_played
--                         | heavily_played | damaged, or NULL (proxies)
--     source_tag   text   free text                    (default deck-import)
--   and stores them on user_copies. It also stores the row's finish on
--   deck_cards.requested_finish (D-041) for every kind of row, including
--   Unsleeved (planned) slots, so a slot remembers the finish it asks for.
--
--   Identifier columns: printing_id / scryfall_id hold a scryfall_id (printing).
--   card_id is a user_cards.id (which carries the oracle_id). D-003 unchanged.
--
-- This file SUPERSEDES the unapplied draft 20261013120000_deck_import_row_finish.sql
-- (T-57; it exists only in archived commit 21058b7, not in supabase/migrations/
-- on main). Apply this one instead of it, never both out of order: this file is a
-- strict superset (same finish / requested_finish / source_tag behaviour plus
-- language and condition), and CREATE OR REPLACE makes either order safe.
--
-- Safety
--   - CREATE OR REPLACE FUNCTION only. No DROP, TRUNCATE, or DELETE of data.
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
      card_condition text
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
