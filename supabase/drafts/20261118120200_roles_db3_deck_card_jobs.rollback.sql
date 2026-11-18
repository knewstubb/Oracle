-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261118120200_roles_db3_deck_card_jobs.draft.sql (DB-3). Needs DB-2 still applied (it puts the DB-2 stubs back).
-- Refuses while deck_card_jobs holds rows (the owner's jobs) unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
-- Refuses while any card_label log or pending row carries a job (history is never deleted).
-- Restores the four job hooks to the DB-2 stub bodies, drops the six new functions and the table.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.deck_card_jobs') IS NULL THEN RAISE EXCEPTION 'roles_db3 is not applied'; END IF;
  IF to_regclass('public.deck_job_serves') IS NOT NULL THEN RAISE EXCEPTION 'roll back roles_db6 first (job links need jobs)'; END IF;
  IF to_regprocedure('public._ai_limits_roles()') IS NULL THEN RAISE EXCEPTION 'roles_db2 is not applied; nothing to restore the stubs into'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind = 'card_label' AND jsonb_typeof(after->'job') = 'object')
     OR EXISTS (SELECT 1 FROM public.ai_pending_changes WHERE action = 'card_label' AND jsonb_path_exists(payload, '$.cards[*].job')) THEN
    RAISE EXCEPTION 'cannot roll back: a card_label log or pending row carries a job';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_card_jobs) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: deck_card_jobs holds rows (set oracle.rollback_allow_data_loss = ''yes'' in this session to delete them)';
  END IF;
END $$;
DROP FUNCTION public.deck_job_names(uuid, integer);
DROP FUNCTION public.get_deck_card_jobs(uuid, integer);
DROP FUNCTION public.owner_accept_job_proposals(uuid, integer, uuid);
DROP FUNCTION public.owner_decide_card_job(uuid, integer, uuid, text);
DROP FUNCTION public.owner_set_card_job(uuid, integer, uuid, text, text, text);
-- The four hooks go back to the DB-2 stubs, exactly as DB-2 wrote them.
DROP FUNCTION public._ai_label_job_plan(uuid, integer, uuid, jsonb);
DROP FUNCTION public._ai_label_job_apply(uuid, integer, uuid, jsonb, uuid);
DROP FUNCTION public._ai_label_job_restore(uuid, integer, uuid, jsonb, jsonb);
DROP FUNCTION public._ai_label_job_unchanged(uuid, integer, uuid, jsonb);
CREATE FUNCTION public._ai_label_job_plan(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('jobs_not_available'); RETURN NULL; END $$;
CREATE FUNCTION public._ai_label_job_apply(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb, p_batch_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('jobs_not_available'); END $$;
CREATE FUNCTION public._ai_label_job_restore(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_before jsonb, p_after jsonb) RETURNS boolean
LANGUAGE sql SET search_path = public AS $$ SELECT false $$;
CREATE FUNCTION public._ai_label_job_unchanged(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public._ai_label_job_plan(uuid,integer,uuid,jsonb), public._ai_label_job_apply(uuid,integer,uuid,jsonb,uuid),
  public._ai_label_job_restore(uuid,integer,uuid,jsonb,jsonb), public._ai_label_job_unchanged(uuid,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ai_label_job_plan(uuid,integer,uuid,jsonb), public._ai_label_job_apply(uuid,integer,uuid,jsonb,uuid),
  public._ai_label_job_restore(uuid,integer,uuid,jsonb,jsonb), public._ai_label_job_unchanged(uuid,integer,uuid,jsonb) TO service_role;
DROP FUNCTION public._job_canonical_name(uuid, integer, text);
DROP TABLE public.deck_card_jobs;
COMMIT;
