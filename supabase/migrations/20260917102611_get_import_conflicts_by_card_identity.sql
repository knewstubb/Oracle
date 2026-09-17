-- Conflicts keyed on CARD IDENTITY (card_name): a conflict exists when the
-- number of decks sleeving a card (open claims + finalized real sleeves)
-- exceeds the real copies owned of that card (any printing).
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
    SELECT c.card_name, count(*)::int AS claim_count
    FROM public.import_sleeve_claims c
    WHERE c.user_id = p_user_id
    GROUP BY c.card_name
  ),
  sleeved_demand AS (
    SELECT dc.card_name, count(*)::int AS sleeved_count
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id
      AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
      AND uc.is_proxy = false
    GROUP BY dc.card_name
  ),
  owned AS (
    SELECT ucard.card_name, count(*)::int AS owned_count
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id
      AND uc.is_proxy = false AND uc.missing = false
    GROUP BY ucard.card_name
  ),
  cards AS (
    SELECT card_name FROM claim_demand
    UNION
    SELECT card_name FROM sleeved_demand
  ),
  combined AS (
    SELECT c.card_name,
           COALESCE(cd.claim_count, 0) AS claim_count,
           COALESCE(sd.sleeved_count, 0) AS sleeved_count,
           COALESCE(o.owned_count, 0) AS owned_count
    FROM cards c
    LEFT JOIN claim_demand cd ON cd.card_name = c.card_name
    LEFT JOIN sleeved_demand sd ON sd.card_name = c.card_name
    LEFT JOIN owned o ON o.card_name = c.card_name
  ),
  conflicts AS (
    SELECT *, (claim_count + sleeved_count) AS total_sleeved
    FROM combined
    WHERE (claim_count + sleeved_count) > owned_count
  ),
  enriched AS (
    SELECT cf.card_name,
           cf.owned_count,
           cf.total_sleeved,
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'claim',
                      'claimId', ic.id, 'deckCardsId', ic.deck_cards_id
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.import_sleeve_claims ic
             JOIN public.decks d ON d.id = ic.deck_id
             WHERE ic.user_id = p_user_id AND ic.card_name = cf.card_name
           )
           ||
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'sleeved',
                      'claimId', null, 'deckCardsId', dc.id
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.deck_cards dc
             JOIN public.user_copies uc ON uc.id = dc.copy_id
             JOIN public.decks d ON d.id = dc.deck_id
             WHERE dc.user_id = p_user_id AND dc.card_name = cf.card_name
               AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
               AND uc.is_proxy = false
           ) AS decks
    FROM conflicts cf
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
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
