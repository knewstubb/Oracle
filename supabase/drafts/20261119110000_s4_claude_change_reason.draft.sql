-- DRAFT. NOT APPLIED. The owner applies it (SQL editor), after reading the report. Needs owner approval.
-- Task: DV-04, a one-line reason on every Claude change (slice 2). Author: Developer, 2026-11-19.
-- Brief: docs/oracle/briefs/claude-change-reason.md. Report: docs/oracle/reports/2026-11-19-developer-slice-2-claude-reason-history.md
-- Rehearsal: docs/oracle/reports/evidence/roles-db/test_s4.sh (throwaway local Postgres; never the hosted project).
-- Base: the live database (migrations up to 20261117200100_cc15b plus the applied drafts DB-1 to DB-5). Works with or without S3 and CC-25
-- (it touches none of their objects). Apply order does not matter relative to them; roll back S4 FIRST if you roll back anything.
--
-- What this does (and only this):
--   1. New table ai_change_reasons: ONE row per Claude request (group_id), holding the one-line reason (1 to 200 characters, no line break).
--      It is a separate table, not a column on ai_change_log, because the log is frozen by a guard (only the undo fields may change) and a
--      column would force a change to that guard and to every function that writes the log. It is also separate from the existing
--      approval-hold reason (ai_pending_changes.reason: over_ten, recent_total, busy, card_move), which is not touched and not reused.
--   2. ai_submit_change and ai_approve_pending get a thin front door (same technique as DB-2): the live function is renamed to
--      _ai_submit_change_pre_reason / _ai_approve_pending_pre_reason and a function with the OLD name and signature sits in front. It
--      reads payload key "claude_reason", checks it (refused as reason_invalid before anything changes), runs the renamed function
--      UNCHANGED, and when the change was applied writes the reason row in the same transaction. A request that waits for the owner keeps
--      the reason inside its stored request; it is written when the owner approves.
--      No _ai_plan, _ai_execute, _ai_undo_blocker, ai_undo_group, ai_list_recent_changes or ai_set_deck_setup is touched, so the
--      DB-2, DB-5 and S3 rollbacks still put back exactly their own text.
--   3. ai_record_change_reason(user, group, reason): for the two Claude writes that do not go through ai_submit_change (create deck, set deck
--      setup). The app calls it right after the change.
-- Reads: the app reads ai_change_reasons itself (owner-only row security, like ai_change_log). Until this file is applied the app keeps
-- working: it says plainly that a reason could not be saved yet and shows no reason line.
-- Not destructive: one new table, two renames, five new functions. No existing row is changed. The 183 existing log rows get no reason.
-- Reversible: supabase/drafts/20261119110000_s4_claude_change_reason.rollback.sql (refuses while reasons exist, unless told otherwise).
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.ai_change_reasons') IS NOT NULL OR to_regprocedure('public._ai_submit_change_pre_reason(uuid,uuid,text,jsonb,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 's4 already applied (ai_change_reasons or _ai_submit_change_pre_reason exists)';
  END IF;
  IF to_regclass('public.ai_change_log') IS NULL OR to_regclass('public.ai_pending_changes') IS NULL
     OR to_regprocedure('public.ai_submit_change(uuid,uuid,text,jsonb,boolean)') IS NULL OR to_regprocedure('public.ai_approve_pending(uuid,uuid)') IS NULL
     OR to_regprocedure('public._ai_fail(text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'connector functions not found; wrong base (apply 20261116150000 and 20261116150100 first)';
  END IF;
END $$;
-- 1. The table. Service role writes; the signed-in owner may read their own rows (same as ai_change_log).
CREATE TABLE public.ai_change_reasons (
  group_id   uuid        PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_change_reasons_one_line CHECK (char_length(reason) BETWEEN 1 AND 200 AND reason !~ '[[:cntrl:]]' AND reason = btrim(reason))
);
CREATE INDEX ai_change_reasons_user ON public.ai_change_reasons (user_id, group_id);
ALTER TABLE public.ai_change_reasons ENABLE ROW LEVEL SECURITY;   -- never FORCE (definer functions must keep working)
CREATE POLICY ai_change_reasons_owner_select ON public.ai_change_reasons
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.ai_change_reasons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_change_reasons TO authenticated;
GRANT ALL ON public.ai_change_reasons TO service_role;
COMMENT ON TABLE public.ai_change_reasons IS 'DV-04: the one-line reason Claude gave for one change request (group_id of ai_change_log). Not the approval-hold reason.';
-- 2. Checks one reason value: a JSON string, trimmed, 1 to 200 characters, one line. Anything else is refused as reason_invalid (nothing has changed yet).
CREATE FUNCTION public._ai_clean_reason(p_value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN PERFORM public._ai_fail('reason_invalid'); END IF;
  v := btrim(p_value #>> '{}');
  IF char_length(v) < 1 OR char_length(v) > 200 OR v ~ '[[:cntrl:]]' THEN PERFORM public._ai_fail('reason_invalid'); END IF;
  RETURN v;
END;
$$;
-- 3. Front door of ai_submit_change.
ALTER FUNCTION public.ai_submit_change(uuid, uuid, text, jsonb, boolean) RENAME TO _ai_submit_change_pre_reason;
CREATE FUNCTION public.ai_submit_change(p_user_id uuid, p_connection_id uuid, p_action text, p_payload jsonb, p_dry_run boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason text; v_res jsonb;
BEGIN
  IF jsonb_typeof(p_payload) = 'object' AND p_payload ? 'claude_reason' THEN v_reason := public._ai_clean_reason(p_payload->'claude_reason'); END IF;
  v_res := public._ai_submit_change_pre_reason(p_user_id, p_connection_id, p_action, p_payload, p_dry_run);
  IF v_reason IS NOT NULL AND NOT p_dry_run AND v_res->>'outcome' = 'applied' AND v_res->>'group_id' IS NOT NULL THEN
    INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES ((v_res->>'group_id')::uuid, p_user_id, v_reason) ON CONFLICT (group_id) DO NOTHING;
  END IF;
  RETURN v_res;
END;
$$;
-- 4. Front door of ai_approve_pending: when the owner's yes applies a waiting request, its reason (kept in the stored request) is written.
ALTER FUNCTION public.ai_approve_pending(uuid, uuid) RENAME TO _ai_approve_pending_pre_reason;
CREATE FUNCTION public.ai_approve_pending(p_user_id uuid, p_pending_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb; v_reason text;
BEGIN
  v_res := public._ai_approve_pending_pre_reason(p_user_id, p_pending_id);
  IF v_res->>'outcome' = 'approved' AND v_res->>'group_id' IS NOT NULL THEN
    SELECT btrim(payload->>'claude_reason') INTO v_reason FROM ai_pending_changes WHERE id = p_pending_id AND user_id = p_user_id;
    IF v_reason IS NOT NULL AND char_length(v_reason) BETWEEN 1 AND 200 AND v_reason !~ '[[:cntrl:]]' THEN
      INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES ((v_res->>'group_id')::uuid, p_user_id, v_reason) ON CONFLICT (group_id) DO NOTHING;
    END IF;
  END IF;
  RETURN v_res;
END;
$$;
-- 5. For create deck and set deck setup (they do not go through ai_submit_change). The group must be this owner's own Claude change.
CREATE FUNCTION public.ai_record_change_reason(p_user_id uuid, p_group_id uuid, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason text; v_n integer;
BEGIN
  v_reason := public._ai_clean_reason(to_jsonb(p_reason));
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id) THEN PERFORM public._ai_fail('change_not_found'); END IF;
  INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES (p_group_id, p_user_id, v_reason) ON CONFLICT (group_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'stored', v_n = 1);
END;
$$;
-- 6. Privileges: service_role ONLY for every function this file creates. The renamed functions keep exactly the grants they had.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._ai_clean_reason(jsonb)', 'public.ai_submit_change(uuid,uuid,text,jsonb,boolean)', 'public.ai_approve_pending(uuid,uuid)',
    'public.ai_record_change_reason(uuid,uuid,text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
COMMIT;
