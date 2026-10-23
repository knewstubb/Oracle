-- Approved by the owner (Round 18) and moved here from contracts/drafts. Safety re-read done: additive only.
-- Contract: docs/oracle/contracts/import-intent.md §5 and §7.
--
-- Adds ONE new table, deck_card_alerts: "Accounting error" alerts shown on a decklist when an
-- import sleeved a new copy of a card without moving the copy that was already sleeved in this deck.
--
-- Safety: additive only. CREATE TABLE / INDEX / POLICY. No DROP, TRUNCATE, DELETE or UPDATE of
-- existing data. Reversible: DROP TABLE public.deck_card_alerts (it holds only alerts).
-- Rows go away with their deck or deck card (ON DELETE CASCADE) so a deleted deck leaves nothing behind.
-- Writes happen only through the import RPC and the two alert routes (service role + explicit user_id checks,
-- same pattern as every other table; import-row-editing contract §10).

CREATE TABLE IF NOT EXISTS public.deck_card_alerts (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               uuid    NOT NULL,
  deck_id               integer NOT NULL REFERENCES public.decks(id) ON DELETE CASCADE,
  -- The slot in THIS deck that still holds the copy the owner did not move.
  deck_card_id          integer NOT NULL REFERENCES public.deck_cards(id) ON DELETE CASCADE,
  -- The copy that stayed. Kept only so the alert can close itself if that copy leaves the slot.
  copy_id               integer REFERENCES public.user_copies(id) ON DELETE SET NULL,
  card_name             text    NOT NULL,
  -- The deck the new copy was sleeved into. Name is read from decks at display time.
  caused_by_deck_id     integer REFERENCES public.decks(id) ON DELETE SET NULL,
  kind                  text    NOT NULL DEFAULT 'import_move_skipped'
                          CHECK (kind IN ('import_move_skipped')),
  status                text    NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'fixed', 'dismissed')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  CONSTRAINT deck_card_alerts_resolved_chk
    CHECK ((status = 'open' AND resolved_at IS NULL) OR (status <> 'open' AND resolved_at IS NOT NULL))
);

-- At most one OPEN alert per slot (a second skip on the same slot does not stack a duplicate).
CREATE UNIQUE INDEX IF NOT EXISTS deck_card_alerts_one_open_per_slot
  ON public.deck_card_alerts (deck_card_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS deck_card_alerts_deck_open
  ON public.deck_card_alerts (user_id, deck_id) WHERE status = 'open';

ALTER TABLE public.deck_card_alerts ENABLE ROW LEVEL SECURITY;

-- Owner reads own rows. Writes use the service role with explicit user_id checks.
CREATE POLICY deck_card_alerts_select_own ON public.deck_card_alerts
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.deck_card_alerts IS
  'Decklist "Accounting error" alerts raised when an import skipped moving an owned copy. Open until the owner marks Fixed or Dismiss. Contract: docs/oracle/contracts/import-intent.md';

-- The function import_deck_with_intent is specified in contract §5 and is drafted by the Developer to that
-- spec in a second DRAFT file; it needs owner approval separately (it moves copies between decks).
