-- import_sleeve_claims: durable, provisional record of an Active-import sleeve
-- intent for a single deck slot, keyed to the exact wanted printing.
--
-- WHY: initial import of multiple Active decks that each list a card the user
-- owns once must express "all N decks sleeve this" WITHOUT assigning the same
-- user_copies row to N deck_cards.copy_id slots (which the one-copy-one-slot
-- invariant forbids). Claims may legally overlap on a printing during the
-- reconciliation window; real copy_id assignment happens only when a printing
-- is not over-committed (auto-finalized) or after the user resolves the excess.
-- Steady-state allocation code reads copy_id only and never sees this table, so
-- it never observes an impossible state.
CREATE TABLE IF NOT EXISTS public.import_sleeve_claims (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid    NOT NULL,
  deck_id       integer NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  deck_cards_id integer NOT NULL REFERENCES public.deck_cards(id) ON DELETE CASCADE,
  card_name     text    NOT NULL,
  printing_id   text,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT import_sleeve_claims_slot_unique UNIQUE (deck_cards_id)
);

CREATE INDEX IF NOT EXISTS idx_import_sleeve_claims_user_printing
  ON public.import_sleeve_claims (user_id, printing_id);
CREATE INDEX IF NOT EXISTS idx_import_sleeve_claims_user_card
  ON public.import_sleeve_claims (user_id, card_name);
CREATE INDEX IF NOT EXISTS idx_import_sleeve_claims_deck
  ON public.import_sleeve_claims (deck_id);;
