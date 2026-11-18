-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: deck strategy store (CC-26 follow-on), database change DB-6 (amends D-060). Author: Architect, 2026-11-18.
-- Contract: docs/oracle/contracts/deck-strategy.md (sections 3, 4, 5, 6, 11, 14). Test: docs/oracle/reports/evidence/roles-db/test_db6.sh
-- Depends on: DB-1 to DB-5 (20261118120000 to 20261118120400). The guard below refuses to run on any other base.
--
-- What this does (and only this):
--   1. deck_strategy_items: a deck's strategy as separate one-sentence items (kind: aim, commander_enables, win_condition, reference_commander), at most 7 per deck.
--      Owner rows and Claude rows; a Claude proposal can cite up to 5 evidence cards (oracle ids) that cover nothing. A Claude rewording of an owner's item is a
--      second row BESIDE it (replaces_item_id); the owner's row is never overwritten by Claude. RLS: a user sees only their own rows; no write grant; every write is a function.
--   2. deck_job_serves: which strategy item or strategy point a card's job serves ("Serves: Urza turns artifacts into mana"). One owner link and at most one
--      Claude link per card per deck. It never changes a health count and never touches deck_card_jobs.
--   3. Adds the two change kinds strategy_item and job_link to the two allow-lists (ai_change_log.kind, ai_pending_changes.action): one name pair, existing names kept.
--   4. Adds the Claude-side steps (_ai_plan_ / _ai_execute_ / _ai_blocker_ / _ai_undo_ for each kind) and puts them behind the four front doors with the same thin-front
--      technique DB-2 and DB-5 used: the four DB-5 front doors are RENAMED to *_pre_strategy (not rewritten) and a short new function with the old name handles the two
--      new kinds and hands everything else to the renamed one with the same arguments. No DB-2 or DB-5 function body is rewritten.
--   5. Adds the owner-side functions and the readers (items, links, "strategy changed since Claude set the numbers").
-- Not destructive: two new tables, new functions, four functions renamed (bodies untouched), two allow-lists widened by two names. No existing row is changed.
--   deck_strategy, deck_strategy_points, deck_card_jobs, deck_health_targets, deck_cards, decks are not altered. The old win_condition text is not touched.
-- Reversible: supabase/drafts/20261118140000_roles_db6_deck_strategy.rollback.sql (puts the DB-5 front doors back byte for byte; refuses while either table holds rows
--   or strategy_item / job_link log or pending rows exist). Roll DB-6 back BEFORE DB-5 or DB-3 (their rollbacks now refuse while DB-6 is applied).
-- The one-time copy of written win conditions is a separate file: 20261118140100_roles_db6b_copy_win_conditions.draft.sql (insert-only).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.deck_strategy_items') IS NOT NULL OR to_regclass('public.deck_job_serves') IS NOT NULL THEN RAISE EXCEPTION 'roles_db6 already applied (a DB-6 table exists)'; END IF;
  IF to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'roles_db6 already applied (_ai_plan_pre_strategy exists)'; END IF;
  IF to_regclass('public.deck_strategy_points') IS NULL THEN RAISE EXCEPTION 'apply roles_db4 first'; END IF;
  IF to_regclass('public.deck_card_jobs') IS NULL THEN RAISE EXCEPTION 'apply roles_db3 first'; END IF;
  IF to_regclass('public.deck_health_targets') IS NULL THEN RAISE EXCEPTION 'apply roles_db5 first'; END IF;
  IF to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NULL OR to_regprocedure('public._roles_fail(text,jsonb)') IS NULL
     OR to_regprocedure('public._ai_plan_health_target(uuid,jsonb)') IS NULL OR to_regprocedure('public.deck_slot_oracle_ids(uuid,integer)') IS NULL
     OR to_regprocedure('public._ai_lock_decks(uuid,integer[])') IS NULL OR to_regprocedure('public._ai_deck_counts(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'roles_db1 to roles_db5 functions not found; wrong base';
  END IF;
  IF to_regprocedure('public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)') IS NULL OR to_regprocedure('public._ai_undo_blocker(uuid,ai_change_log)') IS NULL
     OR to_regprocedure('public.ai_undo_group(uuid,uuid,text,uuid)') IS NULL THEN RAISE EXCEPTION 'connector front doors not found; wrong base'; END IF;
  IF position('health_target' IN pg_get_functiondef('public._ai_plan(uuid,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'the front doors are not the DB-5 ones (apply roles_db5 first)';
  END IF;
END $$;

-- 1. deck_strategy_items
CREATE TABLE public.deck_strategy_items (
  id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  deck_id             integer     NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  kind                text        NOT NULL CHECK (kind IN ('aim','commander_enables','win_condition','reference_commander')),
  statement           text        NOT NULL CHECK (statement = btrim(statement) AND char_length(statement) BETWEEN 1 AND 300),
  reason              text        CHECK (reason IS NULL OR char_length(reason) <= 200),
  proposer            text        NOT NULL CHECK (proposer IN ('owner','claude')),
  state               text        NOT NULL CHECK (state IN ('accepted','to_look_at','dismissed')),
  replaces_item_id    bigint      REFERENCES public.deck_strategy_items (id) ON DELETE SET NULL,   -- Claude row proposing new wording for an owner's item
  based_on_oracle_ids uuid[],     -- ORACLE ids of up to 5 evidence cards (Claude rows only). Cover nothing, change no count.
  batch_id            uuid,       -- ai_change_log.group_id of the Claude request that wrote it; Claude rows only. No FK.
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_strategy_items_proposer_state CHECK ((proposer = 'owner' AND state = 'accepted') OR (proposer = 'claude' AND state IN ('to_look_at','dismissed'))),
  CONSTRAINT deck_strategy_items_claude_only CHECK (proposer = 'claude' OR (batch_id IS NULL AND replaces_item_id IS NULL AND based_on_oracle_ids IS NULL)),
  CONSTRAINT deck_strategy_items_based_on CHECK (based_on_oracle_ids IS NULL OR cardinality(based_on_oracle_ids) BETWEEN 1 AND 5),
  CONSTRAINT deck_strategy_items_not_self CHECK (replaces_item_id IS NULL OR replaces_item_id <> id),
  CONSTRAINT deck_strategy_items_id_deck UNIQUE (id, deck_id)   -- so a link can prove its item is in the same deck
);
CREATE UNIQUE INDEX deck_strategy_items_one_sentence ON public.deck_strategy_items (user_id, deck_id, kind, lower(btrim(statement)));
CREATE INDEX deck_strategy_items_deck ON public.deck_strategy_items (user_id, deck_id);
CREATE INDEX deck_strategy_items_looking ON public.deck_strategy_items (user_id, deck_id) WHERE state = 'to_look_at';
CREATE INDEX deck_strategy_items_batch ON public.deck_strategy_items (user_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX deck_strategy_items_replaces ON public.deck_strategy_items (replaces_item_id) WHERE replaces_item_id IS NOT NULL;
COMMENT ON TABLE public.deck_strategy_items IS 'A deck''s strategy as one-sentence items (aim, what the commander enables, win condition, play it like). Owner rows and Claude rows; a Claude proposal is unconfirmed until accepted. Written only by service-role functions.';
COMMENT ON COLUMN public.deck_strategy_items.based_on_oracle_ids IS 'oracle_ids (the cards), NOT scryfall_ids (printings). Evidence only: covers nothing, changes no count. D-003.';
COMMENT ON COLUMN public.deck_strategy_items.replaces_item_id IS 'Set only on a Claude row that proposes new wording for an owner item; shown beside it. The owner item stays in force until the owner accepts.';
COMMENT ON COLUMN public.deck_strategy_items.batch_id IS 'ai_change_log.group_id of the Claude request that wrote this row (not a key).';
ALTER TABLE public.deck_strategy_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_strategy_items_select_own ON public.deck_strategy_items FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_strategy_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_strategy_items TO authenticated;
GRANT ALL ON public.deck_strategy_items TO service_role;

-- 2. deck_job_serves
CREATE TABLE public.deck_job_serves (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  deck_id          integer     NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  oracle_id        uuid        NOT NULL,   -- ORACLE id of the card (not a printing, not deck_cards.id). Same key as deck_card_jobs. D-003.
  card_name        text        NOT NULL,   -- snapshot, for reading
  serves_item_id   bigint,
  serves_point_id  bigint      REFERENCES public.deck_strategy_points (id) ON DELETE CASCADE,
  proposer         text        NOT NULL CHECK (proposer IN ('owner','claude')),
  state            text        NOT NULL CHECK (state IN ('accepted','to_look_at','dismissed')),
  batch_id         uuid,       -- ai_change_log.group_id of the Claude request that wrote it; Claude rows only. No FK.
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_job_serves_item_same_deck FOREIGN KEY (serves_item_id, deck_id) REFERENCES public.deck_strategy_items (id, deck_id) ON DELETE CASCADE,
  CONSTRAINT deck_job_serves_one_target CHECK ((serves_item_id IS NULL) <> (serves_point_id IS NULL)),
  CONSTRAINT deck_job_serves_proposer_state CHECK ((proposer = 'owner' AND state = 'accepted') OR (proposer = 'claude' AND state IN ('to_look_at','dismissed'))),
  CONSTRAINT deck_job_serves_claude_only_batch CHECK (proposer = 'claude' OR batch_id IS NULL),
  CONSTRAINT deck_job_serves_one_per_proposer UNIQUE (user_id, deck_id, oracle_id, proposer)
);
CREATE INDEX deck_job_serves_looking ON public.deck_job_serves (user_id, deck_id) WHERE state = 'to_look_at';
CREATE INDEX deck_job_serves_batch ON public.deck_job_serves (user_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX deck_job_serves_item ON public.deck_job_serves (serves_item_id) WHERE serves_item_id IS NOT NULL;
CREATE INDEX deck_job_serves_point ON public.deck_job_serves (serves_point_id) WHERE serves_point_id IS NOT NULL;
COMMENT ON TABLE public.deck_job_serves IS 'Which strategy item or strategy point a card''s job serves, per deck. Owner and Claude rows. Never changes a health count. Written only by service-role functions.';
COMMENT ON COLUMN public.deck_job_serves.oracle_id IS 'oracle_id (the card), NOT a scryfall_id (a printing) and NOT deck_cards.id. D-003.';
ALTER TABLE public.deck_job_serves ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_job_serves_select_own ON public.deck_job_serves FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_job_serves FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_job_serves TO authenticated;
GRANT ALL ON public.deck_job_serves TO service_role;

-- 3. Allow-lists, found by their text (they list 'health_target', the newest name in both), as in DB-2 and DB-5. Two names added to each.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
            WHERE contype = 'c' AND conrelid IN ('public.ai_pending_changes'::regclass, 'public.ai_change_log'::regclass)
              AND pg_get_constraintdef(oid) LIKE '%health_target%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ai_pending_changes ADD CONSTRAINT ai_pending_changes_action_check CHECK (action IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category','card_label','strategy_point','health_target',
   'strategy_item','job_link'));
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move','card_label','strategy_point','health_target','strategy_item','job_link'));
-- _ai_kind_owner_only is NOT changed: Claude may undo its own item and link proposals (it deletes no owner data).

-- 4a. Numbers. KEEP IN STEP with AI_LIMITS_STRATEGY in deck-strategy.types.ts (a test asserts equal).
CREATE FUNCTION public._ai_limits_strategy() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('item_statement_max_chars', 300, 'reason_max_chars', 200, 'items_per_request_max', 7, 'items_per_deck_max', 7,
    'aim_max', 1, 'commander_enables_max', 3, 'win_condition_max', 3, 'reference_commander_max', 1, 'based_on_max', 5, 'links_per_request_max', 200)
$$;
CREATE FUNCTION public._strategy_kind_label(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_kind WHEN 'aim' THEN 'Aim' WHEN 'commander_enables' THEN 'Commander enables' WHEN 'win_condition' THEN 'Win condition' WHEN 'reference_commander' THEN 'Play it like' END
$$;
-- Does this card have an effective job in this deck? Owner row wins (a NULL job on an owner row means "no job, on purpose"), else Claude's waiting row.
CREATE FUNCTION public._job_effective(p_user_id uuid, p_deck_id integer, p_oracle_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT j.job IS NOT NULL FROM deck_card_jobs j WHERE j.user_id = p_user_id AND j.deck_id = p_deck_id AND j.oracle_id = p_oracle_id AND j.proposer = 'owner'),
    EXISTS (SELECT 1 FROM deck_card_jobs j WHERE j.user_id = p_user_id AND j.deck_id = p_deck_id AND j.oracle_id = p_oracle_id AND j.proposer = 'claude' AND j.state = 'to_look_at' AND j.job IS NOT NULL))
$$;

-- 4b. Validate one item and return it in stored form.
-- Input: {kind, statement, reason?, replaces_id?, based_on?:[{slot_id,name}]}  (replaces_id and based_on are Claude-only)
-- Output: {kind, statement, reason, replaces_id, based_on_oracle_ids (array of ids or null)}
CREATE FUNCTION public._strategy_item_normalize(p_user_id uuid, p_deck_id integer, p_item jsonb, p_slot_map jsonb, p_deck_name text, p_claude boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits_strategy(); v_kind text; v_st text; v_reason text; v_rep bigint; v_ids uuid[]; v_el jsonb; v_row record; v_oid uuid;
BEGIN
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'items')); END IF;
  v_kind := CASE WHEN jsonb_typeof(p_item->'kind') = 'string' THEN p_item->>'kind' END;
  IF v_kind IS NULL OR v_kind NOT IN ('aim','commander_enables','win_condition','reference_commander') THEN PERFORM public._roles_fail('unknown_kind', jsonb_build_object('kind', p_item->'kind')); END IF;
  IF jsonb_typeof(p_item->'statement') IS DISTINCT FROM 'string' THEN PERFORM public._roles_fail('bad_statement'); END IF;
  v_st := regexp_replace(p_item->>'statement', '^\s+|\s+$', '', 'g');
  IF v_st = '' OR char_length(v_st) > (v_lim->>'item_statement_max_chars')::int THEN PERFORM public._roles_fail('bad_statement'); END IF;
  v_reason := NULL;
  IF p_item ? 'reason' AND jsonb_typeof(p_item->'reason') <> 'null' THEN
    IF jsonb_typeof(p_item->'reason') <> 'string' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'reason')); END IF;
    v_reason := NULLIF(regexp_replace(p_item->>'reason', '^\s+|\s+$', '', 'g'), '');
    IF char_length(COALESCE(v_reason, '')) > (v_lim->>'reason_max_chars')::int THEN PERFORM public._roles_fail('reason_too_long'); END IF;
  END IF;
  v_rep := NULL;
  IF p_item ? 'replaces_id' AND jsonb_typeof(p_item->'replaces_id') <> 'null' THEN
    IF NOT p_claude THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'replaces_id')); END IF;
    IF jsonb_typeof(p_item->'replaces_id') <> 'number' OR (p_item->>'replaces_id') !~ '^[0-9]{1,18}$' THEN PERFORM public._roles_fail('bad_replaces'); END IF;
    v_rep := (p_item->>'replaces_id')::bigint;
  END IF;
  v_ids := NULL;
  IF p_item ? 'based_on' AND jsonb_typeof(p_item->'based_on') <> 'null' THEN
    IF NOT p_claude OR jsonb_typeof(p_item->'based_on') <> 'array' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'based_on')); END IF;
    IF jsonb_array_length(p_item->'based_on') > (v_lim->>'based_on_max')::int THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'based_on', 'max', v_lim->'based_on_max')); END IF;
    v_ids := ARRAY[]::uuid[];
    FOR v_el IN SELECT * FROM jsonb_array_elements(p_item->'based_on') LOOP
      IF jsonb_typeof(v_el) <> 'object' OR COALESCE(v_el->>'slot_id', '') !~ '^[0-9]+$' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'based_on')); END IF;
      SELECT dc.id, dc.card_name INTO v_row FROM deck_cards dc WHERE dc.id = (v_el->>'slot_id')::integer AND dc.deck_id = p_deck_id AND dc.user_id = p_user_id;
      IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (v_el->>'name') THEN
        PERFORM public._roles_fail('slot_not_found', jsonb_build_object('card', v_el->>'name', 'deck', p_deck_name));
      END IF;
      v_oid := NULLIF(p_slot_map->>(v_row.id::text), '')::uuid;
      IF v_oid IS NULL THEN PERFORM public._roles_fail('card_not_identified', jsonb_build_object('card', v_row.card_name)); END IF;
      IF NOT (v_oid = ANY (v_ids)) THEN v_ids := v_ids || v_oid; END IF;
    END LOOP;
    IF cardinality(v_ids) = 0 THEN v_ids := NULL; END IF;
  END IF;
  RETURN jsonb_build_object('kind', v_kind, 'statement', v_st, 'reason', v_reason, 'replaces_id', v_rep, 'based_on_oracle_ids', to_jsonb(v_ids));
