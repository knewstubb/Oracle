-- APPLIED to hosted project udocxsyzzvrceiuupprj 2026-11-16 (owner approved). Drafted by Architect.
-- Phase 3 Picklist: "Cancel" for a step (priority 5).
-- Contract: docs/oracle/contracts/know-where-cards-are.md section 5, section 7, section 14.
-- Additive: one new function. Reversible: DROP FUNCTION. Nothing is deleted; the step is kept as "cancelled" history.
--
--   cancel_move_item(p_user_id uuid, p_item_id bigint) -> jsonb
--   What it does: drops a step the owner no longer wants, but only if the card has not been found yet (state "to_find"),
--   so nothing physical has moved. A card already In your hand must be placed (or marked Can't find), not cancelled.
--
--   Safety: scoped to p_user_id (another user's step reads as item_not_found); SECURITY DEFINER, pinned search_path, server
--   role only. Same per-copy advisory lock as the other routines (taken before the step row, same order as picklist_tick).
--   Idempotent: cancelling a cancelled step returns success with "unchanged".
--   Errors: item_not_found, wrong_state (found / placed / missing steps).

CREATE OR REPLACE FUNCTION public.cancel_move_item(
  p_user_id uuid,
  p_item_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_item FROM move_items mi WHERE mi.id = p_item_id AND mi.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_item.copy_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('collection-copy:' || v_item.copy_id::text, 0));
  END IF;

  SELECT * INTO v_item FROM move_items mi WHERE mi.id = p_item_id AND mi.user_id = p_user_id FOR UPDATE;
  IF v_item.state = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'cancelled', 'unchanged', true);
  END IF;
  IF v_item.state <> 'to_find' THEN RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001'; END IF;

  UPDATE move_items SET state = 'cancelled', cancelled_at = now() WHERE id = v_item.id;
  RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'state', 'cancelled', 'unchanged', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_move_item(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_move_item(uuid, bigint) TO service_role;

-- Rollback: DROP FUNCTION public.cancel_move_item(uuid, bigint);
