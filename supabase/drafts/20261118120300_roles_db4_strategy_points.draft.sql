-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: card roles and deck jobs (CC-26), database change DB-4 of 4. Author: Architect, 2026-11-18.
-- Contract: docs/oracle/contracts/card-roles-and-deck-jobs.md (sections 3.4, 5.4, 6, 11). Test: docs/oracle/reports/evidence/roles-db/test_db4.sh
-- Depends on: DB-1 and DB-2 (20261118120000, 20261118120100). Does NOT need DB-3; the two may be applied in either order.
--
-- What this does (and only this):
--   1. deck_strategy_points: one row per user, deck and sentence ("Artifacts count as ramp in this deck"), covering one card type or a list of cards
--      (oracle ids), optionally with an effect on the health counts (counts as / does not count as ramp, card advantage, interaction).
--      A strategy point is the ONLY thing that can change a health count (contract S12). Deck health itself stores nothing.
--      One row per sentence per deck (unique on lower(btrim(statement))), so a dismissed row is also the memory of the dismissal (S6).
--      RLS: a user sees only their own rows; signed-in users get no write grant; every write goes through a function (service role only).
--   2. Replaces the four strategy-point steps that DB-2 left as stubs (_ai_plan_ / _ai_execute_ / _ai_undo_ / _ai_blocker_strategy_point) with real bodies:
--      Claude proposes up to 10 points per request (max 30 per deck); each point is ONE log row and counts as ONE toward the 120 limit; Undo as for roles.
--   3. Adds the owner-side functions: owner_save_strategy_point, owner_delete_strategy_point, owner_decide_strategy_point,
--      owner_accept_strategy_point_proposals, get_deck_strategy_points, and two private helpers (_strategy_point_normalize, _ai_strategy_point_prepare).
-- Not destructive: one new table, new functions, four function bodies replaced. No existing row is changed.
-- Reversible: supabase/drafts/20261118120300_roles_db4_strategy_points.rollback.sql (restores the stubs; refuses while the table holds rows or strategy_point log rows exist).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.deck_strategy_points') IS NOT NULL THEN RAISE EXCEPTION 'roles_db4 already applied (deck_strategy_points exists)'; END IF;
  IF to_regprocedure('public._ai_limits_roles()') IS NULL OR to_regprocedure('public._ai_plan_strategy_point(uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'apply roles_db2 first'; END IF;
  IF position('strategy_points_not_available' IN pg_get_functiondef('public._ai_plan_strategy_point(uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roles_db4 already applied (the strategy point steps are no longer stubs)';
  END IF;
END $$;

CREATE TABLE public.deck_strategy_points (
  id                bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  deck_id           integer     NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  statement         text        NOT NULL CHECK (statement = btrim(statement) AND char_length(statement) BETWEEN 1 AND 200),
  covers_kind       text        NOT NULL CHECK (covers_kind IN ('card_type','cards')),
  card_type         text        CHECK (card_type IN ('artifact','creature','enchantment','instant','sorcery','land','planeswalker','battle')),
  covers_oracle_ids uuid[],     -- ORACLE ids of the covered cards (not printings), sorted, 1 to 100 entries
  effect_kind       text        CHECK (effect_kind IN ('counts_as','does_not_count_as')),
  effect_group      text        CHECK (effect_group IN ('ramp','card_advantage','interaction')),
  reason            text        CHECK (reason IS NULL OR char_length(reason) <= 200),
  proposer          text        NOT NULL CHECK (proposer IN ('owner','claude')),
  state             text        NOT NULL CHECK (state IN ('accepted','to_look_at','dismissed')),
  batch_id          uuid,       -- ai_change_log.group_id of the Claude request that wrote it; Claude rows only. No FK.
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_strategy_points_proposer_state CHECK ((proposer = 'owner' AND state = 'accepted') OR (proposer = 'claude' AND state IN ('to_look_at','dismissed'))),
  CONSTRAINT deck_strategy_points_claude_only_batch CHECK (proposer = 'claude' OR batch_id IS NULL),
  CONSTRAINT deck_strategy_points_covers CHECK (
    (covers_kind = 'card_type' AND card_type IS NOT NULL AND covers_oracle_ids IS NULL)
    OR (covers_kind = 'cards' AND card_type IS NULL AND covers_oracle_ids IS NOT NULL AND cardinality(covers_oracle_ids) BETWEEN 1 AND 100)),
  CONSTRAINT deck_strategy_points_effect_pair CHECK ((effect_kind IS NULL) = (effect_group IS NULL))   -- both NULL = the point changes no count
);
CREATE UNIQUE INDEX deck_strategy_points_one_sentence ON public.deck_strategy_points (user_id, deck_id, lower(btrim(statement)));
CREATE INDEX deck_strategy_points_looking ON public.deck_strategy_points (user_id, deck_id) WHERE state = 'to_look_at';
CREATE INDEX deck_strategy_points_batch ON public.deck_strategy_points (user_id, batch_id) WHERE batch_id IS NOT NULL;
COMMENT ON TABLE public.deck_strategy_points IS 'A deck''s strategy points (sentence, what it covers, optional effect on health counts). Owner rows and Claude rows. Written only by service-role functions.';
COMMENT ON COLUMN public.deck_strategy_points.covers_oracle_ids IS 'oracle_ids (the cards), NOT scryfall_ids (printings). D-003.';
COMMENT ON COLUMN public.deck_strategy_points.batch_id IS 'ai_change_log.group_id of the Claude request that wrote this row (not a key).';
ALTER TABLE public.deck_strategy_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_strategy_points_select_own ON public.deck_strategy_points FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_strategy_points FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_strategy_points TO authenticated;
GRANT ALL ON public.deck_strategy_points TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Private helper: validate one point and return it in stored form.
-- Input: {statement, covers:{card_type} | {cards:[{id,card_name}]} | {oracle_ids:[uuid]}, effect?:{kind,group}, reason?}   (id = deck_cards.id; oracle_ids is the owner route's form)
-- Output: {statement, covers_kind, card_type, covers_oracle_ids (sorted array or null), effect_kind, effect_group, reason}
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public._strategy_point_normalize(p_user_id uuid, p_deck_id integer, p_point jsonb, p_slot_map jsonb, p_deck_name text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits_roles(); v_st text; v_cov jsonb; v_type text; v_ids uuid[]; v_el jsonb; v_row record; v_oid uuid; v_eff jsonb; v_ek text; v_eg text; v_reason text;
BEGIN
  IF jsonb_typeof(p_point) IS DISTINCT FROM 'object' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'points')); END IF;
  IF jsonb_typeof(p_point->'statement') IS DISTINCT FROM 'string' THEN PERFORM public._roles_fail('bad_statement'); END IF;
  v_st := regexp_replace(p_point->>'statement', '^\s+|\s+$', '', 'g');
  IF v_st = '' OR char_length(v_st) > (v_lim->>'statement_max_chars')::int THEN PERFORM public._roles_fail('bad_statement'); END IF;
  v_cov := p_point->'covers';
  IF jsonb_typeof(v_cov) IS DISTINCT FROM 'object' THEN PERFORM public._roles_fail('bad_covers'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_cov)) <> 1 OR NOT (v_cov ?| ARRAY['card_type', 'cards', 'oracle_ids']) THEN PERFORM public._roles_fail('bad_covers'); END IF;
  IF v_cov ? 'card_type' THEN
    IF jsonb_typeof(v_cov->'card_type') IS DISTINCT FROM 'string' OR NOT ((v_cov->>'card_type') = ANY (ARRAY['artifact','creature','enchantment','instant','sorcery','land','planeswalker','battle'])) THEN
      PERFORM public._roles_fail('unknown_card_type', jsonb_build_object('type', v_cov->'card_type'));
    END IF;
    v_type := v_cov->>'card_type'; v_ids := NULL;
  ELSIF v_cov ? 'cards' THEN
    IF jsonb_typeof(v_cov->'cards') IS DISTINCT FROM 'array' OR jsonb_array_length(v_cov->'cards') NOT BETWEEN 1 AND (v_lim->>'point_cards_max')::int THEN PERFORM public._roles_fail('bad_covers'); END IF;
    v_ids := ARRAY[]::uuid[];
    FOR v_el IN SELECT * FROM jsonb_array_elements(v_cov->'cards') LOOP
      IF jsonb_typeof(v_el) <> 'object' OR COALESCE(v_el->>'id', '') !~ '^[0-9]+$' THEN PERFORM public._roles_fail('bad_covers'); END IF;
      SELECT dc.id, dc.card_name INTO v_row FROM deck_cards dc WHERE dc.id = (v_el->>'id')::integer AND dc.deck_id = p_deck_id AND dc.user_id = p_user_id;
      IF NOT FOUND OR v_row.card_name IS DISTINCT FROM (v_el->>'card_name') THEN
        PERFORM public._roles_fail('slot_not_found', jsonb_build_object('card', v_el->>'card_name', 'deck', p_deck_name));
      END IF;
      v_oid := NULLIF(p_slot_map->>(v_row.id::text), '')::uuid;
      IF v_oid IS NULL THEN PERFORM public._roles_fail('card_not_identified', jsonb_build_object('card', v_row.card_name)); END IF;
      v_ids := v_ids || v_oid;
    END LOOP;
    v_ids := ARRAY(SELECT DISTINCT x FROM unnest(v_ids) x ORDER BY x); v_type := NULL;
  ELSE   -- oracle_ids (the owner's route, which already holds oracle ids)
    IF jsonb_typeof(v_cov->'oracle_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(v_cov->'oracle_ids') NOT BETWEEN 1 AND (v_lim->>'point_cards_max')::int THEN PERFORM public._roles_fail('bad_covers'); END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_cov->'oracle_ids') e WHERE jsonb_typeof(e) <> 'string' OR (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      PERFORM public._roles_fail('bad_covers');
    END IF;
    v_ids := ARRAY(SELECT DISTINCT (e #>> '{}')::uuid FROM jsonb_array_elements(v_cov->'oracle_ids') e ORDER BY 1);
    IF EXISTS (SELECT 1 FROM unnest(v_ids) i WHERE NOT EXISTS (SELECT 1 FROM ref_printings rp WHERE rp.oracle_id = i)) THEN PERFORM public._roles_fail('unknown_card'); END IF;
    v_type := NULL;
  END IF;
  v_eff := p_point->'effect';
  IF v_eff IS NULL OR jsonb_typeof(v_eff) = 'null' THEN v_ek := NULL; v_eg := NULL;
  ELSE
    IF jsonb_typeof(v_eff) <> 'object' OR (v_eff->>'kind') IS NULL OR (v_eff->>'group') IS NULL
       OR NOT ((v_eff->>'kind') IN ('counts_as', 'does_not_count_as')) OR NOT ((v_eff->>'group') IN ('ramp', 'card_advantage', 'interaction')) THEN
      PERFORM public._roles_fail('bad_effect');
    END IF;
    v_ek := v_eff->>'kind'; v_eg := v_eff->>'group';
  END IF;
  v_reason := NULL;
  IF p_point ? 'reason' AND jsonb_typeof(p_point->'reason') <> 'null' THEN
    IF jsonb_typeof(p_point->'reason') <> 'string' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'reason')); END IF;
    v_reason := NULLIF(regexp_replace(p_point->>'reason', '^\s+|\s+$', '', 'g'), '');
    IF char_length(COALESCE(v_reason, '')) > (v_lim->>'reason_max_chars')::int THEN PERFORM public._roles_fail('reason_too_long'); END IF;
  END IF;
  RETURN jsonb_build_object('statement', v_st, 'covers_kind', CASE WHEN v_type IS NOT NULL THEN 'card_type' ELSE 'cards' END, 'card_type', v_type,
                            'covers_oracle_ids', to_jsonb(v_ids), 'effect_kind', v_ek, 'effect_group', v_eg, 'reason', v_reason);
END;
$$;

-- Private: validate a whole request under the locks and say what would change. Used by the plan (dry run, queue, apply) and by execute (re-plan on approve).
-- Input: {deck_id, points:[ ... as above ... ]}.  Returns {deck_id, deck_name, n, changes:[{... fields, existing_id}], skipped:[{statement, why}]}
CREATE FUNCTION public._ai_strategy_point_prepare(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lim jsonb := public._ai_limits_roles(); v_deck integer; v_names jsonb; v_map jsonb; v_pt jsonb; v_f jsonb; v_ex deck_strategy_points; v_changes jsonb := '[]'::jsonb; v_skipped jsonb := '[]'::jsonb;
  v_seen text[] := ARRAY[]::text[]; v_live integer; v_new integer := 0; v_same boolean; v_exid bigint;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR COALESCE(p_payload->>'deck_id', '') !~ '^[0-9]+$' THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'deck_id')); END IF;
  v_deck := (p_payload->>'deck_id')::integer;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_point:' || p_user_id::text || ':' || v_deck::text, 0));
  v_names := public._ai_lock_decks(p_user_id, ARRAY[v_deck]);
  IF jsonb_typeof(p_payload->'points') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'points') = 0 THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'points')); END IF;
  IF jsonb_array_length(p_payload->'points') > (v_lim->>'strategy_points_per_request_max')::int THEN
    PERFORM public._roles_fail('too_many_points_in_request', jsonb_build_object('max', v_lim->'strategy_points_per_request_max'));
  END IF;
  SELECT COALESCE(jsonb_object_agg(s.slot_id::text, s.oracle_id), '{}'::jsonb) INTO v_map FROM public.deck_slot_oracle_ids(p_user_id, v_deck) s;
  SELECT count(*) INTO v_live FROM deck_strategy_points WHERE user_id = p_user_id AND deck_id = v_deck AND state <> 'dismissed';

  FOR v_pt IN SELECT * FROM jsonb_array_elements(p_payload->'points') LOOP
    v_f := public._strategy_point_normalize(p_user_id, v_deck, v_pt, v_map, v_names->>v_deck::text);
    IF lower(v_f->>'statement') = ANY (v_seen) THEN
      v_skipped := v_skipped || jsonb_build_object('statement', v_f->>'statement', 'why', 'already_exists'); CONTINUE;
    END IF;
    v_seen := v_seen || lower(v_f->>'statement');
    SELECT * INTO v_ex FROM deck_strategy_points WHERE user_id = p_user_id AND deck_id = v_deck AND lower(btrim(statement)) = lower(v_f->>'statement');
    v_exid := NULL;
    IF FOUND THEN
      v_exid := v_ex.id;
      IF v_ex.proposer = 'owner' THEN
        v_skipped := v_skipped || jsonb_build_object('statement', v_f->>'statement', 'why', 'already_exists'); CONTINUE;
      END IF;
      v_same := v_ex.covers_kind = v_f->>'covers_kind' AND v_ex.card_type IS NOT DISTINCT FROM (v_f->>'card_type')
                AND to_jsonb(v_ex.covers_oracle_ids) IS NOT DISTINCT FROM NULLIF(v_f->'covers_oracle_ids', 'null'::jsonb)
                AND v_ex.effect_kind IS NOT DISTINCT FROM (v_f->>'effect_kind') AND v_ex.effect_group IS NOT DISTINCT FROM (v_f->>'effect_group')
                AND v_ex.reason IS NOT DISTINCT FROM (v_f->>'reason');
      IF v_same THEN
        v_skipped := v_skipped || jsonb_build_object('statement', v_f->>'statement', 'why', CASE WHEN v_ex.state = 'dismissed' THEN 'previously_dismissed' ELSE 'already_exists' END); CONTINUE;
      END IF;
      IF v_ex.state = 'dismissed' THEN v_new := v_new + 1; END IF;   -- a different version of a dismissed point comes back as a live one
    ELSE
      v_new := v_new + 1;
    END IF;
    IF v_live + v_new > (v_lim->>'strategy_points_per_deck_max')::int THEN
      PERFORM public._roles_fail('too_many_strategy_points', jsonb_build_object('deck', v_names->>v_deck::text, 'max', v_lim->'strategy_points_per_deck_max'));
    END IF;
    v_changes := v_changes || jsonb_build_object('statement', v_f->>'statement', 'covers_kind', v_f->>'covers_kind', 'card_type', v_f->>'card_type',
      'covers_count', CASE WHEN v_f->>'covers_kind' = 'cards' THEN jsonb_array_length(v_f->'covers_oracle_ids') END,
      'effect', CASE WHEN v_f->>'effect_kind' IS NOT NULL THEN jsonb_build_object('kind', v_f->>'effect_kind', 'group', v_f->>'effect_group') END,
      'result', 'proposed', 'fields', v_f, 'existing_id', v_exid);
  END LOOP;
  IF jsonb_array_length(v_changes) = 0 THEN PERFORM public._roles_fail('nothing_to_change', jsonb_build_object('deck', v_names->>v_deck::text, 'skipped', v_skipped)); END IF;
  RETURN jsonb_build_object('deck_id', v_deck, 'deck_name', v_names->>v_deck::text, 'n', jsonb_array_length(v_changes), 'changes', v_changes, 'skipped', v_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_plan_strategy_point(p_user_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_p jsonb := public._ai_strategy_point_prepare(p_user_id, p_payload); v_pub jsonb; v_before jsonb;
BEGIN
  SELECT jsonb_agg(c - 'fields' - 'existing_id') INTO v_pub FROM jsonb_array_elements(v_p->'changes') c;
  v_before := public._ai_deck_counts(p_user_id, (v_p->>'deck_id')::integer);
  RETURN jsonb_build_object('action', 'strategy_point', 'deck_id', v_p->'deck_id', 'deck_name', v_p->'deck_name', 'n', v_p->'n', 'cards', v_pub,
    'changes', v_pub, 'skipped', v_p->'skipped',
    'preview', jsonb_build_object('cards', v_pub, 'decks', jsonb_build_array(
      jsonb_build_object('deck_id', v_p->'deck_id', 'name', v_p->'deck_name', 'role', 'changes', 'before', v_before, 'after', v_before))));
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_execute_strategy_point(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_p jsonb := public._ai_strategy_point_prepare(p_user_id, p_payload); v_group uuid := gen_random_uuid(); v_deck integer := (v_p->>'deck_id')::integer;
  v_ch jsonb; v_f jsonb; v_ex deck_strategy_points; v_id bigint; v_before jsonb; v_count integer := 0; v_pub jsonb;
BEGIN
  SELECT jsonb_agg(c - 'fields' - 'existing_id') INTO v_pub FROM jsonb_array_elements(v_p->'changes') c;
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_p->'changes') LOOP
    v_f := v_ch->'fields'; v_before := '{}'::jsonb; v_id := NULLIF(v_ch->>'existing_id', '')::bigint;
    IF v_id IS NOT NULL THEN
      SELECT * INTO v_ex FROM deck_strategy_points WHERE id = v_id AND user_id = p_user_id;
      v_before := jsonb_build_object('statement', v_ex.statement, 'covers_kind', v_ex.covers_kind, 'card_type', v_ex.card_type, 'covers_oracle_ids', to_jsonb(v_ex.covers_oracle_ids),
        'effect_kind', v_ex.effect_kind, 'effect_group', v_ex.effect_group, 'reason', v_ex.reason, 'state', v_ex.state, 'batch_id', v_ex.batch_id, 'point_id', v_ex.id);
      UPDATE deck_strategy_points SET statement = v_f->>'statement', covers_kind = v_f->>'covers_kind', card_type = v_f->>'card_type',
             covers_oracle_ids = CASE WHEN jsonb_typeof(v_f->'covers_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'covers_oracle_ids')::uuid) END,
             effect_kind = v_f->>'effect_kind', effect_group = v_f->>'effect_group', reason = v_f->>'reason', state = 'to_look_at', batch_id = v_group, updated_at = now()
       WHERE id = v_id AND user_id = p_user_id;
    ELSE
      INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, covers_oracle_ids, effect_kind, effect_group, reason, proposer, state, batch_id)
      VALUES (p_user_id, v_deck, v_f->>'statement', v_f->>'covers_kind', v_f->>'card_type',
              CASE WHEN jsonb_typeof(v_f->'covers_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'covers_oracle_ids')::uuid) END,
              v_f->>'effect_kind', v_f->>'effect_group', v_f->>'reason', 'claude', 'to_look_at', v_group)
      RETURNING id INTO v_id;
    END IF;
    INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, before, after, pending_id, approved_by_owner)
    VALUES (p_user_id, v_group, p_connection_id, p_client_name, 'strategy_point', v_deck, v_p->>'deck_name', left(v_f->>'statement', 60), v_before,
            v_f || jsonb_build_object('point_id', v_id, 'state', 'to_look_at'), p_pending_id, p_approved);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('group_id', v_group, 'count', v_count,
    'plan', jsonb_build_object('action', 'strategy_point', 'deck_id', v_p->'deck_id', 'deck_name', v_p->'deck_name', 'n', v_p->'n', 'cards', v_pub, 'changes', v_pub, 'skipped', v_p->'skipped'));
END;
$$;

-- Blocker (a pure read): NULL = this log row can be undone. "Is the point still exactly what Claude left (same fields, still waiting)?"
CREATE OR REPLACE FUNCTION public._ai_blocker_strategy_point(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_p deck_strategy_points; v_now jsonb;
BEGIN
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
  SELECT * INTO v_p FROM deck_strategy_points WHERE id = NULLIF(r.after->>'point_id', '')::bigint AND user_id = p_user_id AND deck_id = r.deck_id;
  IF NOT FOUND OR v_p.proposer <> 'claude' OR v_p.state <> 'to_look_at' THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'point');
  END IF;
  v_now := jsonb_build_object('statement', v_p.statement, 'covers_kind', v_p.covers_kind, 'card_type', v_p.card_type, 'covers_oracle_ids', to_jsonb(v_p.covers_oracle_ids),
                              'effect_kind', v_p.effect_kind, 'effect_group', v_p.effect_group, 'reason', v_p.reason);
  IF v_now IS DISTINCT FROM (r.after - 'point_id' - 'state') THEN
    RETURN jsonb_build_object('code', 'changed_since', 'card', r.card_name, 'deck', r.deck_name, 'what', 'point');
  END IF;
  RETURN NULL;
END;
$$;

-- Undo of one strategy_point group. Same rules as roles: Claude all or nothing; owner restores what is still as Claude left it and reports the rest.
CREATE OR REPLACE FUNCTION public._ai_undo_strategy_point(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r ai_change_log; v_block jsonb; v_ok uuid[] := ARRAY[]::uuid[]; v_left jsonb := '[]'::jsonb; v_n integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_point:' || p_user_id::text || ':' || COALESCE((SELECT min(deck_id) FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id), 0)::text, 0));
  PERFORM 1 FROM decks WHERE user_id = p_user_id AND id IN (SELECT deck_id FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND deck_id IS NOT NULL) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND kind = 'strategy_point') THEN PERFORM public._roles_fail('change_not_found'); END IF;
  PERFORM 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL) THEN
    RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'already_undone'));
  END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE user_id = p_user_id AND group_id = p_group_id AND undone_at IS NULL ORDER BY id LOOP
    v_block := public._ai_undo_blocker(p_user_id, r);
    IF v_block IS NULL THEN v_ok := v_ok || r.id;
    ELSIF p_actor = 'owner' AND v_block->>'code' IN ('changed_since', 'slot_gone') THEN
      v_left := v_left || jsonb_build_object('card', r.card_name, 'deck', r.deck_name, 'what', COALESCE(v_block->>'what', 'point'));
    ELSE RETURN jsonb_build_object('success', false, 'refused', v_block);
    END IF;
  END LOOP;
  IF cardinality(v_ok) = 0 THEN RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'nothing_to_undo'), 'left_alone', v_left); END IF;
  FOR r IN SELECT * FROM ai_change_log WHERE id = ANY (v_ok) ORDER BY id LOOP
    IF r.before = '{}'::jsonb THEN
      DELETE FROM deck_strategy_points WHERE id = (r.after->>'point_id')::bigint AND user_id = p_user_id;
    ELSE
      UPDATE deck_strategy_points SET statement = r.before->>'statement', covers_kind = r.before->>'covers_kind', card_type = r.before->>'card_type',
             covers_oracle_ids = CASE WHEN jsonb_typeof(r.before->'covers_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(r.before->'covers_oracle_ids')::uuid) END,
             effect_kind = r.before->>'effect_kind', effect_group = r.before->>'effect_group', reason = r.before->>'reason', state = r.before->>'state',
             batch_id = NULLIF(r.before->>'batch_id', '')::uuid, updated_at = now()
       WHERE id = (r.after->>'point_id')::bigint AND user_id = p_user_id;
    END IF;
    UPDATE ai_change_log SET undone_at = now(), undone_by = p_actor WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'undone', v_n, 'left_alone', v_left);
