-- Undo for 20261116140000_close_remaining_anon_gaps (restores pre-state: wide-open grants, public ALL policy).
BEGIN;
GRANT ALL ON public.chat_card_proposals, public.deck_card_alerts, public.deck_folders,
  public.oracle_messages, public.oracle_sessions, public.user_locations TO anon;
GRANT TRUNCATE, TRIGGER, REFERENCES ON public.chat_card_proposals, public.deck_card_alerts, public.deck_folders,
  public.oracle_messages, public.oracle_sessions, public.user_locations TO authenticated;
CREATE POLICY locations_service_all ON public.user_locations FOR ALL TO public USING (true) WITH CHECK (true);
COMMIT;
