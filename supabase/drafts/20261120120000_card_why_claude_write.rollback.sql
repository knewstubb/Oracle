-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261120120000_card_why_claude_write.draft.sql. Puts the two front doors back, drops the three new functions, narrows the allow-list.
-- Refuses (changes nothing) while any card_why log row exists, because its Undo would be lost. deck_cards.why_here and its texts are NOT touched.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.ai_set_card_why(uuid,uuid,integer,integer,text,text)') IS NULL THEN RAISE EXCEPTION 'card_why is not applied'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind = 'card_why') THEN
    RAISE EXCEPTION 'cannot roll back: card_why entries exist in the change log';
  END IF;
END $$;
DROP FUNCTION public.ai_undo_group(uuid, uuid, text, uuid);
DROP FUNCTION public._ai_undo_blocker(uuid, ai_change_log);
ALTER FUNCTION public.ai_undo_group_pre_why(uuid, uuid, text, uuid) RENAME TO ai_undo_group;
ALTER FUNCTION public._ai_undo_blocker_pre_why(uuid, ai_change_log) RENAME TO _ai_undo_blocker;
DROP FUNCTION public._ai_undo_card_why(uuid, uuid, text);
DROP FUNCTION public._ai_blocker_card_why(uuid, ai_change_log);
DROP FUNCTION public.ai_set_card_why(uuid, uuid, integer, integer, text, text);
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = 'public.ai_change_log'::regclass AND pg_get_constraintdef(oid) LIKE '%deck_zone%'
  LOOP EXECUTE format('ALTER TABLE public.ai_change_log DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point','health_target'));
COMMIT;
