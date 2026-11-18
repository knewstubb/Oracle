-- DRAFT. NOT APPLIED. Needs owner approval AND 20261117200000_cc15a_new_change_kinds applied first. Author: Architect, CC-16, 2026-11-17.
-- Report: docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md  (DB-C)
-- Not run against any database; throwaway run is the gate. user_locations unique key (name per user) is [Approximate]: see 20260812220000.
--
-- Adds, no table or column change:
--   ai_picklist(user, connection, op, args)  ONE door for the six LIVE routines. In one transaction it checks the connection is on, calls the
--        live routine UNCHANGED, then tags what the routine wrote as Claude's (move_items.source 'manual' -> 'ai'; the CHECK already allows 'ai').
--        op: create_list | tick_found | tick_placed | cant_find | looked_in | undo_tick | cancel_item | turned_up
--        The routines keep every rule they have (per-copy lock, idempotent, own-rows only). No routine body is edited.
--   ai_create_box(user, connection, name, description) -> one storage box; log kind box_create
--   ai_move_copies_to_box(user, connection, copy_ids, location_id) -> calls the live move_copies_to_storage; log kind box_move with each
--        copy's previous location so the owner's Undo can put every copy back
--   _ai_undo_box_create / _ai_undo_box_move (OWNER only)
-- The ONE delete: _ai_undo_box_create removes the box row, only if no copy is in it and nothing else points at it.
-- Reversible: DROP the functions; boxes made by Claude stay as normal boxes (the owner can delete empty boxes in Settings today).

BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public._ai_limits_new()') IS NULL THEN RAISE EXCEPTION 'apply 20261117200000_cc15a first'; END IF;
  IF to_regprocedure('public.create_move_list(uuid,jsonb)') IS NULL OR to_regprocedure('public.picklist_tick(uuid,text,integer,jsonb)') IS NULL
     OR to_regprocedure('public.record_move_looked_in(uuid,bigint,jsonb)') IS NULL OR to_regprocedure('public.undo_move_tick(uuid,bigint,text)') IS NULL
     OR to_regprocedure('public.cancel_move_item(uuid,bigint)') IS NULL OR to_regprocedure('public.resolve_missing_copy(uuid,integer,jsonb)') IS NULL
     OR to_regprocedure('public.move_copies_to_storage(integer[],integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'live picklist / storage routines not found';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_picklist(p_user_id uuid, p_connection_id uuid, p_op text, p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_res jsonb; v_list uuid; v_item bigint; v_id bigint; v_n integer;
BEGIN
  PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  IF p_op NOT IN ('create_list','tick_found','tick_placed','cant_find','looked_in','undo_tick','cancel_item','turned_up') THEN
    PERFORM public._ai_fail('bad_op'); END IF;

  IF p_op = 'create_list' THEN
    IF jsonb_array_length(COALESCE(p_args->'items', '[]'::jsonb)) > (public._ai_limits()->>'max_request')::int THEN PERFORM public._ai_fail('too_many_items'); END IF;
    v_res := public.create_move_list(p_user_id, p_args->'items');
    -- Tag every step this call made. The routine returns the list id; steps are tagged by list.
    v_list := NULLIF(v_res->>'list_id', '')::uuid;     -- [Approximate] result key name: confirm against know-where-cards-are.types.ts CreateMoveListResult
    IF v_list IS NOT NULL THEN UPDATE move_items SET source = 'ai' WHERE user_id = p_user_id AND list_id = v_list AND source = 'manual'; END IF;
  ELSIF p_op IN ('tick_found','tick_placed','cant_find') THEN
    v_res := public.picklist_tick(p_user_id, CASE p_op WHEN 'tick_found' THEN 'found' WHEN 'tick_placed' THEN 'placed' ELSE 'cant_find' END,
                                  (p_args->>'copy_id')::integer, p_args->'to');
    v_item := NULLIF(v_res->>'item_id', '')::bigint;
    IF v_item IS NOT NULL THEN
      UPDATE move_items SET source = 'ai' WHERE id = v_item AND user_id = p_user_id AND source = 'manual' AND created_at > now() - interval '5 seconds';
      -- A tick that PLACES a card sets the slot's placement_source to 'manual' inside the routine. Re-tag the slot it just filled.
      UPDATE deck_cards SET placement_source = 'ai' WHERE user_id = p_user_id AND placement_source = 'manual'
        AND id = (SELECT to_deck_card_id FROM move_items WHERE id = v_item AND user_id = p_user_id AND state = 'placed' AND placed_at > now() - interval '5 seconds');
    END IF;
  ELSIF p_op = 'looked_in' THEN v_res := public.record_move_looked_in(p_user_id, (p_args->>'item_id')::bigint, p_args->'place');
  ELSIF p_op = 'undo_tick' THEN
    -- Claude may undo ONLY a step it made itself (source 'ai'). The routine's own state guard (expected_state) still applies.
    PERFORM 1 FROM move_items WHERE id = (p_args->>'item_id')::bigint AND user_id = p_user_id AND source = 'ai';
    IF NOT FOUND THEN PERFORM public._ai_fail('not_claudes_step'); END IF;
    v_res := public.undo_move_tick(p_user_id, (p_args->>'item_id')::bigint, p_args->>'expected_state');
  ELSIF p_op = 'cancel_item' THEN
    PERFORM 1 FROM move_items WHERE id = (p_args->>'item_id')::bigint AND user_id = p_user_id AND source = 'ai';
    IF NOT FOUND THEN PERFORM public._ai_fail('not_claudes_step'); END IF;   -- Claude cannot cancel the owner's own steps
    v_res := public.cancel_move_item(p_user_id, (p_args->>'item_id')::bigint);
  ELSE   -- turned_up (resolve_missing_copy): takes a copy out of Missing. The owner's call, so it needs a step Claude made? No: see report Q-C3.
    v_res := public.resolve_missing_copy(p_user_id, (p_args->>'copy_id')::integer, p_args->'to');
  END IF;
  RETURN v_res;   -- routines raise on refusal; the whole call (tag included) then rolls back
END $$;

CREATE OR REPLACE FUNCTION public.ai_create_box(p_user_id uuid, p_connection_id uuid, p_name text, p_description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client text; v_name text := btrim(COALESCE(p_name, '')); v_id integer; v_group uuid := gen_random_uuid(); v_sort integer;
BEGIN
  SELECT client_name INTO v_client FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  IF v_name = '' OR length(v_name) > 60 THEN PERFORM public._ai_fail('bad_box_name'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_create_box:' || p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM user_locations WHERE user_id = p_user_id AND lower(name) = lower(v_name)) THEN PERFORM public._ai_fail('box_name_taken', jsonb_build_object('name', v_name)); END IF;
  IF (SELECT count(*) FROM ai_change_log WHERE user_id = p_user_id AND kind = 'box_create' AND created_at > now() - interval '1 hour')
       >= (public._ai_limits_new()->>'boxes_created_per_hour')::int THEN PERFORM public._ai_fail('too_many_boxes_this_hour'); END IF;
  SELECT COALESCE(max(sort_order), -1) + 1 INTO v_sort FROM user_locations WHERE user_id = p_user_id AND type = 'storage';
  INSERT INTO user_locations (name, type, description, color, sort_order, user_id) VALUES (v_name, 'storage', NULLIF(btrim(p_description), ''), '#6B7280', v_sort, p_user_id)
    RETURNING id INTO v_id;
  INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, card_name, copy_id, before, after)
  VALUES (p_user_id, v_group, p_connection_id, v_client, 'box_create', v_name, NULL, '{}'::jsonb, jsonb_build_object('location_id', v_id, 'name', v_name));
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_group, 'location_id', v_id, 'count', 1);
END $$;

-- Move free copies between boxes. Never touches a copy in a deck (the live routine refuses those) and never a Missing / In hand copy.
CREATE OR REPLACE FUNCTION public.ai_move_copies_to_box(p_user_id uuid, p_connection_id uuid, p_copy_ids integer[], p_location_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client text; v_group uuid := gen_random_uuid(); v_n integer := COALESCE(cardinality(p_copy_ids), 0); v_prev jsonb; v_res jsonb; v_to text;
BEGIN
  SELECT client_name INTO v_client FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  IF v_n = 0 THEN PERFORM public._ai_fail('nothing_to_move'); END IF;
  IF v_n > (public._ai_limits_new()->>'box_move_max')::int THEN PERFORM public._ai_fail('too_many_copies'); END IF;
  SELECT name INTO v_to FROM user_locations WHERE id = p_location_id AND user_id = p_user_id AND type = 'storage';
  IF NOT FOUND THEN PERFORM public._ai_fail('box_not_found'); END IF;   -- Claude must name a real box (no NULL = default shortcut)
  IF (SELECT count(*) FROM user_copies WHERE user_id = p_user_id AND id = ANY (p_copy_ids)) <> (SELECT count(DISTINCT x) FROM unnest(p_copy_ids) x) THEN
    PERFORM public._ai_fail('copy_not_found'); END IF;
  SELECT jsonb_agg(jsonb_build_object('copy_id', id, 'location_id', location_id) ORDER BY id) INTO v_prev FROM user_copies WHERE user_id = p_user_id AND id = ANY (p_copy_ids);
  v_res := public.move_copies_to_storage(p_copy_ids, p_location_id, p_user_id);
  INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, card_name, before, after)
  VALUES (p_user_id, v_group, p_connection_id, v_client, 'box_move', v_to, jsonb_build_object('copies', v_prev),
          jsonb_build_object('location_id', p_location_id, 'box', v_to, 'n', v_n));
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_group, 'count', v_n);
END $$;

