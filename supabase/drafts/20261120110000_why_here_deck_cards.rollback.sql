-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261120110000_why_here_deck_cards.draft.sql. Drops the constraint and the column deck_cards.why_here. Removes nothing else.
-- Refuses (changes nothing) while any deck card has a why_here text, because it would be lost.
-- To discard the texts on purpose, first run in the same session:  SET oracle.rollback_allow_data_loss = 'yes';
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_cards' AND column_name = 'why_here') THEN
    RAISE EXCEPTION 'why_here is not applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_cards WHERE why_here IS NOT NULL) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: a deck card has a why_here text (clear them first, or set oracle.rollback_allow_data_loss = ''yes'' in this session)';
  END IF;
END $$;
ALTER TABLE public.deck_cards DROP CONSTRAINT deck_cards_why_here_max_200;
ALTER TABLE public.deck_cards DROP COLUMN why_here;
COMMIT;
