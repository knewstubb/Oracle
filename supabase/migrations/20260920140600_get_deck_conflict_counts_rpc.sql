-- get_deck_conflict_counts: per-deck unresolved-conflict counts for the deck-list
-- badge ("what happens if I leave these unresolved on the summary screen").
--
-- A deck has an unresolved conflict when it still asserts a SLEEVED real copy of
-- a card whose demand exceeds supply — i.e. a claim with resolution = 'sleeve'
-- (open OR settled; settled claims are exactly what finalize leaves behind for
-- conflicts the user chose not to resolve) on a card where
--   demand (all sleeve-intent claims account-wide + already-sleeved originals)
--     > owned (real, non-proxy, non-missing copies).
--
-- Claims with resolution 'release'/'proxy' represent decisions, not demand, and
-- never count. Decks with zero unresolved conflicts are omitted; the client
-- treats a missing deck as count 0.
CREATE FUNCTION public.get_deck_conflict_counts(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  WITH demand AS (
    SELECT c.card_name, count(*)::int AS claim_count
    FROM public.import_sleeve_claims c
    WHERE c.user_id = p_user_id AND c.resolution = 'sleeve'
    GROUP BY c.card_name
  ),
  sleeved AS (
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
  unmet_cards AS (
    SELECT d.card_name
    FROM demand d
    LEFT JOIN sleeved s ON s.card_name = d.card_name
    LEFT JOIN owned  o ON o.card_name = d.card_name
    WHERE d.claim_count + COALESCE(s.sleeved_count, 0) > COALESCE(o.owned_count, 0)
  ),
  per_deck AS (
    SELECT c.deck_id,
           count(*)::int AS conflict_count,
           jsonb_agg(DISTINCT c.card_name ORDER BY c.card_name) AS cards
    FROM public.import_sleeve_claims c
    JOIN unmet_cards u ON u.card_name = c.card_name
    WHERE c.user_id = p_user_id AND c.resolution = 'sleeve'
    GROUP BY c.deck_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'deckId', pd.deck_id,
           'count', pd.conflict_count,
           'cards', pd.cards
         ) ORDER BY pd.conflict_count DESC, pd.deck_id), '[]'::jsonb)
  INTO v_result
  FROM per_deck pd;

  RETURN jsonb_build_object('success', true, 'decks', v_result);
END;
$function$;;