CREATE OR REPLACE FUNCTION public._ai_undo_box_create(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_change_log; v_loc integer;
BEGIN
  IF p_actor <> 'owner' THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only')); END IF;
  SELECT * INTO r FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'box_create' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('change_not_found'); END IF;
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone')); END IF;
  v_loc := (r.after->>'location_id')::integer;
  PERFORM 1 FROM user_locations WHERE id = v_loc AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'box_gone', 'box', r.card_name)); END IF;
  IF EXISTS (SELECT 1 FROM user_copies WHERE location_id = v_loc AND user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM move_items WHERE user_id = p_user_id AND (to_location_id = v_loc OR from_location_id = v_loc) AND state IN ('to_find','found')) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'box_not_empty', 'box', r.card_name));
  END IF;
  DELETE FROM user_locations WHERE id = v_loc AND user_id = p_user_id AND type = 'storage' AND NOT is_default;
  UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE user_id = p_user_id AND group_id = p_group_id;
  RETURN jsonb_build_object('success', true, 'undone', 1);
END $$;

CREATE OR REPLACE FUNCTION public._ai_undo_box_move(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_change_log; v_item jsonb; v_bad integer;
BEGIN
  IF p_actor <> 'owner' THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only')); END IF;
  SELECT * INTO r FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'box_move' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('change_not_found'); END IF;
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone')); END IF;
  IF r.undoable_until < now() THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'too_old')); END IF;
  -- All or nothing: refuse if ANY copy is no longer in the box Claude put it in (it moved again, or went into a deck).
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(r.before->'copies') e
    LEFT JOIN user_copies c ON c.id = (e->>'copy_id')::integer AND c.user_id = p_user_id
   WHERE c.id IS NULL OR c.location_id IS DISTINCT FROM (r.after->>'location_id')::integer
      OR EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.copy_id = c.id AND dc.user_id = p_user_id);
  IF v_bad > 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'changed_since', 'box', r.card_name)); END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(r.before->'copies') LOOP
    UPDATE user_copies SET location_id = NULLIF(v_item->>'location_id', '')::integer WHERE id = (v_item->>'copy_id')::integer AND user_id = p_user_id;
  END LOOP;
  UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE user_id = p_user_id AND group_id = p_group_id;
  RETURN jsonb_build_object('success', true, 'undone', jsonb_array_length(r.before->'copies'));
END $$;

REVOKE ALL ON FUNCTION public.ai_picklist(uuid, uuid, text, jsonb), public.ai_create_box(uuid, uuid, text, text),
  public.ai_move_copies_to_box(uuid, uuid, integer[], integer), public._ai_undo_box_create(uuid, uuid, text), public._ai_undo_box_move(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_picklist(uuid, uuid, text, jsonb), public.ai_create_box(uuid, uuid, text, text),
  public.ai_move_copies_to_box(uuid, uuid, integer[], integer) TO service_role;
COMMIT;
-- Rollback (separate file): DROP the five functions. Log rows of kinds box_create / box_move remain as history.
