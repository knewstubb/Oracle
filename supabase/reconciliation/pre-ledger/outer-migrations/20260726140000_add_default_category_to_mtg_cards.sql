-- Add default_category JSONB column to mtg_cards for functional classification
-- Structure: { primary: string, secondary: string[], confidence: 'high'|'medium'|'low', notes?: string }

ALTER TABLE mtg_cards 
ADD COLUMN IF NOT EXISTS default_category JSONB;

-- Index for filtering by primary category
CREATE INDEX IF NOT EXISTS idx_mtg_cards_default_category_primary 
ON mtg_cards ((default_category->>'primary'));

COMMENT ON COLUMN mtg_cards.default_category IS 'Functional category classification: { primary, secondary[], confidence, notes }';
