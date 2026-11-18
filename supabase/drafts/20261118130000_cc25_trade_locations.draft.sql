-- DRAFT. NOT APPLIED. Needs owner approval. Rollback: 20261118130000_cc25_trade_locations.rollback.sql
-- CC-25 (and CC-14 item 4, "leave out chosen locations"): lets the owner mark a storage place as a Trade place.
-- Claude's collection search and counts leave Trade places out unless asked (the app reads this flag; it works without it, see below).
--
-- Why a yes/no flag and not a new value in user_locations.type: several live functions (the picklist tick and the
-- move list) accept only type = 'storage'. A new type value 'trade' would make them refuse every Trade place. A flag
-- on a normal storage place changes nothing for them. Only storage places can carry it.
--
-- What it changes: ONE new column on user_locations, default false. Every existing place gets false (nothing is marked
-- automatically; the Black Binder is NOT marked by this file). No function, view, policy or other table is touched.
-- The existing row security on user_locations (own rows only) already covers the new column.
--
-- To mark a place after approval (separate step, NOT part of this file; example for the Black Binder):
--   UPDATE public.user_locations SET is_trade = true WHERE type = 'storage' AND name = 'Black Binder' AND user_id = '<owner id>';
BEGIN;
ALTER TABLE public.user_locations ADD COLUMN is_trade boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_locations ADD CONSTRAINT user_locations_trade_only_storage CHECK (NOT is_trade OR type = 'storage');
COMMENT ON COLUMN public.user_locations.is_trade IS 'CC-25: true = a Trade place. Claude search and counts leave it out unless asked. Storage places only.';
COMMIT;
