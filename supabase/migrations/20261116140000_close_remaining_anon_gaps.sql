-- CC-03d: close the last public-key gaps found by the Tester (2026-11-16).
-- APPLIED to live 2026-11-16. No row data changed.
-- 1. user_locations had a policy "locations_service_all" (ALL, role public, true): anyone with the public key could read/edit storage locations. Removed (the server key bypasses RLS anyway).
-- 2. anon loses all access to the six per-user chat/folder/location tables; signed-in users lose TRUNCATE/TRIGGER/REFERENCES.
-- Undo: supabase/drafts/20261116140000_close_remaining_anon_gaps.rollback.sql
BEGIN;
DROP POLICY IF EXISTS locations_service_all ON public.user_locations;
REVOKE ALL ON public.chat_card_proposals, public.deck_card_alerts, public.deck_folders,
  public.oracle_messages, public.oracle_sessions, public.user_locations FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.chat_card_proposals, public.deck_card_alerts, public.deck_folders,
  public.oracle_messages, public.oracle_sessions, public.user_locations FROM authenticated;
COMMIT;