END;
$$;

-- 4c. Validate a whole items request under the locks and say what would change (contract section 4). Used by plan, execute and approve.
-- Input: {deck_id, items:[...]}. Returns {deck_id, deck_name, n, changes:[{kind, statement, reason, replaces_id, based_on_count, result, item_id, existing_id, fields}], skipped:[{kind, statement, why}]}
CREATE FUNCTION public._ai_strategy_item_prepare(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits_strategy(); v_deck integer; v_names jsonb; v_map jsonb; v_it jsonb; v_f jsonb; v_ex deck_strategy_items; v_tg deck_strategy_items; v_bs deck_strategy_items;
  v_changes jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_seen text[] := ARRAY[]::text[]; v_reps bigint[] := ARRAY[]::bigint[];
  v_live_total integer; v_new_total integer := 0; v_new_kind jsonb := '{}'::jsonb; v_live_kind integer; v_kind text; v_rep bigint; v_exid bigint; v_result text;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR COALESCE(p_payload->>'deck_id', '') !~ '^[0-9]{1,9}$' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'deck_id')); END IF;
  v_deck := (p_payload->>'deck_id')::integer;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || v_deck::text, 0));
  v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck]);
  IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') = 0 THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'items')); END IF;
  IF jsonb_array_length(p_payload->'items') > (v_lim->>'items_per_request_max')::int THEN
    PERFORM public._roles_fail('too_many_items_in_request', jsonb_build_object('max', v_lim->'items_per_request_max'));
  END IF;
  SELECT COALESCE(jsonb_object_agg(s.slot_id::text, s.oracle_id), '{}'::jsonb) INTO v_map FROM public.deck_slot_oracle_ids(p_user_id, v_deck) s;
  SELECT count(*) INTO v_live_total FROM deck_strategy_items WHERE user_id = p_user_id AND deck_id = v_deck AND state <> 'dismissed' AND replaces_item_id IS NULL;

  FOR v_it IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    v_f := public._strategy_item_normalize(p_user_id, v_deck, v_it, v_map, v_names->>v_deck::text, true);
    v_kind := v_f->>'kind';
    IF (v_kind || ':' || lower(v_f->>'statement')) = ANY (v_seen) THEN
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'statement', v_f->>'statement', 'why', 'already_exists'); CONTINUE;
    END IF;
    v_seen := v_seen || (v_kind || ':' || lower(v_f->>'statement'));
    SELECT * INTO v_ex FROM deck_strategy_items WHERE user_id = p_user_id AND deck_id = v_deck AND kind = v_kind AND lower(btrim(statement)) = lower(v_f->>'statement');
    IF FOUND THEN
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'statement', v_f->>'statement',
                     'why', CASE WHEN v_ex.proposer = 'claude' AND v_ex.state = 'dismissed' THEN 'previously_dismissed' ELSE 'already_exists' END);
      CONTINUE;
    END IF;
    v_exid := NULL; v_rep := NULLIF(v_f->>'replaces_id', '')::bigint;
    IF v_rep IS NOT NULL THEN
      SELECT * INTO v_tg FROM deck_strategy_items WHERE id = v_rep AND user_id = p_user_id AND deck_id = v_deck;
      IF NOT FOUND OR v_tg.kind <> v_kind OR v_tg.state = 'dismissed' OR v_tg.replaces_item_id IS NOT NULL OR v_rep = ANY (v_reps) THEN
        PERFORM public._roles_fail('bad_replaces', jsonb_build_object('replaces_id', v_rep));
      END IF;
      v_reps := v_reps || v_rep;
      IF v_tg.proposer = 'owner' THEN
        SELECT * INTO v_bs FROM deck_strategy_items WHERE replaces_item_id = v_rep AND user_id = p_user_id AND proposer = 'claude' ORDER BY id LIMIT 1;
        IF FOUND THEN v_exid := v_bs.id; END IF;
        v_result := 'beside_yours';
      ELSE
        v_exid := v_tg.id; v_result := 'rewrote_own';
      END IF;
    ELSE
      SELECT count(*) INTO v_live_kind FROM deck_strategy_items WHERE user_id = p_user_id AND deck_id = v_deck AND kind = v_kind AND state <> 'dismissed' AND replaces_item_id IS NULL;
      IF v_live_kind + COALESCE((v_new_kind->>v_kind)::int, 0) >= (v_lim->>(v_kind || '_max'))::int THEN
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'statement', v_f->>'statement', 'why', 'kind_full'); CONTINUE;
      END IF;
      IF v_live_total + v_new_total >= (v_lim->>'items_per_deck_max')::int THEN
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'statement', v_f->>'statement', 'why', 'deck_items_full'); CONTINUE;
      END IF;
      v_new_total := v_new_total + 1; v_new_kind := v_new_kind || jsonb_build_object(v_kind, COALESCE((v_new_kind->>v_kind)::int, 0) + 1);
      v_result := 'proposed';
    END IF;
    v_changes := v_changes || jsonb_build_object('kind', v_kind, 'statement', v_f->>'statement', 'reason', v_f->>'reason', 'replaces_id', v_rep,
      'based_on_count', CASE WHEN jsonb_typeof(v_f->'based_on_oracle_ids') = 'array' THEN jsonb_array_length(v_f->'based_on_oracle_ids') ELSE 0 END,
      'result', v_result, 'existing_id', v_exid, 'fields', v_f);
  END LOOP;
  IF jsonb_array_length(v_changes) = 0 THEN PERFORM public._roles_fail('nothing_to_change', jsonb_build_object('deck', v_names->>v_deck::text, 'skipped', v_skipped)); END IF;
  RETURN jsonb_build_object('deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', jsonb_array_length(v_changes), 'changes', v_changes, 'skipped', v_skipped);
