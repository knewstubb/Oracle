-- APPLIED to hosted project udocxsyzzvrceiuupprj 2026-11-16 (owner approved). Drafted by Architect.
-- Phase 3 Picklist: "I checked here" (priority 3).
-- Contract: docs/oracle/contracts/know-where-cards-are.md section 4 (B3), section 5, section 14.
-- Additive: one new function. Writes only the existing looked_in list on a waiting step. Reversible: DROP FUNCTION.
--
--   record_move_looked_in(p_user_id uuid, p_item_id bigint, p_place jsonb) -> jsonb
--     p_place: { "kind": "deck", "id": 12 } or { "kind": "location", "id": 3 }
--   What it does: remembers that the owner already looked for this missing card in that deck or box, so the
--   "look next" list can leave it out. It moves no card and changes no count.
--   Only allowed on a step whose card was marked Can't find (state "missing"); otherwise wrong_state.
--
--   Safety: scoped to p_user_id (another user's step reads as item_not_found; another user's deck or box as target_not_found);
--   SECURITY DEFINER, pinned search_path, server role only. Locks the step row. One write.
--   Idempotent: checking the same place twice stores it once and returns "unchanged".
--   Capped at 200 remembered places per step (bad_input beyond that).
--   Errors: item_not_found, wrong_state, target_not_found, bad_input.

CREATE OR REPLACE FUNCTION public.record_move_looked_in(
  p_user_id uuid,
  p_item_id bigint,
  p_place jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
  v_kind text;
  v_id integer;
  v_entry jsonb;
  v_new_list jsonb;
BEGIN
  IF p_user_id IS NULL OR p_item_id IS NULL OR p_place IS NULL OR jsonb_typeof(p_place) <> 'object' THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  v_kind := p_place ->> 'kind';
  IF v_kind IS NULL OR v_kind NOT IN ('deck', 'location')
     OR (p_place ->> 'id') IS NULL OR (p_place ->> 'id') !~ '^[0-9]{1,9}$' THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;
  v_id := (p_place ->> 'id')::integer;
  v_entry := jsonb_build_object('kind', v_kind, 'id', v_id);

  SELECT * INTO v_item FROM move_items mi WHERE mi.id = p_item_id AND mi.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0001'; END IF;
  IF v_item.state <> 'missing' THEN RAISE EXCEPTION 'wrong_state' USING ERRCODE = 'P0001'; END IF;

  IF v_kind = 'deck' THEN
    PERFORM 1 FROM decks d WHERE d.id = v_id AND d.user_id = p_user_id;
  ELSE
    PERFORM 1 FROM user_locations l WHERE l.id = v_id AND l.user_id = p_user_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_item.looked_in @> jsonb_build_array(v_entry) THEN
    RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'unchanged', true, 'looked_in', v_item.looked_in);
  END IF;
  IF jsonb_array_length(v_item.looked_in) >= 200 THEN
    RAISE EXCEPTION 'bad_input' USING ERRCODE = 'P0001';
  END IF;

  UPDATE move_items SET looked_in = looked_in || jsonb_build_array(v_entry)
  WHERE id = v_item.id
  RETURNING looked_in INTO v_new_list;

  RETURN jsonb_build_object('success', true, 'item_id', v_item.id, 'unchanged', false, 'looked_in', v_new_list);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_move_looked_in(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_move_looked_in(uuid, bigint, jsonb) TO service_role;

-- Rollback: DROP FUNCTION public.record_move_looked_in(uuid, bigint, jsonb);
