-- finalize_import_claims: the SINGLE materializer. Runs on "Go to Decks" only.
--
-- Applies each claim's recorded intent for cards that are fully within supply:
--   'sleeve'  -> assign a distinct owned copy (retagging the slot to that printing)
--   'proxy'   -> create a printing-matched proxy copy and sleeve it
--   'release' -> drop the claim; the slot stays Planned
-- Cards still over-committed keep EVERY claim untouched and editable, and get
-- settled_at stamped so the unresolved conflict survives as a durable record for
-- the cross-page badge (instead of silently disappearing).
--
-- Scoped to one import run via p_batch_id, so claims left over from an earlier
-- import can never be materialized or inflated into a later run.
--
-- Unlike the old proxy path, this can now proxy a card the user owns ZERO copies
-- of: it resolves the oracle_id from ref_printings and creates the user_cards
-- identity row if missing. (The removed proxy RPC raised 'card_identity_not_found'
-- in that case, which made the Proxy action unusable for exactly the unowned cards
-- the reconciliation list surfaces.)
DROP FUNCTION IF EXISTS public.finalize_import_claims(uuid, text);

CREATE FUNCTION public.finalize_import_claims(
  p_user_id  uuid,
  p_batch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_card             text;
  v_owned            int;
  v_finalized        int;
  v_sleeve_claims    int;
  v_claim            RECORD;
  v_free             RECORD;
  v_card_id          int;
  v_oracle_id        uuid;
  v_new_proxy_id     int;
  v_finalized_count  int := 0;
  v_proxied_count    int := 0;
  v_released_count   int := 0;
  v_left_open_count  int := 0;
BEGIN
  FOR v_card IN
    SELECT DISTINCT card_name
    FROM public.import_sleeve_claims
    WHERE user_id = p_user_id
      AND CASE
            WHEN p_batch_id IS NOT NULL THEN batch_id = p_batch_id
            ELSE settled_at IS NULL
          END
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('import-card:' || v_card, 0));

    -- Real copies owned of this card, any printing.
    SELECT count(*) INTO v_owned
    FROM public.user_copies uc
    JOIN public.user_cards ucard ON ucard.id = uc.card_id
    WHERE uc.user_id = p_user_id AND ucard.card_name = v_card
      AND uc.is_proxy = false AND uc.missing = false;

    -- Real copies already sleeved somewhere (proxies do not consume real supply).
    SELECT count(*) INTO v_finalized
    FROM public.deck_cards dc
    JOIN public.user_copies uc ON uc.id = dc.copy_id
    WHERE dc.user_id = p_user_id AND dc.card_name = v_card
      AND dc.copy_id IS NOT NULL AND dc.ownership_status = 'original'
      AND uc.is_proxy = false;

    -- Only claims that still want a real copy count against supply; released and
    -- proxied claims no longer compete for one.
    SELECT count(*) INTO v_sleeve_claims
    FROM public.import_sleeve_claims
    WHERE user_id = p_user_id AND card_name = v_card AND resolution = 'sleeve'
      AND CASE
            WHEN p_batch_id IS NOT NULL THEN batch_id = p_batch_id
            ELSE settled_at IS NULL
          END;

    IF (v_finalized + v_sleeve_claims) <= v_owned THEN
      -- Fully covered: apply every decision for this card.
      FOR v_claim IN
        SELECT c.id AS claim_id, c.deck_cards_id, c.printing_id, c.resolution
        FROM public.import_sleeve_claims c
        WHERE c.user_id = p_user_id AND c.card_name = v_card
          AND CASE
                WHEN p_batch_id IS NOT NULL THEN c.batch_id = p_batch_id
                ELSE c.settled_at IS NULL
              END
        ORDER BY c.id
      LOOP
        IF v_claim.resolution = 'release' THEN
          DELETE FROM public.import_sleeve_claims WHERE id = v_claim.claim_id;
          v_released_count := v_released_count + 1;

        ELSIF v_claim.resolution = 'proxy' THEN
          -- Identify the card. Fall back to creating the identity row so an
          -- unowned card can still be proxied.
          SELECT id INTO v_card_id
          FROM public.user_cards
          WHERE user_id = p_user_id AND card_name = v_card
          ORDER BY id LIMIT 1;

          IF v_card_id IS NULL AND NULLIF(btrim(v_claim.printing_id), '') IS NOT NULL THEN
            SELECT rp.oracle_id INTO v_oracle_id
            FROM public.ref_printings rp
            WHERE rp.scryfall_id::text = btrim(v_claim.printing_id)
            LIMIT 1;

            IF v_oracle_id IS NOT NULL THEN
              INSERT INTO public.user_cards (oracle_id, card_name, user_id)
              VALUES (v_oracle_id, v_card, p_user_id)
              ON CONFLICT (oracle_id, user_id) DO NOTHING
              RETURNING id INTO v_card_id;

              IF v_card_id IS NULL THEN
                SELECT id INTO v_card_id
                FROM public.user_cards
                WHERE user_id = p_user_id AND oracle_id = v_oracle_id
                LIMIT 1;
              END IF;
            END IF;
          END IF;

          IF v_card_id IS NULL THEN
            -- No identity resolvable (unsynced printing): leave the claim open and
            -- settled rather than dropping the user's decision.
            UPDATE public.import_sleeve_claims
            SET settled_at = COALESCE(settled_at, now())
            WHERE id = v_claim.claim_id;
            v_left_open_count := v_left_open_count + 1;
          ELSE
            INSERT INTO public.user_copies (card_id, printing_id, is_proxy, user_id, source_tag, finish)
            VALUES (v_card_id, v_claim.printing_id, true, p_user_id, 'import-conflict-proxy', 'nonfoil')
            RETURNING id INTO v_new_proxy_id;

            UPDATE public.deck_cards
            SET copy_id = v_new_proxy_id, ownership_status = 'proxy'
            WHERE id = v_claim.deck_cards_id AND user_id = p_user_id;

            DELETE FROM public.import_sleeve_claims WHERE id = v_claim.claim_id;
            v_proxied_count := v_proxied_count + 1;
            v_new_proxy_id := NULL;
          END IF;

        ELSIF v_claim.resolution = 'sleeve' THEN
          -- Assign a distinct real copy. Because (finalized + sleeve_claims) <= owned,
          -- one free copy must exist per claim; the guard below is only data-drift
          -- insurance (same EXIT semantics as the previous finalize).
          SELECT uc.id AS copy_id, uc.printing_id
          INTO v_free
          FROM public.user_copies uc
          JOIN public.user_cards ucard ON ucard.id = uc.card_id
          WHERE uc.user_id = p_user_id AND ucard.card_name = v_card
            AND uc.is_proxy = false AND uc.missing = false
            AND NOT EXISTS (SELECT 1 FROM public.deck_cards dc WHERE dc.copy_id = uc.id)
          ORDER BY uc.id
          LIMIT 1;

          IF v_free.copy_id IS NOT NULL THEN
            UPDATE public.deck_cards
            SET copy_id = v_free.copy_id,
                ownership_status = 'original',
                scryfall_id = COALESCE(v_free.printing_id, scryfall_id)
            WHERE id = v_claim.deck_cards_id AND user_id = p_user_id;

            DELETE FROM public.import_sleeve_claims WHERE id = v_claim.claim_id;
            v_finalized_count := v_finalized_count + 1;
            v_free := NULL;
          ELSE
            EXIT;
          END IF;
        END IF;
      END LOOP;
    ELSE
      -- Still over-committed (or unowned with sleeve intent): materialize NOTHING.
      -- Keep every claim intact and editable, but stamp settled_at so this run's
      -- unresolved conflicts become the durable record behind the cross-page badge.
      UPDATE public.import_sleeve_claims
      SET settled_at = COALESCE(settled_at, now())
      WHERE user_id = p_user_id AND card_name = v_card AND resolution = 'sleeve'
        AND CASE
              WHEN p_batch_id IS NOT NULL THEN batch_id = p_batch_id
              ELSE settled_at IS NULL
            END;
      v_left_open_count := v_left_open_count + v_sleeve_claims;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',          true,
    'finalized_count',  v_finalized_count,
    'proxied_count',    v_proxied_count,
    'released_count',   v_released_count,
    'left_open_count',  v_left_open_count
  );
END;
$function$;;