END;
$$;

-- Owner writes. Not logged (contract S15). Each returns the previous row so the route can offer the 10-second Undo.
-- p_point_id NULL creates; otherwise edits that point, and a Claude point edited by the owner becomes the owner's ("Change").
CREATE FUNCTION public.owner_save_strategy_point(p_user_id uuid, p_deck_id integer, p_point_id bigint, p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_names jsonb; v_map jsonb; v_f jsonb; v_prev deck_strategy_points; v_new deck_strategy_points; v_live integer; v_lim jsonb := public._ai_limits_roles();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_point:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT COALESCE(jsonb_object_agg(s.slot_id::text, s.oracle_id), '{}'::jsonb) INTO v_map FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s;
  v_f := public._strategy_point_normalize(p_user_id, p_deck_id, p_fields, v_map, (SELECT name FROM decks WHERE id = p_deck_id));
  SELECT count(*) INTO v_live FROM deck_strategy_points WHERE user_id = p_user_id AND deck_id = p_deck_id AND state <> 'dismissed';
  IF p_point_id IS NULL THEN
    IF v_live >= (v_lim->>'strategy_points_per_deck_max')::int THEN PERFORM public._roles_fail('too_many_strategy_points', jsonb_build_object('max', v_lim->'strategy_points_per_deck_max')); END IF;
    BEGIN
      INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, covers_oracle_ids, effect_kind, effect_group, reason, proposer, state)
      VALUES (p_user_id, p_deck_id, v_f->>'statement', v_f->>'covers_kind', v_f->>'card_type',
              CASE WHEN jsonb_typeof(v_f->'covers_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'covers_oracle_ids')::uuid) END,
              v_f->>'effect_kind', v_f->>'effect_group', v_f->>'reason', 'owner', 'accepted') RETURNING * INTO v_new;
    EXCEPTION WHEN unique_violation THEN PERFORM public._roles_fail('point_exists', jsonb_build_object('statement', v_f->>'statement'));
    END;
    RETURN jsonb_build_object('previous', NULL, 'current', to_jsonb(v_new));
  END IF;
  SELECT * INTO v_prev FROM deck_strategy_points WHERE id = p_point_id AND user_id = p_user_id AND deck_id = p_deck_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('point_not_found'); END IF;
  IF v_prev.state = 'dismissed' AND v_live >= (v_lim->>'strategy_points_per_deck_max')::int THEN PERFORM public._roles_fail('too_many_strategy_points', jsonb_build_object('max', v_lim->'strategy_points_per_deck_max')); END IF;
  BEGIN
    UPDATE deck_strategy_points SET statement = v_f->>'statement', covers_kind = v_f->>'covers_kind', card_type = v_f->>'card_type',
           covers_oracle_ids = CASE WHEN jsonb_typeof(v_f->'covers_oracle_ids') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(v_f->'covers_oracle_ids')::uuid) END,
           effect_kind = v_f->>'effect_kind', effect_group = v_f->>'effect_group', reason = v_f->>'reason', proposer = 'owner', state = 'accepted', batch_id = NULL, updated_at = now()
     WHERE id = p_point_id RETURNING * INTO v_new;
  EXCEPTION WHEN unique_violation THEN PERFORM public._roles_fail('point_exists', jsonb_build_object('statement', v_f->>'statement'));
  END;
  RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'current', to_jsonb(v_new));
