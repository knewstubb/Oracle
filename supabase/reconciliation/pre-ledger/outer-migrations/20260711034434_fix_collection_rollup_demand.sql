CREATE OR REPLACE VIEW collection_rollup AS
SELECT
  cd.oracle_id,
  cd.card_name,
  cd.type_line,
  pc.user_id,
  COUNT(*) FILTER (WHERE NOT pc.is_proxy) AS owned_count,
  COUNT(*) FILTER (WHERE pc.is_proxy) AS proxy_count,
  COUNT(*) FILTER (WHERE dc_assigned.physical_copy_id IS NOT NULL) AS allocated_count,
  GREATEST(0,
    COALESCE(demand.total_demand, 0) - COUNT(*) FILTER (WHERE NOT pc.is_proxy)
  ) AS shortfall
FROM card_definitions cd
JOIN physical_copies pc ON pc.card_definition_id = cd.id
LEFT JOIN deck_cards dc_assigned
  ON dc_assigned.physical_copy_id = pc.id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_demand
  FROM deck_cards dc2
  JOIN decks d ON d.id = dc2.deck_id AND d.allocate = true
  JOIN card_definitions cd2 ON cd2.card_name = dc2.card_name
  WHERE cd2.oracle_id = cd.oracle_id
    AND d.user_id = pc.user_id
) demand ON TRUE
GROUP BY cd.oracle_id, cd.card_name, cd.type_line, pc.user_id, demand.total_demand;;
