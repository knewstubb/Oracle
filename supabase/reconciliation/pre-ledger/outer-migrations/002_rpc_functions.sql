-- ============================================================
-- RPC Functions Migration: The Oracle
--
-- Postgres functions for complex multi-table queries called
-- via Supabase `.rpc()`. These replace application-layer JOINs
-- that the Supabase query builder handles awkwardly.
--
-- Functions:
--   1. get_price_to_add(card_def_id)       — single card price lookup
--   2. get_bulk_price_to_add()             — bulk price lookup for all definitions
--   3. get_collection_rollup(p_user_id)    — collection with physical copies + prices
--   4. get_shared_cards(p_user_id)         — shared cards across decks
-- ============================================================

-- ============================================================
-- 1. get_price_to_add(card_def_id INTEGER)
--
-- Looks up the card_definition's oracle_id, joins through
-- oracle_to_printings to find all printings, then finds the
-- minimum price from card_kingdom_prices for those printings.
--
-- Returns NULL if:
--   - The card is a Basic Land (type_line contains 'Basic' as supertype)
--   - No CK listing exists for any printing of this card
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
  -- Check if card is a basic land
  SELECT type_line INTO v_type_line
  FROM card_definitions
  WHERE id = card_def_id;

  IF v_type_line IS NOT NULL AND v_type_line ~* '\mBasic\M' THEN
    RETURN NULL;
  END IF;

  -- Find minimum price across all printings via oracle_id
  SELECT MIN(ckp.price_retail) INTO v_min_price
  FROM card_definitions cd
  JOIN oracle_to_printings otp ON otp.oracle_id = cd.oracle_id
  JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = otp.scryfall_printing_id
  WHERE cd.id = card_def_id;

  RETURN v_min_price;
END;
$$;

-- ============================================================
-- 2. get_bulk_price_to_add()
--
-- Same logic as get_price_to_add but for ALL card definitions
-- in a single efficient query.
--
-- Returns a set of (card_definition_id, price_to_add).
-- Basic lands return NULL for price_to_add.
-- Cards with no CK listing return NULL for price_to_add.
-- ============================================================

CREATE OR REPLACE FUNCTION get_bulk_price_to_add()
RETURNS TABLE(card_definition_id INTEGER, price_to_add NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    cd.id AS card_definition_id,
    CASE
      -- Basic lands get NULL price
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

-- ============================================================
-- 3. get_collection_rollup(p_user_id UUID)
--
-- Gets all collection entries for the user joined with pricing
-- data via card_definitions → oracle_to_printings → card_kingdom_prices.
--
-- Returns collection rows enriched with:
--   - card_definition_id (from card_definitions matched by card_name)
--   - oracle_id
--   - type_line
--   - price_to_add (minimum price across all printings, NULL for basic lands)
--   - owned_valuation (specific printing price from card_kingdom_prices)
-- ============================================================

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
    -- Total quantity across all physical copies for this card definition
    COALESCE(SUM(pc.quantity), 0)::BIGINT AS total_quantity,
    -- Price to add: min price across all printings (NULL for basic lands)
    CASE
      WHEN cd.type_line ~* '\mBasic\M' THEN NULL
      ELSE (
        SELECT MIN(ckp.price_retail)
        FROM oracle_to_printings otp
        JOIN card_kingdom_prices ckp ON ckp.scryfall_printing_id = otp.scryfall_printing_id
        WHERE otp.oracle_id = cd.oracle_id
      )
    END AS price_to_add,
    -- Owned valuation: min price of the specific printings the user owns
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

-- ============================================================
-- 4. get_shared_cards(p_user_id UUID)
--
-- Finds cards that appear in multiple decks for a user.
-- Similar to the shared_cards view but scoped to a specific user.
--
-- Returns:
--   - card_name: the card appearing in multiple decks
--   - deck_count: number of distinct decks containing this card
--   - deck_ids: comma-separated list of deck IDs
--   - owned_copies: total copies owned in the user's collection
-- ============================================================

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
    -- Exclude basic lands
    AND dc.card_name NOT IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
                             'Snow-Covered Plains', 'Snow-Covered Island',
                             'Snow-Covered Swamp', 'Snow-Covered Mountain',
                             'Snow-Covered Forest', 'Wastes')
  GROUP BY dc.card_name
  HAVING COUNT(DISTINCT dc.deck_id) > 1;
$$;
