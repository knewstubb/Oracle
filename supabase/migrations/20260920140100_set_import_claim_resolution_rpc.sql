-- set_import_claim_resolution: record (or change) what a deck should do about a
-- claimed card. Purely an intent write — it never touches user_copies or
-- deck_cards.copy_id, so it is fully reversible until the finalize pass runs.
--
-- Replaces the old destructive pair:
--   resolve_import_conflict_release  (DELETEd the claim)
--   resolve_import_conflict_proxy    (INSERTed a real proxy copy + set copy_id)
-- Both are redefined below as thin wrappers so any cached client still behaves
-- correctly instead of destroying state.
CREATE OR REPLACE FUNCTION public.set_import_claim_resolution(
  p_user_id    uuid,
  p_claim_id   integer,
  p_resolution text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card text;
BEGIN
  IF p_resolution NOT IN ('sleeve', 'release', 'proxy') THEN
    RAISE EXCEPTION 'invalid_resolution: %', p_resolution USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.import_sleeve_claims
  SET resolution = p_resolution
  WHERE id = p_claim_id AND user_id = p_user_id
  RETURNING card_name INTO v_card;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'claim_not_found' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'claim_id',   p_claim_id,
    'card_name',  v_card,
    'resolution', p_resolution
  );
END;
$function$;;

-- Backwards-compatible wrappers. Same signatures as before, but now they only
-- record intent instead of finalizing.
CREATE OR REPLACE FUNCTION public.resolve_import_conflict_release(
  p_user_id  uuid,
  p_claim_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public.set_import_claim_resolution(p_user_id, p_claim_id, 'release');
END;
$function$;;

CREATE OR REPLACE FUNCTION public.resolve_import_conflict_proxy(
  p_user_id  uuid,
  p_claim_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public.set_import_claim_resolution(p_user_id, p_claim_id, 'proxy');
END;
$function$;;
