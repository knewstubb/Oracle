-- get_import_allocations: distinguish "not owned" from "over-committed".
--
-- WHY: over_allocated was ((claim_count + sleeved_count) > owned_count). For any
-- card the user owns ZERO copies of, that is 1 > 0 — always true — so every
-- unowned card in every imported deck was reported as an over-allocated
-- "conflict". That conflates two distinct states from the allocation taxonomy:
--
--   Unowned      — owns nothing of this card. Not a conflict: there is no real
--                  copy being double-booked, and no surplus to Release. The only
--                  sensible actions are Proxy (sleeve a proxy) or show as Planned.
--   Over-commit  — owns >= 1 copy, but more slots claim/sleeve it than copies
--                  exist. This is the genuine reconciliation conflict.
--
-- The summary must therefore report three states, not two:
--   'over'      — owned > 0 and demand > owned   (amber, real conflict)
--   'balanced'  — owned > 0 and demand <= owned  (teal, nothing to do)
--   'unowned'   — owned = 0                      (neutral, not a conflict)
--
-- This still returns EVERY claimed card (the equal-footing view is unchanged —
-- nothing is pre-sleeved and every deck stays editable). `overAllocated` is kept
-- for backwards compatibility but is now true only for genuine over-commitments,
-- so any consumer that has not yet learned about `state` gets the corrected
-- meaning for free. Ordering puts genuine conflicts first, unowned last.
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
           CASE
             WHEN cm.owned_count = 0 THEN 'unowned'
             WHEN (cm.claim_count + cm.sleeved_count) > cm.owned_count THEN 'over'
             ELSE 'balanced'
           END AS state,
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
           'state', e.state,
           'overAllocated', e.state = 'over',
           'decks', COALESCE(e.decks, '[]'::jsonb)
         ) ORDER BY (e.state = 'over') DESC, (e.state = 'unowned') ASC, e.card_name),
         '[]'::jsonb)
  INTO v_result
  FROM enriched e;

  RETURN jsonb_build_object('success', true, 'allocations', v_result);
END;
$function$;;
