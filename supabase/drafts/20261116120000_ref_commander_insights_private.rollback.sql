-- Undo for 20261116120000_ref_commander_insights_private (restores the pre-state captured 2026-11-16:
-- RLS on, SELECT for anon and authenticated, policy ref_public_read for anon+authenticated).
BEGIN;
GRANT SELECT ON public.ref_commander_insights TO anon, authenticated;
DROP POLICY IF EXISTS ref_public_read ON public.ref_commander_insights;
CREATE POLICY ref_public_read ON public.ref_commander_insights FOR SELECT TO anon, authenticated USING (true);
COMMIT;
