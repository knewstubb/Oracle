-- APPLIED to live 2026-11-17 by the owner (SQL editor). Needs owner approval AND 20261117200000_cc15a_new_change_kinds applied first. Author: Architect, CC-15, 2026-11-17.
-- Report: docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md  (DB-B)
-- Not run against any database. Written from migration files, not a live schema; column defaults of `decks` (status etc.) and the
-- unique key of deck_strategy (deck_id; the app upserts onConflict deck_id) are [Approximate]. Throwaway run is the gate.
--
-- Adds FIVE functions (the two writers, two Undo helpers, one commander helper) and fills in the blocker stub from DB-A. No table or column change:
--   ai_create_deck(user, connection, name, format, commander jsonb)  -> makes ONE empty deck (+ its commander row) in one transaction
--   ai_set_deck_setup(user, connection, deck, patch jsonb)           -> commander / strategy notes / bracket for one deck, one transaction
--   _ai_undo_deck_create / _ai_undo_deck_setup (+ the blocker and Recent-changes pieces) for the two new kinds
-- Both writers: scoped to p_user_id on every read and write; refuse when the connection is switched off (same lock as ai_submit_change);
-- granted to service_role only. Nothing is deleted by the writers. The ONE delete in this file is _ai_undo_deck_create (below).
-- Identifier note (D-003): commander.scryfall_id is a PRINTING id; commander.oracle_id is the canonical id. Both are resolved by the app
-- (resolveCard, existing) and passed in; no name matching here.
--
-- !! DESTRUCTIVE PART, needs the owner's explicit say-so in the approval message: _ai_undo_deck_create DELETEs one decks row, its
-- deck_strategy row and its commander deck_cards row. It does so ONLY when ALL are true: (a) caller is the OWNER, (b) a deck_create
-- log row exists for it, (c) the deck has no deck_cards other than the commander row it was created with, (d) no deck_card has a
-- copy_id, (e) nothing outside the log points at it (no move_items, no versions, no folder). Otherwise it refuses with a reason.
-- Reversible: rollback file drops the functions; a deck deleted by Undo is not restorable (it was empty; the log keeps its name).

BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public._ai_limits_new()') IS NULL THEN RAISE EXCEPTION 'apply 20261117200000_cc15a first'; END IF;
  IF to_regprocedure('public._ai_set_primary_commander(uuid,integer,integer)') IS NOT NULL THEN RAISE EXCEPTION 'cc15b already applied'; END IF;
  -- Undo of a created deck deletes the deck; the log rows pointing at it must be allowed to lose their deck reference
  -- (guard fix in 20261117120000). Without it that Undo fails with ai_change_log_is_append_only.
  IF position('v_deck_cleared' IN pg_get_functiondef('public._ai_change_log_guard()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'apply 20261117120000_ai_change_log_allow_deck_delete first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_create_deck(
  p_user_id uuid, p_connection_id uuid, p_name text, p_format text, p_commander jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client text; v_lim jsonb := public._ai_limits_new(); v_id integer; v_tries integer := 0; v_group uuid := gen_random_uuid();
  v_name text := btrim(COALESCE(p_name, '')); v_slot integer; v_card text := NULLIF(btrim(COALESCE(p_commander->>'card_name', '')), '');
BEGIN
  SELECT client_name INTO v_client FROM connector_connections
   WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  IF v_name = '' OR length(v_name) > 100 THEN PERFORM public._ai_fail('bad_deck_name'); END IF;
  IF COALESCE(btrim(p_format), '') = '' THEN PERFORM public._ai_fail('bad_format'); END IF;   -- the app checks the format list first
  IF p_format = 'commander' AND v_card IS NULL THEN PERFORM public._ai_fail('commander_required'); END IF;
  -- Serialise per user FIRST, so two parallel calls cannot both pass the name check or the rate rules.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_create_deck:' || p_user_id::text, 0));
  IF EXISTS (SELECT 1 FROM decks WHERE user_id = p_user_id AND lower(name) = lower(v_name)) THEN
    PERFORM public._ai_fail('deck_name_taken', jsonb_build_object('name', v_name));
  END IF;
  IF (SELECT count(*) FROM ai_change_log WHERE user_id = p_user_id AND kind = 'deck_create' AND created_at > now() - interval '1 hour')
       >= (v_lim->>'decks_created_per_hour')::int THEN PERFORM public._ai_fail('too_many_decks_this_hour'); END IF;
  IF (SELECT count(*) FROM ai_change_log l WHERE l.user_id = p_user_id AND l.kind = 'deck_create' AND l.undone_at IS NULL
         AND EXISTS (SELECT 1 FROM decks d WHERE d.id = l.deck_id AND d.user_id = p_user_id)   -- a deck since deleted by hand no longer counts
         AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.deck_id = l.deck_id AND NOT COALESCE(dc.is_commander, false)))
       >= (v_lim->>'decks_created_open_max')::int THEN PERFORM public._ai_fail('too_many_empty_decks'); END IF;

  LOOP   -- decks.id is a chosen integer (not a sequence); a clash means try another, never overwrite (same as the import code)
    v_id := floor(random() * 2147483646)::integer + 1;
    BEGIN
      INSERT INTO decks (id, name, format, is_active, commander_name, commander_scryfall_id, colour_identity, card_count, user_id)
      VALUES (v_id, v_name, p_format, false, v_card, NULLIF(p_commander->>'scryfall_id', ''), NULLIF(p_commander->>'colour_identity', ''),
              CASE WHEN v_card IS NULL THEN 0 ELSE 1 END, p_user_id);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_tries := v_tries + 1; IF v_tries > 10 THEN PERFORM public._ai_fail('could_not_allocate_deck_id'); END IF;
    END;
  END LOOP;

  IF v_card IS NOT NULL THEN
    -- Planned slot: no copy attached (a commander you do not own stays "Unowned" under D-059; Claude never takes a copy here).
    -- Same row the manual create route writes: no categories, is_commander true (src/app/api/decks/create/route.ts).
    INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity, is_commander, user_id)
    VALUES (v_id, v_card, NULLIF(p_commander->>'scryfall_id', ''), 1, true, p_user_id)
    RETURNING id INTO v_slot;
    PERFORM public.set_deck_command_zone(v_id, p_user_id, v_slot, NULL, NULL, NULL);   -- sets the role the same way the screen does
  END IF;

  INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, oracle_id, printing_id,
                             deck_card_id, before, after)
  VALUES (p_user_id, v_group, p_connection_id, v_client, 'deck_create', v_id, v_name, COALESCE(v_card, v_name),
          NULLIF(p_commander->>'oracle_id', ''), NULLIF(p_commander->>'scryfall_id', ''), v_slot, '{}'::jsonb,
          jsonb_build_object('name', v_name, 'format', p_format, 'commander', v_card, 'commander_slot_id', v_slot));
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_group, 'deck_id', v_id, 'count', 1);
END $$;

