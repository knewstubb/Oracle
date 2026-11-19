-- ROLLBACK for 20261119110000_s4_claude_change_reason.draft.sql (S4, reason on every Claude change). NOT APPLIED. The owner runs it only to undo S4.
-- Roll S4 back BEFORE any other draft that renames or replaces the same connector functions (it only wraps ai_submit_change and ai_approve_pending,
-- which no other draft touches, so any order works; this note is the safe habit).
-- Puts the two live functions back under their old names, byte for byte (the front doors are dropped, the renamed functions are renamed back and
-- keep the grants they always had), drops the three S4-only functions and the table.
-- Refuses (changes nothing) while any reason is stored, because dropping the table would forget them, unless the session first runs:
--   SET oracle.rollback_allow_data_loss = 'yes';
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.ai_change_reasons') IS NULL OR to_regprocedure('public._ai_submit_change_pre_reason(uuid,uuid,text,jsonb,boolean)') IS NULL
     OR to_regprocedure('public._ai_approve_pending_pre_reason(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 's4 is not applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_reasons) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: Claude reasons are stored (set oracle.rollback_allow_data_loss = ''yes'' in this session to forget them)';
  END IF;
END $$;
DROP FUNCTION public.ai_record_change_reason(uuid, uuid, text);
DROP FUNCTION public.ai_approve_pending(uuid, uuid);
ALTER FUNCTION public._ai_approve_pending_pre_reason(uuid, uuid) RENAME TO ai_approve_pending;
DROP FUNCTION public.ai_submit_change(uuid, uuid, text, jsonb, boolean);
ALTER FUNCTION public._ai_submit_change_pre_reason(uuid, uuid, text, jsonb, boolean) RENAME TO ai_submit_change;
DROP FUNCTION public._ai_clean_reason(jsonb);
DROP TABLE public.ai_change_reasons;
COMMIT;
