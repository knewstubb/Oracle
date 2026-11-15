-- APPLIED to live 2026-11-16 (owner-approved). Task CC-03b. Contract: docs/oracle/contracts/reference-tables-hardening.md
-- Rollback: supabase/drafts/20261116110100_reference_tables_hardening.rollback.sql
-- Changes privileges and RLS flags only; no row data is touched.
--
-- Group A (13 card-reference tables): anon and signed-in users keep SELECT only; all write-type privileges removed.
--   Where RLS was off (ref_cards, ref_commander_cards, ref_commanders, ref_commander_insights) RLS is switched on with a
--   public-read policy so reads behave exactly as before. ref_commander_insights readability is deliberately unchanged
--   (open owner question).
-- Group B (5 internal/unreferenced tables): all access removed from anon and signed-in users; RLS on, no policy.
-- The table default-privileges change in the plan (section 3) is NOT included: it also affects future user tables and
-- needs its own owner decision.

DO $$
DECLARE
  t text;
  a text[] := ARRAY['ref_cards','ref_printings','ref_rulings','ref_taxonomy','ref_commander_taxonomy','ref_commanders',
    'ref_commander_cards','ref_commander_builds','ref_build_cards','ref_commander_insights','ref_commander_role_targets',
    'ref_edhrec_recommendations','ref_precons'];
  b text[] := ARRAY['_migrations','sync_meta','commander_content','commander_strategies','precon_cards'];
  rls_off_a text[] := ARRAY['ref_cards','ref_commander_cards','ref_commanders','ref_commander_insights'];
BEGIN
  FOREACH t IN ARRAY a || b LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE EXCEPTION 'table public.% not found', t;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY a LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF t = ANY (rls_off_a) THEN
      EXECUTE format('DROP POLICY IF EXISTS ref_public_read ON public.%I', t);
      EXECUTE format('CREATE POLICY ref_public_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY b LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
