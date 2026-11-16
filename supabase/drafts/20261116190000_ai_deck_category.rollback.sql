-- ROLLBACK for 20261116190000_ai_deck_category.draft.sql. NOT APPLIED. Needs owner approval to run.
-- Puts the four original functions back under their old names and narrows the two allow-lists again.
-- REFUSES to run if any 'deck_category' history or waiting request exists (it never deletes history).
-- ai_list_recent_changes goes back to the 20261116150300 definition.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ai_change_log WHERE kind = 'deck_category') OR EXISTS (SELECT 1 FROM ai_pending_changes WHERE action = 'deck_category') THEN
    RAISE EXCEPTION 'deck_category rows exist; rollback refused (history is kept)';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.ai_undo_group(uuid, uuid, text, uuid);
ALTER FUNCTION public._ai_undo_group_v1(uuid, uuid, text, uuid) RENAME TO ai_undo_group;
DROP FUNCTION IF EXISTS public._ai_undo_blocker(uuid, ai_change_log);
ALTER FUNCTION public._ai_undo_blocker_v1(uuid, ai_change_log) RENAME TO _ai_undo_blocker;
DROP FUNCTION IF EXISTS public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean);
ALTER FUNCTION public._ai_execute_v1(uuid, uuid, text, text, jsonb, uuid, boolean) RENAME TO _ai_execute;
DROP FUNCTION IF EXISTS public._ai_plan(uuid, text, jsonb);
ALTER FUNCTION public._ai_plan_v1(uuid, text, jsonb) RENAME TO _ai_plan;
DROP FUNCTION IF EXISTS public._ai_has_maybe_marker(text);
DROP FUNCTION IF EXISTS public._ai_category_list(text);

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

ALTER TABLE public.ai_pending_changes DROP CONSTRAINT ai_pending_changes_action_check;
ALTER TABLE public.ai_pending_changes ADD CONSTRAINT ai_pending_changes_action_check CHECK (action IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move'));
ALTER TABLE public.ai_change_log DROP CONSTRAINT ai_change_log_kind_check;
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move'));

COMMIT;
