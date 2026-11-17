-- ============ TWO-USER ISOLATION ============
SET session_replication_role = replica;
UPDATE ai_change_log SET created_at = created_at - interval '2 hours' WHERE kind = 'deck_create' AND created_at > now() - interval '1 hour';
SET session_replication_role = origin;
SELECT t.cd('Mine', 'modern') AS r \gset i0_
SELECT t.did('Mine') AS m_id \gset
SELECT t.sd(:m_id, '{"bracket":2}') AS r \gset i1_
SELECT md5(string_agg(to_jsonb(d)::text, '|' ORDER BY id)) AS snap1 FROM decks d WHERE user_id = t.u1() \gset
SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY deck_id)) AS snap2 FROM deck_strategy s WHERE user_id = t.u1() \gset
SELECT md5(string_agg(to_jsonb(c)::text, '|' ORDER BY id)) AS snap3 FROM deck_cards c WHERE user_id = t.u1() \gset
SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY id)) AS snap4 FROM ai_change_log l WHERE user_id = t.u1() \gset
GRANT USAGE ON SCHEMA t TO anon;
-- user 2 (with their OWN valid connection) against user 1's deck
SELECT t.chk('I01 user 2 setup on user 1''s deck: deck_not_found', t.sd(:m_id, '{"bracket":4}', t.u2(), t.c2())->>'err' = 'deck_not_found', t.sd(:m_id, '{"bracket":4}', t.u2(), t.c2())::text);
SELECT t.chk('I02 user 2 commander swap on user 1''s deck: deck_not_found', t.sd(:m_id, '{"commander":{"card_name":"Atraxa","scryfall_id":"x"}}', t.u2(), t.c2())->>'err' = 'deck_not_found', '');
SELECT t.chk('I03 user 2 Undo (owner and Claude) of user 1''s setup group: change_not_found, nothing changes',
  t.und(t.gid(:'i1_r'::jsonb), 'owner', t.u2(), t.c2())->>'err' = 'change_not_found' AND t.und(t.gid(:'i1_r'::jsonb), 'claude', t.u2(), t.c2())->>'err' = 'change_not_found'
  AND (SELECT bracket = 2 FROM deck_strategy WHERE deck_id = :m_id), '');
SELECT t.chk('I04 user 2 Undo (owner and Claude) of user 1''s deck_create group: refused or not found, deck survives',
  COALESCE(t.und(t.gid(:'i0_r'::jsonb), 'owner', t.u2(), t.c2())->>'err', 'x') <> 'x' AND COALESCE(t.und(t.gid(:'i0_r'::jsonb), 'claude', t.u2(), t.c2())->>'err', 'x') <> 'x' AND EXISTS (SELECT 1 FROM decks WHERE id = :m_id),
  t.und(t.gid(:'i0_r'::jsonb), 'owner', t.u2(), t.c2())::text);
SELECT t.chk('I05 user 2 cannot create a deck through user 1''s connection, nor use user 1''s id', t.cd('Steal', 'modern', NULL, t.u2(), t.c1())->>'err' = 'connection_revoked' AND t.cd('Steal', 'modern', NULL, t.u1(), t.c2())->>'err' = 'connection_revoked', '');
SELECT t.chk('I06 user 2 Recent changes shows none of user 1''s rows', (SELECT count(*) = 0 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u2())) e WHERE e->>'user_id' = t.u1()::text) AND jsonb_array_length(public.ai_list_recent_changes(t.u2())) > 0, '');
SELECT t.chk('I07 after all of user 2''s attempts, user 1''s decks, strategy rows, cards and log rows are byte-for-byte unchanged',
  (SELECT md5(string_agg(to_jsonb(d)::text, '|' ORDER BY id)) FROM decks d WHERE user_id = t.u1()) = :'snap1'
  AND (SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY deck_id)) FROM deck_strategy s WHERE user_id = t.u1()) = :'snap2'
  AND (SELECT md5(string_agg(to_jsonb(c)::text, '|' ORDER BY id)) FROM deck_cards c WHERE user_id = t.u1()) = :'snap3'
  AND (SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY id)) FROM ai_change_log l WHERE user_id = t.u1()) = :'snap4', '');
-- Through the database roles (what a signed-in browser or a Claude token could reach directly): rows by RLS, no function access, no writes
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS u2_sees FROM public.ai_change_log \gset
SELECT count(*) AS u2_sees_u1 FROM public.ai_change_log WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset
SELECT t.att($q$SELECT public.ai_create_deck('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'Direct', 'modern', NULL)$q$)->>'err' AS e1 \gset
SELECT t.att($q$SELECT public.ai_set_deck_setup('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 1, '{"bracket":1}')$q$)->>'err' AS e2 \gset
SELECT t.att($q$SELECT public.ai_undo_group('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner')$q$)->>'err' AS e3 \gset
SELECT t.att($q$SELECT public._ai_undo_deck_create('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner')$q$)->>'err' AS e4 \gset
SELECT t.att($q$SELECT public._ai_set_primary_commander('00000000-0000-0000-0000-000000000002', 1, 1)::text::jsonb$q$)->>'err' AS e5 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.ai_change_log RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e6 \gset
SELECT t.att($q$WITH d AS (UPDATE public.ai_change_log SET undone_at = now(), undone_by = 'owner' RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e7 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES ('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'x', 'deck_create', 'x') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e8 \gset
RESET ROLE;
SELECT t.chk('I08 as a signed-in user 2 (RLS): sees only own log rows, none of user 1''s', :u2_sees_u1 = 0 AND :u2_sees > 0, :'u2_sees' || ' own rows, ' || :'u2_sees_u1' || ' of user 1');
SELECT t.chk('I09 signed-in users cannot call the writers, Undo, helpers or write the log',
  :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%' AND :'e4' LIKE 'permission denied%' AND :'e5' LIKE 'permission denied%' AND :'e6' LIKE 'permission denied%' AND :'e7' LIKE 'permission denied%' AND :'e8' LIKE 'permission denied%',
  concat_ws(' | ', :'e1', :'e2', :'e3', :'e4', :'e5', :'e6', :'e7', :'e8'));
SET ROLE anon;
SELECT t.att($q$SELECT public.ai_create_deck('00000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Anon', 'modern', NULL)$q$)->>'err' AS ea \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.ai_change_log$q$)->>'err' AS eb \gset
RESET ROLE;
SELECT t.chk('I10 the anonymous role can do neither', :'ea' LIKE 'permission denied%' AND :'eb' LIKE 'permission denied%', :'ea' || ' | ' || :'eb');
SELECT t.chk('I11 service role can run the writers (granted)', has_function_privilege('service_role', 'public.ai_create_deck(uuid,uuid,text,text,jsonb)', 'EXECUTE') AND has_function_privilege('service_role', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public._ai_undo_deck_create(uuid,uuid,text)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.ai_create_deck(uuid,uuid,text,text,jsonb)', 'EXECUTE'), '');
