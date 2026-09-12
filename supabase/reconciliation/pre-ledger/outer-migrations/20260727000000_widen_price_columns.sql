-- ============================================================================
-- Widen price columns to handle high-value cards (e.g., Black Lotus ~$500K)
-- ============================================================================
-- NUMERIC(10, 2) allows max 99,999,999.99
-- NUMERIC(12, 2) allows max 9,999,999,999.99
-- ============================================================================

ALTER TABLE scryfall_printings
  ALTER COLUMN price_usd TYPE NUMERIC(12, 2),
  ALTER COLUMN price_usd_foil TYPE NUMERIC(12, 2),
  ALTER COLUMN price_eur TYPE NUMERIC(12, 2),
  ALTER COLUMN price_eur_foil TYPE NUMERIC(12, 2);
