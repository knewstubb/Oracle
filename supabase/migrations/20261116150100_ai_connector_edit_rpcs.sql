-- APPLIED to live 2026-11-16 (owner approved; additive only). Task CC-04b (slice B, safe edits with undo).
-- Contract: docs/oracle/contracts/claude-connector-slice-b.md (sections 3, 4, 5, 6).
-- Depends on: 20261116150000_ai_change_log_and_pending.sql (the two tables) and the existing functions
--   remove_deck_card_with_release, unassign_copy_to_storage, replace_proxy_with_original, add_proxy_to_slot, insert_user_copies,
--   _ensure_default_storage_location_id (all live, service_role-only).
-- ADDITIVE ONLY: new functions only. No existing function or table is changed. Rollback: ...150100_ai_connector_edit_rpcs.rollback.sql.
--
-- EVERY function here is SECURITY DEFINER, SET search_path = public, takes p_user_id as its FIRST argument, and is executable by
-- service_role ONLY. The value comes from the verified token (connector path) or the cookie session (owner path), never from a
-- tool argument. Anything that changes data is ONE transaction: it either all happens, with its log rows, or nothing does.
-- Error style (same as the existing atomic functions): RAISE EXCEPTION '<code>' USING ERRCODE = 'P0001', DETAIL = '<json>'.
--
-- Destructive operations: there is NO function here that deletes a card or copy from the collection on Claude's say-so.
-- The only collection deletes are inside ai_undo_group and run only for (a) the exact copy a log row says Claude created
-- (collection_add, create_proxy), and (b) only when the actor is 'owner' (cookie session). See contract section 5.
-- Lock order everywhere: connector_connections row -> decks rows (ascending id) -> copy advisory locks (ascending id).

BEGIN;

-- ---------------------------------------------------------------------------------------------------------------
-- 0. Constants (one place; the TypeScript types file mirrors them and a test asserts they match)
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_limits() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'direct_max', 10,            -- up to this many cards in one go go straight through
    'split_window_minutes', 30,  -- direct edits to ONE deck in this window add up (stops 10 + 10 + 10 splitting)
    'hourly_max', 40,            -- direct edits by Claude in any hour (all decks); beyond this they wait
    'undo_days', 7,
    'pending_hours', 24,
    'max_waiting', 20,           -- most requests that may wait at once per user
    'max_request', 60,           -- most cards in one request
    'claude_undo_max', 10        -- Claude may only undo groups of this many rows or fewer
  )
$$;

CREATE OR REPLACE FUNCTION public._ai_fail(p_code text, p_detail jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', p_code USING ERRCODE = 'P0001', DETAIL = p_detail::text;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Small read helpers
-- ---------------------------------------------------------------------------------------------------------------
-- Same arithmetic as src/lib/deck-readiness.ts computeDeckReadiness (counts every deck_cards row, like move-here does).
CREATE OR REPLACE FUNCTION public._ai_deck_counts(p_user_id uuid, p_deck_id integer) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'size', count(*),
    'sleeved', count(*) FILTER (WHERE (COALESCE(is_generic, false) AND generic_sleeved IS NOT FALSE)
                                   OR (NOT COALESCE(is_generic, false) AND copy_id IS NOT NULL)),
    'unsleeved_generics', count(*) FILTER (WHERE COALESCE(is_generic, false) AND generic_sleeved = false)
  )
  FROM deck_cards WHERE deck_id = p_deck_id AND user_id = p_user_id
$$;

-- A slot is on the maybeboard when its PRIMARY category is 'Maybeboard' (src/components/CardGroupSection.tsx handleMoveToMaybeboard).
CREATE OR REPLACE FUNCTION public._ai_is_maybe(p_categories text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_categories ~ '^\s*\[\s*"Maybeboard"' OR btrim(p_categories) = 'Maybeboard', false)
$$;

CREATE OR REPLACE FUNCTION public._ai_slot_is_sleeved(p_generic boolean, p_generic_sleeved boolean, p_copy_id integer) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT (COALESCE(p_generic, false) AND p_generic_sleeved IS NOT FALSE) OR (NOT COALESCE(p_generic, false) AND p_copy_id IS NOT NULL)
$$;

