-- DRAFT, NOT APPLIED. Needs owner approval; the OWNER (or Gene with approval) applies it, on a throwaway branch first.
-- Task: Claude connector ninth change kind 'deck_category' (set the category of cards already in a deck).
-- Contract: docs/oracle/contracts/claude-connector-deck-category.md (+ .types.ts). Report: docs/oracle/reports/2026-11-16-architect-deck-category.md
-- Depends on (all applied): 20261116150000 (tables), 20261116150100 (RPCs), 20261116150200 (undo blocker fix), 20261116150300 (recent changes).
--
-- SHAPE: additive in effect, no data is read or changed by this file. It
--   (1) widens two CHECK constraints (the lists of allowed action / kind names) by one name,
--   (2) renames four live functions to *_v1 and puts a thin function with the OLD name in front. The new function handles
--       'deck_category' and hands every other action straight to the *_v1 function UNCHANGED, so the eight existing kinds
--       keep running the exact code that is live today (no copy of 500 lines that could drift),
--   (3) replaces one small read function (ai_list_recent_changes) to add two fields for the plain-words sentence.
-- Reversible: supabase/drafts/20261116190000_ai_deck_category.rollback.sql. Roll back only while no 'deck_category' rows
-- exist in ai_change_log / ai_pending_changes (the rollback refuses otherwise; it never deletes history).
-- Not destructive: no DROP of data, no TRUNCATE, no DELETE. Constraint swaps scan two small tables.
--
-- What the new kind may change: deck_cards.categories ONLY (one text column: a JSON list like ["Ramp","Good Stuff"], up to 5).
-- Never zone, quantity, copy_id, ownership, is_commander / command_zone_role, tags. Identifier note (D-003): log.printing_id holds deck_cards.scryfall_id (a printing);
-- no oracle_id is written for this kind.

BEGIN;

