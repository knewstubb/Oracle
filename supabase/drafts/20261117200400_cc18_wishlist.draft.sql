-- DRAFT. NOT APPLIED. Needs owner approval. Independent of the other drafts (no ai_change_log kind needed). Author: Architect, CC-18, 2026-11-17.
-- Report: docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md  (DB-E, built LAST; the read-only buying list needs no database change)
-- Not run against any database; throwaway run is the gate.
--
-- ONE new table: wishlist_items. A wishlist is a list of cards the owner WANTS to buy. It is NOT the collection: a row here adds no copy,
-- affects no count, no deck state and no allocation (same as the existing per-instance flag import_sleeve_claims.wishlist, which stays as is).
-- Primary key: id (bigint identity). Owner: user_id uuid -> auth.users ON DELETE CASCADE. RLS on, own rows only (D-multi-user).
-- Identifier columns: oracle_id = canonical card (the thing wanted); printing_id = a specific printing's scryfall_id, optional (D-003).
-- Unique: one ACTIVE row per (user, oracle_id, finish, printing_id-or-empty) so asking twice raises the quantity instead of duplicating.
-- Index: (user_id, removed_at) for the list; (user_id, deck_id) for "wanted for this deck".
-- Nothing is hard-deleted: "remove" sets removed_at. Claude may remove only rows it added (added_by = 'claude'); the owner may remove any.
-- Reversible: DROP TABLE wishlist_items (only data in it is wishlist rows; none exist before this).
BEGIN;
CREATE TABLE public.wishlist_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid    NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  oracle_id    text    NOT NULL,                        -- oracle_id (canonical card, not a printing)
  card_name    text    NOT NULL,                        -- display only
  printing_id  text,                                    -- scryfall_id of a wanted printing; NULL = any printing
  finish       text    NOT NULL DEFAULT 'nonfoil' CHECK (finish IN ('nonfoil','foil','etched')),
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  deck_id      integer REFERENCES public.decks (id) ON DELETE SET NULL,   -- optional: wanted for this deck
  note         text    CHECK (note IS NULL OR length(note) <= 300),
  added_by     text    NOT NULL CHECK (added_by IN ('owner','claude')),
  connection_id uuid   REFERENCES public.connector_connections (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  removed_at   timestamptz,
  removed_by   text    CHECK (removed_by IN ('owner','claude')),
  CONSTRAINT wishlist_removed_pair CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE UNIQUE INDEX wishlist_items_active_uniq ON public.wishlist_items (user_id, oracle_id, finish, COALESCE(printing_id, '')) WHERE removed_at IS NULL;
CREATE INDEX wishlist_items_user_active ON public.wishlist_items (user_id, removed_at);
CREATE INDEX wishlist_items_user_deck ON public.wishlist_items (user_id, deck_id) WHERE deck_id IS NOT NULL;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY wishlist_items_own ON public.wishlist_items FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.wishlist_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.wishlist_items TO authenticated;   -- no DELETE grant: nothing is ever hard-deleted
GRANT ALL ON public.wishlist_items TO service_role;

-- Claude's door. One transaction per call; up to 100 cards per call; at most 500 active rows per user (stops runaway).
CREATE OR REPLACE FUNCTION public.ai_wishlist_add(p_user_id uuid, p_connection_id uuid, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; v_n integer := COALESCE(jsonb_array_length(p_items), 0); v_added integer := 0; v_raised integer := 0;
BEGIN
  PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  IF v_n = 0 OR v_n > 100 THEN PERFORM public._ai_fail('bad_item_count'); END IF;
  IF (SELECT count(*) FROM wishlist_items WHERE user_id = p_user_id AND removed_at IS NULL) + v_n > 500 THEN PERFORM public._ai_fail('wishlist_full'); END IF;
  IF p_items @? '$[*] ? (!exists(@.oracle_id))' THEN PERFORM public._ai_fail('missing_oracle_id'); END IF;
  IF p_items @? '$[*].deck_id' THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE e->>'deck_id' IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = (e->>'deck_id')::int AND d.user_id = p_user_id)) THEN PERFORM public._ai_fail('deck_not_found'); END IF;
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO wishlist_items (user_id, oracle_id, card_name, printing_id, finish, quantity, deck_id, note, added_by, connection_id)
    VALUES (p_user_id, it->>'oracle_id', it->>'card_name', NULLIF(it->>'printing_id', ''), COALESCE(it->>'finish', 'nonfoil'),
            COALESCE((it->>'quantity')::int, 1), NULLIF(it->>'deck_id', '')::int, left(it->>'note', 300), 'claude', p_connection_id)
    ON CONFLICT (user_id, oracle_id, finish, COALESCE(printing_id, '')) WHERE removed_at IS NULL
    DO UPDATE SET quantity = LEAST(99, wishlist_items.quantity + EXCLUDED.quantity);
    IF FOUND THEN v_added := v_added + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'count', v_added);
END $$;

CREATE OR REPLACE FUNCTION public.ai_wishlist_remove(p_user_id uuid, p_connection_id uuid, p_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  UPDATE wishlist_items SET removed_at = now(), removed_by = 'claude'
   WHERE user_id = p_user_id AND id = ANY (p_ids) AND removed_at IS NULL AND added_by = 'claude';   -- only what Claude itself added
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'count', v_n);
END $$;
REVOKE ALL ON FUNCTION public.ai_wishlist_add(uuid, uuid, jsonb), public.ai_wishlist_remove(uuid, uuid, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_wishlist_add(uuid, uuid, jsonb), public.ai_wishlist_remove(uuid, uuid, bigint[]) TO service_role;
COMMIT;
-- Rollback (separate file): DROP FUNCTION the two; DROP TABLE public.wishlist_items (refuse if any row exists with added_by = 'owner').
