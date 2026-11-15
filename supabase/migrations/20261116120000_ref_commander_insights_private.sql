-- CC-03c: make the AI commander analysis table private (server key only).
-- APPLIED to live 2026-11-16 (owner approved direct-to-live). No row data changed.
-- Undo: supabase/drafts/20261116120000_ref_commander_insights_private.rollback.sql
BEGIN;
DROP POLICY IF EXISTS ref_public_read ON public.ref_commander_insights;
REVOKE ALL ON public.ref_commander_insights FROM anon, authenticated, PUBLIC;
ALTER TABLE public.ref_commander_insights ENABLE ROW LEVEL SECURITY;
COMMIT;
