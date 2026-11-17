-- DRAFT. NOT APPLIED. Needs owner approval; apply on a throwaway branch first. Author: Architect, CC-15 to CC-18 audit, 2026-11-17.
-- Report: docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md  (this is DB-A, the small foundation step)
-- Depends on: 20261116150000, 150100, 150200, 150300, 190000 (applied) AND 20261117100000 cc13_loosen_limits (drafted; apply it FIRST).
-- Not run against any database. Function bodies below were written from the migration files, not a live schema: the Tester's
-- throwaway run is the gate (report section 9).
--
-- What this does (and only this):
--   1. Widens the allowed change-kind lists on ai_change_log by FOUR names: deck_create, deck_setup, box_create, box_move.
--      (ai_pending_changes is NOT widened: none of the four ever waits for approval; they go through or are refused.)
--   2. Marks deck_create, box_create and box_move as OWNER-ONLY undo (Claude can never undo them).
--   3. Puts a thin undo function and a thin undo-blocker function in front of the live ones (Recent changes then lists new kinds itself). They handle the four new kinds by
--      calling per-kind helpers (_ai_undo_deck_create etc., defined by DB-B and DB-C) and hand EVERY OTHER kind to the live
--      function unchanged (same wrapper pattern as 20261116190000). Until DB-B/DB-C exist no row of a new kind can exist,
--      so the helpers are never reached.
--   4. Adds _ai_limits_new(): the numbers for the new kinds, kept apart from _ai_limits() so this file does not clash with CC-13.
-- Not destructive: no DELETE, TRUNCATE, or data UPDATE. Constraint swap scans one table.
-- Reversible: supabase/drafts/20261117200000_cc15a_new_change_kinds.rollback.sql (restores names; refuses if new-kind rows exist).

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public._ai_limits()') IS NULL OR to_regprocedure('public.ai_undo_group(uuid,uuid,text,uuid)') IS NULL OR to_regprocedure('public._ai_undo_blocker(uuid,ai_change_log)') IS NULL THEN
    RAISE EXCEPTION 'connector slice B functions not found';
  END IF;
  IF to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'cc15a already applied';
  END IF;
  IF (public._ai_limits()->>'direct_max')::int <> 120 THEN
    RAISE EXCEPTION 'apply 20261117100000_cc13_loosen_limits first';
  END IF;
END $$;

-- 1. Allow-list. Constraint found by its text (it lists 'deck_zone'), as in 20261116190000.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE contype = 'c' AND conrelid = 'public.ai_change_log'::regclass AND pg_get_constraintdef(oid) LIKE '%deck_zone%'
  LOOP
    EXECUTE format('ALTER TABLE public.ai_change_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.ai_change_log ADD CONSTRAINT ai_change_log_kind_check CHECK (kind IN
  ('deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category',
   'deck_create','deck_setup','box_create','box_move'));

-- 2. Owner-only kinds. (The live function lists three; deck_category is Claude-undoable and so stays out.)
CREATE OR REPLACE FUNCTION public._ai_kind_owner_only(p_kind text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('collection_add', 'create_proxy', 'copy_move', 'deck_create', 'box_create', 'box_move')
$$;

-- 4. Numbers for the new kinds. KEEP IN STEP with src/lib/connector/edit-config.ts (a test asserts equal, like AI_LIMITS).
CREATE OR REPLACE FUNCTION public._ai_limits_new() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'decks_created_per_hour', 10,   -- Claude can make at most this many decks in any hour
    'decks_created_open_max', 25,   -- ...and at most this many EMPTY decks it made that the owner has not touched (stops runaway)
    'boxes_created_per_hour', 10,
    'box_move_max', 200,            -- copies in one box-move request; over this is refused (no waiting path). equals max_request
    'strategy_notes_max_chars', 4000
  )
$$;

-- 3a. Undo. Rename the live function, put a front door with the OLD name and signature.
ALTER FUNCTION public.ai_undo_group(uuid, uuid, text, uuid) RENAME TO _ai_undo_group_prev;

CREATE OR REPLACE FUNCTION public.ai_undo_group(p_user_id uuid, p_group_id uuid, p_actor text, p_connection_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_n integer;
BEGIN
  SELECT min(kind), count(*) INTO v_kind, v_n FROM ai_change_log
   WHERE user_id = p_user_id AND group_id = p_group_id AND kind IN ('deck_create','deck_setup','box_create','box_move');
  IF v_n = 0 THEN
    RETURN public._ai_undo_group_prev(p_user_id, p_group_id, p_actor, p_connection_id);   -- every old kind: unchanged code
  END IF;
  IF p_actor NOT IN ('owner', 'claude') THEN PERFORM public._ai_fail('invalid_actor'); END IF;
  IF p_actor = 'claude' THEN
    PERFORM 1 FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
    IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
    IF public._ai_kind_owner_only(v_kind) THEN
      RETURN jsonb_build_object('success', false, 'refused', jsonb_build_object('code', 'owner_only'));
    END IF;
  END IF;
  -- One new kind per group by design (a request writes one kind). Helpers return the same shape as the live undo:
  -- {success:true, undone:n} or {success:false, refused:{code,...}}. Defined in DB-B (deck_*) and DB-C (box_*).
  IF v_kind = 'deck_create' THEN RETURN public._ai_undo_deck_create(p_user_id, p_group_id, p_actor);
  ELSIF v_kind = 'deck_setup' THEN RETURN public._ai_undo_deck_setup(p_user_id, p_group_id, p_actor);
  ELSIF v_kind = 'box_create' THEN RETURN public._ai_undo_box_create(p_user_id, p_group_id, p_actor);
  ELSE RETURN public._ai_undo_box_move(p_user_id, p_group_id, p_actor);
  END IF;
END $$;

-- 3b. Recent changes. The live ai_list_recent_changes already lists EVERY ai_change_log row (any kind) and asks _ai_undo_blocker
-- why a group cannot be undone. So the list needs no change; only the blocker must understand the new kinds. Same wrapper pattern:
-- the live function is renamed and a front door with the old name sends the new kinds to _ai_blocker_new (DB-B / DB-C define it;
-- it returns NULL until then). Every old kind reaches the live code unchanged.
ALTER FUNCTION public._ai_undo_blocker(uuid, ai_change_log) RENAME TO _ai_undo_blocker_prev;
CREATE OR REPLACE FUNCTION public._ai_blocker_new(p_user_id uuid, r ai_change_log) RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT NULL::jsonb
$$;
CREATE OR REPLACE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN r.kind IN ('deck_create','deck_setup','box_create','box_move')
              THEN public._ai_blocker_new(p_user_id, r) ELSE public._ai_undo_blocker_prev(p_user_id, r) END
$$;

REVOKE ALL ON FUNCTION public.ai_undo_group(uuid, uuid, text, uuid), public.ai_list_recent_changes(uuid),
  public._ai_limits_new(), public._ai_blocker_new(uuid, ai_change_log), public._ai_undo_blocker(uuid, ai_change_log) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_undo_group(uuid, uuid, text, uuid), public.ai_list_recent_changes(uuid) TO service_role;

COMMIT;
