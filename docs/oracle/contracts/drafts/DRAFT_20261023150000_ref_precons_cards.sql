-- DRAFT. NOT APPLIED. NOT IN supabase/migrations/. OWNER APPROVAL REQUIRED BEFORE IT IS MOVED THERE AND APPLIED.
-- Brief: docs/oracle/briefs/import-cleanup.md section 6a (slice P1). Contract: import-intent.md section 7 (row P1).
--
-- Adds ONE nullable column to ref_precons: `cards`, each precon's full card list
-- (what the Precon tab turns into a CSV and opens in the normal import review).
--
-- Shape of `cards` (a JSON array, one object per distinct printing):
--   [{ "name": "Sol Ring", "set_code": "c21", "number": "263", "foil": false, "count": 1, "commander": false }, ...]
-- `commander: true` marks the commander card(s). Set code is lower-case; `number` is the collector number.
--
-- Safety: additive only. ADD COLUMN IF NOT EXISTS on a reference table (no user data). No DROP, TRUNCATE,
-- DELETE or UPDATE. Existing rows keep working (cards = NULL until the sync script is run again).
-- Reversible: ALTER TABLE public.ref_precons DROP COLUMN cards (it only holds data the sync re-creates).
-- The existing read policy (ref_precons_read_authenticated) already covers the new column.

ALTER TABLE public.ref_precons
  ADD COLUMN IF NOT EXISTS cards jsonb;

COMMENT ON COLUMN public.ref_precons.cards IS
  'Full card list for the Precon import tab: [{name,set_code,number,foil,count,commander}]. NULL until synced.';
