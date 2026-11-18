-- DRAFT. NOT APPLIED. Needs owner approval AND 20261117200000_cc15a + 20261117200100_cc15b applied first. Author: Architect, CC-17, 2026-11-17.
-- Report: docs/oracle/reports/2026-11-17-architect-cc15-18-claude-primary.md  (DB-D)
-- Not run against any database; throwaway run is the gate.
--
-- Adds ONE function, no table or column change:
--   ai_import_deck_list(user, connection, deck_id, rows jsonb) -> fills ONE EMPTY deck from an already-parsed, already-resolved list.
-- It does NOT parse or resolve anything. The app does that with the existing import code (parse -> Scryfall resolution -> import intent),
-- exactly as the Import screen does, and passes the finished rows. This function: (1) checks the connection is on, (2) checks the deck
-- is the owner's and empty apart from its commander row, (3) FORCES every row to a Planned slot (no copy created, none taken, none moved:
-- intent 'unsleeved'), (4) calls the LIVE import_deck_with_intent for the insert, (5) writes one deck_add log row per slot so ONE Undo
-- removes the whole import. If any step raises, nothing is saved (single transaction).
-- Identifier note (D-003): each row carries scryfall_id (printing) AND oracle_id (card), as resolved by the app. Never swapped here.
-- Why a wrapper: import_deck_with_intent refuses a deck that has ANY deck_cards row (deck_not_empty). A deck Claude just made already holds
-- its commander row, so the wrapper lifts only that one row aside for the call and restores it, keeping the commander and its role.
-- Reversible: DROP FUNCTION. Rows it made are Planned slots, undone by the existing deck_add undo (removes slots, never copies).
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('public.import_deck_with_intent(integer,uuid,jsonb)') IS NULL THEN RAISE EXCEPTION 'import_deck_with_intent not found'; END IF;
  IF to_regprocedure('public._ai_limits_new()') IS NULL THEN RAISE EXCEPTION 'apply 20261117200000_cc15a first'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ai_import_deck_list(p_user_id uuid, p_connection_id uuid, p_deck_id integer, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client text; v_deck decks; v_group uuid := gen_random_uuid(); v_n integer; v_cmd deck_cards; v_has_cmd boolean; v_forced jsonb;
  v_max integer := (public._ai_limits()->>'direct_max')::int;   -- same 120 as any direct edit; over that is refused here (no waiting path for imports) v_added integer;
BEGIN
  SELECT client_name INTO v_client FROM connector_connections WHERE id = p_connection_id AND user_id = p_user_id AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN PERFORM public._ai_fail('connection_revoked'); END IF;
  SELECT * INTO v_deck FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public._ai_fail('deck_not_found', jsonb_build_object('deck_id', p_deck_id)); END IF;
  v_n := COALESCE(jsonb_array_length(p_rows), 0);
  IF v_n = 0 THEN PERFORM public._ai_fail('nothing_to_import'); END IF;
  IF v_n > v_max THEN PERFORM public._ai_fail('too_many_cards', jsonb_build_object('max', v_max)); END IF;
  IF EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = p_deck_id AND user_id = p_user_id AND NOT is_commander) THEN
    PERFORM public._ai_fail('deck_not_empty', jsonb_build_object('deck', v_deck.name)); END IF;
  -- Force Planned: the app already sends intent 'unsleeved'; this makes it impossible to send anything else. [Approximate] row key name 'type'
  -- (import-intent.types.ts); confirm in the throwaway run.
  SELECT jsonb_agg(r || jsonb_build_object('type', 'unsleeved', 'intent', 'unsleeved')) INTO v_forced FROM jsonb_array_elements(p_rows) r;
  SELECT * INTO v_cmd FROM deck_cards WHERE deck_id = p_deck_id AND user_id = p_user_id AND is_commander LIMIT 1;
  v_has_cmd := FOUND;
  IF v_has_cmd THEN UPDATE deck_cards SET deck_id = -p_deck_id WHERE id = v_cmd.id; END IF;   -- lifted aside inside this transaction only. [Approximate] FK: confirm deck_cards.deck_id has no FK to decks, else use a SAVEPOINT-free alternative in the throwaway run
  PERFORM public.import_deck_with_intent(p_deck_id, p_user_id, v_forced);
  IF v_has_cmd THEN UPDATE deck_cards SET deck_id = p_deck_id WHERE id = v_cmd.id AND deck_id = -p_deck_id; END IF;
  INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name, oracle_id, printing_id, deck_card_id, before, after)
  SELECT p_user_id, v_group, p_connection_id, v_client, 'deck_add', p_deck_id, v_deck.name, dc.card_name, NULL, dc.scryfall_id, dc.id,
         '{}'::jsonb, jsonb_build_object('source', 'list_import')
    FROM deck_cards dc WHERE dc.deck_id = p_deck_id AND dc.user_id = p_user_id AND NOT dc.is_commander;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'outcome', 'applied', 'group_id', v_group, 'count', v_added);
END $$;
REVOKE ALL ON FUNCTION public.ai_import_deck_list(uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_import_deck_list(uuid, uuid, integer, jsonb) TO service_role;
COMMIT;
-- Rollback (separate file): DROP FUNCTION public.ai_import_deck_list(uuid, uuid, integer, jsonb);