-- Setup: commander / notes / bracket. patch keys (all optional, at least one): commander{card_name,scryfall_id,oracle_id},
-- strategy_notes text, bracket int 1..4 or JSON null (clear). One log row, before/after hold ONLY the keys that changed.
CREATE OR REPLACE FUNCTION public.ai_set_deck_setup(p_user_id uuid, p_connection_id uuid, p_deck_id integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client text; v_lim jsonb := public._ai_limits_new(); v_deck decks; v_group uuid := gen_random_uuid(); v_strat deck_strategy;
  v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb; v_slot integer; v_old_slot integer; v_made_slot boolean := false;
  v_card text := NULLIF(btrim(COALESCE(p_patch->'commander'->>'card_name', '')), '');
BEGIN
  SELECT client_name INTO v_client FROM connector_connections
   WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  SELECT * INTO v_deck FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR NOT (p_patch ?| ARRAY['commander','strategy_notes','bracket']) THEN
    PERFORM public._ai_fail('nothing_to_set');
  END IF;
  IF p_patch ? 'bracket' AND jsonb_typeof(p_patch->'bracket') <> 'null'
     AND NOT (jsonb_typeof(p_patch->'bracket') = 'number' AND (p_patch->>'bracket') ~ '^[1-4]$') THEN PERFORM public._ai_fail('bad_bracket'); END IF;
  IF p_patch ? 'strategy_notes' AND jsonb_typeof(p_patch->'strategy_notes') NOT IN ('string', 'null') THEN PERFORM public._ai_fail('bad_notes'); END IF;
  IF p_patch ? 'strategy_notes' AND length(COALESCE(p_patch->>'strategy_notes', '')) > (v_lim->>'strategy_notes_max_chars')::int THEN
    PERFORM public._ai_fail('notes_too_long'); END IF;

  SELECT * INTO v_strat FROM deck_strategy WHERE deck_id = p_deck_id AND user_id = p_user_id;

  IF p_patch ? 'strategy_notes' AND v_strat.strategy_notes IS DISTINCT FROM p_patch->>'strategy_notes' THEN
    v_before := v_before || jsonb_build_object('strategy_notes', v_strat.strategy_notes);
    v_after  := v_after  || jsonb_build_object('strategy_notes', p_patch->>'strategy_notes');
  END IF;
  IF p_patch ? 'bracket' AND v_strat.bracket IS DISTINCT FROM NULLIF(p_patch->>'bracket', '')::int THEN
    v_before := v_before || jsonb_build_object('bracket', v_strat.bracket);
    v_after  := v_after  || jsonb_build_object('bracket', NULLIF(p_patch->>'bracket', '')::int);
  END IF;
  IF v_after <> '{}'::jsonb THEN   -- write only what changed; the other columns (budget, table context ...) are never touched
    INSERT INTO deck_strategy (deck_id, user_id, strategy_notes, bracket, updated_at)
    VALUES (p_deck_id, p_user_id, v_after->>'strategy_notes', NULLIF(v_after->>'bracket', '')::int, now())
    ON CONFLICT (deck_id) DO UPDATE SET
      strategy_notes = CASE WHEN v_after ? 'strategy_notes' THEN EXCLUDED.strategy_notes ELSE deck_strategy.strategy_notes END,
      bracket        = CASE WHEN v_after ? 'bracket' THEN EXCLUDED.bracket ELSE deck_strategy.bracket END,
      updated_at = now()
    WHERE deck_strategy.user_id = p_user_id;
  END IF;

  IF v_card IS NOT NULL THEN
    SELECT id INTO v_old_slot FROM deck_cards WHERE deck_id = p_deck_id AND user_id = p_user_id AND is_commander LIMIT 1;
    SELECT id INTO v_slot FROM deck_cards WHERE deck_id = p_deck_id AND user_id = p_user_id AND lower(card_name) = lower(v_card)
      AND scryfall_id IS NOT DISTINCT FROM NULLIF((p_patch->'commander'->>'scryfall_id'), '') LIMIT 1;
    IF v_slot IS NULL THEN   -- not in the deck yet: add as a Planned slot (no copy is taken)
      INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity, is_commander, user_id)
      VALUES (p_deck_id, v_card, NULLIF((p_patch->'commander'->>'scryfall_id'), ''), 1, false, p_user_id) RETURNING id INTO v_slot;
      v_made_slot := true;
    END IF;
    IF v_old_slot IS DISTINCT FROM v_slot THEN
      PERFORM public._ai_set_primary_commander(p_user_id, p_deck_id, v_slot);
      v_before := v_before || jsonb_build_object('commander_slot_id', v_old_slot, 'commander', v_deck.commander_name, 'commander_slot_added', false);
      v_after  := v_after  || jsonb_build_object('commander_slot_id', v_slot, 'commander', v_card, 'commander_slot_added', v_made_slot);
    END IF;
  END IF;
  IF v_after = '{}'::jsonb THEN RETURN jsonb_build_object('success', true, 'outcome', 'no_change', 'count', 0); END IF;

  INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, deck_card_id, before, after)
  VALUES (p_user_id, v_group, p_connection_id, v_client, 'deck_setup', p_deck_id, v_deck.name, COALESCE(v_card, v_deck.name), v_slot, v_before, v_after);
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_group, 'count', 1, 'changed', v_after);
END $$;

