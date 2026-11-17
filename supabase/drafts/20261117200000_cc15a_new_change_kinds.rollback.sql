-- ROLLBACK for 20261117200000_cc15a_new_change_kinds.draft.sql (DB-A). NOT APPLIED. Needs owner approval to run.
-- Roll back DB-B (20261117200100_cc15b_deck_create_setup.rollback.sql) FIRST: it depends on the names restored away here.
-- Refuses if any row of a new kind exists in ai_change_log (history is never deleted). No data is touched otherwise.
-- Restores: the three-name owner-only list, the original ai_undo_group and _ai_undo_blocker names, the nine-name kind check.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NULL OR to_regprocedure('public._ai_undo_blocker_prev(uuid,ai_change_log)') IS NULL THEN
    RAISE EXCEPTION 'cc15a is not applied (the _prev functions are missing)';
  END IF;
  IF to_regprocedure('public._ai_set_primary_commander(uuid,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'roll back cc15b first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind IN ('deck_create','deck_setup','box_create','box_move')) THEN
    RAISE EXCEPTION 'cannot roll back: ai_change_log has rows of a cc15 kind';
  END IF;
END $$;
-- Front doors out, live functions back under their old names.
DROP FUNCTION public.ai_undo_group(uuid, uuid, text, uuid);
ALTER FUNCTION public._ai_undo_group_prev(uuid, uuid, text, uuid) RENAME TO ai_undo_group;
DROP FUNCTION public._ai_undo_blocker(uuid, ai_change_log);
ALTER FUNCTION public._ai_undo_blocker_prev(uuid, ai_change_log) RENAME TO _ai_undo_blocker;
DROP FUNCTION public._ai_blocker_new(uuid, ai_change_log);
DROP FUNCTION public._ai_limits_new();
CREATE OR REPLACE FUNCTION public._ai_kind_owner_only(p_kind text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('collection_add', 'create_proxy', 'copy_move')
$$;
ALTER TABLE public.ai_change_log DROP CONSTRAINT ai_change_log_kind_check;
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category'));
COMMIT;
