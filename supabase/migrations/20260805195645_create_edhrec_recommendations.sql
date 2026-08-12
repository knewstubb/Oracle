-- EDHREC card recommendations per commander
-- Stores high-synergy cards from EDHREC's commander pages

CREATE TABLE IF NOT EXISTS ref_edhrec_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commander_id uuid NOT NULL REFERENCES ref_commanders(id) ON DELETE CASCADE,
  card_name text NOT NULL,
  card_type text, -- 'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'land', 'planeswalker'
  synergy_score numeric, -- EDHREC's synergy percentage (0.0-1.0)
  inclusion_rate numeric, -- % of decks that include this card (0.0-1.0)
  deck_count integer, -- Raw number of decks including this card
  position integer, -- Sort order (1 = highest synergy)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate card entries per commander
  UNIQUE (commander_id, card_name)
);

-- Index for querying recommendations by commander
CREATE INDEX IF NOT EXISTS idx_edhrec_recommendations_commander 
  ON ref_edhrec_recommendations(commander_id);

-- Index for finding high-synergy cards across all commanders
CREATE INDEX IF NOT EXISTS idx_edhrec_recommendations_synergy 
  ON ref_edhrec_recommendations(synergy_score DESC NULLS LAST);

-- Index for card lookup (e.g., "which commanders want Dockside?")
CREATE INDEX IF NOT EXISTS idx_edhrec_recommendations_card_name 
  ON ref_edhrec_recommendations(card_name);

-- RLS: Read-only for all authenticated users
ALTER TABLE ref_edhrec_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access for authenticated users" 
  ON ref_edhrec_recommendations 
  FOR SELECT 
  TO authenticated 
  USING (true);

-- Comments
COMMENT ON TABLE ref_edhrec_recommendations IS 'EDHREC card recommendations per commander. Synced weekly from EDHREC API.';
COMMENT ON COLUMN ref_edhrec_recommendations.synergy_score IS 'EDHREC synergy score (0.0-1.0). How much more likely this card appears in this commander vs others.';
COMMENT ON COLUMN ref_edhrec_recommendations.inclusion_rate IS 'Percentage of decks with this commander that include this card (0.0-1.0).';
COMMENT ON COLUMN ref_edhrec_recommendations.card_type IS 'Card type category from EDHREC: creature, instant, sorcery, artifact, enchantment, land, planeswalker.';
