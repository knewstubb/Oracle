-- Personal-app atomic collection corrections.
--
-- This migration closes correctness gaps in the current-schema boundary without
-- introducing broad RLS, multi-user, import-staging, or observability work.

-- Keep the existing strict helper name for legacy movement RPCs, but make it
-- compatible with new/empty users by creating the default only when needed.
CREATE OR REPLACE FUNCTION public._default_storage_location_id(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public._ensure_default_storage_location_id(p_user_id);
END;
$function$;

-- Enforce canonical card identity at the current-schema write boundary. This
-- protects every movement RPC, including any future caller that forgets to
-- repeat the check in application code.
CREATE OR REPLACE FUNCTION public.validate_deck_card_copy_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_user_id uuid;
  v_copy_oracle_id uuid;
  v_copy_card_name text;
  v_target_oracle_id uuid;
BEGIN
  IF NEW.copy_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT uc.user_id, ucard.oracle_id, ucard.card_name
  INTO v_copy_user_id, v_copy_oracle_id, v_copy_card_name
  FROM public.user_copies uc
  JOIN public.user_cards ucard ON ucard.id = uc.card_id
  WHERE uc.id = NEW.copy_id;

  IF NOT FOUND OR v_copy_user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NULLIF(btrim(NEW.scryfall_id), '') IS NOT NULL THEN
    SELECT rp.oracle_id
    INTO v_target_oracle_id
    FROM public.ref_printings rp
    WHERE rp.scryfall_id::text = btrim(NEW.scryfall_id)
    LIMIT 1;

    IF v_target_oracle_id IS NULL THEN
      RAISE EXCEPTION 'target_identity_unresolved'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_copy_oracle_id IS DISTINCT FROM v_target_oracle_id THEN
      RAISE EXCEPTION 'card_identity_mismatch'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF lower(btrim(COALESCE(NEW.card_name, ''))) IS DISTINCT FROM
        lower(btrim(COALESCE(v_copy_card_name, ''))) THEN
    RAISE EXCEPTION 'card_identity_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_deck_card_copy_identity ON public.deck_cards;
CREATE TRIGGER trg_validate_deck_card_copy_identity
BEFORE INSERT OR UPDATE OF copy_id, card_name, scryfall_id, user_id
ON public.deck_cards
FOR EACH ROW
EXECUTE FUNCTION public.validate_deck_card_copy_identity();

-- Supported "found" operations must restore a copy to storage atomically.
CREATE OR REPLACE FUNCTION public.unmark_copy_missing(
  p_copy_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card_name text;
  v_missing boolean;
  v_location_id integer;
  v_holder_id integer;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-copy:' || p_copy_id::text, 0)
  );

  SELECT ucard.card_name, uc.missing, uc.location_id
  INTO v_card_name, v_missing, v_location_id
  FROM public.user_copies uc
  JOIN public.user_cards ucard ON ucard.id = uc.card_id
  WHERE uc.id = p_copy_id
    AND uc.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'copy_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_missing THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_found', true,
      'card_name', v_card_name,
      'location_id', v_location_id
    );
  END IF;

  SELECT dc.id
  INTO v_holder_id
  FROM public.deck_cards dc
  JOIN public.decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id
    AND d.user_id = p_user_id
  LIMIT 1
  FOR UPDATE OF dc;

  IF v_holder_id IS NOT NULL THEN
    RAISE EXCEPTION 'copy_already_assigned'
      USING ERRCODE = 'P0001';
  END IF;

  v_location_id := public._ensure_default_storage_location_id(p_user_id);

  UPDATE public.user_copies
  SET missing = false,
      location_id = v_location_id
  WHERE id = p_copy_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_found', false,
    'card_name', v_card_name,
    'location_id', v_location_id
  );
END;
$function$;

-- Replace the complete collection only after the caller has preflighted the
-- complete source file. The removal membership is selected after acquiring a
-- per-user transaction lock, so no pre-lock ID snapshot can drive deletion.
CREATE OR REPLACE FUNCTION public.replace_collection(
  p_user_id uuid,
  p_insert_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_remove_ids integer[];
BEGIN
  IF jsonb_typeof(COALESCE(p_insert_rows, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_copy_rows'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('collection-user:' || p_user_id::text, 0)
  );

  SELECT COALESCE(array_agg(uc.id ORDER BY uc.id), ARRAY[]::integer[])
  INTO v_remove_ids
  FROM public.user_copies uc
  WHERE uc.user_id = p_user_id;

  RETURN public.apply_collection_sync(
    p_user_id,
    v_remove_ids,
    p_insert_rows
  );
END;
$function$;

-- No browser role may invoke these SECURITY DEFINER write functions. Routes
-- authenticate first and use the service-role client with explicit user guards.
REVOKE ALL ON FUNCTION public._default_storage_location_id(uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.validate_deck_card_copy_identity() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.unmark_copy_missing(integer, uuid) FROM PUBLIC, authenticated;

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
REVOKE ALL ON FUNCTION public.move_copy_to_storage(integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.move_copies_to_storage(integer[], integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.replace_proxy_with_original(integer, integer, integer, uuid) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.add_proxies_to_slots(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.insert_user_copies(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.apply_collection_sync(uuid, integer[], jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.replace_collection(uuid, jsonb) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.delete_storage_location(integer, uuid) FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.unmark_copy_missing(integer, uuid) TO service_role;
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
GRANT EXECUTE ON FUNCTION public.move_copy_to_storage(integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_copies_to_storage(integer[], integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_proxy_with_original(integer, integer, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_proxies_to_slots(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_user_copies(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_collection_sync(uuid, integer[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_collection(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_storage_location(integer, uuid) TO service_role;
