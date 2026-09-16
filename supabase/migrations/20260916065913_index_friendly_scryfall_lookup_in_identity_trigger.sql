-- Perf: the identity trigger compared ref_printings.scryfall_id::text = btrim(NEW.scryfall_id).
-- Casting the indexed uuid column to text defeats the scryfall_printings_pkey btree
-- index, forcing a sequential scan of ref_printings on every deck_cards write. During
-- batch_assign_deck (100+ rows/deck, all in one transaction) this accumulated into
-- 'canceling statement due to statement timeout'.
--
-- Fix: compare uuid-to-uuid by casting the (validated) text input to uuid so the
-- primary-key index is used. deck_cards.scryfall_id is text; a malformed value that
-- can't cast to uuid is treated as 'not resolvable' and falls back to name comparison,
-- preserving the identity guard without erroring.
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
  v_scryfall_uuid uuid;
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

  -- Attempt to parse the slot's scryfall_id (text) into a uuid so we can use the
  -- primary-key index on ref_printings. A non-uuid value yields NULL and is
  -- treated as unresolvable (name-comparison fallback below).
  IF NULLIF(btrim(NEW.scryfall_id), '') IS NOT NULL THEN
    BEGIN
      v_scryfall_uuid := btrim(NEW.scryfall_id)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_scryfall_uuid := NULL;
    END;

    IF v_scryfall_uuid IS NOT NULL THEN
      SELECT rp.oracle_id
      INTO v_target_oracle_id
      FROM public.ref_printings rp
      WHERE rp.scryfall_id = v_scryfall_uuid
      LIMIT 1;
    END IF;

    IF v_target_oracle_id IS NOT NULL THEN
      -- Printing is known locally: enforce strict oracle-id identity.
      IF v_copy_oracle_id IS DISTINCT FROM v_target_oracle_id THEN
        RAISE EXCEPTION 'card_identity_mismatch'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- Printing not synced into ref_printings (or unparseable id): fall back to
      -- name comparison rather than hard-failing the whole assignment.
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
