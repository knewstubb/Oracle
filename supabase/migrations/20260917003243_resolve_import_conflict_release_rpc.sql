-- resolve_import_conflict_release: user chose to Release an excess sleeve claim.
-- The slot stays Planned (copy_id remains null); the claim is removed. Then
-- re-run finalization for that printing in case the removal drops demand to
-- within supply (assigning real copies to the remaining claims).
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
  v_printing text;
  v_deck_cards_id int;
BEGIN
  SELECT printing_id, deck_cards_id
  INTO v_printing, v_deck_cards_id
  FROM public.import_sleeve_claims
  WHERE id = p_claim_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('import-printing:' || COALESCE(v_printing, 'null'), 0)
  );

  DELETE FROM public.import_sleeve_claims WHERE id = p_claim_id AND user_id = p_user_id;

  -- Re-finalize this printing now that demand dropped.
  IF v_printing IS NOT NULL THEN
    PERFORM public.finalize_import_claims(p_user_id, v_printing);
  END IF;

  RETURN jsonb_build_object('success', true, 'released_deck_cards_id', v_deck_cards_id);
END;
$function$;;
