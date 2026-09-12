ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT NULL;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS source_platform TEXT DEFAULT NULL;

COMMENT ON COLUMN decks.source_url IS 'Full URL of the deck on the source platform (Archidekt/Moxfield)';
COMMENT ON COLUMN decks.source_platform IS 'Platform identifier: archidekt, moxfield, or null for Oracle-native decks';;
