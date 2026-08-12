-- Add leadership_id to decks table
-- Keeps commander_name for backward compatibility during migration

ALTER TABLE decks 
ADD COLUMN leadership_id UUID REFERENCES deck_leaderships(id) ON DELETE SET NULL;

CREATE INDEX idx_decks_leadership ON decks(leadership_id);

COMMENT ON COLUMN decks.leadership_id IS 'Links to deck_leaderships for partners/backgrounds/oathbreaker support. Replaces commander_name';;
