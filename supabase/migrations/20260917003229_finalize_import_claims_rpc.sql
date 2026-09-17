-- finalize_import_claims: for every printing where owned real copies are enough
-- to satisfy total sleeved demand (open claims + already-finalized sleeves),
-- assign distinct free owned copies to the claimed slots and delete those
-- claims. Printings still over-committed keep their claims open (conflicts).
--
-- Optionally scope to a single printing (p_printing_id) for post-resolution
-- auto-finalization; NULL processes all of the user's printings with claims.
CREATE OR REPLACE FUNCTION public.finalize_import_claims(
  p_user_id uuid,
  p_printing_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_printing text;
  v_owned int;
  v_finalized int;
  v_open_claims int;
  v_free_copy_id int;
  v_claim RECORD;
  v_finalized_count int := 0;
BEGIN
  -- Iterate distinct printings that currently have open claims for this user
  FOR v_printing IN
    SELECT DISTINCT printing_id
    FROM public.import_sleeve_claims
    WHERE user_id = p_user_id
      AND printing_id IS NOT NULL
      AND (p_printing_id IS NULL OR printing_id = p_printing_id)
  LOOP
    -- Serialize per printing
    PERFORM pg_advisory_xact_lock(
      hashtextextended('import-printing:' || v_printing, 0)
    );

    SELECT count(*) INTO v_owned
    FROM public.user_copies
    WHERE user_id = p_user_id AND printing_id = v_printing
      AND is_proxy = false AND missing = false;

    SELECT count(*) INTO v_finalized
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id AND dc.scryfall_id = v_printing
      AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
      AND uc.is_proxy = false;

    SELECT count(*) INTO v_open_claims
    FROM public.import_sleeve_claims
    WHERE user_id = p_user_id AND printing_id = v_printing;

    -- Only finalize when supply covers ALL demand for this printing.
    IF (v_finalized + v_open_claims) <= v_owned THEN
      FOR v_claim IN
        SELECT c.id AS claim_id, c.deck_cards_id
        FROM public.import_sleeve_claims c
        WHERE c.user_id = p_user_id AND c.printing_id = v_printing
        ORDER BY c.id
      LOOP
        -- Find a free owned copy of this printing (not already sleeved)
        SELECT uc.id INTO v_free_copy_id
        FROM public.user_copies uc
        WHERE uc.user_id = p_user_id AND uc.printing_id = v_printing
          AND uc.is_proxy = false AND uc.missing = false
          AND NOT EXISTS (
            SELECT 1 FROM public.deck_cards dc WHERE dc.copy_id = uc.id
          )
        ORDER BY uc.id
        LIMIT 1;

        -- Should always find one given the count guard, but guard anyway
        IF v_free_copy_id IS NULL THEN
          EXIT;
        END IF;

        UPDATE public.deck_cards
        SET copy_id = v_free_copy_id,
            ownership_status = 'original'
        WHERE id = v_claim.deck_cards_id;

        DELETE FROM public.import_sleeve_claims WHERE id = v_claim.claim_id;
        v_finalized_count := v_finalized_count + 1;
        v_free_copy_id := NULL;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'finalized_count', v_finalized_count);
END;
$function$;;
