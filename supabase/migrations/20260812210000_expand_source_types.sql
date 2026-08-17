-- Expand allowed source_type values to match source-trust-config.ts
-- Drop and recreate the constraint with expanded values

ALTER TABLE ref_commander_insights
DROP CONSTRAINT IF EXISTS commander_insights_source_type_check;

ALTER TABLE ref_commander_insights
ADD CONSTRAINT commander_insights_source_type_check CHECK (source_type IN (
  -- Original values
  'youtube',
  'edhrec',
  'commanders_herald',
  'reddit',
  'moxfield',
  'archidekt',
  'manual',
  -- New values from source-trust-config.ts
  'edhrec-article',
  'mtggoldfish',
  'mtggoldfish-article',
  'youtube-tier1',
  'youtube-tier2',
  'youtube-tier3',
  'discord',
  'ai-analysis',
  'user-submitted',
  'curated',
  'unknown'
));
