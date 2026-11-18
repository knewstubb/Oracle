-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: card roles (CC-26), database change DB-2 of 4. Author: Architect, 2026-11-18.
-- Contract: docs/oracle/contracts/card-roles-and-deck-jobs.md (sections 5.2, 6, 11). Test: docs/oracle/reports/evidence/roles-db/test_db2.sh
-- Depends on: DB-1 (20261118120000), CC-13 (20261117100000), the guard fix 20261117120000, CC-15a (20261117200000) and CC-15b. All applied live per status.md [Approximate: re-check before apply].
--
-- What this does (same technique as 20261116190000 and 20261117200000):
--   1. Widens the two allow-lists by TWO names, card_label and strategy_point (ai_change_log.kind, ai_pending_changes.action). One widening, done once.
--   2. Renames four live functions to *_pre_roles and puts a thin function with the OLD name in front. It handles the two new kinds and hands every
--      other kind to the renamed function UNCHANGED, so every existing kind keeps running the code that is live today.
--         _ai_plan -> _ai_plan_pre_roles            _ai_execute -> _ai_execute_pre_roles
--         _ai_undo_blocker -> _ai_undo_blocker_pre_roles       ai_undo_group -> _ai_undo_group_pre_roles
--   3. Adds the card_label handlers (plan, execute, undo, blocker): Claude proposes roles (and, from DB-3, a job) for cards of one deck. ONE log row per
--      card per request, so a card with a role and a job counts ONCE toward the 120 limit (contract S9). Claude rows only; never an owner row.
--   4. Adds stubs for the job steps (filled in by DB-3) and the strategy-point steps (filled in by DB-4). Until then a request that needs them is
--      refused (jobs_not_available / strategy_points_not_available) and nothing is written.
--   5. Replaces ai_list_recent_changes with the 20261117100000 body plus ONE extra field, label_detail.
--   6. Adds _ai_limits_roles() and the owner-side Accept / Dismiss / Accept-all functions for roles.
-- Claude CAN undo its own role proposals (not owner-only). The owner's own edits are not logged (contract S15).
-- Not destructive: no DELETE or UPDATE of existing rows. Constraint swaps scan two small tables. Writes of the new kinds are atomic with the log row, in the caller's transaction.
-- Reversible: supabase/drafts/20261118120100_roles_db2_change_kinds.rollback.sql (refuses while new-kind log or pending rows exist).

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.owner_set_card_role(uuid,uuid,text,text)') IS NULL THEN RAISE EXCEPTION 'apply roles_db1 first'; END IF;
  IF to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'roles_db2 already applied (_ai_plan_pre_roles exists)'; END IF;
  IF to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NULL OR to_regprocedure('public._ai_limits_new()') IS NULL THEN RAISE EXCEPTION 'apply 20261117200000_cc15a first'; END IF;
  IF to_regprocedure('public._ai_plan(uuid,text,jsonb)') IS NULL OR to_regprocedure('public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)') IS NULL
     OR to_regprocedure('public._ai_undo_blocker(uuid,ai_change_log)') IS NULL OR to_regprocedure('public.ai_undo_group(uuid,uuid,text,uuid)') IS NULL
     OR to_regprocedure('public._ai_has_maybe_marker(text)') IS NULL OR to_regprocedure('public._ai_lock_decks(uuid,integer[])') IS NULL THEN
    RAISE EXCEPTION 'connector functions not found; wrong base';
  END IF;
  IF (public._ai_limits()->>'direct_max')::int <> 120 OR (public._ai_limits()->>'max_request')::int <> 200 THEN RAISE EXCEPTION 'apply 20261117100000_cc13_loosen_limits first'; END IF;
  IF position('v_deck_cleared' IN pg_get_functiondef('public._ai_change_log_guard()'::regprocedure)) = 0 THEN RAISE EXCEPTION 'apply 20261117120000 first'; END IF;
END $$;

-- 1. Allow-lists, found by their text (they list 'deck_zone'), as in 20261116190000.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
            WHERE contype = 'c' AND conrelid IN ('public.ai_pending_changes'::regclass, 'public.ai_change_log'::regclass)
              AND pg_get_constraintdef(oid) LIKE '%deck_zone%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ai_pending_changes ADD CONSTRAINT ai_pending_changes_action_check CHECK (action IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category','card_label','strategy_point'));
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point'));
-- ai_pending_changes.kind stays big_edit; reason values unchanged ('over_ten' still means "over the one-request limit").
-- _ai_kind_owner_only is NOT changed: Claude may undo its own role proposals and strategy points (it deletes no owner data).

