-- Drop ref_rulings table to reduce database size (~46 MB savings)
-- Rulings are now fetched on-demand from Scryfall API via card-data.ts
-- 
-- This migration is safe because:
-- 1. getRulingsByCardName() and getRulingsByOracleId() now use Scryfall API
-- 2. The mtg_ruling_search tool uses those functions
-- 3. No other code references ref_rulings

-- Drop the helper function used by sync script (if exists)
DROP FUNCTION IF EXISTS truncate_ref_rulings();

-- Drop indexes first
DROP INDEX IF EXISTS idx_ref_rulings_oracle_id;
DROP INDEX IF EXISTS idx_ref_rulings_source;

-- Drop the table
DROP TABLE IF EXISTS ref_rulings CASCADE;