-- ---------------------------------------------------------------------------------------------------------------
-- 0. Guard: refuse to run twice (a second run would rename the wrappers over the _v1 originals) or on the wrong base.
-- ---------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public._ai_plan_v1(uuid,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'ai_deck_category already applied (_ai_plan_v1 exists)';
  END IF;
  IF to_regprocedure('public._ai_plan(uuid,text,jsonb)') IS NULL
     OR to_regprocedure('public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)') IS NULL
     OR to_regprocedure('public._ai_undo_blocker(uuid,ai_change_log)') IS NULL
     OR to_regprocedure('public.ai_undo_group(uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'connector slice B functions not found; apply 20261116150100.. first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Widen the two allow-lists by one name. Constraint names are not assumed: found by their text (they list 'deck_zone').
-- ---------------------------------------------------------------------------------------------------------------
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
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category'));
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category'));
-- ai_pending_changes.kind stays ('big_edit','copy_move'): a category edit that waits is a 'big_edit'. reason values unchanged.

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Helpers. Mirror src/lib/connector/tools/get-deck.ts parseCategories (JSON list, else comma-separated).
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ai_category_list(p_raw text) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE v jsonb;
BEGIN
  IF p_raw IS NULL OR btrim(p_raw) = '' THEN RETURN ARRAY[]::text[]; END IF;
  BEGIN
    v := p_raw::jsonb;
    IF jsonb_typeof(v) = 'array' THEN
      RETURN ARRAY(SELECT e.value #>> '{}' FROM jsonb_array_elements(v) e WHERE jsonb_typeof(e.value) = 'string');
    END IF;
  EXCEPTION WHEN others THEN
    NULL;   -- not JSON: fall through to the comma split, exactly like the app
  END;
  RETURN ARRAY(SELECT btrim(s) FROM unnest(string_to_array(p_raw, ',')) AS s WHERE btrim(s) <> '');
END;
$$;

-- True when ANY category on the slot is the Maybeboard marker (case-insensitive). Stricter than _ai_is_maybe (primary only) on
-- purpose: a slot that is on the maybeboard in any way is never re-filed by this tool.
CREATE OR REPLACE FUNCTION public._ai_has_maybe_marker(p_raw text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM unnest(public._ai_category_list(p_raw)) AS x WHERE lower(btrim(x)) = 'maybeboard')
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. _ai_plan: 'deck_category' handled here, everything else goes to the untouched original.
--    Payload: {deck_id, slots:[{id, card_name, categories:[text,...]}]}  (a LIST per slot, 1 to 5 names, each 1 to 60 chars).
--    The list REPLACES the slot's whole category list; order is kept (first = the group the card shows under).
--    Names are trimmed. SPELLING (owner decision): a sent name is matched case-insensitively against every category already used in
--    THIS deck (all slots); a match is stored with the deck's existing spelling ("ramp" -> "Ramp"). If the deck has several spellings
--    of one name, the most used wins, then the lowest slot id. New names are stored as given (trimmed); inside one request the first
--    spelling sent wins. Matching is done HERE, under the deck lock, so dry runs, direct applies and approvals all behave the same
--    and the tool does not match anything. Repeats after matching are dropped.
--    Commanders are allowed. The marker: is_commander / command_zone_role are separate columns and are never written. Imported
--    commanders ALSO carry a 'Commander' entry in categories (display group, src/lib/deck-normalizer.ts); that entry is PRESERVED
--    (re-added if the request omits it). 'Commander' as a requested name is refused for a card that is not a commander.
--    Slots already holding exactly that list are SKIPPED (reported), not an error. All skipped = 'nothing_to_change'.
-- ---------------------------------------------------------------------------------------------------------------
ALTER FUNCTION public._ai_plan(uuid, text, jsonb) RENAME TO _ai_plan_v1;

CREATE OR REPLACE FUNCTION public._ai_plan(p_user_id uuid, p_action text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits();
  v_deck integer; v_names jsonb; v_slot jsonb; v_row record; v_el jsonb; v_cat text; v_list text[]; v_cur text[]; v_cmd_cur text; v_is_cmd boolean;
  v_seen integer[] := ARRAY[]::integer[];
  v_changes jsonb := '[]'::jsonb; v_cards jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb;
  v_n integer := 0; v_before jsonb; v_canon jsonb; v_used text; v_matched jsonb := '[]'::jsonb;
  c_max_cats CONSTANT integer := 5;          -- most categories on one card (mirrored in the types file)
BEGIN
  IF p_action IS DISTINCT FROM 'deck_category' THEN
    RETURN public._ai_plan_v1(p_user_id, p_action, p_payload);
  END IF;

  v_deck := (p_payload->>'deck_id')::integer;
  v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck]);
  v_before := public._ai_deck_counts(p_user_id, v_deck);

  -- lower-case name -> the spelling this deck already uses (most used, then lowest slot id, then alphabetical)
  SELECT COALESCE(jsonb_object_agg(k, sp), '{}'::jsonb) INTO v_canon FROM (
    SELECT DISTINCT ON (lower(x)) lower(x) AS k, x AS sp
      FROM deck_cards dc, LATERAL unnest(public._ai_category_list(dc.categories)) AS x
     WHERE dc.deck_id = v_deck AND dc.user_id = p_user_id
     GROUP BY lower(x), x
     ORDER BY lower(x), count(*) DESC, min(dc.id), x) q;

  IF jsonb_typeof(p_payload->'slots') IS DISTINCT FROM 'array' OR (CASE WHEN jsonb_typeof(p_payload->'slots') = 'array' THEN jsonb_array_length(p_payload->'slots') ELSE 0 END) = 0 THEN
    PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'cards'));
  END IF;
  IF jsonb_array_length(p_payload->'slots') > (v_lim->>'max_request')::int THEN
    PERFORM public._ai_fail('too_many_cards', jsonb_build_object('max', v_lim->'max_request'));
  END IF;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_payload->'slots') LOOP
    SELECT dc.id, dc.card_name, dc.categories, dc.is_commander, dc.command_zone_role
      INTO v_row FROM deck_cards dc
     WHERE dc.id = (v_slot->>'id')::integer AND dc.deck_id = v_deck AND dc.user_id = p_user_id;
    IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (v_slot->>'card_name') THEN
      PERFORM public._ai_fail('slot_not_found', jsonb_build_object('card', v_slot->>'card_name', 'deck', v_names->>v_deck::text));
    END IF;
    IF v_row.id = ANY (v_seen) THEN PERFORM public._ai_fail('duplicate_slot', jsonb_build_object('card', v_row.card_name)); END IF;
    v_seen := v_seen || v_row.id;
    IF public._ai_has_maybe_marker(v_row.categories) THEN                                    -- never touch a maybeboard slot
      PERFORM public._ai_fail('slot_in_maybeboard', jsonb_build_object('card', v_row.card_name, 'deck', v_names->>v_deck::text));
    END IF;
    v_is_cmd := COALESCE(v_row.is_commander, false) OR v_row.command_zone_role IS NOT NULL;

    -- Validate and normalise the requested list.
    IF jsonb_typeof(v_slot->'categories') IS DISTINCT FROM 'array' OR (CASE WHEN jsonb_typeof(v_slot->'categories') = 'array' THEN jsonb_array_length(v_slot->'categories') ELSE 0 END) NOT BETWEEN 1 AND c_max_cats THEN
      PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'categories', 'card', v_row.card_name, 'max', c_max_cats));
    END IF;
    v_list := ARRAY[]::text[];
    FOR v_el IN SELECT * FROM jsonb_array_elements(v_slot->'categories') LOOP
      IF jsonb_typeof(v_el) <> 'string' THEN PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'categories', 'card', v_row.card_name)); END IF;
      v_cat := regexp_replace(v_el #>> '{}', '^\s+|\s+$', '', 'g');                         -- trim (btrim only strips plain spaces)
      IF v_cat = '' OR char_length(v_cat) > 60 THEN
        PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'categories', 'card', v_row.card_name));
      END IF;
      IF lower(v_cat) = 'maybeboard' THEN                                                    -- the maybeboard is a zone, set with set_card_zone
        PERFORM public._ai_fail('category_reserved', jsonb_build_object('card', v_row.card_name, 'category', v_cat));
      END IF;
      IF lower(v_cat) = 'commander' AND NOT v_is_cmd THEN                                    -- never make a non-commander look like one
        PERFORM public._ai_fail('category_reserved', jsonb_build_object('card', v_row.card_name, 'category', v_cat));
      END IF;
      v_used := v_canon->>lower(v_cat);                                                      -- existing spelling in this deck, if any
      IF v_used IS NULL THEN v_used := v_cat; v_canon := v_canon || jsonb_build_object(lower(v_cat), v_cat);   -- new: as given; first spelling in the request wins
      ELSIF v_used <> v_cat THEN v_matched := v_matched || jsonb_build_object('card', v_row.card_name, 'sent', v_cat, 'used', v_used); END IF;
      IF NOT (lower(v_used) = ANY (SELECT lower(x) FROM unnest(v_list) x)) THEN v_list := v_list || v_used; END IF;
    END LOOP;

    v_cur := public._ai_category_list(v_row.categories);
    IF v_is_cmd THEN                                                                         -- keep the commander's own 'Commander' entry
      SELECT x INTO v_cmd_cur FROM unnest(v_cur) x WHERE lower(btrim(x)) = 'commander' LIMIT 1;
      IF v_cmd_cur IS NOT NULL AND NOT (lower(v_cmd_cur) = ANY (SELECT lower(x) FROM unnest(v_list) x)) THEN
        v_list := ARRAY[v_cmd_cur] || v_list;
      END IF;
      IF cardinality(v_list) > c_max_cats THEN
        PERFORM public._ai_fail('invalid_request', jsonb_build_object('field', 'categories', 'card', v_row.card_name, 'max', c_max_cats));
      END IF;
    END IF;

    IF v_cur = v_list THEN
      v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'name', v_row.card_name, 'categories', to_jsonb(v_list));
      CONTINUE;
    END IF;
    v_n := v_n + 1;
    v_changes := v_changes || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'from', to_jsonb(v_cur), 'to', to_jsonb(v_list));
    v_cards := v_cards || jsonb_build_object('name', v_row.card_name, 'quantity', 1, 'from', to_jsonb(v_cur), 'to', to_jsonb(v_list));
  END LOOP;

  IF v_n = 0 THEN PERFORM public._ai_fail('nothing_to_change', jsonb_build_object('deck', v_names->>v_deck::text, 'skipped', v_skipped)); END IF;

  RETURN jsonb_build_object('action', p_action, 'deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', v_n, 'cards', v_cards,
    'changes', v_changes, 'skipped', v_skipped, 'matched', v_matched,
    'preview', jsonb_build_object('cards', v_cards, 'decks', jsonb_build_array(
      jsonb_build_object('deck_id', v_deck, 'name', v_names->>v_deck::text, 'role', 'changes', 'before', v_before, 'after', v_before))));  -- counts do not change
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. _ai_execute: the ONE place that changes data. Re-plans under locks (so approve re-validates), updates ONLY categories,
--    one log row per changed slot, all in the caller's transaction (all or nothing).
-- ---------------------------------------------------------------------------------------------------------------
ALTER FUNCTION public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean) RENAME TO _ai_execute_v1;