END;
$$;

CREATE FUNCTION public._ai_plan_strategy_item(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_p jsonb := public._ai_strategy_item_prepare(p_user_id, p_payload); v_pub jsonb; v_before jsonb;
BEGIN
  SELECT jsonb_agg(c - 'fields' - 'existing_id') INTO v_pub FROM jsonb_array_elements(v_p->'changes') c;
  v_before := public._ai_deck_counts(p_user_id, (v_p->>'deck_id')::integer);
  RETURN jsonb_build_object('action', 'strategy_item', 'deck_id', v_p->'deck_id', 'deck_name', v_p->'deck_name', 'n', v_p->'n', 'cards', v_pub,
    'changes', v_pub, 'skipped', v_p->'skipped',
    'preview', jsonb_build_object('cards', v_pub, 'decks', jsonb_build_array(
      jsonb_build_object('deck_id', v_p->'deck_id', 'name', v_p->'deck_name', 'role', 'changes', 'before', v_before, 'after', v_before))));
END;
$$;

CREATE FUNCTION public._ai_execute_strategy_item(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_p jsonb := public._ai_strategy_item_prepare(p_user_id, p_payload); v_group uuid := gen_random_uuid(); v_deck integer := (v_p->>'deck_id')::integer;
  v_ch jsonb; v_f jsonb; v_ex deck_strategy_items; v_id bigint; v_before jsonb; v_count integer := 0; v_pub jsonb; v_ids uuid[];
BEGIN
  SELECT jsonb_agg(c - 'fields' - 'existing_id') INTO v_pub FROM jsonb_array_elements(v_p->'changes') c;
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_p->'changes') LOOP
    v_f := v_ch->'fields'; v_before := '{}'::jsonb; v_id := NULLIF(v_ch->>'existing_id', '')::bigint;
    v_ids := CASE WHEN jsonb_typeof(v_f->'based_on_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'based_on_oracle_ids')::uuid) END;
    IF v_id IS NOT NULL THEN
      SELECT * INTO v_ex FROM deck_strategy_items WHERE id = v_id AND user_id = p_user_id;
      v_before := jsonb_build_object('item_id', v_ex.id, 'kind', v_ex.kind, 'statement', v_ex.statement, 'reason', v_ex.reason, 'state', v_ex.state, 'batch_id', v_ex.batch_id,
                                     'replaces_item_id', v_ex.replaces_item_id, 'based_on_oracle_ids', to_jsonb(v_ex.based_on_oracle_ids));
      UPDATE deck_strategy_items SET statement = v_f->>'statement', reason = v_f->>'reason', state = 'to_look_at', batch_id = v_group, based_on_oracle_ids = v_ids, updated_at = now()
       WHERE id = v_id AND user_id = p_user_id;
    ELSE
      INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, reason, proposer, state, replaces_item_id, based_on_oracle_ids, batch_id)
      VALUES (p_user_id, v_deck, v_f->>'kind', v_f->>'statement', v_f->>'reason', 'claude', 'to_look_at', NULLIF(v_f->>'replaces_id', '')::bigint, v_ids, v_group)
      RETURNING id INTO v_id;
    END IF;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'strategy_item', v_deck, v_p->>'deck_name',
            public._strategy_kind_label(v_f->>'kind') || ': ' || left(v_f->>'statement', 50), v_before,
            jsonb_build_object('item_id', v_id, 'kind', v_f->>'kind', 'statement', v_f->>'statement', 'reason', v_f->>'reason', 'state', 'to_look_at',
                               'replaces_item_id', (SELECT i.replaces_item_id FROM deck_strategy_items i WHERE i.id = v_id), 'result', v_ch->>'result'),
            p_pending_id, p_approved);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('group_id', v_group, 'count', v_count,
    'plan', jsonb_build_object('action', 'strategy_item', 'deck_id', v_p->'deck_id', 'deck_name', v_p->'deck_name', 'n', v_p->'n', 'cards', v_pub, 'changes', v_pub, 'skipped', v_p->'skipped'));
