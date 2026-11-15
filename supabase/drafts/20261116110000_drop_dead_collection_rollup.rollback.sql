-- DRAFT ROLLBACK for 20261116110000_drop_dead_collection_rollup.sql. NOT APPLIED.
-- The definitions are NOT in the repo contract/report (data-separation.md only describes them), and no live data was
-- fetched for this draft. Capture them BEFORE applying the drop, with:
--   SELECT pg_get_functiondef('public.get_collection_rollup(uuid)'::regprocedure);
--   SELECT pg_get_functiondef('public.get_shared_cards(uuid)'::regprocedure);
--   SELECT pg_get_viewdef('public.collection_rollup'::regclass, true);
--   SELECT c.reloptions, pg_get_userbyid(c.relowner), c.relacl FROM pg_class c WHERE c.oid='public.collection_rollup'::regclass;
--   SELECT p.oid::regprocedure, pg_get_userbyid(p.proowner), p.proacl FROM pg_proc p
--     WHERE p.oid IN ('public.get_collection_rollup(uuid)'::regprocedure,'public.get_shared_cards(uuid)'::regprocedure);
-- Paste each result where marked. Older source copies exist in supabase/reconciliation/pre-ledger/ (002_rpc_functions.sql,
-- 012_collection_rollup_view.sql, 014_fix_collection_rollup_demand.sql, 20260723_fix_shortfall_count_proxies.sql) but the
-- live bodies may differ; the live capture wins. Note these objects will not run even when restored (they reference
-- tables card_definitions / physical_copies / oracle_to_printings that no longer exist); the function bodies are only
-- validated at call time, but CREATE VIEW will FAIL while those tables are missing. If it fails, the view can only be
-- restored as a record, not as a working object; stop and ask the Architect.
--
-- The placeholders below are deliberately invalid SQL so this file cannot run until filled in.

BEGIN;

-- 1. View (paste pg_get_viewdef output)
CREATE VIEW public.collection_rollup AS
  <<PASTE pg_get_viewdef('public.collection_rollup') RESULT HERE>>;
-- Restore options/owner/grants from the capture. State before CC-03a: owner postgres, security_invoker off, anon readable.
-- ALTER VIEW public.collection_rollup SET (security_invoker = false);   -- only if the capture shows it was off
-- GRANT ALL ON public.collection_rollup TO anon, authenticated, service_role;  -- match relacl exactly

-- 2. Functions (paste pg_get_functiondef output, which is a complete CREATE OR REPLACE FUNCTION statement)
<<PASTE pg_get_functiondef('public.get_collection_rollup(uuid)') RESULT HERE>>;
<<PASTE pg_get_functiondef('public.get_shared_cards(uuid)') RESULT HERE>>;

-- 3. Function ACLs. If CC-03a migration 20261116100100 was applied before the drop, the correct state is service_role only:
REVOKE ALL ON FUNCTION public.get_collection_rollup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_shared_cards(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_rollup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_cards(uuid) TO service_role;

COMMIT;
