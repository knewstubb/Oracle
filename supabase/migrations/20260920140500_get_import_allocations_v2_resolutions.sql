-- get_import_allocations v2: intent-aware, batch-scoped, and LISTED-ONLY output.
--
-- Changes from the unowned-state version:
--   1. Demand counts only claims whose recorded intent is 'sleeve'. A deck that
--      decided Release/Proxy no longer competes for a real copy, so the card
--      flips to resolved the moment supply covers the remaining claims — and
--      flipping one back to 'sleeve' re-introduces the conflict instantly.
--   2. Scoped to one import run via p_batch_id (fallback: unsettled claims).
--      Claims left over from an earlier run can never inflate this run's numbers.
--   3. Three-value `state`, replacing 'balanced':
--        'over'     — owned > 0 and demand > owned       (amber conflict)
--        'unowned'  — owned = 0 with sleeve intent       (pink, unowned)
--        'resolved' — demand fits within supply          (green when listed)
--   4. `decidedCount` per card = slots with a non-sleeve decision. The client
--      lists a card iff state IN ('over','unowned') OR decidedCount > 0:
--      genuinely-covered cards that the user never touched (the old 953) are
--      omitted, while resolved-by-decision cards stay visible in green so the
--      decision remains reversible.
--   5. Each deck entry carries its `resolution`, so the UI can render a per-deck
--      Sleeve/Release/Proxy control. 'sleeved' rows (already-physical copies)
--      are state, not intent, and remain account-wide.
--
-- (Per-card advisory locks are not needed here: this is a read; finalize holds
-- the write-side locks per card.)
DROP FUNCTION IF EXISTS public.get_import_allocations(uuid);

CREATE FUNCTION public.get_import_allocations(
  p_user_id  uuid,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH scope AS (
    SELECT * FROM public.import_sleeve_claims
    WHERE user_id = p_user_id
      AND CASE
            WHEN p_batch_id IS NOT NULL THEN batch_id = p_batch_id
            ELSE settled_at IS NULL
          END
  ),
  claimed_cards AS (
    SELECT DISTINCT card_name FROM scope
  ),
  sleeve_demand AS (
    SELECT card_name, count(*)::int AS claim_count
    FROM scope
    WHERE resolution = 'sleeve'
    GROUP BY card_name
  ),
  decided AS (
    SELECT card_name,
           count(*) FILTER (WHERE resolution <> 'sleeve')::int AS decided_count
    FROM scope
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
           COALESCE(sdl.claim_count, 0)  AS sleeve_claim_count,
           COALESCE(sld.sleeved_count, 0) AS sleeved_count,
           COALESCE(o.owned_count, 0)     AS owned_count,
           COALESCE(dc2.decided_count, 0) AS decided_count
    FROM claimed_cards cc
    LEFT JOIN sleeve_demand  sdl ON sdl.card_name = cc.card_name
    LEFT JOIN sleeved_demand sld ON sld.card_name = cc.card_name
    LEFT JOIN owned          o   ON o.card_name   = cc.card_name
    LEFT JOIN decided        dc2 ON dc2.card_name = cc.card_name
  ),
  enriched AS (
    SELECT cm.card_name,
           cm.owned_count,
           (cm.sleeve_claim_count + cm.sleeved_count) AS demand,
           cm.decided_count,
           CASE
             WHEN cm.owned_count = 0 AND cm.sleeve_claim_count > 0 THEN 'unowned'
             WHEN cm.owned_count > 0
                  AND (cm.sleeve_claim_count + cm.sleeved_count) > cm.owned_count THEN 'over'
             ELSE 'resolved'
           END AS state,
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'claim',
                      'claimId', s.id, 'deckCardsId', s.deck_cards_id,
                      'resolution', s.resolution
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM scope s
             JOIN public.decks d ON d.id = s.deck_id
             WHERE s.card_name = cm.card_name
           )
           ||
           (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'deckId', d.id, 'deckName', d.name, 'source', 'sleeved',
                      'claimId', null, 'deckCardsId', dc3.id,
                      'resolution', 'sleeve'
                    ) ORDER BY d.name), '[]'::jsonb)
             FROM public.deck_cards dc3
             JOIN public.user_copies uc ON uc.id = dc3.copy_id
             JOIN public.decks d ON d.id = dc3.deck_id
             WHERE dc3.user_id = p_user_id AND dc3.card_name = cm.card_name
               AND dc3.copy_id IS NOT NULL AND dc3.ownership_status = 'original'
               AND uc.is_proxy = false
           ) AS decks
    FROM combined cm
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'cardName', e.card_name,
           'owned', e.owned_count,
           'sleeved', e.demand,
           'state', e.state,
           'overAllocated', e.state = 'over',
           'decidedCount', e.decided_count,
           'decks', COALESCE(e.decks, '[]'::jsonb)
         ) ORDER BY (e.state = 'over') DESC, (e.state = 'unowned') DESC,
                    (e.state = 'resolved') ASC, e.card_name),
         '[]'::jsonb)
  INTO v_result
  FROM enriched e;

  RETURN jsonb_build_object('success', true, 'allocations', v_result);
END;
$function$;;