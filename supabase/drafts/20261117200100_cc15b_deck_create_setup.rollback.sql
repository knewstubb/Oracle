-- ROLLBACK for 20261117200100_cc15b_deck_create_setup.draft.sql (DB-B). NOT APPLIED. Needs owner approval to run.
-- Refuses if any deck_create / deck_setup row exists in ai_change_log (history is never deleted; those rows could not be undone
-- without the functions dropped here). Decks Claude created stay as ordinary decks. No data is touched.
-- Leaves DB-A in place: the blocker goes back to the empty stub that returns NULL.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public._ai_set_primary_commander(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'cc15b is not applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind IN ('deck_create','deck_setup')) THEN
    RAISE EXCEPTION 'cannot roll back: ai_change_log has deck_create / deck_setup rows';
  END IF;
END $$;
DROP FUNCTION public.ai_create_deck(uuid, uuid, text, text, jsonb);
DROP FUNCTION public.ai_set_deck_setup(uuid, uuid, integer, jsonb);
DROP FUNCTION public._ai_undo_deck_create(uuid, uuid, text);
DROP FUNCTION public._ai_undo_deck_setup(uuid, uuid, text);
DROP FUNCTION public._ai_set_primary_commander(uuid, integer, integer);
CREATE OR REPLACE FUNCTION public._ai_blocker_new(p_user_id uuid, r ai_change_log) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NULL::jsonb
$$;
COMMIT;
