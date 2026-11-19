-- DRAFT. NOT APPLIED. The owner applies it (SQL editor), after reading the report. Needs the owner's approval before it is applied (S5).
-- Task: FEAT-001 (Strategy autosave), Claude can replace the Strategy text. Author: Developer, 2026-11-19.
-- Rehearsal: docs/oracle/reports/evidence/roles-db/test_s5.sh (throwaway local Postgres; never the hosted project).
-- Base: S3 applied (it needs S3's ai_set_deck_setup, which refuses a replacement). S4 may or may not be applied; S5 does not touch what S4 wraps.
--
-- What this does (and only this):
--   ai_set_deck_setup no longer refuses a strategy_notes value that does not start with the current text (notes_replace_refused is gone).
--   Claude may now replace the whole Strategy text, or clear it (null or empty). Everything else in the function is S3's body word for word:
--   the notes_changed check (strategy_notes_base must equal the current text when sent), bad_notes, notes_too_long (4000), the other keys
--   (summary, playgroup, bracket, commander), the single log row with before and after, updated_by = 'claude'.
--   Undo (_ai_undo_deck_setup) already puts the earlier text back from the log row and is blocked if the text changed since, so it is unchanged.
-- Not destructive: one function body replaced (CREATE OR REPLACE keeps grants). No table, column or row is touched.
-- Reversible: supabase/drafts/20261119120000_s5_strategy_replace.rollback.sql (puts S3's function body back byte for byte; no data depends on it).
BEGIN;
DO $$
DECLARE v_src text;
BEGIN
  IF to_regprocedure('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)') IS NULL OR NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'deck_strategy' AND column_name = 'summary') THEN
    RAISE EXCEPTION 'apply 20261119100000_s3 first';
  END IF;
  v_src := pg_get_functiondef('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)'::regprocedure);
  IF position('notes_replace_refused' IN v_src) = 0 THEN
    RAISE EXCEPTION 's5 already applied (ai_set_deck_setup no longer refuses a replacement) or the function is not the S3 body; stop and check the live database';
  END IF;
  IF position('strategy_notes_base' IN v_src) = 0 OR position('''summary''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'ai_set_deck_setup is not the S3 body; stop and check the live database';
  END IF;
END $$;
-- Claude's write, S3's body with the "Add only" block removed. patch keys: commander{card_name,scryfall_id,oracle_id}, strategy_notes text|null
-- (replaces the text; null or empty clears it), strategy_notes_base text|null (the text the app read; refused as notes_changed if it changed since),
-- summary text|null, playgroup text|null, bracket int 1..5 or JSON null. One log row; before/after hold ONLY the keys that changed.
CREATE OR REPLACE FUNCTION public.ai_set_deck_setup(p_user_id uuid, p_connection_id uuid, p_deck_id integer, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client text; v_lim jsonb := public._ai_limits_new(); v_deck decks; v_group uuid := gen_random_uuid(); v_strat deck_strategy;
  v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb; v_slot integer; v_old_slot integer; v_made_slot boolean := false;
  v_card text := NULLIF(btrim(COALESCE(p_patch->'commander'->>'card_name', '')), '');
  v_cur text; v_new text; v_kept text;
BEGIN
  SELECT client_name INTO v_client FROM connector_connections
   WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  SELECT * INTO v_deck FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR NOT (p_patch ?| ARRAY['commander','strategy_notes','bracket','summary','playgroup']) THEN
    PERFORM public._ai_fail('nothing_to_set');
  END IF;
  IF p_patch ? 'bracket' AND jsonb_typeof(p_patch->'bracket') <> 'null'
     AND NOT (jsonb_typeof(p_patch->'bracket') = 'number' AND (p_patch->>'bracket') ~ '^[1-5]$') THEN PERFORM public._ai_fail('bad_bracket'); END IF;
  IF p_patch ? 'strategy_notes' AND jsonb_typeof(p_patch->'strategy_notes') NOT IN ('string', 'null') THEN PERFORM public._ai_fail('bad_notes'); END IF;
  IF p_patch ? 'strategy_notes' AND length(COALESCE(p_patch->>'strategy_notes', '')) > (v_lim->>'strategy_notes_max_chars')::int THEN
    PERFORM public._ai_fail('notes_too_long'); END IF;
  IF p_patch ? 'summary' AND NOT (jsonb_typeof(p_patch->'summary') = 'null'
     OR (jsonb_typeof(p_patch->'summary') = 'string' AND char_length(p_patch->>'summary') <= 120 AND (p_patch->>'summary') !~ '[\r\n]')) THEN
    PERFORM public._ai_fail('bad_summary'); END IF;
  IF p_patch ? 'playgroup' AND NOT (jsonb_typeof(p_patch->'playgroup') = 'null'
     OR (jsonb_typeof(p_patch->'playgroup') = 'string' AND char_length(p_patch->>'playgroup') <= 500)) THEN
    PERFORM public._ai_fail('bad_playgroup'); END IF;
  SELECT * INTO v_strat FROM deck_strategy WHERE deck_id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF p_patch ? 'strategy_notes' THEN
    v_cur := v_strat.strategy_notes;
    v_new := p_patch->>'strategy_notes';
    -- The owner changed the text after Claude read it: refuse rather than write over it.
    IF p_patch ? 'strategy_notes_base' AND v_cur IS DISTINCT FROM (p_patch->>'strategy_notes_base') THEN PERFORM public._ai_fail('notes_changed'); END IF;
  END IF;
  IF p_patch ? 'strategy_notes' AND v_strat.strategy_notes IS DISTINCT FROM p_patch->>'strategy_notes' THEN
    v_before := v_before || jsonb_build_object('strategy_notes', v_strat.strategy_notes);
    v_after  := v_after  || jsonb_build_object('strategy_notes', p_patch->>'strategy_notes');
  END IF;
  IF p_patch ? 'bracket' AND v_strat.bracket IS DISTINCT FROM NULLIF(p_patch->>'bracket', '')::int THEN
    v_before := v_before || jsonb_build_object('bracket', v_strat.bracket);
    v_after  := v_after  || jsonb_build_object('bracket', NULLIF(p_patch->>'bracket', '')::int);
  END IF;
  IF p_patch ? 'summary' AND v_strat.summary IS DISTINCT FROM NULLIF(p_patch->>'summary', '') THEN
    v_before := v_before || jsonb_build_object('summary', v_strat.summary);
    v_after  := v_after  || jsonb_build_object('summary', NULLIF(p_patch->>'summary', ''));
  END IF;
  IF p_patch ? 'playgroup' AND v_strat.table_context IS DISTINCT FROM NULLIF(p_patch->>'playgroup', '') THEN
    v_before := v_before || jsonb_build_object('playgroup', v_strat.table_context);
    v_after  := v_after  || jsonb_build_object('playgroup', NULLIF(p_patch->>'playgroup', ''));
  END IF;
  IF v_after <> '{}'::jsonb THEN   -- write only what changed; the other columns (budget, win condition ...) are never touched
    INSERT INTO deck_strategy (deck_id, user_id, strategy_notes, bracket, summary, table_context, updated_by, updated_at)
    VALUES (p_deck_id, p_user_id, v_after->>'strategy_notes', NULLIF(v_after->>'bracket', '')::int, v_after->>'summary', v_after->>'playgroup', 'claude', now())
    ON CONFLICT (deck_id) DO UPDATE SET
      strategy_notes = CASE WHEN v_after ? 'strategy_notes' THEN EXCLUDED.strategy_notes ELSE deck_strategy.strategy_notes END,
      bracket        = CASE WHEN v_after ? 'bracket' THEN EXCLUDED.bracket ELSE deck_strategy.bracket END,
      summary        = CASE WHEN v_after ? 'summary' THEN EXCLUDED.summary ELSE deck_strategy.summary END,
      table_context  = CASE WHEN v_after ? 'playgroup' THEN EXCLUDED.table_context ELSE deck_strategy.table_context END,
      updated_by = 'claude',
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
COMMIT;
