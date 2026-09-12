-- ============================================================
-- Migration 022: Extend oracle_to_printings for local resolution
--
-- Adds card_name, set_code, collector_number columns to enable:
--   1. Name-only resolution without Scryfall API (card_name → oracle_id)
--   2. Set+collector resolution without Scryfall API
--
-- Populated by: scripts/seed-scryfall-bulk.ts
-- Used by: import-engine-v2 resolveFromCardName / resolveFromSetCollector
-- ============================================================

-- Add columns (nullable to avoid breaking existing rows)
ALTER TABLE oracle_to_printings ADD COLUMN IF NOT EXISTS card_name TEXT;
ALTER TABLE oracle_to_printings ADD COLUMN IF NOT EXISTS set_code TEXT;
ALTER TABLE oracle_to_printings ADD COLUMN IF NOT EXISTS collector_number TEXT;

-- Index for name-based lookups (most common import scenario)
CREATE INDEX IF NOT EXISTS idx_oracle_to_printings_card_name
  ON oracle_to_printings(card_name);

-- Index for set+collector lookups (Moxfield imports)
CREATE INDEX IF NOT EXISTS idx_oracle_to_printings_set_collector
  ON oracle_to_printings(set_code, collector_number);
