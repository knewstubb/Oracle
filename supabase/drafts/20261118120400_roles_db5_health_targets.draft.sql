-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: card roles and deck jobs (CC-26), database change DB-5 of 5 (decision D-060). Author: Coder, 2026-11-18.
-- Contract: docs/oracle/contracts/card-roles-and-deck-jobs.md (sections 3.6, 7.2, 7.3 step 9, 8.6, 11). Test: docs/oracle/reports/evidence/roles-db/test_db5.sh
-- Depends on: DB-2 (20261118120100). Does NOT need DB-1's tables, DB-3 or DB-4 in any way, but is written to be applied last (order 1, 2, 3, 4, 5).
--
-- What this does (and only this):
--   1. deck_health_targets: for one deck, one row per health group (lands, ramp, card_advantage, interaction) holding the target number, a short reason,
--      who set it ('claude' or 'owner') and the number it replaced (for Undo). A row set by the owner is an OVERRIDE: Claude never writes over it (S17).
--      "Handed back to Claude" = the owner's row is deleted; the group then has no row, so Claude may set it again (and until it does, the fallback order applies).
--      RLS: a user sees only their own rows; signed-in users get no write grant; every write goes through a function (service role only).
--   2. Adds the change kind health_target to the two allow-lists (ai_change_log.kind, ai_pending_changes.action), the same way DB-2 added card_label.
--   3. Adds the Claude-side steps (_ai_plan_ / _ai_execute_ / _ai_blocker_ / _ai_undo_health_target) and puts them behind the four DB-2 front doors
--      (_ai_plan, _ai_execute, _ai_undo_blocker, ai_undo_group). Those four are replaced in place (CREATE OR REPLACE) with the DB-2 text plus ONE extra
--      line each for health_target; every other kind runs exactly the code it runs today. Claude's call is ai_submit_change('health_target', payload).
--      A request is one batch with one log row per group, applied at once, with one Undo. A group with an owner override is skipped and reported as left_alone.
--   4. Adds the owner-side functions: owner_set_health_target (an override), owner_hand_back_health_target, get_deck_health_targets.
-- Not destructive: one new table, new functions, four function bodies replaced, two allow-lists widened by one name. No existing row is changed.
--   deck_strategy.health_overrides (the old per-deck JSON) is NOT touched or read here (contract 3.6).
-- Reversible: supabase/drafts/20261118120400_roles_db5_health_targets.rollback.sql (puts the DB-2 front doors back byte for byte; refuses while the table holds rows
--   or health_target log or pending rows exist).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.deck_health_targets') IS NOT NULL THEN RAISE EXCEPTION 'roles_db5 already applied (deck_health_targets exists)'; END IF;
  IF to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NULL OR to_regprocedure('public._ai_undo_group_pre_roles(uuid,uuid,text,uuid)') IS NULL
     OR to_regprocedure('public._roles_fail(text,jsonb)') IS NULL OR to_regprocedure('public._ai_limits_roles()') IS NULL THEN
    RAISE EXCEPTION 'apply roles_db2 first';
  END IF;
END $$;

