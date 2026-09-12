-- Migration 013: Phase 0 — Deck Lifecycle Schema Changes
--
-- 1. Replace decks.status CHECK constraint with new lifecycle values
-- 2. Add decks.allocate column
-- 3. Add partial unique index on deck_cards.physical_copy_id
--
-- No data migration needed — database is being wiped clean.

BEGIN;

-- Step 1: Replace status constraint
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_status_check;
ALTER TABLE decks ADD CONSTRAINT decks_status_check
  CHECK (status IN ('brew', 'boxed', 'archived'));

-- Step 2: Change default from 'active' to 'brew'
ALTER TABLE decks ALTER COLUMN status SET DEFAULT 'brew';

-- Step 3: Add allocate column
ALTER TABLE decks ADD COLUMN allocate BOOLEAN NOT NULL DEFAULT false;

-- Step 4: Partial unique index — prevents same physical copy claimed by two deck_cards rows
CREATE UNIQUE INDEX idx_deck_cards_unique_physical_copy
  ON deck_cards(physical_copy_id)
  WHERE physical_copy_id IS NOT NULL;

COMMIT;
