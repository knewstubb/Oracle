-- DRAFT. NOT APPLIED. Needs owner approval; Gene applies (branch/throwaway first). Author: Architect, CC-13, 2026-11-17.
-- Contract: docs/oracle/contracts/claude-connector-cc13-amendment.md
-- Rollback: supabase/drafts/20261117100000_cc13_loosen_limits.rollback.sql (restores the old bodies; no data is touched).
-- Reversible: yes. Replaces THREE functions only; no table, column, constraint or data change. Not run against a database yet
-- (no local Postgres), so the Tester runs the live checks in the contract section 7 before this goes live.
--
-- What changes:
--  1. _ai_limits(): direct_max 10 -> 120, hourly_max 40 -> 500, max_request 60 -> 200, claude_undo_max 10 -> 200, NEW split_max 200.
--     ai_undo_group (150100) and ai_undo_group (190000, deck_category wrapper) read claude_undo_max from here, so NO undo function
--     needs replacing for the Claude-side limit. Oracle-side Undo (p_actor = 'owner') has never had a size cap.
--  2. _ai_gate(): a card move (copy_move) no longer always waits; it goes through the same size/split/hourly checks as any edit.
--     The "recent total in one deck" rule now compares with split_max (200), not direct_max, or "build a deck, then tweak it" would wait.
--  3. ai_list_recent_changes(): was LIMIT 300 ROWS (cut a big group in half and hid older groups that are still undoable).
--     Now limited by GROUPS (newest 50) with a row safety cap, and works out the undo blocker once per group.
--     Output shape is unchanged (same fields as 190000), so the screen and the tool keep working.
--
-- Unchanged on purpose: pending_hours 24, max_waiting 20, split_window_minutes 30, undo_days 7, reason value 'over_ten'
-- (a CHECK constraint on ai_pending_changes.reason lists it; the name is now historical: it means "over the one-request limit").
-- Existing waiting requests (including card moves) stay approvable/declinable/expirable exactly as before.

BEGIN;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Constants. KEEP IN STEP with src/lib/connector/edit-config.ts and the contract types (a test asserts all three equal).
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_limits() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'direct_max', 120,           -- up to this many cards in one request go straight through (was 10)
    'split_window_minutes', 30,  -- direct edits to ONE deck in this window add up
    'split_max', 200,            -- ...and wait if that running total would pass this (NEW; was direct_max)
    'hourly_max', 500,           -- direct edits by Claude in any hour (all decks); beyond this they wait (was 40)
    'undo_days', 7,
    'pending_hours', 24,
    'max_waiting', 20,           -- most requests that may wait at once per user
    'max_request', 200,          -- most cards in one request; 121..200 wait for the owner (was 60)
    'claude_undo_max', 200       -- Claude may undo groups of this many rows or fewer (was 10); equals max_request
  )
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Gate. Moves are no longer special.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_gate(p_user_id uuid, p_action text, p_deck_id integer, p_n integer) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_lim jsonb := public._ai_limits(); v_recent integer; v_hour integer;
BEGIN
  -- CC-13: no "ALWAYS waits" line for copy_move any more. 'card_move' stays a legal reason for rows queued before this change.
  IF p_n > (v_lim->>'direct_max')::int THEN RETURN 'over_ten'; END IF;            -- name is historical: "over the one-request limit"
  IF p_deck_id IS NOT NULL THEN
    SELECT count(*) INTO v_recent FROM ai_change_log
     WHERE user_id = p_user_id AND deck_id = p_deck_id AND NOT approved_by_owner
       AND created_at > now() - make_interval(mins => (v_lim->>'split_window_minutes')::int);
    IF v_recent + p_n > (v_lim->>'split_max')::int THEN RETURN 'recent_total'; END IF;
  END IF;
  SELECT count(*) INTO v_hour FROM ai_change_log
   WHERE user_id = p_user_id AND NOT approved_by_owner
     AND (created_at > now() - interval '1 hour' OR (undone_by = 'claude' AND undone_at > now() - interval '1 hour'));
  IF v_hour + p_n > (v_lim->>'hourly_max')::int THEN RETURN 'busy'; END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Recent changes, limited by group. Same output fields as 20261116190000 section 7.
--    One undo blocker per group (the first one found, on the first blocked row); the screen and tool only read "the first blocker of the group".
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_list_recent_changes(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb; r ai_change_log; g record; v_total integer := 0; v_block jsonb; v_found boolean;
BEGIN
  FOR g IN SELECT l.group_id, count(*)::integer AS n FROM ai_change_log l
            WHERE l.user_id = p_user_id AND l.undoable_until > now()
            GROUP BY l.group_id ORDER BY max(l.created_at) DESC, l.group_id LIMIT 50
  LOOP
    EXIT WHEN v_total > 0 AND v_total + g.n > 2000;                    -- row safety cap; a group is never cut in half
    v_total := v_total + g.n;
    v_found := false;
    FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = g.group_id ORDER BY created_at DESC, id LOOP
      v_block := NULL;
      IF r.undone_at IS NULL AND NOT v_found THEN
        v_block := public._ai_undo_blocker(p_user_id, r);
        v_found := v_block IS NOT NULL;
      END IF;
      v_out := v_out || (to_jsonb(r) - 'before' - 'after'
        || jsonb_build_object('owner_only', public._ai_kind_owner_only(r.kind),
                              'undo_blocker', v_block,
                              'zone_to', CASE WHEN r.kind = 'deck_zone' THEN CASE WHEN COALESCE(r.after->>'categories', '') LIKE '%Maybeboard%' THEN 'maybeboard' ELSE 'main' END END,
                              'categories_from', CASE WHEN r.kind = 'deck_category' THEN to_jsonb(public._ai_category_list(r.before->>'categories')) END,
                              'categories_to', CASE WHEN r.kind = 'deck_category' THEN r.after->'category_list' END));
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$$;

-- Privileges unchanged by CREATE OR REPLACE; restated so the file is self-evident.
REVOKE ALL ON FUNCTION public._ai_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ai_gate(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_list_recent_changes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ai_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public._ai_gate(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_list_recent_changes(uuid) TO service_role;

COMMIT;