END;
$$;

-- Blocker (a pure read): NULL = this log row can be undone. "Is the item still exactly what Claude left (same fields, still waiting)?"
CREATE FUNCTION public._ai_blocker_strategy_item(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_i deck_strategy_items;
BEGIN
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
  SELECT * INTO v_i FROM deck_strategy_items WHERE id = NULLIF(r.after->>'item_id', '')::bigint AND user_id = p_user_id AND deck_id = r.deck_id;
  IF NOT FOUND OR v_i.proposer <> 'claude' OR v_i.state <> 'to_look_at' OR v_i.kind IS DISTINCT FROM (r.after->>'kind') OR v_i.statement IS DISTINCT FROM (r.after->>'statement')
     OR v_i.reason IS DISTINCT FROM (r.after->>'reason') OR v_i.replaces_item_id IS DISTINCT FROM NULLIF(r.after->>'replaces_item_id', '')::bigint THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'item');
  END IF;
  -- Undoing a rewrite puts the old sentence back; refuse if the owner has since written that same sentence in another row.
  IF r.before <> '{}'::jsonb AND EXISTS (SELECT 1 FROM deck_strategy_items x WHERE x.user_id = p_user_id AND x.deck_id = r.deck_id AND x.kind = v_i.kind AND x.id <> v_i.id
                                           AND lower(btrim(x.statement)) = lower(r.before->>'statement')) THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'item');
  END IF;
  RETURN NULL;
END;
$$;

-- Undo of one strategy_item group. Claude: all or nothing (the first blocker refuses). Owner: rows still as Claude left them are restored, the rest reported. Owner rows are never written.
CREATE FUNCTION public._ai_undo_strategy_item(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r ai_change_log; v_block jsonb; v_ok uuid[] := ARRAY[]::uuid[]; v_left jsonb := '[]'::jsonb; v_n integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' ||
    COALESCE((SELECT min(deck_id) FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'strategy_item')::text, ''), 0));
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'strategy_item') THEN PERFORM public._roles_fail('change_not_found'); END IF;
  PERFORM 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone'));
  END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL ORDER BY id LOOP
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NULL THEN v_ok := v_ok || r.id;
    ELSIF p_actor = 'owner' AND v_block->>'code' = 'changed_since' THEN
      v_left := v_left || jsonb_build_object('card', r.card_name, 'deck', r.deck_name, 'what', COALESCE(v_block->>'what', 'item'));
    ELSE RETURN jsonb_build_object('success', false, 'refused', v_block);
    END IF;
  END LOOP;
  IF cardinality(v_ok) = 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo'), 'left_alone', v_left); END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE id = ANY (v_ok) ORDER BY id LOOP
    IF r.before = '{}'::jsonb THEN
      DELETE FROM deck_strategy_items WHERE id = (r.after->>'item_id')::bigint AND user_id = p_user_id AND proposer = 'claude';
    ELSE
      UPDATE deck_strategy_items SET statement = r.before->>'statement', reason = r.before->>'reason', state = r.before->>'state', batch_id = NULLIF(r.before->>'batch_id', '')::uuid,
             replaces_item_id = NULLIF(r.before->>'replaces_item_id', '')::bigint,
             based_on_oracle_ids = CASE WHEN jsonb_typeof(r.before->'based_on_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(r.before->'based_on_oracle_ids')::uuid) END,
             updated_at = now()
       WHERE id = (r.after->>'item_id')::bigint AND user_id = p_user_id AND proposer = 'claude';
    END IF;
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n, 'left_alone', v_left);
END;
$$;

-- 4d. Job links. Input: {deck_id, links:[{slot_id, name, serves:{item_id}|{point_id}}]}
-- Returns {deck_id, deck_name, n, changes:[{slot_id, card_name, oracle_id, serves:{kind,id}, result, existing_id}], skipped:[{slot_id, card_name, why}]}
CREATE FUNCTION public._ai_job_link_prepare(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits_strategy(); v_deck integer; v_names jsonb; v_map jsonb; v_l jsonb; v_srv jsonb; v_row record; v_oid uuid; v_skind text; v_sid bigint;
  v_changes jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb; v_slots integer[] := ARRAY[]::integer[]; v_oids uuid[] := ARRAY[]::uuid[];
  v_own deck_job_serves; v_cl deck_job_serves; v_has_own boolean; v_has_cl boolean; v_exid bigint; v_result text; v_same_cl boolean; v_same_own boolean;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR COALESCE(p_payload->>'deck_id', '') !~ '^[0-9]{1,9}$' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'deck_id')); END IF;
  v_deck := (p_payload->>'deck_id')::integer;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || v_deck::text, 0));
  v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck]);
  IF jsonb_typeof(p_payload->'links') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'links') = 0 THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'links')); END IF;
  IF jsonb_array_length(p_payload->'links') > (v_lim->>'links_per_request_max')::int THEN PERFORM public._roles_fail('too_many_cards', jsonb_build_object('max', v_lim->'links_per_request_max')); END IF;
  SELECT COALESCE(jsonb_object_agg(s.slot_id::text, s.oracle_id), '{}'::jsonb) INTO v_map FROM public.deck_slot_oracle_ids(p_user_id, v_deck) s;

  FOR v_l IN SELECT * FROM jsonb_array_elements(p_payload->'links') LOOP
    IF jsonb_typeof(v_l) <> 'object' OR COALESCE(v_l->>'slot_id', '') !~ '^[0-9]{1,9}$' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'links')); END IF;
    SELECT dc.id, dc.card_name, dc.scryfall_id INTO v_row FROM deck_cards dc WHERE dc.id = (v_l->>'slot_id')::integer AND dc.deck_id = v_deck AND dc.user_id = p_user_id;
    IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (v_l->>'name') THEN
      PERFORM public._roles_fail('slot_not_found', jsonb_build_object('card', v_l->>'name', 'deck', v_names->>v_deck::text));
    END IF;
    IF v_row.id = ANY (v_slots) THEN PERFORM public._roles_fail('duplicate_slot', jsonb_build_object('card', v_row.card_name)); END IF;
    v_slots := v_slots || v_row.id;
    v_oid := NULLIF(v_map->>(v_row.id::text), '')::uuid;
    IF v_oid IS NULL THEN PERFORM public._roles_fail('card_not_identified', jsonb_build_object('card', v_row.card_name)); END IF;
    IF v_oid = ANY (v_oids) THEN PERFORM public._roles_fail('duplicate_slot', jsonb_build_object('card', v_row.card_name)); END IF;
    v_oids := v_oids || v_oid;
    v_srv := v_l->'serves';
    IF jsonb_typeof(v_srv) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(v_srv)) <> 1 OR NOT (v_srv ?| ARRAY['item_id', 'point_id'])
       OR jsonb_typeof(COALESCE(v_srv->'item_id', v_srv->'point_id')) <> 'number' OR COALESCE(v_srv->>'item_id', v_srv->>'point_id') !~ '^[0-9]{1,18}$' THEN
      PERFORM public._roles_fail('bad_serves');
    END IF;
    v_skind := CASE WHEN v_srv ? 'item_id' THEN 'item' ELSE 'point' END; v_sid := COALESCE(v_srv->>'item_id', v_srv->>'point_id')::bigint;
    IF v_skind = 'item' THEN
      IF NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE id = v_sid AND user_id = p_user_id AND deck_id = v_deck AND state <> 'dismissed' AND replaces_item_id IS NULL) THEN
        PERFORM public._roles_fail('serves_not_found', jsonb_build_object('deck', v_names->>v_deck::text));
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE id = v_sid AND user_id = p_user_id AND deck_id = v_deck AND state <> 'dismissed') THEN
      PERFORM public._roles_fail('serves_not_found', jsonb_build_object('deck', v_names->>v_deck::text));
    END IF;
    IF NOT public._job_effective(p_user_id, v_deck, v_oid) THEN
      v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'why', 'no_job'); CONTINUE;
    END IF;
    SELECT * INTO v_own FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = v_deck AND oracle_id = v_oid AND proposer = 'owner'; v_has_own := FOUND;
    SELECT * INTO v_cl FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = v_deck AND oracle_id = v_oid AND proposer = 'claude'; v_has_cl := FOUND;
    v_same_own := v_has_own AND v_own.serves_item_id IS NOT DISTINCT FROM (CASE WHEN v_skind = 'item' THEN v_sid END) AND v_own.serves_point_id IS NOT DISTINCT FROM (CASE WHEN v_skind = 'point' THEN v_sid END);
    v_same_cl := v_has_cl AND v_cl.serves_item_id IS NOT DISTINCT FROM (CASE WHEN v_skind = 'item' THEN v_sid END) AND v_cl.serves_point_id IS NOT DISTINCT FROM (CASE WHEN v_skind = 'point' THEN v_sid END);
    IF v_same_own OR (v_same_cl AND v_cl.state = 'to_look_at') THEN
      v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'why', 'unchanged'); CONTINUE;
    END IF;
    IF v_same_cl AND v_cl.state = 'dismissed' THEN
      v_skipped := v_skipped || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'why', 'previously_dismissed'); CONTINUE;
    END IF;
    v_exid := CASE WHEN v_has_cl THEN v_cl.id END; v_result := CASE WHEN v_has_own THEN 'beside_yours' ELSE 'proposed' END;
    v_changes := v_changes || jsonb_build_object('slot_id', v_row.id, 'card_name', v_row.card_name, 'oracle_id', v_oid, 'printing_id', v_row.scryfall_id,
      'serves', jsonb_build_object('kind', v_skind, 'id', v_sid), 'result', v_result, 'existing_id', v_exid);
  END LOOP;
  IF jsonb_array_length(v_changes) = 0 THEN PERFORM public._roles_fail('nothing_to_change', jsonb_build_object('deck', v_names->>v_deck::text, 'skipped', v_skipped)); END IF;
  RETURN jsonb_build_object('deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', jsonb_array_length(v_changes), 'changes', v_changes, 'skipped', v_skipped);
