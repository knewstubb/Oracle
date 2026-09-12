-- Migration: Rename deck statuses
-- brew → brewing, boxed → in_rotation, archived → graveyard

-- 1. Drop existing CHECK constraint
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_status_check;

-- 2. Update existing data
UPDATE decks SET status = 'brewing' WHERE status = 'brew';
UPDATE decks SET status = 'in_rotation' WHERE status = 'boxed';
UPDATE decks SET status = 'graveyard' WHERE status = 'archived';

-- 3. Add new CHECK constraint
ALTER TABLE decks ADD CONSTRAINT decks_status_check CHECK (status IN ('brewing', 'in_rotation', 'graveyard'));

-- 4. Update default
ALTER TABLE decks ALTER COLUMN status SET DEFAULT 'brewing';;
