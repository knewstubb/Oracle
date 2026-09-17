-- Include claim_id (and deck_cards_id) per deck ref so the resolution UI can
-- Release/Convert a specific slot. Already-finalized sleeves have claim_id null
-- (not directly resolvable here; the user resolves the open claims instead).
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
  claim_demand AS (
    SELECT c.printing_id,
           c.card_name,
           count(*)::int AS claim_count
    FROM public.import_sleeve_claims c
    WHERE c.user_id = p_user_id
      AND c.printing_id IS NOT NULL
    GROUP BY c.printing_id, c.card_name
  ),
  sleeved_demand AS (
    SELECT dc.scryfall_id AS printing_id,
           count(*)::int AS sleeved_count
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id
      AND dc.copy_id IS NOT NULL
      AND dc.ownership_status = 'original'
      AND dc.scryfall_id IS NOT NULL
      AND uc.is_proxy = false
    GROUP BY dc.scryfall_id
  ),
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
           COALESCE(o.owned_count, 0) AS owned_count
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
    SELECT *, (claim_count + sleeved_count) AS total_sleeved
    FROM combined
    WHERE (claim_count + sleeved_count) > owned_count
  ),
  enriched AS (
    SELECT cf.printing_id,
           cf.card_name,
           cf.owned_count,
           cf.total_sleeved,
           (
             -- Open claims (resolvable): include claim_id + deck_cards_id
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id,
                      'deckName', d.name,
                      'source', 'claim',
                      'claimId', ic.id,
                      'deckCardsId', ic.deck_cards_id
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.import_sleeve_claims ic
             JOIN public.decks d ON d.id = ic.deck_id
             WHERE ic.user_id = p_user_id AND ic.printing_id = cf.printing_id
           )
           ||
           (
             -- Already-finalized real sleeves (not directly resolvable): claim_id null
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id,
                      'deckName', d.name,
                      'source', 'sleeved',
                      'claimId', null,
                      'deckCardsId', dc.id
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.deck_cards dc
             JOIN public.user_copies uc ON uc.id = dc.copy_id
             JOIN public.decks d ON d.id = dc.deck_id
             WHERE dc.user_id = p_user_id AND dc.scryfall_id = cf.printing_id
               AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
               AND uc.is_proxy = false
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
