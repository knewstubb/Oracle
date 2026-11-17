-- ============ UNDO OF A CREATED DECK ============
SET session_replication_role = replica;
UPDATE ai_change_log SET created_at = created_at - interval '2 hours' WHERE kind = 'deck_create' AND created_at > now() - interval '1 hour';
SET session_replication_role = origin;
SET session_replication_role = replica;
UPDATE ai_change_log SET created_at = created_at - interval '2 hours' WHERE kind = 'deck_create' AND created_at > now() - interval '1 hour';
SET session_replication_role = origin;
-- Claude-made deck with a setup (so a strategy row exists), then the owner undoes the creation
SELECT t.cd('Undo me', 'commander', '{"card_name":"Muldrotha","scryfall_id":"sc-m","oracle_id":"or-m","colour_identity":"BGU"}') AS r \gset b40_
SELECT t.did('Undo me') AS u_id \gset
SELECT t.sd(:u_id, '{"bracket":2,"strategy_notes":"hello"}') AS r \gset b40s_
SELECT t.chk('B40 Claude cannot undo a deck creation: owner_only, deck untouched',
  t.und(t.gid(:'b40_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'owner_only' AND EXISTS (SELECT 1 FROM decks WHERE id = :u_id), t.und(t.gid(:'b40_r'::jsonb), 'claude')::text);
SELECT t.chk('B40a owner_only is also what Recent changes says for that row, and the blocker is empty (Undo button available)',
  (SELECT e->>'owner_only' = 'true' AND e->'undo_blocker' = 'null'::jsonb FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'b40_r'::jsonb)::text), '');
SELECT t.und(t.gid(:'b40_r'::jsonb), 'owner') AS r \gset b41_
SELECT t.chk('B41 owner undoes the creation of the empty deck: success, undone 1', (:'b41_r'::jsonb#>>'{res,success}')::boolean AND (:'b41_r'::jsonb#>>'{res,undone}')::int = 1, :'b41_r');
SELECT t.chk('B41a deck, its commander row and its strategy row are gone',
  NOT EXISTS (SELECT 1 FROM decks WHERE id = :u_id) AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE deck_id = :u_id) AND NOT EXISTS (SELECT 1 FROM deck_strategy WHERE deck_id = :u_id), '');
SELECT t.chk('B41b the log row stays: name snapshot kept, deck reference cleared, marked undone by owner',
  (SELECT deck_name = 'Undo me' AND deck_id IS NULL AND undone_by = 'owner' AND undone_at IS NOT NULL FROM ai_change_log WHERE group_id = t.gid(:'b40_r'::jsonb)), (SELECT to_jsonb(l) - 'before' - 'after' FROM ai_change_log l WHERE group_id = t.gid(:'b40_r'::jsonb))::text);
SELECT t.chk('B41c the setup log row of that deck also stays (name snapshot, no deck)', (SELECT deck_id IS NULL AND deck_name = 'Undo me' FROM ai_change_log WHERE group_id = t.gid(:'b40s_r'::jsonb)), '');
SELECT t.chk('B41d a second Undo: already_undone', t.und(t.gid(:'b40_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'already_undone', '');
SELECT t.chk('B41e other decks untouched (the hand-made deck 100 and TEST C still exist)', EXISTS (SELECT 1 FROM decks WHERE id = 100) AND EXISTS (SELECT 1 FROM decks WHERE id = :c_id), '');
-- deck_not_empty
SELECT t.cd('Has card', 'commander', '{"card_name":"Muldrotha","scryfall_id":"sc-m","oracle_id":"or-m"}') AS r \gset b42_
SELECT t.did('Has card') AS h_id \gset
SELECT t.chk('B42 empty deck: the blocker is empty', (SELECT e->'undo_blocker' = 'null'::jsonb FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'b42_r'::jsonb)::text), '');
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_add', jsonb_build_object('deck_id', :h_id, 'items', jsonb_build_array(jsonb_build_object('card_name','Sol Ring','scryfall_id','s1','set_code','cmm','oracle_id','o1','quantity',1,'categories','["Ramp"]')))) AS r \gset b42a_
SELECT t.chk('B42a Claude adds a card to its deck (normal edit path)', :'b42a_r'::jsonb->>'outcome' = 'applied', '');
SELECT t.und(t.gid(:'b42_r'::jsonb), 'owner') AS r \gset b42u_
SELECT t.chk('B42b once a card is on the deck: refused deck_not_empty, deck and card still there',
  :'b42u_r'::jsonb#>>'{res,refused,code}' = 'deck_not_empty' AND :'b42u_r'::jsonb#>>'{res,refused,deck}' = 'Has card' AND (SELECT count(*) = 2 FROM deck_cards WHERE deck_id = :h_id), :'b42u_r');
SELECT t.chk('B42c Recent changes shows that reason', (SELECT e->'undo_blocker'->>'code' = 'deck_not_empty' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'b42_r'::jsonb)::text), '');
-- The card is undone through the normal Undo: then the deck can be undone
SELECT t.und((:'b42a_r'::jsonb->>'group_id')::uuid, 'claude') AS r \gset b42d_
SELECT t.und(t.gid(:'b42_r'::jsonb), 'owner') AS r \gset b42e_
SELECT t.chk('B42d removing the card first (Undo of the add) makes the deck undoable again', (:'b42e_r'::jsonb#>>'{res,success}')::boolean AND NOT EXISTS (SELECT 1 FROM decks WHERE id = :h_id), :'b42e_r');
-- deck_in_use variants, one deck each
SELECT t.cd('Use copy', 'commander', '{"card_name":"Muldrotha","scryfall_id":"sc-m","oracle_id":"or-m"}') AS r \gset b43a_
SELECT t.did('Use copy') AS i1 \gset
INSERT INTO user_cards (id, card_name, oracle_id, user_id) VALUES (1, 'Muldrotha', 'or-m', t.u1());
INSERT INTO user_copies (id, card_id, user_id) VALUES (1, 1, t.u1());
UPDATE deck_cards SET copy_id = 1 WHERE deck_id = :i1;
SELECT t.chk('B43a a copy sleeved into the commander slot: deck_in_use', t.und(t.gid(:'b43a_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'deck_in_use' AND EXISTS (SELECT 1 FROM decks WHERE id = :i1), '');
SELECT t.cd('Use pick', 'modern') AS r \gset b43b_
SELECT t.did('Use pick') AS i2 \gset
INSERT INTO move_items (user_id, list_id, card_name, to_deck_id) VALUES (t.u1(), gen_random_uuid(), 'Sol Ring', :i2);
SELECT t.chk('B43b a Picklist step points at the deck: deck_in_use', t.und(t.gid(:'b43b_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'deck_in_use' AND EXISTS (SELECT 1 FROM decks WHERE id = :i2), '');
SELECT t.cd('Use folder', 'modern') AS r \gset b43c_
SELECT t.did('Use folder') AS i3 \gset
INSERT INTO deck_folders (id, name, user_id) VALUES (1, 'Best decks', t.u1());
UPDATE decks SET folder_id = 1 WHERE id = :i3;
SELECT t.chk('B43c the deck was put in a folder: deck_in_use', t.und(t.gid(:'b43c_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'deck_in_use' AND EXISTS (SELECT 1 FROM decks WHERE id = :i3), '');
SELECT t.cd('Use version', 'modern') AS r \gset b43d_
SELECT t.did('Use version') AS i4 \gset
INSERT INTO deck_versions (deck_id, user_id) VALUES (:i4, t.u1());
SELECT t.chk('B43d a saved version exists: deck_in_use', t.und(t.gid(:'b43d_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'deck_in_use' AND EXISTS (SELECT 1 FROM decks WHERE id = :i4), '');
SELECT t.chk('B43e Recent changes shows deck_in_use for all four', (SELECT count(*) = 4 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->'undo_blocker'->>'code' = 'deck_in_use'), '');
-- too old, already undone, gone
SELECT t.cd('Old one', 'modern') AS r \gset b44_
ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard;
UPDATE ai_change_log SET undoable_until = now() - interval '1 minute' WHERE group_id = t.gid(:'b44_r'::jsonb);
ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard;
SELECT t.chk('B44 creation older than 7 days: too_old, deck stays', t.und(t.gid(:'b44_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'too_old' AND EXISTS (SELECT 1 FROM decks WHERE name = 'Old one'), '');
-- Claude-made deck deleted by hand afterwards (the owner's original complaint)
SELECT t.cd('Hand delete', 'commander', '{"card_name":"Muldrotha","scryfall_id":"sc-m","oracle_id":"or-m"}') AS r \gset b45_
SELECT t.did('Hand delete') AS d_id \gset
SELECT t.sd(:d_id, '{"bracket":3}') AS r \gset b45s_
DELETE FROM decks WHERE id = :d_id;
SELECT t.chk('B45 a Claude-made deck can be deleted by hand (no append-only error); log rows stay with name snapshot and no deck',
  NOT EXISTS (SELECT 1 FROM decks WHERE id = :d_id) AND (SELECT count(*) = 2 AND bool_and(deck_id IS NULL AND deck_name = 'Hand delete') FROM ai_change_log WHERE deck_name = 'Hand delete'), '');
SELECT t.chk('B45a Undo of the creation after that: deck_gone (no error), and the blocker says so',
  t.und(t.gid(:'b45_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'deck_gone' AND (SELECT e->'undo_blocker'->>'code' = 'deck_gone' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'b45_r'::jsonb)::text), '');
SELECT t.chk('B45b Undo of the setup of that deck: deck_gone', t.und(t.gid(:'b45s_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'deck_gone', '');
-- Recent changes lists the new kinds
SELECT t.chk('B46 Recent changes lists deck_create and deck_setup rows', (SELECT count(*) FILTER (WHERE e->>'kind' = 'deck_create') > 5 AND count(*) FILTER (WHERE e->>'kind' = 'deck_setup') > 3 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e), '');
SELECT t.chk('B46a no row of Recent changes carries before/after (unchanged shape)', (SELECT bool_and(NOT e ? 'before' AND NOT e ? 'after') FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e), '');