-- ---------------------------------------------------------------------------------------------------------------
-- 6a. Numbers for these kinds. KEEP IN STEP with AI_LIMITS_ROLES in card-roles-and-deck-jobs.types.ts (a test asserts equal).
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public._ai_limits_roles() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'job_name_max_chars', 40, 'reason_max_chars', 200, 'statement_max_chars', 200,
    'strategy_points_per_deck_max', 30, 'strategy_points_per_request_max', 10, 'point_cards_max', 100,
    'roles_per_card_max', 13, 'labels_page_max', 150)
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Hooks. Stubs here; DB-3 replaces the four job hooks, DB-4 the four strategy-point steps.
--    _ai_label_job_plan(user, deck, oracle, {name, reason}) -> {result: proposed|beside_yours|skipped, why, job, reason, before}
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public._ai_label_job_plan(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('jobs_not_available'); RETURN NULL; END $$;
CREATE FUNCTION public._ai_label_job_apply(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb, p_batch_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('jobs_not_available'); END $$;
CREATE FUNCTION public._ai_label_job_restore(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_before jsonb, p_after jsonb) RETURNS boolean
LANGUAGE sql SET search_path = public AS $$ SELECT false $$;
CREATE FUNCTION public._ai_label_job_unchanged(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT true $$;

CREATE FUNCTION public._ai_plan_strategy_point(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('strategy_points_not_available'); RETURN NULL; END $$;
CREATE FUNCTION public._ai_execute_strategy_point(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN PERFORM public._roles_fail('strategy_points_not_available'); RETURN NULL; END $$;
CREATE FUNCTION public._ai_undo_strategy_point(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$ SELECT jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo')) $$;
CREATE FUNCTION public._ai_blocker_strategy_point(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT NULL::jsonb $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3a. card_label PLAN. Validates under locks, changes nothing, describes the effect. Payload (what the tool sends):
--     {deck_id, cards:[{id, card_name, add_roles?:[role], remove_roles?:[role], job?:{name, reason?}}]}   (id = deck_cards.id, as set_card_category's slots)
--     Order of the layered rule for each requested role (contract section 4):
--       equals what the card already effectively has, or an identical Claude row is already waiting -> skipped 'unchanged'; Claude row dismissed with the identical value -> skipped 'previously_dismissed';
--       the owner has a different value -> written BESIDE it ('beside_yours'); otherwise 'proposed'.
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public._ai_plan_card_label(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits(); v_deck integer; v_names jsonb; v_map jsonb; v_slot jsonb; v_row record; v_oid uuid;
  v_seen_slots integer[] := ARRAY[]::integer[]; v_seen_oids uuid[] := ARRAY[]::uuid[];
  v_slugs text[] := ARRAY['ramp','fixing','card_draw','card_selection','tutor','targeted_removal','board_wipe','counterspell','protection','recursion','graveyard_hate','stax_tax','hand_disruption'];
  v_add text[]; v_rem text[]; v_x text; v_effect text; v_n integer := 0; v_changes jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_cards jsonb := '[]'::jsonb;
  v_items jsonb; v_job jsonb; v_jr jsonb; v_o record; v_c record; v_base boolean; v_eff boolean; v_want boolean; v_res text; v_jname text; v_jreason text; v_before jsonb;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR COALESCE(p_payload->>'deck_id', '') !~ '^[0-9]+$' THEN
    PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'deck_id'));
  END IF;
  v_deck := (p_payload->>'deck_id')::integer;
  -- Lock order (contract 5.5): connection row (taken by the caller), per-user advisory lock, deck row, then the rows.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_card_label:' || p_user_id::text, 0));
  v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck]);
  IF jsonb_typeof(p_payload->'cards') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'cards') = 0 THEN
    PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'cards'));
  END IF;
  IF jsonb_array_length(p_payload->'cards') > (v_lim->>'max_request')::int THEN PERFORM public._roles_fail('too_many_cards', jsonb_build_object('max', v_lim->'max_request')); END IF;
  SELECT COALESCE(jsonb_object_agg(s.slot_id::text, s.oracle_id), '{}'::jsonb) INTO v_map FROM public.deck_slot_oracle_ids(p_user_id, v_deck) s;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_payload->'cards') LOOP
    IF jsonb_typeof(v_slot) <> 'object' OR COALESCE(v_slot->>'id', '') !~ '^[0-9]+$' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'cards')); END IF;
    SELECT dc.id, dc.card_name, dc.categories, dc.scryfall_id INTO v_row FROM deck_cards dc
     WHERE dc.id = (v_slot->>'id')::integer AND dc.deck_id = v_deck AND dc.user_id = p_user_id;
    IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (v_slot->>'card_name') THEN
      PERFORM public._roles_fail('slot_not_found', jsonb_build_object('card', v_slot->>'card_name', 'deck', v_names->>v_deck::text));
    END IF;
    IF v_row.id = ANY (v_seen_slots) THEN PERFORM public._roles_fail('duplicate_slot', jsonb_build_object('card', v_row.card_name)); END IF;
    v_seen_slots := v_seen_slots || v_row.id;
    v_oid := NULLIF(v_map->>(v_row.id::text), '')::uuid;
    IF v_oid IS NULL THEN PERFORM public._roles_fail('card_not_identified', jsonb_build_object('card', v_row.card_name)); END IF;
    IF v_oid = ANY (v_seen_oids) THEN PERFORM public._roles_fail('duplicate_card', jsonb_build_object('card', v_row.card_name)); END IF;
    v_seen_oids := v_seen_oids || v_oid;

    -- role lists
    IF (v_slot ? 'add_roles' AND jsonb_typeof(v_slot->'add_roles') <> 'array') OR (v_slot ? 'remove_roles' AND jsonb_typeof(v_slot->'remove_roles') <> 'array') THEN
      PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'roles', 'card', v_row.card_name));
    END IF;
    v_add := ARRAY(SELECT DISTINCT x FROM jsonb_array_elements_text(COALESCE(v_slot->'add_roles', '[]'::jsonb)) x ORDER BY x);
    v_rem := ARRAY(SELECT DISTINCT x FROM jsonb_array_elements_text(COALESCE(v_slot->'remove_roles', '[]'::jsonb)) x ORDER BY x);
    FOREACH v_x IN ARRAY v_add || v_rem LOOP
      IF NOT (v_x = ANY (v_slugs)) THEN PERFORM public._roles_fail('unknown_role', jsonb_build_object('role', v_x, 'card', v_row.card_name)); END IF;
    END LOOP;
    IF v_add && v_rem THEN
      PERFORM public._roles_fail('conflicting_roles', jsonb_build_object('card', v_row.card_name, 'role', (SELECT min(a) FROM unnest(v_add) a WHERE a = ANY (v_rem))));
    END IF;
    IF cardinality(v_add) = 0 AND cardinality(v_rem) = 0 AND NOT (v_slot ? 'job') THEN
      PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'cards', 'card', v_row.card_name));
    END IF;

    -- job request (validated here; the layered rule is in the job hook)
    v_job := NULL;
    IF v_slot ? 'job' THEN
      IF jsonb_typeof(v_slot->'job') <> 'object' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'job', 'card', v_row.card_name)); END IF;
      IF public._ai_has_maybe_marker(v_row.categories) THEN PERFORM public._roles_fail('slot_in_maybeboard', jsonb_build_object('card', v_row.card_name, 'deck', v_names->>v_deck::text)); END IF;
      IF jsonb_typeof(v_slot->'job'->'name') IS DISTINCT FROM 'string' THEN PERFORM public._roles_fail('bad_job_name'); END IF;
      v_jname := regexp_replace(v_slot->'job'->>'name', '^\s+|\s+$', '', 'g');
      IF v_jname = '' OR char_length(v_jname) > (public._ai_limits_roles()->>'job_name_max_chars')::int THEN PERFORM public._roles_fail('bad_job_name'); END IF;
      v_jreason := NULL;
      IF v_slot->'job' ? 'reason' AND jsonb_typeof(v_slot->'job'->'reason') <> 'null' THEN
        IF jsonb_typeof(v_slot->'job'->'reason') <> 'string' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'reason')); END IF;
        v_jreason := NULLIF(regexp_replace(v_slot->'job'->>'reason', '^\s+|\s+$', '', 'g'), '');
        IF char_length(COALESCE(v_jreason, '')) > (public._ai_limits_roles()->>'reason_max_chars')::int THEN PERFORM public._roles_fail('reason_too_long'); END IF;
      END IF;
      v_jr := public._ai_label_job_plan(p_user_id, v_deck, v_oid, jsonb_build_object('name', v_jname, 'reason', v_jreason));
      IF v_jr->>'result' IN ('proposed', 'beside_yours') THEN
        v_job := jsonb_build_object('name', v_jr->>'job', 'reason', v_jr->'reason', 'result', v_jr->>'result');
      ELSE
        v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'what', 'job', 'why', v_jr->>'why');
      END IF;
    END IF;

    -- roles
    v_items := '[]'::jsonb;
    FOREACH v_x IN ARRAY v_add || v_rem LOOP
      v_effect := CASE WHEN v_x = ANY (v_add) THEN 'add' ELSE 'remove' END;
      v_want := v_effect = 'add';
      SELECT effect, state INTO v_o FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = v_oid AND role = v_x AND proposer = 'owner';
      SELECT effect, state INTO v_c FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = v_oid AND role = v_x AND proposer = 'claude';
      v_base := EXISTS (SELECT 1 FROM ref_card_roles WHERE oracle_id = v_oid AND role = v_x);
      v_eff := CASE WHEN v_o.effect IS NOT NULL THEN v_o.effect = 'add'
                    WHEN v_c.state = 'to_look_at' THEN v_c.effect = 'add'
                    ELSE v_base END;
      IF v_eff = v_want THEN
        v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'what', v_x, 'why', 'unchanged');
      ELSIF v_c.state = 'to_look_at' AND v_c.effect = v_effect THEN   -- Claude's identical proposal is already waiting (beside an owner value): not written twice
        v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'what', v_x, 'why', 'unchanged');
      ELSIF v_c.state = 'dismissed' AND v_c.effect = v_effect THEN
        v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'what', v_x, 'why', 'previously_dismissed');
      ELSE
        v_res := CASE WHEN v_o.effect IS NOT NULL THEN 'beside_yours' ELSE 'proposed' END;
        v_items := v_items || jsonb_build_object('role', v_x, 'effect', v_effect, 'result', v_res);
      END IF;
    END LOOP;

    IF jsonb_array_length(v_items) > 0 OR v_job IS NOT NULL THEN
      v_n := v_n + 1;
      v_changes := v_changes || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'oracle_id', v_oid, 'roles', v_items, 'job', v_job);
      v_cards := v_cards || jsonb_build_object('name', v_row.card_name, 'quantity', 1, 'roles', v_items, 'job', v_job);
    END IF;
  END LOOP;

  IF v_n = 0 THEN PERFORM public._roles_fail('nothing_to_change', jsonb_build_object('deck', v_names->>v_deck::text, 'skipped', v_skipped)); END IF;
  v_before := public._ai_deck_counts(p_user_id, v_deck);
  RETURN jsonb_build_object('action', 'card_label', 'deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', v_n, 'cards', v_cards,
    'changes', v_changes, 'skipped', v_skipped,
    'preview', jsonb_build_object('cards', v_cards, 'decks', jsonb_build_array(
      jsonb_build_object('deck_id', v_deck, 'name', v_names->>v_deck::text, 'role', 'changes', 'before', v_before, 'after', v_before))));   -- deck counts do not change
