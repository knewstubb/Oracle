-- get_import_allocations: return EVERY card that currently has open sleeve
-- claims (equal-footing reconciliation view), not just over-allocated ones.
-- Each card reports owned (by identity), sleeved (open claims + any finalized),
-- an overAllocated flag, and every deck as an editable claim. During the import
-- screen nothing is pre-sleeved, so decks come from claims; finalized sleeves
-- (if any) are included for completeness with claimId null.
CREATE OR REPLACE FUNCTION public.get_import_allocations(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  claimed_cards AS (
    SELECT DISTINCT card_name FROM public.import_sleeve_claims WHERE user_id = p_user_id
  ),
  claim_demand AS (
    SELECT card_name, count(*)::int AS claim_count
    FROM public.import_sleeve_claims WHERE user_id = p_user_id
    GROUP BY card_name
  ),
  sleeved_demand AS (
    SELECT dc.card_name, count(*)::int AS sleeved_count
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id AND dc.copy_id IS NOT NULL
      AND dc.ownership_status = 'original' AND uc.is_proxy = false
    GROUP BY dc.card_name
  ),
  owned AS (
    SELECT ucard.card_name, count(*)::int AS owned_count
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id AND uc.is_proxy = false AND uc.missing = false
    GROUP BY ucard.card_name
  ),
  combined AS (
    SELECT cc.card_name,
           COALESCE(cd.claim_count, 0) AS claim_count,
           COALESCE(sd.sleeved_count, 0) AS sleeved_count,
           COALESCE(o.owned_count, 0) AS owned_count
    FROM claimed_cards cc
    LEFT JOIN claim_demand cd ON cd.card_name = cc.card_name
    LEFT JOIN sleeved_demand sd ON sd.card_name = cc.card_name
    LEFT JOIN owned o ON o.card_name = cc.card_name
  ),
  enriched AS (
    SELECT cm.card_name,
           cm.owned_count,
           (cm.claim_count + cm.sleeved_count) AS total_sleeved,
           ((cm.claim_count + cm.sleeved_count) > cm.owned_count) AS over_allocated,
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'claim',
                      'claimId', ic.id, 'deckCardsId', ic.deck_cards_id
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.import_sleeve_claims ic
             JOIN public.decks d ON d.id = ic.deck_id
             WHERE ic.user_id = p_user_id AND ic.card_name = cm.card_name
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
             WHERE dc.user_id = p_user_id AND dc.card_name = cm.card_name
               AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
               AND uc.is_proxy = false
           ) AS decks
    FROM combined cm
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cardName', e.card_name,
           'owned', e.owned_count,
           'sleeved', e.total_sleeved,
           'overAllocated', e.over_allocated,
           'decks', COALESCE(e.decks, '[]'::jsonb)
         ) ORDER BY e.over_allocated DESC, e.card_name), '[]'::jsonb)
  INTO v_result
  FROM enriched e;

  RETURN jsonb_build_object('success', true, 'allocations', v_result);
END;
$function$;;
