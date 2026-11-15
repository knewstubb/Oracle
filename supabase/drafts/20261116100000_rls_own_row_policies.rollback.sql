-- ROLLBACK for 20261116100000_rls_own_row_policies.sql. DRAFT, NOT APPLIED. Needs owner approval to run.
-- Running this RE-OPENS the data to anyone holding the public site key. Use only if the app breaks and the fix cannot wait.
-- Restores the state read from the live catalog on 2026-11-16: RLS off, anon and authenticated with full table grants.
-- user_copies keeps its four original policies (they were there before). Policies added by the migration are dropped.
-- [Approximate] Original table grants were read for decks, deck_cards, user_cards, user_copies, deck_notes, sync_runs
-- only (all: anon + authenticated, every privilege); the other 16 tables are assumed identical. If this is run, compare.

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
    IF t <> 'user_copies' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_own_all', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

ALTER VIEW public.collection_rollup SET (security_invoker = false);
GRANT ALL ON public.collection_rollup TO anon;

COMMIT;
