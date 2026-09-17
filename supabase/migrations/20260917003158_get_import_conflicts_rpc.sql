-- get_import_conflicts: derive open initial-import conflicts for a user.
-- A conflict exists per exact printing where sleeved demand (finalized real
-- sleeves + open claims) exceeds owned real (non-proxy, non-missing) copies.
-- Returns one JSON object per conflicted printing with owned/sleeved counts and
-- the decks the printing is committed/claimed into.
CREATE OR REPLACE FUNCTION public.get_import_conflicts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  -- Open claims per exact printing
  claim_demand AS (
    SELECT c.printing_id,
           c.card_name,
           count(*)::int AS claim_count,
           array_agg(DISTINCT c.deck_id) AS claim_deck_ids
    FROM public.import_sleeve_claims c
    WHERE c.user_id = p_user_id
      AND c.printing_id IS NOT NULL
    GROUP BY c.printing_id, c.card_name
  ),
  -- Already-finalized real sleeves per exact printing
  sleeved_demand AS (
    SELECT dc.scryfall_id AS printing_id,
           count(*)::int AS sleeved_count,
           array_agg(DISTINCT dc.deck_id) AS sleeved_deck_ids
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id
      AND dc.copy_id IS NOT NULL
      AND dc.ownership_status = 'original'
      AND dc.scryfall_id IS NOT NULL
      AND uc.is_proxy = false
    GROUP BY dc.scryfall_id
  ),
  -- Owned real copies per exact printing
  owned AS (
    SELECT uc.printing_id,
           count(*)::int AS owned_count
    FROM public.user_copies uc
    WHERE uc.user_id = p_user_id
      AND uc.is_proxy = false
      AND uc.missing = false
      AND uc.printing_id IS NOT NULL
    GROUP BY uc.printing_id
  ),
  printings AS (
    SELECT printing_id FROM claim_demand
    UNION
    SELECT printing_id FROM sleeved_demand
  ),
  combined AS (
    SELECT p.printing_id,
           COALESCE(cd.card_name, sd_name.card_name) AS card_name,
           COALESCE(cd.claim_count, 0) AS claim_count,
           COALESCE(sd.sleeved_count, 0) AS sleeved_count,
           COALESCE(o.owned_count, 0) AS owned_count,
           COALESCE(cd.claim_deck_ids, '{}') AS claim_deck_ids,
           COALESCE(sd.sleeved_deck_ids, '{}') AS sleeved_deck_ids
    FROM printings p
    LEFT JOIN claim_demand cd ON cd.printing_id = p.printing_id
    LEFT JOIN sleeved_demand sd ON sd.printing_id = p.printing_id
    LEFT JOIN owned o ON o.printing_id = p.printing_id
    LEFT JOIN LATERAL (
      SELECT dc.card_name
      FROM public.deck_cards dc
      WHERE dc.user_id = p_user_id AND dc.scryfall_id = p.printing_id
      LIMIT 1
    ) sd_name ON true
  ),
  conflicts AS (
    SELECT *,
           (claim_count + sleeved_count) AS total_sleeved
    FROM combined
    WHERE (claim_count + sleeved_count) > owned_count
  ),
  enriched AS (
    SELECT cf.printing_id,
           cf.card_name,
           cf.owned_count,
           cf.total_sleeved,
           (
             SELECT jsonb_agg(jsonb_build_object('deckId', d.id, 'deckName', d.name, 'source', src.source))
             FROM (
               SELECT unnest(cf.claim_deck_ids) AS deck_id, 'claim' AS source
               UNION ALL
               SELECT unnest(cf.sleeved_deck_ids) AS deck_id, 'sleeved' AS source
             ) src
             JOIN public.decks d ON d.id = src.deck_id
           ) AS decks
    FROM conflicts cf
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'printingId', e.printing_id,
           'cardName', e.card_name,
           'owned', e.owned_count,
           'sleeved', e.total_sleeved,
           'decks', COALESCE(e.decks, '[]'::jsonb)
         ) ORDER BY e.card_name), '[]'::jsonb)
  INTO v_result
  FROM enriched e;

  RETURN jsonb_build_object('success', true, 'conflicts', v_result);
END;
$function$;;