-- 1. The table.
CREATE TABLE public.deck_health_targets (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  deck_id      integer     NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  target_group text        NOT NULL CHECK (target_group IN ('lands','ramp','card_advantage','interaction')),
  target       integer     NOT NULL CHECK (target BETWEEN 0 AND 100),
  reason       text        CHECK (reason IS NULL OR (reason = btrim(reason) AND char_length(reason) BETWEEN 1 AND 200)),
  set_by       text        NOT NULL CHECK (set_by IN ('claude','owner')),
  previous     integer     CHECK (previous IS NULL OR previous BETWEEN 0 AND 100),   -- the number this row replaced, for Undo; NULL = there was no row
  batch_id     uuid,       -- ai_change_log.group_id of the Claude request that wrote it; Claude rows only. No FK.
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_health_targets_claude_reason CHECK (set_by <> 'claude' OR reason IS NOT NULL),   -- Claude must always say why (D-060)
  CONSTRAINT deck_health_targets_claude_only_batch CHECK (set_by = 'claude' OR batch_id IS NULL),
  CONSTRAINT deck_health_targets_one_per_group UNIQUE (deck_id, target_group)
);
CREATE INDEX deck_health_targets_user_deck ON public.deck_health_targets (user_id, deck_id);
CREATE INDEX deck_health_targets_batch ON public.deck_health_targets (user_id, batch_id) WHERE batch_id IS NOT NULL;
COMMENT ON TABLE public.deck_health_targets IS 'Health targets per deck and group. set_by claude = Claude derived it from the deck strategy (with a reason); set_by owner = the owner''s override, which Claude never overwrites. Written only by service-role functions. D-060.';
COMMENT ON COLUMN public.deck_health_targets.previous IS 'The number this row replaced (NULL if there was none), kept so the change can be undone.';
COMMENT ON COLUMN public.deck_health_targets.batch_id IS 'ai_change_log.group_id of the Claude request that wrote this row (not a key).';
ALTER TABLE public.deck_health_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_health_targets_select_own ON public.deck_health_targets FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_health_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_health_targets TO authenticated;
GRANT ALL ON public.deck_health_targets TO service_role;

-- 2. Allow-lists, found by their text (they list 'deck_zone'), as in DB-2. One name added to each.
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
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category','card_label','strategy_point','health_target'));
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point','health_target'));
-- _ai_kind_owner_only is NOT changed: Claude may undo its own health target changes (it deletes no owner data; an owner override blocks the undo).

-- 3a. PLAN (changes nothing). Payload: {deck_id, targets:[{group, target, reason}]}   1 to 4 entries, one per group.
-- Result: {action, deck_id, deck_name, n, changes:[{group, target, reason, previous}], skipped:[{group, why:'unchanged'}],
--          left_alone:[{group, owner_target, would_set}], preview}.   n = groups that would change (counts toward the limits like any other change).
CREATE FUNCTION public._ai_plan_health_target(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_deck integer; v_deck_name text; v_it jsonb; v_group text; v_target integer; v_reason text; v_row deck_health_targets;
  v_seen text[] := ARRAY[]::text[]; v_changes jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_left jsonb := '[]'::jsonb; v_n integer; v_asked integer;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'targets') IS DISTINCT FROM 'array'
     OR (CASE WHEN jsonb_typeof(p_payload->'targets') = 'array' THEN jsonb_array_length(p_payload->'targets') ELSE 0 END) NOT BETWEEN 1 AND 4 OR (p_payload->>'deck_id') IS NULL OR (p_payload->>'deck_id') !~ '^[0-9]{1,9}$' THEN
    PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'targets'));
  END IF;
  v_deck := (p_payload->>'deck_id')::integer;
  SELECT name INTO v_deck_name FROM decks WHERE id = v_deck AND user_id = p_user_id;
  IF NOT FOUND THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', v_deck)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health_target:' || p_user_id::text || ':' || v_deck::text, 0));
  v_asked := jsonb_array_length(p_payload->'targets');
  FOR v_it IN SELECT * FROM jsonb_array_elements(p_payload->'targets') LOOP
    IF jsonb_typeof(v_it) IS DISTINCT FROM 'object' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'targets')); END IF;
    v_group := v_it->>'group';
    IF v_group IS NULL OR v_group NOT IN ('lands','ramp','card_advantage','interaction') THEN PERFORM public._roles_fail('bad_group', jsonb_build_object('group', v_group)); END IF;
    IF v_group = ANY (v_seen) THEN PERFORM public._roles_fail('duplicate_group', jsonb_build_object('group', v_group)); END IF;
    v_seen := v_seen || v_group;
    IF jsonb_typeof(v_it->'target') IS DISTINCT FROM 'number' OR (v_it->>'target') !~ '^[0-9]{1,3}$' OR (v_it->>'target')::integer > 100 THEN
      PERFORM public._roles_fail('bad_target', jsonb_build_object('group', v_group));
    END IF;
    v_target := (v_it->>'target')::integer;
    v_reason := btrim(v_it->>'reason');
    IF jsonb_typeof(v_it->'reason') IS DISTINCT FROM 'string' OR v_reason = '' THEN PERFORM public._roles_fail('reason_required', jsonb_build_object('group', v_group)); END IF;
    IF char_length(v_reason) > (public._ai_limits_roles()->>'reason_max_chars')::int THEN PERFORM public._roles_fail('reason_too_long', jsonb_build_object('group', v_group)); END IF;
    SELECT * INTO v_row FROM deck_health_targets WHERE user_id = p_user_id AND deck_id = v_deck AND target_group = v_group;
    IF FOUND AND v_row.set_by = 'owner' THEN
      v_left := v_left || jsonb_build_object('group', v_group, 'owner_target', v_row.target, 'would_set', v_target);
    ELSIF FOUND AND v_row.target = v_target AND v_row.reason = v_reason THEN
      v_skipped := v_skipped || jsonb_build_object('group', v_group, 'why', 'unchanged');
    ELSE
      v_changes := v_changes || jsonb_build_object('group', v_group, 'target', v_target, 'reason', v_reason, 'previous', CASE WHEN FOUND THEN to_jsonb(v_row.target) END);
    END IF;
  END LOOP;
  IF jsonb_array_length(v_left) = v_asked THEN PERFORM public._roles_fail('target_overridden', jsonb_build_object('left_alone', v_left)); END IF;
  v_n := jsonb_array_length(v_changes);
  RETURN jsonb_build_object('action', 'health_target', 'deck_id', v_deck, 'deck_name', v_deck_name, 'n', v_n, 'changes', v_changes, 'skipped', v_skipped,
                            'left_alone', v_left, 'preview', jsonb_build_object('deck', v_deck_name, 'changes', v_changes, 'left_alone', v_left));
