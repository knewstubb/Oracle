-- ROLLBACK for 20261116150100_ai_connector_edit_rpcs.sql. NOT APPLIED. Drops only functions created by that draft.
-- Run this BEFORE the tables rollback (20261116150000...rollback.sql), because these functions refer to those tables.
BEGIN;
DROP FUNCTION IF EXISTS public.ai_moved_slots(uuid, integer);
DROP FUNCTION IF EXISTS public.ai_undo_group(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.ai_list_recent_changes(uuid);
DROP FUNCTION IF EXISTS public._ai_kind_owner_only(text);
DROP FUNCTION IF EXISTS public._ai_undo_blocker(uuid, ai_change_log);
DROP FUNCTION IF EXISTS public.revoke_connector_connection(uuid, uuid);
DROP FUNCTION IF EXISTS public.ai_decline_pending(uuid, uuid);
DROP FUNCTION IF EXISTS public.ai_approve_pending(uuid, uuid);
DROP FUNCTION IF EXISTS public.ai_get_pending(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.ai_list_pending(uuid);
DROP FUNCTION IF EXISTS public.ai_pending_count(uuid);
DROP FUNCTION IF EXISTS public._ai_expire_pending(uuid);
DROP FUNCTION IF EXISTS public.ai_submit_change(uuid, uuid, text, jsonb, boolean);
DROP FUNCTION IF EXISTS public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean);
DROP FUNCTION IF EXISTS public._ai_gate(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public._ai_plan(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public._ai_lock_copy(integer);
DROP FUNCTION IF EXISTS public._ai_lock_decks(uuid, integer[]);
DROP FUNCTION IF EXISTS public._ai_slot_is_sleeved(boolean, boolean, integer);
DROP FUNCTION IF EXISTS public._ai_is_maybe(text);
DROP FUNCTION IF EXISTS public._ai_deck_counts(uuid, integer);
DROP FUNCTION IF EXISTS public._ai_fail(text, jsonb);
DROP FUNCTION IF EXISTS public._ai_limits();
COMMIT;
