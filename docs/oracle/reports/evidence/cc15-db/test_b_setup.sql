-- ============ SETUP ============
CREATE FUNCTION t.sd(p_deck int, p_patch jsonb, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', p_user, p_conn, p_deck, p_patch)) $$;
CREATE FUNCTION t.nlog(p_deck int, p_kind text DEFAULT 'deck_setup') RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM ai_change_log WHERE deck_id = p_deck AND kind = p_kind $$;
CREATE FUNCTION t.und(p_group uuid, p_actor text, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_undo_group(%L, %L, %L, %L)', p_user, p_group, p_actor, p_conn)) $$;
CREATE FUNCTION t.gid(p jsonb) RETURNS uuid LANGUAGE sql AS $$ SELECT (p#>>'{res,group_id}')::uuid $$;
UPDATE deck_strategy SET budget_ceiling = 0 WHERE false;
INSERT INTO deck_strategy (deck_id, user_id, budget_ceiling, budget_mode, table_context, win_condition, frustration) VALUES (:c_id, t.u1(), 50, 'strict', 'casual table', 'combo', 'stax');
SELECT t.sd(:c_id, '{"bracket":3}') AS r \gset b20_
SELECT t.chk('B20 set bracket 3: applied; strategy row has bracket 3, notes still empty',
  :'b20_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT bracket = 3 AND strategy_notes IS NULL FROM deck_strategy WHERE deck_id = :c_id), :'b20_r');
SELECT t.chk('B20a log row holds only the changed key (before bracket null, after bracket 3), kind deck_setup, not owner-approved',
  (SELECT before = '{"bracket": null}'::jsonb AND after = '{"bracket": 3}'::jsonb AND kind = 'deck_setup' AND NOT approved_by_owner FROM ai_change_log WHERE group_id = t.gid(:'b20_r'::jsonb)), (SELECT before::text || ' -> ' || after::text FROM ai_change_log WHERE group_id = t.gid(:'b20_r'::jsonb)));
SELECT t.chk('B20b budget, budget mode, table context, win condition, frustration are untouched',
  (SELECT budget_ceiling = 50 AND budget_mode = 'strict' AND table_context = 'casual table' AND win_condition = 'combo' AND frustration = 'stax' FROM deck_strategy WHERE deck_id = :c_id), '');
SELECT t.sd(:c_id, '{"bracket":1}') AS r \gset b21a_
SELECT bracket AS v1 FROM deck_strategy WHERE deck_id = :c_id \gset
SELECT t.sd(:c_id, '{"bracket":2}') AS r \gset b21b_
SELECT bracket AS v2 FROM deck_strategy WHERE deck_id = :c_id \gset
SELECT t.sd(:c_id, '{"bracket":4}') AS r \gset b21c_
SELECT bracket AS v4 FROM deck_strategy WHERE deck_id = :c_id \gset
SELECT t.sd(:c_id, '{"bracket":null}') AS r \gset b21d_
SELECT t.chk('B21 brackets 1, 2, 4 accepted and null clears (values read back 1, 2, 4, then empty)',
  :v1 = 1 AND :v2 = 2 AND :v4 = 4 AND (SELECT bracket IS NULL FROM deck_strategy WHERE deck_id = :c_id), :'b21d_r');
SELECT t.chk('B21a bracket 5, 0, 2.5, "3" (text) refused',
  t.sd(:c_id, '{"bracket":5}')->>'err' = 'bad_bracket' AND t.sd(:c_id, '{"bracket":0}')->>'err' = 'bad_bracket' AND t.sd(:c_id, '{"bracket":2.5}')->>'err' = 'bad_bracket' AND t.sd(:c_id, '{"bracket":"3"}')->>'err' = 'bad_bracket', '');
SELECT t.sd(:c_id, jsonb_build_object('strategy_notes', repeat('a', 4000))) AS r \gset b22_
SELECT t.chk('B22 notes of 4000 characters accepted', (:'b22_r'::jsonb->>'ok')::boolean AND (SELECT length(strategy_notes) = 4000 FROM deck_strategy WHERE deck_id = :c_id), left(:'b22_r', 200));
SELECT t.chk('B22a notes of 4001 characters refused; non-text notes refused; the saved notes are unchanged',
  t.sd(:c_id, jsonb_build_object('strategy_notes', repeat('a', 4001)))->>'err' = 'notes_too_long' AND t.sd(:c_id, '{"strategy_notes":12}')->>'err' = 'bad_notes' AND (SELECT length(strategy_notes) = 4000 FROM deck_strategy WHERE deck_id = :c_id), '');
SELECT t.sd(:c_id, '{"strategy_notes":"Treasure and sacrifice.","bracket":3}') AS r \gset b23_
SELECT t.chk('B23 notes + bracket in one call: one group, one log row; only changed keys logged when one value equals the old one',
  (SELECT count(*) = 1 FROM ai_change_log WHERE group_id = t.gid(:'b23_r'::jsonb)) AND (SELECT after ? 'strategy_notes' AND after ? 'bracket' FROM ai_change_log WHERE group_id = t.gid(:'b23_r'::jsonb)), :'b23_r');
SELECT t.sd(:c_id, '{"strategy_notes":"Treasure and sacrifice. Updated","bracket":3}') AS r \gset b23b_
SELECT t.chk('B23a bracket unchanged (3 -> 3): only the notes are logged and written', (SELECT after ? 'strategy_notes' AND NOT after ? 'bracket' AND NOT before ? 'bracket' FROM ai_change_log WHERE group_id = t.gid(:'b23b_r'::jsonb)), '');
SELECT t.nlog(:c_id) AS n_before \gset
SELECT t.sd(:c_id, '{"strategy_notes":"Treasure and sacrifice. Updated","bracket":3}') AS r \gset b24_
SELECT t.chk('B24 no change: outcome no_change, count 0, no log row, no group', :'b24_r'::jsonb#>>'{res,outcome}' = 'no_change' AND t.nlog(:c_id) = :n_before AND :'b24_r'::jsonb#>>'{res,group_id}' IS NULL, :'b24_r');
SELECT t.chk('B25 empty patch, unknown key only, null patch, text patch refused',
  t.sd(:c_id, '{}')->>'err' = 'nothing_to_set' AND t.sd(:c_id, '{"budget_ceiling":1}')->>'err' = 'nothing_to_set' AND t.sd(:c_id, NULL)->>'err' = 'nothing_to_set' AND t.sd(:c_id, '"x"')->>'err' = 'nothing_to_set', '');
SELECT t.chk('B25a unknown keys next to a valid one are ignored (budget not written)', (t.sd(:c_id, '{"bracket":2,"budget_ceiling":999}')->>'ok')::boolean AND (SELECT budget_ceiling = 50 FROM deck_strategy WHERE deck_id = :c_id), '');
-- commander swap
SELECT id AS old_slot FROM deck_cards WHERE deck_id = :c_id AND is_commander \gset
SELECT t.sd(:c_id, '{"commander":{"card_name":"Atraxa, Praetors'' Voice","scryfall_id":"sc-atraxa","oracle_id":"or-atraxa"}}') AS r \gset b26_
SELECT t.chk('B26 commander swap: Atraxa added as a Planned slot (no copy) and made the commander; Korvold stays in the deck as an ordinary card',
  (SELECT count(*) FILTER (WHERE is_commander) = 1 AND count(*) = 2 AND bool_and(copy_id IS NULL) AND bool_and(categories IS NULL) FROM deck_cards WHERE deck_id = :c_id)
  AND (SELECT is_commander FROM deck_cards WHERE deck_id = :c_id AND card_name LIKE 'Atraxa%') AND (SELECT NOT is_commander FROM deck_cards WHERE id = :old_slot)
  AND (SELECT commander_name = 'Atraxa, Praetors'' Voice' AND commander_scryfall_id = 'sc-atraxa' FROM decks WHERE id = :c_id), :'b26_r');
SELECT t.chk('B26a log: commander_slot_added true; before holds the old slot', (SELECT after->>'commander_slot_added' = 'true' AND (before->>'commander_slot_id')::int = :old_slot FROM ai_change_log WHERE group_id = t.gid(:'b26_r'::jsonb)), '');
SELECT t.sd(:c_id, '{"commander":{"card_name":"Atraxa, Praetors'' Voice","scryfall_id":"sc-atraxa"}}') AS r \gset b27_
SELECT t.chk('B27 same commander again: no_change, no new slot', :'b27_r'::jsonb#>>'{res,outcome}' = 'no_change' AND (SELECT count(*) = 2 FROM deck_cards WHERE deck_id = :c_id), :'b27_r');
SELECT t.sd(:c_id, jsonb_build_object('commander', jsonb_build_object('card_name', 'Korvold, Fae-Cursed King', 'scryfall_id', 'sc-korvold'))) AS r \gset b28_
SELECT t.chk('B28 swap back to a card already in the deck: no new slot, flag says nothing was added',
  (SELECT count(*) = 2 FROM deck_cards WHERE deck_id = :c_id) AND (SELECT is_commander FROM deck_cards WHERE id = :old_slot) AND (SELECT after->>'commander_slot_added' = 'false' FROM ai_change_log WHERE group_id = t.gid(:'b28_r'::jsonb)), :'b28_r');
-- undo of the swap done in B26 is no longer valid (the commander moved again): refused
SELECT t.chk('B28a undoing the older swap (B26) after a later change is refused changed_since, nothing changes',
  t.und(t.gid(:'b26_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'changed_since' AND (SELECT is_commander FROM deck_cards WHERE id = :old_slot), t.und(t.gid(:'b26_r'::jsonb), 'claude')::text);
-- partner and companion survive a commander swap
SELECT t.cd('Partner deck', 'commander', '{"card_name":"Tymna the Weaver","scryfall_id":"sc-tymna","oracle_id":"or-tymna","colour_identity":"WB"}') AS r \gset b29_
SELECT t.did('Partner deck') AS p_id \gset
SELECT id AS tymna_slot FROM deck_cards WHERE deck_id = :p_id \gset
INSERT INTO deck_cards (deck_id, card_name, quantity, is_commander, command_zone_role, user_id) VALUES (:p_id, 'Thrasios', 1, true, 'partner', t.u1()), (:p_id, 'Lurrus', 1, false, 'companion', t.u1()), (:p_id, 'Kenrith', 1, false, NULL, t.u1());
SELECT t.sd(:p_id, '{"commander":{"card_name":"Kenrith","scryfall_id":null}}') AS r \gset b29b_
SELECT t.chk('B29 swapping the primary commander keeps the partner and the companion roles',
  (SELECT is_commander AND command_zone_role IS NULL FROM deck_cards WHERE deck_id = :p_id AND card_name = 'Kenrith')
  AND (SELECT is_commander AND command_zone_role = 'partner' FROM deck_cards WHERE deck_id = :p_id AND card_name = 'Thrasios')
  AND (SELECT command_zone_role = 'companion' FROM deck_cards WHERE deck_id = :p_id AND card_name = 'Lurrus')
  AND (SELECT NOT is_commander FROM deck_cards WHERE id = :tymna_slot), :'b29b_r');
-- Undo of setup
SELECT t.sd(:c_id, '{"bracket":4}') AS r \gset b30_
SELECT t.und(t.gid(:'b30_r'::jsonb), 'claude') AS r \gset b30u_
SELECT t.chk('B30 Claude undoes a bracket setup: bracket back to its old value, log row marked undone by claude',
  (:'b30u_r'::jsonb#>>'{res,success}')::boolean AND (SELECT bracket = 2 FROM deck_strategy WHERE deck_id = :c_id) AND (SELECT undone_by = 'claude' AND undone_at IS NOT NULL FROM ai_change_log WHERE group_id = t.gid(:'b30_r'::jsonb)), :'b30u_r');
SELECT t.sd(:c_id, '{"bracket":4}') AS r \gset b31_
SELECT t.und(t.gid(:'b31_r'::jsonb), 'owner') AS r \gset b31u_
SELECT t.chk('B31 the owner undoes a setup too', (:'b31u_r'::jsonb#>>'{res,success}')::boolean AND (SELECT bracket = 2 FROM deck_strategy WHERE deck_id = :c_id) AND (SELECT undone_by = 'owner' FROM ai_change_log WHERE group_id = t.gid(:'b31_r'::jsonb)), :'b31u_r');
SELECT t.chk('B31a a second undo of the same setup: already_undone', t.und(t.gid(:'b31_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'already_undone', '');
SELECT t.sd(:c_id, '{"bracket":4}') AS r \gset b32_
UPDATE deck_strategy SET bracket = 1 WHERE deck_id = :c_id;   -- the owner edits the same field afterwards
SELECT t.chk('B32 owner edited the same field after: Undo refused with changed_since, owner value kept',
  t.und(t.gid(:'b32_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'changed_since' AND t.und(t.gid(:'b32_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'changed_since' AND (SELECT bracket = 1 FROM deck_strategy WHERE deck_id = :c_id), '');
SELECT t.chk('B32a recent changes shows that blocker', (SELECT e->'undo_blocker'->>'code' = 'changed_since' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'b32_r'::jsonb)::text), '');
SELECT t.sd(:c_id, '{"bracket":3}') AS r \gset b33_
UPDATE deck_strategy SET strategy_notes = 'owner wrote this' WHERE deck_id = :c_id;   -- a DIFFERENT field
SELECT t.und(t.gid(:'b33_r'::jsonb), 'claude') AS r \gset b33u_
SELECT t.chk('B33 owner edited a different field: Undo still works and keeps the owner''s notes', (:'b33u_r'::jsonb#>>'{res,success}')::boolean AND (SELECT bracket = 1 AND strategy_notes = 'owner wrote this' FROM deck_strategy WHERE deck_id = :c_id), :'b33u_r');
-- undo a commander swap on a fresh deck
SELECT t.cd('Swap deck', 'commander', '{"card_name":"Korvold","scryfall_id":"sc-k2","oracle_id":"or-k2"}') AS r \gset b34a_
SELECT t.did('Swap deck') AS s_id \gset
SELECT t.sd(:s_id, '{"commander":{"card_name":"Atraxa","scryfall_id":"sc-a2"}}') AS r \gset b34_
SELECT t.und(t.gid(:'b34_r'::jsonb), 'claude') AS r \gset b34u_
SELECT t.chk('B34 undo of a commander swap: Korvold is the commander again, the slot Claude added is removed, deck commander name restored',
  (:'b34u_r'::jsonb#>>'{res,success}')::boolean AND (SELECT count(*) = 1 AND bool_and(card_name = 'Korvold' AND is_commander) FROM deck_cards WHERE deck_id = :s_id) AND (SELECT commander_name = 'Korvold' AND commander_scryfall_id = 'sc-k2' FROM decks WHERE id = :s_id), :'b34u_r');
SELECT t.sd(:s_id, '{"commander":{"card_name":"Atraxa","scryfall_id":"sc-a2"}}') AS r \gset b35_
DELETE FROM deck_cards WHERE deck_id = :s_id AND card_name = 'Korvold';   -- owner removed the old commander slot by hand
SELECT t.chk('B35 old commander slot gone since: Undo refused changed_since (no database error)', t.und(t.gid(:'b35_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'changed_since', t.und(t.gid(:'b35_r'::jsonb), 'owner')::text);
-- too old
SELECT t.sd(:c_id, '{"bracket":4}') AS r \gset b36_
ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard;
UPDATE ai_change_log SET undoable_until = now() - interval '1 minute' WHERE group_id = t.gid(:'b36_r'::jsonb);
ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard;
SELECT t.chk('B36 setup older than 7 days: too_old', t.und(t.gid(:'b36_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'too_old', '');
SELECT t.chk('B37 Claude cannot undo with a switched-off connection', t.und(t.gid(:'b30_r'::jsonb), 'claude', t.u1(), t.c1_off())->>'err' = 'connection_revoked', '');
SELECT t.chk('B38 setup refused for a switched-off connection, and for a deck that does not exist',
  t.sd(:c_id, '{"bracket":2}', t.u1(), t.c1_off())->>'err' = 'connection_revoked' AND t.sd(999999, '{"bracket":2}')->>'err' = 'deck_not_found', '');
