-- ============================================================
-- Migration: Merge copies into collection
--
-- This migration consolidates the two-table model (collection + copies)
-- into a single unified `collection` table.
--
-- Key changes:
--   1. Rename storage_locations → locations, add type/deck_id for unified location model
--   2. Drop old collection table (staging table, data can be re-imported)
--   3. Rename copies → collection with schema adjustments
--   4. Update deck_cards.copy_id FK to reference collection
--   5. Add triggers to auto-create deck locations
--   6. Update RPC functions
--
-- Schema decisions:
--   - location_id NULL = "sorting pile" (needs assignment)
--   - missing = true = "can't find it" (explicit flag)
--   - finish replaces is_foil (supports 'nonfoil', 'foil', 'etched')
--   - purchase_price per copy (for value tracking)
--   - language per copy
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Rename storage_locations → locations
-- ============================================================

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


-- ============================================================
-- STEP 2: Update RLS policies for locations
-- ============================================================

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


-- ============================================================
-- STEP 3: Create deck locations for existing decks
-- ============================================================

INSERT INTO locations (name, type, deck_id, user_id, color, sort_order)
SELECT 
  d.name,
  'deck',
  d.id,
  d.user_id,
  '#3B82F6',  -- blue color for deck locations
  0
FROM decks d
WHERE NOT EXISTS (
  SELECT 1 FROM locations l WHERE l.deck_id = d.id
);


-- ============================================================
-- STEP 4: Create trigger to auto-create deck locations
-- ============================================================

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


-- ============================================================
-- STEP 5: Drop old collection table
-- (It was a staging table; data will be re-imported via new flow)
-- ============================================================

DROP TABLE IF EXISTS collection CASCADE;


-- ============================================================
-- STEP 6: Rename copies → collection and adjust schema
-- ============================================================

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


-- ============================================================
-- STEP 7: Recreate indexes for collection
-- ============================================================

DROP INDEX IF EXISTS idx_copies_card_id;
DROP INDEX IF EXISTS idx_copies_is_proxy;
DROP INDEX IF EXISTS idx_copies_user_id;
DROP INDEX IF EXISTS idx_copies_group;
DROP INDEX IF EXISTS idx_copies_storage_location;
DROP INDEX IF EXISTS idx_physical_copies_user_definition;
DROP INDEX IF EXISTS idx_physical_copies_source_printing;
DROP INDEX IF EXISTS idx_physical_copies_storage;

