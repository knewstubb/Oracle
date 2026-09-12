-- ============================================================
-- Migration 023: Add format column to decks table
--
-- Supports multi-format deck management (Commander, Standard,
-- Modern, Legacy, Vintage, Pioneer, Pauper, Cube, Casual).
-- Defaults to 'commander' for all existing decks.
-- ============================================================

ALTER TABLE decks ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'commander';

-- Index for filtering decks by format
CREATE INDEX IF NOT EXISTS idx_decks_format ON decks(format);
