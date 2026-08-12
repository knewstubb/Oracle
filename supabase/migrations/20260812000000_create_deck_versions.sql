-- Migration: Create deck_versions table for version history
-- Captures snapshots of deck state at significant moments

-- Table: deck_versions
-- Stores snapshots of deck card lists at specific points in time.
-- Each version captures the full card list as JSONB for efficient storage
-- and easy comparison between versions.

CREATE TABLE deck_versions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Version metadata
  version_number INTEGER NOT NULL,
  version_name TEXT, -- Optional user-provided name (e.g., "Pre-MH3 update")
  
  -- Snapshot trigger
  trigger_type TEXT NOT NULL CHECK(trigger_type IN (
    'manual',        -- User-initiated snapshot
    'import',        -- After deck import/reimport
    'bulk_change',   -- After bulk operation (5+ cards changed)
    'session_end',   -- Auto-snapshot at end of editing session
    'milestone'      -- Card count milestones (60, 80, 99, 100)
  )),
  trigger_details TEXT, -- Additional context (e.g., "Bulk removed 12 cards")
  
  -- Card list snapshot
  -- JSONB array of: { card_name, quantity, categories, scryfall_id, set_code, is_commander }
  cards_snapshot JSONB NOT NULL,
  
  -- Summary stats for quick display
  card_count INTEGER NOT NULL,
  creature_count INTEGER DEFAULT 0,
  land_count INTEGER DEFAULT 0,
  
  -- Diff from previous version (computed on insert)
  -- JSONB: { added: [...], removed: [...], changed: [...] }
  diff_from_previous JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_deck_versions_deck_id ON deck_versions(deck_id);
CREATE INDEX idx_deck_versions_user_id ON deck_versions(user_id);
CREATE INDEX idx_deck_versions_deck_version ON deck_versions(deck_id, version_number DESC);
CREATE INDEX idx_deck_versions_created_at ON deck_versions(deck_id, created_at DESC);

-- Unique constraint: one version number per deck
CREATE UNIQUE INDEX idx_deck_versions_unique_version ON deck_versions(deck_id, version_number);

-- Function to get the next version number for a deck
CREATE OR REPLACE FUNCTION get_next_deck_version_number(p_deck_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) INTO v_max
  FROM deck_versions
  WHERE deck_id = p_deck_id;
  
  RETURN v_max + 1;
END;
$$;

-- Function to compute diff between two card snapshots
CREATE OR REPLACE FUNCTION compute_card_diff(
  p_old_snapshot JSONB,
  p_new_snapshot JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_added JSONB := '[]'::JSONB;
  v_removed JSONB := '[]'::JSONB;
  v_changed JSONB := '[]'::JSONB;
  v_old_card RECORD;
  v_new_card RECORD;
  v_old_map JSONB := '{}'::JSONB;
  v_new_map JSONB := '{}'::JSONB;
BEGIN
  -- Build maps keyed by card_name for comparison
  FOR v_old_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_old_snapshot, '[]'::JSONB)) AS card
  LOOP
    v_old_map := v_old_map || jsonb_build_object(v_old_card.card->>'card_name', v_old_card.card);
  END LOOP;
  
  FOR v_new_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_snapshot, '[]'::JSONB)) AS card
  LOOP
    v_new_map := v_new_map || jsonb_build_object(v_new_card.card->>'card_name', v_new_card.card);
  END LOOP;
  
  -- Find added cards (in new but not in old)
  FOR v_new_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_snapshot, '[]'::JSONB)) AS card
  LOOP
    IF NOT v_old_map ? (v_new_card.card->>'card_name') THEN
      v_added := v_added || jsonb_build_array(v_new_card.card->>'card_name');
    END IF;
  END LOOP;
  
  -- Find removed cards (in old but not in new)
  FOR v_old_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_old_snapshot, '[]'::JSONB)) AS card
  LOOP
    IF NOT v_new_map ? (v_old_card.card->>'card_name') THEN
      v_removed := v_removed || jsonb_build_array(v_old_card.card->>'card_name');
    END IF;
  END LOOP;
  
  -- Find changed cards (quantity or category changed)
  FOR v_new_card IN SELECT * FROM jsonb_array_elements(COALESCE(p_new_snapshot, '[]'::JSONB)) AS card
  LOOP
    IF v_old_map ? (v_new_card.card->>'card_name') THEN
      DECLARE
        v_old_entry JSONB := v_old_map->(v_new_card.card->>'card_name');
      BEGIN
        IF (v_old_entry->>'quantity') IS DISTINCT FROM (v_new_card.card->>'quantity') OR
           (v_old_entry->>'categories') IS DISTINCT FROM (v_new_card.card->>'categories') THEN
          v_changed := v_changed || jsonb_build_array(v_new_card.card->>'card_name');
        END IF;
      END;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'added', v_added,
    'removed', v_removed,
    'changed', v_changed,
    'added_count', jsonb_array_length(v_added),
    'removed_count', jsonb_array_length(v_removed),
    'changed_count', jsonb_array_length(v_changed)
  );
