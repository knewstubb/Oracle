-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: card roles and deck jobs (CC-26), database change DB-3 of 4. Author: Architect, 2026-11-18.
-- Contract: docs/oracle/contracts/card-roles-and-deck-jobs.md (sections 3.3, 5.3, 6, 11). Test: docs/oracle/reports/evidence/roles-db/test_db3.sh
-- Depends on: DB-1 and DB-2 (20261118120000, 20261118120100). Does not need DB-4; the two may be applied in either order.
--
-- What this does (and only this):
--   1. deck_card_jobs: one row per user, deck, card (oracle id) and proposer: the card's job and the reason it is in the deck.
--      Keyed by deck + card identity, NOT by the deck slot, so a re-import does not lose the job (contract S7). A deleted deck takes its jobs (CASCADE).
--      RLS: a user sees only their own rows; signed-in users get no write grant, every write goes through a function (service role only).
--   2. Replaces the four job hooks that DB-2 left as stubs (_ai_label_job_plan / _apply / _restore / _unchanged) with real bodies, so Claude's
--      propose_card_labels can propose a job for a card in the SAME request as its roles, counted once, one log row (contract S9).
--   3. Adds the owner-side functions: owner_set_card_job, owner_decide_card_job, owner_accept_job_proposals, the readers get_deck_card_jobs and
--      deck_job_names, and the private helper _job_canonical_name (case-insensitive spelling match, same rule as set_card_category).
-- A job never changes the health counts (contract S12). No dismissals table: a dismissed job stays as the Claude row with state 'dismissed' (S6).
-- Not destructive: one new table, new functions, four function bodies replaced. No existing row is changed.
-- Reversible: supabase/drafts/20261118120200_roles_db3_deck_card_jobs.rollback.sql (restores the stubs; refuses while the table holds rows or job log rows exist).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.deck_card_jobs') IS NOT NULL THEN RAISE EXCEPTION 'roles_db3 already applied (deck_card_jobs exists)'; END IF;
  IF to_regprocedure('public._ai_limits_roles()') IS NULL OR to_regprocedure('public._ai_label_job_plan(uuid,integer,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'apply roles_db2 first'; END IF;
  IF position('jobs_not_available' IN pg_get_functiondef('public._ai_label_job_plan(uuid,integer,uuid,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roles_db3 already applied (the job hooks are no longer stubs)';
  END IF;
END $$;

CREATE TABLE public.deck_card_jobs (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  deck_id    integer     NOT NULL REFERENCES public.decks (id) ON DELETE CASCADE,
  oracle_id  uuid        NOT NULL,   -- ORACLE id of the card (not a printing / scryfall_id). Not the deck slot id.
  card_name  text        NOT NULL,   -- snapshot, for reading
  job        text        CHECK (job IS NULL OR (job = btrim(job) AND char_length(job) BETWEEN 1 AND 40)),   -- free text. NULL on an OWNER row = "no job, on purpose"
  reason     text        CHECK (reason IS NULL OR char_length(reason) <= 200),
  proposer   text        NOT NULL CHECK (proposer IN ('owner','claude')),
  state      text        NOT NULL CHECK (state IN ('accepted','to_look_at','dismissed')),
  batch_id   uuid,       -- ai_change_log.group_id of the Claude request that wrote it; Claude rows only. No FK.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deck_card_jobs_proposer_state CHECK ((proposer = 'owner' AND state = 'accepted') OR (proposer = 'claude' AND state IN ('to_look_at','dismissed'))),
  CONSTRAINT deck_card_jobs_claude_has_job CHECK (proposer = 'owner' OR job IS NOT NULL),
  CONSTRAINT deck_card_jobs_claude_only_batch CHECK (proposer = 'claude' OR batch_id IS NULL),
  CONSTRAINT deck_card_jobs_one_per_proposer UNIQUE (user_id, deck_id, oracle_id, proposer)
);
CREATE INDEX deck_card_jobs_looking ON public.deck_card_jobs (user_id, deck_id) WHERE state = 'to_look_at';
CREATE INDEX deck_card_jobs_batch ON public.deck_card_jobs (user_id, batch_id) WHERE batch_id IS NOT NULL;
COMMENT ON TABLE public.deck_card_jobs IS 'A card''s job in one deck (free text) and why it is there. Owner rows and Claude rows. Written only by service-role functions.';
COMMENT ON COLUMN public.deck_card_jobs.oracle_id IS 'oracle_id (the card), NOT a scryfall_id (a printing) and NOT deck_cards.id. D-003.';
COMMENT ON COLUMN public.deck_card_jobs.batch_id IS 'ai_change_log.group_id of the Claude request that wrote this row (not a key).';
ALTER TABLE public.deck_card_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_card_jobs_select_own ON public.deck_card_jobs FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.deck_card_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.deck_card_jobs TO authenticated;
GRANT ALL ON public.deck_card_jobs TO service_role;

-- Spelling of a job name in one deck: the starting seven first (case-insensitive), then the most used spelling already in the deck, else as given.
CREATE FUNCTION public._job_canonical_name(p_user_id uuid, p_deck_id integer, p_name text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n text := regexp_replace(COALESCE(p_name, ''), '^\s+|\s+$', '', 'g'); v_seven text[] := ARRAY['Engine','Enabler','Payoff','Win condition','Combo piece','Commander support','Flex']; v_hit text;
BEGIN
  SELECT s INTO v_hit FROM unnest(v_seven) s WHERE lower(s) = lower(v_n);
  IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;
  SELECT j.job INTO v_hit FROM deck_card_jobs j WHERE j.user_id = p_user_id AND j.deck_id = p_deck_id AND j.job IS NOT NULL AND lower(j.job) = lower(v_n)
   GROUP BY j.job ORDER BY count(*) DESC, min(j.id), j.job LIMIT 1;
  RETURN COALESCE(v_hit, v_n);
END;
$$;

-- The four hooks (same signatures and parameter names as the DB-2 stubs).
CREATE OR REPLACE FUNCTION public._ai_label_job_plan(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_name text; v_reason text; v_o record; v_c record; v_has_o boolean; v_has_c boolean; v_ejob text; v_ereason text; v_before jsonb; v_res text; v_why text;
BEGIN
  v_name := public._job_canonical_name(p_user_id, p_deck_id, p_request->>'name');
  v_reason := NULLIF(regexp_replace(COALESCE(p_request->>'reason', ''), '^\s+|\s+$', '', 'g'), '');
  SELECT job, reason INTO v_o FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner';
  v_has_o := FOUND;
  SELECT job, reason, state, batch_id INTO v_c FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude';
  v_has_c := FOUND;
  IF v_has_o THEN v_ejob := v_o.job; v_ereason := v_o.reason;
  ELSIF v_has_c AND v_c.state = 'to_look_at' THEN v_ejob := v_c.job; v_ereason := v_c.reason;
  END IF;
  v_before := CASE WHEN v_has_c THEN jsonb_build_object('job', v_c.job, 'reason', v_c.reason, 'state', v_c.state, 'batch_id', v_c.batch_id) END;
  IF v_ejob IS NOT NULL AND lower(v_ejob) = lower(v_name) AND v_ereason IS NOT DISTINCT FROM v_reason THEN
    v_res := 'skipped'; v_why := 'unchanged';
  ELSIF v_has_c AND v_c.state = 'to_look_at' AND lower(v_c.job) = lower(v_name) AND v_c.reason IS NOT DISTINCT FROM v_reason THEN
    v_res := 'skipped'; v_why := 'unchanged';   -- Claude's identical proposal is already waiting (beside an owner value): not written twice
  ELSIF v_has_c AND v_c.state = 'dismissed' AND lower(v_c.job) = lower(v_name) AND v_c.reason IS NOT DISTINCT FROM v_reason THEN
    v_res := 'skipped'; v_why := 'previously_dismissed';
  ELSE
    v_res := CASE WHEN v_has_o THEN 'beside_yours' ELSE 'proposed' END;
  END IF;
  RETURN jsonb_build_object('result', v_res, 'why', v_why, 'job', v_name, 'reason', v_reason, 'before', v_before);
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_label_job_apply(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb, p_batch_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state, batch_id)
  VALUES (p_user_id, p_deck_id, p_oracle_id, COALESCE(p_after->>'card_name', ''), p_after->>'job', NULLIF(p_after->>'reason', ''), 'claude', 'to_look_at', p_batch_id)
  ON CONFLICT (user_id, deck_id, oracle_id, proposer) DO UPDATE
    SET card_name = EXCLUDED.card_name, job = EXCLUDED.job, reason = EXCLUDED.reason, state = 'to_look_at', batch_id = EXCLUDED.batch_id, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_label_job_restore(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_before jsonb, p_after jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_row jsonb := p_before->'row'; v_n integer;
BEGIN
  IF v_row IS NULL OR jsonb_typeof(v_row) = 'null' THEN
    DELETE FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude';
  ELSE
    UPDATE deck_card_jobs SET job = v_row->>'job', reason = NULLIF(v_row->>'reason', ''), state = v_row->>'state', batch_id = NULLIF(v_row->>'batch_id', '')::uuid, updated_at = now()
     WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude';
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public._ai_label_job_unchanged(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'
                    AND state = 'to_look_at' AND job = p_after->>'job' AND reason IS NOT DISTINCT FROM NULLIF(p_after->>'reason', ''))
$$;

-- Owner writes. p_action: set | clear_job | clear. Never writes a Claude row (except deleting a waiting one holding the identical job). Returns previous for the 10-second Undo.
CREATE FUNCTION public.owner_set_card_job(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_action text, p_job text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slot record; v_job text; v_reason text; v_prev jsonb; v_cur jsonb; v_lim jsonb := public._ai_limits_roles();
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('set', 'clear_job', 'clear') THEN PERFORM public._roles_fail('bad_action', jsonb_build_object('action', p_action)); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  SELECT dc.id, dc.card_name, dc.categories INTO v_slot FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s JOIN deck_cards dc ON dc.id = s.slot_id
   WHERE s.oracle_id = p_oracle_id ORDER BY dc.id LIMIT 1;
  IF NOT FOUND THEN PERFORM public._roles_fail('card_not_in_deck', jsonb_build_object('oracle_id', p_oracle_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('deck_job:' || p_user_id::text || ':' || p_deck_id::text, 0));
  v_prev := jsonb_build_object(
    'owner_set', EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_reason', (SELECT reason FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'claude_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'),
    'claude_state', (SELECT state FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'));
  IF p_action = 'set' THEN
    IF public._ai_has_maybe_marker(v_slot.categories) THEN PERFORM public._roles_fail('slot_in_maybeboard', jsonb_build_object('card', v_slot.card_name)); END IF;
    v_job := regexp_replace(COALESCE(p_job, ''), '^\s+|\s+$', '', 'g');
    IF v_job = '' OR char_length(v_job) > (v_lim->>'job_name_max_chars')::int THEN PERFORM public._roles_fail('bad_job_name'); END IF;
    v_reason := NULLIF(regexp_replace(COALESCE(p_reason, ''), '^\s+|\s+$', '', 'g'), '');
    IF char_length(COALESCE(v_reason, '')) > (v_lim->>'reason_max_chars')::int THEN PERFORM public._roles_fail('reason_too_long'); END IF;
    v_job := public._job_canonical_name(p_user_id, p_deck_id, v_job);
    INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state) VALUES (p_user_id, p_deck_id, p_oracle_id, v_slot.card_name, v_job, v_reason, 'owner', 'accepted')
    ON CONFLICT (user_id, deck_id, oracle_id, proposer) DO UPDATE SET card_name = EXCLUDED.card_name, job = EXCLUDED.job, reason = EXCLUDED.reason, updated_at = now();
    DELETE FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude' AND state = 'to_look_at' AND lower(job) = lower(v_job);
  ELSIF p_action = 'clear_job' THEN
    INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state) VALUES (p_user_id, p_deck_id, p_oracle_id, v_slot.card_name, NULL, NULL, 'owner', 'accepted')
    ON CONFLICT (user_id, deck_id, oracle_id, proposer) DO UPDATE SET job = NULL, reason = NULL, updated_at = now();
  ELSE
    DELETE FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner';
  END IF;
  v_cur := jsonb_build_object(
    'owner_set', EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_reason', (SELECT reason FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'claude_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'),
    'claude_state', (SELECT state FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'));
  RETURN jsonb_build_object('previous', v_prev, 'current', v_cur);
END;
$$;

CREATE FUNCTION public.owner_decide_card_job(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c deck_card_jobs; v_prev jsonb; v_cur jsonb;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accept', 'dismiss') THEN PERFORM public._roles_fail('bad_decision', jsonb_build_object('decision', p_decision)); END IF;
  IF NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('deck_job:' || p_user_id::text || ':' || p_deck_id::text, 0));
  SELECT * INTO v_c FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude' AND state = 'to_look_at' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._roles_fail('no_proposal'); END IF;
  v_prev := jsonb_build_object(
    'owner_set', EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_reason', (SELECT reason FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'claude_job', v_c.job, 'claude_state', v_c.state);
  IF p_decision = 'accept' THEN
    INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state) VALUES (p_user_id, p_deck_id, p_oracle_id, v_c.card_name, v_c.job, v_c.reason, 'owner', 'accepted')
    ON CONFLICT (user_id, deck_id, oracle_id, proposer) DO UPDATE SET card_name = EXCLUDED.card_name, job = EXCLUDED.job, reason = EXCLUDED.reason, updated_at = now();
    DELETE FROM deck_card_jobs WHERE id = v_c.id;
  ELSE
    UPDATE deck_card_jobs SET state = 'dismissed', updated_at = now() WHERE id = v_c.id;
  END IF;
  v_cur := jsonb_build_object(
    'owner_set', EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'owner_reason', (SELECT reason FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'owner'),
    'claude_job', (SELECT job FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'),
    'claude_state', (SELECT state FROM deck_card_jobs WHERE user_id = p_user_id AND deck_id = p_deck_id AND oracle_id = p_oracle_id AND proposer = 'claude'));
  RETURN jsonb_build_object('previous', v_prev, 'current', v_cur);
END;
$$;

CREATE FUNCTION public.owner_accept_job_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_n integer := 0;
BEGIN
  IF p_deck_id IS NULL AND p_batch_id IS NULL THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'scope')); END IF;
  IF p_deck_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id) THEN
    PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_card_label:' || p_user_id::text, 0));
  FOR v_c IN SELECT * FROM deck_card_jobs WHERE user_id = p_user_id AND proposer = 'claude' AND state = 'to_look_at'
                AND (p_deck_id IS NULL OR deck_id = p_deck_id) AND (p_batch_id IS NULL OR batch_id = p_batch_id) ORDER BY id FOR UPDATE
  LOOP
    INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state) VALUES (p_user_id, v_c.deck_id, v_c.oracle_id, v_c.card_name, v_c.job, v_c.reason, 'owner', 'accepted')
    ON CONFLICT (user_id, deck_id, oracle_id, proposer) DO UPDATE SET card_name = EXCLUDED.card_name, job = EXCLUDED.job, reason = EXCLUDED.reason, updated_at = now();
    DELETE FROM deck_card_jobs WHERE id = v_c.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('accepted', v_n);
END;
$$;

-- Readers. Only cards CURRENTLY in the deck are returned (a job left behind by a removed card shows nowhere; it returns if the card is re-added).
CREATE FUNCTION public.get_deck_card_jobs(p_user_id uuid, p_deck_id integer)
RETURNS TABLE (oracle_id uuid, card_name text, owner_job text, owner_reason text, owner_set boolean, claude_job text, claude_reason text, claude_state text,
               effective_job text, effective_reason text, effective_from text, beside boolean, batch_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  RETURN QUERY
  WITH cur AS (SELECT s.oracle_id, min(dc.card_name) AS card_name FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s JOIN deck_cards dc ON dc.id = s.slot_id
                WHERE s.oracle_id IS NOT NULL GROUP BY s.oracle_id)
  SELECT cur.oracle_id, cur.card_name, o.job, o.reason, (o.id IS NOT NULL), c.job, c.reason, c.state,
         CASE WHEN o.id IS NOT NULL THEN o.job WHEN c.state = 'to_look_at' THEN c.job END,
         CASE WHEN o.id IS NOT NULL THEN o.reason WHEN c.state = 'to_look_at' THEN c.reason END,
         CASE WHEN o.id IS NOT NULL THEN 'owner' WHEN c.state = 'to_look_at' THEN 'claude' END,
         COALESCE(o.id IS NOT NULL AND c.state = 'to_look_at' AND c.job IS DISTINCT FROM o.job, false),
         c.batch_id
    FROM cur
    LEFT JOIN deck_card_jobs o ON o.user_id = p_user_id AND o.deck_id = p_deck_id AND o.oracle_id = cur.oracle_id AND o.proposer = 'owner'
    LEFT JOIN deck_card_jobs c ON c.user_id = p_user_id AND c.deck_id = p_deck_id AND c.oracle_id = cur.oracle_id AND c.proposer = 'claude'
   WHERE o.id IS NOT NULL OR c.id IS NOT NULL
   ORDER BY cur.card_name, cur.oracle_id;
END;
$$;

-- The picker list for a deck: the seven starting names, then other names in use (not dismissed), most used first.
CREATE FUNCTION public.deck_job_names(p_user_id uuid, p_deck_id integer) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_seven text[] := ARRAY['Engine','Enabler','Payoff','Win condition','Combo piece','Commander support','Flex']; v_more text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  WITH u AS (SELECT j.job, count(*) AS c FROM deck_card_jobs j WHERE j.user_id = p_user_id AND j.deck_id = p_deck_id AND j.job IS NOT NULL AND j.state <> 'dismissed' GROUP BY j.job),
       canon AS (SELECT DISTINCT ON (lower(u.job)) lower(u.job) AS k, u.job FROM u ORDER BY lower(u.job), u.c DESC, u.job),
       tot AS (SELECT lower(u.job) AS k, sum(u.c) AS s FROM u GROUP BY lower(u.job))
  SELECT array_agg(canon.job ORDER BY tot.s DESC, canon.job) INTO v_more FROM canon JOIN tot ON tot.k = canon.k
   WHERE NOT (canon.k = ANY (SELECT lower(x) FROM unnest(v_seven) x));
  RETURN v_seven || COALESCE(v_more, ARRAY[]::text[]);
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._job_canonical_name(uuid,integer,text)', 'public.owner_set_card_job(uuid,integer,uuid,text,text,text)',
    'public.owner_decide_card_job(uuid,integer,uuid,text)', 'public.owner_accept_job_proposals(uuid,integer,uuid)',
    'public.get_deck_card_jobs(uuid,integer)', 'public.deck_job_names(uuid,integer)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
COMMIT;
