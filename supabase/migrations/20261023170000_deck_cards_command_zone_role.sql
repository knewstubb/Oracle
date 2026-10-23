-- T-61. APPLIED to the live DB 2026-10-23 with owner approval.
-- Contract: docs/oracle/contracts/command-zone-roles.md
--
-- Adds ONE nullable column to deck_cards: command_zone_role ('partner' | 'background' | 'companion'), plus constraints.
-- The ordinary commander keeps command_zone_role = NULL and is_commander = true (unchanged; no backfill).
--
-- REVERSIBLE: yes, as long as no row uses the column yet. Undo:
--   DROP INDEX IF EXISTS uq_deck_cards_one_companion, uq_deck_cards_one_partner_or_background;
--   ALTER TABLE deck_cards DROP CONSTRAINT deck_cards_command_zone_role_check,
--     DROP CONSTRAINT deck_cards_companion_not_commander, DROP CONSTRAINT deck_cards_partner_bg_are_commanders;
--   ALTER TABLE deck_cards DROP COLUMN command_zone_role;
-- (After rows use it, dropping the column loses the roles; a companion would then silently look like a main-deck card.)
--
-- SAFETY: additive only. No DELETE/UPDATE/DROP of data. Existing rows all get NULL, so every constraint holds for them
-- (the CHECKs only bite when the column is non-NULL; the unique indexes are partial on non-NULL roles). ADD COLUMN of a
-- nullable column with no default is a catalog-only change in Postgres (no table rewrite). Adding the CHECKs scans the
-- table once; they are added NOT VALID then VALIDATEd so the lock is brief.
-- RLS: deck_cards already has row-level policies by user_id; a new column inherits them. No new policy, no new grant.
-- Identifier note: this column holds no card identifier (D-003 not engaged).

ALTER TABLE public.deck_cards
  ADD COLUMN IF NOT EXISTS command_zone_role text;

COMMENT ON COLUMN public.deck_cards.command_zone_role IS
  'NULL = ordinary row, or the primary commander (is_commander = true). partner | background = second commander (is_commander must be true). companion = Companion shown beside the commander; never a commander (is_commander false); NOT one of the 100; ignored for colour identity and legality of the other cards. Holds no card identifier.';

ALTER TABLE public.deck_cards
  ADD CONSTRAINT deck_cards_command_zone_role_check
    CHECK (command_zone_role IS NULL OR command_zone_role IN ('partner', 'background', 'companion')) NOT VALID,
  ADD CONSTRAINT deck_cards_companion_not_commander
    CHECK (command_zone_role IS DISTINCT FROM 'companion' OR is_commander IS NOT TRUE) NOT VALID,
  ADD CONSTRAINT deck_cards_partner_bg_are_commanders
    CHECK (command_zone_role IS NULL OR command_zone_role = 'companion' OR is_commander IS TRUE) NOT VALID;

ALTER TABLE public.deck_cards VALIDATE CONSTRAINT deck_cards_command_zone_role_check;
ALTER TABLE public.deck_cards VALIDATE CONSTRAINT deck_cards_companion_not_commander;
ALTER TABLE public.deck_cards VALIDATE CONSTRAINT deck_cards_partner_bg_are_commanders;

-- At most one companion per deck.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deck_cards_one_companion
  ON public.deck_cards (deck_id)
  WHERE command_zone_role = 'companion';

-- At most one second commander (partner OR background) per deck; the primary commander has NULL role.
CREATE UNIQUE INDEX IF NOT EXISTS uq_deck_cards_one_partner_or_background
  ON public.deck_cards (deck_id)
  WHERE command_zone_role IN ('partner', 'background');

-- Index need: both partial unique indexes also serve the only new read ("the roles of this deck") because they are
-- tiny; the deck page already loads all deck_cards for the deck, so no further index is needed.
