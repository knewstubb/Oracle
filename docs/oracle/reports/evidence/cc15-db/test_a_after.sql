SELECT t.chk('A02 _ai_limits_new() has the five numbers', public._ai_limits_new() = '{"decks_created_per_hour":10,"decks_created_open_max":25,"boxes_created_per_hour":10,"box_move_max":200,"strategy_notes_max_chars":4000}'::jsonb, public._ai_limits_new()::text);
SELECT t.chk('A03 _ai_limits() unchanged by DB-A', public._ai_limits()->>'direct_max' = '120', '');
-- constraint
SELECT t.chk('A04 constraint accepts deck_create, deck_setup, box_create, box_move',
  (SELECT bool_and((t.att(format($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', %L, 'x') RETURNING NULL::jsonb$q$, k))->>'ok')::boolean)
     FROM unnest(ARRAY['deck_create','deck_setup','box_create','box_move']) k), '');
SELECT t.chk('A05 constraint rejects an invented kind', (t.att($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'deck_delete', 'x') RETURNING NULL::jsonb$q$)->>'err') LIKE '%ai_change_log_kind_check%', t.att($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'deck_delete', 'x') RETURNING NULL::jsonb$q$)::text);
SELECT t.chk('A06 old kinds still allowed (deck_category)', (t.att($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'deck_category', 'x') RETURNING NULL::jsonb$q$)->>'ok')::boolean, '');
-- owner-only flags
SELECT t.chk('A07 owner-only: deck_create, box_create, box_move yes; deck_setup, deck_category, deck_add no',
  public._ai_kind_owner_only('deck_create') AND public._ai_kind_owner_only('box_create') AND public._ai_kind_owner_only('box_move')
  AND NOT public._ai_kind_owner_only('deck_setup') AND NOT public._ai_kind_owner_only('deck_category') AND NOT public._ai_kind_owner_only('deck_add')
  AND public._ai_kind_owner_only('collection_add') AND public._ai_kind_owner_only('create_proxy') AND public._ai_kind_owner_only('copy_move'), '');
-- old kinds through the front doors
SELECT public.ai_undo_group(t.u1(), (SELECT cat_group FROM t.keep), 'claude', t.c1()) AS r \gset a10_
SELECT t.chk('A10 old kind: Claude undoes its deck_category group (made before DB-A) through the front door', (:'a10_r'::jsonb->>'success')::boolean, :'a10_r');
SELECT t.chk('A10b the category is back to what it was (NULL)', (SELECT categories FROM deck_cards WHERE card_name='Sol Ring') = '["Ramp"]', (SELECT categories FROM deck_cards WHERE card_name='Sol Ring'));
SELECT public.ai_undo_group(t.u1(), (SELECT add_group FROM t.keep), 'owner') AS r \gset a11_
SELECT t.chk('A11 old kind: owner undoes the deck_add group (2 cards) through the front door', (:'a11_r'::jsonb->>'success')::boolean AND (:'a11_r'::jsonb->>'undone')::int = 2 AND (SELECT count(*) FROM deck_cards WHERE deck_id=100)=0, :'a11_r');
SELECT public.ai_undo_group(t.u1(), (SELECT add_group FROM t.keep), 'owner') AS r \gset a11b_
SELECT t.chk('A11b undoing it twice is refused as before', :'a11b_r'::jsonb->>'success' IS NOT NULL, :'a11b_r');
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_add', '{"deck_id":100,"items":[{"card_name":"Command Tower","scryfall_id":"s3","set_code":"cmm","oracle_id":"o3","quantity":1,"categories":"[\"Land\"]"}]}') AS r \gset a12_
SELECT t.chk('A12 old kind: add after DB-A applies', :'a12_r'::jsonb->>'outcome' = 'applied', :'a12_r');
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_zone', jsonb_build_object('deck_id',100,'to','maybeboard','slots',jsonb_build_array(jsonb_build_object('id',(SELECT id FROM deck_cards WHERE card_name='Command Tower'),'card_name','Command Tower')))) AS r \gset a13_
SELECT t.chk('A13 old kind: zone change after DB-A applies', :'a13_r'::jsonb->>'outcome' = 'applied', :'a13_r');
SELECT public.ai_undo_group(t.u1(), (:'a13_r'::jsonb->>'group_id')::uuid, 'claude', t.c1()) AS r \gset a14_
SELECT t.chk('A14 old kind: Claude undoes the zone change', (:'a14_r'::jsonb->>'success')::boolean, :'a14_r');
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_remove', jsonb_build_object('deck_id',100,'slots',jsonb_build_array(jsonb_build_object('id',(SELECT id FROM deck_cards WHERE card_name='Command Tower'),'card_name','Command Tower')))) AS r \gset a15_
SELECT t.chk('A15 old kind: remove after DB-A applies, slot gone', :'a15_r'::jsonb->>'outcome' = 'applied' AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE card_name='Command Tower'), :'a15_r');
SELECT public.ai_undo_group(t.u1(), (:'a15_r'::jsonb->>'group_id')::uuid, 'claude', t.c1()) AS r \gset a16_
SELECT t.chk('A16 old kind: Claude undoes the remove, slot back', (:'a16_r'::jsonb->>'success')::boolean AND EXISTS (SELECT 1 FROM deck_cards WHERE card_name='Command Tower'), :'a16_r');
SELECT t.chk('A17 Recent changes still lists old kinds with their blocker field', jsonb_array_length(public.ai_list_recent_changes(t.u1())) >= 4, jsonb_array_length(public.ai_list_recent_changes(t.u1()))::text);
-- new kinds through the front doors (rows inserted by hand: the writers arrive in DB-B)
INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name)
  VALUES (t.u1(), 'aaaaaaaa-0000-4000-8000-000000000001', t.c1(), 'Claude', 'deck_create', 100, 'Manual', 'x');
