-- ============================================================
-- Drop legacy printing reference tables
-- 
-- These tables are now redundant with scryfall_printings:
--   - oracle_to_printings: oracle_id → scryfall_printing_id mapping
--   - printing_set_info: scryfall_printing_id → set_code, edition_name
--
-- All consumers have been migrated to query scryfall_printings directly.
-- RPC functions updated in migration 20260727020000.
-- ============================================================

DROP TABLE IF EXISTS oracle_to_printings;
DROP TABLE IF EXISTS printing_set_info;