-- Locks the named decks (owner-checked, ascending id) and returns {"<id>": "<name>"}.
CREATE OR REPLACE FUNCTION public._ai_lock_decks(p_user_id uuid, p_ids integer[]) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id integer; v_name text; v_out jsonb := '{}'::jsonb;
BEGIN
  FOR v_id IN SELECT DISTINCT x FROM unnest(p_ids) AS x WHERE x IS NOT NULL ORDER BY x LOOP
    SELECT name INTO v_name FROM decks WHERE id = v_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN PERFORM public._ai_fail('deck_not_found', jsonb_build_object('deck_id', v_id)); END IF;
    v_out := v_out || jsonb_build_object(v_id::text, v_name);
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_lock_copy(p_copy_id integer) RETURNS void LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('collection-copy:' || p_copy_id::text, 0))
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Plan = validate under locks, change nothing, describe the effect. Used by dry run, queueing, executing and approving.
--    Returns {action, deck_id, deck_name, other_deck_id, other_deck_name, n, cards:[...], preview:{decks:[...], cards:[...]}}
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_plan(p_user_id uuid, p_action text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits();
  v_deck integer; v_other integer; v_names jsonb;
  v_n integer := 0; v_cards jsonb := '[]'::jsonb;
  v_before jsonb; v_after jsonb; v_obefore jsonb; v_oafter jsonb;
  v_slot jsonb; v_row record; v_copy record; v_target integer; v_holder record;
  v_seen integer[] := ARRAY[]::integer[];
  v_sleeved_removed integer := 0; v_unsl_gen_removed integer := 0;
  v_item jsonb;
BEGIN
  IF p_action NOT IN ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move') THEN
    PERFORM public._ai_fail('unknown_action', jsonb_build_object('action', p_action));
  END IF;

  -- ---------------- collection_add: no deck involved ----------------
  IF p_action = 'collection_add' THEN
    IF NULLIF(btrim(COALESCE(p_payload->>'oracle_id', '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_payload->>'card_name', '')), '') IS NULL THEN
      PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'card'));
    END IF;
    IF COALESCE(p_payload->>'finish', 'nonfoil') NOT IN ('nonfoil', 'foil', 'etched') THEN
      PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'finish'));
    END IF;
    RETURN jsonb_build_object('action', p_action, 'n', 1,
      'cards', jsonb_build_array(jsonb_build_object('name', p_payload->>'card_name', 'quantity', 1)),
      'preview', jsonb_build_object('decks', '[]'::jsonb, 'cards', jsonb_build_array(jsonb_build_object('name', p_payload->>'card_name', 'quantity', 1))));
  END IF;

  -- ---------------- copy_move: two decks ----------------
  IF p_action = 'copy_move' THEN
    v_other := (p_payload->>'to_deck_id')::integer;
    SELECT uc.id, uc.user_id, uc.is_proxy, uc.missing, uc.printing_id, uc.finish, uc.card_id, c.card_name
      INTO v_copy
      FROM user_copies uc JOIN user_cards c ON c.id = uc.card_id
     WHERE uc.id = (p_payload->>'copy_id')::integer AND uc.user_id = p_user_id;
    IF NOT FOUND THEN PERFORM public._ai_fail('copy_not_found', jsonb_build_object('copy_id', p_payload->>'copy_id')); END IF;
    PERFORM public._ai_lock_copy(v_copy.id);
    IF v_copy.missing THEN PERFORM public._ai_fail('copy_missing', jsonb_build_object('card', v_copy.card_name)); END IF;
    SELECT dc.id, dc.deck_id, dc.is_commander, dc.command_zone_role INTO v_holder
      FROM deck_cards dc WHERE dc.copy_id = v_copy.id AND dc.user_id = p_user_id ORDER BY dc.id LIMIT 1;
    IF NOT FOUND THEN PERFORM public._ai_fail('copy_not_in_a_deck', jsonb_build_object('card', v_copy.card_name)); END IF;
    v_deck := v_holder.deck_id;
    v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck, v_other]);
    -- Re-read the holder now that the decks are locked (it may have moved while we waited for the lock).
    SELECT dc.id, dc.deck_id, dc.is_commander, dc.command_zone_role INTO v_holder
      FROM deck_cards dc WHERE dc.copy_id = v_copy.id AND dc.user_id = p_user_id ORDER BY dc.id LIMIT 1;
    IF NOT FOUND OR v_holder.deck_id IS DISTINCT FROM v_deck THEN
      PERFORM public._ai_fail('source_changed', jsonb_build_object('card', v_copy.card_name));
    END IF;
    IF v_deck = v_other THEN PERFORM public._ai_fail('already_in_this_deck', jsonb_build_object('card', v_copy.card_name, 'deck', v_names->>v_deck::text)); END IF;
    IF v_holder.is_commander OR v_holder.command_zone_role IS NOT NULL THEN
      PERFORM public._ai_fail('commander_copy', jsonb_build_object('card', v_copy.card_name, 'deck', v_names->>v_deck::text));
    END IF;
    IF p_payload ? 'expected_source_deck_id' AND ((p_payload->>'expected_source_deck_id')::integer IS DISTINCT FROM v_deck
       OR (p_payload->>'expected_source_slot_id')::integer IS DISTINCT FROM v_holder.id) THEN
      PERFORM public._ai_fail('source_changed', jsonb_build_object('card', v_copy.card_name, 'deck', v_names->>v_deck::text));
    END IF;
    -- First open (copy-less) slot for this card in the destination that is NOT on the maybeboard.
    SELECT dc.id INTO v_target FROM deck_cards dc
     WHERE dc.deck_id = v_other AND dc.user_id = p_user_id AND dc.card_name = v_copy.card_name AND dc.copy_id IS NULL
       AND NOT public._ai_is_maybe(dc.categories)
     ORDER BY dc.id LIMIT 1 FOR UPDATE;
    IF v_target IS NULL THEN
      PERFORM public._ai_fail('no_open_slot', jsonb_build_object('card', v_copy.card_name, 'deck', v_names->>v_other::text));
    END IF;
    v_before := public._ai_deck_counts(p_user_id, v_deck);
    v_obefore := public._ai_deck_counts(p_user_id, v_other);
    v_after := jsonb_set(v_before, '{sleeved}', to_jsonb(((v_before->>'sleeved')::int) - 1));
    v_oafter := jsonb_set(v_obefore, '{sleeved}', to_jsonb(((v_obefore->>'sleeved')::int) + 1));
    RETURN jsonb_build_object('action', p_action, 'deck_id', v_deck, 'deck_name', v_names->>v_deck::text,
      'other_deck_id', v_other, 'other_deck_name', v_names->>v_other::text, 'n', 1,
      'source_slot_id', v_holder.id, 'target_slot_id', v_target, 'copy_id', v_copy.id, 'card_name', v_copy.card_name,
      'printing_id', v_copy.printing_id, 'is_proxy', v_copy.is_proxy, 'finish', v_copy.finish,
      'cards', jsonb_build_array(jsonb_build_object('name', v_copy.card_name, 'quantity', 1)),
      'preview', jsonb_build_object(
        'cards', jsonb_build_array(jsonb_build_object('name', v_copy.card_name, 'quantity', 1, 'is_proxy', v_copy.is_proxy)),
        'decks', jsonb_build_array(
          jsonb_build_object('deck_id', v_deck, 'name', v_names->>v_deck::text, 'role', 'loses', 'before', v_before, 'after', v_after),
          jsonb_build_object('deck_id', v_other, 'name', v_names->>v_other::text, 'role', 'gains', 'before', v_obefore, 'after', v_oafter))));
  END IF;

  -- ---------------- every other action works inside ONE deck ----------------
  v_deck := (p_payload->>'deck_id')::integer;
  v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck]);
  v_before := public._ai_deck_counts(p_user_id, v_deck);

  IF p_action = 'deck_add' THEN
    IF jsonb_typeof(p_payload->'items') <> 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN
      PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'cards'));
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
      IF NULLIF(btrim(COALESCE(v_item->>'card_name', '')), '') IS NULL
         OR COALESCE((v_item->>'quantity')::integer, 1) < 1 OR COALESCE((v_item->>'quantity')::integer, 1) > 99 THEN
        PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'cards'));
      END IF;
      v_n := v_n + COALESCE((v_item->>'quantity')::integer, 1);
      v_cards := v_cards || jsonb_build_object('name', v_item->>'card_name', 'quantity', COALESCE((v_item->>'quantity')::integer, 1));
    END LOOP;
    IF v_n > (v_lim->>'max_request')::int THEN PERFORM public._ai_fail('too_many_cards', jsonb_build_object('max', v_lim->'max_request')); END IF;
    v_after := jsonb_set(v_before, '{size}', to_jsonb(((v_before->>'size')::int) + v_n));

  ELSIF p_action IN ('deck_remove', 'deck_zone') THEN
    IF jsonb_typeof(p_payload->'slots') <> 'array' OR jsonb_array_length(p_payload->'slots') = 0 THEN
      PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'cards'));
    END IF;
    IF p_action = 'deck_zone' AND COALESCE(p_payload->>'to', '') NOT IN ('maybeboard', 'main') THEN
      PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'to'));
    END IF;
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_payload->'slots') LOOP
      SELECT dc.id, dc.card_name, dc.copy_id, dc.is_commander, dc.command_zone_role, dc.is_generic, dc.generic_sleeved, dc.categories
        INTO v_row FROM deck_cards dc
       WHERE dc.id = (v_slot->>'id')::integer AND dc.deck_id = v_deck AND dc.user_id = p_user_id;
      IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (v_slot->>'card_name') THEN
        PERFORM public._ai_fail('slot_not_found', jsonb_build_object('card', v_slot->>'card_name', 'deck', v_names->>v_deck::text));
      END IF;
      IF (v_row.id = ANY (v_seen)) THEN PERFORM public._ai_fail('duplicate_slot', jsonb_build_object('card', v_row.card_name)); END IF;
      v_seen := v_seen || v_row.id;
      IF v_row.is_commander OR v_row.command_zone_role IS NOT NULL THEN
        PERFORM public._ai_fail('commander_slot', jsonb_build_object('card', v_row.card_name, 'deck', v_names->>v_deck::text));
      END IF;
      IF p_action = 'deck_zone' AND (p_payload->>'to' = 'maybeboard') = public._ai_is_maybe(v_row.categories) THEN
        PERFORM public._ai_fail('already_there', jsonb_build_object('card', v_row.card_name, 'to', p_payload->>'to'));
      END IF;
      IF public._ai_slot_is_sleeved(v_row.is_generic, v_row.generic_sleeved, v_row.copy_id) THEN v_sleeved_removed := v_sleeved_removed + 1; END IF;
      IF COALESCE(v_row.is_generic, false) AND v_row.generic_sleeved = false THEN v_unsl_gen_removed := v_unsl_gen_removed + 1; END IF;
      v_n := v_n + 1;
      v_cards := v_cards || jsonb_build_object('name', v_row.card_name, 'quantity', 1, 'was_sleeved', v_row.copy_id IS NOT NULL);
    END LOOP;
    IF v_n > (v_lim->>'max_request')::int THEN PERFORM public._ai_fail('too_many_cards', jsonb_build_object('max', v_lim->'max_request')); END IF;
    IF p_action = 'deck_remove' THEN
      v_after := jsonb_build_object('size', (v_before->>'size')::int - v_n,
                                    'sleeved', (v_before->>'sleeved')::int - v_sleeved_removed,
                                    'unsleeved_generics', (v_before->>'unsleeved_generics')::int - v_unsl_gen_removed);
    ELSE
      -- to the maybeboard a sleeved copy is released (D-005, D-039); back to the main list it comes back as a planned slot
      v_after := CASE WHEN p_payload->>'to' = 'maybeboard'
                      THEN jsonb_set(v_before, '{sleeved}', to_jsonb((v_before->>'sleeved')::int - v_sleeved_removed))
                      ELSE v_before END;
    END IF;

  ELSIF p_action = 'sleeve_copy' THEN
    SELECT uc.id, uc.missing, c.card_name INTO v_copy FROM user_copies uc JOIN user_cards c ON c.id = uc.card_id
     WHERE uc.id = (p_payload->>'copy_id')::integer AND uc.user_id = p_user_id;
    IF NOT FOUND OR v_copy.card_name IS DISTINCT FROM (p_payload->>'card_name') THEN PERFORM public._ai_fail('copy_not_found', jsonb_build_object('copy_id', p_payload->>'copy_id')); END IF;
    PERFORM public._ai_lock_copy(v_copy.id);
    IF v_copy.missing THEN PERFORM public._ai_fail('copy_missing', jsonb_build_object('card', v_copy.card_name)); END IF;
    SELECT d.name AS deck_name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id
     WHERE dc.copy_id = v_copy.id AND dc.user_id = p_user_id LIMIT 1;
    IF FOUND THEN PERFORM public._ai_fail('copy_already_in_deck', jsonb_build_object('card', v_copy.card_name, 'deck', v_holder.deck_name)); END IF;
    SELECT dc.id INTO v_target FROM deck_cards dc
     WHERE dc.deck_id = v_deck AND dc.user_id = p_user_id AND dc.card_name = v_copy.card_name AND dc.copy_id IS NULL
       AND NOT public._ai_is_maybe(dc.categories) AND NOT COALESCE(dc.is_generic, false)
     ORDER BY dc.id LIMIT 1 FOR UPDATE;
    IF v_target IS NULL THEN PERFORM public._ai_fail('no_open_slot', jsonb_build_object('card', v_copy.card_name, 'deck', v_names->>v_deck::text)); END IF;
    v_n := 1; v_cards := jsonb_build_array(jsonb_build_object('name', v_copy.card_name, 'quantity', 1));
    v_after := jsonb_set(v_before, '{sleeved}', to_jsonb((v_before->>'sleeved')::int + 1));
    RETURN jsonb_build_object('action', p_action, 'deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', 1, 'cards', v_cards,
      'target_slot_id', v_target, 'copy_id', v_copy.id, 'card_name', v_copy.card_name,
      'preview', jsonb_build_object('cards', v_cards, 'decks', jsonb_build_array(
        jsonb_build_object('deck_id', v_deck, 'name', v_names->>v_deck::text, 'role', 'gains', 'before', v_before, 'after', v_after))));

  ELSIF p_action IN ('make_original', 'create_proxy') THEN
    SELECT dc.id, dc.card_name, dc.copy_id, dc.ownership_status, dc.is_commander, dc.command_zone_role INTO v_row
      FROM deck_cards dc WHERE dc.id = (p_payload->>'slot_id')::integer AND dc.deck_id = v_deck AND dc.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (p_payload->>'card_name') THEN
      PERFORM public._ai_fail('slot_not_found', jsonb_build_object('card', p_payload->>'card_name', 'deck', v_names->>v_deck::text));
    END IF;
    IF p_action = 'create_proxy' THEN
      IF v_row.copy_id IS NOT NULL THEN PERFORM public._ai_fail('slot_already_sleeved', jsonb_build_object('card', v_row.card_name, 'deck', v_names->>v_deck::text)); END IF;
      IF NOT EXISTS (SELECT 1 FROM user_cards WHERE user_id = p_user_id AND card_name = v_row.card_name) THEN
        PERFORM public._ai_fail('no_card_record', jsonb_build_object('card', v_row.card_name));
      END IF;
      v_after := jsonb_set(v_before, '{sleeved}', to_jsonb((v_before->>'sleeved')::int + 1));
    ELSE
      IF v_row.copy_id IS NULL OR v_row.ownership_status IS DISTINCT FROM 'proxy' THEN
        PERFORM public._ai_fail('slot_not_a_proxy', jsonb_build_object('card', v_row.card_name, 'deck', v_names->>v_deck::text));
      END IF;
      SELECT uc.id, uc.is_proxy, uc.missing, uc.card_id INTO v_copy FROM user_copies uc
       WHERE uc.id = (p_payload->>'original_copy_id')::integer AND uc.user_id = p_user_id;
      IF NOT FOUND THEN PERFORM public._ai_fail('copy_not_found', jsonb_build_object('copy_id', p_payload->>'original_copy_id')); END IF;
      PERFORM public._ai_lock_copy(LEAST(v_copy.id, v_row.copy_id)); PERFORM public._ai_lock_copy(GREATEST(v_copy.id, v_row.copy_id));
      IF v_copy.is_proxy THEN PERFORM public._ai_fail('replacement_is_proxy', jsonb_build_object('card', v_row.card_name)); END IF;
      IF v_copy.missing THEN PERFORM public._ai_fail('copy_missing', jsonb_build_object('card', v_row.card_name)); END IF;
      IF NOT EXISTS (SELECT 1 FROM user_cards c WHERE c.id = v_copy.card_id AND c.card_name = v_row.card_name) THEN
        PERFORM public._ai_fail('wrong_card', jsonb_build_object('card', v_row.card_name));
      END IF;
      SELECT d.name AS deck_name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = v_copy.id AND dc.user_id = p_user_id LIMIT 1;
      IF FOUND THEN PERFORM public._ai_fail('copy_already_in_deck', jsonb_build_object('card', v_row.card_name, 'deck', v_holder.deck_name)); END IF;
      v_after := v_before;
    END IF;
    v_n := 1; v_cards := jsonb_build_array(jsonb_build_object('name', v_row.card_name, 'quantity', 1));
    RETURN jsonb_build_object('action', p_action, 'deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', 1, 'cards', v_cards,
      'slot_id', v_row.id, 'card_name', v_row.card_name,
      'preview', jsonb_build_object('cards', v_cards, 'decks', jsonb_build_array(
        jsonb_build_object('deck_id', v_deck, 'name', v_names->>v_deck::text, 'role', 'changes', 'before', v_before, 'after', v_after))));
  END IF;

  RETURN jsonb_build_object('action', p_action, 'deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', v_n, 'cards', v_cards,
    'preview', jsonb_build_object('cards', v_cards, 'decks', jsonb_build_array(
      jsonb_build_object('deck_id', v_deck, 'name', v_names->>v_deck::text, 'role', 'changes', 'before', v_before, 'after', v_after))));
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Gate: does this go straight through (NULL) or wait for the owner (a reason)?
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_gate(p_user_id uuid, p_action text, p_deck_id integer, p_n integer) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_lim jsonb := public._ai_limits(); v_recent integer; v_hour integer;
BEGIN
  IF p_action = 'copy_move' THEN RETURN 'card_move'; END IF;                       -- ALWAYS waits, even for one card
  IF p_n > (v_lim->>'direct_max')::int THEN RETURN 'over_ten'; END IF;
  IF p_deck_id IS NOT NULL THEN                                                    -- 10 + 10 + 10 in a row is still a big edit
    SELECT count(*) INTO v_recent FROM ai_change_log
     WHERE user_id = p_user_id AND deck_id = p_deck_id AND NOT approved_by_owner
       AND created_at > now() - make_interval(mins => (v_lim->>'split_window_minutes')::int);
    IF v_recent + p_n > (v_lim->>'direct_max')::int THEN RETURN 'recent_total'; END IF;
  END IF;
  SELECT count(*) INTO v_hour FROM ai_change_log
   WHERE user_id = p_user_id AND NOT approved_by_owner
     AND (created_at > now() - interval '1 hour' OR (undone_by = 'claude' AND undone_at > now() - interval '1 hour'));
  IF v_hour + p_n > (v_lim->>'hourly_max')::int THEN RETURN 'busy'; END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Execute: the ONE place that changes data for the connector (direct path and approved path both land here).
