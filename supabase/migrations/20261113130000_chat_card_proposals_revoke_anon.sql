-- Applied 2026-11-13. Closes a gap in 20261112120000_chat_card_proposals: Supabase grants new functions to the
-- anon role by default, and the first migration only revoked PUBLIC and authenticated. Only service_role may run them.
REVOKE ALL ON FUNCTION public.confirm_chat_card_proposals(uuid, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.undo_chat_card_proposals(uuid, integer, uuid[]) FROM anon;
