-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves. Task CC-03b.
-- Contract: docs/oracle/contracts/data-separation.md (dead-object finding). Report: docs/oracle/reports/2026-11-16-architect-cc03b.md
-- DESTRUCTIVE: drops two functions and one view. Reversible ONLY if their definitions are captured first (see below).
-- Rollback: supabase/drafts/20261116110000_drop_dead_collection_rollup.rollback.sql (contains placeholders to fill from the capture).
--
-- What it removes: get_collection_rollup(uuid), get_shared_cards(uuid) and view collection_rollup. They read tables
-- card_definitions / physical_copies / oracle_to_printings that no longer exist, and nothing in src/ calls them
-- [Confirmed: grep of src/ and scripts/ finds only comments and generated types in src/types/supabase.ts].
--
-- STEP 0 (REQUIRED, read-only, run BEFORE applying; paste results into the rollback file placeholders):
--   SELECT pg_get_functiondef('public.get_collection_rollup(uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.get_shared_cards(uuid)'::regprocedure);
--   SELECT pg_get_viewdef('public.collection_rollup'::regclass, true);
--   -- plus the view's options and grants (security_invoker, owner, ACL) and function ACLs:
--   SELECT c.reloptions, pg_get_userbyid(c.relowner) AS owner, c.relacl FROM pg_class c WHERE c.oid = 'public.collection_rollup'::regclass;
--   SELECT p.oid::regprocedure, pg_get_userbyid(p.proowner), p.proacl FROM pg_proc p
--     WHERE p.oid IN ('public.get_collection_rollup(uuid)'::regprocedure, 'public.get_shared_cards(uuid)'::regprocedure);
--
-- ORDERING with the CC-03a migrations (both in supabase/migrations/, header says not applied):
--   * 20261116100000_rls_own_row_policies.sql runs ALTER VIEW public.collection_rollup and REVOKE on it.
--   * 20261116100100_revoke_anon_user_data_rpcs.sql revokes get_collection_rollup(uuid) and get_shared_cards(uuid) and
--     RAISES EXCEPTION if either function is missing.
--   This file has the later timestamp (110000), so applied in order it runs AFTER both and no edit is needed.
--   If the owner wants to drop first or skip those two objects, edit them instead: remove lines 49-50 (view) from
--   20261116100000 and the two array entries from 20261116100100 (and its rollback). Do not apply this file before
--   them without those edits or they fail.
--   Roll back in reverse order: this file's rollback first, then the CC-03a rollbacks (their rollbacks re-GRANT on
--   these objects and fail if they do not exist).

BEGIN;

-- No IF EXISTS on purpose: fail loudly if the catalog has drifted since the review.
-- Not CASCADE: if anything still depends on these objects, the drop errors instead of silently removing it.
DROP VIEW public.collection_rollup;
DROP FUNCTION public.get_collection_rollup(uuid);
DROP FUNCTION public.get_shared_cards(uuid);

COMMIT;