END;
$$;

CREATE FUNCTION public._ai_plan_job_link(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_p jsonb := public._ai_job_link_prepare(p_user_id, p_payload); v_pub jsonb; v_before jsonb;
BEGIN
  SELECT jsonb_agg(c - 'existing_id' - 'printing_id') INTO v_pub FROM jsonb_array_elements(v_p->'changes') c;
  v_before := public._ai_deck_counts(p_user_id, (v_p->>'deck_id')::integer);
  RETURN jsonb_build_object('action', 'job_link', 'deck_id', v_p->'deck_id', 'deck_name', v_p->'deck_name', 'n', v_p->'n', 'cards', v_pub,
    'changes', v_pub, 'skipped', v_p->'skipped',
    'preview', jsonb_build_object('cards', v_pub, 'decks', jsonb_build_array(
      jsonb_build_object('deck_id', v_p->'deck_id', 'name', v_p->'deck_name', 'role', 'changes', 'before', v_before, 'after', v_before))));
END;
$$;

CREATE FUNCTION public._ai_execute_job_link(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_p jsonb := public._ai_job_link_prepare(p_user_id, p_payload); v_group uuid := gen_random_uuid(); v_deck integer := (v_p->>'deck_id')::integer;
  v_ch jsonb; v_ex deck_job_serves; v_id bigint; v_before jsonb; v_count integer := 0; v_pub jsonb; v_item bigint; v_point bigint;
BEGIN
  SELECT jsonb_agg(c - 'existing_id' - 'printing_id') INTO v_pub FROM jsonb_array_elements(v_p->'changes') c;
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_p->'changes') LOOP
    v_before := '{}'::jsonb; v_id := NULLIF(v_ch->>'existing_id', '')::bigint;
    v_item := CASE WHEN v_ch#>>'{serves,kind}' = 'item' THEN (v_ch#>>'{serves,id}')::bigint END;
    v_point := CASE WHEN v_ch#>>'{serves,kind}' = 'point' THEN (v_ch#>>'{serves,id}')::bigint END;
    IF v_id IS NOT NULL THEN
      SELECT * INTO v_ex FROM deck_job_serves WHERE id = v_id AND user_id = p_user_id;
      v_before := jsonb_build_object('link_id', v_ex.id, 'serves_kind', CASE WHEN v_ex.serves_item_id IS NOT NULL THEN 'item' ELSE 'point' END,
                                     'serves_id', COALESCE(v_ex.serves_item_id, v_ex.serves_point_id), 'state', v_ex.state, 'batch_id', v_ex.batch_id);
      UPDATE deck_job_serves SET serves_item_id = v_item, serves_point_id = v_point, card_name = v_ch->>'card_name', state = 'to_look_at', batch_id = v_group, updated_at = now()
       WHERE id = v_id AND user_id = p_user_id;
    ELSE
      INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, serves_point_id, proposer, state, batch_id)
      VALUES (p_user_id, v_deck, (v_ch->>'oracle_id')::uuid, v_ch->>'card_name', v_item, v_point, 'claude', 'to_look_at', v_group) RETURNING id INTO v_id;
    END IF;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, oracle_id, printing_id, deck_card_id,
                               before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'job_link', v_deck, v_p->>'deck_name', v_ch->>'card_name', v_ch->>'oracle_id', v_ch->>'printing_id', (v_ch->>'slot_id')::integer,
            v_before, jsonb_build_object('link_id', v_id, 'serves_kind', v_ch#>>'{serves,kind}', 'serves_id', (v_ch#>>'{serves,id}')::bigint, 'state', 'to_look_at', 'result', v_ch->>'result'),
            p_pending_id, p_approved);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('group_id', v_group, 'count', v_count,
    'plan', jsonb_build_object('action', 'job_link', 'deck_id', v_p->'deck_id', 'deck_name', v_p->'deck_name', 'n', v_p->'n', 'cards', v_pub, 'changes', v_pub, 'skipped', v_p->'skipped'));
END;
$$;

CREATE FUNCTION public._ai_blocker_job_link(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_l deck_job_serves;
BEGIN
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
  SELECT * INTO v_l FROM deck_job_serves WHERE id = NULLIF(r.after->>'link_id', '')::bigint AND user_id = p_user_id AND deck_id = r.deck_id;
  IF NOT FOUND OR v_l.proposer <> 'claude' OR v_l.state <> 'to_look_at'
     OR (CASE WHEN v_l.serves_item_id IS NOT NULL THEN 'item' ELSE 'point' END) IS DISTINCT FROM (r.after->>'serves_kind')
     OR COALESCE(v_l.serves_item_id, v_l.serves_point_id) IS DISTINCT FROM (r.after->>'serves_id')::bigint THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'link');
  END IF;
  -- Undoing a rewrite points the link back at its old target; refuse if that target is gone.
  IF r.before <> '{}'::jsonb AND NOT (CASE WHEN r.before->>'serves_kind' = 'item'
        THEN EXISTS (SELECT 1 FROM deck_strategy_items WHERE id = (r.before->>'serves_id')::bigint AND deck_id = r.deck_id)
        ELSE EXISTS (SELECT 1 FROM deck_strategy_points WHERE id = (r.before->>'serves_id')::bigint AND deck_id = r.deck_id) END) THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'link');
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION public._ai_undo_job_link(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r ai_change_log; v_block jsonb; v_ok uuid[] := ARRAY[]::uuid[]; v_left jsonb := '[]'::jsonb; v_n integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' ||
    COALESCE((SELECT min(deck_id) FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'job_link')::text, ''), 0));
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'job_link') THEN PERFORM public._roles_fail('change_not_found'); END IF;
  PERFORM 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone'));
  END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL ORDER BY id LOOP
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NULL THEN v_ok := v_ok || r.id;
    ELSIF p_actor = 'owner' AND v_block->>'code' = 'changed_since' THEN
      v_left := v_left || jsonb_build_object('card', r.card_name, 'deck', r.deck_name, 'what', COALESCE(v_block->>'what', 'link'));
    ELSE RETURN jsonb_build_object('success', false, 'refused', v_block);
    END IF;
  END LOOP;
  IF cardinality(v_ok) = 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo'), 'left_alone', v_left); END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE id = ANY (v_ok) ORDER BY id LOOP
    IF r.before = '{}'::jsonb THEN
      DELETE FROM deck_job_serves WHERE id = (r.after->>'link_id')::bigint AND user_id = p_user_id AND proposer = 'claude';
    ELSE
      UPDATE deck_job_serves SET serves_item_id = CASE WHEN r.before->>'serves_kind' = 'item' THEN (r.before->>'serves_id')::bigint END,
             serves_point_id = CASE WHEN r.before->>'serves_kind' = 'point' THEN (r.before->>'serves_id')::bigint END,
             state = r.before->>'state', batch_id = NULLIF(r.before->>'batch_id', '')::uuid, updated_at = now()
       WHERE id = (r.after->>'link_id')::bigint AND user_id = p_user_id AND proposer = 'claude';
    END IF;
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n, 'left_alone', v_left);
END;
$$;

