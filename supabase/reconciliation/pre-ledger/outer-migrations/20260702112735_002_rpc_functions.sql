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
  JOIN oracle_to_printings otp ON otp.oracle_id = cd.oracle_id
  JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = otp.scryfall_printing_id
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
        FROM oracle_to_printings otp
        JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = otp.scryfall_printing_id
        WHERE otp.oracle_id = cd.oracle_id
      )
    END AS price_to_add
  FROM card_definitions cd;
$$;

CREATE OR REPLACE FUNCTION get_collection_rollup(p_user_id UUID)
RETURNS TABLE(
  card_definition_id INTEGER,
  card_name TEXT,
  oracle_id TEXT,
  color_identity TEXT,
  type_line TEXT,
  total_quantity BIGINT,
  price_to_add NUMERIC,
  owned_valuation NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cd.id AS card_definition_id,
    cd.card_name,
    cd.oracle_id,
    cd.color_identity,
    cd.type_line,
    COALESCE(SUM(pc.quantity), 0)::BIGINT AS total_quantity,
    CASE
      WHEN cd.type_line ~* '\mBasic\M' THEN NULL
      ELSE (
        SELECT MIN(ckp.price_retail)
        FROM oracle_to_printings otp
        JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = otp.scryfall_printing_id
        WHERE otp.oracle_id = cd.oracle_id
      )
    END AS price_to_add,
    CASE
      WHEN cd.type_line ~* '\mBasic\M' THEN NULL
      ELSE (
        SELECT MIN(ckp.price_retail)
        FROM physical_copies pc2
        JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = pc2.scryfall_printing_id
        WHERE pc2.card_definition_id = cd.id
          AND pc2.user_id = p_user_id
          AND pc2.scryfall_printing_id IS NOT NULL
      )
    END AS owned_valuation
  FROM card_definitions cd
  JOIN physical_copies pc ON pc.card_definition_id = cd.id
  WHERE cd.user_id = p_user_id
    AND pc.user_id = p_user_id
    AND pc.is_proxy = FALSE
  GROUP BY cd.id, cd.card_name, cd.oracle_id, cd.color_identity, cd.type_line;
$$;

CREATE OR REPLACE FUNCTION get_shared_cards(p_user_id UUID)
RETURNS TABLE(
  card_name TEXT,
  deck_count BIGINT,
  deck_ids TEXT,
  owned_copies BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    dc.card_name,
    COUNT(DISTINCT dc.deck_id) AS deck_count,
    string_agg(DISTINCT dc.deck_id::TEXT, ',') AS deck_ids,
    (
      SELECT COALESCE(SUM(c.quantity), 0)
      FROM collection c
      WHERE c.card_name = dc.card_name
        AND c.user_id = p_user_id
    ) AS owned_copies
  FROM deck_cards dc
  JOIN decks d ON d.id = dc.deck_id
  WHERE dc.user_id = p_user_id
    AND d.user_id = p_user_id
    AND dc.card_name NOT IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
                             'Snow-Covered Plains', 'Snow-Covered Island',
                             'Snow-Covered Swamp', 'Snow-Covered Mountain',
                             'Snow-Covered Forest', 'Wastes')
  GROUP BY dc.card_name
  HAVING COUNT(DISTINCT dc.deck_id) > 1;
$$;;