-- Makes ONE existing slot of the deck the commander and keeps the deck's partner/background and companion as they are (the live
-- set_deck_command_zone resets all three, and refuses when a companion would be dropped). Never adds or deletes a row.
CREATE OR REPLACE FUNCTION public._ai_set_primary_commander(p_user_id uuid, p_deck_id integer, p_slot integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_second integer; v_role text; v_comp integer;
BEGIN
  SELECT id, command_zone_role INTO v_second, v_role FROM deck_cards
   WHERE deck_id = p_deck_id AND user_id = p_user_id AND is_commander AND command_zone_role IN ('partner', 'background') ORDER BY id LIMIT 1;
  SELECT id INTO v_comp FROM deck_cards WHERE deck_id = p_deck_id AND user_id = p_user_id AND command_zone_role = 'companion' LIMIT 1;
  IF v_second IS NOT DISTINCT FROM p_slot THEN v_second := NULL; v_role := NULL; END IF;   -- the new commander was the partner: it moves up
  PERFORM public.set_deck_command_zone(p_deck_id, p_user_id, p_slot, v_second, v_role, v_comp);
END $$;
-- ---------------------------------------------------------------------------------------------------------------
-- Undo. Both return the live undo shape: {success:true, undone:n} or {success:false, refused:{code,...}}.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_undo_deck_create(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_change_log; v_other integer;
BEGIN
  IF p_actor <> 'owner' THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only')); END IF;
  SELECT * INTO r FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'deck_create' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('change_not_found'); END IF;
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone')); END IF;
  IF r.undoable_until < now() THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'too_old')); END IF;
  PERFORM 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name)); END IF;
  SELECT count(*) INTO v_other FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND id IS DISTINCT FROM r.deck_card_id;
  IF v_other > 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'deck_not_empty', 'deck', r.deck_name)); END IF;
  IF EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND copy_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM move_items WHERE user_id = p_user_id AND (to_deck_id = r.deck_id OR from_deck_id = r.deck_id))
     OR EXISTS (SELECT 1 FROM deck_versions WHERE deck_id = r.deck_id AND user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND folder_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'deck_in_use', 'deck', r.deck_name));
  END IF;
  -- Empty and untouched. The only deletes in this whole change: the commander row, the strategy row, the deck row (in this order).
  DELETE FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id;
  DELETE FROM deck_strategy WHERE deck_id = r.deck_id AND user_id = p_user_id;
  DELETE FROM decks WHERE id = r.deck_id AND user_id = p_user_id;   -- ai_change_log.deck_id is ON DELETE SET NULL; deck_name snapshot stays
  UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE user_id = p_user_id AND group_id = p_group_id;
  RETURN jsonb_build_object('success', true, 'undone', 1);
END $$;