-- 5. Front doors. The four DB-5 fronts are RENAMED (bodies and grants untouched); a short function with the old name takes their place.
ALTER FUNCTION public._ai_plan(uuid, text, jsonb) RENAME TO _ai_plan_pre_strategy;
ALTER FUNCTION public._ai_execute(uuid, uuid, text, text, jsonb, uuid, boolean) RENAME TO _ai_execute_pre_strategy;
ALTER FUNCTION public._ai_undo_blocker(uuid, ai_change_log) RENAME TO _ai_undo_blocker_pre_strategy;
ALTER FUNCTION public.ai_undo_group(uuid, uuid, text, uuid) RENAME TO ai_undo_group_pre_strategy;

CREATE FUNCTION public._ai_plan(p_user_id uuid, p_action text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'strategy_item' THEN RETURN public._ai_plan_strategy_item(p_user_id, p_payload); END IF;
  IF p_action = 'job_link' THEN RETURN public._ai_plan_job_link(p_user_id, p_payload); END IF;
  RETURN public._ai_plan_pre_strategy(p_user_id, p_action, p_payload);
END;
$$;
CREATE FUNCTION public._ai_execute(p_user_id uuid, p_connection_id uuid, p_client_name text, p_action text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_action = 'strategy_item' THEN RETURN public._ai_execute_strategy_item(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  IF p_action = 'job_link' THEN RETURN public._ai_execute_job_link(p_user_id, p_connection_id, p_client_name, p_payload, p_pending_id, p_approved); END IF;
  RETURN public._ai_execute_pre_strategy(p_user_id, p_connection_id, p_client_name, p_action, p_payload, p_pending_id, p_approved);
END;
$$;
CREATE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF r.kind = 'strategy_item' THEN RETURN public._ai_blocker_strategy_item(p_user_id, r); END IF;
  IF r.kind = 'job_link' THEN RETURN public._ai_blocker_job_link(p_user_id, r); END IF;
  RETURN public._ai_undo_blocker_pre_strategy(p_user_id, r);
END;
$$;
CREATE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_n integer; v_total integer; v_lim jsonb := public._ai_limits();
BEGIN
  SELECT min(kind), count(*) INTO v_kind, v_n FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind IN ('strategy_item', 'job_link');
  IF v_n = 0 THEN RETURN public.ai_undo_group_pre_strategy(p_user_id, p_group_id, p_actor, p_connection_id); END IF;   -- every other kind: unchanged code
  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._roles_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._roles_fail('connection_revoked'); END IF;
    SELECT count(*) INTO v_total FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id;
    IF v_total > (v_lim->>'claude_undo_max')::int OR EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND approved_by_owner) THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only'));
    END IF;
  END IF;
  IF v_kind = 'strategy_item' THEN RETURN public._ai_undo_strategy_item(p_user_id, p_group_id, p_actor); END IF;
  RETURN public._ai_undo_job_link(p_user_id, p_group_id, p_actor);
END;
$$;

-- 6. Owner side (routes call these with the signed-in user's id; service role only). Owner writes are not logged (roles contract S15); each returns the previous row(s) for the 10-second Undo.
-- p_item_id NULL creates; otherwise edits (kind cannot change), and a Claude item or replacement edited by the owner becomes the owner's.
CREATE FUNCTION public.owner_save_strategy_item(p_user_id uuid, p_deck_id integer, p_item_id bigint, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits_strategy(); v_f jsonb; v_prev deck_strategy_items; v_new deck_strategy_items; v_name text; v_kind text; v_counts boolean;
BEGIN
  SELECT name INTO v_name FROM decks WHERE id = p_deck_id AND user_id = p_user_id;
  IF NOT FOUND THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || p_deck_id::text, 0));
  v_f := public._strategy_item_normalize(p_user_id, p_deck_id, p_fields, '{}'::jsonb, v_name, false);
  v_kind := v_f->>'kind';
  IF p_item_id IS NULL THEN v_counts := true;
  ELSE
    SELECT * INTO v_prev FROM deck_strategy_items WHERE id = p_item_id AND user_id = p_user_id AND deck_id = p_deck_id FOR UPDATE;
    IF NOT FOUND THEN PERFORM public._roles_fail('item_not_found'); END IF;
    IF v_prev.kind <> v_kind THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'kind')); END IF;
    v_counts := v_prev.state = 'dismissed' OR v_prev.replaces_item_id IS NOT NULL;   -- becomes a live item of its own
  END IF;
  IF v_counts THEN
    IF (SELECT count(*) FROM deck_strategy_items WHERE user_id = p_user_id AND deck_id = p_deck_id AND kind = v_kind AND state <> 'dismissed' AND replaces_item_id IS NULL) >= (v_lim->>(v_kind || '_max'))::int THEN
      PERFORM public._roles_fail('kind_full', jsonb_build_object('deck', v_name, 'kind', v_kind, 'max', v_lim->(v_kind || '_max')));
    END IF;
    IF (SELECT count(*) FROM deck_strategy_items WHERE user_id = p_user_id AND deck_id = p_deck_id AND state <> 'dismissed' AND replaces_item_id IS NULL) >= (v_lim->>'items_per_deck_max')::int THEN
      PERFORM public._roles_fail('deck_items_full', jsonb_build_object('deck', v_name, 'max', v_lim->'items_per_deck_max'));
    END IF;
  END IF;
  BEGIN
    IF p_item_id IS NULL THEN
      INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, reason, proposer, state) VALUES (p_user_id, p_deck_id, v_kind, v_f->>'statement', v_f->>'reason', 'owner', 'accepted')
      RETURNING * INTO v_new;
    ELSE
      UPDATE deck_strategy_items SET statement = v_f->>'statement', reason = v_f->>'reason', proposer = 'owner', state = 'accepted', batch_id = NULL, replaces_item_id = NULL,
             based_on_oracle_ids = NULL, updated_at = now() WHERE id = p_item_id RETURNING * INTO v_new;
    END IF;
  EXCEPTION WHEN unique_violation THEN PERFORM public._roles_fail('item_exists', jsonb_build_object('statement', v_f->>'statement'));
  END;
  RETURN jsonb_build_object('previous', CASE WHEN p_item_id IS NOT NULL THEN to_jsonb(v_prev) END, 'current', to_jsonb(v_new));
END;
$$;

-- Deletes the item and (by cascade) its links. Claude rewordings that sat beside it are set to dismissed (kept as memory, no longer live) so no kind goes over its limit.
-- Returns {deleted: row, deleted_links: [rows]} so the route can offer the 10-second Undo by re-saving them.
CREATE FUNCTION public.owner_delete_strategy_item(p_user_id uuid, p_deck_id integer, p_item_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row deck_strategy_items; v_links jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_row FROM deck_strategy_items WHERE id = p_item_id AND user_id = p_user_id AND deck_id = p_deck_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('item_not_found'); END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) INTO v_links FROM deck_job_serves l WHERE l.serves_item_id = p_item_id AND l.user_id = p_user_id;
  UPDATE deck_strategy_items SET state = 'dismissed', updated_at = now() WHERE replaces_item_id = p_item_id AND user_id = p_user_id AND proposer = 'claude' AND state = 'to_look_at';
  DELETE FROM deck_strategy_items WHERE id = p_item_id AND user_id = p_user_id;
  RETURN jsonb_build_object('deleted', to_jsonb(v_row), 'deleted_links', v_links);
