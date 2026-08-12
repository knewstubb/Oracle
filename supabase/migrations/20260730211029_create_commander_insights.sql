-- Commander Insights: source-tagged distillation storage
-- Aggregated at query time, not pre-merged

CREATE TABLE commander_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leadership_id UUID NOT NULL REFERENCES deck_leaderships(id) ON DELETE CASCADE,
  
  -- Build variant (e.g., 'aristocrats', 'tokens', 'combo')
  -- NULL = general strategy applicable to all builds
  build_variant TEXT,
  
  -- Insight categorization
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'strategy',           -- Core strategy / game plan
    'synergy',            -- Key synergies and combos
    'card_recommendation', -- Specific card suggestions
    'budget_alternative',  -- Budget-friendly swaps
    'matchup',            -- Matchup considerations
    'upgrade_path',       -- How to improve the deck
    'common_mistake',     -- Pitfalls to avoid
    'meta_consideration'  -- Meta/playgroup considerations
  )),
  
  -- The actual insight content
  content TEXT NOT NULL,
  
  -- Source tracking for aggregation
  source_type TEXT NOT NULL CHECK (source_type IN (
    'youtube',
    'edhrec',
    'commanders_herald',
    'reddit',
    'moxfield',
    'archidekt',
    'manual'              -- User-provided or manually curated
  )),
  source_url TEXT,
  source_title TEXT,
  source_author TEXT,
  source_date DATE,
  
  -- Quality/relevance signals
  confidence REAL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  card_mentions TEXT[],   -- Cards mentioned in this insight
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent exact duplicates
  UNIQUE(leadership_id, build_variant, insight_type, content)
);

-- Indexes for common queries
CREATE INDEX idx_insights_leadership ON commander_insights(leadership_id);
CREATE INDEX idx_insights_leadership_type ON commander_insights(leadership_id, insight_type);
CREATE INDEX idx_insights_build ON commander_insights(leadership_id, build_variant);
CREATE INDEX idx_insights_source ON commander_insights(source_type);
CREATE INDEX idx_insights_cards ON commander_insights USING GIN (card_mentions);

COMMENT ON TABLE commander_insights IS 'Source-tagged insights for commanders, aggregated at query time';
COMMENT ON COLUMN commander_insights.build_variant IS 'Specific build archetype (aristocrats, tokens, etc). NULL = applies to all builds';
COMMENT ON COLUMN commander_insights.confidence IS '0-1 confidence score. Higher = more reliable source or stronger consensus';;
