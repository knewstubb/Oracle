-- ============================================================================
-- Scryfall Printings Reference Table
-- ============================================================================
-- All MTG card printings from Scryfall bulk data.
-- This is a shared reference table (no user_id) for multi-tenant use.
-- Updated daily via cron to catch new sets and price changes.
-- ============================================================================

CREATE TABLE scryfall_printings (
  -- Primary identifier
  scryfall_id UUID PRIMARY KEY,
  
  -- Card identity
  oracle_id UUID NOT NULL,
  name TEXT NOT NULL,
  
  -- Set/printing info
  set_code TEXT NOT NULL,
  set_name TEXT NOT NULL,
  collector_number TEXT NOT NULL,
  rarity TEXT NOT NULL,
  
  -- Prices (nullable - not all cards have prices)
  price_usd NUMERIC(10, 2),
  price_usd_foil NUMERIC(10, 2),
  price_eur NUMERIC(10, 2),
  price_eur_foil NUMERIC(10, 2),
  
  -- Image URIs (Scryfall CDN URLs)
  image_uri_small TEXT,
  image_uri_normal TEXT,
  image_uri_large TEXT,
  image_uri_art_crop TEXT,
  
  -- Card data (for filtering/display without joining mtg_cards)
  type_line TEXT,
  mana_cost TEXT,
  cmc NUMERIC(5, 2),
  colors TEXT[],
  color_identity TEXT[],
  
  -- Legality
  legality_commander TEXT,
  
  -- Layout info (for DFCs, split cards, etc.)
  layout TEXT,
  
  -- Metadata
  released_at DATE,
  reprint BOOLEAN DEFAULT FALSE,
  digital BOOLEAN DEFAULT FALSE,
  
  -- Sync tracking
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_scryfall_printings_oracle_id ON scryfall_printings(oracle_id);
CREATE INDEX idx_scryfall_printings_name ON scryfall_printings(name);
CREATE INDEX idx_scryfall_printings_set_code ON scryfall_printings(set_code);
CREATE INDEX idx_scryfall_printings_name_set ON scryfall_printings(name, set_code);
CREATE INDEX idx_scryfall_printings_updated_at ON scryfall_printings(updated_at);

-- Index for price lookups (non-null prices only)
CREATE INDEX idx_scryfall_printings_price_usd ON scryfall_printings(price_usd) 
  WHERE price_usd IS NOT NULL;

-- Index for commander-legal cards
CREATE INDEX idx_scryfall_printings_commander_legal ON scryfall_printings(oracle_id) 
  WHERE legality_commander = 'legal';

-- ============================================================================
-- Sync metadata for tracking bulk data updates
-- ============================================================================
INSERT INTO sync_meta (key, value, updated_at)
VALUES ('scryfall_printings_last_sync', NULL, now())
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- RLS Policy (read-only for all authenticated users)
-- ============================================================================
ALTER TABLE scryfall_printings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scryfall_printings_read_authenticated"
  ON scryfall_printings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Helper function: Get cheapest printing for an oracle_id
-- ============================================================================
CREATE OR REPLACE FUNCTION get_cheapest_printing(p_oracle_id UUID)
RETURNS TABLE (
  scryfall_id UUID,
  set_code TEXT,
  set_name TEXT,
  price_usd NUMERIC,
  image_uri_normal TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    sp.scryfall_id,
    sp.set_code,
    sp.set_name,
    sp.price_usd,
    sp.image_uri_normal
  FROM scryfall_printings sp
  WHERE sp.oracle_id = p_oracle_id
    AND sp.price_usd IS NOT NULL
  ORDER BY sp.price_usd ASC
  LIMIT 1;
$$;

-- ============================================================================
-- Helper function: Get all printings for a card name with prices
-- ============================================================================
CREATE OR REPLACE FUNCTION get_printings_by_name(p_name TEXT)
RETURNS TABLE (
  scryfall_id UUID,
  oracle_id UUID,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  rarity TEXT,
  price_usd NUMERIC,
  price_usd_foil NUMERIC,
  image_uri_normal TEXT,
  released_at DATE
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    sp.scryfall_id,
    sp.oracle_id,
    sp.set_code,
    sp.set_name,
    sp.collector_number,
    sp.rarity,
    sp.price_usd,
    sp.price_usd_foil,
    sp.image_uri_normal,
    sp.released_at
  FROM scryfall_printings sp
  WHERE sp.name = p_name
  ORDER BY sp.released_at DESC NULLS LAST;
$$;
