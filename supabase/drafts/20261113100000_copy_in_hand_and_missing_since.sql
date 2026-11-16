-- DRAFT — NOT APPLIED. Pending owner approval of the stored-data change (brief section 18, phase 3).
-- Contract: docs/oracle/contracts/know-where-cards-are.md (sections 2 and 3)
--
-- WHAT THIS DOES
--   Adds the one missing piece for the "In your hand" system location, and a timestamp for Missing:
--     user_copies.in_hand        boolean NOT NULL DEFAULT false
--     user_copies.missing_since  timestamptz NULL
--   "Missing" already exists as user_copies.missing (live, 0 rows set on 2026-11-12).
--   "Unsorted" already exists as the per-user default storage location (user_locations.is_default = true).
--   A card has exactly one place: in a deck slot (deck_cards.copy_id), a storage location (location_id),
--   In your hand (in_hand), or Missing (missing). These are kept mutually exclusive by two triggers.
--
-- EXISTING-DATA IMPACT (checked read-only against the live project on 2026-11-12)
--   4,259 copies; 0 have missing = true; 0 are location-less and outside a deck. New columns default to
--   false / NULL for every row, so no existing copy changes behaviour. No rows are updated, moved or deleted.
--   ADD COLUMN with a constant default is a metadata-only change on Postgres 15+ (live is 17.6): no table rewrite.
--
-- REVERSIBILITY
--   Reversible. Rollback (run in this order; see "ROLLBACK" at the bottom):
--     1. Put any in-hand copies somewhere visible first (non-destructive; owner decides where): see bottom.
--     2. Drop the two triggers and functions, the two indexes, the CHECK, then the two columns.
--   Dropping the columns loses only the in_hand / missing_since values, which cannot be reconstructed
--   afterwards. Rollback is safe if no copy is in hand and none was marked missing since apply.
--
-- RISKS
--   R1. Every app query that means "free copy" today is "no deck_cards row" and ignores missing/in_hand
--       (src/lib/spare-copy-browse.ts, allocation-candidates.ts, owned-copy-lookup.ts, card-status.ts, ...).
--       Until the app is changed (build slice 1), an in-hand copy would look spare. Nothing is put in hand
--       until slice 2, so applying this migration alone changes nothing the owner sees.
--   R2. Older SQL functions test `uc.missing = false` only (several migrations, listed in the contract section 6).
--       They need `AND NOT uc.in_hand` too (a follow-up migration in slice 1). The deck_cards trigger below
--       makes a stray assignment of an unavailable copy fail loudly instead of silently succeeding.
--   R3. user_copies has RLS policies but relrowsecurity = false on the live project; deck_cards has neither.
--       Not changed here (out of scope) but it matters for a public multi-user version. Reported separately.

BEGIN;

-- 1. Columns ---------------------------------------------------------------------------------------
ALTER TABLE public.user_copies
  ADD COLUMN IF NOT EXISTS in_hand boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS missing_since timestamptz;

COMMENT ON COLUMN public.user_copies.in_hand IS
  'System location "In your hand": picked up for a move, not yet placed. true => location_id IS NULL, missing = false, no deck_cards row points at the copy. Not an identifier column.';
COMMENT ON COLUMN public.user_copies.missing_since IS
  'When the copy was flagged Missing (system location "Missing"). NULL when missing = false.';

-- 2. A copy is never both in hand and missing --------------------------------------------------------
ALTER TABLE public.user_copies
  ADD CONSTRAINT user_copies_not_hand_and_missing CHECK (NOT (in_hand AND missing));

-- 3. Keep "one place at a time" without touching every older function ---------------------------------
--    Setting a storage location, or flagging missing, takes the copy out of your hand.
--    (So an older path such as unassign_copy_to_storage on an in-hand copy lands it in Unsorted, valid.)
CREATE OR REPLACE FUNCTION public.user_copies_keep_one_place()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.location_id IS NOT NULL OR NEW.missing THEN
    NEW.in_hand := false;
  END IF;
  IF NEW.missing AND NEW.missing_since IS NULL THEN
    NEW.missing_since := now();
  ELSIF NOT NEW.missing THEN
    NEW.missing_since := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_user_copies_keep_one_place ON public.user_copies;
CREATE TRIGGER trg_user_copies_keep_one_place
  BEFORE INSERT OR UPDATE OF location_id, missing, in_hand ON public.user_copies
  FOR EACH ROW EXECUTE FUNCTION public.user_copies_keep_one_place();

-- 4. A deck slot can never be handed a copy that is in hand or missing --------------------------------
--    Fires only when copy_id is being set to a non-null value, so existing rows and every
--    clearing path (copy_id := NULL) are unaffected.
CREATE OR REPLACE FUNCTION public.deck_cards_copy_must_be_available()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_in_hand boolean;
  v_missing boolean;
BEGIN
  IF NEW.copy_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.copy_id IS NOT DISTINCT FROM NEW.copy_id THEN
    RETURN NEW;
  END IF;
  SELECT uc.in_hand, uc.missing INTO v_in_hand, v_missing
  FROM public.user_copies uc WHERE uc.id = NEW.copy_id;
  IF v_missing THEN
    RAISE EXCEPTION 'copy_missing' USING ERRCODE = 'P0001';
  END IF;
  IF v_in_hand THEN
    -- The checklist "placed" RPC clears in_hand BEFORE it sets copy_id, so it never hits this.
    RAISE EXCEPTION 'copy_in_hand' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_deck_cards_copy_must_be_available ON public.deck_cards;
CREATE TRIGGER trg_deck_cards_copy_must_be_available
  BEFORE INSERT OR UPDATE OF copy_id ON public.deck_cards
  FOR EACH ROW EXECUTE FUNCTION public.deck_cards_copy_must_be_available();

-- 5. Indexes (the two new lists: "In your hand" and "Missing") ------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_copies_in_hand ON public.user_copies (user_id) WHERE in_hand;
CREATE INDEX IF NOT EXISTS idx_user_copies_missing_open ON public.user_copies (user_id) WHERE missing;

COMMIT;

-- ROLLBACK (reference only; do not run without owner approval)
--   -- Step 1: list what would be affected:  SELECT id FROM user_copies WHERE in_hand OR missing;
--   -- Step 2 (owner-approved only): UPDATE user_copies SET location_id = <Unsorted id> WHERE in_hand;
--   DROP TRIGGER IF EXISTS trg_deck_cards_copy_must_be_available ON public.deck_cards;
--   DROP FUNCTION IF EXISTS public.deck_cards_copy_must_be_available();
--   DROP TRIGGER IF EXISTS trg_user_copies_keep_one_place ON public.user_copies;
--   DROP FUNCTION IF EXISTS public.user_copies_keep_one_place();
--   DROP INDEX IF EXISTS public.idx_user_copies_in_hand;
--   DROP INDEX IF EXISTS public.idx_user_copies_missing_open;
--   ALTER TABLE public.user_copies DROP CONSTRAINT IF EXISTS user_copies_not_hand_and_missing;
--   ALTER TABLE public.user_copies DROP COLUMN IF EXISTS in_hand, DROP COLUMN IF EXISTS missing_since;
