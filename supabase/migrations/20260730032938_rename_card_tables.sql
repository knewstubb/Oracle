-- Rename Tables
ALTER TABLE card_definitions RENAME TO cards;
ALTER TABLE scryfall_printings RENAME TO printings;
ALTER TABLE physical_copies RENAME TO copies;

-- Rename FK Columns in copies table
ALTER TABLE copies RENAME COLUMN card_definition_id TO card_id;
ALTER TABLE copies RENAME COLUMN scryfall_printing_id TO printing_id;
ALTER TABLE copies RENAME COLUMN proxy_for_definition_id TO proxy_for_card_id;

-- Rename FK Columns in deck_cards table
ALTER TABLE deck_cards RENAME COLUMN physical_copy_id TO copy_id;

-- Rename FK Columns in card_kingdom_prices
ALTER TABLE card_kingdom_prices RENAME COLUMN scryfall_printing_id TO printing_id;

-- Drop old indexes on cards
DROP INDEX IF EXISTS idx_card_definitions_card_name;
DROP INDEX IF EXISTS idx_card_definitions_user_id;

-- Create new indexes on cards
CREATE INDEX idx_cards_card_name ON cards(card_name);
CREATE INDEX idx_cards_user_id ON cards(user_id);

-- Drop old indexes on copies
DROP INDEX IF EXISTS idx_physical_copies_card_definition_id;
DROP INDEX IF EXISTS idx_physical_copies_is_proxy;
DROP INDEX IF EXISTS idx_physical_copies_user_id;
DROP INDEX IF EXISTS idx_physical_copies_group;
DROP INDEX IF EXISTS idx_physical_copies_storage_location;

-- Create new indexes on copies
CREATE INDEX idx_copies_card_id ON copies(card_id);
CREATE INDEX idx_copies_is_proxy ON copies(is_proxy);
CREATE INDEX idx_copies_user_id ON copies(user_id);
CREATE INDEX idx_copies_storage_location ON copies(storage_location_id) WHERE storage_location_id IS NOT NULL;

-- Drop old indexes on deck_cards referencing physical_copy_id
DROP INDEX IF EXISTS idx_deck_cards_physical_copy_id;

-- Create new index on deck_cards.copy_id
CREATE INDEX idx_deck_cards_copy_id ON deck_cards(copy_id) WHERE copy_id IS NOT NULL;

-- Drop old indexes on printings
DROP INDEX IF EXISTS idx_scryfall_printings_name;
DROP INDEX IF EXISTS idx_scryfall_printings_oracle_id;
DROP INDEX IF EXISTS idx_scryfall_printings_set_code;
DROP INDEX IF EXISTS idx_scryfall_printings_released_at;
DROP INDEX IF EXISTS idx_scryfall_printings_legality_commander;

-- Create new indexes on printings
CREATE INDEX IF NOT EXISTS idx_printings_name ON printings(name);
CREATE INDEX IF NOT EXISTS idx_printings_oracle_id ON printings(oracle_id);
CREATE INDEX IF NOT EXISTS idx_printings_set_code ON printings(set_code);
CREATE INDEX IF NOT EXISTS idx_printings_released_at ON printings(released_at);
CREATE INDEX IF NOT EXISTS idx_printings_legality_commander ON printings(legality_commander) WHERE legality_commander = 'legal';

-- Update card_kingdom_prices index
DROP INDEX IF EXISTS idx_card_kingdom_prices_printing;
CREATE INDEX idx_card_kingdom_prices_printing ON card_kingdom_prices(printing_id);;
