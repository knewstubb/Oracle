-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118120400_roles_db5_health_targets.draft.sql (DB-5). Needs DB-2 still applied (the front doors go back to exactly the DB-2 text).
-- Refuses while deck_health_targets holds rows unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
-- Refuses while any health_target log or pending row exists (history is never deleted).
-- Restores the four front doors (_ai_plan, _ai_execute, _ai_undo_blocker, ai_undo_group) to the DB-2 bodies, drops the seven new functions, the table,
-- and puts the two allow-lists back to the DB-2 lists.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_health_targets') IS NULL THEN RAISE EXCEPTION 'roles_db5 is not applied'; END IF;
  IF to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'roles_db2 is not applied; nothing to restore the front doors into'; END IF;
  IF to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'roll back roles_db6 first (its front doors sit on top of DB-5''s)'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind = 'health_target') OR EXISTS (SELECT 1 FROM public.ai_pending_changes WHERE action = 'health_target') THEN
    RAISE EXCEPTION 'cannot roll back: ai_change_log or ai_pending_changes has health_target rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_health_targets) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: deck_health_targets holds rows (set oracle.rollback_allow_data_loss = ''yes'' in this session to delete them)';
  END IF;
END $$;
-- The four front doors back to the DB-2 text, exactly as DB-2 wrote them (the DB-5 steps are not called any more once these are in place).
CREATE OR REPLACE FUNCTION public._ai_plan(p_user_id uuid, p_action text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'card_label' THEN RETURN public._ai_plan_card_label(p_user_id, p_payload); END IF;
  IF p_action = 'strategy_point' THEN RETURN public._ai_plan_strategy_point(p_user_id, p_payload); END IF;
  RETURN public._ai_plan_pre_roles(p_user_id, p_action, p_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_execute(p_user_id uuid, p_connection_id uuid, p_client_name text, p_action text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'card_label' THEN RETURN public._ai_execute_card_label(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  IF p_action = 'strategy_point' THEN RETURN public._ai_execute_strategy_point(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  RETURN public._ai_execute_pre_roles(p_user_id, p_connection_id, p_client_name, p_action, p_payload, p_pending_id, p_approved);
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF r.kind = 'card_label' THEN RETURN public._ai_blocker_card_label(p_user_id, r); END IF;
  IF r.kind = 'strategy_point' THEN RETURN public._ai_blocker_strategy_point(p_user_id, r); END IF;
  RETURN public._ai_undo_blocker_pre_roles(p_user_id, r);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_n integer; v_total integer; v_lim jsonb := public._ai_limits();
BEGIN
  SELECT min(kind), count(*) INTO v_kind, v_n FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind IN ('card_label', 'strategy_point');
  IF v_n = 0 THEN RETURN public._ai_undo_group_pre_roles(p_user_id, p_group_id, p_actor, p_connection_id); END IF;   -- every other kind: unchanged code
  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._roles_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._roles_fail('connection_revoked'); END IF;
    SELECT count(*) INTO v_total FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id;
    IF v_total > (v_lim->>'claude_undo_max')::int OR EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND approved_by_owner) THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only'));
    END IF;
  END IF;
  IF v_kind = 'card_label' THEN RETURN public._ai_undo_card_label(p_user_id, p_group_id, p_actor); END IF;
  RETURN public._ai_undo_strategy_point(p_user_id, p_group_id, p_actor);
END;
$$;

DROP FUNCTION public.get_deck_health_targets(uuid, integer);
DROP FUNCTION public.owner_hand_back_health_target(uuid, integer, text);
DROP FUNCTION public.owner_set_health_target(uuid, integer, text, integer, text);
DROP FUNCTION public._ai_undo_health_target(uuid, uuid, text);
DROP FUNCTION public._ai_blocker_health_target(uuid, ai_change_log);
DROP FUNCTION public._ai_execute_health_target(uuid, uuid, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_plan_health_target(uuid, jsonb);
DROP TABLE public.deck_health_targets;
-- Allow-lists back to the DB-2 lists.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
            WHERE contype = 'c' AND conrelid IN ('public.ai_pending_changes'::regclass, 'public.ai_change_log'::regclass) AND pg_get_constraintdef(oid) LIKE '%deck_zone%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ai_pending_changes ADD CONSTRAINT ai_pending_changes_action_check CHECK (action IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category','card_label','strategy_point'));
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point'));
COMMIT;
