-- Add archetype column to ref_commander_insights
-- This separates "what you build around" (build_variant/theme) from "how you play" (archetype)

ALTER TABLE ref_commander_insights
ADD COLUMN IF NOT EXISTS archetype text;

-- Add comment explaining the taxonomy
COMMENT ON COLUMN ref_commander_insights.build_variant IS 'Theme: what the deck is built around (counters, dragons, sacrifice)';
COMMENT ON COLUMN ref_commander_insights.archetype IS 'Archetype: how the deck plays (aggro, control, combo, midrange)';
COMMENT ON COLUMN ref_commander_insights.taxonomy_tags IS 'All relevant taxonomy slugs for cross-referencing';