CREATE OR REPLACE FUNCTION public._ai_execute(
  p_user_id uuid, p_connection_id uuid, p_client_name text, p_action text, p_payload jsonb, p_pending_id uuid, p_approved boolean
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_plan jsonb; v_group uuid := gen_random_uuid(); v_ch jsonb; v_row record; v_new text; v_count integer := 0;
BEGIN
  IF p_action IS DISTINCT FROM 'deck_category' THEN
    RETURN public._ai_execute_v1(p_user_id, p_connection_id, p_client_name, p_action, p_payload, p_pending_id, p_approved);
  END IF;
  v_plan := public._ai_plan(p_user_id, p_action, p_payload);
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_plan->'changes') LOOP
    SELECT dc.card_name, dc.categories, dc.scryfall_id INTO v_row FROM deck_cards dc WHERE dc.id = (v_ch->>'slot_id')::integer AND dc.user_id = p_user_id;
    v_new := array_to_json(ARRAY(SELECT jsonb_array_elements_text(v_ch->'to')))::text;      -- ["Ramp","Good Stuff"], same shape the app writes
    UPDATE deck_cards SET categories = v_new WHERE id = (v_ch->>'slot_id')::integer AND user_id = p_user_id;   -- the ONLY column touched
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, printing_id,
                               deck_card_id, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'deck_category', (v_plan->>'deck_id')::integer, v_plan->>'deck_name',
            v_row.card_name, v_row.scryfall_id, (v_ch->>'slot_id')::integer,
            jsonb_build_object('categories', v_row.categories),                               -- raw previous value (may be NULL), restored byte for byte
            jsonb_build_object('categories', v_new, 'category_list', v_ch->'to'), p_pending_id, p_approved);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('group_id', v_group, 'count', v_count, 'plan', v_plan);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Undo blocker. Same pure-read contract: NULL = can be undone, else {code, ...}. Slot-level, like deck_zone: the slot must
