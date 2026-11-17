-- ROLLBACK for 20261117100000_cc13_loosen_limits.draft.sql. NOT APPLIED. Needs owner approval to run.
-- Puts back the CC-04b limits (10 / 40 / 60 / 10), the "moves always wait" gate and the 300-row recent-changes function.
-- No data is touched. Safe at any time. Run it together with reverting the code constants (edit-config.ts), or the equality test fails.
-- Note: after rollback, changes made while the loose limits were live (groups up to 200 rows) can still be undone in Oracle (owner,
-- no size cap) but Claude's own undo_change refuses groups over 10 rows.
BEGIN;

CREATE OR REPLACE FUNCTION public._ai_limits() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'direct_max', 10,
    'split_window_minutes', 30,
    'hourly_max', 40,
    'undo_days', 7,
    'pending_hours', 24,
    'max_waiting', 20,
    'max_request', 60,
    'claude_undo_max', 10
  )
$$;

CREATE OR REPLACE FUNCTION public._ai_gate(p_user_id uuid, p_action text, p_deck_id integer, p_n integer) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_lim jsonb := public._ai_limits(); v_recent integer; v_hour integer;
BEGIN
  IF p_action = 'copy_move' THEN RETURN 'card_move'; END IF;
  IF p_n > (v_lim->>'direct_max')::int THEN RETURN 'over_ten'; END IF;
  IF p_deck_id IS NOT NULL THEN
    SELECT count(*) INTO v_recent FROM ai_change_log
     WHERE user_id = p_user_id AND deck_id = p_deck_id AND NOT approved_by_owner
       AND created_at > now() - make_interval(mins => (v_lim->>'split_window_minutes')::int);
    IF v_recent + p_n > (v_lim->>'direct_max')::int THEN RETURN 'recent_total'; END IF;
  END IF;
  SELECT count(*) INTO v_hour FROM ai_change_log
   WHERE user_id = p_user_id AND NOT approved_by_owner
     AND (created_at > now() - interval '1 hour' OR (undone_by = 'claude' AND undone_at > now() - interval '1 hour'));
  IF v_hour + p_n > (v_lim->>'hourly_max')::int THEN RETURN 'busy'; END IF;
  RETURN NULL;
END;
$$;

-- Same as 20261116190000 section 7.
CREATE OR REPLACE FUNCTION public.ai_list_recent_changes(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb := '[]'::jsonb; r ai_change_log;
BEGIN
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND undoable_until > now() ORDER BY created_at DESC, id LIMIT 300 LOOP
    v_out := v_out || (to_jsonb(r) - 'before' - 'after'
      || jsonb_build_object('owner_only', public._ai_kind_owner_only(r.kind),
                            'undo_blocker', CASE WHEN r.undone_at IS NULL THEN public._ai_undo_blocker(p_user_id, r) END,
                            'zone_to', CASE WHEN r.kind = 'deck_zone' THEN CASE WHEN COALESCE(r.after->>'categories', '') LIKE '%Maybeboard%' THEN 'maybeboard' ELSE 'main' END END,
                            'categories_from', CASE WHEN r.kind = 'deck_category' THEN to_jsonb(public._ai_category_list(r.before->>'categories')) END,
                            'categories_to', CASE WHEN r.kind = 'deck_category' THEN r.after->'category_list' END));
  END LOOP;
  RETURN v_out;
END;
$$;

COMMIT;
