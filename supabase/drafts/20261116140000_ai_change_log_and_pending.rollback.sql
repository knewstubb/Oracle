-- ROLLBACK for 20261116140000_ai_change_log_and_pending.draft.sql. Run the RPC rollback (20261116140100) FIRST.
-- Destroys the "made by AI" history and any waiting requests. Not run by anyone without the owner's say-so.
BEGIN;
DROP TABLE IF EXISTS public.ai_change_log;
DROP TABLE IF EXISTS public.ai_pending_changes;
DROP FUNCTION IF EXISTS public._ai_change_log_guard();
COMMIT;
