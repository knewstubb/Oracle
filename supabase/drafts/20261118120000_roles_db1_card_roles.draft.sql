-- DRAFT. NOT APPLIED. Needs owner approval.
-- Task: card roles (CC-26), database change DB-1 of 4. Author: Architect, 2026-11-18.
-- Contract: docs/oracle/contracts/card-roles-and-deck-jobs.md (sections 3.1, 3.2, 4, 5.1, 11). Test: docs/oracle/reports/evidence/roles-db/test_db1.sh
-- Depends on: the base schema only (decks, deck_cards, user_cards, ref_printings, auth.users). No ai_* object. Nothing else in this feature is needed first.
--
-- What this does (and only this):
--   1. ref_card_roles: ONE shared list of card roles, keyed by oracle_id, with NO user attached. Signed-in users may read it;
--      only the service role may write it. It ships EMPTY (contract S3: Claude's first proposals go to the personal layer, never here).
--   2. user_card_roles: each user's own layer on top (add or remove a role; owner rows and Claude-proposed rows). RLS: a user sees only their own rows.
--      Signed-in users get NO insert/update/delete grant: every write goes through the functions below (service role only).
--   3. Five functions, all SECURITY DEFINER, all taking p_user_id and filtering every read and write by it, all executable by service_role only:
--        _roles_fail                  (private: raise a coded refusal, same shape as _ai_fail)
--        deck_slot_oracle_ids         (one query: deck slot -> oracle id, by printing, else by the user's own card name)
--        _slot_oracle_id              (the same for one slot)
--        get_effective_card_roles     (the three layers merged, contract section 4; the only reader health and the card window use)
--        owner_set_card_role          (add / remove / clear one role on one card for one user; returns the previous value for the 10-second Undo)
-- Not destructive: two new tables, five new functions. No existing table, column, function or row is touched. No DELETE of existing data.
-- Identifier rule (D-003): every oracle_id column and argument holds an ORACLE id (the card), never a printing (scryfall_id).
-- Reversible: supabase/drafts/20261118120000_roles_db1_card_roles.rollback.sql (refuses while the tables hold rows).
-- Writes are atomic: every owner write is one function call = one transaction; a failure writes nothing.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_card_roles') IS NOT NULL OR to_regclass('public.ref_card_roles') IS NOT NULL THEN
    RAISE EXCEPTION 'roles_db1 already applied (a roles table exists)';
  END IF;
  IF to_regclass('public.decks') IS NULL OR to_regclass('public.deck_cards') IS NULL OR to_regclass('public.user_cards') IS NULL
     OR to_regclass('public.ref_printings') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'wrong base: decks, deck_cards, user_cards, ref_printings and auth.users must exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.ref_printings'::regclass AND attname = 'oracle_id' AND atttypid = 'uuid'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'wrong base: ref_printings.oracle_id must be uuid';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Shared baseline. No user_id column on purpose.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.ref_card_roles (
  oracle_id  uuid        NOT NULL,   -- ORACLE id of the card (not a printing / scryfall_id)
  role       text        NOT NULL CHECK (role IN ('ramp','fixing','card_draw','card_selection','tutor','targeted_removal','board_wipe',
                                                  'counterspell','protection','recursion','graveyard_hate','stax_tax','hand_disruption')),
  proposer   text        NOT NULL CHECK (proposer IN ('system','claude')),   -- system = text-reading rules; claude = written only by the approved slice-8 service-role job
  basis      text        CHECK (basis IS NULL OR char_length(basis) <= 200),  -- where it came from, e.g. 'text_rules:v2'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (oracle_id, role)
);
CREATE INDEX ref_card_roles_role ON public.ref_card_roles (role);   -- "all cards with this role"
COMMENT ON TABLE public.ref_card_roles IS 'Shared role baseline, keyed by oracle_id, no user attached. Readable by signed-in users, written only by the service role. Ships empty.';
COMMENT ON COLUMN public.ref_card_roles.oracle_id IS 'oracle_id (the card), NOT a scryfall_id (a printing). D-003.';

ALTER TABLE public.ref_card_roles ENABLE ROW LEVEL SECURITY;   -- never FORCE (definer functions keep working)
CREATE POLICY ref_card_roles_read_signed_in ON public.ref_card_roles FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.ref_card_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ref_card_roles TO authenticated;
GRANT ALL ON public.ref_card_roles TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Personal layer.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE public.user_card_roles (
  id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  oracle_id           uuid        NOT NULL,   -- ORACLE id (not a printing)
  role                text        NOT NULL CHECK (role IN ('ramp','fixing','card_draw','card_selection','tutor','targeted_removal','board_wipe',
                                                           'counterspell','protection','recursion','graveyard_hate','stax_tax','hand_disruption')),
  effect              text        NOT NULL CHECK (effect IN ('add','remove')),   -- remove = hide a baseline role for this user
  proposer            text        NOT NULL CHECK (proposer IN ('owner','claude')),
  state               text        NOT NULL CHECK (state IN ('accepted','to_look_at','dismissed')),
  proposed_in_deck_id integer     REFERENCES public.decks (id) ON DELETE SET NULL,   -- the deck Claude was working in; Claude rows only
  batch_id            uuid,       -- ai_change_log.group_id of the request that wrote the row; Claude rows only. No FK (a group id is not a key)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_card_roles_proposer_state CHECK ((proposer = 'owner' AND state = 'accepted') OR (proposer = 'claude' AND state IN ('to_look_at','dismissed'))),
  CONSTRAINT user_card_roles_claude_only_fields CHECK (proposer = 'claude' OR (proposed_in_deck_id IS NULL AND batch_id IS NULL)),
  CONSTRAINT user_card_roles_one_per_proposer UNIQUE (user_id, oracle_id, role, proposer)
);
CREATE INDEX user_card_roles_looking ON public.user_card_roles (user_id, proposed_in_deck_id) WHERE state = 'to_look_at';   -- the proposals bar
CREATE INDEX user_card_roles_batch ON public.user_card_roles (user_id, batch_id) WHERE batch_id IS NOT NULL;                -- accept or undo by batch
COMMENT ON TABLE public.user_card_roles IS 'Per-user role layer over ref_card_roles. Owner rows (accepted) and Claude rows (to_look_at / dismissed). Written only by service-role functions.';
COMMENT ON COLUMN public.user_card_roles.oracle_id IS 'oracle_id (the card), NOT a scryfall_id (a printing). D-003.';
COMMENT ON COLUMN public.user_card_roles.batch_id IS 'ai_change_log.group_id of the Claude request that wrote this row (not a key).';

ALTER TABLE public.user_card_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_card_roles_select_own ON public.user_card_roles FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.user_card_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_card_roles TO authenticated;      -- no insert/update/delete for signed-in users: functions only
GRANT ALL ON public.user_card_roles TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------------------------------------------
CREATE FUNCTION public._roles_fail(p_code text, p_detail jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', p_code USING ERRCODE = 'P0001', DETAIL = p_detail::text;   -- same shape as _ai_fail
END;
$$;

-- One query for the whole deck. printing first (deck_cards.scryfall_id is text; a bad value gives NULL, never an error),
-- else the OWNER'S OWN user_cards by lower(card_name) when exactly one distinct oracle id results. Never other users' cards.
CREATE FUNCTION public.deck_slot_oracle_ids(p_user_id uuid, p_deck_id integer)
RETURNS TABLE (slot_id integer, oracle_id uuid, resolved_by text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.user_id = p_user_id) THEN
    PERFORM public._roles_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id));
  END IF;
  RETURN QUERY
  SELECT dc.id,
         COALESCE(rp.oracle_id, nm.oid),
         CASE WHEN rp.oracle_id IS NOT NULL THEN 'printing' WHEN nm.oid IS NOT NULL THEN 'name' END
    FROM deck_cards dc
    LEFT JOIN ref_printings rp
           ON rp.scryfall_id = CASE WHEN dc.scryfall_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN dc.scryfall_id::uuid END
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(DISTINCT lower(uc.oracle_id)) = 1 AND bool_and(uc.oracle_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
                  THEN min(lower(uc.oracle_id))::uuid END AS oid
        FROM user_cards uc WHERE uc.user_id = p_user_id AND lower(uc.card_name) = lower(dc.card_name)) nm ON rp.oracle_id IS NULL
   WHERE dc.deck_id = p_deck_id AND dc.user_id = p_user_id
   ORDER BY dc.id;
END;
$$;

CREATE FUNCTION public._slot_oracle_id(p_user_id uuid, p_deck_id integer, p_slot_id integer) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.oracle_id FROM public.deck_slot_oracle_ids(p_user_id, p_deck_id) s WHERE s.slot_id = p_slot_id
$$;

-- The three layers merged for these cards and this user only (contract section 4). One row per (card, role) present in any layer.
CREATE FUNCTION public.get_effective_card_roles(p_user_id uuid, p_oracle_ids uuid[])
RETURNS TABLE (oracle_id uuid, role text, in_baseline boolean, baseline_proposer text, owner_effect text, claude_effect text,
               claude_state text, effective boolean, effective_from text, beside boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF cardinality(p_oracle_ids) > 500 THEN PERFORM public._roles_fail('invalid_request', jsonb_build_object('field', 'oracle_ids', 'max', 500)); END IF;
  RETURN QUERY
  WITH ids AS (SELECT DISTINCT x AS oid FROM unnest(p_oracle_ids) x WHERE x IS NOT NULL),
       keys AS (SELECT b.oracle_id, b.role FROM ref_card_roles b JOIN ids ON ids.oid = b.oracle_id
                UNION
                SELECT u.oracle_id, u.role FROM user_card_roles u JOIN ids ON ids.oid = u.oracle_id WHERE u.user_id = p_user_id)
  SELECT k.oracle_id, k.role, (b.role IS NOT NULL), b.proposer, o.effect, c.effect, c.state,
         CASE WHEN o.effect IS NOT NULL THEN o.effect = 'add'
              WHEN c.state = 'to_look_at' THEN c.effect = 'add'
              ELSE b.role IS NOT NULL END,
         CASE WHEN o.effect IS NOT NULL THEN 'owner'
              WHEN c.state = 'to_look_at' THEN 'claude'
              WHEN b.role IS NOT NULL THEN 'baseline' END,
         COALESCE(o.effect IS NOT NULL AND c.state = 'to_look_at' AND c.effect <> o.effect, false)
    FROM keys k
    LEFT JOIN ref_card_roles b ON b.oracle_id = k.oracle_id AND b.role = k.role
    LEFT JOIN user_card_roles o ON o.user_id = p_user_id AND o.oracle_id = k.oracle_id AND o.role = k.role AND o.proposer = 'owner'
    LEFT JOIN user_card_roles c ON c.user_id = p_user_id AND c.oracle_id = k.oracle_id AND c.role = k.role AND c.proposer = 'claude'
   ORDER BY k.oracle_id, k.role;
END;
$$;

-- The owner's own edit of one role on one card. p_action: add | remove | clear. Never writes a Claude row. Deletes a Claude row only when it is
-- still waiting (to_look_at) and holds the identical value (so the proposals count drops); a dismissed Claude row is kept as the memory.
CREATE FUNCTION public.owner_set_card_role(p_user_id uuid, p_oracle_id uuid, p_role text, p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_before jsonb; v_after jsonb;
BEGIN
  IF p_role IS NULL OR NOT (p_role = ANY (ARRAY['ramp','fixing','card_draw','card_selection','tutor','targeted_removal','board_wipe',
                                               'counterspell','protection','recursion','graveyard_hate','stax_tax','hand_disruption'])) THEN
    PERFORM public._roles_fail('unknown_role', jsonb_build_object('role', p_role));
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('add', 'remove', 'clear') THEN PERFORM public._roles_fail('bad_action', jsonb_build_object('action', p_action)); END IF;
  -- A printing id passed as a card id matches no oracle id here, so it is refused (D-003).
  IF p_oracle_id IS NULL OR NOT EXISTS (SELECT 1 FROM ref_printings rp WHERE rp.oracle_id = p_oracle_id) THEN
    PERFORM public._roles_fail('unknown_card', jsonb_build_object('oracle_id', p_oracle_id));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('card_role:' || p_user_id::text || ':' || p_oracle_id::text, 0));

  v_before := jsonb_build_object(
    'owner_effect',  (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'owner'),
    'claude_effect', (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'),
    'claude_state',  (SELECT state  FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'));

  IF p_action = 'clear' THEN
    DELETE FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'owner';
  ELSE
    INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state)
    VALUES (p_user_id, p_oracle_id, p_role, p_action, 'owner', 'accepted')
    ON CONFLICT (user_id, oracle_id, role, proposer) DO UPDATE SET effect = EXCLUDED.effect, updated_at = now();
    DELETE FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'
       AND state = 'to_look_at' AND effect = p_action;
  END IF;

  v_after := jsonb_build_object(
    'owner_effect',  (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'owner'),
    'claude_effect', (SELECT effect FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'),
    'claude_state',  (SELECT state  FROM user_card_roles WHERE user_id = p_user_id AND oracle_id = p_oracle_id AND role = p_role AND proposer = 'claude'));
  RETURN jsonb_build_object('previous', v_before, 'current', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public._roles_fail(text, jsonb), public.deck_slot_oracle_ids(uuid, integer), public._slot_oracle_id(uuid, integer, integer),
  public.get_effective_card_roles(uuid, uuid[]), public.owner_set_card_role(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roles_fail(text, jsonb), public.deck_slot_oracle_ids(uuid, integer), public._slot_oracle_id(uuid, integer, integer),
  public.get_effective_card_roles(uuid, uuid[]), public.owner_set_card_role(uuid, uuid, text, text) TO service_role;

COMMIT;
