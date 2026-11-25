-- ROLLBACK for 20261122120000_deck_order.draft.sql. NOT APPLIED.
-- Removes: move_decks, the new-deck trigger and its function, the index, the constraint and decks.position. Nothing else.
-- Dropping the column throws away the owner's saved order, so this REFUSES when the saved order differs from A to Z
-- (name, then id) unless the session first runs:  SET oracle.confirm_drop_deck_order = 'yes';
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'position') THEN
    RAISE EXCEPTION 'deck_order is not applied';
  END IF;
  IF COALESCE(current_setting('oracle.confirm_drop_deck_order', true), '') <> 'yes'
     AND EXISTS (
       SELECT 1 FROM (SELECT id, position, row_number() OVER (PARTITION BY user_id ORDER BY name, id) AS rn FROM public.decks) t
        WHERE t.position <> t.rn) THEN
    RAISE EXCEPTION 'cannot roll back: the saved deck order differs from A to Z (set oracle.confirm_drop_deck_order = ''yes'' to discard it)';
  END IF;
END $$;
DROP FUNCTION public.move_decks(uuid, integer[]);
DROP TRIGGER decks_set_position ON public.decks;
DROP FUNCTION public.decks_set_position();
DROP INDEX public.decks_user_position_idx;
ALTER TABLE public.decks DROP CONSTRAINT decks_position_positive;
ALTER TABLE public.decks DROP COLUMN position;
COMMIT;
