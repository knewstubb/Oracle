DROP FUNCTION IF EXISTS public.finalize_import_claims(uuid, text);

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
            scryfall_id = COALESCE(v_free.printing_id, scryfall_id)
        WHERE id = v_claim.deck_cards_id;

        DELETE FROM public.import_sleeve_claims WHERE id = v_claim.claim_id;
        v_finalized_count := v_finalized_count + 1;
        v_free := NULL;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'finalized_count', v_finalized_count);
END;
$function$;;