END;
$$;

-- 3b. card_label EXECUTE. Re-plans under the locks (so an approved request is re-validated), writes only Claude rows, one log row per card.
CREATE FUNCTION public._ai_execute_card_label(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_plan jsonb; v_group uuid := gen_random_uuid(); v_deck integer; v_deck_name text; v_ch jsonb; v_it jsonb; v_oid uuid; v_slot integer; v_count integer := 0;
  v_c record; v_before_roles jsonb; v_after_roles jsonb; v_beside jsonb; v_before_job jsonb; v_after_job jsonb; v_jr jsonb; v_req jsonb; v_cards jsonb;
  v_sf text; v_card text; v_cardreq jsonb;
BEGIN
  v_plan := public._ai_plan_card_label(p_user_id, p_payload);
  v_deck := (v_plan->>'deck_id')::integer; v_deck_name := v_plan->>'deck_name';
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_plan->'changes') LOOP
    v_oid := (v_ch->>'oracle_id')::uuid; v_slot := (v_ch->>'slot_id')::integer; v_card := v_ch->>'card_name';
    v_before_roles := '[]'::jsonb; v_after_roles := '[]'::jsonb; v_beside := '[]'::jsonb; v_before_job := NULL; v_after_job := NULL;
    FOR v_it IN SELECT * FROM jsonb_array_elements(v_ch->'roles') LOOP
      SELECT effect, state, batch_id, proposed_in_deck_id INTO v_c FROM user_card_roles
       WHERE user_id = p_user_id AND oracle_id = v_oid AND role = v_it->>'role' AND proposer = 'claude';
      v_before_roles := v_before_roles || jsonb_build_object('role', v_it->>'role',
        'row', CASE WHEN FOUND THEN jsonb_build_object('effect', v_c.effect, 'state', v_c.state, 'batch_id', v_c.batch_id, 'proposed_in_deck_id', v_c.proposed_in_deck_id) END);
      INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state, proposed_in_deck_id, batch_id)
      VALUES (p_user_id, v_oid, v_it->>'role', v_it->>'effect', 'claude', 'to_look_at', v_deck, v_group)
      ON CONFLICT (user_id, oracle_id, role, proposer) DO UPDATE
        SET effect = EXCLUDED.effect, state = 'to_look_at', proposed_in_deck_id = EXCLUDED.proposed_in_deck_id, batch_id = EXCLUDED.batch_id, updated_at = now();
      v_after_roles := v_after_roles || jsonb_build_object('role', v_it->>'role', 'effect', v_it->>'effect', 'state', 'to_look_at', 'result', v_it->>'result');
      IF v_it->>'result' = 'beside_yours' THEN v_beside := v_beside || jsonb_build_object('what', 'role', 'role', v_it->>'role'); END IF;
    END LOOP;
    IF jsonb_typeof(v_ch->'job') = 'object' THEN
      v_jr := public._ai_label_job_plan(p_user_id, v_deck, v_oid, jsonb_build_object('name', v_ch->'job'->>'name', 'reason', v_ch->'job'->'reason'));   -- same locks: gives the prior row for the log
      v_before_job := jsonb_build_object('row', v_jr->'before');
      PERFORM public._ai_label_job_apply(p_user_id, v_deck, v_oid,
        jsonb_build_object('job', v_ch->'job'->>'name', 'reason', v_ch->'job'->'reason', 'card_name', v_card), v_group);
      v_after_job := jsonb_build_object('job', v_ch->'job'->>'name', 'reason', v_ch->'job'->'reason', 'state', 'to_look_at', 'result', v_ch->'job'->>'result');
      IF v_ch->'job'->>'result' = 'beside_yours' THEN v_beside := v_beside || jsonb_build_object('what', 'job'); END IF;
    END IF;
    SELECT dc.scryfall_id INTO v_sf FROM deck_cards dc WHERE dc.id = v_slot AND dc.user_id = p_user_id;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, oracle_id, printing_id, deck_card_id,
                               before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'card_label', v_deck, v_deck_name, v_card, v_oid::text, v_sf, v_slot,
            jsonb_build_object('roles', v_before_roles, 'job', v_before_job),
            jsonb_build_object('roles', v_after_roles, 'job', v_after_job, 'beside', v_beside), p_pending_id, p_approved);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('group_id', v_group, 'count', v_count, 'plan', v_plan);
