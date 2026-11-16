-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves.
-- Contract: docs/oracle/contracts/know-where-cards-are.md (sections 3.2 and 5). Build slice 3 or later.
-- Depends on: 20261113100000_copy_in_hand_and_missing_since.sql (separate file, separate approval).
--
-- Adds ONE new table, move_items: one row per card move on a combined checklist, so ticks survive a
-- reload, a phone/laptop switch, and stopping half-way. It holds the plan and the audit trail
-- ("found" / "placed" / "can't find it"), not the card's current location (that stays on user_copies / deck_cards).
-- The RPCs that write it (create_move_list, mark_move_found, mark_move_placed, mark_move_cant_find,
-- undo_move_tick, resolve_missing_copy, cancel_move_item) are specified in the contract; their bodies are
-- written by the Developer in the build slices, each in its own migration.
--
-- Safety: additive only. CREATE TABLE / INDEX / POLICY. No DROP, TRUNCATE or UPDATE of existing data.
-- Reversible: DROP TABLE public.move_items (it holds only checklist rows; no card is ever stored only here).
-- Deleting a deck, location or copy never deletes a move row (SET NULL), so the audit trail survives.

CREATE TABLE IF NOT EXISTS public.move_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             uuid    NOT NULL,
  -- Groups the rows of one checklist. Created by create_move_list.
  list_id             uuid    NOT NULL,
  -- The exact physical copy (user_copies.id). A copy, not a card identity (D-001, D-021).
  copy_id             integer REFERENCES public.user_copies(id) ON DELETE SET NULL,
  -- Snapshot for display after the copy is gone. Name only; not an identifier (D-003).
  card_name           text    NOT NULL,
  -- Where the card was when the item was made. Exactly one of the two is set.
  from_deck_id        integer REFERENCES public.decks(id) ON DELETE SET NULL,
  -- The exact slot the copy sat in, so Undo puts it back in the same slot (never into a slot filled since).
  from_deck_card_id   integer REFERENCES public.deck_cards(id) ON DELETE SET NULL,
  from_location_id    integer REFERENCES public.user_locations(id) ON DELETE SET NULL,
  -- Where it should go. Exactly one of the two is set. A deck target is a planned slot (deck_cards.id).
  to_deck_card_id     integer REFERENCES public.deck_cards(id) ON DELETE SET NULL,
  to_deck_id          integer REFERENCES public.decks(id) ON DELETE SET NULL,
  to_location_id      integer REFERENCES public.user_locations(id) ON DELETE SET NULL,
  state               text    NOT NULL DEFAULT 'to_find'
                        CHECK (state IN ('to_find', 'found', 'placed', 'missing', 'cancelled')),
  -- Places already checked after "Can't find it": [{ "kind": "deck"|"location", "id": 12 }]
  looked_in           jsonb   NOT NULL DEFAULT '[]'::jsonb,
  -- Who made the item: 'manual' (owner built the list), 'import' (put-away after an import), 'ai' (suggested, owner confirmed).
  source              text    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import', 'ai')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  found_at            timestamptz,
  placed_at           timestamptz,
  missing_at          timestamptz,
  cancelled_at        timestamptz,
  CONSTRAINT move_items_one_from CHECK (num_nonnulls(from_deck_id, from_location_id) <= 1),
  CONSTRAINT move_items_one_to   CHECK (num_nonnulls(to_deck_id, to_location_id) = 1),
  CONSTRAINT move_items_slot_needs_deck CHECK (to_deck_card_id IS NULL OR to_deck_id IS NOT NULL)
);

-- A copy can be on at most one open checklist item at a time (no two lists fighting over one card).
CREATE UNIQUE INDEX IF NOT EXISTS move_items_one_open_per_copy
  ON public.move_items (copy_id) WHERE state IN ('to_find', 'found') AND copy_id IS NOT NULL;
-- Loading a checklist: all rows of a list, grouped by place.
CREATE INDEX IF NOT EXISTS move_items_user_list ON public.move_items (user_id, list_id);
-- "What is still open?" for the home banner and the In your hand page.
CREATE INDEX IF NOT EXISTS move_items_user_open ON public.move_items (user_id, state) WHERE state IN ('to_find', 'found');

ALTER TABLE public.move_items ENABLE ROW LEVEL SECURITY;

-- Owner reads own rows. Writes use the service role through the RPCs, with explicit user_id checks
-- (same pattern as chat_card_proposals and the placement RPCs). Multi-user safe: every row has user_id.
CREATE POLICY move_items_select_own ON public.move_items
  FOR SELECT USING (user_id = auth.uid());

COMMENT ON TABLE public.move_items IS
  'Combined move checklist rows (Know where cards are, phase 3). Plan + audit only; current location lives on user_copies / deck_cards. Contract: docs/oracle/contracts/know-where-cards-are.md';
