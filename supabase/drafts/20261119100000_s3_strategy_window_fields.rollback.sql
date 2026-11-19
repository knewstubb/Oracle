-- ROLLBACK for 20261119100000_s3_strategy_window_fields.draft.sql (S3, Strategy window fields). NOT APPLIED. The owner runs it only to undo S3.
-- Puts back, word for word, the three cc15b function bodies (copied from supabase/migrations/20261117200100_cc15b_deck_create_setup.sql),
-- puts back any bracket CHECK that S3 replaced (kept in the comment of deck_strategy_bracket_1_to_5), and drops the two new columns.
-- Refuses (changes nothing) while any of these exist, because they would be lost or could no longer be undone:
--   a saved summary; a bracket 5; a Claude change-log row that set a summary or playgroup (history is never deleted).
-- The "last changed by" marks (updated_by) are dropped with the column: they only say who saved last, the values themselves stay.
-- The table_context (playgroup) values stay: that column existed before S3.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_strategy' AND column_name = 'summary') THEN
    RAISE EXCEPTION 's3 is not applied';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_strategy WHERE summary IS NOT NULL) THEN
    RAISE EXCEPTION 'cannot roll back: a deck has a saved summary (it would be lost)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deck_strategy WHERE bracket = 5) THEN
    RAISE EXCEPTION 'cannot roll back: a deck has bracket 5 saved (the old rules stop at 4)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_change_log WHERE kind = 'deck_setup' AND (after ?| ARRAY['summary','playgroup'] OR before ?| ARRAY['summary','playgroup'])) THEN
    RAISE EXCEPTION 'cannot roll back: Claude changed a summary or playgroup (the old Undo could not put it back)';
  END IF;
END $$;
DO $$
DECLARE v_note text; v_line text;
BEGIN
  SELECT obj_description(c.oid, 'pg_constraint') INTO v_note FROM pg_constraint c
   WHERE c.conrelid = 'public.deck_strategy'::regclass AND c.conname = 'deck_strategy_bracket_1_to_5';
  ALTER TABLE public.deck_strategy DROP CONSTRAINT deck_strategy_bracket_1_to_5;
  FOREACH v_line IN ARRAY string_to_array(substr(COALESCE(v_note, ''), position(E'\n' IN COALESCE(v_note, '')) + 1), E'\n') LOOP
    IF v_line <> '' THEN
      EXECUTE format('ALTER TABLE public.deck_strategy ADD CONSTRAINT %I %s', split_part(v_line, E'\t', 1), split_part(v_line, E'\t', 2));
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.deck_strategy DROP COLUMN summary;
ALTER TABLE public.deck_strategy DROP COLUMN updated_by;
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
COMMIT;
