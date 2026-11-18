-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118120300_roles_db4_strategy_points.draft.sql (DB-4). Needs DB-2 still applied (it puts the DB-2 stubs back).
-- Refuses while deck_strategy_points holds rows unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
-- Refuses while any strategy_point log or pending row exists (history is never deleted).
-- Restores the four strategy point steps to the DB-2 stub bodies, drops the seven new functions and the table.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_strategy_points') IS NULL THEN RAISE EXCEPTION 'roles_db4 is not applied'; END IF;
  IF to_regprocedure('public._ai_limits_roles()') IS NULL THEN RAISE EXCEPTION 'roles_db2 is not applied; nothing to restore the stubs into'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind = 'strategy_point') OR EXISTS (SELECT 1 FROM public.ai_pending_changes WHERE action = 'strategy_point') THEN
    RAISE EXCEPTION 'cannot roll back: ai_change_log or ai_pending_changes has strategy_point rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_strategy_points) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: deck_strategy_points holds rows (set oracle.rollback_allow_data_loss = ''yes'' in this session to delete them)';
  END IF;
END $$;
DROP FUNCTION public.get_deck_strategy_points(uuid, integer);
DROP FUNCTION public.owner_accept_strategy_point_proposals(uuid, integer, uuid);
DROP FUNCTION public.owner_decide_strategy_point(uuid, integer, bigint, text);
DROP FUNCTION public.owner_delete_strategy_point(uuid, integer, bigint);
DROP FUNCTION public.owner_save_strategy_point(uuid, integer, bigint, jsonb);
-- The four steps go back to the DB-2 stubs, exactly as DB-2 wrote them.
DROP FUNCTION public._ai_blocker_strategy_point(uuid, ai_change_log);
DROP FUNCTION public._ai_undo_strategy_point(uuid, uuid, text);
DROP FUNCTION public._ai_execute_strategy_point(uuid, uuid, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_plan_strategy_point(uuid, jsonb);
DROP FUNCTION public._ai_strategy_point_prepare(uuid, jsonb);
DROP FUNCTION public._strategy_point_normalize(uuid, integer, jsonb, jsonb, text);
CREATE FUNCTION public._ai_plan_strategy_point(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('strategy_points_not_available'); RETURN NULL; END $$;
CREATE FUNCTION public._ai_execute_strategy_point(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('strategy_points_not_available'); RETURN NULL; END $$;
CREATE FUNCTION public._ai_undo_strategy_point(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$ SELECT jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo')) $$;
CREATE FUNCTION public._ai_blocker_strategy_point(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT NULL::jsonb $$;
REVOKE ALL ON FUNCTION public._ai_plan_strategy_point(uuid,jsonb), public._ai_execute_strategy_point(uuid,uuid,text,jsonb,uuid,boolean),
  public._ai_undo_strategy_point(uuid,uuid,text), public._ai_blocker_strategy_point(uuid,ai_change_log) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ai_plan_strategy_point(uuid,jsonb), public._ai_execute_strategy_point(uuid,uuid,text,jsonb,uuid,boolean),
  public._ai_undo_strategy_point(uuid,uuid,text), public._ai_blocker_strategy_point(uuid,ai_change_log) TO service_role;
DROP TABLE public.deck_strategy_points;
COMMIT;
