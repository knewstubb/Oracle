-- ROLLBACK TEMPLATE for the CC-14 card library backfill (supabase/drafts/cc14-backfill-ref-cards.ts).
-- DRAFT, NOT APPLIED. Needs owner approval to run. Prefer `--rollback <manifest>` of the script; use this only if the script is unavailable.
-- Fill the lists from the manifest written by the --apply run (supabase/drafts/cc14-backfill-ref-cards.manifest.json,
-- "mode": "apply"): "inserted" names go in step 1, each "updated" entry (name, previous_oracle_text, previous_type_line) in step 2.
-- A dry-run manifest ("mode": "dry-run") lists planned changes only: do NOT use it here.
-- Names with a single quote must be doubled ('') inside the SQL strings.
BEGIN;

-- 1. Remove the rows the backfill inserted (only names listed under "inserted").
DELETE FROM public.ref_cards
WHERE name IN (
  -- '<inserted name 1>',
  -- '<inserted name 2>'
  '__replace_with_manifest_inserted_names__'
);

-- 2. Put back the previous text and type line, one statement per entry under "updated".
--    previous_oracle_text was null for every updated row at planning time; write NULL unless the manifest says otherwise.
-- UPDATE public.ref_cards
--    SET oracle_text = NULL,
--        type_line   = '<previous_type_line>'
--  WHERE name = '<name>';

COMMIT;
