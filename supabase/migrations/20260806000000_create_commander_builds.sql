-- Migration: Create commander builds and build cards tables
-- Purpose: Store build-specific card recommendations and deck structure data

-- =============================================================================
-- ref_commander_builds: Known build archetypes per commander
-- =============================================================================
-- Each commander can have multiple valid builds (e.g., Korvold: treasure, lands, tokens)
-- Data synced from EDHREC theme subpages

CREATE TABLE IF NOT EXISTS ref_commander_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commander_id UUID NOT NULL REFERENCES ref_commanders(id) ON DELETE CASCADE,
  
  -- Build identity (archetype + theme combo)
  archetype TEXT,                    -- "aristocrats", "combo", "control", etc.
  theme TEXT,                        -- "treasure", "artifacts", "graveyard", etc.
  edhrec_theme_slug TEXT,            -- Original EDHREC tag, e.g., "treasure-aristocrats"
  
  -- Popularity metrics
  deck_count INTEGER DEFAULT 0,      -- Number of decks with this build
  deck_percentage DECIMAL(5,2),      -- % of commander's total decks
  
  -- Deck structure averages (from EDHREC)
  avg_lands DECIMAL(4,1),            -- Average land count
  avg_ramp DECIMAL(4,1),             -- Average ramp pieces
  avg_draw DECIMAL(4,1),             -- Average card draw pieces
  avg_removal DECIMAL(4,1),          -- Average removal pieces
  avg_wipes DECIMAL(4,1),            -- Average board wipes
  avg_creatures DECIMAL(4,1),        -- Average creature count
  avg_artifacts DECIMAL(4,1),        -- Average artifact count
  avg_enchantments DECIMAL(4,1),     -- Average enchantment count
  avg_instants DECIMAL(4,1),         -- Average instant count
  avg_sorceries DECIMAL(4,1),        -- Average sorcery count
  avg_planeswalkers DECIMAL(4,1),    -- Average planeswalker count
  
  -- Sync metadata
  edhrec_url TEXT,                   -- Full URL to EDHREC theme page
  synced_at TIMESTAMPTZ,             -- Last sync from EDHREC
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure unique builds per commander
  UNIQUE(commander_id, edhrec_theme_slug)
);

-- Indexes for common queries
CREATE INDEX idx_commander_builds_commander ON ref_commander_builds(commander_id);
CREATE INDEX idx_commander_builds_archetype ON ref_commander_builds(archetype);
CREATE INDEX idx_commander_builds_theme ON ref_commander_builds(theme);
CREATE INDEX idx_commander_builds_deck_count ON ref_commander_builds(deck_count DESC);

-- =============================================================================
-- ref_build_cards: Cards specific to each build
-- =============================================================================
-- Build-specific recommendations (different from generic commander recommendations)

CREATE TABLE IF NOT EXISTS ref_build_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES ref_commander_builds(id) ON DELETE CASCADE,
  
  -- Card identity
  card_name TEXT NOT NULL,
  
  -- Synergy metrics (specific to this build)
  synergy_score DECIMAL(6,4),        -- How synergistic with this build (0-1)
  inclusion_rate DECIMAL(6,4),       -- % of decks with this build that include card
  deck_count INTEGER,                -- Number of decks in this build with card
  
  -- Card role in this build
  category TEXT,                     -- "ramp", "draw", "removal", "payoff", "enabler", etc.
  is_staple BOOLEAN DEFAULT FALSE,   -- >50% inclusion rate
  is_signature BOOLEAN DEFAULT FALSE, -- High synergy AND high inclusion (build-defining)
  
  -- Position/ranking
  position INTEGER,                  -- Rank order within category
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure unique cards per build
  UNIQUE(build_id, card_name)
);

-- Indexes for common queries
CREATE INDEX idx_build_cards_build ON ref_build_cards(build_id);
CREATE INDEX idx_build_cards_card_name ON ref_build_cards(card_name);
CREATE INDEX idx_build_cards_category ON ref_build_cards(build_id, category);
CREATE INDEX idx_build_cards_synergy ON ref_build_cards(build_id, synergy_score DESC);
CREATE INDEX idx_build_cards_inclusion ON ref_build_cards(build_id, inclusion_rate DESC);
CREATE INDEX idx_build_cards_staple ON ref_build_cards(build_id, is_staple) WHERE is_staple = TRUE;

-- =============================================================================
-- Add build_id to decks table
-- =============================================================================
-- Links user's deck to a known build (nullable - can be unassigned or custom)

ALTER TABLE decks 
ADD COLUMN IF NOT EXISTS build_id UUID REFERENCES ref_commander_builds(id) ON DELETE SET NULL;

-- Index for finding decks by build
CREATE INDEX IF NOT EXISTS idx_decks_build ON decks(build_id) WHERE build_id IS NOT NULL;

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- ref_commander_builds: Read-only for all authenticated users
ALTER TABLE ref_commander_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ref_commander_builds_read" ON ref_commander_builds
  FOR SELECT TO authenticated USING (true);

-- ref_build_cards: Read-only for all authenticated users  
ALTER TABLE ref_build_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ref_build_cards_read" ON ref_build_cards
  FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE ref_commander_builds IS 'Known build archetypes per commander, synced from EDHREC theme pages';
COMMENT ON TABLE ref_build_cards IS 'Build-specific card recommendations with synergy scores';
COMMENT ON COLUMN ref_commander_builds.archetype IS 'Deck archetype (how it wins): aristocrats, combo, control, etc.';
COMMENT ON COLUMN ref_commander_builds.theme IS 'Deck theme (what it is built from): treasure, artifacts, graveyard, etc.';
COMMENT ON COLUMN ref_build_cards.is_signature IS 'Build-defining card: high synergy AND high inclusion rate';
COMMENT ON COLUMN decks.build_id IS 'Links to known build archetype, detected or user-selected';
