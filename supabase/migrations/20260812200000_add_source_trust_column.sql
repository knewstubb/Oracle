-- Add source_trust column to ref_commander_insights
-- This column stores the base trustworthiness score (0.00-1.00) of the insight source
-- Different source types have different trust levels based on their reliability

ALTER TABLE ref_commander_insights 
ADD COLUMN IF NOT EXISTS source_trust DECIMAL(3,2) DEFAULT 0.50;

-- Add comment explaining the column
COMMENT ON COLUMN ref_commander_insights.source_trust IS 
'Base trustworthiness score (0.00-1.00) of the insight source. Higher = more reliable. Combined with recency for final confidence.';

-- Update existing EDHREC insights to use the appropriate trust score
UPDATE ref_commander_insights 
SET source_trust = 0.85 
WHERE source_type = 'edhrec' AND source_trust IS NULL;

-- Create an index for efficient filtering by trust level
CREATE INDEX IF NOT EXISTS idx_insights_source_trust 
ON ref_commander_insights(source_trust DESC);