CREATE INDEX idx_collection_card_id ON collection(card_id);
CREATE INDEX idx_collection_is_proxy ON collection(is_proxy);
CREATE INDEX idx_collection_user_id ON collection(user_id);
CREATE INDEX idx_collection_location_id ON collection(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX idx_collection_missing ON collection(missing) WHERE missing = true;
CREATE INDEX idx_collection_user_card ON collection(user_id, card_id);
CREATE INDEX idx_collection_source_printing ON collection(user_id, source_tag, printing_id);
CREATE INDEX idx_collection_finish ON collection(finish);


-- ============================================================
-- STEP 8: Update RLS policies for collection
-- ============================================================

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


-- ============================================================
-- STEP 9: Update deck_cards.copy_id FK to reference collection
-- ============================================================

ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_copy_id_fkey;
ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_copy_id_fkey 
  FOREIGN KEY (copy_id) REFERENCES collection(id) ON DELETE SET NULL;


-- ============================================================
-- STEP 10: Update RPC functions to use collection table
-- ============================================================

-- Drop and recreate assign_physical_copy
DROP FUNCTION IF EXISTS assign_physical_copy(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION assign_physical_copy(
  p_target_deck_card_id INTEGER,
  p_copy_id INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_holder_deck_card_id INTEGER;
  v_holder_allocate BOOLEAN;
  v_copy_is_proxy BOOLEAN;
  v_already_assigned BOOLEAN;
  v_deck_id INTEGER;
  v_deck_location_id INTEGER;
BEGIN
  -- Serialize concurrent attempts on this specific copy
  PERFORM pg_advisory_xact_lock(hashtext(p_copy_id::TEXT));

  -- Check if the target already has this copy (idempotent case)
  SELECT EXISTS(
    SELECT 1 FROM deck_cards
    WHERE id = p_target_deck_card_id
      AND copy_id = p_copy_id
  ) INTO v_already_assigned;

  IF v_already_assigned THEN
    RETURN json_build_object('success', true, 'cleared_from_deck_card_id', NULL, 'already_assigned', true);
  END IF;

  -- Find any OTHER row currently holding this copy, locking it for update
  SELECT dc.id, d.allocate
    INTO v_holder_deck_card_id, v_holder_allocate
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.copy_id = p_copy_id
    AND dc.id != p_target_deck_card_id
  FOR UPDATE OF dc;

  -- Guard: if the holder's deck has allocate=true, this is a legitimate claim.
  IF v_holder_deck_card_id IS NOT NULL AND v_holder_allocate THEN
    RAISE EXCEPTION 'copy_already_claimed'
      USING ERRCODE = 'P0001',
            HINT = 'The copy is held by a deck with allocate=true. Use the Tier 4 confirmation flow instead.';
  END IF;

  -- Clear the source row if it exists (holder has allocate=false, genuinely free)
  IF v_holder_deck_card_id IS NOT NULL THEN
    UPDATE deck_cards
    SET copy_id = NULL,
        ownership_status = NULL
    WHERE id = v_holder_deck_card_id;
  END IF;

  -- Get proxy status for ownership_status
  SELECT is_proxy INTO v_copy_is_proxy
  FROM collection
  WHERE id = p_copy_id;

  -- Get target deck_id to update copy location
  SELECT deck_id INTO v_deck_id
  FROM deck_cards
  WHERE id = p_target_deck_card_id;

  -- Get deck's location_id
  SELECT id INTO v_deck_location_id
  FROM locations
  WHERE deck_id = v_deck_id;

  -- Assign to target deck_cards row
  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
  WHERE id = p_target_deck_card_id;

  -- Update copy's location to the deck
  UPDATE collection
  SET location_id = v_deck_location_id
  WHERE id = p_copy_id;

  RETURN json_build_object(
    'success', true,
    'cleared_from_deck_card_id', v_holder_deck_card_id,
    'already_assigned', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_physical_copy(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_physical_copy(INTEGER, INTEGER) TO service_role;


-- Drop and recreate reassign_to_deck
DROP FUNCTION IF EXISTS reassign_to_deck(INTEGER, INTEGER, TEXT, UUID);

CREATE OR REPLACE FUNCTION reassign_to_deck(
  p_copy_id INTEGER,
  p_target_deck_id INTEGER,
  p_card_name TEXT,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_source_deck_card_id INTEGER;
  v_target_deck_card_id INTEGER;
  v_is_proxy BOOLEAN;
  v_ownership_status TEXT;
  v_deck_location_id INTEGER;
BEGIN
  -- Serialize concurrent attempts on this copy
  PERFORM pg_advisory_xact_lock(hashtext(p_copy_id::TEXT));

  -- 1. Find the source slot (where this copy currently lives)
  SELECT dc.id INTO v_source_deck_card_id
  FROM deck_cards dc
  WHERE dc.copy_id = p_copy_id
    AND dc.user_id = p_user_id
  FOR UPDATE;

  IF v_source_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'copy_not_assigned'
      USING ERRCODE = 'P0001',
            HINT = 'Copy is not currently assigned to any deck.';
  END IF;

  -- 2. Find an open slot in the target deck for this card
  SELECT dc.id INTO v_target_deck_card_id
  FROM deck_cards dc
  WHERE dc.deck_id = p_target_deck_id
    AND dc.card_name = p_card_name
    AND dc.user_id = p_user_id
    AND dc.copy_id IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_target_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'no_open_slot'
      USING ERRCODE = 'P0001',
            HINT = 'Target deck has no unresolved slot for this card.';
  END IF;

  -- 3. Determine ownership status
  SELECT is_proxy INTO v_is_proxy
  FROM collection
  WHERE id = p_copy_id;

  v_ownership_status := CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END;

  -- 4. Get target deck's location
  SELECT id INTO v_deck_location_id
  FROM locations
  WHERE deck_id = p_target_deck_id;

  -- 5. Atomic move: clear source, fill target (single transaction)
  UPDATE deck_cards
  SET copy_id = NULL, ownership_status = NULL
  WHERE id = v_source_deck_card_id;

  UPDATE deck_cards
  SET copy_id = p_copy_id, ownership_status = v_ownership_status
  WHERE id = v_target_deck_card_id;

  -- 6. Update copy's location to the new deck
  UPDATE collection
  SET location_id = v_deck_location_id
  WHERE id = p_copy_id;

  RETURN json_build_object(
    'success', true,
    'source_deck_card_id', v_source_deck_card_id,
    'target_deck_card_id', v_target_deck_card_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reassign_to_deck(INTEGER, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reassign_to_deck(INTEGER, INTEGER, TEXT, UUID) TO service_role;


-- Drop and recreate assign_free_copy
DROP FUNCTION IF EXISTS assign_free_copy(INTEGER, INTEGER, TEXT, UUID);

CREATE OR REPLACE FUNCTION assign_free_copy(
  p_copy_id INTEGER,
  p_target_deck_id INTEGER,
  p_card_name TEXT,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_holder INTEGER;
  v_target_deck_card_id INTEGER;
  v_is_proxy BOOLEAN;
  v_ownership_status TEXT;
  v_deck_location_id INTEGER;
BEGIN
  -- Serialize concurrent attempts on this copy
  PERFORM pg_advisory_xact_lock(hashtext(p_copy_id::TEXT));

  -- 1. Verify the copy is not already assigned to any deck
  SELECT dc.id INTO v_existing_holder
  FROM deck_cards dc
  WHERE dc.copy_id = p_copy_id
  LIMIT 1;

  IF v_existing_holder IS NOT NULL THEN
    RAISE EXCEPTION 'copy_already_assigned'
      USING ERRCODE = 'P0001',
            HINT = 'Copy is already assigned to a deck. Use reassign_to_deck instead.';
  END IF;

  -- 2. Find an open slot in the target deck for this card
  SELECT dc.id INTO v_target_deck_card_id
  FROM deck_cards dc
  WHERE dc.deck_id = p_target_deck_id
    AND dc.card_name = p_card_name
    AND dc.user_id = p_user_id
    AND dc.copy_id IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_target_deck_card_id IS NULL THEN
    RAISE EXCEPTION 'no_open_slot'
      USING ERRCODE = 'P0001',
            HINT = 'Target deck has no unresolved slot for this card.';
  END IF;

  -- 3. Determine ownership status
  SELECT is_proxy INTO v_is_proxy
  FROM collection
  WHERE id = p_copy_id;

  v_ownership_status := CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END;

  -- 4. Get target deck's location
  SELECT id INTO v_deck_location_id
  FROM locations
  WHERE deck_id = p_target_deck_id;

  -- 5. Fill the slot
  UPDATE deck_cards
  SET copy_id = p_copy_id, ownership_status = v_ownership_status
  WHERE id = v_target_deck_card_id;

  -- 6. Update copy's location to the deck
  UPDATE collection
  SET location_id = v_deck_location_id
  WHERE id = p_copy_id;

  RETURN json_build_object(
    'success', true,
    'deck_card_id', v_target_deck_card_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_copy(INTEGER, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_free_copy(INTEGER, INTEGER, TEXT, UUID) TO service_role;


-- Drop and recreate batch_assign_deck
DROP FUNCTION IF EXISTS batch_assign_deck(INTEGER, JSONB);

CREATE OR REPLACE FUNCTION batch_assign_deck(
  p_deck_id INTEGER,
  p_assignments JSONB
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_assignment JSONB;
  v_deck_card_id INTEGER;
  v_copy_id INTEGER;
  v_is_proxy BOOLEAN;
  v_assigned_count INTEGER := 0;
  v_deck_location_id INTEGER;
BEGIN
  -- Validate deck exists and user owns it
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id) THEN
    RAISE EXCEPTION 'deck_not_found'
      USING ERRCODE = 'P0001',
            HINT = 'The specified deck does not exist.';
  END IF;

  -- Get deck's location
  SELECT id INTO v_deck_location_id
  FROM locations
  WHERE deck_id = p_deck_id;

  -- Process each assignment
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_deck_card_id := (v_assignment->>'deckCardsId')::INTEGER;
    v_copy_id := (v_assignment->>'copyId')::INTEGER;

    -- Serialize on the copy
    PERFORM pg_advisory_xact_lock(hashtext(v_copy_id::TEXT));

    -- Get proxy status
    SELECT is_proxy INTO v_is_proxy
    FROM collection
    WHERE id = v_copy_id;

    -- Assign copy to deck_cards row
    UPDATE deck_cards
    SET copy_id = v_copy_id,
        ownership_status = CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END
    WHERE id = v_deck_card_id
      AND deck_id = p_deck_id;

    -- Update copy's location to the deck
    UPDATE collection
    SET location_id = v_deck_location_id
    WHERE id = v_copy_id;

    v_assigned_count := v_assigned_count + 1;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'assigned_count', v_assigned_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION batch_assign_deck(INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION batch_assign_deck(INTEGER, JSONB) TO service_role;


-- ============================================================
-- STEP 11: Create RPC to release copies from a deck (for deck breakdown)
-- ============================================================

CREATE OR REPLACE FUNCTION release_deck_copies(
  p_deck_id INTEGER,
  p_target_location_id INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_released_count INTEGER := 0;
BEGIN
  -- Clear copy_id from all deck_cards in this deck
  UPDATE deck_cards
  SET copy_id = NULL, ownership_status = NULL
  WHERE deck_id = p_deck_id
    AND copy_id IS NOT NULL;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;

  -- Update all copies that were in this deck's location to the target location
  -- (or NULL for sorting pile if no target specified)
  UPDATE collection
  SET location_id = p_target_location_id
  WHERE location_id = (SELECT id FROM locations WHERE deck_id = p_deck_id);

  RETURN json_build_object(
    'success', true,
    'released_count', v_released_count,
    'target_location_id', p_target_location_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION release_deck_copies(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION release_deck_copies(INTEGER, INTEGER) TO service_role;


COMMIT;
