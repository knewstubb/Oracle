-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves. Author: Architect, 2026-11-22.
-- Feature: rename a deck and reorder decks (UX-05, UX-03). Brief: docs/oracle/briefs/deck-rename-and-reorder.md. Audit: docs/oracle/reports/2026-11-20-architect-deck-rename-reorder-audit.md
-- Contract: docs/oracle/contracts/deck-rename-and-reorder.md
-- Numbered after the latest applied migration, 20261121100000_deck_health_settings (docs/oracle/status.md, supabase/migrations/).
-- Rollback: supabase/drafts/20261122120000_deck_order.rollback.sql (reversible; refuses once the owner has reordered, unless told to).
--
-- What this does (and only this):
--   1. decks.position: one whole number per deck. ONE saved order for the whole list of one user's decks (not one per status group).
--   2. Fills it from today's A to Z order (name, then id), per user, numbered 1, 2, 3... so nothing looks different before the first drag.
--   3. A new deck goes to the end: a trigger gives any new deck without a position "highest + 1" for its owner. This covers every
--      create path (app create, import, brew save, Claude create) without touching them. A path may still pass its own position.
--   4. move_decks(user, full list of deck ids): the all-or-nothing save of a drag. service_role only.
-- Not destructive: one added column, one index, one trigger, one function. No row is deleted; no value other than position is written.
-- Names are NOT touched: rename needs no stored-data change (it is a plain update of decks.name by the owner-checked route).
-- Room for Claude renaming later: nothing here blocks it. A later change adds a 'deck_rename' kind to ai_change_log (which already
-- records who made a change and the old/new values), without touching this file.
-- Identifier note (D-003): decks.id is the deck's own integer id. No card identifier is used.
-- Multi-user: position is per user_id (every deck row already carries user_id); numbering and the function are scoped to one user.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'position') THEN
    RAISE EXCEPTION 'decks.position already exists';
  END IF;
END $$;

-- 1 + 2. Column, filled from A to Z, then required.
ALTER TABLE public.decks ADD COLUMN position integer;
COMMENT ON COLUMN public.decks.position IS 'Saved deck order, 1 = first. One list per user_id, not per status. Set by move_decks(); new decks get max+1 from trigger decks_set_position. Not a card identifier.';

UPDATE public.decks d
   SET position = n.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY name, id) AS rn FROM public.decks) n
 WHERE d.id = n.id;

ALTER TABLE public.decks ALTER COLUMN position SET NOT NULL;
ALTER TABLE public.decks ADD CONSTRAINT decks_position_positive CHECK (position >= 1);
CREATE INDEX decks_user_position_idx ON public.decks (user_id, position, id);

-- 3. New deck goes to the end. The per-user advisory lock stops two decks created at once from getting the same number.
CREATE FUNCTION public.decks_set_position() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.position IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('decks_position:' || NEW.user_id::text));
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position FROM public.decks WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER decks_set_position BEFORE INSERT ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.decks_set_position();
REVOKE ALL ON FUNCTION public.decks_set_position() FROM PUBLIC, anon, authenticated;

-- 4. The save of a drag. p_deck_ids = the owner's WHOLE deck list in the new order, first to last.
--    One transaction: every position is rewritten or none is. Refuses (and changes nothing) when the list is not exactly the
--    owner's decks (a deck is missing, repeated, unknown, someone else's, or a deck was created/deleted since the screen loaded).
--    Errors (message text): deck_order_empty, deck_order_duplicate, deck_order_mismatch.
--    Returns {"ok": true, "count": n}. Writes only decks.position.
CREATE FUNCTION public.move_decks(p_user_id uuid, p_deck_ids integer[]) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_user_id IS NULL OR p_deck_ids IS NULL OR COALESCE(array_length(p_deck_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'deck_order_empty';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('decks_position:' || p_user_id::text));
  IF array_position(p_deck_ids, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT x) FROM unnest(p_deck_ids) x) <> array_length(p_deck_ids, 1) THEN
    RAISE EXCEPTION 'deck_order_duplicate';
  END IF;
  IF (SELECT count(*) FROM public.decks WHERE user_id = p_user_id) <> array_length(p_deck_ids, 1)
     OR EXISTS (SELECT 1 FROM unnest(p_deck_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.decks WHERE id = x AND user_id = p_user_id)) THEN
    RAISE EXCEPTION 'deck_order_mismatch';
  END IF;
  UPDATE public.decks d
     SET position = u.ord::integer
    FROM unnest(p_deck_ids) WITH ORDINALITY AS u(id, ord)
   WHERE d.id = u.id AND d.user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.move_decks(uuid, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_decks(uuid, integer[]) TO service_role;
COMMIT;
-- Rehearsal: supabase/drafts/20261122120000_deck_order.rehearsal.sql (throwaway Postgres only; see the report).
-- DRAFT. NOT APPLIED. Needs owner approval.
