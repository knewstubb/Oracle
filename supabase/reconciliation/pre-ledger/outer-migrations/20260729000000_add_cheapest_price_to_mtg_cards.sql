-- Add cheapest price column to mtg_cards
-- This stores the minimum USD price across all printings for each card

ALTER TABLE mtg_cards
ADD COLUMN IF NOT EXISTS price_usd_cheapest NUMERIC(10,2);

-- Create index for price lookups
CREATE INDEX IF NOT EXISTS idx_mtg_cards_price ON mtg_cards(price_usd_cheapest) WHERE price_usd_cheapest IS NOT NULL;

-- Function to sync cheapest prices from scryfall_printings
-- Can be run periodically after scryfall sync
CREATE OR REPLACE FUNCTION sync_mtg_cards_cheapest_prices()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  WITH cheapest AS (
    SELECT 
      name,
      MIN(price_usd) AS min_price
    FROM scryfall_printings
    WHERE price_usd IS NOT NULL AND price_usd > 0
    GROUP BY name
  )
  UPDATE mtg_cards mc
  SET price_usd_cheapest = c.min_price
  FROM cheapest c
  WHERE mc.name = c.name
    AND (mc.price_usd_cheapest IS DISTINCT FROM c.min_price);
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Run initial sync
SELECT sync_mtg_cards_cheapest_prices();
