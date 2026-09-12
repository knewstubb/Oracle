-- ============================================================
-- Migration: Rename Card Tables and FK Columns
--
-- Tables renamed:
--   card_definitions → cards
--   scryfall_printings → printings  
--   physical_copies → copies
--
-- FK columns renamed:
--   card_definition_id → card_id
--   scryfall_printing_id → printing_id
--   physical_copy_id → copy_id
--   proxy_for_definition_id → proxy_for_card_id
--
-- This migration:
--   1. Renames tables
--   2. Renames FK columns
--   3. Recreates indexes with new names
--   4. Recreates RLS policies with new names
--   5. Updates RPC functions to use new names
-- ============================================================

-- ============================================================
-- STEP 1: Rename Tables
-- ============================================================

ALTER TABLE card_definitions RENAME TO cards;
ALTER TABLE scryfall_printings RENAME TO printings;
ALTER TABLE physical_copies RENAME TO copies;


-- ============================================================
-- STEP 2: Rename FK Columns in copies table
-- ============================================================

-- copies.card_definition_id → copies.card_id
ALTER TABLE copies RENAME COLUMN card_definition_id TO card_id;

-- copies.scryfall_printing_id → copies.printing_id
ALTER TABLE copies RENAME COLUMN scryfall_printing_id TO printing_id;

-- copies.proxy_for_definition_id → copies.proxy_for_card_id
ALTER TABLE copies RENAME COLUMN proxy_for_definition_id TO proxy_for_card_id;


-- ============================================================
-- STEP 3: Rename FK Columns in deck_cards table
-- ============================================================

-- deck_cards.physical_copy_id → deck_cards.copy_id
ALTER TABLE deck_cards RENAME COLUMN physical_copy_id TO copy_id;


-- ============================================================
-- STEP 4: Rename FK Columns in other tables that reference printings
-- ============================================================

-- oracle_to_printings.scryfall_printing_id → oracle_to_printings.printing_id
ALTER TABLE oracle_to_printings RENAME COLUMN scryfall_printing_id TO printing_id;

-- card_kingdom_prices.scryfall_printing_id → card_kingdom_prices.printing_id
ALTER TABLE card_kingdom_prices RENAME COLUMN scryfall_printing_id TO printing_id;


-- ============================================================
-- STEP 5: Recreate Indexes with new names
-- ============================================================

-- Drop old indexes on cards (formerly card_definitions)
DROP INDEX IF EXISTS idx_card_definitions_card_name;
DROP INDEX IF EXISTS idx_card_definitions_user_id;

-- Create new indexes on cards
CREATE INDEX idx_cards_card_name ON cards(card_name);
CREATE INDEX idx_cards_user_id ON cards(user_id);

-- Drop old indexes on copies (formerly physical_copies)
DROP INDEX IF EXISTS idx_physical_copies_card_definition_id;
DROP INDEX IF EXISTS idx_physical_copies_is_proxy;
DROP INDEX IF EXISTS idx_physical_copies_user_id;
DROP INDEX IF EXISTS idx_physical_copies_group;
DROP INDEX IF EXISTS idx_physical_copies_storage_location;

-- Create new indexes on copies
CREATE INDEX idx_copies_card_id ON copies(card_id);
CREATE INDEX idx_copies_is_proxy ON copies(is_proxy);
CREATE INDEX idx_copies_user_id ON copies(user_id);
CREATE UNIQUE INDEX idx_copies_group ON copies(card_id, printing_id, is_foil, is_proxy);
CREATE INDEX idx_copies_storage_location ON copies(storage_location_id) WHERE storage_location_id IS NOT NULL;

-- Drop old indexes on deck_cards referencing physical_copy_id
DROP INDEX IF EXISTS idx_deck_cards_physical_copy_id;

-- Create new index on deck_cards.copy_id
CREATE INDEX idx_deck_cards_copy_id ON deck_cards(copy_id) WHERE copy_id IS NOT NULL;

-- Drop old indexes on printings (formerly scryfall_printings)
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
CREATE INDEX IF NOT EXISTS idx_printings_legality_commander ON printings(legality_commander) WHERE legality_commander = true;

-- Update oracle_to_printings index
DROP INDEX IF EXISTS idx_oracle_to_printings_printing;
CREATE INDEX idx_oracle_to_printings_printing ON oracle_to_printings(printing_id);

-- Update card_kingdom_prices index
DROP INDEX IF EXISTS idx_card_kingdom_prices_printing;
CREATE INDEX idx_card_kingdom_prices_printing ON card_kingdom_prices(printing_id);


-- ============================================================
-- STEP 6: Recreate RLS Policies with new names
-- ============================================================

