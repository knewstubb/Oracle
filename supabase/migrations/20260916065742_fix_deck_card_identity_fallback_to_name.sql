-- Fix: validate_deck_card_copy_identity hard-failed with target_identity_unresolved
-- when a deck_cards row's scryfall_id was not present in ref_printings (e.g. an
-- Archidekt printing that hasn't been synced into the local reference table).
-- This aborted the entire batch_assign_deck transaction, leaving whole decks
-- unassigned (0/N).
--
-- The trigger's invariant is: the assigned copy's card identity must match the
-- slot's card identity. When scryfall_id resolves in ref_printings we keep the
-- strict oracle_id comparison. When it does NOT resolve, we fall back to a
-- card_name comparison (the same check already used when scryfall_id is empty)
-- rather than raising. This preserves the identity guard for the personal-app
-- scope without blocking correct assignments on unsynced printings.
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

    IF v_target_oracle_id IS NOT NULL THEN
      -- Printing is known locally: enforce strict oracle-id identity.
      IF v_copy_oracle_id IS DISTINCT FROM v_target_oracle_id THEN
        RAISE EXCEPTION 'card_identity_mismatch'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- Printing not synced into ref_printings: fall back to name comparison
      -- rather than hard-failing the whole assignment.
      IF lower(btrim(COALESCE(NEW.card_name, ''))) IS DISTINCT FROM
         lower(btrim(COALESCE(v_copy_card_name, ''))) THEN
        RAISE EXCEPTION 'card_identity_mismatch'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF lower(btrim(COALESCE(NEW.card_name, ''))) IS DISTINCT FROM
        lower(btrim(COALESCE(v_copy_card_name, ''))) THEN
    RAISE EXCEPTION 'card_identity_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;;
