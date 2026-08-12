-- Add EDHREC popularity data to ref_commanders
-- Allows local querying of top commanders without hitting EDHREC API

ALTER TABLE ref_commanders ADD COLUMN IF NOT EXISTS edhrec_rank INTEGER;
ALTER TABLE ref_commanders ADD COLUMN IF NOT EXISTS edhrec_deck_count INTEGER;
ALTER TABLE ref_commanders ADD COLUMN IF NOT EXISTS edhrec_synced_at TIMESTAMPTZ;

-- Index for efficient rank queries by colour identity
CREATE INDEX IF NOT EXISTS idx_ref_commanders_edhrec_rank 
  ON ref_commanders (color_identity, edhrec_rank) 
  WHERE edhrec_rank IS NOT NULL;

-- Index for deck count sorting
CREATE INDEX IF NOT EXISTS idx_ref_commanders_deck_count 
  ON ref_commanders (edhrec_deck_count DESC NULLS LAST) 
  WHERE edhrec_deck_count IS NOT NULL;

COMMENT ON COLUMN ref_commanders.edhrec_rank IS 'EDHREC popularity rank (1 = most popular)';
COMMENT ON COLUMN ref_commanders.edhrec_deck_count IS 'Number of registered decks on EDHREC';
COMMENT ON COLUMN ref_commanders.edhrec_synced_at IS 'When EDHREC data was last synced';