--    still hold exactly what Claude wrote. If anything (owner, a later Claude edit, a zone move) changed that slot's
--    categories since, undo is refused ('slot_edited') and nothing is changed.
-- ---------------------------------------------------------------------------------------------------------------
ALTER FUNCTION public._ai_undo_blocker(uuid, ai_change_log) RENAME TO _ai_undo_blocker_v1;

CREATE OR REPLACE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_slot record; v_on timestamptz;
BEGIN
  IF r.kind IS DISTINCT FROM 'deck_category' THEN RETURN public._ai_undo_blocker_v1(p_user_id, r); END IF;
  SELECT max(l.created_at) INTO v_on FROM ai_change_log l
   WHERE l.user_id = p_user_id AND l.id <> r.id AND l.created_at > r.created_at
     AND (l.deck_card_id = r.deck_card_id OR l.other_deck_card_id = r.deck_card_id);
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
  SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('code', 'slot_gone', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
  IF v_slot.categories IS DISTINCT FROM r.after->>'categories' THEN
    RETURN jsonb_build_object('code', 'slot_edited', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on);
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. ai_undo_group. A group holds ONE action, so: a deck_category group is undone here, any other group by the untouched
--    original. All or nothing: pass 1 finds blockers (changes nothing), pass 2 restores each slot's previous categories.
--    Claude may undo only groups of <= claude_undo_max rows that the owner did not approve (same rule as the other kinds).
-- ---------------------------------------------------------------------------------------------------------------
ALTER FUNCTION public.ai_undo_group(uuid, uuid, text, uuid) RENAME TO _ai_undo_group_v1;

CREATE OR REPLACE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits(); v_kind text; r ai_change_log; v_n integer; v_block jsonb; v_deck integer;
BEGIN
  SELECT kind INTO v_kind FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id LIMIT 1;
  IF v_kind IS DISTINCT FROM 'deck_category' THEN
    RETURN public._ai_undo_group_v1(p_user_id, p_group_id, p_actor, p_connection_id);
  END IF;

  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._ai_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  END IF;
  SELECT count(*), min(deck_id) INTO v_n, v_deck FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id;
  IF p_actor = 'claude' THEN
    SELECT * INTO r FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id LIMIT 1;
    IF v_n > (v_lim->>'claude_undo_max')::int OR EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND approved_by_owner) THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only', 'card', r.card_name, 'deck', r.deck_name));
    END IF;
  END IF;

  -- Lock order: decks, then the log rows (v1 order: connection row -> decks -> copies; this kind touches no copies).
  PERFORM 1 FROM decks WHERE user_id = p_user_id AND id IN (SELECT deck_id FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND deck_id IS NOT NULL) ORDER BY id FOR UPDATE;

  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id FOR UPDATE LOOP
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'refused', v_block); END IF;   -- nothing has been changed yet
  END LOOP;

  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id LOOP
    UPDATE deck_cards SET categories = r.before->>'categories' WHERE id = r.deck_card_id AND user_id = p_user_id;   -- the ONLY column touched
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n);
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 7. ai_list_recent_changes: same as 20261116150300 plus categories_from / categories_to (JSON lists, like zone_to) for the plain-words sentence.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_list_recent_changes(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_out jsonb := '[]'::jsonb; r ai_change_log;
BEGIN
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND undoable_until > now() ORDER BY created_at DESC, id LIMIT 300 LOOP
    v_out := v_out || (to_jsonb(r) - 'before' - 'after'
      || jsonb_build_object('owner_only', public._ai_kind_owner_only(r.kind),
                            'undo_blocker', CASE WHEN r.undone_at IS NULL THEN public._ai_undo_blocker(p_user_id, r) END,
                            'zone_to', CASE WHEN r.kind = 'deck_zone' THEN CASE WHEN COALESCE(r.after->>'categories', '') LIKE '%Maybeboard%' THEN 'maybeboard' ELSE 'main' END END,
                            'categories_from', CASE WHEN r.kind = 'deck_category' THEN to_jsonb(public._ai_category_list(r.before->>'categories')) END,
                            'categories_to', CASE WHEN r.kind = 'deck_category' THEN r.after->'category_list' END));
  END LOOP;
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 8. Privileges: service_role ONLY, for every function this file creates (renamed *_v1 keep the grants they already had).
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._ai_category_list(text)', 'public._ai_has_maybe_marker(text)', 'public._ai_plan(uuid,text,jsonb)',
    'public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)', 'public._ai_undo_blocker(uuid,ai_change_log)',
    'public.ai_undo_group(uuid,uuid,text,uuid)', 'public.ai_list_recent_changes(uuid)',
    'public._ai_plan_v1(uuid,text,jsonb)', 'public._ai_execute_v1(uuid,uuid,text,text,jsonb,uuid,boolean)',
    'public._ai_undo_blocker_v1(uuid,ai_change_log)', 'public._ai_undo_group_v1(uuid,uuid,text,uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

COMMIT;
