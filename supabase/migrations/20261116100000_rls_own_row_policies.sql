-- DRAFT FOR OWNER APPROVAL. NOT APPLIED. Do not run until the owner approves.
-- Contract: docs/oracle/contracts/data-separation.md (section 3). Task CC-03a, Gate 4 slice 1.
-- Rollback: supabase/drafts/20261116100000_rls_own_row_policies.rollback.sql (reversible; rolling back re-opens the hole).
--
-- What it does: switches on row-level security (RLS) for the 22 per-user tables that still have it off, adds one
-- "own rows only" policy to each (user_id = auth.uid()), removes the anonymous (public site key) role's access to
-- them, removes TRUNCATE/TRIGGER/REFERENCES from signed-in users, and makes the collection_rollup view respect RLS.
--
-- Why the app keeps working: every data read/write in src/ uses createAdminClient() (service_role, BYPASSRLS) or a
-- SECURITY DEFINER RPC (owner postgres, bypasses RLS). The only anon-key clients are the browser login form,
-- middleware and createAuthServerClient, which only call auth.* [Confirmed: grep, see contract section 2].
-- We deliberately do NOT use FORCE ROW LEVEL SECURITY, so the definer RPCs keep working.
--
-- Safety: no DROP TABLE, TRUNCATE, DELETE or UPDATE of data. user_copies already has four own-row policies (inert
-- until now); they are kept and become active when RLS is enabled. Run as one transaction.
-- Idempotent: ENABLE is a no-op if already on; policies are dropped-if-exists then recreated.

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'decks','deck_cards','user_cards','user_copies',
    'deck_notes','deck_versions','deck_combos','deck_documentation','deck_health','deck_mana_analysis',
    'deck_overview_content','deck_priority','deck_ratings','deck_strategy','deck_upgrades',
    'brew_sessions','debrief_actions','debrief_sessions','import_sleeve_claims','precon_mod_state',
    'sync_runs','upgrade_change_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- user_copies keeps its four existing collection_*_own policies; no extra policy needed there.
    IF t <> 'user_copies' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_own_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))',
        t || '_own_all', t);
    END IF;
    -- anon (the public site key) never needs these tables. TRUNCATE ignores RLS, so also remove it (and
    -- TRIGGER/REFERENCES) from signed-in users. service_role and postgres are untouched.
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- The collection_rollup view is owned by postgres, so today it ignores RLS and shows every user's rows to anyone who
-- can select it. Make it run as the caller, and take it away from anon. Nothing in src/ reads it [Confirmed: grep].
ALTER VIEW public.collection_rollup SET (security_invoker = true);
REVOKE ALL ON public.collection_rollup FROM anon;

COMMIT;