END;
$$;

-- 3c. Blocker (a pure read): NULL = this log row can be undone, else {code, ...}. "Is every row it wrote still exactly what Claude left?"
CREATE FUNCTION public._ai_blocker_card_label(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_it jsonb; v_oid uuid := NULLIF(r.oracle_id, '')::uuid;
BEGIN
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
  IF NOT EXISTS (SELECT 1 FROM deck_cards WHERE id = r.deck_card_id AND deck_id = r.deck_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('code', 'slot_gone', 'card', r.card_name, 'deck', r.deck_name);
  END IF;
  FOR v_it IN SELECT * FROM jsonb_array_elements(COALESCE(r.after->'roles', '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = v_oid AND role = v_it->>'role' AND proposer = 'claude'
                      AND effect = v_it->>'effect' AND state = 'to_look_at') THEN
      RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', v_it->>'role');
    END IF;
  END LOOP;
  IF jsonb_typeof(r.after->'job') = 'object' AND NOT public._ai_label_job_unchanged(p_user_id, r.deck_id, v_oid, r.after->'job') THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'job');
  END IF;
  RETURN NULL;
END;
$$;

-- 3d. Undo of one card_label group. Claude: all or nothing (the first blocker refuses, nothing has changed yet). Owner: rows still as Claude left them are
-- restored, rows the owner touched since are left alone and reported. Owner rows are never written. Only undone_at / undone_by change on the log.
CREATE FUNCTION public._ai_undo_card_label(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  r ai_change_log; v_block jsonb; v_ok uuid[] := ARRAY[]::uuid[]; v_left jsonb := '[]'::jsonb; v_it jsonb; v_oid uuid; v_n integer := 0; v_row jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_card_label:' || p_user_id::text, 0));
  PERFORM 1 FROM decks WHERE user_id = p_user_id AND id IN (SELECT deck_id FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND deck_id IS NOT NULL) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'card_label') THEN PERFORM public._roles_fail('change_not_found'); END IF;
  PERFORM 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone'));
  END IF;
  -- pass 1 (a pure read)
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL ORDER BY id LOOP
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NULL THEN
      v_ok := v_ok || r.id;
    ELSIF p_actor = 'owner' AND v_block->>'code' IN ('changed_since', 'slot_gone') THEN
      v_left := v_left || jsonb_build_object('card', r.card_name, 'deck', r.deck_name, 'what', COALESCE(v_block->>'what', 'card'));
    ELSE
      RETURN jsonb_build_object('success', false, 'refused', v_block);
    END IF;
  END LOOP;
  IF cardinality(v_ok) = 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo'), 'left_alone', v_left); END IF;
  -- pass 2: restore the Claude rows exactly as they were before this request
  FOR r IN SELECT * FROM ai_change_log WHERE id = ANY (v_ok) ORDER BY id LOOP
    v_oid := r.oracle_id::uuid;
    FOR v_it IN SELECT * FROM jsonb_array_elements(COALESCE(r.before->'roles', '[]'::jsonb)) LOOP
      v_row := v_it->'row';
      IF v_row IS NULL OR jsonb_typeof(v_row) = 'null' THEN
        DELETE FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = v_oid AND role = v_it->>'role' AND proposer = 'claude';
      ELSE
        INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state, proposed_in_deck_id, batch_id)
        VALUES (p_user_id, v_oid, v_it->>'role', v_row->>'effect', 'claude', v_row->>'state',
                (SELECT d.id FROM decks d WHERE d.id = NULLIF(v_row->>'proposed_in_deck_id', '')::integer), NULLIF(v_row->>'batch_id', '')::uuid)
        ON CONFLICT (user_id, oracle_id, role, proposer) DO UPDATE
          SET effect = EXCLUDED.effect, state = EXCLUDED.state, proposed_in_deck_id = EXCLUDED.proposed_in_deck_id, batch_id = EXCLUDED.batch_id, updated_at = now();
      END IF;
    END LOOP;
    IF jsonb_typeof(r.before->'job') = 'object' THEN
      PERFORM public._ai_label_job_restore(p_user_id, r.deck_id, v_oid, r.before->'job', r.after->'job');
    END IF;
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n, 'left_alone', v_left);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Front doors. Rename the live function, put a function with the OLD name and signature in front.
-- ---------------------------------------------------------------------------------------------------------------
ALTER FUNCTION public._ai_plan(uuid, text, jsonb) RENAME TO _ai_plan_pre_roles;
CREATE FUNCTION public._ai_plan(p_user_id uuid, p_action text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'card_label' THEN RETURN public._ai_plan_card_label(p_user_id, p_payload); END IF;
  IF p_action = 'strategy_point' THEN RETURN public._ai_plan_strategy_point(p_user_id, p_payload); END IF;
  RETURN public._ai_plan_pre_roles(p_user_id, p_action, p_payload);
END;
$$;

ALTER FUNCTION public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean) RENAME TO _ai_execute_pre_roles;
CREATE FUNCTION public._ai_execute(p_user_id uuid, p_connection_id uuid, p_client_name text, p_action text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'card_label' THEN RETURN public._ai_execute_card_label(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  IF p_action = 'strategy_point' THEN RETURN public._ai_execute_strategy_point(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  RETURN public._ai_execute_pre_roles(p_user_id, p_connection_id, p_client_name, p_action, p_payload, p_pending_id, p_approved);
END;
$$;

ALTER FUNCTION public._ai_undo_blocker(uuid, ai_change_log) RENAME TO _ai_undo_blocker_pre_roles;
CREATE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF r.kind = 'card_label' THEN RETURN public._ai_blocker_card_label(p_user_id, r); END IF;
  IF r.kind = 'strategy_point' THEN RETURN public._ai_blocker_strategy_point(p_user_id, r); END IF;
  RETURN public._ai_undo_blocker_pre_roles(p_user_id, r);
END;
$$;

ALTER FUNCTION public.ai_undo_group(uuid, uuid, text, uuid) RENAME TO _ai_undo_group_pre_roles;
CREATE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_n integer; v_total integer; v_lim jsonb := public._ai_limits();
BEGIN
  SELECT min(kind), count(*) INTO v_kind, v_n FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind IN ('card_label', 'strategy_point');
  IF v_n = 0 THEN RETURN public._ai_undo_group_pre_roles(p_user_id, p_group_id, p_actor, p_connection_id); END IF;   -- every other kind: unchanged code
  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._roles_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._roles_fail('connection_revoked'); END IF;
    SELECT count(*) INTO v_total FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id;
    IF v_total > (v_lim->>'claude_undo_max')::int OR EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND approved_by_owner) THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only'));
    END IF;
  END IF;
  IF v_kind = 'card_label' THEN RETURN public._ai_undo_card_label(p_user_id, p_group_id, p_actor); END IF;
  RETURN public._ai_undo_strategy_point(p_user_id, p_group_id, p_actor);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Recent changes: the 20261117100000 body plus ONE field, label_detail (jsonb), filled only for the two new kinds. Reasons are not included.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_list_recent_changes(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb; r ai_change_log; g record; v_total integer := 0; v_block jsonb; v_found boolean;
BEGIN
  FOR g IN SELECT l.group_id, count(*)::integer AS n FROM ai_change_log l
            WHERE l.user_id = p_user_id AND l.undoable_until > now()
            GROUP BY l.group_id ORDER BY max(l.created_at) DESC, l.group_id LIMIT 50
  LOOP
    EXIT WHEN v_total > 0 AND v_total + g.n > 2000;                    -- row safety cap; a group is never cut in half
    v_total := v_total + g.n;
    v_found := false;
    FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = g.group_id ORDER BY created_at DESC, id LOOP
      v_block := NULL;
      IF r.undone_at IS NULL AND NOT v_found THEN
        v_block := public._ai_undo_blocker(p_user_id, r);
        v_found := v_block IS NOT NULL;
      END IF;
      v_out := v_out || (to_jsonb(r) - 'before' - 'after'
        || jsonb_build_object('owner_only', public._ai_kind_owner_only(r.kind),
                              'undo_blocker', v_block,
                              'zone_to', CASE WHEN r.kind = 'deck_zone' THEN CASE WHEN COALESCE(r.after->>'categories', '') LIKE '%Maybeboard%' THEN 'maybeboard' ELSE 'main' END END,
                              'categories_from', CASE WHEN r.kind = 'deck_category' THEN to_jsonb(public._ai_category_list(r.before->>'categories')) END,
                              'categories_to', CASE WHEN r.kind = 'deck_category' THEN r.after->'category_list' END,
                              'label_detail', CASE
                                WHEN r.kind = 'card_label' THEN jsonb_build_object(
                                  'roles', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', x->>'role', 'effect', x->>'effect')) FROM jsonb_array_elements(COALESCE(r.after->'roles', '[]'::jsonb)) x), '[]'::jsonb),
                                  'job', CASE WHEN jsonb_typeof(r.after->'job') = 'object' THEN r.after->'job'->'job' END,
                                  'beside', COALESCE(jsonb_array_length(r.after->'beside'), 0) > 0)
                                WHEN r.kind = 'strategy_point' THEN jsonb_build_object(
                                  'statement', r.after->>'statement', 'covers_kind', r.after->>'covers_kind', 'card_type', r.after->>'card_type',
                                  'effect_kind', r.after->>'effect_kind', 'effect_group', r.after->>'effect_group')
                              END));
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6b. Owner-side Accept / Dismiss / Accept-all for roles. Service role only; p_user_id on every read and write. Not logged (contract S15).
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public.owner_decide_card_role(p_user_id uuid, p_oracle_id uuid, p_role text, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c user_card_roles; v_before jsonb; v_after jsonb;
BEGIN
  IF p_role IS NULL OR NOT (p_role = ANY (ARRAY['ramp','fixing','card_draw','card_selection','tutor','targeted_removal','board_wipe','counterspell','protection','recursion','graveyard_hate','stax_tax','hand_disruption'])) THEN
    PERFORM public._roles_fail('unknown_role', jsonb_build_object('role', p_role));
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'dismiss') THEN PERFORM public._roles_fail('bad_decision', jsonb_build_object('decision', p_decision)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('card_role:' || p_user_id::text || ':' || COALESCE(p_oracle_id::text, ''), 0));
  SELECT * INTO v_c FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude' AND state = 'to_look_at' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('no_proposal'); END IF;
  v_before := jsonb_build_object(
    'owner_effect', (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'owner'),
    'claude_effect', v_c.effect, 'claude_state', v_c.state);
  IF p_decision = 'accept' THEN
    INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (p_user_id, p_oracle_id, p_role, v_c.effect, 'owner', 'accepted')
    ON CONFLICT (user_id, oracle_id, role, proposer) DO UPDATE SET effect = EXCLUDED.effect, updated_at = now();
    DELETE FROM user_card_roles WHERE id = v_c.id;
  ELSE
    UPDATE user_card_roles SET state = 'dismissed', updated_at = now() WHERE id = v_c.id;
  END IF;
  v_after := jsonb_build_object(
    'owner_effect', (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'owner'),
    'claude_effect', (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'),
    'claude_state', (SELECT state FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'));
  RETURN jsonb_build_object('previous', v_before, 'current', v_after);
END;
$$;

CREATE FUNCTION public.owner_accept_role_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_n integer := 0; v_oids uuid[];
BEGIN
  IF p_deck_id IS NULL AND p_batch_id IS NULL THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'scope')); END IF;
  IF p_deck_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
    SELECT array_agg(s.oracle_id) INTO v_oids FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s WHERE s.oracle_id IS NOT NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_card_label:' || p_user_id::text, 0));
  FOR v_c IN SELECT * FROM user_card_roles
              WHERE user_id = p_user_id AND proposer = 'claude' AND state = 'to_look_at'
                AND (p_batch_id IS NULL OR batch_id = p_batch_id) AND (p_deck_id IS NULL OR oracle_id = ANY (COALESCE(v_oids, ARRAY[]::uuid[])))
              ORDER BY id FOR UPDATE
  LOOP
    INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (p_user_id, v_c.oracle_id, v_c.role, v_c.effect, 'owner', 'accepted')
    ON CONFLICT (user_id, oracle_id, role, proposer) DO UPDATE SET effect = EXCLUDED.effect, updated_at = now();
    DELETE FROM user_card_roles WHERE id = v_c.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('accepted', v_n);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Privileges: service_role ONLY for every function this file creates. The renamed *_pre_roles functions are NOT touched: they keep exactly the grants they had.
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._ai_limits_roles()', 'public._ai_label_job_plan(uuid,integer,uuid,jsonb)', 'public._ai_label_job_apply(uuid,integer,uuid,jsonb,uuid)',
    'public._ai_label_job_restore(uuid,integer,uuid,jsonb,jsonb)', 'public._ai_label_job_unchanged(uuid,integer,uuid,jsonb)',
    'public._ai_plan_strategy_point(uuid,jsonb)', 'public._ai_execute_strategy_point(uuid,uuid,text,jsonb,uuid,boolean)',
    'public._ai_undo_strategy_point(uuid,uuid,text)', 'public._ai_blocker_strategy_point(uuid,ai_change_log)',
    'public._ai_plan_card_label(uuid,jsonb)', 'public._ai_execute_card_label(uuid,uuid,text,jsonb,uuid,boolean)',
    'public._ai_blocker_card_label(uuid,ai_change_log)', 'public._ai_undo_card_label(uuid,uuid,text)',
    'public._ai_plan(uuid,text,jsonb)', 'public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)', 'public._ai_undo_blocker(uuid,ai_change_log)',
    'public.ai_undo_group(uuid,uuid,text,uuid)', 'public.ai_list_recent_changes(uuid)',
    'public.owner_decide_card_role(uuid,uuid,text,text)', 'public.owner_accept_role_proposals(uuid,integer,uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