END;
$$;

-- 3b. EXECUTE. Re-plans under the lock (so an approved request is re-validated). Writes only Claude rows (never over an owner row), one log row per group.
CREATE FUNCTION public._ai_execute_health_target(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_plan jsonb; v_group uuid := gen_random_uuid(); v_deck integer; v_deck_name text; v_ch jsonb; v_old deck_health_targets; v_count integer := 0;
BEGIN
  v_plan := public._ai_plan_health_target(p_user_id, p_payload);
  v_deck := (v_plan->>'deck_id')::integer; v_deck_name := v_plan->>'deck_name';
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_plan->'changes') LOOP
    SELECT * INTO v_old FROM deck_health_targets WHERE user_id = p_user_id AND deck_id = v_deck AND target_group = v_ch->>'group';
    INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by, previous, batch_id)
    VALUES (p_user_id, v_deck, v_ch->>'group', (v_ch->>'target')::integer, v_ch->>'reason', 'claude', CASE WHEN v_old.id IS NOT NULL THEN v_old.target END, v_group)
    ON CONFLICT (deck_id, target_group) DO UPDATE
      SET target = EXCLUDED.target, reason = EXCLUDED.reason, previous = EXCLUDED.previous, batch_id = EXCLUDED.batch_id, updated_at = now()
      WHERE deck_health_targets.set_by = 'claude';
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'health_target', v_deck, v_deck_name,
            initcap(replace(v_ch->>'group', '_', ' ')) || ' target',
            jsonb_build_object('group', v_ch->>'group', 'row', CASE WHEN v_old.id IS NOT NULL THEN jsonb_build_object(
              'target', v_old.target, 'reason', v_old.reason, 'previous', v_old.previous, 'batch_id', v_old.batch_id) END),
            jsonb_build_object('group', v_ch->>'group', 'target', (v_ch->>'target')::integer, 'reason', v_ch->>'reason'),
            p_pending_id, p_approved);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('group_id', CASE WHEN v_count > 0 THEN v_group END, 'count', v_count, 'plan', v_plan);
END;
$$;

