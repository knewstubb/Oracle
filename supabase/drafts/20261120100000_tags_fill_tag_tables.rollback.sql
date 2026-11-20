-- DRAFT. NOT APPLIED. Needs owner approval.
-- ROLLBACK for 20261120100000_tags_fill_tag_tables.draft.sql (tags-fill). The normal way to empty the Tags is the fill job's --undo-run; this removes the two tables.
-- Drops: ref_card_tags and ref_tag_list. Removes nothing else.
-- Refuses while ref_card_tags holds rows, unless the session first runs:  SET oracle.rollback_allow_data_loss = 'yes';
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.ref_card_tags') IS NULL OR to_regclass('public.ref_tag_list') IS NULL THEN RAISE EXCEPTION 'tags_fill is not applied'; END IF;
  IF EXISTS (SELECT 1 FROM public.ref_card_tags) AND COALESCE(current_setting('oracle.rollback_allow_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'cannot roll back: ref_card_tags holds rows (undo the fill runs first, or set oracle.rollback_allow_data_loss = ''yes'' in this session)';
  END IF;
END $$;
DROP TABLE public.ref_card_tags;
DROP TABLE public.ref_tag_list;
COMMIT;
