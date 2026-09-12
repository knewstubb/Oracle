-- Migration: Enable RLS and add permissive SELECT policies for reference tables
-- These tables are shared/read-only for all authenticated users.
-- Writes happen exclusively via the service-role client (admin/sync operations).

-- ============================================================================
-- sets
-- ============================================================================
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sets_read_authenticated"
  ON sets FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- card_metadata
-- ============================================================================
ALTER TABLE card_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_metadata_read_authenticated"
  ON card_metadata FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- precon_cards
-- ============================================================================
ALTER TABLE precon_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "precon_cards_read_authenticated"
  ON precon_cards FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- card_kingdom_prices
-- ============================================================================
ALTER TABLE card_kingdom_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_kingdom_prices_read_authenticated"
  ON card_kingdom_prices FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- oracle_to_printings
-- ============================================================================
ALTER TABLE oracle_to_printings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oracle_to_printings_read_authenticated"
  ON oracle_to_printings FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- sync_meta
-- ============================================================================
ALTER TABLE sync_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_meta_read_authenticated"
  ON sync_meta FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- _migrations
-- ============================================================================
ALTER TABLE _migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "_migrations_read_authenticated"
  ON _migrations FOR SELECT
  TO authenticated
  USING (true);