CREATE OR REPLACE FUNCTION public._ai_undo_deck_setup(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_change_log; v_strat deck_strategy; v_cur_slot integer;
BEGIN
  SELECT * INTO r FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'deck_setup' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('change_not_found'); END IF;
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone')); END IF;
  IF r.undoable_until < now() THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'too_old')); END IF;
  PERFORM 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name)); END IF;
  SELECT * INTO v_strat FROM deck_strategy WHERE deck_id = r.deck_id AND user_id = p_user_id;
  -- Refuse if the owner changed any of the same fields since ("deck changed since", same rule as every other kind).
  IF (r.after ? 'strategy_notes' AND v_strat.strategy_notes IS DISTINCT FROM r.after->>'strategy_notes')
     OR (r.after ? 'bracket' AND v_strat.bracket IS DISTINCT FROM NULLIF(r.after->>'bracket', '')::int) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'changed_since', 'deck', r.deck_name));
  END IF;
  IF r.after ? 'commander_slot_id' THEN
    SELECT id INTO v_cur_slot FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND is_commander LIMIT 1;
    IF v_cur_slot IS DISTINCT FROM (r.after->>'commander_slot_id')::int THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'changed_since', 'deck', r.deck_name));
    END IF;
  END IF;
  IF r.after ? 'commander_slot_id' AND NULLIF(r.before->>'commander_slot_id', '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE id = (r.before->>'commander_slot_id')::int AND deck_id = r.deck_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'changed_since', 'deck', r.deck_name));   -- the old commander slot is gone
  END IF;
  IF r.before ? 'strategy_notes' THEN UPDATE deck_strategy SET strategy_notes = r.before->>'strategy_notes', updated_at = now() WHERE deck_id = r.deck_id AND user_id = p_user_id; END IF;
  IF r.before ? 'bracket' THEN UPDATE deck_strategy SET bracket = NULLIF(r.before->>'bracket', '')::int, updated_at = now() WHERE deck_id = r.deck_id AND user_id = p_user_id; END IF;
  IF r.after ? 'commander_slot_id' THEN
    PERFORM public._ai_set_primary_commander(p_user_id, r.deck_id, NULLIF(r.before->>'commander_slot_id', '')::int);
    -- A slot Claude added only to be the commander goes away again, if still a bare Planned slot (no copy). Existing "remove slot" rule, D-039.
    IF (r.after->>'commander_slot_added')::boolean THEN
      DELETE FROM deck_cards WHERE id = (r.after->>'commander_slot_id')::int AND deck_id = r.deck_id AND user_id = p_user_id AND copy_id IS NULL AND NOT is_commander;
    END IF;
  END IF;
  UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE user_id = p_user_id AND group_id = p_group_id;
  RETURN jsonb_build_object('success', true, 'undone', 1);
END $$;

-- Blocker (why Undo is greyed out in Recent changes). Replaces the empty stub from DB-A. Same conditions as the Undo helpers, as a pure read.
CREATE OR REPLACE FUNCTION public._ai_blocker_new(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN r.kind = 'deck_create' THEN
      CASE WHEN NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name)
           WHEN EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND id IS DISTINCT FROM r.deck_card_id)
             THEN jsonb_build_object('code', 'deck_not_empty', 'deck', r.deck_name)
           WHEN EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND copy_id IS NOT NULL)
             OR EXISTS (SELECT 1 FROM move_items WHERE user_id = p_user_id AND (to_deck_id = r.deck_id OR from_deck_id = r.deck_id))
             OR EXISTS (SELECT 1 FROM deck_versions WHERE deck_id = r.deck_id AND user_id = p_user_id)
             OR EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id AND folder_id IS NOT NULL)
             THEN jsonb_build_object('code', 'deck_in_use', 'deck', r.deck_name)
           ELSE NULL END
    WHEN r.kind = 'deck_setup' THEN
      CASE WHEN NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name)
           WHEN (r.after ? 'strategy_notes' AND (SELECT s.strategy_notes FROM deck_strategy s WHERE s.deck_id = r.deck_id AND s.user_id = p_user_id) IS DISTINCT FROM r.after->>'strategy_notes')
             OR (r.after ? 'bracket' AND (SELECT s.bracket FROM deck_strategy s WHERE s.deck_id = r.deck_id AND s.user_id = p_user_id) IS DISTINCT FROM NULLIF(r.after->>'bracket', '')::int)
             OR (r.after ? 'commander_slot_id' AND (SELECT dc.id FROM deck_cards dc WHERE dc.deck_id = r.deck_id AND dc.user_id = p_user_id AND dc.is_commander ORDER BY dc.id LIMIT 1)
                   IS DISTINCT FROM (r.after->>'commander_slot_id')::int)
             THEN jsonb_build_object('code', 'changed_since', 'deck', r.deck_name)
           ELSE NULL END
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.ai_create_deck(uuid, uuid, text, text, jsonb), public.ai_set_deck_setup(uuid, uuid, integer, jsonb),
  public._ai_undo_deck_create(uuid, uuid, text), public._ai_undo_deck_setup(uuid, uuid, text), public._ai_set_primary_commander(uuid, integer, integer),
  public._ai_blocker_new(uuid, ai_change_log) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_create_deck(uuid, uuid, text, text, jsonb), public.ai_set_deck_setup(uuid, uuid, integer, jsonb) TO service_role;
COMMIT;

-- Rollback (separate file): 20261117200100_cc15b_deck_create_setup.rollback.sql drops the five functions above and restores the stub _ai_blocker_new. It refuses if any deck_create / deck_setup log row exists.