-- 3c. Blocker (a pure read): NULL = this log row can be undone, else {code, ...}. "Is the row still exactly what Claude left?"
CREATE FUNCTION public._ai_blocker_health_target(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
  IF NOT EXISTS (SELECT 1 FROM deck_health_targets WHERE user_id = p_user_id AND deck_id = r.deck_id AND target_group = r.after->>'group' AND set_by = 'claude'
                    AND target = (r.after->>'target')::integer AND reason = r.after->>'reason' AND batch_id = r.group_id) THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', r.after->>'group');
  END IF;
  RETURN NULL;
END;
$$;

-- 3d. Undo of one health_target group. Claude: all or nothing (the first blocker refuses, nothing has changed yet). Owner: groups still as Claude left them
-- are restored, groups the owner touched since are left alone and reported. Owner rows are never written. Only undone_at / undone_by change on the log.
CREATE FUNCTION public._ai_undo_health_target(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r ai_change_log; v_block jsonb; v_ok uuid[] := ARRAY[]::uuid[]; v_left jsonb := '[]'::jsonb; v_n integer := 0; v_row jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('health_target:' || p_user_id::text || ':' ||
    COALESCE((SELECT min(deck_id) FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'health_target')::text, ''), 0));
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'health_target') THEN PERFORM public._roles_fail('change_not_found'); END IF;
  PERFORM 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone'));
  END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL ORDER BY id LOOP
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NULL THEN
      v_ok := v_ok || r.id;
    ELSIF p_actor = 'owner' AND v_block->>'code' = 'changed_since' THEN
      v_left := v_left || jsonb_build_object('card', r.card_name, 'deck', r.deck_name, 'what', v_block->>'what');
    ELSE
      RETURN jsonb_build_object('success', false, 'refused', v_block);
    END IF;
  END LOOP;
  IF cardinality(v_ok) = 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo'), 'left_alone', v_left); END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE id = ANY (v_ok) ORDER BY id LOOP
    v_row := r.before->'row';
    IF v_row IS NULL OR jsonb_typeof(v_row) = 'null' THEN
      DELETE FROM deck_health_targets WHERE user_id = p_user_id AND deck_id = r.deck_id AND target_group = r.before->>'group' AND set_by = 'claude';
    ELSE
      UPDATE deck_health_targets SET target = (v_row->>'target')::integer, reason = v_row->>'reason', previous = NULLIF(v_row->>'previous', '')::integer,
             batch_id = NULLIF(v_row->>'batch_id', '')::uuid, updated_at = now()
       WHERE user_id = p_user_id AND deck_id = r.deck_id AND target_group = r.before->>'group' AND set_by = 'claude';
    END IF;
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n, 'left_alone', v_left);
END;
$$;

