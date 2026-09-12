-- Drop redundant sets table
-- Set codes and names are now available in scryfall_printings per-printing
-- All consumers have been migrated to query scryfall_printings directly

DROP TABLE IF EXISTS sets;
