-- Task T-12: Add a `source` parameter to every placement write.
-- Owner approved. Data is replaceable until MVP.
--
-- A "placement" is any operation that sets deck_cards.copy_id to a non-null
-- value. Per D-009, every placement carries a source ('manual', 'ai', or
-- 'import') so undo, validation and audit logging are shared across manual
-- and AI placement.
--
-- This migration:
--   1. Adds deck_cards.placement_source.
--   2. Backfills existing filled slots to 'manual'.
--   3. Updates placement RPCs to accept p_source DEFAULT 'manual' and write it.
--   4. Updates clearing RPCs to set placement_source = NULL when copy_id is cleared.
--
-- NOTE: the function bodies below were taken from the latest migration that
-- defines each function (not from an earlier revision). In particular
-- add_proxies_to_slots retains its user_cards upsert, finalize_import_claims
-- keeps its by-card-identity semantics, and resolve_import_conflict_proxy does
-- not auto-finalize.
--
-- Reversibility: forward-only. To reverse, drop the column and restore the
-- previous function signatures from a prior migration.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Schema change
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deck_cards
ADD COLUMN IF NOT EXISTS placement_source text
  CHECK (placement_source IS NULL OR placement_source IN ('manual', 'ai', 'import'));

COMMENT ON COLUMN public.deck_cards.placement_source IS
  'Source of the placement that filled this slot: manual, ai, or import. NULL when copy_id is NULL.';

-- Backfill existing filled slots. We do not know their original source, so we
-- assume manual — the safest default for historical data.
UPDATE public.deck_cards
SET placement_source = 'manual'
WHERE copy_id IS NOT NULL
  AND placement_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_deck_cards_placement_source
  ON public.deck_cards (user_id, placement_source)
  WHERE placement_source IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b. Drop superseded signatures
-- ═══════════════════════════════════════════════════════════════════════════

