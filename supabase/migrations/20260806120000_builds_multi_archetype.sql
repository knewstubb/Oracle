-- Migration: Support multiple archetypes and themes per build
-- Purpose: A build can have a primary archetype + secondary archetypes, same for themes
-- Example: "Aristocrats with Reanimator support" = primary: aristocrats, secondary: [reanimator]

-- =============================================================================
-- Step 1: Add new columns (keep old ones for migration)
-- =============================================================================

ALTER TABLE ref_commander_builds
  ADD COLUMN IF NOT EXISTS primary_archetype TEXT,
  ADD COLUMN IF NOT EXISTS secondary_archetypes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_theme TEXT,
  ADD COLUMN IF NOT EXISTS secondary_themes TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tribe TEXT;  -- Separate from theme for clarity

-- =============================================================================
-- Step 2: Migrate existing data
-- =============================================================================

-- Move existing archetype to primary_archetype
UPDATE ref_commander_builds
SET primary_archetype = archetype
WHERE archetype IS NOT NULL AND primary_archetype IS NULL;

-- Move existing theme to primary_theme (unless it's a tribe)
-- Tribes go to the tribe column
UPDATE ref_commander_builds
SET primary_theme = theme
WHERE theme IS NOT NULL 
  AND primary_theme IS NULL
  AND theme NOT IN (
    'angels', 'assassins', 'allies', 'beasts', 'bears', 'birds', 'cats', 
    'clerics', 'constructs', 'demons', 'dinosaurs', 'dogs', 'dragons', 
    'druids', 'dwarves', 'eldrazi', 'elementals', 'elves', 'faeries', 
    'giants', 'goblins', 'gods', 'golems', 'humans', 'hydras', 'knights', 
    'krakens', 'merfolk', 'myr', 'ninjas', 'phyrexians', 'phoenixes', 
    'pirates', 'rats', 'rogues', 'samurai', 'saprolings', 'shamans', 
    'slivers', 'snakes', 'soldiers', 'sphinxes', 'spiders', 'spirits', 
    'squirrels', 'thopters', 'treefolk', 'vampires', 'warriors', 
    'werewolves', 'wizards', 'wolves', 'zombies'
  );

-- Move tribes to tribe column
UPDATE ref_commander_builds
SET tribe = theme
WHERE theme IS NOT NULL 
  AND tribe IS NULL
  AND theme IN (
    'angels', 'assassins', 'allies', 'beasts', 'bears', 'birds', 'cats', 
    'clerics', 'constructs', 'demons', 'dinosaurs', 'dogs', 'dragons', 
    'druids', 'dwarves', 'eldrazi', 'elementals', 'elves', 'faeries', 
    'giants', 'goblins', 'gods', 'golems', 'humans', 'hydras', 'knights', 
    'krakens', 'merfolk', 'myr', 'ninjas', 'phyrexians', 'phoenixes', 
    'pirates', 'rats', 'rogues', 'samurai', 'saprolings', 'shamans', 
    'slivers', 'snakes', 'soldiers', 'sphinxes', 'spiders', 'spirits', 
    'squirrels', 'thopters', 'treefolk', 'vampires', 'warriors', 
    'werewolves', 'wizards', 'wolves', 'zombies'
  );

-- =============================================================================
-- Step 3: Create indexes for new columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_commander_builds_primary_archetype 
  ON ref_commander_builds(primary_archetype);

CREATE INDEX IF NOT EXISTS idx_commander_builds_primary_theme 
  ON ref_commander_builds(primary_theme);

CREATE INDEX IF NOT EXISTS idx_commander_builds_tribe 
  ON ref_commander_builds(tribe);

-- GIN indexes for array columns (efficient contains queries)
CREATE INDEX IF NOT EXISTS idx_commander_builds_secondary_archetypes 
  ON ref_commander_builds USING GIN(secondary_archetypes);

CREATE INDEX IF NOT EXISTS idx_commander_builds_secondary_themes 
  ON ref_commander_builds USING GIN(secondary_themes);

-- =============================================================================
-- Step 4: Drop old columns (after verifying migration)
-- =============================================================================

-- Note: Keeping old columns for now to allow rollback
-- Uncomment after verifying migration:
-- ALTER TABLE ref_commander_builds DROP COLUMN IF EXISTS archetype;
-- ALTER TABLE ref_commander_builds DROP COLUMN IF EXISTS theme;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN ref_commander_builds.primary_archetype IS 
  'Main archetype (how deck wins): aristocrats, combo, aggro, etc.';

COMMENT ON COLUMN ref_commander_builds.secondary_archetypes IS 
  'Supporting archetypes that complement the primary plan';

COMMENT ON COLUMN ref_commander_builds.primary_theme IS 
  'Main theme (what deck is built from): artifacts, graveyard, tokens, etc.';

COMMENT ON COLUMN ref_commander_builds.secondary_themes IS 
  'Supporting themes that complement the primary theme';

COMMENT ON COLUMN ref_commander_builds.tribe IS 
  'Creature type focus if tribal deck: goblins, zombies, elves, etc.';
