-- T-49: proxying a deck slot records the printing (and finish) the slot asks
-- for, per D-038 and D-041. Before this, a proxy was always recorded as the
-- newest printing of the card with finish 'nonfoil' (audit P1 / F2), so a slot
-- asking for, say, Borderless Sol Ring got a regular Sol Ring proxy.
--
-- What this migration does:
--   1. Adds deck_cards.requested_finish (nullable; nonfoil | foil | etched),
--      so a deck slot can remember the finish it asks for (D-041).
--   2. Rewrites add_proxy_to_slot so the new user_copies row uses the slot's
--      own scryfall_id when it has one, and the slot's requested_finish when
--      it has one. Only a slot with no requested printing falls back to the
--      newest printing of the card (the old behaviour).
--   3. Rewrites add_proxies_to_slots the same way, additionally accepting an
--      explicit printing_id / finish per assignment (the bulk route reads the
--      slot and passes them); the slot's own values are still used when the
--      assignment omits them.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- Non-destructive: no DROP, TRUNCATE, DELETE or data rewrite. The function
-- signatures are unchanged, so existing EXECUTE grants still apply.
--
-- Source of the pre-change bodies: supabase/migrations/20260925220000_placement_source.sql

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Schema change: deck slot remembers the finish it asks for (D-041)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deck_cards
  ADD COLUMN IF NOT EXISTS requested_finish text
  CONSTRAINT deck_cards_requested_finish_check
  CHECK (requested_finish IS NULL OR requested_finish IN ('nonfoil', 'foil', 'etched'));

COMMENT ON COLUMN public.deck_cards.requested_finish IS
  'Finish the deck slot asks for: nonfoil, foil, or etched (D-041). NULL when the slot does not specify a finish.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Single proxy: record the slot's requested printing and finish (D-038)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_proxy_to_slot(
  p_target_deck_card_id integer,
  p_card_id integer,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_target_copy_id integer;
  v_slot_scryfall_id text;
  v_slot_requested_finish text;
  v_card_user_id uuid;
  v_oracle_id text;
  v_printing_id text;
  v_new_copy_id integer;
BEGIN
  SELECT dc.copy_id, dc.scryfall_id, dc.requested_finish
  INTO v_target_copy_id, v_slot_scryfall_id, v_slot_requested_finish
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

  -- D-038: the proxy records the printing the slot asks for. Only a slot that
  -- names no printing falls back to the newest printing of the card.
  v_slot_scryfall_id := NULLIF(btrim(COALESCE(v_slot_scryfall_id, '')), '');
  IF v_slot_scryfall_id IS NOT NULL THEN
    v_printing_id := v_slot_scryfall_id;
  ELSE
    SELECT rp.scryfall_id::text
    INTO v_printing_id
    FROM ref_printings rp
    WHERE rp.oracle_id::text = v_oracle_id
    ORDER BY rp.released_at DESC NULLS LAST, rp.scryfall_id
    LIMIT 1;
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
    p_card_id,
    v_printing_id,
    true,
    'manual',
    COALESCE(NULLIF(btrim(COALESCE(v_slot_requested_finish, '')), ''), 'nonfoil'),
    NULL,
    p_user_id
  )
  RETURNING id INTO v_new_copy_id;

  UPDATE deck_cards
  SET copy_id = v_new_copy_id,
      ownership_status = 'proxy',
      placement_source = p_source
  WHERE id = p_target_deck_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'copy_id', v_new_copy_id,
    'deck_card_id', p_target_deck_card_id
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Bulk proxy: same rule, plus optional per-assignment printing/finish
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_proxies_to_slots(
  p_user_id uuid,
  p_assignments jsonb,
  p_source text DEFAULT 'manual'
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
  v_requested_printing_id text;
  v_requested_finish text;
  v_default_printing_id text;
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

    SELECT dc.copy_id, dc.card_name, dc.scryfall_id, dc.requested_finish
    INTO v_target_copy_id, v_target_card_name, v_requested_printing_id, v_requested_finish
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

    -- Prefer a printing/finish supplied in the assignment, then the slot's own
    -- values, then the newest printing of the card name (D-038 / D-041).
    v_requested_printing_id := COALESCE(
      NULLIF(btrim(COALESCE(v_assignment->>'printing_id', '')), ''),
      NULLIF(btrim(COALESCE(v_requested_printing_id, '')), '')
    );
    v_requested_finish := COALESCE(
      NULLIF(btrim(COALESCE(v_assignment->>'finish', '')), ''),
      NULLIF(btrim(COALESCE(v_requested_finish, '')), '')
    );

    IF v_requested_printing_id IS NOT NULL THEN
      SELECT rp.oracle_id::text
      INTO v_oracle_id
      FROM ref_printings rp
      WHERE rp.scryfall_id::text = v_requested_printing_id
      LIMIT 1;
    END IF;

    IF v_oracle_id IS NULL THEN
      SELECT rp.oracle_id::text, rp.scryfall_id::text
      INTO v_oracle_id, v_default_printing_id
      FROM ref_printings rp
      WHERE rp.name = v_target_card_name
      ORDER BY rp.released_at DESC NULLS LAST, rp.scryfall_id
      LIMIT 1;
    END IF;

    IF v_oracle_id IS NULL THEN
      RAISE EXCEPTION 'card_printing_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    v_printing_id := COALESCE(v_requested_printing_id, v_default_printing_id);

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
      COALESCE(v_requested_finish, 'nonfoil'),
      NULL,
      p_user_id
    )
    RETURNING id INTO v_target_copy_id;

    UPDATE deck_cards
    SET copy_id = v_target_copy_id,
        ownership_status = 'proxy',
        placement_source = p_source
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
