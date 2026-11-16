-- CC-04b follow-up (additive): fix _ai_undo_blocker for kind 'make_original'.
-- Bug: `IF NOT FOUND` after the holder lookup was true whenever no deck held the proxy (the normal case), so
-- Claude's undo of "make original" was ALWAYS refused as proxy_moved. Now tests the proxy copy row itself.
-- Found by the live throwaway-user test on 2026-11-16. Replaces one function; no table or data changes.

CREATE OR REPLACE FUNCTION public._ai_undo_blocker(p_user_id uuid, r ai_change_log) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_slot record; v_copy record; v_holder text; v_on timestamptz; v_dup integer; v_snap jsonb; v_loc integer; v_deckname text;
BEGIN
  SELECT max(l.created_at) INTO v_on FROM ai_change_log l
   WHERE l.user_id = p_user_id AND l.id <> r.id AND l.created_at > r.created_at
     AND ((r.deck_card_id IS NOT NULL AND (l.deck_card_id = r.deck_card_id OR l.other_deck_card_id = r.deck_card_id)) OR (r.copy_id IS NOT NULL AND l.copy_id = r.copy_id));
  IF r.undone_at IS NOT NULL THEN RETURN jsonb_build_object('code', 'already_undone'); END IF;
  IF r.undoable_until <= now() THEN RETURN jsonb_build_object('code', 'window_closed'); END IF;

  IF r.kind = 'deck_add' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_slot.copy_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'slot_sleeved', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    IF v_slot.categories IS DISTINCT FROM r.after->>'categories' OR v_slot.is_commander THEN
      RETURN jsonb_build_object('code', 'slot_edited', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind IN ('deck_remove', 'deck_zone') THEN
    IF NOT EXISTS (SELECT 1 FROM decks WHERE id = r.deck_id AND user_id = p_user_id) THEN RETURN jsonb_build_object('code', 'deck_gone', 'deck', r.deck_name); END IF;
    IF r.kind = 'deck_remove' THEN
      v_snap := r.before->'slot';
      IF EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = r.deck_id AND user_id = p_user_id AND card_name = r.card_name
                    AND NOT COALESCE((v_snap->>'is_generic')::boolean, false)) THEN
        RETURN jsonb_build_object('code', 'card_back_on_list', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on);
      END IF;
    ELSE
      SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('code', 'slot_gone', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
      IF v_slot.categories IS DISTINCT FROM r.after->>'categories' THEN RETURN jsonb_build_object('code', 'slot_edited', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
      IF v_slot.copy_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'slot_sleeved', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    END IF;
    IF r.copy_id IS NOT NULL THEN
      v_loc := NULLIF(r.after->>'released_to_location_id', '')::integer;
      SELECT * INTO v_copy FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id;
      IF NOT FOUND THEN RETURN jsonb_build_object('code', 'copy_gone', 'card', r.card_name, 'on', v_on); END IF;
      SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = r.copy_id AND dc.user_id = p_user_id LIMIT 1;
      IF v_holder IS NOT NULL THEN RETURN jsonb_build_object('code', 'copy_elsewhere', 'card', r.card_name, 'deck', v_holder, 'on', v_on); END IF;
      IF v_copy.missing OR v_loc IS NULL OR v_copy.location_id IS DISTINCT FROM v_loc THEN RETURN jsonb_build_object('code', 'copy_moved', 'card', r.card_name, 'on', v_on); END IF;
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'sleeve_copy' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN
      SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = r.copy_id AND dc.user_id = p_user_id LIMIT 1;
      RETURN jsonb_build_object('code', 'copy_moved', 'card', r.card_name, 'deck', v_holder, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'make_original' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN RETURN jsonb_build_object('code', 'slot_changed', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    SELECT * INTO v_copy FROM user_copies WHERE id = (r.before->>'proxy_copy_id')::integer AND user_id = p_user_id;
    v_dup := CASE WHEN v_copy.id IS NULL THEN 0 ELSE 1 END;                              -- 1 = the proxy copy row still exists
    SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = (r.before->>'proxy_copy_id')::integer AND dc.user_id = p_user_id LIMIT 1;
    IF v_dup = 0 OR v_holder IS NOT NULL OR v_copy.location_id IS DISTINCT FROM NULLIF(r.after->>'proxy_location_id', '')::integer THEN
      RETURN jsonb_build_object('code', 'proxy_moved', 'card', r.card_name, 'deck', v_holder, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'create_proxy' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN RETURN jsonb_build_object('code', 'slot_changed', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    IF NOT EXISTS (SELECT 1 FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id AND is_proxy AND source_tag = 'claude_connector') THEN
      RETURN jsonb_build_object('code', 'copy_changed', 'card', r.card_name, 'on', v_on);
    END IF;
    RETURN NULL;

  ELSIF r.kind = 'collection_add' THEN
    SELECT * INTO v_copy FROM user_copies WHERE id = r.copy_id AND user_id = p_user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT d.name INTO v_holder FROM deck_cards dc JOIN decks d ON d.id = dc.deck_id WHERE dc.copy_id = r.copy_id AND dc.user_id = p_user_id LIMIT 1;
    IF v_holder IS NOT NULL THEN RETURN jsonb_build_object('code', 'copy_in_deck', 'card', r.card_name, 'deck', v_holder, 'on', v_on); END IF;
    IF v_copy.is_proxy OR v_copy.source_tag IS DISTINCT FROM 'claude_connector' OR v_copy.missing THEN RETURN jsonb_build_object('code', 'copy_changed', 'card', r.card_name, 'on', v_on); END IF;
    RETURN NULL;

  ELSIF r.kind = 'copy_move' THEN
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.other_deck_card_id AND user_id = p_user_id;
    IF NOT FOUND OR v_slot.copy_id IS DISTINCT FROM r.copy_id THEN RETURN jsonb_build_object('code', 'copy_moved_again', 'card', r.card_name, 'deck', r.other_deck_name, 'on', v_on); END IF;
    SELECT * INTO v_slot FROM deck_cards WHERE id = r.deck_card_id AND user_id = p_user_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('code', 'source_slot_gone', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    IF v_slot.copy_id IS NOT NULL THEN RETURN jsonb_build_object('code', 'source_slot_filled', 'card', r.card_name, 'deck', r.deck_name, 'on', v_on); END IF;
    RETURN NULL;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._ai_undo_blocker(uuid, ai_change_log) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ai_undo_blocker(uuid, ai_change_log) TO service_role;
