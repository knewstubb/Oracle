-- STEP 1: Rename storage_locations → locations
ALTER TABLE storage_locations RENAME TO locations;

-- Add type column: 'storage' or 'deck'
ALTER TABLE locations ADD COLUMN type TEXT NOT NULL DEFAULT 'storage';

-- Add deck_id for deck-type locations (FK to decks)
ALTER TABLE locations ADD COLUMN deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE;

-- Add constraint: deck_id required when type='deck', forbidden when type='storage'
ALTER TABLE locations ADD CONSTRAINT locations_type_deck_check 
  CHECK (
    (type = 'storage' AND deck_id IS NULL) OR
    (type = 'deck' AND deck_id IS NOT NULL)
  );

-- Unique constraint: one location per deck
CREATE UNIQUE INDEX idx_locations_deck_id ON locations(deck_id) WHERE deck_id IS NOT NULL;

-- Rename old indexes
DROP INDEX IF EXISTS idx_storage_locations_user;
CREATE INDEX idx_locations_user ON locations(user_id);
CREATE INDEX idx_locations_type ON locations(type);


-- STEP 2: Update RLS policies for locations
DROP POLICY IF EXISTS storage_locations_user_policy ON locations;
DROP POLICY IF EXISTS storage_locations_service_policy ON locations;

CREATE POLICY "locations_select_own" ON locations FOR SELECT 
  USING (user_id = auth.uid());
CREATE POLICY "locations_insert_own" ON locations FOR INSERT 
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "locations_update_own" ON locations FOR UPDATE 
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "locations_delete_own" ON locations FOR DELETE 
  USING (user_id = auth.uid());

-- Service role bypass
CREATE POLICY "locations_service_all" ON locations FOR ALL 
  USING (true) WITH CHECK (true);


-- STEP 3: Create deck locations for existing decks
INSERT INTO locations (name, type, deck_id, user_id, color, sort_order)
SELECT 
  d.name,
  'deck',
  d.id,
  d.user_id,
  '#3B82F6',
  0
FROM decks d
WHERE NOT EXISTS (
  SELECT 1 FROM locations l WHERE l.deck_id = d.id
);


-- STEP 4: Create trigger to auto-create deck locations
CREATE OR REPLACE FUNCTION create_deck_location()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO locations (name, type, deck_id, user_id, color, sort_order)
  VALUES (NEW.name, 'deck', NEW.id, NEW.user_id, '#3B82F6', 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_deck_location
  AFTER INSERT ON decks
  FOR EACH ROW
  EXECUTE FUNCTION create_deck_location();

-- Trigger to update deck location name when deck is renamed
CREATE OR REPLACE FUNCTION update_deck_location_name()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name != OLD.name THEN
    UPDATE locations SET name = NEW.name WHERE deck_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_deck_location_name
  AFTER UPDATE ON decks
  FOR EACH ROW
  EXECUTE FUNCTION update_deck_location_name();


-- STEP 5: Drop old collection table
DROP TABLE IF EXISTS collection CASCADE;


-- STEP 6: Rename copies → collection and adjust schema
ALTER TABLE copies RENAME TO collection;

-- Rename storage_location_id → location_id
ALTER TABLE collection RENAME COLUMN storage_location_id TO location_id;

-- Update FK constraint to reference locations
ALTER TABLE collection DROP CONSTRAINT IF EXISTS copies_storage_location_id_fkey;
ALTER TABLE collection ADD CONSTRAINT collection_location_id_fkey 
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;

-- Replace is_foil with finish
ALTER TABLE collection ADD COLUMN finish TEXT DEFAULT 'nonfoil';
UPDATE collection SET finish = CASE WHEN is_foil THEN 'foil' ELSE 'nonfoil' END;
ALTER TABLE collection DROP COLUMN is_foil;

-- Add new columns
ALTER TABLE collection ADD COLUMN language TEXT DEFAULT 'en';
ALTER TABLE collection ADD COLUMN purchase_price DECIMAL(10, 2);

-- Rename existing FK constraints
ALTER TABLE collection DROP CONSTRAINT IF EXISTS copies_card_id_fkey;
ALTER TABLE collection ADD CONSTRAINT collection_card_id_fkey 
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;

ALTER TABLE collection DROP CONSTRAINT IF EXISTS copies_proxy_for_card_id_fkey;
ALTER TABLE collection ADD CONSTRAINT collection_proxy_for_card_id_fkey 
  FOREIGN KEY (proxy_for_card_id) REFERENCES cards(id) ON DELETE SET NULL;


-- STEP 7: Recreate indexes for collection
DROP INDEX IF EXISTS idx_copies_card_id;
DROP INDEX IF EXISTS idx_copies_is_proxy;
DROP INDEX IF EXISTS idx_copies_user_id;
DROP INDEX IF EXISTS idx_copies_group;
DROP INDEX IF EXISTS idx_copies_storage_location;

CREATE INDEX idx_collection_card_id ON collection(card_id);
CREATE INDEX idx_collection_is_proxy ON collection(is_proxy);
CREATE INDEX idx_collection_user_id ON collection(user_id);
CREATE INDEX idx_collection_location_id ON collection(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_collection_missing ON collection(missing) WHERE missing = true;
CREATE INDEX idx_collection_user_card ON collection(user_id, card_id);
CREATE INDEX idx_collection_source_printing ON collection(user_id, source_tag, printing_id);
CREATE INDEX idx_collection_finish ON collection(finish);


-- STEP 8: Update RLS policies for collection
DROP POLICY IF EXISTS "copies_select_own" ON collection;
DROP POLICY IF EXISTS "copies_insert_own" ON collection;
DROP POLICY IF EXISTS "copies_update_own" ON collection;
DROP POLICY IF EXISTS "copies_delete_own" ON collection;

CREATE POLICY "collection_select_own" ON collection FOR SELECT 
  USING (auth.uid() = user_id);
CREATE POLICY "collection_insert_own" ON collection FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collection_update_own" ON collection FOR UPDATE 
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "collection_delete_own" ON collection FOR DELETE 
  USING (auth.uid() = user_id);


-- STEP 9: Update deck_cards.copy_id FK to reference collection
ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_copy_id_fkey;
ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_copy_id_fkey 
  FOREIGN KEY (copy_id) REFERENCES collection(id) ON DELETE SET NULL;;
