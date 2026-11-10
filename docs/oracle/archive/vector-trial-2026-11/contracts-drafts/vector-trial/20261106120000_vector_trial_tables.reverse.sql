-- =====================================================================================================================
-- DRAFT REVERSE SCRIPT. NOT APPLIED. NOT A MIGRATION (do not place in supabase/migrations/).
-- Undoes 20261106120000_vector_trial_tables.sql. Contract: vector-trial-2026-11.md §6 item 3.
--
-- THIS IS A DROP (AGENTS rule 5): run only with explicit owner approval given at the time, naming the target database.
-- Drops ONLY the four trial objects, by exact name, with no CASCADE. If anything outside the trial depends on them the
-- statement fails and nothing is removed (it never silently takes other objects with it).
-- Does NOT drop the "vector" extension (it may be used later; harmless when unused). Dropping it is a separate approval.
-- Data lost: only reproducible public data (embeddings can be re-generated; combos reloaded from the dated Spellbook file).
-- No user data, no existing table, no existing function is touched.
--
-- After running on a database that tracks migrations, also mark the migration as undone so history matches:
--   supabase migration repair --status reverted 20261106120000   (separate step; not part of this script)
-- =====================================================================================================================

begin;

drop function if exists public.ref_similar_cards_trial(text[], text, uuid[], extensions.vector, uuid[], int);

-- pieces first: it holds the foreign key to variants
drop table if exists public.ref_combo_pieces_trial;
drop table if exists public.ref_combo_variants_trial;
drop table if exists public.ref_card_embeddings_trial;

commit;
