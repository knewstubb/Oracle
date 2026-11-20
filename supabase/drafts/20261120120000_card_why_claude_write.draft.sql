-- DRAFT. NOT APPLIED. The owner applies it (SQL editor), after reading the report. Needs owner approval.
-- Task: card tags, Why and rarity for Claude. Claude writes the one-line "Why it's here" on a deck card. Author: Developer, 2026-11-20.
-- Report: docs/oracle/reports/2026-11-20-developer-card-tags-why-rarity.md
-- Rehearsal: docs/oracle/reports/evidence/roles-db/test_card_why.sh (throwaway local Postgres; never the hosted project).
-- Base: the live database plus 20261120110000_why_here_deck_cards (deck_cards.why_here). Needs DB-2 (the change-log front doors it sits behind).
--
-- What this does (and only this):
--   1. Adds the change kind card_why to the ai_change_log allow-list (one name).
--   2. ai_set_card_why (Claude's write): sets deck_cards.why_here for ONE slot, up to 200 characters, one line. It writes straight away and always
--      leaves ONE log row (kind card_why, before and after hold the old and new text) so it shows in the deck's History with Undo, whether the Why
--      was empty (Claude fills it) or already had text (a change to the owner's line). If the app sends the text it read (why_base) and the text
--      is different now, the write is refused (why_changed): the owner edited meanwhile. Writing the same text again changes nothing.
--   3. Undo: _ai_undo_card_why puts the earlier text back (or empties it), and is refused (changed_since) when the Why was edited by hand since.
--      _ai_blocker_card_why is the same test as a pure read, so Recent changes greys Undo out. Both sit behind the two DB-2 front doors
--      (_ai_undo_blocker and ai_undo_group), which are renamed (bodies and grants untouched) and replaced by short functions with the old names.
-- Not destructive: no table or column is added or changed, no row is changed. One allow-list widened by one name, three new functions, two front doors wrapped.
-- Reversible: supabase/drafts/20261120120000_card_why_claude_write.rollback.sql (puts the front doors back; refuses while a card_why log row exists).
-- Note for later: DB-6 (20261118140000, not applied) rewrites the same allow-list and front doors; if it is applied after this, it must be changed to keep card_why.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_cards' AND column_name = 'why_here') THEN
    RAISE EXCEPTION 'apply 20261120110000_why_here_deck_cards first';
  END IF;
  IF to_regprocedure('public._ai_undo_group_pre_roles(uuid,uuid,text,uuid)') IS NULL OR to_regprocedure('public._roles_fail(text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'apply roles_db2 first';
  END IF;
  IF to_regprocedure('public.ai_set_card_why(uuid,uuid,integer,integer,text,text)') IS NOT NULL THEN RAISE EXCEPTION 'card_why already applied'; END IF;
END $$;
-- 1. Allow-list (ai_change_log only), found by its text as in DB-2.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid = 'public.ai_change_log'::regclass AND pg_get_constraintdef(oid) LIKE '%deck_zone%'
  LOOP EXECUTE format('ALTER TABLE public.ai_change_log DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point','health_target','card_why'));
-- 2. Claude's write. Returns {success, outcome: applied|no_change, group_id, count, filled (true when the Why was empty), previous, current}.
CREATE FUNCTION public.ai_set_card_why(p_user_id uuid, p_connection_id uuid, p_deck_id integer, p_slot_id integer, p_why text, p_why_base text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client text; v_deck decks; v_slot deck_cards; v_group uuid := gen_random_uuid(); v_new text := btrim(p_why);
BEGIN
  SELECT client_name INTO v_client FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  SELECT * INTO v_deck FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  IF v_new IS NULL OR v_new = '' OR char_length(v_new) > 200 OR v_new ~ '[\r\n]' THEN PERFORM public._ai_fail('bad_why'); END IF;
  SELECT * INTO v_slot FROM deck_cards WHERE id = p_slot_id AND deck_id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('slot_not_found', jsonb_build_object('deck', v_deck.name)); END IF;
  -- The owner changed the line after Claude read it: refuse rather than write over it.
  IF p_why_base IS NOT NULL AND COALESCE(v_slot.why_here, '') <> p_why_base THEN PERFORM public._ai_fail('why_changed', jsonb_build_object('card', v_slot.card_name, 'deck', v_deck.name)); END IF;
  IF v_slot.why_here IS NOT DISTINCT FROM v_new THEN RETURN jsonb_build_object('success', true, 'outcome', 'no_change', 'count', 0); END IF;
  UPDATE deck_cards SET why_here = v_new WHERE id = v_slot.id AND user_id = p_user_id;
  INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, deck_card_id, before, after)
  VALUES (p_user_id, v_group, p_connection_id, v_client, 'card_why', p_deck_id, v_deck.name, v_slot.card_name, v_slot.id,
          jsonb_build_object('why', v_slot.why_here), jsonb_build_object('why', v_new));
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_group, 'count', 1, 'filled', COALESCE(v_slot.why_here, '') = '',
                            'previous', v_slot.why_here, 'current', v_new);
END $$;
-- 3. Undo and its blocker (same condition: the line is still exactly what Claude wrote).
CREATE FUNCTION public._ai_blocker_card_why(p_user_id uuid, r ai_change_log) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name)
    WHEN NOT EXISTS (SELECT 1 FROM deck_cards WHERE id = r.deck_card_id AND deck_id = r.deck_id AND user_id = p_user_id)
      THEN jsonb_build_object('code', 'slot_gone', 'card', r.card_name, 'deck', r.deck_name)
    WHEN (SELECT why_here FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id) IS DISTINCT FROM (r.after->>'why')
      THEN jsonb_build_object('code', 'slot_changed', 'card', r.card_name, 'deck', r.deck_name)
    ELSE NULL END
