-- Rename tables to ref_ prefix with commander terminology

-- 1. Drop the FK constraint on decks first
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_leadership_id_fkey;

-- 2. Drop FK on commander_insights
ALTER TABLE commander_insights DROP CONSTRAINT IF EXISTS commander_insights_leadership_id_fkey;

-- 3. Drop FK on deck_leadership_cards
ALTER TABLE deck_leadership_cards DROP CONSTRAINT IF EXISTS deck_leadership_cards_leadership_id_fkey;

-- 4. Rename the tables
ALTER TABLE deck_leaderships RENAME TO ref_commanders;
ALTER TABLE deck_leadership_cards RENAME TO ref_commander_cards;
ALTER TABLE commander_insights RENAME TO ref_commander_insights;

-- 5. Rename columns
ALTER TABLE decks RENAME COLUMN leadership_id TO commander_id;
ALTER TABLE ref_commander_cards RENAME COLUMN leadership_id TO commander_id;
ALTER TABLE ref_commander_insights RENAME COLUMN leadership_id TO commander_id;

-- 6. Recreate FK constraints with new names
ALTER TABLE decks 
  ADD CONSTRAINT decks_commander_id_fkey 
  FOREIGN KEY (commander_id) REFERENCES ref_commanders(id) ON DELETE SET NULL;

ALTER TABLE ref_commander_cards 
  ADD CONSTRAINT ref_commander_cards_commander_id_fkey 
  FOREIGN KEY (commander_id) REFERENCES ref_commanders(id) ON DELETE CASCADE;

ALTER TABLE ref_commander_insights 
  ADD CONSTRAINT ref_commander_insights_commander_id_fkey 
  FOREIGN KEY (commander_id) REFERENCES ref_commanders(id) ON DELETE CASCADE;

-- 7. Rename indexes
DROP INDEX IF EXISTS idx_deck_leaderships_canonical_key;
DROP INDEX IF EXISTS idx_deck_leaderships_type;
DROP INDEX IF EXISTS idx_leadership_cards_name;
DROP INDEX IF EXISTS idx_leadership_cards_leadership;
DROP INDEX IF EXISTS idx_decks_leadership;
DROP INDEX IF EXISTS idx_insights_leadership;
DROP INDEX IF EXISTS idx_insights_leadership_type;
DROP INDEX IF EXISTS idx_insights_build;

CREATE INDEX idx_ref_commanders_canonical_key ON ref_commanders(canonical_key);
CREATE INDEX idx_ref_commanders_type ON ref_commanders(leadership_type);
CREATE INDEX idx_ref_commander_cards_name ON ref_commander_cards(card_name);
CREATE INDEX idx_ref_commander_cards_commander ON ref_commander_cards(commander_id);
CREATE INDEX idx_decks_commander ON decks(commander_id);
CREATE INDEX idx_ref_commander_insights_commander ON ref_commander_insights(commander_id);
CREATE INDEX idx_ref_commander_insights_type ON ref_commander_insights(commander_id, insight_type);
CREATE INDEX idx_ref_commander_insights_build ON ref_commander_insights(commander_id, build_variant);;