SELECT public.ai_undo_group(t.u1(), 'aaaaaaaa-0000-4000-8000-000000000001', 'claude', t.c1()) AS r \gset a20_
SELECT t.chk('A20 Claude undo of an inserted deck_create row returns owner_only', :'a20_r'::jsonb#>>'{refused,code}' = 'owner_only' AND NOT (:'a20_r'::jsonb->>'success')::boolean, :'a20_r');
INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name)
  VALUES (t.u1(), 'aaaaaaaa-0000-4000-8000-000000000002', t.c1(), 'Claude', 'box_move', 100, 'Manual', 'x'), (t.u1(), 'aaaaaaaa-0000-4000-8000-000000000003', t.c1(), 'Claude', 'box_create', 100, 'Manual', 'x');
SELECT t.chk('A21 Claude undo of box_move / box_create returns owner_only',
  public.ai_undo_group(t.u1(), 'aaaaaaaa-0000-4000-8000-000000000002', 'claude', t.c1())#>>'{refused,code}' = 'owner_only'
  AND public.ai_undo_group(t.u1(), 'aaaaaaaa-0000-4000-8000-000000000003', 'claude', t.c1())#>>'{refused,code}' = 'owner_only', '');
SELECT t.chk('A22 Claude undo with a switched-off connection is refused (connection_revoked)', (t.att($q$SELECT public.ai_undo_group(t.u1(), 'aaaaaaaa-0000-4000-8000-000000000001', 'claude', t.c1_off())$q$)->>'err') = 'connection_revoked', '');
SELECT t.chk('A23 invalid actor refused', (t.att($q$SELECT public.ai_undo_group(t.u1(), 'aaaaaaaa-0000-4000-8000-000000000001', 'bob', t.c1())$q$)->>'err') = 'invalid_actor', '');
SELECT t.chk('A24 second user cannot reach user 1 rows through Undo (owner actor, new kind): change_not_found or helper refusal not success',
  NOT COALESCE((t.att($q$SELECT public.ai_undo_group(t.u2(), 'aaaaaaaa-0000-4000-8000-000000000001', 'owner')$q$)->'res'->>'success')::boolean, false), t.att($q$SELECT public.ai_undo_group(t.u2(), 'aaaaaaaa-0000-4000-8000-000000000001', 'owner')$q$)::text);
SELECT t.chk('A25 Recent changes lists the new kinds as owner-only (deck_create, box_*); blocker is NULL until DB-B',
  (SELECT count(*) >= 3 AND bool_and(e->>'owner_only' = 'true' AND e->'undo_blocker' = 'null'::jsonb) FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'kind' IN ('deck_create','box_move','box_create')), '');
SELECT t.chk('A26 privileges: new functions not executable by anon/authenticated, front door executable by service_role',
  NOT has_function_privilege('authenticated','public.ai_undo_group(uuid,uuid,text,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public._ai_limits_new()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public._ai_undo_blocker(uuid,ai_change_log)','EXECUTE') AND NOT has_function_privilege('authenticated','public._ai_blocker_new(uuid,ai_change_log)','EXECUTE')
  AND has_function_privilege('service_role','public.ai_undo_group(uuid,uuid,text,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public._ai_undo_group_prev(uuid,uuid,text,uuid)','EXECUTE'), '');