$$;
CREATE FUNCTION public._ai_undo_card_why(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r ai_change_log; v_block jsonb;
BEGIN
  SELECT * INTO r FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'card_why' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('change_not_found'); END IF;
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone')); END IF;
  IF r.undoable_until < now() THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'too_old')); END IF;
  PERFORM 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id FOR UPDATE;
  v_block := public._ai_blocker_card_why(p_user_id, r);
  IF v_block IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', v_block); END IF;
  UPDATE deck_cards SET why_here = r.before->>'why' WHERE id = r.deck_card_id AND user_id = p_user_id;
  UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE user_id = p_user_id AND group_id = p_group_id;
  RETURN jsonb_build_object('success', true, 'undone', 1);
END $$;
-- 4. Front doors: renamed (bodies and grants untouched); a short function with the old name takes their place. Every other kind runs the old code.
ALTER FUNCTION public._ai_undo_blocker(uuid, ai_change_log) RENAME TO _ai_undo_blocker_pre_why;
ALTER FUNCTION public.ai_undo_group(uuid, uuid, text, uuid) RENAME TO ai_undo_group_pre_why;
CREATE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF r.kind = 'card_why' THEN RETURN public._ai_blocker_card_why(p_user_id, r); END IF;
  RETURN public._ai_undo_blocker_pre_why(p_user_id, r);
END;
$$;
CREATE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'card_why') THEN
    RETURN public.ai_undo_group_pre_why(p_user_id, p_group_id, p_actor, p_connection_id);
  END IF;
  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._roles_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._roles_fail('connection_revoked'); END IF;
  END IF;
  RETURN public._ai_undo_card_why(p_user_id, p_group_id, p_actor);
END;
$$;
-- 5. Privileges: service role only, like every other connector function.
REVOKE ALL ON FUNCTION public.ai_set_card_why(uuid, uuid, integer, integer, text, text), public._ai_blocker_card_why(uuid, ai_change_log),
  public._ai_undo_card_why(uuid, uuid, text), public._ai_undo_blocker(uuid, ai_change_log), public.ai_undo_group(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_set_card_why(uuid, uuid, integer, integer, text, text), public._ai_blocker_card_why(uuid, ai_change_log),
  public._ai_undo_card_why(uuid, uuid, text), public._ai_undo_blocker(uuid, ai_change_log), public.ai_undo_group(uuid, uuid, text, uuid) TO service_role;
COMMIT;
