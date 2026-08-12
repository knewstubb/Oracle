-- Rename global reference tables
ALTER TABLE mtg_cards RENAME TO ref_cards;
ALTER TABLE printings RENAME TO ref_printings;

-- Rename user-scoped tables
ALTER TABLE cards RENAME TO user_cards;
ALTER TABLE collection RENAME TO user_copies;
ALTER TABLE locations RENAME TO user_locations;

-- Update indexes on ref_printings (formerly printings)
DROP INDEX IF EXISTS idx_printings_name;
DROP INDEX IF EXISTS idx_printings_oracle_id;
DROP INDEX IF EXISTS idx_printings_set_code;
DROP INDEX IF EXISTS idx_printings_released_at;
DROP INDEX IF EXISTS idx_printings_legality_commander;
CREATE INDEX idx_ref_printings_name ON ref_printings(name);
CREATE INDEX idx_ref_printings_oracle_id ON ref_printings(oracle_id);
CREATE INDEX idx_ref_printings_set_code ON ref_printings(set_code);
CREATE INDEX idx_ref_printings_released_at ON ref_printings(released_at);
CREATE INDEX idx_ref_printings_legality_commander ON ref_printings(legality_commander) WHERE legality_commander = 'legal';

-- Update indexes on user_cards (formerly cards)
DROP INDEX IF EXISTS idx_cards_card_name;
DROP INDEX IF EXISTS idx_cards_user_id;
CREATE INDEX idx_user_cards_card_name ON user_cards(card_name);
CREATE INDEX idx_user_cards_user_id ON user_cards(user_id);

-- Update indexes on user_copies (formerly collection)
DROP INDEX IF EXISTS idx_collection_card_id;
DROP INDEX IF EXISTS idx_collection_is_proxy;
DROP INDEX IF EXISTS idx_collection_user_id;
DROP INDEX IF EXISTS idx_collection_location_id;
DROP INDEX IF EXISTS idx_collection_missing;
DROP INDEX IF EXISTS idx_collection_user_card;
DROP INDEX IF EXISTS idx_collection_source_printing;
DROP INDEX IF EXISTS idx_collection_finish;
CREATE INDEX idx_user_copies_card_id ON user_copies(card_id);
CREATE INDEX idx_user_copies_is_proxy ON user_copies(is_proxy);
CREATE INDEX idx_user_copies_user_id ON user_copies(user_id);
CREATE INDEX idx_user_copies_location_id ON user_copies(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_user_copies_missing ON user_copies(missing) WHERE missing = true;
CREATE INDEX idx_user_copies_user_card ON user_copies(user_id, card_id);
CREATE INDEX idx_user_copies_source_printing ON user_copies(user_id, source_tag, printing_id);
CREATE INDEX idx_user_copies_finish ON user_copies(finish);

-- Update indexes on user_locations (formerly locations)
DROP INDEX IF EXISTS idx_locations_user;
DROP INDEX IF EXISTS idx_locations_type;
DROP INDEX IF EXISTS idx_locations_deck_id;
CREATE INDEX idx_user_locations_user ON user_locations(user_id);
CREATE INDEX idx_user_locations_type ON user_locations(type);
CREATE UNIQUE INDEX idx_user_locations_deck_id ON user_locations(deck_id) WHERE deck_id IS NOT NULL;

-- Update FK constraints on user_copies
ALTER TABLE user_copies DROP CONSTRAINT IF EXISTS collection_card_id_fkey;
ALTER TABLE user_copies DROP CONSTRAINT IF EXISTS collection_proxy_for_card_id_fkey;
ALTER TABLE user_copies DROP CONSTRAINT IF EXISTS collection_location_id_fkey;
ALTER TABLE user_copies ADD CONSTRAINT user_copies_card_id_fkey FOREIGN KEY (card_id) REFERENCES user_cards(id) ON DELETE CASCADE;
ALTER TABLE user_copies ADD CONSTRAINT user_copies_proxy_for_card_id_fkey FOREIGN KEY (proxy_for_card_id) REFERENCES user_cards(id) ON DELETE SET NULL;
ALTER TABLE user_copies ADD CONSTRAINT user_copies_location_id_fkey FOREIGN KEY (location_id) REFERENCES user_locations(id) ON DELETE SET NULL;

-- Update FK constraint on deck_cards
ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_copy_id_fkey;
ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES user_copies(id) ON DELETE SET NULL;

-- Update FK constraint on user_locations
ALTER TABLE user_locations DROP CONSTRAINT IF EXISTS locations_deck_id_fkey;
ALTER TABLE user_locations ADD CONSTRAINT user_locations_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE;

-- Update trigger function to use new table name
CREATE OR REPLACE FUNCTION create_deck_location()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_locations (name, type, deck_id, user_id, color, sort_order)
  VALUES (NEW.name, 'deck', NEW.id, NEW.user_id, '#3B82F6', 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_deck_location_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name != OLD.name THEN
    UPDATE user_locations SET name = NEW.name WHERE deck_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;;