END;
$$;

CREATE FUNCTION public.owner_delete_strategy_point(p_user_id uuid, p_deck_id integer, p_point_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row deck_strategy_points;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_point:' || p_user_id::text || ':' || p_deck_id::text, 0));
  DELETE FROM deck_strategy_points WHERE id = p_point_id AND user_id = p_user_id AND deck_id = p_deck_id RETURNING * INTO v_row;
  IF NOT FOUND THEN PERFORM public._roles_fail('point_not_found'); END IF;
  RETURN jsonb_build_object('deleted', to_jsonb(v_row));
END;
$$;

CREATE FUNCTION public.owner_decide_strategy_point(p_user_id uuid, p_deck_id integer, p_point_id bigint, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev deck_strategy_points; v_new deck_strategy_points;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'dismiss') THEN PERFORM public._roles_fail('bad_decision', jsonb_build_object('decision', p_decision)); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('strategy_point:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_prev FROM deck_strategy_points WHERE id = p_point_id AND user_id = p_user_id AND deck_id = p_deck_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('point_not_found'); END IF;
  IF v_prev.proposer <> 'claude' OR v_prev.state <> 'to_look_at' THEN PERFORM public._roles_fail('no_proposal'); END IF;
  IF p_decision = 'accept' THEN
    UPDATE deck_strategy_points SET proposer = 'owner', state = 'accepted', batch_id = NULL, updated_at = now() WHERE id = p_point_id RETURNING * INTO v_new;
  ELSE
    UPDATE deck_strategy_points SET state = 'dismissed', updated_at = now() WHERE id = p_point_id RETURNING * INTO v_new;
  END IF;
  RETURN jsonb_build_object('previous', to_jsonb(v_prev), 'current', to_jsonb(v_new));
END;
$$;

CREATE FUNCTION public.owner_accept_strategy_point_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF p_deck_id IS NULL AND p_batch_id IS NULL THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'scope')); END IF;
  IF p_deck_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN
    PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id));
  END IF;
  UPDATE deck_strategy_points SET proposer = 'owner', state = 'accepted', batch_id = NULL, updated_at = now()
   WHERE user_id = p_user_id AND proposer = 'claude' AND state = 'to_look_at' AND (p_deck_id IS NULL OR deck_id = p_deck_id) AND (p_batch_id IS NULL OR batch_id = p_batch_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('accepted', v_n);
END;
$$;

-- Reader: every row for the deck (dismissed ones too, so Claude does not re-propose them). Health and the editor filter out state 'dismissed'.
CREATE FUNCTION public.get_deck_strategy_points(p_user_id uuid, p_deck_id integer) RETURNS SETOF public.deck_strategy_points
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  RETURN QUERY SELECT * FROM deck_strategy_points p WHERE p.user_id = p_user_id AND p.deck_id = p_deck_id ORDER BY p.id;
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._strategy_point_normalize(uuid,integer,jsonb,jsonb,text)', 'public._ai_strategy_point_prepare(uuid,jsonb)',
    'public._ai_plan_strategy_point(uuid,jsonb)', 'public._ai_execute_strategy_point(uuid,uuid,text,jsonb,uuid,boolean)',
    'public._ai_undo_strategy_point(uuid,uuid,text)', 'public._ai_blocker_strategy_point(uuid,ai_change_log)',
    'public.owner_save_strategy_point(uuid,integer,bigint,jsonb)', 'public.owner_delete_strategy_point(uuid,integer,bigint)',
    'public.owner_decide_strategy_point(uuid,integer,bigint,text)', 'public.owner_accept_strategy_point_proposals(uuid,integer,uuid)',
    'public.get_deck_strategy_points(uuid,integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
COMMIT;
