-- T-61 follow-up 1 of 2. APPLIED to the live DB 2026-10-23 with owner approval.
-- Needs 20261023170000_deck_cards_command_zone_role.sql applied first (also a draft).
-- Contract: docs/oracle/contracts/command-zone-roles.md §6.
--
-- Adds ONE new function: public.set_deck_command_zone(...). It sets who the commander, the second commander
-- (partner/background) and the companion are for one deck, in ONE transaction.
--
-- Arguments are deck_cards.id values (the cards must already be rows of this deck; the route adds a card to the deck
-- with the existing add-card path first). No card identifier is passed, so D-003 is not engaged.
--   p_primary_card_id   the commander (NULL = clear the commander)
--   p_second_card_id    the second commander (NULL = none)
--   p_second_role       'partner' | 'background' (required when p_second_card_id is given, else must be NULL)
--   p_companion_card_id the companion (NULL = none)
--
-- What it does: (1) locks the deck (owner's only), (2) turns every current commander/partner/background row back into an
-- ordinary row (is_commander=false, role NULL) -- a ROLE reset, no row is deleted, (3) sets the new roles, (4) moves the
-- companion row's categories to '["Sideboard"]' (the existing "not in the 100" bucket, see contract §2/A-2), (5) rewrites
-- decks.commander_name / commander_scryfall_id from the new primary (NULL when none).
-- It does NOT remove a companion: if the deck has a companion that the call would drop, it raises
-- 'companion_must_be_removed_first' and the route must remove it through the existing remove-card path (owner confirmation
-- required in the UI). So this function never deletes, truncates or drops anything and never touches user_copies.
-- A card that was a commander and is no longer one keeps its category and any copy; it just stops being the commander.
--
-- Errors (all RAISE EXCEPTION ... ERRCODE P0001, whole call rolls back, nothing changes):
--   deck_not_found, card_not_in_deck, duplicate_card, invalid_second_role, second_without_primary,
--   companion_must_be_removed_first.
-- (Partner/Background PAIR legality needs card text and is checked by the route before calling; this function enforces
--  the structural rules, and the table constraints are the final backstop.)
--
-- SECURITY DEFINER, search_path = public, granted to service_role only. NO anon / authenticated EXECUTE.
-- Every lookup filters by p_user_id (multi-user safe).
-- Atomic: single plpgsql call = single transaction.
-- Undo: DROP FUNCTION public.set_deck_command_zone(integer, uuid, integer, integer, text, integer);

CREATE OR REPLACE FUNCTION public.set_deck_command_zone(
  p_deck_id integer,
  p_user_id uuid,
  p_primary_card_id integer,
  p_second_card_id integer,
  p_second_role text,
  p_companion_card_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id integer;
  v_ids integer[];
  v_primary record;
  v_existing_companion integer;
BEGIN
  PERFORM 1 FROM decks WHERE id = p_deck_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_second_card_id IS NULL AND p_second_role IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_second_role' USING ERRCODE = 'P0001';
  END IF;
  IF p_second_card_id IS NOT NULL AND p_second_role IS DISTINCT FROM 'partner' AND p_second_role IS DISTINCT FROM 'background' THEN
    RAISE EXCEPTION 'invalid_second_role' USING ERRCODE = 'P0001';
  END IF;
  IF p_second_card_id IS NOT NULL AND p_primary_card_id IS NULL THEN
    RAISE EXCEPTION 'second_without_primary' USING ERRCODE = 'P0001';
  END IF;

  v_ids := ARRAY_REMOVE(ARRAY[p_primary_card_id, p_second_card_id, p_companion_card_id], NULL);
  IF (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) <> COALESCE(array_length(v_ids, 1), 0) THEN
    RAISE EXCEPTION 'duplicate_card' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM 1 FROM deck_cards WHERE id = v_id AND deck_id = p_deck_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'card_not_in_deck' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- A companion that exists and would be dropped must be removed by the caller first (never deleted here).
  SELECT id INTO v_existing_companion
  FROM deck_cards
  WHERE deck_id = p_deck_id AND user_id = p_user_id AND command_zone_role = 'companion';
  IF v_existing_companion IS NOT NULL AND v_existing_companion IS DISTINCT FROM p_companion_card_id THEN
    RAISE EXCEPTION 'companion_must_be_removed_first' USING ERRCODE = 'P0001';
  END IF;

  -- Role reset only (no deletes): old commander / partner / background rows become ordinary rows.
  UPDATE deck_cards
     SET is_commander = false, command_zone_role = NULL
   WHERE deck_id = p_deck_id AND user_id = p_user_id
     AND (is_commander IS TRUE OR command_zone_role IN ('partner', 'background'));

  IF p_primary_card_id IS NOT NULL THEN
    UPDATE deck_cards SET is_commander = true, command_zone_role = NULL
     WHERE id = p_primary_card_id AND deck_id = p_deck_id AND user_id = p_user_id;
  END IF;

  IF p_second_card_id IS NOT NULL THEN
    UPDATE deck_cards SET is_commander = true, command_zone_role = p_second_role
     WHERE id = p_second_card_id AND deck_id = p_deck_id AND user_id = p_user_id;
  END IF;

  IF p_companion_card_id IS NOT NULL THEN
    UPDATE deck_cards
       SET is_commander = false, command_zone_role = 'companion', categories = '["Sideboard"]'
     WHERE id = p_companion_card_id AND deck_id = p_deck_id AND user_id = p_user_id;
  END IF;

  SELECT card_name, scryfall_id INTO v_primary
  FROM deck_cards
  WHERE id = p_primary_card_id AND deck_id = p_deck_id AND user_id = p_user_id;

  UPDATE decks
     SET commander_name = v_primary.card_name,
         commander_scryfall_id = v_primary.scryfall_id
   WHERE id = p_deck_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'deck_id', p_deck_id,
    'primary_card_id', p_primary_card_id,
    'second_card_id', p_second_card_id,
    'second_role', p_second_role,
    'companion_card_id', p_companion_card_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_deck_command_zone(integer, uuid, integer, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_deck_command_zone(integer, uuid, integer, integer, text, integer) TO service_role;