END;
$$;

-- Accept or dismiss a waiting Claude row. Accepting a normal item makes it the owner's in place. Accepting a REPLACEMENT writes its wording into the owner's item
-- (same id) and deletes the replacement row. Returns {previous, current} (and previous_target for a replacement).
CREATE FUNCTION public.owner_decide_strategy_item(p_user_id uuid, p_deck_id integer, p_item_id bigint, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev deck_strategy_items; v_tg deck_strategy_items; v_new deck_strategy_items;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'dismiss') THEN PERFORM public._roles_fail('bad_decision', jsonb_build_object('decision', p_decision)); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_prev FROM deck_strategy_items WHERE id = p_item_id AND user_id = p_user_id AND deck_id = p_deck_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('item_not_found'); END IF;
  IF v_prev.proposer <> 'claude' OR v_prev.state <> 'to_look_at' THEN PERFORM public._roles_fail('no_proposal'); END IF;
  IF p_decision = 'dismiss' THEN
    UPDATE deck_strategy_items SET state = 'dismissed', updated_at = now() WHERE id = p_item_id RETURNING * INTO v_new;
    RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'current', to_jsonb(v_new));
  END IF;
  BEGIN
    IF v_prev.replaces_item_id IS NOT NULL THEN
      SELECT * INTO v_tg FROM deck_strategy_items WHERE id = v_prev.replaces_item_id AND user_id = p_user_id AND deck_id = p_deck_id FOR UPDATE;
      IF NOT FOUND THEN PERFORM public._roles_fail('item_not_found'); END IF;
      DELETE FROM deck_strategy_items WHERE id = v_prev.id;
      UPDATE deck_strategy_items SET statement = v_prev.statement, reason = v_prev.reason, updated_at = now() WHERE id = v_tg.id RETURNING * INTO v_new;
      RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'previous_target', to_jsonb(v_tg), 'current', to_jsonb(v_new));
    END IF;
    UPDATE deck_strategy_items SET proposer = 'owner', state = 'accepted', batch_id = NULL, replaces_item_id = NULL, based_on_oracle_ids = NULL, updated_at = now()
     WHERE id = p_item_id RETURNING * INTO v_new;
  EXCEPTION WHEN unique_violation THEN PERFORM public._roles_fail('item_exists', jsonb_build_object('statement', v_prev.statement));
  END;
  RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'current', to_jsonb(v_new));
END;
$$;

-- "Accept all": waiting Claude items (not rewordings of an owner's item; those need one decision each). At least one scope.
CREATE FUNCTION public.owner_accept_strategy_item_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer; v_beside integer;
BEGIN
  IF p_deck_id IS NULL AND p_batch_id IS NULL THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'scope')); END IF;
  IF p_deck_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN
    PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id));
  END IF;
  SELECT count(*) INTO v_beside FROM deck_strategy_items WHERE user_id = p_user_id AND proposer = 'claude' AND state = 'to_look_at' AND replaces_item_id IS NOT NULL
     AND (p_deck_id IS NULL OR deck_id = p_deck_id) AND (p_batch_id IS NULL OR batch_id = p_batch_id);
  UPDATE deck_strategy_items SET proposer = 'owner', state = 'accepted', batch_id = NULL, based_on_oracle_ids = NULL, updated_at = now()
   WHERE user_id = p_user_id AND proposer = 'claude' AND state = 'to_look_at' AND replaces_item_id IS NULL
     AND (p_deck_id IS NULL OR deck_id = p_deck_id) AND (p_batch_id IS NULL OR batch_id = p_batch_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('accepted', v_n, 'left_beside', v_beside);
END;
$$;

-- Reader: every row for the deck (dismissed too, so Claude does not re-propose them). The app drops dismissed ones.
CREATE FUNCTION public.get_deck_strategy_items(p_user_id uuid, p_deck_id integer) RETURNS SETOF public.deck_strategy_items
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  RETURN QUERY SELECT * FROM deck_strategy_items i WHERE i.user_id = p_user_id AND i.deck_id = p_deck_id ORDER BY i.id;
END;
$$;

-- Owner sets or clears a card's link. p_action: set | clear. p_serves_kind: item | point. The card must have a job. Returns {previous, current}.
CREATE FUNCTION public.owner_set_job_link(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_action text, p_serves_kind text DEFAULT NULL, p_serves_id bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slot record; v_prev deck_job_serves; v_new deck_job_serves; v_item bigint; v_point bigint;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('set', 'clear') THEN PERFORM public._roles_fail('bad_action', jsonb_build_object('action', p_action)); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  SELECT dc.id, dc.card_name INTO v_slot FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s JOIN deck_cards dc ON dc.id = s.slot_id WHERE s.oracle_id = p_oracle_id ORDER BY dc.id LIMIT 1;
  IF NOT FOUND THEN PERFORM public._roles_fail('card_not_in_deck', jsonb_build_object('oracle_id', p_oracle_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_prev FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner';
  IF p_action = 'set' THEN
    IF p_serves_kind IS NULL OR p_serves_kind NOT IN ('item', 'point') OR p_serves_id IS NULL THEN PERFORM public._roles_fail('bad_serves'); END IF;
    IF NOT public._job_effective(p_user_id, p_deck_id, p_oracle_id) THEN PERFORM public._roles_fail('no_job', jsonb_build_object('card', v_slot.card_name)); END IF;
    IF p_serves_kind = 'item' THEN
      IF NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE id = p_serves_id AND user_id = p_user_id AND deck_id = p_deck_id AND state <> 'dismissed' AND replaces_item_id IS NULL) THEN
        PERFORM public._roles_fail('serves_not_found', jsonb_build_object('deck_id', p_deck_id));
      END IF;
      v_item := p_serves_id;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE id = p_serves_id AND user_id = p_user_id AND deck_id = p_deck_id AND state <> 'dismissed') THEN
        PERFORM public._roles_fail('serves_not_found', jsonb_build_object('deck_id', p_deck_id));
      END IF;
      v_point := p_serves_id;
    END IF;
    INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, serves_point_id, proposer, state)
    VALUES (p_user_id, p_deck_id, p_oracle_id, v_slot.card_name, v_item, v_point, 'owner', 'accepted')
    ON CONFLICT (user_id, deck_id, oracle_id, proposer) DO UPDATE SET card_name = EXCLUDED.card_name, serves_item_id = EXCLUDED.serves_item_id, serves_point_id = EXCLUDED.serves_point_id, updated_at = now()
    RETURNING * INTO v_new;
    DELETE FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude' AND state = 'to_look_at'
       AND serves_item_id IS NOT DISTINCT FROM v_item AND serves_point_id IS NOT DISTINCT FROM v_point;
    RETURN jsonb_build_object('previous', CASE WHEN v_prev.id IS NOT NULL THEN to_jsonb(v_prev) END, 'current', to_jsonb(v_new));
  END IF;
  DELETE FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner';
  UPDATE deck_job_serves SET state = 'dismissed', updated_at = now() WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude' AND state = 'to_look_at';
  RETURN jsonb_build_object('previous', CASE WHEN v_prev.id IS NOT NULL THEN to_jsonb(v_prev) END, 'current', NULL);
END;
$$;

CREATE FUNCTION public.owner_decide_job_link(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev deck_job_serves; v_own deck_job_serves; v_new deck_job_serves;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'dismiss') THEN PERFORM public._roles_fail('bad_decision', jsonb_build_object('decision', p_decision)); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_item:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_prev FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('no_proposal'); END IF;
  IF v_prev.state <> 'to_look_at' THEN PERFORM public._roles_fail('no_proposal'); END IF;
  IF p_decision = 'dismiss' THEN
    UPDATE deck_job_serves SET state = 'dismissed', updated_at = now() WHERE id = v_prev.id RETURNING * INTO v_new;
    RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'current', to_jsonb(v_new));
  END IF;
  SELECT * INTO v_own FROM deck_job_serves WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner' FOR UPDATE;
  IF FOUND THEN DELETE FROM deck_job_serves WHERE id = v_own.id; END IF;   -- accepting a link that sat beside the owner's replaces it
  UPDATE deck_job_serves SET proposer = 'owner', state = 'accepted', batch_id = NULL, updated_at = now() WHERE id = v_prev.id RETURNING * INTO v_new;
  RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'previous_owner', CASE WHEN v_own.id IS NOT NULL THEN to_jsonb(v_own) END, 'current', to_jsonb(v_new));
