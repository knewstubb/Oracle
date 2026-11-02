-- DRAFT, NOT APPLIED. Needs owner approval before the Developer applies it.
-- Contract: docs/oracle/contracts/generic-basic-lands.md
--
-- Schema additions only. NO data conversion: the owner will purge and re-import, so no
-- existing row is updated, backfilled or deleted. Every existing row gets the defaults
-- (is_generic=false), so old rows behave exactly as before.
-- No dependency on 20261020120000; either order is safe.

ALTER TABLE public.deck_cards
  ADD COLUMN IF NOT EXISTS is_generic boolean NOT NULL DEFAULT false,
  -- Sleeved/Unsleeved state of a GENERIC slot only (ordinary slots derive it from copy_id).
  -- Meaningless when is_generic=false. Default true (a plain generic line starts Sleeved).
  -- All-or-nothing per (deck, basic name) is enforced by the API/RPC that writes it, not by the DB.
  ADD COLUMN IF NOT EXISTS generic_sleeved boolean NOT NULL DEFAULT true,
  -- Optional language for a generic (display/wish only).
  ADD COLUMN IF NOT EXISTS requested_language text;

-- A generic never holds a copy and never carries an ownership status.
-- All existing rows have is_generic=false, so this passes without touching data.
ALTER TABLE public.deck_cards
  DROP CONSTRAINT IF EXISTS deck_cards_generic_has_no_copy;
ALTER TABLE public.deck_cards
  ADD CONSTRAINT deck_cards_generic_has_no_copy
  CHECK (NOT is_generic OR (copy_id IS NULL AND ownership_status IS NULL));

-- Rollback (manual): ALTER TABLE public.deck_cards DROP CONSTRAINT deck_cards_generic_has_no_copy,
--   DROP COLUMN is_generic, DROP COLUMN generic_sleeved, DROP COLUMN requested_language;
