-- Drop deck_documentation table (unused scaffolding, never populated)
-- Related code removed: StrategyTab UI, deck-documentation-store.ts, /api/decks/[id]/documentation

-- Drop RLS policy first
DROP POLICY IF EXISTS "deck_documentation_select_own" ON deck_documentation;

-- Drop the table (index drops automatically with table)
DROP TABLE IF EXISTS deck_documentation;
