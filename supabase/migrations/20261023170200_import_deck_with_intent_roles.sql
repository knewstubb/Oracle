-- T-61 follow-up 2 of 2. APPLIED to the live DB 2026-10-23 with owner approval.
-- Needs 20261023170000_deck_cards_command_zone_role.sql applied first (also a draft).
-- Contract: docs/oracle/contracts/command-zone-roles.md §4.
--
-- DEVIATION FROM THE TASK WORDING (Architect ruling, for the owner's information): instead of re-pasting and editing
-- the 350-line body of import_deck_with_intent (8 INSERT sites; a copy would drift and any typo could break the live
-- import), this adds a thin WRAPPER, public.import_deck_with_intent_roles(p_deck_id, p_user_id, p_rows). The live function
-- is NOT changed. The import route calls the wrapper instead (slice 7).
--
-- What it does, in one transaction:
--   1. calls import_deck_with_intent(p_deck_id, p_user_id, p_rows) unchanged (its jsonb_to_recordset ignores the extra
--      row key `command_zone_role`);
--   2. for every row that carries command_zone_role ('partner' | 'background' | 'companion'), finds the deck_cards row
--      just inserted (same deck, same card_name, role still NULL, is_commander matching: true for partner/background,
--      false for companion, lowest id first) and sets command_zone_role on it. A companion row also gets
--      categories '["Sideboard"]' (contract A-2: the existing "not in the 100" bucket);
--   3. returns the original function's jsonb result unchanged.
-- A row that cannot be found raises 'role_row_not_found'; a bad role raises 'invalid_command_zone_role'; the table
-- constraints (two companions, companion that is a commander, ...) raise as usual. Any exception rolls back the WHOLE import
-- including the inner function's inserts, moves and alerts -- nothing is half-saved.
-- Only UPDATE: command_zone_role / categories on rows of THIS deck that the inner call just inserted. No DELETE, TRUNCATE,
-- DROP; user_copies untouched.
-- SECURITY DEFINER, search_path = public, service_role only. NO anon / authenticated EXECUTE.
-- Undo: DROP FUNCTION public.import_deck_with_intent_roles(integer, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.import_deck_with_intent_roles(
  p_deck_id integer,
  p_user_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
  v_row record;
  v_target integer;
BEGIN
  v_result := public.import_deck_with_intent(p_deck_id, p_user_id, p_rows);

  FOR v_row IN
    SELECT card_name, command_zone_role
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb)) AS r(card_name text, command_zone_role text)
    WHERE command_zone_role IS NOT NULL AND btrim(command_zone_role) <> ''
  LOOP
    IF v_row.command_zone_role NOT IN ('partner', 'background', 'companion') THEN
      RAISE EXCEPTION 'invalid_command_zone_role' USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO v_target
    FROM deck_cards
    WHERE deck_id = p_deck_id AND user_id = p_user_id
      AND card_name = v_row.card_name
      AND command_zone_role IS NULL
      AND (is_commander IS TRUE) = (v_row.command_zone_role <> 'companion')
    ORDER BY id
    LIMIT 1;

    IF v_target IS NULL THEN
      RAISE EXCEPTION 'role_row_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF v_row.command_zone_role = 'companion' THEN
      UPDATE deck_cards SET command_zone_role = 'companion', categories = '["Sideboard"]' WHERE id = v_target;
    ELSE
      UPDATE deck_cards SET command_zone_role = v_row.command_zone_role WHERE id = v_target;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_deck_with_intent_roles(integer, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_deck_with_intent_roles(integer, uuid, jsonb) TO service_role;