--    Re-validates through _ai_plan under locks, makes the change, writes the log rows. Returns {group_id, count}.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_execute(
  p_user_id uuid, p_connection_id uuid, p_client_name text, p_action text, p_payload jsonb, p_pending_id uuid, p_approved boolean
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_plan jsonb := public._ai_plan(p_user_id, p_action, p_payload);
  v_group uuid := gen_random_uuid();
  v_deck integer := NULLIF(v_plan->>'deck_id', '')::integer;
  v_deck_name text := v_plan->>'deck_name';
  v_item jsonb; v_slot jsonb; v_q integer; v_i integer; v_new integer; v_count integer := 0;
  v_row record; v_rel jsonb; v_res jsonb; v_cardrow record; v_uc integer; v_created boolean := false; v_loc integer; v_old_loc integer;
  v_proxy_loc integer; v_old_proxy integer;
BEGIN
  IF p_action = 'deck_add' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
      v_q := COALESCE((v_item->>'quantity')::integer, 1);
      FOR v_i IN 1..v_q LOOP
        INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id, copy_id, ownership_status)
        VALUES (v_deck, v_item->>'card_name', v_item->>'scryfall_id', v_item->>'set_code', 1, v_item->>'categories', false, p_user_id, NULL, NULL)
        RETURNING id INTO v_new;
        INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, oracle_id, printing_id,
                                   deck_card_id, before, after, pending_id, approved_by_owner)
        VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'deck_add', v_deck, v_deck_name, v_item->>'card_name', v_item->>'oracle_id', v_item->>'scryfall_id',
                v_new, '{}'::jsonb, jsonb_build_object('categories', v_item->>'categories'), p_pending_id, p_approved);
        v_count := v_count + 1;
      END LOOP;
    END LOOP;

  ELSIF p_action = 'deck_remove' THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_payload->'slots') LOOP
      SELECT to_jsonb(dc) AS snap, dc.card_name, dc.copy_id, dc.scryfall_id INTO v_row FROM deck_cards dc WHERE dc.id = (v_slot->>'id')::integer;
      v_res := public.remove_deck_card_with_release(v_deck, (v_slot->>'id')::integer, p_user_id);   -- existing atomic function: releases the copy (D-039), deletes the slot
      INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, printing_id,
                                 deck_card_id, copy_id, before, after, pending_id, approved_by_owner)
      VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'deck_remove', v_deck, v_deck_name, v_row.card_name, v_row.scryfall_id,
              (v_slot->>'id')::integer, v_row.copy_id, jsonb_build_object('slot', v_row.snap),
              jsonb_build_object('released_to_location_id', v_res->'target_location_id'), p_pending_id, p_approved);
      v_count := v_count + 1;
    END LOOP;

  ELSIF p_action = 'deck_zone' THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_payload->'slots') LOOP
      SELECT dc.card_name, dc.copy_id, dc.ownership_status, dc.placement_source, dc.categories, dc.scryfall_id INTO v_row FROM deck_cards dc WHERE dc.id = (v_slot->>'id')::integer;
      v_loc := NULL;
      IF p_payload->>'to' = 'maybeboard' AND v_row.copy_id IS NOT NULL THEN
        v_res := public.unassign_copy_to_storage(v_row.copy_id, p_user_id);     -- existing atomic function: copy back to storage
        v_loc := NULLIF(v_res->>'location_id', '')::integer;
      END IF;
      UPDATE deck_cards SET categories = CASE WHEN p_payload->>'to' = 'maybeboard' THEN '["Maybeboard"]' ELSE '["Other"]' END
       WHERE id = (v_slot->>'id')::integer AND user_id = p_user_id;
      INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, printing_id,
                                 deck_card_id, copy_id, before, after, pending_id, approved_by_owner)
      VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'deck_zone', v_deck, v_deck_name, v_row.card_name, v_row.scryfall_id,
              (v_slot->>'id')::integer, v_row.copy_id,
              jsonb_build_object('categories', v_row.categories, 'copy_id', v_row.copy_id, 'ownership_status', v_row.ownership_status, 'placement_source', v_row.placement_source),
              jsonb_build_object('to', p_payload->>'to', 'categories', CASE WHEN p_payload->>'to' = 'maybeboard' THEN '["Maybeboard"]' ELSE '["Other"]' END,
                                 'released_to_location_id', v_loc), p_pending_id, p_approved);
      v_count := v_count + 1;
    END LOOP;

  ELSIF p_action = 'sleeve_copy' THEN
    SELECT uc.location_id, uc.is_proxy, uc.printing_id INTO v_row FROM user_copies uc WHERE uc.id = (v_plan->>'copy_id')::integer;
    UPDATE deck_cards SET copy_id = (v_plan->>'copy_id')::integer,
           ownership_status = CASE WHEN v_row.is_proxy THEN 'proxy' ELSE 'original' END, placement_source = 'ai'
     WHERE id = (v_plan->>'target_slot_id')::integer AND user_id = p_user_id AND copy_id IS NULL;
    UPDATE user_copies SET location_id = NULL WHERE id = (v_plan->>'copy_id')::integer AND user_id = p_user_id;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, printing_id, deck_card_id, copy_id, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'sleeve_copy', v_deck, v_deck_name, v_plan->>'card_name', v_row.printing_id,
            (v_plan->>'target_slot_id')::integer, (v_plan->>'copy_id')::integer,
            jsonb_build_object('copy_location_id', v_row.location_id), jsonb_build_object('ownership_status', CASE WHEN v_row.is_proxy THEN 'proxy' ELSE 'original' END), p_pending_id, p_approved);
    v_count := 1;

  ELSIF p_action = 'make_original' THEN
    SELECT dc.copy_id INTO v_old_proxy FROM deck_cards dc WHERE dc.id = (p_payload->>'slot_id')::integer;
    v_res := public.replace_proxy_with_original((p_payload->>'slot_id')::integer, (p_payload->>'original_copy_id')::integer, NULL, p_user_id, 'ai');
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, deck_card_id, copy_id, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'make_original', v_deck, v_deck_name, v_plan->>'card_name', (p_payload->>'slot_id')::integer,
            (p_payload->>'original_copy_id')::integer, jsonb_build_object('proxy_copy_id', v_old_proxy),
            jsonb_build_object('proxy_location_id', v_res->'proxy_location_id'), p_pending_id, p_approved);
    v_count := 1;

  ELSIF p_action = 'create_proxy' THEN
    SELECT c.id INTO v_uc FROM user_cards c WHERE c.user_id = p_user_id AND c.card_name = v_plan->>'card_name' ORDER BY c.id LIMIT 1;
    v_res := public.add_proxy_to_slot((p_payload->>'slot_id')::integer, v_uc, p_user_id, 'ai');
    UPDATE user_copies SET source_tag = 'claude_connector' WHERE id = (v_res->>'copy_id')::integer AND user_id = p_user_id;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, deck_card_id, copy_id, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'create_proxy', v_deck, v_deck_name, v_plan->>'card_name', (p_payload->>'slot_id')::integer,
            (v_res->>'copy_id')::integer, '{}'::jsonb, jsonb_build_object('user_card_id', v_uc), p_pending_id, p_approved);
    v_count := 1;

  ELSIF p_action = 'collection_add' THEN
    INSERT INTO user_cards (user_id, oracle_id, card_name) VALUES (p_user_id, p_payload->>'oracle_id', p_payload->>'card_name')
      ON CONFLICT (oracle_id, user_id) DO NOTHING RETURNING id INTO v_uc;
    IF v_uc IS NOT NULL THEN v_created := true; ELSE SELECT id INTO v_uc FROM user_cards WHERE user_id = p_user_id AND oracle_id = p_payload->>'oracle_id'; END IF;
    v_res := public.insert_user_copies(p_user_id, jsonb_build_array(jsonb_build_object(
      'card_id', v_uc, 'printing_id', p_payload->>'printing_id', 'finish', COALESCE(p_payload->>'finish', 'nonfoil'), 'is_proxy', false, 'source_tag', 'claude_connector')));
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, card_name, oracle_id, printing_id, copy_id, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'collection_add', p_payload->>'card_name', p_payload->>'oracle_id', p_payload->>'printing_id',
            (v_res->'inserted_ids'->>0)::integer, '{}'::jsonb,
            jsonb_build_object('user_card_id', v_uc, 'user_card_created', v_created, 'finish', COALESCE(p_payload->>'finish', 'nonfoil')), p_pending_id, p_approved);
    v_count := 1;

  ELSIF p_action = 'copy_move' THEN
    SELECT dc.placement_source, dc.ownership_status INTO v_row FROM deck_cards dc WHERE dc.id = (v_plan->>'source_slot_id')::integer;
    -- Same effect as reassign_to_deck (source slot goes back to PLANNED: copy_id, ownership_status, placement_source cleared;
    -- target slot takes the copy; copy has no storage location), but the target slot is chosen by _ai_plan so a maybeboard slot is never picked.
    UPDATE deck_cards SET copy_id = NULL, ownership_status = NULL, placement_source = NULL
     WHERE id = (v_plan->>'source_slot_id')::integer AND user_id = p_user_id;
    UPDATE deck_cards SET copy_id = (v_plan->>'copy_id')::integer,
           ownership_status = CASE WHEN (v_plan->>'is_proxy')::boolean THEN 'proxy' ELSE 'original' END, placement_source = 'ai'
     WHERE id = (v_plan->>'target_slot_id')::integer AND user_id = p_user_id AND copy_id IS NULL;
    UPDATE user_copies SET location_id = NULL WHERE id = (v_plan->>'copy_id')::integer AND user_id = p_user_id;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, other_deck_id, other_deck_name, card_name, printing_id,
                               deck_card_id, other_deck_card_id, copy_id, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'copy_move', v_deck, v_deck_name, (v_plan->>'other_deck_id')::integer, v_plan->>'other_deck_name',
            v_plan->>'card_name', v_plan->>'printing_id', (v_plan->>'source_slot_id')::integer, (v_plan->>'target_slot_id')::integer, (v_plan->>'copy_id')::integer,
            jsonb_build_object('source_placement_source', v_row.placement_source, 'source_ownership_status', v_row.ownership_status),
            jsonb_build_object('target_slot_id', (v_plan->>'target_slot_id')::integer), p_pending_id, p_approved);
    v_count := 1;
  END IF;

  RETURN jsonb_build_object('group_id', v_group, 'count', v_count, 'plan', v_plan);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. ai_submit_change: the entry point for every Claude edit tool.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_submit_change(
  p_user_id uuid, p_connection_id uuid, p_action text, p_payload jsonb, p_dry_run boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client text; v_plan jsonb; v_reason text; v_hash text; v_existing record; v_pending uuid; v_res jsonb; v_lim jsonb := public._ai_limits();
BEGIN
  -- The off-switch, inside the transaction: lock the connection row. revoke_connector_connection takes the same lock, so a request
  -- either finishes before the revoke (and the revoke then cancels what it queued) or is refused after it.
  SELECT client_name INTO v_client FROM connector_connections
   WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;

  PERFORM public._ai_expire_pending(p_user_id);
  v_plan := public._ai_plan(p_user_id, p_action, p_payload);
  v_reason := public._ai_gate(p_user_id, p_action, NULLIF(v_plan->>'deck_id', '')::integer, (v_plan->>'n')::integer);

  IF p_dry_run THEN
    RETURN jsonb_build_object('success', true, 'outcome', CASE WHEN v_reason IS NULL THEN 'would_apply' ELSE 'would_wait' END,
                              'reason', v_reason, 'plan', v_plan);
  END IF;

  IF v_reason IS NULL THEN
    v_res := public._ai_execute(p_user_id, p_connection_id, v_client, p_action, p_payload, NULL, false);
    RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_res->'group_id', 'count', v_res->'count', 'plan', v_plan);
  END IF;

  -- Waits for the owner. Same request already waiting: return that one (no pile-up).
  v_hash := md5(p_action || ':' || p_payload::text);
  SELECT id, expires_at INTO v_existing FROM ai_pending_changes WHERE user_id = p_user_id AND payload_hash = v_hash AND status = 'waiting';
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'pending', 'pending_id', v_existing.id, 'expires_at', v_existing.expires_at, 'reason', v_reason, 'plan', v_plan, 'duplicate', true);
  END IF;
  IF (SELECT count(*) FROM ai_pending_changes WHERE user_id = p_user_id AND status = 'waiting') >= (v_lim->>'max_waiting')::int THEN
    PERFORM public._ai_fail('too_many_waiting', jsonb_build_object('max', v_lim->'max_waiting'));
  END IF;
  INSERT INTO ai_pending_changes (user_id, connection_id, client_name, kind, action, reason, deck_id, deck_name, other_deck_id, other_deck_name,
                                  card_count, payload, payload_hash, preview)
  VALUES (p_user_id, p_connection_id, v_client, CASE WHEN p_action = 'copy_move' THEN 'copy_move' ELSE 'big_edit' END, p_action, v_reason,
          NULLIF(v_plan->>'deck_id', '')::integer, v_plan->>'deck_name', NULLIF(v_plan->>'other_deck_id', '')::integer, v_plan->>'other_deck_name',
          (v_plan->>'n')::integer, p_payload, v_hash, v_plan->'preview')
  RETURNING id INTO v_pending;
  RETURN jsonb_build_object('success', true, 'outcome', 'pending', 'pending_id', v_pending,
                            'expires_at', (SELECT expires_at FROM ai_pending_changes WHERE id = v_pending), 'reason', v_reason, 'plan', v_plan);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Pending: expire, list, count, approve, decline
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_expire_pending(p_user_id uuid) RETURNS integer
LANGUAGE sql SET search_path = public AS $$
  WITH u AS (UPDATE ai_pending_changes SET status = 'expired', decided_at = now()
              WHERE user_id = p_user_id AND status = 'waiting' AND expires_at <= now() RETURNING 1)
  SELECT count(*)::integer FROM u
