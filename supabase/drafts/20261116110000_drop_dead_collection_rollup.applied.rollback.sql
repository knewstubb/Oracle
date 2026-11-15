-- UNDO for the drop of view collection_rollup and functions get_collection_rollup(uuid), get_shared_cards(uuid). Task CC-03b.
-- Definitions captured live 2026-11-16 BEFORE the drop (after CC-03a was applied). Supersedes the placeholder file
-- 20261116110000_drop_dead_collection_rollup.rollback.sql.
-- Restores them as a record. The two functions reference tables that no longer exist (card_definitions, physical_copies,
-- oracle_to_printings, card_kingdom_prices, collection), so they cannot run even when restored; they are only checked at call time.
-- The view reads user_cards / user_copies / deck_cards / decks, which exist, so it is restorable and works.
-- State at drop time: view owner postgres, security_invoker = true, access postgres/authenticated/service_role (anon removed
-- by CC-03a); functions owner postgres, EXECUTE service_role only.

BEGIN;

CREATE VIEW public.collection_rollup AS
 SELECT cd.oracle_id,
    cd.card_name,
    cd.type_line,
    pc.user_id,
    count(*) FILTER (WHERE NOT pc.is_proxy) AS owned_count,
    count(*) FILTER (WHERE pc.is_proxy) AS proxy_count,
    count(*) FILTER (WHERE dc_assigned.copy_id IS NOT NULL) AS allocated_count,
    GREATEST(0::bigint, COALESCE(demand.total_demand, 0::bigint) - count(*)) AS shortfall
   FROM user_cards cd
     JOIN user_copies pc ON pc.card_id = cd.id
     LEFT JOIN deck_cards dc_assigned ON dc_assigned.copy_id = pc.id
     LEFT JOIN LATERAL ( SELECT count(*) AS total_demand
           FROM deck_cards dc2
             JOIN decks d ON d.id = dc2.deck_id AND d.allocate = true
             JOIN user_cards cd2 ON cd2.card_name = dc2.card_name
          WHERE cd2.oracle_id = cd.oracle_id AND d.user_id = pc.user_id) demand ON true
  GROUP BY cd.oracle_id, cd.card_name, cd.type_line, pc.user_id, demand.total_demand;
ALTER VIEW public.collection_rollup SET (security_invoker = true);
REVOKE ALL ON public.collection_rollup FROM PUBLIC, anon;
GRANT ALL ON public.collection_rollup TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_collection_rollup(p_user_id uuid)
 RETURNS TABLE(card_definition_id integer, card_name text, oracle_id text, color_identity text, type_line text, total_quantity bigint, price_to_add numeric, owned_valuation numeric)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    cd.id AS card_definition_id,
    cd.card_name,
    cd.oracle_id,
    cd.color_identity,
    cd.type_line,
    -- Total quantity = count of physical copies (one row per instance now)
    COUNT(pc.id)::BIGINT AS total_quantity,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_shared_cards(p_user_id uuid)
 RETURNS TABLE(card_name text, deck_count bigint, deck_ids text, owned_copies bigint)
 LANGUAGE sql
 STABLE
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.get_collection_rollup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_shared_cards(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_rollup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_cards(uuid) TO service_role;

COMMIT;
