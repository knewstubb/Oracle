-- CC-04b follow-up (additive): ai_list_recent_changes also says which way a zone change went ('zone_to': maybeboard|main),
-- so the plain-words sentence can say it correctly. Replaces one read-only function; no table or data changes.
CREATE OR REPLACE FUNCTION public.ai_list_recent_changes(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb := '[]'::jsonb; r ai_change_log;
BEGIN
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND undoable_until > now() ORDER BY created_at DESC, id LIMIT 300 LOOP
    v_out := v_out || (to_jsonb(r) - 'before' - 'after'
      || jsonb_build_object('owner_only', public._ai_kind_owner_only(r.kind),
                            'undo_blocker', CASE WHEN r.undone_at IS NULL THEN public._ai_undo_blocker(p_user_id, r) END,
                            'zone_to', CASE WHEN r.kind = 'deck_zone' THEN CASE WHEN COALESCE(r.after->>'categories', '') LIKE '%Maybeboard%' THEN 'maybeboard' ELSE 'main' END END));
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_list_recent_changes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_list_recent_changes(uuid) TO service_role;
