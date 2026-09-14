-- Collection Foundation Phase 2: atomically remove one deck slot.
--
-- A sleeved copy is represented by deck_cards.copy_id with
-- user_copies.location_id = NULL. Removing that slot must return a non-missing
-- copy to default storage in the same transaction as the slot deletion.

CREATE OR REPLACE FUNCTION public.remove_deck_card_with_release(
  p_deck_id integer,
  p_deck_card_id integer,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_copy_id integer;
  v_copy_user_id uuid;
  v_copy_missing boolean;
  v_default_location_id integer;
  v_deleted_count integer := 0;
  v_released_count integer := 0;
BEGIN
  -- Lock the deck first so this operation serializes with deck-wide release
  -- and deletion operations that use the same lock order.
  PERFORM 1
  FROM decks
  WHERE id = p_deck_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT dc.copy_id
  INTO v_copy_id
  FROM deck_cards dc
  WHERE dc.id = p_deck_card_id
    AND dc.deck_id = p_deck_id
    AND dc.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_card_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_copy_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended('collection-copy:' || v_copy_id::text, 0)
    );

    SELECT uc.user_id, uc.missing
    INTO v_copy_user_id, v_copy_missing
    FROM user_copies uc
    WHERE uc.id = v_copy_id
    FOR UPDATE;

    IF NOT FOUND OR v_copy_user_id <> p_user_id THEN
      RAISE EXCEPTION 'copy_not_found'
        USING ERRCODE = 'P0001';
    END IF;

    IF NOT v_copy_missing THEN
      v_default_location_id := public._default_storage_location_id(p_user_id);
    END IF;

    UPDATE user_copies
    SET location_id = CASE
      WHEN v_copy_missing THEN NULL
      ELSE v_default_location_id
    END
    WHERE id = v_copy_id
      AND user_id = p_user_id;

    v_released_count := 1;
  END IF;

  DELETE FROM deck_cards
  WHERE id = p_deck_card_id
    AND deck_id = p_deck_id
    AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count <> 1 THEN
    RAISE EXCEPTION 'deck_card_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deck_card_id', p_deck_card_id,
    'copy_id', v_copy_id,
    'deleted_count', v_deleted_count,
    'released_count', v_released_count,
    'target_location_id', CASE
      WHEN v_copy_id IS NULL OR v_copy_missing THEN NULL
      ELSE v_default_location_id
    END
  );
END;
$function$;

-- Keep this destructive, ownership-guarded operation unavailable to clients.
REVOKE ALL ON FUNCTION public.remove_deck_card_with_release(integer, integer, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_deck_card_with_release(integer, integer, uuid)
  TO service_role;
