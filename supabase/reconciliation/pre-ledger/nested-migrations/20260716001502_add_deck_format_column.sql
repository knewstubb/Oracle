ALTER TABLE decks ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'commander';
CREATE INDEX IF NOT EXISTS idx_decks_format ON decks(format);;
