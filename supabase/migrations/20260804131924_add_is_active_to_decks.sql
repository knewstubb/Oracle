-- Migration: Add is_active boolean to decks table
-- Replaces the brewing/in_rotation/graveyard status lifecycle with a simple boolean toggle.
-- Active decks appear at the top of the decks page; all decks claim their allocated cards equally.

-- Step 1: Add is_active column with default false
ALTER TABLE decks ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: Migrate existing data
-- in_rotation decks become active (these are the user's "ready to play" decks)
UPDATE decks SET is_active = TRUE WHERE status = 'in_rotation';

-- brewing and graveyard decks remain is_active = FALSE (the default)

-- Note: We keep the status column for now (rollback safety), but it will no longer
-- be used by the application. A future migration can drop it once confirmed stable.

-- Step 3: Add index for efficient filtering of active decks
CREATE INDEX IF NOT EXISTS idx_decks_is_active ON decks(is_active) WHERE is_active = TRUE;