-- 4. Front doors: the DB-2 text, plus one line each for health_target. Replaced in place; the rollback puts the DB-2 text back exactly.
CREATE OR REPLACE FUNCTION public._ai_plan(p_user_id uuid, p_action text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'card_label' THEN RETURN public._ai_plan_card_label(p_user_id, p_payload); END IF;
  IF p_action = 'strategy_point' THEN RETURN public._ai_plan_strategy_point(p_user_id, p_payload); END IF;
  IF p_action = 'health_target' THEN RETURN public._ai_plan_health_target(p_user_id, p_payload); END IF;
  RETURN public._ai_plan_pre_roles(p_user_id, p_action, p_payload);
END;
$$;
CREATE OR REPLACE FUNCTION public._ai_execute(p_user_id uuid, p_connection_id uuid, p_client_name text, p_action text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'card_label' THEN RETURN public._ai_execute_card_label(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  IF p_action = 'strategy_point' THEN RETURN public._ai_execute_strategy_point(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  IF p_action = 'health_target' THEN RETURN public._ai_execute_health_target(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  RETURN public._ai_execute_pre_roles(p_user_id, p_connection_id, p_client_name, p_action, p_payload, p_pending_id, p_approved);
END;
$$;
CREATE OR REPLACE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF r.kind = 'card_label' THEN RETURN public._ai_blocker_card_label(p_user_id, r); END IF;
  IF r.kind = 'strategy_point' THEN RETURN public._ai_blocker_strategy_point(p_user_id, r); END IF;
  IF r.kind = 'health_target' THEN RETURN public._ai_blocker_health_target(p_user_id, r); END IF;
  RETURN public._ai_undo_blocker_pre_roles(p_user_id, r);
END;
$$;
CREATE OR REPLACE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_n integer; v_total integer; v_lim jsonb := public._ai_limits();
BEGIN
  SELECT min(kind), count(*) INTO v_kind, v_n FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind IN ('card_label', 'strategy_point', 'health_target');
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
  IF v_kind = 'health_target' THEN RETURN public._ai_undo_health_target(p_user_id, p_group_id, p_actor); END IF;
  RETURN public._ai_undo_strategy_point(p_user_id, p_group_id, p_actor);
END;
$$;

-- 5. Owner side (routes call these with the signed-in user's id; service role only).
-- Save an override. Creates or replaces the group's row with set_by 'owner'; previous = the number it replaced. Returns {previous: row|null, current: row}.
CREATE FUNCTION public.owner_set_health_target(p_user_id uuid, p_deck_id integer, p_group text, p_target integer, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev deck_health_targets; v_new deck_health_targets; v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  IF p_group IS NULL OR p_group NOT IN ('lands','ramp','card_advantage','interaction') THEN PERFORM public._roles_fail('bad_group', jsonb_build_object('group', p_group)); END IF;
  IF p_target IS NULL OR p_target NOT BETWEEN 0 AND 100 THEN PERFORM public._roles_fail('bad_target', jsonb_build_object('group', p_group)); END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > (public._ai_limits_roles()->>'reason_max_chars')::int THEN PERFORM public._roles_fail('reason_too_long'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health_target:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_prev FROM deck_health_targets WHERE user_id = p_user_id AND deck_id = p_deck_id AND target_group = p_group FOR UPDATE;
  INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by, previous, batch_id)
  VALUES (p_user_id, p_deck_id, p_group, p_target, v_reason, 'owner', CASE WHEN v_prev.id IS NOT NULL THEN v_prev.target END, NULL)
  ON CONFLICT (deck_id, target_group) DO UPDATE
    SET target = EXCLUDED.target, reason = EXCLUDED.reason, set_by = 'owner', previous = EXCLUDED.previous, batch_id = NULL, updated_at = now()
  RETURNING * INTO v_new;
  RETURN jsonb_build_object('previous', CASE WHEN v_prev.id IS NOT NULL THEN to_jsonb(v_prev) END, 'current', to_jsonb(v_new));
END;
$$;
-- Hand a group back to Claude: deletes the owner's row (contract S17). Only an owner row can be handed back. Returns {deleted: row}.
CREATE FUNCTION public.owner_hand_back_health_target(p_user_id uuid, p_deck_id integer, p_group text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row deck_health_targets;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('health_target:' || p_user_id::text || ':' || p_deck_id::text, 0));
  DELETE FROM deck_health_targets WHERE user_id = p_user_id AND deck_id = p_deck_id AND target_group = p_group AND set_by = 'owner' RETURNING * INTO v_row;
  IF NOT FOUND THEN PERFORM public._roles_fail('not_overridden', jsonb_build_object('group', p_group)); END IF;
  RETURN jsonb_build_object('deleted', to_jsonb(v_row));
END;
$$;
-- Reader (health step 9 and Claude's read tool): every row of the deck for this user.
CREATE FUNCTION public.get_deck_health_targets(p_user_id uuid, p_deck_id integer) RETURNS SETOF public.deck_health_targets
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  RETURN QUERY SELECT * FROM deck_health_targets t WHERE t.user_id = p_user_id AND t.deck_id = p_deck_id ORDER BY t.id;
END;
$$;

-- 6. Privileges: service_role ONLY for every function this file creates; the four front doors keep exactly service_role only, as DB-2 left them.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._ai_plan_health_target(uuid,jsonb)', 'public._ai_execute_health_target(uuid,uuid,text,jsonb,uuid,boolean)',
    'public._ai_blocker_health_target(uuid,ai_change_log)', 'public._ai_undo_health_target(uuid,uuid,text)',
    'public._ai_plan(uuid,text,jsonb)', 'public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)', 'public._ai_undo_blocker(uuid,ai_change_log)',
    'public.ai_undo_group(uuid,uuid,text,uuid)',
    'public.owner_set_health_target(uuid,integer,text,integer,text)', 'public.owner_hand_back_health_target(uuid,integer,text)',
    'public.get_deck_health_targets(uuid,integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
COMMIT;
