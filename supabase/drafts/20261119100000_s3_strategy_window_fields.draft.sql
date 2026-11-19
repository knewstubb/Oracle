-- DRAFT. NOT APPLIED. The owner applies it (SQL editor), after reading the report. Approved in principle by the owner 2026-11-19 (S3).
-- Task: DV-02 slice 1, Strategy window plus Claude reading it. Author: Developer, 2026-11-19.
-- Report: docs/oracle/reports/2026-11-19-developer-slice-1-strategy-window.md
-- Rehearsal: docs/oracle/reports/evidence/roles-db/test_s3.sh (throwaway local Postgres; never the hosted project).
-- Base: the live database (migrations up to 20261117200100_cc15b plus the applied CC-26 drafts DB-1 to DB-5). Does not need DB-1 to DB-5;
-- it touches none of their objects.
--
-- What this does (and only this):
--   1. deck_strategy.summary    : new, nullable text, one line, at most 120 characters (the window's one-line summary).
--   2. deck_strategy.updated_by : new, nullable text, 'owner' or 'claude' (the window footer "Last changed by you / Claude").
--   3. Bracket 1 to 5: any CHECK on deck_strategy that mentions bracket is replaced by "bracket IS NULL OR 1..5". The dropped
--      definitions are kept word for word in the comment of the new constraint so the rollback can put them back exactly.
--   4. ai_set_deck_setup (Claude's write) now also takes summary and playgroup (stored in table_context), allows bracket 5, marks
--      updated_by = 'claude', and only ever ADDS to the owner's Strategy text: a new strategy_notes value must start with the current
--      text (the owner's words are never replaced or edited; refused as notes_replace_refused), and when the app sends the text it
--      read (strategy_notes_base) the write is refused if the owner changed it meanwhile (notes_changed).
--   5. _ai_undo_deck_setup and _ai_blocker_new learn summary and playgroup (Undo puts them back; "changed since" covers them).
-- Not destructive: two new nullable columns, one CHECK widened, three function bodies replaced (CREATE OR REPLACE keeps grants).
-- No existing row is changed. win_condition, budget_mode, budget_ceiling, frustration, format_rules, health_overrides are not touched.
-- Live data (audit 2026-11-19): deck_strategy has 0 rows, so nothing exists to convert.
-- Reversible: supabase/drafts/20261119100000_s3_strategy_window_fields.rollback.sql (puts the cc15b function bodies back word for word,
-- restores any dropped bracket CHECK, drops the two columns; refuses while any summary, bracket 5 or Claude summary/playgroup change exists).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_strategy' AND column_name IN ('summary', 'updated_by')) THEN
    RAISE EXCEPTION 's3 already applied (deck_strategy.summary or updated_by exists)';
  END IF;
  IF to_regprocedure('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)') IS NULL OR to_regprocedure('public._ai_undo_deck_setup(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public._ai_blocker_new(uuid,ai_change_log)') IS NULL THEN
    RAISE EXCEPTION 'apply 20261117200100_cc15b first';
  END IF;
  -- The bodies this replaces must be the cc15b ones (the rollback puts exactly those back).
  IF position('''^[1-4]$''' IN pg_get_functiondef('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)'::regprocedure)) = 0
     OR position('summary' IN pg_get_functiondef('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)'::regprocedure)) > 0
     OR position('table_context' IN pg_get_functiondef('public._ai_undo_deck_setup(uuid,uuid,text)'::regprocedure)) > 0
     OR position('deck_setup' IN pg_get_functiondef('public._ai_blocker_new(uuid,ai_change_log)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ai_set_deck_setup / _ai_undo_deck_setup / _ai_blocker_new are not the cc15b bodies; stop and check the live database';
  END IF;
END $$;
-- 1 and 2. Two new columns.
ALTER TABLE public.deck_strategy ADD COLUMN summary text
  CONSTRAINT deck_strategy_summary_one_line CHECK (summary IS NULL OR (char_length(summary) BETWEEN 1 AND 120 AND summary !~ '[\r\n]'));
ALTER TABLE public.deck_strategy ADD COLUMN updated_by text
  CONSTRAINT deck_strategy_updated_by_who CHECK (updated_by IS NULL OR updated_by IN ('owner', 'claude'));
COMMENT ON COLUMN public.deck_strategy.summary IS 'The Strategy window''s one-line summary, shown on the deck page. At most 120 characters.';
COMMENT ON COLUMN public.deck_strategy.updated_by IS 'Who saved the strategy last: owner (the Strategy window) or claude (ai_set_deck_setup). With updated_at it is the window footer.';
-- 3. Bracket 1 to 5. Whatever bracket CHECK exists (none was seen in the migration files; the live table may differ) is replaced.
DO $$
DECLARE c record; v_kept text := '';
BEGIN
  FOR c IN SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
            WHERE conrelid = 'public.deck_strategy'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%bracket%' ORDER BY conname
  LOOP
    v_kept := v_kept || c.conname || E'\t' || c.def || E'\n';
    EXECUTE format('ALTER TABLE public.deck_strategy DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.deck_strategy ADD CONSTRAINT deck_strategy_bracket_1_to_5 CHECK (bracket IS NULL OR bracket BETWEEN 1 AND 5);
  EXECUTE format('COMMENT ON CONSTRAINT deck_strategy_bracket_1_to_5 ON public.deck_strategy IS %L',
                 'S3 replaced these bracket checks (name TAB definition, one per line; empty = none):' || E'\n' || v_kept);
END $$;
-- 4. Claude's write. patch keys (all optional, at least one): commander{card_name,scryfall_id,oracle_id}, strategy_notes text
-- (must start with the current text), strategy_notes_base text|null (the text the app read; refused if it changed since),
-- summary text|null, playgroup text|null, bracket int 1..5 or JSON null (clear). One log row; before/after hold ONLY the keys that changed.
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
    -- Add only: the new text keeps everything already there (trailing blank space aside) and puts words after it.
    v_kept := regexp_replace(COALESCE(v_cur, ''), '\s+$', '');
    IF v_kept <> '' AND (v_new IS NULL OR left(v_new, length(v_kept)) <> v_kept OR length(v_new) <= length(v_kept)) THEN
      PERFORM public._ai_fail('notes_replace_refused');
    END IF;
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
-- 5. Undo: also puts the summary and playgroup back, and refuses when either was changed by hand since.
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
     OR (r.after ? 'bracket' AND v_strat.bracket IS DISTINCT FROM NULLIF(r.after->>'bracket', '')::int)
     OR (r.after ? 'summary' AND v_strat.summary IS DISTINCT FROM r.after->>'summary')
     OR (r.after ? 'playgroup' AND v_strat.table_context IS DISTINCT FROM r.after->>'playgroup') THEN
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
  IF r.before ? 'strategy_notes' THEN UPDATE deck_strategy SET strategy_notes = r.before->>'strategy_notes', updated_by = p_actor, updated_at = now() WHERE deck_id = r.deck_id AND user_id = p_user_id; END IF;
  IF r.before ? 'bracket' THEN UPDATE deck_strategy SET bracket = NULLIF(r.before->>'bracket', '')::int, updated_by = p_actor, updated_at = now() WHERE deck_id = r.deck_id AND user_id = p_user_id; END IF;
  IF r.before ? 'summary' THEN UPDATE deck_strategy SET summary = r.before->>'summary', updated_by = p_actor, updated_at = now() WHERE deck_id = r.deck_id AND user_id = p_user_id; END IF;
  IF r.before ? 'playgroup' THEN UPDATE deck_strategy SET table_context = r.before->>'playgroup', updated_by = p_actor, updated_at = now() WHERE deck_id = r.deck_id AND user_id = p_user_id; END IF;
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
-- Blocker (why Undo is greyed out in Recent changes). Same conditions as the Undo helpers, as a pure read; adds summary and playgroup.
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
             OR (r.after ? 'summary' AND (SELECT s.summary FROM deck_strategy s WHERE s.deck_id = r.deck_id AND s.user_id = p_user_id) IS DISTINCT FROM r.after->>'summary')
             OR (r.after ? 'playgroup' AND (SELECT s.table_context FROM deck_strategy s WHERE s.deck_id = r.deck_id AND s.user_id = p_user_id) IS DISTINCT FROM r.after->>'playgroup')
             OR (r.after ? 'commander_slot_id' AND (SELECT dc.id FROM deck_cards dc WHERE dc.deck_id = r.deck_id AND dc.user_id = p_user_id AND dc.is_commander ORDER BY dc.id LIMIT 1)
                   IS DISTINCT FROM (r.after->>'commander_slot_id')::int)
             THEN jsonb_build_object('code', 'changed_since', 'deck', r.deck_name)
           ELSE NULL END
    ELSE NULL END
$$;
COMMIT;
