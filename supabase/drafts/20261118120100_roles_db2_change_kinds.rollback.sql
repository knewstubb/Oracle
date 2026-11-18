-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118120100_roles_db2_change_kinds.draft.sql (DB-2). Roll back DB-4 and DB-3 FIRST (they replace the hooks this file drops).
-- Refuses if any card_label or strategy_point row exists in ai_change_log or ai_pending_changes (history is never deleted).
-- Restores: the four live functions under their old names (front doors dropped), the 20261117100000 ai_list_recent_changes, the 13-kind log list and
-- the 9-action pending list. The role tables and the owner's / Claude's role rows are not touched (they belong to DB-1).
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NULL OR to_regprocedure('public._ai_undo_group_pre_roles(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'roles_db2 is not applied (the _pre_roles functions are missing)';
  END IF;
  IF to_regclass('public.deck_card_jobs') IS NOT NULL OR to_regclass('public.deck_strategy_points') IS NOT NULL OR to_regclass('public.deck_health_targets') IS NOT NULL THEN RAISE EXCEPTION 'roll back roles_db5, roles_db4 and roles_db3 first'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind IN ('card_label', 'strategy_point'))
     OR EXISTS (SELECT 1 FROM public.ai_pending_changes WHERE action IN ('card_label', 'strategy_point')) THEN
    RAISE EXCEPTION 'cannot roll back: ai_change_log or ai_pending_changes has rows of a roles kind';
  END IF;
END $$;
-- Front doors out, live functions back under their old names.
DROP FUNCTION public.ai_undo_group(uuid, uuid, text, uuid);
ALTER FUNCTION public._ai_undo_group_pre_roles(uuid, uuid, text, uuid) RENAME TO ai_undo_group;
DROP FUNCTION public._ai_undo_blocker(uuid, ai_change_log);
ALTER FUNCTION public._ai_undo_blocker_pre_roles(uuid, ai_change_log) RENAME TO _ai_undo_blocker;
DROP FUNCTION public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean);
ALTER FUNCTION public._ai_execute_pre_roles(uuid, uuid, text, text, jsonb, uuid, boolean) RENAME TO _ai_execute;
DROP FUNCTION public._ai_plan(uuid, text, jsonb);
ALTER FUNCTION public._ai_plan_pre_roles(uuid, text, jsonb) RENAME TO _ai_plan;
-- The new functions.
DROP FUNCTION public.owner_accept_role_proposals(uuid, integer, uuid);
DROP FUNCTION public.owner_decide_card_role(uuid, uuid, text, text);
DROP FUNCTION public._ai_undo_card_label(uuid, uuid, text);
DROP FUNCTION public._ai_blocker_card_label(uuid, ai_change_log);
DROP FUNCTION public._ai_execute_card_label(uuid, uuid, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_plan_card_label(uuid, jsonb);
DROP FUNCTION public._ai_blocker_strategy_point(uuid, ai_change_log);
DROP FUNCTION public._ai_undo_strategy_point(uuid, uuid, text);
DROP FUNCTION public._ai_execute_strategy_point(uuid, uuid, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_plan_strategy_point(uuid, jsonb);
DROP FUNCTION public._ai_label_job_unchanged(uuid, integer, uuid, jsonb);
DROP FUNCTION public._ai_label_job_restore(uuid, integer, uuid, jsonb, jsonb);
DROP FUNCTION public._ai_label_job_apply(uuid, integer, uuid, jsonb, uuid);
DROP FUNCTION public._ai_label_job_plan(uuid, integer, uuid, jsonb);
DROP FUNCTION public._ai_limits_roles();
-- Recent changes: the 20261117100000 body, byte for byte.
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
REVOKE ALL ON FUNCTION public.ai_list_recent_changes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_list_recent_changes(uuid) TO service_role;
-- Allow-lists back to what they were.
ALTER TABLE public.ai_change_log DROP CONSTRAINT ai_change_log_kind_check;
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move'));
ALTER TABLE public.ai_pending_changes DROP CONSTRAINT ai_pending_changes_action_check;
ALTER TABLE public.ai_pending_changes ADD CONSTRAINT ai_pending_changes_action_check CHECK (action IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category'));
COMMIT;