END;
$$;

-- "Accept all" for links: only links that are not beside an owner's link (those need one decision each).
CREATE FUNCTION public.owner_accept_job_link_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer; v_beside integer;
BEGIN
  IF p_deck_id IS NULL AND p_batch_id IS NULL THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'scope')); END IF;
  IF p_deck_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN
    PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id));
  END IF;
  SELECT count(*) INTO v_beside FROM deck_job_serves c WHERE c.user_id = p_user_id AND c.proposer = 'claude' AND c.state = 'to_look_at'
     AND (p_deck_id IS NULL OR c.deck_id = p_deck_id) AND (p_batch_id IS NULL OR c.batch_id = p_batch_id)
     AND EXISTS (SELECT 1 FROM deck_job_serves o WHERE o.user_id = c.user_id AND o.deck_id = c.deck_id AND o.oracle_id = c.oracle_id AND o.proposer = 'owner');
  UPDATE deck_job_serves c SET proposer = 'owner', state = 'accepted', batch_id = NULL, updated_at = now()
   WHERE c.user_id = p_user_id AND c.proposer = 'claude' AND c.state = 'to_look_at' AND (p_deck_id IS NULL OR c.deck_id = p_deck_id) AND (p_batch_id IS NULL OR c.batch_id = p_batch_id)
     AND NOT EXISTS (SELECT 1 FROM deck_job_serves o WHERE o.user_id = c.user_id AND o.deck_id = c.deck_id AND o.oracle_id = c.oracle_id AND o.proposer = 'owner');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('accepted', v_n, 'left_beside', v_beside);
END;
$$;

-- Reader: one row per card in the deck that has an owner or Claude link row. effective_* is filled only while the card has an effective job (contract 3.2).
CREATE FUNCTION public.get_deck_job_links(p_user_id uuid, p_deck_id integer)
RETURNS TABLE (oracle_id uuid, card_name text, owner_kind text, owner_id bigint, claude_kind text, claude_id bigint, claude_state text,
               effective_kind text, effective_id bigint, effective_from text, beside boolean, batch_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  RETURN QUERY
  WITH slots AS (SELECT s.oracle_id AS oid, min(s.slot_id) AS sid FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s WHERE s.oracle_id IS NOT NULL GROUP BY s.oracle_id),
  x AS (
    SELECT sl.oid, (SELECT dc.card_name FROM deck_cards dc WHERE dc.id = sl.sid) AS cname, o AS orow, c AS crow, public._job_effective(p_user_id, p_deck_id, sl.oid) AS has_job
      FROM slots sl
      LEFT JOIN deck_job_serves o ON o.user_id = p_user_id AND o.deck_id = p_deck_id AND o.oracle_id = sl.oid AND o.proposer = 'owner'
      LEFT JOIN deck_job_serves c ON c.user_id = p_user_id AND c.deck_id = p_deck_id AND c.oracle_id = sl.oid AND c.proposer = 'claude'
     WHERE o.id IS NOT NULL OR c.id IS NOT NULL)
  SELECT x.oid, x.cname,
         CASE WHEN (x.orow).id IS NULL THEN NULL WHEN (x.orow).serves_item_id IS NOT NULL THEN 'item' ELSE 'point' END,
         COALESCE((x.orow).serves_item_id, (x.orow).serves_point_id),
         CASE WHEN (x.crow).id IS NULL THEN NULL WHEN (x.crow).serves_item_id IS NOT NULL THEN 'item' ELSE 'point' END,
         COALESCE((x.crow).serves_item_id, (x.crow).serves_point_id),
         (x.crow).state,
         CASE WHEN NOT x.has_job THEN NULL WHEN (x.orow).id IS NOT NULL THEN CASE WHEN (x.orow).serves_item_id IS NOT NULL THEN 'item' ELSE 'point' END
              WHEN (x.crow).state = 'to_look_at' THEN CASE WHEN (x.crow).serves_item_id IS NOT NULL THEN 'item' ELSE 'point' END END,
         CASE WHEN NOT x.has_job THEN NULL WHEN (x.orow).id IS NOT NULL THEN COALESCE((x.orow).serves_item_id, (x.orow).serves_point_id)
              WHEN (x.crow).state = 'to_look_at' THEN COALESCE((x.crow).serves_item_id, (x.crow).serves_point_id) END,
         CASE WHEN NOT x.has_job THEN NULL WHEN (x.orow).id IS NOT NULL THEN 'you' WHEN (x.crow).state = 'to_look_at' THEN 'claude' END,
         x.has_job AND (x.orow).id IS NOT NULL AND (x.crow).id IS NOT NULL AND (x.crow).state = 'to_look_at'
           AND ((x.orow).serves_item_id IS DISTINCT FROM (x.crow).serves_item_id OR (x.orow).serves_point_id IS DISTINCT FROM (x.crow).serves_point_id),
         (x.crow).batch_id
    FROM x ORDER BY x.cname, x.oid;
END;
$$;

-- "Strategy changed since Claude set the numbers": derived from update times, nothing stored (contract section 11).
CREATE FUNCTION public.get_deck_strategy_staleness(p_user_id uuid, p_deck_id integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claude timestamptz; v_changed timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  SELECT max(t.updated_at) INTO v_claude FROM deck_health_targets t WHERE t.user_id = p_user_id AND t.deck_id = p_deck_id AND t.set_by = 'claude';
  SELECT greatest(
    (SELECT max(s.updated_at) FROM deck_strategy s WHERE s.deck_id = p_deck_id AND s.user_id = p_user_id),
    (SELECT max(i.updated_at) FROM deck_strategy_items i WHERE i.user_id = p_user_id AND i.deck_id = p_deck_id AND i.state <> 'dismissed'),
    (SELECT max(p.updated_at) FROM deck_strategy_points p WHERE p.user_id = p_user_id AND p.deck_id = p_deck_id AND p.state <> 'dismissed')) INTO v_changed;
  RETURN jsonb_build_object('claude_set_at', v_claude, 'strategy_changed_at', v_changed, 'stale', v_claude IS NOT NULL AND v_changed IS NOT NULL AND v_changed > v_claude);
END;
$$;

-- 7. Privileges: service_role ONLY for every function this file creates; the four fronts get the grants the DB-5 ones had (the renamed ones keep theirs).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._ai_limits_strategy()', 'public._strategy_kind_label(text)', 'public._job_effective(uuid,integer,uuid)',
    'public._strategy_item_normalize(uuid,integer,jsonb,jsonb,text,boolean)', 'public._ai_strategy_item_prepare(uuid,jsonb)',
    'public._ai_plan_strategy_item(uuid,jsonb)', 'public._ai_execute_strategy_item(uuid,uuid,text,jsonb,uuid,boolean)',
    'public._ai_blocker_strategy_item(uuid,ai_change_log)', 'public._ai_undo_strategy_item(uuid,uuid,text)',
    'public._ai_job_link_prepare(uuid,jsonb)', 'public._ai_plan_job_link(uuid,jsonb)', 'public._ai_execute_job_link(uuid,uuid,text,jsonb,uuid,boolean)',
    'public._ai_blocker_job_link(uuid,ai_change_log)', 'public._ai_undo_job_link(uuid,uuid,text)',
    'public._ai_plan(uuid,text,jsonb)', 'public._ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)', 'public._ai_undo_blocker(uuid,ai_change_log)',
    'public.ai_undo_group(uuid,uuid,text,uuid)',
    'public.owner_save_strategy_item(uuid,integer,bigint,jsonb)', 'public.owner_delete_strategy_item(uuid,integer,bigint)',
    'public.owner_decide_strategy_item(uuid,integer,bigint,text)', 'public.owner_accept_strategy_item_proposals(uuid,integer,uuid)',
    'public.get_deck_strategy_items(uuid,integer)',
    'public.owner_set_job_link(uuid,integer,uuid,text,text,bigint)', 'public.owner_decide_job_link(uuid,integer,uuid,text)',
    'public.owner_accept_job_link_proposals(uuid,integer,uuid)', 'public.get_deck_job_links(uuid,integer)', 'public.get_deck_strategy_staleness(uuid,integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
COMMIT;
