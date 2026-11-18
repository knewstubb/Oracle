-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118140000_roles_db6_deck_strategy.draft.sql (DB-6). Needs DB-5 (and DB-1 to DB-4) still applied: the four front doors go back to exactly the DB-5 text.
-- Refuses while deck_strategy_items or deck_job_serves holds rows unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
-- Refuses while any strategy_item or job_link log or pending row exists (history is never deleted).
-- Drops the four new front doors and renames the *_pre_strategy functions back to their DB-5 names (so the DB-5 text and grants come back byte for byte),
-- drops the new functions and both tables, and puts the two allow-lists back to the DB-5 lists.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_strategy_items') IS NULL OR to_regclass('public.deck_job_serves') IS NULL THEN RAISE EXCEPTION 'roles_db6 is not applied'; END IF;
  IF to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NULL OR to_regprocedure('public._ai_execute_pre_strategy(uuid,uuid,text,text,jsonb,uuid,boolean)') IS NULL
     OR to_regprocedure('public._ai_undo_blocker_pre_strategy(uuid,ai_change_log)') IS NULL OR to_regprocedure('public.ai_undo_group_pre_strategy(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'the *_pre_strategy functions are missing; nothing to restore the front doors from';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind IN ('strategy_item', 'job_link')) OR EXISTS (SELECT 1 FROM public.ai_pending_changes WHERE action IN ('strategy_item', 'job_link')) THEN
    RAISE EXCEPTION 'cannot roll back: ai_change_log or ai_pending_changes has strategy_item or job_link rows';
  END IF;
  IF (EXISTS (SELECT 1 FROM public.deck_strategy_items) OR EXISTS (SELECT 1 FROM public.deck_job_serves)) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: deck_strategy_items or deck_job_serves holds rows (set oracle.rollback_allow_data_loss = ''yes'' in this session to delete them)';
  END IF;
END $$;
-- Front doors: drop the DB-6 ones, give the DB-5 ones their names back.
DROP FUNCTION public._ai_plan(uuid, text, jsonb);
DROP FUNCTION public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_undo_blocker(uuid, ai_change_log);
DROP FUNCTION public.ai_undo_group(uuid, uuid, text, uuid);
ALTER FUNCTION public._ai_plan_pre_strategy(uuid, text, jsonb) RENAME TO _ai_plan;
ALTER FUNCTION public._ai_execute_pre_strategy(uuid, uuid, text, text, jsonb, uuid, boolean) RENAME TO _ai_execute;
ALTER FUNCTION public._ai_undo_blocker_pre_strategy(uuid, ai_change_log) RENAME TO _ai_undo_blocker;
ALTER FUNCTION public.ai_undo_group_pre_strategy(uuid, uuid, text, uuid) RENAME TO ai_undo_group;
-- The new functions.
DROP FUNCTION public.get_deck_strategy_staleness(uuid, integer);
DROP FUNCTION public.get_deck_job_links(uuid, integer);
DROP FUNCTION public.owner_accept_job_link_proposals(uuid, integer, uuid);
DROP FUNCTION public.owner_decide_job_link(uuid, integer, uuid, text);
DROP FUNCTION public.owner_set_job_link(uuid, integer, uuid, text, text, bigint);
DROP FUNCTION public.get_deck_strategy_items(uuid, integer);
DROP FUNCTION public.owner_accept_strategy_item_proposals(uuid, integer, uuid);
DROP FUNCTION public.owner_decide_strategy_item(uuid, integer, bigint, text);
DROP FUNCTION public.owner_delete_strategy_item(uuid, integer, bigint);
DROP FUNCTION public.owner_save_strategy_item(uuid, integer, bigint, jsonb);
DROP FUNCTION public._ai_undo_job_link(uuid, uuid, text);
DROP FUNCTION public._ai_blocker_job_link(uuid, ai_change_log);
DROP FUNCTION public._ai_execute_job_link(uuid, uuid, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_plan_job_link(uuid, jsonb);
DROP FUNCTION public._ai_job_link_prepare(uuid, jsonb);
DROP FUNCTION public._ai_undo_strategy_item(uuid, uuid, text);
DROP FUNCTION public._ai_blocker_strategy_item(uuid, ai_change_log);
DROP FUNCTION public._ai_execute_strategy_item(uuid, uuid, text, jsonb, uuid, boolean);
DROP FUNCTION public._ai_plan_strategy_item(uuid, jsonb);
DROP FUNCTION public._ai_strategy_item_prepare(uuid, jsonb);
DROP FUNCTION public._strategy_item_normalize(uuid, integer, jsonb, jsonb, text, boolean);
DROP FUNCTION public._job_effective(uuid, integer, uuid);
DROP FUNCTION public._strategy_kind_label(text);
DROP FUNCTION public._ai_limits_strategy();
DROP TABLE public.deck_job_serves;
DROP TABLE public.deck_strategy_items;
-- Allow-lists back to the DB-5 lists.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
            WHERE contype = 'c' AND conrelid IN ('public.ai_pending_changes'::regclass, 'public.ai_change_log'::regclass) AND pg_get_constraintdef(oid) LIKE '%strategy_item%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ai_pending_changes ADD CONSTRAINT ai_pending_changes_action_check CHECK (action IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category','card_label','strategy_point','health_target'));
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point','health_target'));
COMMIT;
