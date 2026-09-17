-- During import reconciliation, Release/Proxy only ADJUST claims; they do NOT
-- finalize (assign real copies). Finalization happens once on finish, so every
-- deck stays an equal editable claim until the user leaves the import screen.
CREATE OR REPLACE FUNCTION public.resolve_import_conflict_release(
  p_user_id uuid,
  p_claim_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card text;
  v_deck_cards_id int;
BEGIN
  SELECT card_name, deck_cards_id INTO v_card, v_deck_cards_id
  FROM public.import_sleeve_claims
  WHERE id = p_claim_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Release simply drops the claim; the slot stays Planned (copy_id null).
  DELETE FROM public.import_sleeve_claims WHERE id = p_claim_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'released_deck_cards_id', v_deck_cards_id);
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
  SET copy_id = v_new_copy_id, ownership_status = 'proxy'
  WHERE id = v_deck_cards_id AND user_id = p_user_id;

  -- Drop the real claim (this slot is now satisfied by a proxy).
  DELETE FROM public.import_sleeve_claims WHERE id = p_claim_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'proxy_copy_id', v_new_copy_id, 'deck_cards_id', v_deck_cards_id);
END;
$function$;;