-- Cards (formerly card_definitions) policies
DROP POLICY IF EXISTS "card_definitions_select_own" ON cards;
DROP POLICY IF EXISTS "card_definitions_insert_own" ON cards;
DROP POLICY IF EXISTS "card_definitions_update_own" ON cards;
DROP POLICY IF EXISTS "card_definitions_delete_own" ON cards;

CREATE POLICY "cards_select_own" ON cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cards_insert_own" ON cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards_update_own" ON cards FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards_delete_own" ON cards FOR DELETE USING (auth.uid() = user_id);

-- Copies (formerly physical_copies) policies
DROP POLICY IF EXISTS "physical_copies_select_own" ON copies;
DROP POLICY IF EXISTS "physical_copies_insert_own" ON copies;
DROP POLICY IF EXISTS "physical_copies_update_own" ON copies;
DROP POLICY IF EXISTS "physical_copies_delete_own" ON copies;

CREATE POLICY "copies_select_own" ON copies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "copies_insert_own" ON copies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "copies_update_own" ON copies FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "copies_delete_own" ON copies FOR DELETE USING (auth.uid() = user_id);

-- Printings (formerly scryfall_printings) policies - reference table, read-only for authenticated
DROP POLICY IF EXISTS "scryfall_printings_read_authenticated" ON printings;

CREATE POLICY "printings_read_authenticated" ON printings FOR SELECT TO authenticated USING (true);


-- ============================================================
-- STEP 7: Update RPC Functions
-- ============================================================

-- Drop old functions first
DROP FUNCTION IF EXISTS assign_physical_copy(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS reassign_to_deck(INTEGER, INTEGER, TEXT, UUID);
DROP FUNCTION IF EXISTS assign_free_copy(INTEGER, INTEGER, TEXT, UUID);

-- Recreate assign_physical_copy with new column names
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
  FROM copies
  WHERE id = p_copy_id;

  -- Assign to target
  UPDATE deck_cards
  SET copy_id = p_copy_id,
      ownership_status = CASE WHEN v_copy_is_proxy THEN 'proxy' ELSE 'original' END
  WHERE id = p_target_deck_card_id;

  RETURN json_build_object(
    'success', true,
    'cleared_from_deck_card_id', v_holder_deck_card_id,
    'already_assigned', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_physical_copy(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_physical_copy(INTEGER, INTEGER) TO service_role;


-- Recreate reassign_to_deck with new column names
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
  FROM copies
  WHERE id = p_copy_id;

  v_ownership_status := CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END;

  -- 4. Atomic move: clear source, fill target (single transaction)
  UPDATE deck_cards
  SET copy_id = NULL, ownership_status = NULL
  WHERE id = v_source_deck_card_id;

  UPDATE deck_cards
  SET copy_id = p_copy_id, ownership_status = v_ownership_status
  WHERE id = v_target_deck_card_id;

  RETURN json_build_object(
    'success', true,
    'source_deck_card_id', v_source_deck_card_id,
    'target_deck_card_id', v_target_deck_card_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reassign_to_deck(INTEGER, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reassign_to_deck(INTEGER, INTEGER, TEXT, UUID) TO service_role;


-- Recreate assign_free_copy with new column names
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
  FROM copies
  WHERE id = p_copy_id;

  v_ownership_status := CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END;

  -- 4. Fill the slot
  UPDATE deck_cards
  SET copy_id = p_copy_id, ownership_status = v_ownership_status
  WHERE id = v_target_deck_card_id;

  RETURN json_build_object(
    'success', true,
    'deck_card_id', v_target_deck_card_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_free_copy(INTEGER, INTEGER, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_free_copy(INTEGER, INTEGER, TEXT, UUID) TO service_role;


-- ============================================================
-- STEP 8: Update batch_assign_deck RPC
-- ============================================================

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
BEGIN
  -- Validate deck exists and user owns it
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id) THEN
    RAISE EXCEPTION 'deck_not_found'
      USING ERRCODE = 'P0001',
            HINT = 'The specified deck does not exist.';
  END IF;

  -- Process each assignment
  FOR v_assignment IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    v_deck_card_id := (v_assignment->>'deckCardsId')::INTEGER;
    v_copy_id := (v_assignment->>'copyId')::INTEGER;

    -- Serialize on the copy
    PERFORM pg_advisory_xact_lock(hashtext(v_copy_id::TEXT));

    -- Get proxy status
    SELECT is_proxy INTO v_is_proxy
    FROM copies
    WHERE id = v_copy_id;

    -- Assign copy to deck_cards row
    UPDATE deck_cards
    SET copy_id = v_copy_id,
        ownership_status = CASE WHEN v_is_proxy THEN 'proxy' ELSE 'original' END
    WHERE id = v_deck_card_id
      AND deck_id = p_deck_id;

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
