-- Migration: Create deck_folders table and add folder_id FK to decks
-- Part of the deck lifecycle simplification (Phase 2: Folders)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create deck_folders table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE deck_folders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT NULL,  -- Optional hex color for UI (e.g. "#3B82F6")
  position INTEGER NOT NULL DEFAULT 0,  -- Sort order within user's folders
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can only have one folder with a given name
  UNIQUE (user_id, name)
);

-- Index for fetching user's folders
CREATE INDEX idx_deck_folders_user_id ON deck_folders(user_id);

-- RLS policies
ALTER TABLE deck_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own folders"
  ON deck_folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own folders"
  ON deck_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
  ON deck_folders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
  ON deck_folders FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add folder_id FK to decks table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE decks
  ADD COLUMN folder_id INTEGER REFERENCES deck_folders(id) ON DELETE SET NULL;

-- Index for filtering decks by folder
CREATE INDEX idx_decks_folder_id ON decks(folder_id) WHERE folder_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update timestamp trigger for deck_folders
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_deck_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deck_folders_updated_at
  BEFORE UPDATE ON deck_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_deck_folders_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE deck_folders IS 'User-defined folders for organizing decks';
COMMENT ON COLUMN deck_folders.color IS 'Optional hex color for folder badge in UI';
COMMENT ON COLUMN deck_folders.position IS 'Sort order for displaying folders';
COMMENT ON COLUMN decks.folder_id IS 'Optional folder for deck organization (NULL = unfiled)';
