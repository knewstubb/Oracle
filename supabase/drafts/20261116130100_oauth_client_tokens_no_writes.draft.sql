-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves. Task CC-04a (recommended hardening, optional).
-- Contract: docs/oracle/contracts/claude-connector-slice-a.md (section 7.4).
-- Reversible: rollback at the bottom.
-- Depends on: 20261116100000_rls_own_row_policies.sql applied (it is, per live check 2026-11-16).
--
-- WHY: a token issued to Claude by Supabase's OAuth server is a normal signed-in token for that user. Combined with the
-- public site key it could call Supabase's table API directly and, under the own-row policies, WRITE that user's rows,
-- bypassing Oracle's read-only tool list. Supabase puts a `client_id` claim in OAuth-client tokens (docs: "Access tokens
-- ... include user_id, role, and client_id claims") [Approximate: claim name to be confirmed on a real token before apply].
-- These RESTRICTIVE policies are ANDed with the existing own-row policies: a token WITH a client_id claim may read but not
-- insert/update/delete. Browser sessions (no client_id claim) and service_role are unaffected.
-- Slice B (write tools) will have to narrow this (Claude edits go through the server with service_role + RPCs, so likely no
-- change is needed; decide then).
--
-- Tables: the 22 own-row tables from the CC-03a migration.

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'decks','deck_cards','user_cards','user_copies','deck_notes','deck_versions','deck_combos','deck_documentation',
    'deck_health','deck_mana_analysis','deck_overview_content','deck_priority','deck_ratings','deck_strategy',
    'deck_upgrades','brew_sessions','debrief_actions','debrief_sessions','import_sleeve_claims','precon_mod_state',
    'sync_runs','upgrade_change_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'table public.% not found; catalog drifted, re-check the list', t;
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT auth.jwt() ->> %L) IS NULL)', t || '_no_oauth_insert', t, 'client_id');
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT auth.jwt() ->> %L) IS NULL) WITH CHECK ((SELECT auth.jwt() ->> %L) IS NULL)', t || '_no_oauth_update', t, 'client_id', 'client_id');
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT auth.jwt() ->> %L) IS NULL)', t || '_no_oauth_delete', t, 'client_id');
  END LOOP;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DO $$ DECLARE t text; tables text[] := ARRAY[ ...same 22 names... ]; BEGIN
--   FOREACH t IN ARRAY tables LOOP
--     EXECUTE format('DROP POLICY %I ON public.%I', t || '_no_oauth_insert', t);
--     EXECUTE format('DROP POLICY %I ON public.%I', t || '_no_oauth_update', t);
--     EXECUTE format('DROP POLICY %I ON public.%I', t || '_no_oauth_delete', t);
--   END LOOP; END $$;
-- COMMIT;