-- Adding a parameter creates a new overload rather than replacing the old
-- function. Drop the pre-source signatures so no call can resolve to a stale
-- body (which would leave placement_source NULL) and to avoid overloading
-- ambiguity for calls that omit p_source.
DROP FUNCTION IF EXISTS public._move_copy_to_slot(integer, integer, uuid, boolean);
DROP FUNCTION IF EXISTS public.assign_physical_copy(integer, integer, uuid);
DROP FUNCTION IF EXISTS public.force_claim_copy(integer, integer, uuid);
DROP FUNCTION IF EXISTS public.assign_free_copy(integer, integer, text, uuid);
DROP FUNCTION IF EXISTS public.reassign_to_deck(integer, integer, text, uuid);
DROP FUNCTION IF EXISTS public.undo_copy_move(integer, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.add_proxy_to_slot(integer, integer, uuid);
DROP FUNCTION IF EXISTS public.replace_proxy_with_original(integer, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.add_proxies_to_slots(uuid, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Assignment RPCs (manual default)
-- ═══════════════════════════════════════════════════════════════════════════

-- _move_copy_to_slot is the shared implementation for assign_physical_copy
-- and force_claim_copy.
CREATE OR REPLACE FUNCTION public._move_copy_to_slot(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid,
  p_force_claim boolean,
  p_source text DEFAULT 'manual'
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
        ownership_status = NULL,
        placement_source = NULL
    WHERE id = v_source_deck_card_id;
  END IF;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END,
      placement_source = p_source
  WHERE id = p_target_deck_card_id;

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

CREATE OR REPLACE FUNCTION public.assign_physical_copy(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
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
    false,
    p_source
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.force_claim_copy(
  p_target_deck_card_id integer,
  p_copy_id integer,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
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
    true,
    p_source
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_free_copy(
  p_copy_id integer,
  p_target_deck_id integer,
  p_card_name text,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
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
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END,
      placement_source = p_source
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

CREATE OR REPLACE FUNCTION public.reassign_to_deck(
  p_copy_id integer,
  p_target_deck_id integer,
  p_card_name text,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
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
      ownership_status = NULL,
      placement_source = NULL
  WHERE id = v_source_deck_card_id;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END,
      placement_source = p_source
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

CREATE OR REPLACE FUNCTION public.undo_copy_move(
  p_current_deck_card_id integer,
  p_copy_id integer,
  p_restore_deck_card_id integer,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
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
        ownership_status = NULL,
        placement_source = NULL
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
      ownership_status = NULL,
      placement_source = NULL
  WHERE id = p_current_deck_card_id;

  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE
        WHEN (SELECT is_proxy FROM user_copies WHERE id = p_copy_id)
          THEN 'proxy'
        ELSE 'original'
      END,
      placement_source = p_source
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
-- 3. Proxy replacement (manual default)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.replace_proxy_with_original(
  p_deck_card_id integer,
  p_original_copy_id integer,
  p_proxy_storage_location_id integer,
  p_user_id uuid,
  p_source text DEFAULT 'manual'
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
      ownership_status = 'original',
      placement_source = p_source
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Bulk proxy creation (manual default)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Batch assignment (caller-supplied source)
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_source text;
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
    v_source := COALESCE(NULLIF(v_assignment->>'source', ''), 'manual');

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
          ownership_status = NULL,
          placement_source = NULL
      WHERE id = v_holder_deck_card_id;
    ELSIF v_source_deck_card_id IS NOT NULL THEN
      RAISE EXCEPTION 'source_assignment_mismatch'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE deck_cards
    SET copy_id = v_copy_id,
        ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END,
        placement_source = v_source
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Import placements (hard-coded 'import')
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

CREATE OR REPLACE FUNCTION public.finalize_import_claims(
  p_user_id uuid,
  p_card_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card text;
  v_owned int;
  v_finalized int;
  v_open_claims int;
  v_free RECORD;
  v_claim RECORD;
  v_finalized_count int := 0;
BEGIN
  FOR v_card IN
    SELECT DISTINCT card_name
    FROM public.import_sleeve_claims
    WHERE user_id = p_user_id
      AND (p_card_name IS NULL OR card_name = p_card_name)
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('import-card:' || v_card, 0));

    SELECT count(*) INTO v_owned
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id AND ucard.card_name = v_card
      AND uc.is_proxy = false AND uc.missing = false;

    SELECT count(*) INTO v_finalized
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id AND dc.card_name = v_card
      AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
      AND uc.is_proxy = false;

    SELECT count(*) INTO v_open_claims
    FROM public.import_sleeve_claims
    WHERE user_id = p_user_id AND card_name = v_card;

    IF (v_finalized + v_open_claims) <= v_owned THEN
      FOR v_claim IN
        SELECT c.id AS claim_id, c.deck_cards_id, c.printing_id
        FROM public.import_sleeve_claims c
        WHERE c.user_id = p_user_id AND c.card_name = v_card
        ORDER BY c.id
      LOOP
        SELECT uc.id AS copy_id, uc.printing_id
        INTO v_free
        FROM public.user_copies uc
        JOIN public.user_cards ucard ON ucard.id = uc.card_id
        WHERE uc.user_id = p_user_id AND ucard.card_name = v_card
          AND uc.is_proxy = false AND uc.missing = false
          AND NOT EXISTS (SELECT 1 FROM public.deck_cards dc WHERE dc.copy_id = uc.id)
        ORDER BY uc.id
        LIMIT 1;

        IF v_free.copy_id IS NULL THEN
          EXIT;
        END IF;

        UPDATE public.deck_cards
        SET copy_id = v_free.copy_id,
            ownership_status = 'original',
            scryfall_id = COALESCE(v_free.printing_id, scryfall_id),
            placement_source = 'import'
        WHERE id = v_claim.deck_cards_id;

        DELETE FROM public.import_sleeve_claims WHERE id = v_claim.claim_id;
        v_finalized_count := v_finalized_count + 1;
        v_free := NULL;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'finalized_count', v_finalized_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_import_conflict_proxy(
  p_user_id uuid,
  p_claim_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_printing text;
  v_deck_cards_id int;
  v_card_name text;
  v_card_id int;
  v_new_copy_id int;
BEGIN
  SELECT c.printing_id, c.deck_cards_id, c.card_name
  INTO v_printing, v_deck_cards_id, v_card_name
  FROM public.import_sleeve_claims c
  WHERE c.id = p_claim_id AND c.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_card_id
  FROM public.user_cards
  WHERE user_id = p_user_id AND card_name = v_card_name
  ORDER BY id LIMIT 1;

  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'card_identity_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Create the printing-matched proxy and sleeve it into this slot.
  INSERT INTO public.user_copies (card_id, printing_id, is_proxy, user_id, source_tag, finish)
  VALUES (v_card_id, v_printing, true, p_user_id, 'import-conflict-proxy', 'nonfoil')
  RETURNING id INTO v_new_copy_id;

  UPDATE public.deck_cards
  SET copy_id = v_new_copy_id,
      ownership_status = 'proxy',
      placement_source = 'import'
  WHERE id = v_deck_cards_id AND user_id = p_user_id;

  -- Drop the real claim (this slot is now satisfied by a proxy).
  DELETE FROM public.import_sleeve_claims WHERE id = p_claim_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'proxy_copy_id', v_new_copy_id, 'deck_cards_id', v_deck_cards_id);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Clearing RPCs (set placement_source = NULL)
-- ═══════════════════════════════════════════════════════════════════════════

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
      ownership_status = NULL,
      placement_source = NULL
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
      ownership_status = NULL,
      placement_source = NULL
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
      ownership_status = NULL,
      placement_source = NULL
  WHERE copy_id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'affected_deck_ids', to_jsonb(COALESCE(v_affected_deck_ids, ARRAY[]::integer[]))
  );
END;
$function$;

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

  -- Clear the placement before the copy row is deleted.
  UPDATE deck_cards
  SET copy_id = NULL,
      ownership_status = NULL,
      placement_source = NULL
  WHERE copy_id = p_copy_id
    AND user_id = p_user_id;

  DELETE FROM user_copies
  WHERE id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'copy_id', p_copy_id);
END;
$function$;

-- Bulk collection sync also detaches copies from slots. The contract's clearing
-- list omitted these two bulk-delete paths; they are updated here so the
-- invariant "placement_source IS NULL whenever copy_id IS NULL" holds for every
-- write path, not just the single-copy one.
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
        ownership_status = NULL,
        placement_source = NULL
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
      ownership_status = NULL,
      placement_source = NULL
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Grants
-- ═══════════════════════════════════════════════════════════════════════════

-- Placement RPCs take p_user_id as a parameter and do not check auth.uid(), so
-- they must only be reachable through the service role (matching the existing
-- REVOKE/GRANT pattern for the pre-source signatures).
REVOKE ALL ON FUNCTION public._move_copy_to_slot(integer, integer, uuid, boolean, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.assign_physical_copy(integer, integer, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.force_claim_copy(integer, integer, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.assign_free_copy(integer, integer, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.reassign_to_deck(integer, integer, text, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.undo_copy_move(integer, integer, integer, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.add_proxy_to_slot(integer, integer, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.replace_proxy_with_original(integer, integer, integer, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.add_proxies_to_slots(uuid, jsonb, text) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.assign_physical_copy(integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_claim_copy(integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_free_copy(integer, integer, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reassign_to_deck(integer, integer, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.undo_copy_move(integer, integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_proxy_to_slot(integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_proxy_with_original(integer, integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_proxies_to_slots(uuid, jsonb, text) TO service_role;
