-- Migration: Create ref_precons table for commander precon metadata
-- This stores official commander preconstructed deck metadata for the import UI

-- Enable trigram extension for text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE ref_precons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identifying info
  name TEXT NOT NULL,                    -- "Eldrazi Unbound" or "Duskmourn: Endless Abyss - Valgavoth"
  set_code TEXT NOT NULL,                -- Scryfall set code, e.g., "c24", "otp"
  set_name TEXT NOT NULL,                -- Full set name, e.g., "Commander 2024"
  
  -- Commander info
  commander_name TEXT,                   -- Primary commander name
  commander_scryfall_id UUID,            -- Scryfall ID for the commander card
  color_identity TEXT,                   -- Color identity string, e.g., "WUB", "WUBRG"
  
  -- Metadata
  release_date DATE,                     -- When the precon was released
  card_count INTEGER DEFAULT 100,        -- Number of cards in the deck
  
  -- Source for importing the decklist
  archidekt_url TEXT,                    -- Archidekt URL for this precon's decklist
  moxfield_url TEXT,                     -- Moxfield URL for this precon's decklist
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure unique precons per set
  UNIQUE(set_code, name)
);

-- Index for searching by name
CREATE INDEX idx_ref_precons_name ON ref_precons USING gin (name gin_trgm_ops);

-- Index for filtering by set
CREATE INDEX idx_ref_precons_set_code ON ref_precons(set_code);

-- Index for filtering by release date (newest first)
CREATE INDEX idx_ref_precons_release_date ON ref_precons(release_date DESC);

-- Index for filtering by color identity
CREATE INDEX idx_ref_precons_color_identity ON ref_precons(color_identity);

-- Enable RLS
ALTER TABLE ref_precons ENABLE ROW LEVEL SECURITY;

-- Public read access (reference data)
CREATE POLICY "ref_precons_read_authenticated"
  ON ref_precons FOR SELECT
  TO authenticated
  USING (true);

-- Add comment
COMMENT ON TABLE ref_precons IS 'Reference table of official commander preconstructed decks for the import UI';