END;
$$;

-- Function to create a deck version snapshot
CREATE OR REPLACE FUNCTION create_deck_version(
  p_deck_id INTEGER,
  p_user_id UUID,
  p_trigger_type TEXT,
  p_trigger_details TEXT DEFAULT NULL,
  p_version_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_version_number INTEGER;
  v_cards_snapshot JSONB;
  v_card_count INTEGER;
  v_creature_count INTEGER;
  v_land_count INTEGER;
  v_previous_snapshot JSONB;
  v_diff JSONB;
  v_new_version_id INTEGER;
BEGIN
  -- Verify deck exists and belongs to user
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'deck_not_found';
  END IF;
  
  -- Get next version number
  v_version_number := get_next_deck_version_number(p_deck_id);
  
  -- Build cards snapshot
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'card_name', card_name,
        'quantity', COALESCE(quantity, 1),
        'categories', categories,
        'scryfall_id', scryfall_id,
        'set_code', set_code,
        'is_commander', COALESCE(is_commander, false)
      ) ORDER BY card_name
    ),
    COUNT(*),
    COUNT(*) FILTER (WHERE categories ILIKE '%creature%'),
    COUNT(*) FILTER (WHERE categories ILIKE '%land%')
  INTO v_cards_snapshot, v_card_count, v_creature_count, v_land_count
  FROM deck_cards
  WHERE deck_id = p_deck_id;
  
  -- Handle empty deck
  IF v_cards_snapshot IS NULL THEN
    v_cards_snapshot := '[]'::JSONB;
    v_card_count := 0;
    v_creature_count := 0;
    v_land_count := 0;
  END IF;
  
  -- Get previous version's snapshot for diff
  SELECT cards_snapshot INTO v_previous_snapshot
  FROM deck_versions
  WHERE deck_id = p_deck_id
  ORDER BY version_number DESC
  LIMIT 1;
  
  -- Compute diff from previous
  v_diff := compute_card_diff(v_previous_snapshot, v_cards_snapshot);
  
  -- Insert the new version
  INSERT INTO deck_versions (
    deck_id,
    user_id,
    version_number,
    version_name,
    trigger_type,
    trigger_details,
    cards_snapshot,
    card_count,
    creature_count,
    land_count,
    diff_from_previous
  )
  VALUES (
    p_deck_id,
    p_user_id,
    v_version_number,
    p_version_name,
    p_trigger_type,
    p_trigger_details,
    v_cards_snapshot,
    v_card_count,
    v_creature_count,
    v_land_count,
    v_diff
  )
  RETURNING id INTO v_new_version_id;
  
  RETURN json_build_object(
    'success', true,
    'version_id', v_new_version_id,
    'version_number', v_version_number,
    'card_count', v_card_count,
    'diff', v_diff
  );
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE deck_versions IS 'Stores snapshots of deck card lists for version history';
COMMENT ON COLUMN deck_versions.trigger_type IS 'What caused this snapshot: manual, import, bulk_change, session_end, milestone';
COMMENT ON COLUMN deck_versions.cards_snapshot IS 'JSONB array of card objects with name, quantity, categories, etc.';
COMMENT ON COLUMN deck_versions.diff_from_previous IS 'Computed diff showing added, removed, and changed cards';
COMMENT ON FUNCTION create_deck_version IS 'Creates a new version snapshot for a deck with automatic diff computation';
