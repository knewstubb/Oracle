-- Migration: Add ref_rulings table for Scryfall rulings
-- 
-- Rulings are keyed by oracle_id (not card name) because rulings apply to
-- all printings of a card. Multiple cards with the same oracle_id share rulings.
--
-- Run with: psql $DATABASE_URL -f scripts/migrations/add-ref-rulings.sql

-- Create the ref_rulings table
CREATE TABLE IF NOT EXISTS ref_rulings (
  id SERIAL PRIMARY KEY,
  oracle_id UUID NOT NULL,
  source VARCHAR(20) NOT NULL,  -- 'wotc' or 'scryfall'
  published_at DATE NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Composite unique constraint to prevent duplicate rulings
  CONSTRAINT ref_rulings_unique UNIQUE (oracle_id, published_at, comment)
);

-- Index for fast lookups by oracle_id (the primary query pattern)
CREATE INDEX IF NOT EXISTS idx_ref_rulings_oracle_id ON ref_rulings (oracle_id);

-- Index for looking up rulings by source (useful for debugging/auditing)
CREATE INDEX IF NOT EXISTS idx_ref_rulings_source ON ref_rulings (source);

-- Enable RLS (read-only for anon, full access for service role)
ALTER TABLE ref_rulings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read rulings (public reference data)
CREATE POLICY "ref_rulings_select_policy" ON ref_rulings
  FOR SELECT
  USING (true);

-- Policy: Only service role can insert/update/delete
CREATE POLICY "ref_rulings_modify_policy" ON ref_rulings
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comment on table
COMMENT ON TABLE ref_rulings IS 'Card rulings from Scryfall bulk data. Keyed by oracle_id so rulings apply to all printings of a card.';
COMMENT ON COLUMN ref_rulings.oracle_id IS 'Scryfall oracle_id - links to card identity across printings';
COMMENT ON COLUMN ref_rulings.source IS 'Source of the ruling: wotc (official) or scryfall (community notes)';
COMMENT ON COLUMN ref_rulings.published_at IS 'Date the ruling was published';
COMMENT ON COLUMN ref_rulings.comment IS 'The ruling text';
