-- Add EDHREC-sourced columns to ref_commanders
-- salt_score: Community "saltiness" rating (0-4 scale)
-- similar_commanders: JSON array of similar commanders from EDHREC

ALTER TABLE ref_commanders 
  ADD COLUMN IF NOT EXISTS salt_score numeric,
  ADD COLUMN IF NOT EXISTS similar_commanders jsonb;

-- Add index for salt score queries (e.g., "show low-salt commanders")
CREATE INDEX IF NOT EXISTS idx_ref_commanders_salt_score 
  ON ref_commanders(salt_score) 
  WHERE salt_score IS NOT NULL;

COMMENT ON COLUMN ref_commanders.salt_score IS 'EDHREC community salt score (0-4 scale). Higher = more annoying to play against.';
COMMENT ON COLUMN ref_commanders.similar_commanders IS 'JSON array of similar commanders from EDHREC: [{name, slug, decks}]';