$$;

CREATE OR REPLACE FUNCTION public.ai_pending_count(p_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ai_expire_pending(p_user_id);
  RETURN (SELECT count(*) FROM ai_pending_changes WHERE user_id = p_user_id AND status = 'waiting')::integer;
END;
$$;

-- Waiting ones, plus ones that ended in the last 7 days without being applied (declined, expired, cancelled, failed), newest first.
CREATE OR REPLACE FUNCTION public.ai_list_pending(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._ai_expire_pending(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(p) - 'payload' - 'payload_hash' ORDER BY p.created_at DESC)
                     FROM ai_pending_changes p
                    WHERE p.user_id = p_user_id
                      AND (p.status = 'waiting' OR (p.status IN ('declined','expired','cancelled','failed') AND p.decided_at > now() - interval '7 days'))), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_get_pending(p_user_id uuid, p_connection_id uuid, p_pending_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row ai_pending_changes;
BEGIN
  -- Claude's read of ONE of its own requests. Same connection only; no payload, no way to act on it.
  PERFORM public._ai_expire_pending(p_user_id);
  SELECT * INTO v_row FROM ai_pending_changes WHERE id = p_pending_id AND user_id = p_user_id AND connection_id = p_connection_id;
  IF NOT FOUND THEN PERFORM public._ai_fail('pending_not_found'); END IF;
  RETURN jsonb_build_object('success', true, 'pending', to_jsonb(v_row) - 'payload' - 'payload_hash');
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_approve_pending(p_user_id uuid, p_pending_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p ai_pending_changes; v_client text; v_res jsonb; v_code text; v_detail text;
BEGIN
  SELECT * INTO v_p FROM ai_pending_changes WHERE id = p_pending_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('pending_not_found'); END IF;
  IF v_p.status <> 'waiting' THEN RETURN jsonb_build_object('success', false, 'outcome', v_p.status); END IF;
  IF v_p.expires_at <= now() THEN
    UPDATE ai_pending_changes SET status = 'expired', decided_at = now() WHERE id = v_p.id;
    RETURN jsonb_build_object('success', false, 'outcome', 'expired');
  END IF;
  -- The connection must still be on (a switch-off cancels waiting requests; this is the second lock on the same door).
  SELECT client_name INTO v_client FROM connector_connections WHERE id = v_p.connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    UPDATE ai_pending_changes SET status = 'cancelled', cancel_reason = 'connection_ended', decided_at = now() WHERE id = v_p.id;
    RETURN jsonb_build_object('success', false, 'outcome', 'cancelled');
  END IF;
  BEGIN
    v_res := public._ai_execute(p_user_id, v_p.connection_id, v_client, v_p.action, v_p.payload, v_p.id, true);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    -- Nothing was changed (the block above rolled back). Record why, so the card can say it.
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    v_code := SQLERRM;
    UPDATE ai_pending_changes SET status = 'failed', decided_at = now(), decided_via = 'oracle_session',
           failure_reason = jsonb_build_object('code', v_code) || COALESCE(NULLIF(v_detail, '')::jsonb, '{}'::jsonb) WHERE id = v_p.id;
    RETURN jsonb_build_object('success', false, 'outcome', 'failed', 'reason', jsonb_build_object('code', v_code) || COALESCE(NULLIF(v_detail, '')::jsonb, '{}'::jsonb));
  END;
  UPDATE ai_pending_changes SET status = 'approved', decided_at = now(), decided_via = 'oracle_session', result_group_id = (v_res->>'group_id')::uuid WHERE id = v_p.id;
  RETURN jsonb_build_object('success', true, 'outcome', 'approved', 'group_id', v_res->'group_id', 'count', v_res->'count');
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_decline_pending(p_user_id uuid, p_pending_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  UPDATE ai_pending_changes SET status = 'declined', decided_at = now(), decided_via = 'oracle_session'
   WHERE id = p_pending_id AND user_id = p_user_id AND status = 'waiting' AND expires_at > now() RETURNING status INTO v_status;
  IF v_status IS NULL THEN
    SELECT status INTO v_status FROM ai_pending_changes WHERE id = p_pending_id AND user_id = p_user_id;
    IF v_status IS NULL THEN PERFORM public._ai_fail('pending_not_found'); END IF;
    RETURN jsonb_build_object('success', false, 'outcome', v_status);
  END IF;
  RETURN jsonb_build_object('success', true, 'outcome', 'declined');
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. The off-switch: revoke the connection AND cancel everything waiting, in one transaction.
--    Replaces the plain UPDATE in src/lib/connector/revoke.ts (revokeRow). Same row lock as ai_submit_change.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_connector_connection(p_user_id uuid, p_connection_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client text; v_cancelled integer;
BEGIN
  UPDATE connector_connections SET revoked_at = now()
   WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL RETURNING client_id INTO v_client;
  IF v_client IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  WITH c AS (UPDATE ai_pending_changes SET status = 'cancelled', cancel_reason = 'switched_off', decided_at = now()
              WHERE user_id = p_user_id AND connection_id = p_connection_id AND status = 'waiting' RETURNING 1)
  SELECT count(*)::integer INTO v_cancelled FROM c;
  RETURN jsonb_build_object('success', true, 'client_id', v_client, 'cancelled_pending', v_cancelled);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Undo
-- ---------------------------------------------------------------------------------------------------------------
-- Returns NULL when this row can be undone, else {code, ...details}. Pure read. "on" = when something later touched the same slot or copy.
CREATE OR REPLACE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_slot record; v_copy record; v_holder text; v_on timestamptz; v_dup integer; v_snap jsonb; v_loc integer; v_deckname text;
BEGIN
  SELECT max(l.created_at) INTO v_on FROM ai_change_log l
   WHERE l.user_id = p_user_id AND l.id <> r.id AND l.created_at > r.created_at
     AND ((r.deck_card_id IS NOT NULL AND (l.deck_card_id = r.deck_card_id OR l.other_deck_card_id = r.deck_card_id)) OR (r.copy_id IS NOT NULL AND l.copy_id = r.copy_id));
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;

  IF r.kind = 'deck_add' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;                                              -- already gone: nothing to reverse
    IF v_slot.copy_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'slot_sleeved', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    IF v_slot.categories IS DISTINCT FROM r.after->>'categories' OR v_slot.is_commander THEN
      RETURN jsonb_build_object('code', 'slot_edited', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind IN ('deck_remove', 'deck_zone') THEN
    IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
    IF r.kind = 'deck_remove' THEN
      v_snap := r.before->'slot';
      IF EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND card_name = r.card_name
                    AND NOT COALESCE((v_snap->>'is_generic')::boolean, false)) THEN
        RETURN jsonb_build_object('code', 'card_back_on_list', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on);
      END IF;
    ELSE
      SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('code', 'slot_gone', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
      IF v_slot.categories IS DISTINCT FROM r.after->>'categories' THEN RETURN jsonb_build_object('code', 'slot_edited', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
      IF v_slot.copy_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'slot_sleeved', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    END IF;
    IF r.copy_id IS NOT NULL THEN                                                        -- the copy was released to storage: it must still be right there
      v_loc := NULLIF(r.after->>'released_to_location_id', '')::integer;
      SELECT * INTO v_copy FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('code', 'copy_gone', 'card', r.card_name, 'on', v_on); END IF;
      SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = r.copy_id AND dc.user_id = p_user_id LIMIT 1;
      IF v_holder IS NOT NULL THEN RETURN jsonb_build_object('code', 'copy_elsewhere', 'card', r.card_name, 'deck', v_holder, 'on', v_on); END IF;
      IF v_copy.missing OR v_loc IS NULL OR v_copy.location_id IS DISTINCT FROM v_loc THEN RETURN jsonb_build_object('code', 'copy_moved', 'card', r.card_name, 'on', v_on); END IF;
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'sleeve_copy' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN
      SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = r.copy_id AND dc.user_id = p_user_id LIMIT 1;
      RETURN jsonb_build_object('code', 'copy_moved', 'card', r.card_name, 'deck', v_holder, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'make_original' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN RETURN jsonb_build_object('code', 'slot_changed', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    SELECT * INTO v_copy FROM user_copies WHERE id = (r.before->>'proxy_copy_id')::integer AND user_id = p_user_id;
    SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = (r.before->>'proxy_copy_id')::integer AND dc.user_id = p_user_id LIMIT 1;
    IF NOT FOUND OR v_holder IS NOT NULL OR v_copy.location_id IS DISTINCT FROM NULLIF(r.after->>'proxy_location_id', '')::integer THEN
      RETURN jsonb_build_object('code', 'proxy_moved', 'card', r.card_name, 'deck', v_holder, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'create_proxy' THEN                                                    -- owner only; removes ONLY the proxy copy this row created
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN RETURN jsonb_build_object('code', 'slot_changed', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    IF NOT EXISTS (SELECT 1 FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id AND is_proxy AND source_tag = 'claude_connector') THEN
      RETURN jsonb_build_object('code', 'copy_changed', 'card', r.card_name, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'collection_add' THEN                                                  -- owner only; removes ONLY the copy this row created
    SELECT * INTO v_copy FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;                                              -- already gone
    SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = r.copy_id AND dc.user_id = p_user_id LIMIT 1;
    IF v_holder IS NOT NULL THEN RETURN jsonb_build_object('code', 'copy_in_deck', 'card', r.card_name, 'deck', v_holder, 'on', v_on); END IF;
    IF v_copy.is_proxy OR v_copy.source_tag IS DISTINCT FROM 'claude_connector' OR v_copy.missing THEN RETURN jsonb_build_object('code', 'copy_changed', 'card', r.card_name, 'on', v_on); END IF;
    RETURN NULL;

  ELSIF r.kind = 'copy_move' THEN                                                       -- owner only
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.other_deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN RETURN jsonb_build_object('code', 'copy_moved_again', 'card', r.card_name, 'deck', r.other_deck_name, 'on', v_on); END IF;
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('code', 'source_slot_gone', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    IF v_slot.copy_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'source_slot_filled', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_kind_owner_only(p_kind text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('collection_add', 'create_proxy', 'copy_move')
$$;

CREATE OR REPLACE FUNCTION public.ai_list_recent_changes(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb := '[]'::jsonb; r ai_change_log;
BEGIN
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND undoable_until > now() ORDER BY created_at DESC, id LIMIT 300 LOOP
    v_out := v_out || (to_jsonb(r) - 'before' - 'after'
      || jsonb_build_object('owner_only', public._ai_kind_owner_only(r.kind), 'undo_blocker', CASE WHEN r.undone_at IS NULL THEN public._ai_undo_blocker(p_user_id, r) END));
  END LOOP;
  RETURN v_out;
END;
$$;

-- All or nothing. p_actor 'claude' = from the connector (p_connection_id must be given and active); 'owner' = from a cookie session.
CREATE OR REPLACE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits(); r ai_change_log; v_rows ai_change_log[]; v_n integer; v_block jsonb; v_slot record; v_snap jsonb; v_copy record; v_deck_ids integer[]; v_ucid integer; v_left integer;
BEGIN
  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._ai_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  END IF;
  SELECT array_agg(l ORDER BY l.id), array_agg(DISTINCT l.deck_id) FILTER (WHERE l.deck_id IS NOT NULL) INTO v_rows, v_deck_ids
    FROM ai_change_log l WHERE l.user_id = p_user_id AND l.group_id = p_group_id;
  v_n := COALESCE(cardinality(v_rows), 0);
  IF v_n = 0 THEN PERFORM public._ai_fail('change_not_found'); END IF;
  FOREACH r IN ARRAY v_rows LOOP
    IF p_actor = 'claude' AND (public._ai_kind_owner_only(r.kind) OR v_n > (v_lim->>'claude_undo_max')::int OR r.approved_by_owner) THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only', 'card', r.card_name, 'deck', r.deck_name));
    END IF;
  END LOOP;

  -- Lock decks (ascending), then copies (ascending), THEN check. Decks of both sides of a move are locked.
  SELECT array_agg(DISTINCT x) INTO v_deck_ids FROM (SELECT unnest(v_deck_ids) AS x UNION SELECT l.other_deck_id FROM ai_change_log l
      WHERE l.user_id = p_user_id AND l.group_id = p_group_id AND l.other_deck_id IS NOT NULL) q WHERE x IS NOT NULL;
  PERFORM 1 FROM decks WHERE user_id = p_user_id AND id = ANY (COALESCE(v_deck_ids, ARRAY[]::integer[])) ORDER BY id FOR UPDATE;
  FOR v_ucid IN SELECT DISTINCT l.copy_id FROM ai_change_log l WHERE l.user_id = p_user_id AND l.group_id = p_group_id AND l.copy_id IS NOT NULL ORDER BY 1 LOOP
    PERFORM public._ai_lock_copy(v_ucid);
  END LOOP;

  FOREACH r IN ARRAY v_rows LOOP
    SELECT * INTO r FROM ai_change_log WHERE id = r.id FOR UPDATE;                       -- fresh row (undone_at may have just changed)
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', v_block); END IF;   -- nothing has been changed yet
  END LOOP;

  FOREACH r IN ARRAY v_rows LOOP
    IF r.kind = 'deck_add' THEN
      DELETE FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id AND copy_id IS NULL;

    ELSIF r.kind = 'deck_remove' THEN
      v_snap := r.before->'slot';
      INSERT INTO deck_cards (deck_id, card_name, scryfall_id, set_code, quantity, categories, is_commander, user_id, copy_id, ownership_status, placement_source,
                              is_generic, generic_sleeved, requested_finish)
      VALUES (r.deck_id, v_snap->>'card_name', v_snap->>'scryfall_id', v_snap->>'set_code', COALESCE((v_snap->>'quantity')::integer, 1), v_snap->>'categories',
              COALESCE((v_snap->>'is_commander')::boolean, false), p_user_id, NULL, NULL, NULL,
              COALESCE((v_snap->>'is_generic')::boolean, false), COALESCE((v_snap->>'generic_sleeved')::boolean, true), v_snap->>'requested_finish')
      RETURNING id INTO v_ucid;
      IF r.copy_id IS NOT NULL THEN
        UPDATE deck_cards SET copy_id = r.copy_id, ownership_status = v_snap->>'ownership_status', placement_source = v_snap->>'placement_source' WHERE id = v_ucid;
        UPDATE user_copies SET location_id = NULL WHERE id = r.copy_id AND user_id = p_user_id;
      END IF;

    ELSIF r.kind = 'deck_zone' THEN
      UPDATE deck_cards SET categories = r.before->>'categories' WHERE id = r.deck_card_id AND user_id = p_user_id;
      IF r.copy_id IS NOT NULL THEN
        UPDATE deck_cards SET copy_id = r.copy_id, ownership_status = r.before->>'ownership_status', placement_source = r.before->>'placement_source' WHERE id = r.deck_card_id;
        UPDATE user_copies SET location_id = NULL WHERE id = r.copy_id AND user_id = p_user_id;
      END IF;

    ELSIF r.kind = 'sleeve_copy' THEN
      UPDATE deck_cards SET copy_id = NULL, ownership_status = NULL, placement_source = NULL WHERE id = r.deck_card_id AND user_id = p_user_id;
      UPDATE user_copies SET location_id = COALESCE((SELECT id FROM user_locations WHERE id = NULLIF(r.before->>'copy_location_id', '')::integer AND user_id = p_user_id),
                                                    public._ensure_default_storage_location_id(p_user_id)) WHERE id = r.copy_id AND user_id = p_user_id;

    ELSIF r.kind = 'make_original' THEN
      UPDATE deck_cards SET copy_id = (r.before->>'proxy_copy_id')::integer, ownership_status = 'proxy', placement_source = 'ai' WHERE id = r.deck_card_id AND user_id = p_user_id;
      UPDATE user_copies SET location_id = NULL WHERE id = (r.before->>'proxy_copy_id')::integer AND user_id = p_user_id;
      UPDATE user_copies SET location_id = public._ensure_default_storage_location_id(p_user_id) WHERE id = r.copy_id AND user_id = p_user_id;

    ELSIF r.kind = 'create_proxy' THEN                                                   -- owner only (checked above): remove the one proxy copy THIS row created
      UPDATE deck_cards SET copy_id = NULL, ownership_status = NULL, placement_source = NULL WHERE id = r.deck_card_id AND user_id = p_user_id;
      DELETE FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id AND is_proxy AND source_tag = 'claude_connector';

    ELSIF r.kind = 'collection_add' THEN                                                 -- owner only: remove the one copy THIS row created, nothing else
      DELETE FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id AND NOT is_proxy AND source_tag = 'claude_connector';
      IF COALESCE((r.after->>'user_card_created')::boolean, false) THEN                   -- clean up the card record only if Claude made it and nothing uses it
        DELETE FROM user_cards c WHERE c.id = (r.after->>'user_card_id')::integer AND c.user_id = p_user_id
          AND NOT EXISTS (SELECT 1 FROM user_copies uc WHERE uc.card_id = c.id);
      END IF;

    ELSIF r.kind = 'copy_move' THEN                                                      -- owner only: put the copy back in the source slot
      UPDATE deck_cards SET copy_id = NULL, ownership_status = NULL, placement_source = NULL WHERE id = r.other_deck_card_id AND user_id = p_user_id;
      UPDATE deck_cards SET copy_id = r.copy_id, ownership_status = r.before->>'source_ownership_status', placement_source = r.before->>'source_placement_source'
       WHERE id = r.deck_card_id AND user_id = p_user_id;
    END IF;
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 9. "Moved elsewhere" history line for the deck page (spec section 8). Slots of THIS deck whose copy Claude moved away
--    (owner-approved) and that are still planned, i.e. still shown "Unavailable · In {deck}".
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_moved_slots(p_user_id uuid, p_deck_id integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slot_id', l.deck_card_id, 'card_name', l.card_name, 'moved_to_deck_id', l.other_deck_id,
           'moved_to_deck_name', COALESCE(d.name, l.other_deck_name), 'at', l.created_at, 'client_name', l.client_name, 'approved_by_owner', l.approved_by_owner)), '[]'::jsonb)
    FROM ai_change_log l
    JOIN deck_cards s ON s.id = l.deck_card_id AND s.user_id = p_user_id AND s.copy_id IS NULL
    LEFT JOIN decks d ON d.id = l.other_deck_id AND d.user_id = p_user_id
   WHERE l.user_id = p_user_id AND l.kind = 'copy_move' AND l.deck_id = p_deck_id AND l.undone_at IS NULL
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 10. Privileges: service_role ONLY, for every function in this file. (Default privileges already deny new functions to
--     PUBLIC/anon/authenticated per CC-03a; revoked explicitly anyway so the migration is self-evident.)
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE 'ai\_%' OR p.proname LIKE '\_ai\_%' OR p.proname = 'revoke_connector_connection')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
