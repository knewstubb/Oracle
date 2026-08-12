-- Migration: Replace tribe column with kindred theme pattern
-- Purpose: Use "kindred:goblins" style themes instead of separate tribe column
-- 
-- Rationale: There are kindred-agnostic cards (Herald's Horn, Vanquisher's Banner)
-- and kindred-specific cards (Goblin Chieftain, Muxus). Using theme prefixes
-- allows both to coexist in the taxonomy.
--
-- Examples:
--   kindred           → generic tribal synergy (Morophon decks)
--   kindred:goblins   → goblin-specific tribal
--   kindred:zombies   → zombie-specific tribal

-- =============================================================================
-- Step 1: Migrate tribe values to kindred:X theme pattern
-- =============================================================================

-- Move tribe to primary_theme with kindred: prefix
UPDATE ref_commander_builds
SET primary_theme = 'kindred:' || tribe
WHERE tribe IS NOT NULL 
  AND primary_theme IS NULL;

-- If primary_theme was already set, add tribe as secondary theme
UPDATE ref_commander_builds
SET secondary_themes = array_append(secondary_themes, 'kindred:' || tribe)
WHERE tribe IS NOT NULL 
  AND primary_theme IS NOT NULL
  AND NOT (secondary_themes @> ARRAY['kindred:' || tribe]);

-- =============================================================================
-- Step 2: Drop tribe column (data has been migrated)
-- =============================================================================

ALTER TABLE ref_commander_builds DROP COLUMN IF EXISTS tribe;

-- Also drop the index we created in previous migration
DROP INDEX IF EXISTS idx_commander_builds_tribe;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN ref_commander_builds.primary_theme IS 
  'Main theme: artifacts, graveyard, tokens, kindred:goblins, kindred:zombies, etc.';
