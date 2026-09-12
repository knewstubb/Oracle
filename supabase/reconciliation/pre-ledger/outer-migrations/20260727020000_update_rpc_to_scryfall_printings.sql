-- ============================================================
-- Migration: Update RPC functions to use scryfall_printings
-- 
-- Replaces oracle_to_printings with scryfall_printings
--
-- Type mismatches handled:
--   card_definitions.oracle_id (TEXT) vs scryfall_printings.oracle_id (UUID)
--   card_kingdom_prices.scryfall_printing_id (TEXT) vs scryfall_printings.scryfall_id (UUID)
-- ============================================================

CREATE OR REPLACE FUNCTION get_price_to_add(card_def_id INTEGER)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_type_line TEXT;
  v_min_price NUMERIC;
BEGIN
  SELECT type_line INTO v_type_line
  FROM card_definitions
  WHERE id = card_def_id;

  IF v_type_line IS NOT NULL AND v_type_line ~* '\mBasic\M' THEN
    RETURN NULL;
  END IF;

  SELECT MIN(ckp.price_retail) INTO v_min_price
  FROM card_definitions cd
  JOIN scryfall_printings sp ON sp.oracle_id::text = cd.oracle_id
  JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = sp.scryfall_id::text
  WHERE cd.id = card_def_id;

  RETURN v_min_price;
END;
$$;

CREATE OR REPLACE FUNCTION get_bulk_price_to_add()
RETURNS TABLE(card_definition_id INTEGER, price_to_add NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cd.id AS card_definition_id,
    CASE
      WHEN cd.type_line ~* '\mBasic\M' THEN NULL
      ELSE (
        SELECT MIN(ckp.price_retail)
        FROM scryfall_printings sp
        JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = sp.scryfall_id::text
        WHERE sp.oracle_id::text = cd.oracle_id
      )
    END AS price_to_add
  FROM card_definitions cd;
$$;
