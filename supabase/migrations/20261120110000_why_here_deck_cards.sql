-- APPLIED to live 2026-11-20 by the owner.
-- Task: card details modal, slice 1 ("Why it's here" line on a deck card). Author: Developer, 2026-11-20.
-- Report: docs/oracle/reports/2026-11-20-developer-card-details-modal-slice-1.md
-- Rehearsal: docs/oracle/reports/evidence/roles-db/test_why.sh and test_chain.sh (throwaway local Postgres; never the hosted project).
-- Base: the live database. Touches no function, no policy, no other table.
--
-- What this does (and only this):
--   deck_cards.why_here : new, nullable text, at most 200 characters (one optional line saying why the card is in the deck).
-- No existing row is changed (every row gets NULL). Row security and the own-row policy that deck_cards already has (20261116100000)
-- cover a new column automatically, so no policy is added. The app writes it only through its own API route, which checks that the
-- deck belongs to the signed-in user.
-- Reversible: supabase/drafts/20261120110000_why_here_deck_cards.rollback.sql (refuses while any why_here text exists).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_cards' AND column_name = 'why_here') THEN
    RAISE EXCEPTION 'why_here already applied (deck_cards.why_here exists)';
  END IF;
END $$;
ALTER TABLE public.deck_cards ADD COLUMN why_here text;
ALTER TABLE public.deck_cards ADD CONSTRAINT deck_cards_why_here_max_200 CHECK (why_here IS NULL OR char_length(why_here) <= 200);
COMMIT;
