-- ROLLBACK for 20261116110100_reference_tables_hardening.sql. Restores the exact state captured live 2026-11-16 BEFORE applying.
-- Running this RE-OPENS the 18 reference tables to anyone holding the public site key. Use only if the app breaks.
-- Captured state: all 18 tables had ACL postgres/anon/authenticated/service_role = arwdDxtm (all privileges).
-- RLS was OFF on: _migrations, commander_content, commander_strategies, precon_cards, ref_cards, ref_commander_cards,
-- ref_commander_insights, ref_commanders, sync_meta. RLS was ON on the other 9 (their existing policies were not touched).
-- Policies created by the migration: ref_public_read on ref_cards, ref_commander_cards, ref_commanders, ref_commander_insights.

BEGIN;

DO $$
DECLARE
  t text;
  all18 text[] := ARRAY['_migrations','commander_content','commander_strategies','precon_cards','ref_build_cards','ref_cards',
    'ref_commander_builds','ref_commander_cards','ref_commander_insights','ref_commander_role_targets','ref_commander_taxonomy',
    'ref_commanders','ref_edhrec_recommendations','ref_precons','ref_printings','ref_rulings','ref_taxonomy','sync_meta'];
  was_off text[] := ARRAY['_migrations','commander_content','commander_strategies','precon_cards','ref_cards',
    'ref_commander_cards','ref_commander_insights','ref_commanders','sync_meta'];
  created_policy text[] := ARRAY['ref_cards','ref_commander_cards','ref_commanders','ref_commander_insights'];
BEGIN
  FOREACH t IN ARRAY all18 LOOP
    EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY created_policy LOOP
    EXECUTE format('DROP POLICY IF EXISTS ref_public_read ON public.%I', t);
  END LOOP;
  FOREACH t IN ARRAY was_off LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

COMMIT;
