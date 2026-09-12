-- ============================================================
-- Migration 013: Printing Set Info (reference table, no RLS)
--
-- Stores set_code and edition_name for each scryfall_printing_id.
-- Used by the printings route to display "Printing" column data.
-- No RLS — this is reference data populated during import.
-- ============================================================

CREATE TABLE IF NOT EXISTS printing_set_info (
  scryfall_printing_id TEXT PRIMARY KEY,
  set_code TEXT NOT NULL DEFAULT '',
  edition_name TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_printing_set_info_set_code
  ON printing_set_info(set_code);
