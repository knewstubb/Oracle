-- Migration: Create taxonomy system for commander/card synergy tracking
-- 
-- This creates:
-- 1. ref_taxonomy - canonical list of archetypes, mechanics, tribes, keywords
-- 2. ref_commander_taxonomy - junction table linking commanders to taxonomy entries
-- 3. Adds taxonomy_tags[] to ref_commander_insights
-- 4. Adds keywords[] to ref_cards

-- =============================================================================
-- 1. ref_taxonomy - Single source of truth for all classification terms
-- =============================================================================

CREATE TABLE ref_taxonomy (
  slug TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('archetype', 'mechanic', 'tribe', 'keyword', 'color')),
  display_name TEXT NOT NULL,
  description TEXT,
  knowledge_file TEXT,              -- Path to knowledge base markdown (optional)
  parent_slug TEXT REFERENCES ref_taxonomy(slug),  -- For hierarchies (e.g., sub-archetypes)
  edhrec_aliases TEXT[],            -- EDHREC theme names that map to this slug
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for category filtering
CREATE INDEX idx_ref_taxonomy_category ON ref_taxonomy(category);

-- =============================================================================
-- 2. ref_commander_taxonomy - Links commanders to taxonomy entries
-- =============================================================================

CREATE TABLE ref_commander_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commander_id UUID NOT NULL REFERENCES ref_commanders(id) ON DELETE CASCADE,
  taxonomy_slug TEXT NOT NULL REFERENCES ref_taxonomy(slug) ON DELETE CASCADE,
  relevance TEXT NOT NULL DEFAULT 'secondary' CHECK (relevance IN ('primary', 'secondary', 'minor')),
  source TEXT NOT NULL DEFAULT 'edhrec' CHECK (source IN ('edhrec', 'ai', 'manual', 'keyword_match')),
  confidence NUMERIC(3,2),          -- 0.00-1.00 confidence score
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (commander_id, taxonomy_slug)
);

-- Indexes for common queries
CREATE INDEX idx_ref_commander_taxonomy_commander ON ref_commander_taxonomy(commander_id);
CREATE INDEX idx_ref_commander_taxonomy_slug ON ref_commander_taxonomy(taxonomy_slug);
CREATE INDEX idx_ref_commander_taxonomy_relevance ON ref_commander_taxonomy(relevance);

-- =============================================================================
-- 3. Add taxonomy_tags to ref_commander_insights
-- =============================================================================

ALTER TABLE ref_commander_insights 
ADD COLUMN taxonomy_tags TEXT[];

-- Index for filtering insights by taxonomy
CREATE INDEX idx_ref_commander_insights_taxonomy ON ref_commander_insights USING GIN (taxonomy_tags);

-- =============================================================================
-- 4. Add keywords to ref_cards
-- =============================================================================

ALTER TABLE ref_cards 
ADD COLUMN keywords TEXT[];

-- Index for keyword queries
CREATE INDEX idx_ref_cards_keywords ON ref_cards USING GIN (keywords);

-- =============================================================================
-- 5. Helpful views
-- =============================================================================

-- View: Commanders with their primary archetypes
CREATE VIEW v_commander_archetypes AS
SELECT 
  c.id,
  c.display_name,
  c.color_identity,
  array_agg(t.display_name ORDER BY ct.relevance) FILTER (WHERE t.category = 'archetype') as archetypes,
  array_agg(t.display_name ORDER BY ct.relevance) FILTER (WHERE t.category = 'mechanic') as mechanics,
  array_agg(t.display_name ORDER BY ct.relevance) FILTER (WHERE t.category = 'tribe') as tribes
FROM ref_commanders c
LEFT JOIN ref_commander_taxonomy ct ON c.id = ct.commander_id
LEFT JOIN ref_taxonomy t ON ct.taxonomy_slug = t.slug
GROUP BY c.id, c.display_name, c.color_identity;

-- =============================================================================
-- 6. RLS Policies (read-only for all authenticated users)
-- =============================================================================

ALTER TABLE ref_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_commander_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ref_taxonomy_read" ON ref_taxonomy FOR SELECT TO authenticated USING (true);
CREATE POLICY "ref_commander_taxonomy_read" ON ref_commander_taxonomy FOR SELECT TO authenticated USING (true);

-- Service role can write
CREATE POLICY "ref_taxonomy_service_write" ON ref_taxonomy FOR ALL TO service_role USING (true);
CREATE POLICY "ref_commander_taxonomy_service_write" ON ref_commander_taxonomy FOR ALL TO service_role USING (true);
