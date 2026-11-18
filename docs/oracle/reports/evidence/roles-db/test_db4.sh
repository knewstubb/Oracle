# DB-4 throwaway test. Sourced by run.sh. Base = the real live migrations up to CC-15b, then DB-1, DB-2, DB-4 (DB-3 is NOT applied here: the two are independent).
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
f $D/20261118120000_roles_db1_card_roles.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fp1', t.fp())"
f $D/20261118120100_roles_db2_change_kinds.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fp2', t.fp())"
echo "== DB-2 stub: strategy points refused before DB-4"
$P <<'SQL'
INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity, user_id) VALUES (100, 'Card 1 alt', t.s(101)::text, 1, t.u1());
SELECT t.snap() AS s0 \gset
SELECT t.chk('E4-00 before DB-4 a strategy point request is refused (strategy_points_not_available) and writes nothing', t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"card_type":"artifact"}}]}')->>'err' = 'strategy_points_not_available' AND t.snap() = :'s0', '');
SQL
echo "== apply DB-4"
f $D/20261118120300_roles_db4_strategy_points.draft.sql
$P <<'SQL'
SELECT t.mkdeck(300, t.u1(), 40, 'Big', 1000);
SELECT t.chk('E4-01 table, row security (not forced) and the functions exist; the stubs are replaced', to_regclass('public.deck_strategy_points') IS NOT NULL
  AND (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = 'public.deck_strategy_points'::regclass)
  AND to_regprocedure('public.owner_save_strategy_point(uuid,integer,bigint,jsonb)') IS NOT NULL AND to_regprocedure('public.owner_delete_strategy_point(uuid,integer,bigint)') IS NOT NULL
  AND to_regprocedure('public.owner_decide_strategy_point(uuid,integer,bigint,text)') IS NOT NULL AND to_regprocedure('public.owner_accept_strategy_point_proposals(uuid,integer,uuid)') IS NOT NULL
  AND to_regprocedure('public.get_deck_strategy_points(uuid,integer)') IS NOT NULL AND to_regprocedure('public._strategy_point_normalize(uuid,integer,jsonb,jsonb,text)') IS NOT NULL
  AND to_regprocedure('public._ai_strategy_point_prepare(uuid,jsonb)') IS NOT NULL AND to_regclass('public.deck_card_jobs') IS NULL
  AND position('strategy_points_not_available' IN pg_get_functiondef('public._ai_plan_strategy_point(uuid,jsonb)'::regprocedure)) = 0, '');
SELECT t.chk('E4-02 DB-3 is not needed: a role request still works, and a job request is still refused (jobs_not_available)',
  t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['ramp'])))#>>'{res,outcome}' = 'applied' AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['ramp'], NULL, '{"name":"Engine"}')))->>'err' = 'jobs_not_available', '');
SELECT t.chk('E4-03 constraints: statement 1 to 200 and trimmed; covers consistent; the effect is both parts or none; card types and groups from the lists; one row per sentence per deck (any letter case)',
  t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, '', 'card_type', 'artifact', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, repeat('s', 201), 'card_type', 'artifact', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, ' padded ', 'card_type', 'artifact', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, proposer, state) VALUES (t.u1(), 100, 'a', 'card_type', 'owner', 'accepted')$q$) LIKE '%deck_strategy_points_covers%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, covers_oracle_ids, proposer, state) VALUES (t.u1(), 100, 'a', 'card_type', 'artifact', ARRAY[t.o(1)], 'owner', 'accepted')$q$) LIKE '%deck_strategy_points_covers%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, covers_oracle_ids, proposer, state) VALUES (t.u1(), 100, 'a', 'cards', ARRAY[]::uuid[], 'owner', 'accepted')$q$) LIKE '%deck_strategy_points_covers%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, covers_oracle_ids, proposer, state) VALUES (t.u1(), 100, 'a', 'cards', (SELECT array_agg(t.o(i)) FROM generate_series(1, 101) i), 'owner', 'accepted')$q$) LIKE '%deck_strategy_points_covers%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, effect_kind, proposer, state) VALUES (t.u1(), 100, 'a', 'card_type', 'artifact', 'counts_as', 'owner', 'accepted')$q$) LIKE '%deck_strategy_points_effect_pair%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, effect_kind, effect_group, proposer, state) VALUES (t.u1(), 100, 'a', 'card_type', 'artifact', 'counts_as', 'lands', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, 'a', 'card_type', 'dragon', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, 'a', 'card_type', 'artifact', 'claude', 'accepted')$q$) LIKE '%deck_strategy_points_proposer_state%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state, batch_id) VALUES (t.u1(), 100, 'a', 'card_type', 'artifact', 'owner', 'accepted', gen_random_uuid())$q$) LIKE '%deck_strategy_points_claude_only_batch%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, 'Same', 'card_type', 'artifact', 'owner', 'accepted'), (t.u1(), 100, 'SAME', 'card_type', 'creature', 'owner', 'accepted')$q$) LIKE '%deck_strategy_points_one_sentence%'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, 'Same', 'card_type', 'artifact', 'owner', 'accepted'), (t.u2(), 200, 'Same', 'card_type', 'artifact', 'owner', 'accepted')$q$) = 'ok'
  AND t.try($q$INSERT INTO deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES (t.u1(), 100, 'No effect point', 'card_type', 'artifact', 'owner', 'accepted')$q$) = 'ok', '');
SQL
echo "== the owner's own strategy points"
$P <<'SQL'
SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"  Artifacts count as ramp in this deck ","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as","group":"ramp"},"reason":"The rocks do the work"}') AS r \gset o1_
SELECT :'o1_r'::jsonb#>>'{current,id}' AS pid1 \gset
SELECT t.chk('E4-10 create: trimmed, owner and accepted, previous empty, effect stored', :'o1_r'::jsonb->'previous' = 'null'::jsonb AND :'o1_r'::jsonb#>>'{current,statement}' = 'Artifacts count as ramp in this deck' AND :'o1_r'::jsonb#>>'{current,proposer}' = 'owner'
  AND :'o1_r'::jsonb#>>'{current,state}' = 'accepted' AND :'o1_r'::jsonb#>>'{current,effect_kind}' = 'counts_as' AND :'o1_r'::jsonb#>>'{current,effect_group}' = 'ramp', :'o1_r');
SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"The counter-cost cards do not count as removal","covers":{"oracle_ids":["a0000000-0000-4000-8000-000000000003","a0000000-0000-4000-8000-000000000001","a0000000-0000-4000-8000-000000000003"]},"effect":{"kind":"does_not_count_as","group":"interaction"}}') AS r \gset o2_
SELECT t.chk('E4-11 a hand-picked list is stored as sorted oracle ids without repeats', (SELECT covers_kind = 'cards' AND covers_oracle_ids = ARRAY[t.o(1), t.o(3)] AND card_type IS NULL FROM deck_strategy_points WHERE id = (:'o2_r'::jsonb#>>'{current,id}')::bigint), :'o2_r');
SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, jsonb_build_object('statement','Murky Business keeps the counter cost','covers',jsonb_build_object('cards',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Card 1'),'card_name','Card 1'),jsonb_build_object('id',t.slot(100,'Card 1 alt'),'card_name','Card 1 alt'),jsonb_build_object('id',t.slot(100,'Card 2'),'card_name','Card 2'))))) AS r \gset o3_
SELECT t.chk('E4-12 cards picked by slot: two slots of the same card are one oracle id; a point with no effect stores none', (SELECT covers_oracle_ids = ARRAY[t.o(1), t.o(2)] AND effect_kind IS NULL AND effect_group IS NULL FROM deck_strategy_points WHERE id = (:'o3_r'::jsonb#>>'{current,id}')::bigint), :'o3_r');
SELECT public.owner_save_strategy_point(t.u1(), 100, :'pid1'::bigint, '{"statement":"Artifacts count as ramp in this deck","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as","group":"card_advantage"}}') AS r \gset o4_
SELECT t.chk('E4-13 edit: previous row returned for the 10-second Undo, the same row changes', :'o4_r'::jsonb#>>'{previous,effect_group}' = 'ramp' AND :'o4_r'::jsonb#>>'{current,effect_group}' = 'card_advantage' AND :'o4_r'::jsonb#>>'{current,id}' = :'pid1'
  AND :'o4_r'::jsonb#>>'{current,reason}' IS NULL, :'o4_r');
SELECT t.chk('E4-14 refusals: empty / long statement, covers (none, two, empty list, 101 cards, not a list), unknown card type, one-sided effect, unknown group, reason over 200, unknown card, a slot that is not in the deck',
  t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"  ","covers":{"card_type":"artifact"}}')$q$)->>'err' = 'bad_statement'
  AND t.att(format($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"%s","covers":{"card_type":"artifact"}}')$q$, repeat('s', 201)))->>'err' = 'bad_statement'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a"}')$q$)->>'err' = 'bad_covers'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"card_type":"artifact","cards":[]}}')$q$)->>'err' = 'bad_covers'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"oracle_ids":[]}}')$q$)->>'err' = 'bad_covers'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, jsonb_build_object('statement','a','covers',jsonb_build_object('oracle_ids',(SELECT jsonb_agg(t.o(i)) FROM generate_series(1, 101) i))))$q$)->>'err' = 'bad_covers'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"oracle_ids":"x"}}')$q$)->>'err' = 'bad_covers'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"card_type":"dragon"}}')$q$)->>'err' = 'unknown_card_type'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as"}}')$q$)->>'err' = 'bad_effect'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as","group":"lands"}}')$q$)->>'err' = 'bad_effect'
  AND t.att(format($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"card_type":"artifact"},"reason":"%s"}')$q$, repeat('r', 201)))->>'err' = 'reason_too_long'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"oracle_ids":["a0000000-0000-4000-8000-000000009999"]}}')$q$)->>'err' = 'unknown_card'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"a","covers":{"cards":[{"id":999999,"card_name":"Card 1"}]}}')$q$)->>'err' = 'slot_not_found'
  AND (SELECT count(*) FROM deck_strategy_points WHERE user_id = t.u1()) = 3, '');
SELECT t.chk('E4-15 the same sentence twice (any letter case) is refused (point_exists); someone else''s deck is deck_not_found; an unknown point is point_not_found',
  t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"ARTIFACTS count as RAMP in this deck","covers":{"card_type":"artifact"}}')$q$)->>'err' = 'point_exists'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u2(), 100, NULL, '{"statement":"zz","covers":{"card_type":"artifact"}}')$q$)->>'err' = 'deck_not_found'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, 999999, '{"statement":"zz","covers":{"card_type":"artifact"}}')$q$)->>'err' = 'point_not_found'
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u2(), 200, (SELECT min(id) FROM deck_strategy_points WHERE user_id = t.u1()), '{"statement":"zz","covers":{"card_type":"artifact"}}')$q$)->>'err' = 'point_not_found', '');
SELECT public.owner_delete_strategy_point(t.u1(), 100, (:'o3_r'::jsonb#>>'{current,id}')::bigint) AS r \gset o5_
SELECT t.chk('E4-16 delete returns the deleted row (so the route can offer Undo by saving it again); a second delete is point_not_found; user 2 cannot delete user 1''s point',
  :'o5_r'::jsonb#>>'{deleted,statement}' = 'Murky Business keeps the counter cost' AND t.att(format($q$SELECT public.owner_delete_strategy_point(t.u1(), 100, %s)$q$, :'o3_r'::jsonb#>>'{current,id}'))->>'err' = 'point_not_found'
  AND t.att(format($q$SELECT public.owner_delete_strategy_point(t.u2(), 100, %s)$q$, :'pid1'))->>'err' = 'deck_not_found' AND t.att(format($q$SELECT public.owner_delete_strategy_point(t.u2(), 200, %s)$q$, :'pid1'))->>'err' = 'point_not_found'
  AND EXISTS (SELECT 1 FROM deck_strategy_points WHERE id = :'pid1'::bigint), :'o5_r');
SELECT t.chk('E4-17 the reader returns every row of the deck for its owner only', (SELECT count(*) = 2 FROM get_deck_strategy_points(t.u1(), 100)) AND t.att($q$SELECT to_jsonb(count(*)) FROM get_deck_strategy_points(t.u2(), 100)$q$)->>'err' = 'deck_not_found', '');
SELECT count(public.owner_save_strategy_point(t.u1(), 100, NULL, jsonb_build_object('statement', 'Filler ' || i, 'covers', jsonb_build_object('card_type', 'creature')))) AS nfill FROM generate_series(1, 28) i \gset
SELECT t.chk('E4-18 the 30-per-deck limit: 28 more fill the deck to 30; the 31st is refused (too_many_strategy_points) and writes nothing',
  :nfill = 28 AND (SELECT count(*) FROM deck_strategy_points WHERE user_id = t.u1() AND deck_id = 100) = 30
  AND t.att($q$SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"The 31st","covers":{"card_type":"land"}}')$q$)->>'err' = 'too_many_strategy_points'
  AND (SELECT count(*) FROM deck_strategy_points WHERE user_id = t.u1() AND deck_id = 100) = 30, '');
DELETE FROM deck_strategy_points WHERE user_id = t.u1() AND deck_id = 100 AND statement LIKE 'Filler %';
SQL
echo "== Claude proposes strategy points"
$P <<'SQL'
SELECT t.age();
SELECT t.snap() AS s0 \gset
SELECT jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(
  jsonb_build_object('statement', 'Enchantments count as card advantage', 'covers', jsonb_build_object('card_type', 'enchantment'), 'effect', jsonb_build_object('kind', 'counts_as', 'group', 'card_advantage'), 'reason', 'Rhystic-style draws'),
  jsonb_build_object('statement', 'Treasure makers count as ramp', 'covers', jsonb_build_object('cards', jsonb_build_array(jsonb_build_object('id', t.slot(100,'Card 4'), 'card_name', 'Card 4'), jsonb_build_object('id', t.slot(100,'Card 5'), 'card_name', 'Card 5'))), 'effect', jsonb_build_object('kind', 'counts_as', 'group', 'ramp')),
  jsonb_build_object('statement', 'Sorceries are not interaction here', 'covers', jsonb_build_object('card_type', 'sorcery')))) AS pl \gset
SELECT t.sub('strategy_point', :'pl'::jsonb, NULL, NULL, true) AS r \gset d_
SELECT t.chk('E4-20 dry run: would_apply, n = 3 points, covers_count 2 for the hand-picked list, nothing written', :'d_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND (:'d_r'::jsonb#>>'{res,plan,n}')::int = 3
  AND :'d_r'::jsonb#>>'{res,plan,changes,1,covers_count}' = '2' AND NOT (:'d_r'::jsonb#>'{res,plan,changes,0}' ? 'fields') AND t.snap() = :'s0', :'d_r');
SELECT t.sub('strategy_point', :'pl'::jsonb) AS r \gset a_
SELECT t.gid(:'a_r'::jsonb) AS g1 \gset
SELECT t.chk('E4-21 applied: 3 points, ONE log row per point (3) in one group, each row a waiting Claude row tagged with the group; the log row holds the point and its id',
  :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'a_r'::jsonb#>>'{res,count}')::int = 3 AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'g1' AND kind = 'strategy_point') = 3
  AND (SELECT count(*) = 3 AND bool_and(proposer = 'claude' AND state = 'to_look_at' AND batch_id = :'g1') FROM deck_strategy_points WHERE user_id = t.u1() AND batch_id = :'g1')
  AND (SELECT before = '{}'::jsonb AND (after->>'point_id')::bigint = (SELECT id FROM deck_strategy_points WHERE statement = 'Treasure makers count as ramp') AND after->>'covers_kind' = 'cards' AND deck_card_id IS NULL AND oracle_id IS NULL
         FROM ai_change_log WHERE group_id = :'g1' AND card_name = 'Treasure makers count as ramp'), :'a_r');
SELECT t.chk('E4-22 the hand-picked list is stored as oracle ids, never printings', (SELECT covers_oracle_ids = ARRAY[t.o(4), t.o(5)] FROM deck_strategy_points WHERE statement = 'Treasure makers count as ramp'), '');
SELECT t.snap() AS s1 \gset
SELECT t.chk('E4-23 the same request again: nothing_to_change, nothing written', t.sub('strategy_point', :'pl'::jsonb)->>'err' = 'nothing_to_change' AND t.snap() = :'s1', '');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'ARTIFACTS count as ramp in this deck', 'covers', jsonb_build_object('card_type', 'artifact')), jsonb_build_object('statement', 'Brand new point', 'covers', jsonb_build_object('card_type', 'land'))))) AS r \gset b_
SELECT t.chk('E4-24 a point with the same sentence as the owner''s is skipped (already_exists); Claude never writes or changes an owner row', :'b_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'already_exists' AND (:'b_r'::jsonb#>>'{res,plan,n}')::int = 1
  AND (SELECT effect_group = 'card_advantage' AND proposer = 'owner' FROM deck_strategy_points WHERE id = :'pid1'::bigint), :'b_r');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Brand new point', 'covers', jsonb_build_object('card_type', 'land'), 'effect', jsonb_build_object('kind', 'does_not_count_as', 'group', 'ramp'))))) AS r \gset c_
SELECT t.chk('E4-25 Claude changing its own waiting point rewrites it (one log row, the earlier version in "before")', :'c_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT before->>'statement' = 'Brand new point' AND before->>'effect_kind' IS NULL AND after->>'effect_kind' = 'does_not_count_as' AND before->>'state' = 'to_look_at'
  FROM ai_change_log WHERE group_id = t.gid(:'c_r'::jsonb)) AND (SELECT count(*) FROM deck_strategy_points WHERE statement = 'Brand new point') = 1, :'c_r');
SELECT id AS pid_s FROM deck_strategy_points WHERE statement = 'Sorceries are not interaction here' \gset
SELECT public.owner_decide_strategy_point(t.u1(), 100, :'pid_s'::bigint, 'dismiss') AS r \gset dm_
SELECT t.chk('E4-26 dismiss keeps the row marked dismissed (the memory), previous and current returned; the reader still lists it, flagged', :'dm_r'::jsonb#>>'{previous,state}' = 'to_look_at' AND :'dm_r'::jsonb#>>'{current,state}' = 'dismissed'
  AND (SELECT state = 'dismissed' FROM get_deck_strategy_points(t.u1(), 100) WHERE id = :'pid_s'::bigint), :'dm_r');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Sorceries are not interaction here', 'covers', jsonb_build_object('card_type', 'sorcery')), jsonb_build_object('statement', 'Another new point', 'covers', jsonb_build_object('card_type', 'instant')))), NULL, NULL, true) AS r \gset m_
SELECT t.chk('E4-27 proposing the dismissed point again is skipped (previously_dismissed); a changed version of it would come back', :'m_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'previously_dismissed'
  AND t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Sorceries are not interaction here', 'covers', jsonb_build_object('card_type', 'sorcery'), 'effect', jsonb_build_object('kind', 'does_not_count_as', 'group', 'interaction')))), NULL, NULL, true)#>>'{res,plan,n}' = '1', :'m_r');
SELECT t.chk('E4-28 the same sentence in another deck or for another user is not blocked by the dismissal', (SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 200, 'points', jsonb_build_array(jsonb_build_object('statement', 'Sorceries are not interaction here', 'covers', jsonb_build_object('card_type', 'sorcery')))), t.u2(), t.c2(), true)#>>'{res,outcome}') = 'would_apply', '');
SQL
echo "== refusals write nothing"
$P <<'SQL'
SELECT t.snap() AS s0 \gset
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":" ","covers":{"card_type":"artifact"}}]}') AS r \gset e1_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x"}]}') AS r \gset e2_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"card_type":"dragon"}}]}') AS r \gset e3_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as"}}]}') AS r \gset e4_
SELECT t.sub('strategy_point', jsonb_build_object('deck_id',100,'points',jsonb_build_array(jsonb_build_object('statement','x','covers',jsonb_build_object('card_type','artifact'),'reason',repeat('r',201))))) AS r \gset e5_
SELECT t.sub('strategy_point', jsonb_build_object('deck_id',100,'points',jsonb_build_array(jsonb_build_object('statement','x','covers',jsonb_build_object('cards',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Card 4'),'card_name','Wrong')))))) ) AS r \gset e6_
SELECT t.sub('strategy_point', jsonb_build_object('deck_id',100,'points',jsonb_build_array(jsonb_build_object('statement','x','covers',jsonb_build_object('cards',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Mystery Card'),'card_name','Mystery Card'))))))) AS r \gset e7_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"card_type":"artifact"}}]}', t.u2(), t.c2()) AS r \gset e8_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"card_type":"artifact"}}]}', t.u1(), t.c1_off()) AS r \gset e9_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[]}') AS r \gset e10_
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', (SELECT jsonb_agg(jsonb_build_object('statement', 'p' || i, 'covers', jsonb_build_object('card_type', 'land'))) FROM generate_series(1, 11) i))) AS r \gset e11_
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement','good','covers',jsonb_build_object('card_type','land')), jsonb_build_object('statement','bad','covers',jsonb_build_object('card_type','dragon'))))) AS r \gset e12_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":{"a":1}}') AS r \gset e13_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"oracle_ids":["a0000000-0000-4000-8000-000000000001"],"card_type":"land"}}]}') AS r \gset e14_
SELECT t.chk('E4-30 blank sentence: bad_statement', :'e1_r'::jsonb->>'err' = 'bad_statement', :'e1_r');
SELECT t.chk('E4-31 no covers: bad_covers; both a type and a list: bad_covers', :'e2_r'::jsonb->>'err' = 'bad_covers' AND :'e14_r'::jsonb->>'err' = 'bad_covers', '');
SELECT t.chk('E4-32 unknown card type: unknown_card_type; effect with a kind but no group: bad_effect; reason over 200: reason_too_long', :'e3_r'::jsonb->>'err' = 'unknown_card_type' AND :'e4_r'::jsonb->>'err' = 'bad_effect' AND :'e5_r'::jsonb->>'err' = 'reason_too_long', '');
SELECT t.chk('E4-33 a slot that does not match: slot_not_found; a card that cannot be identified: card_not_identified', :'e6_r'::jsonb->>'err' = 'slot_not_found' AND :'e7_r'::jsonb->>'err' = 'card_not_identified', '');
SELECT t.chk('E4-34 user 2 on user 1''s deck: deck_not_found; a switched-off connection: connection_revoked; no points or points that are not a list: invalid_request', :'e8_r'::jsonb->>'err' = 'deck_not_found' AND :'e9_r'::jsonb->>'err' = 'connection_revoked'
  AND :'e10_r'::jsonb->>'err' = 'invalid_request' AND :'e13_r'::jsonb->>'err' = 'invalid_request', '');
SELECT t.chk('E4-35 11 points in one request: too_many_points_in_request', :'e11_r'::jsonb->>'err' = 'too_many_points_in_request', :'e11_r');
SELECT t.chk('E4-36 one bad point among good ones refuses the whole request; nothing partly proposed', :'e12_r'::jsonb->>'err' = 'unknown_card_type', :'e12_r');
SELECT t.chk('E4-37 after every refusal the data is byte for byte unchanged', t.snap() = :'s0', '');
-- the 30 limit for Claude
DELETE FROM deck_strategy_points WHERE user_id = t.u1() AND deck_id = 100 AND proposer = 'claude';
SELECT count(public.owner_save_strategy_point(t.u1(), 100, NULL, jsonb_build_object('statement', 'Filler ' || i, 'covers', jsonb_build_object('card_type', 'creature')))) AS nfill FROM generate_series(1, 28) i \gset
SELECT t.snap() AS s1 \gset
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"One more","covers":{"card_type":"land"}},{"statement":"Two more","covers":{"card_type":"land"}},{"statement":"Three more","covers":{"card_type":"land"}}]}') AS r \gset l1_
SELECT t.chk('E4-38 the deck holds 30 points (2 + 28): 3 more are refused (too_many_strategy_points), nothing written', (SELECT count(*) FROM deck_strategy_points WHERE user_id = t.u1() AND deck_id = 100 AND state <> 'dismissed') = 30 AND :'l1_r'::jsonb->>'err' = 'too_many_strategy_points' AND t.snap() = :'s1', :'l1_r');
DELETE FROM deck_strategy_points WHERE user_id = t.u1() AND deck_id = 100 AND statement LIKE 'Filler %';
SQL
echo "== Undo of a batch of points"
$P <<'SQL'
SELECT t.age();
SELECT id AS pid_dis FROM deck_strategy_points WHERE statement = 'Sorceries are not interaction here' \gset
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(
  jsonb_build_object('statement', 'Sorceries are not interaction here', 'covers', jsonb_build_object('card_type', 'sorcery'), 'effect', jsonb_build_object('kind', 'does_not_count_as', 'group', 'interaction')),
  jsonb_build_object('statement', 'Batch point B', 'covers', jsonb_build_object('card_type', 'creature'), 'effect', jsonb_build_object('kind', 'counts_as', 'group', 'ramp')),
  jsonb_build_object('statement', 'Batch point C', 'covers', jsonb_build_object('card_type', 'instant'))))) AS r \gset u1_
SELECT t.gid(:'u1_r'::jsonb) AS gu \gset
SELECT t.chk('E4-40 a 3-point batch applied (the dismissed point came back in a changed version)', (SELECT count(*) FROM ai_change_log WHERE group_id = :'gu') = 3 AND (SELECT state = 'to_look_at' AND effect_kind = 'does_not_count_as' FROM deck_strategy_points WHERE id = :'pid_dis'::bigint), :'u1_r');
SELECT t.und(:'gu', 'claude', t.u2(), t.c2()) AS r \gset u2_
SELECT t.chk('E4-41 user 2 cannot undo user 1''s batch', COALESCE((:'u2_r'::jsonb#>>'{res,success}')::boolean, false) = false AND (SELECT count(*) FROM deck_strategy_points WHERE batch_id = :'gu') = 3, :'u2_r');
SELECT id AS pid_b FROM deck_strategy_points WHERE statement = 'Batch point B' \gset
SELECT public.owner_save_strategy_point(t.u1(), 100, :'pid_b'::bigint, '{"statement":"Batch point B","covers":{"card_type":"creature"},"effect":{"kind":"counts_as","group":"card_advantage"}}') AS r \gset ch_
SELECT t.chk('E4-42 the owner edits a Claude point: it becomes the owner''s ("Change"), no longer waiting, no batch', :'ch_r'::jsonb#>>'{previous,proposer}' = 'claude' AND :'ch_r'::jsonb#>>'{current,proposer}' = 'owner' AND :'ch_r'::jsonb#>>'{current,state}' = 'accepted' AND :'ch_r'::jsonb#>>'{current,batch_id}' IS NULL, :'ch_r');
SELECT t.snap() AS sb \gset
SELECT t.und(:'gu', 'claude') AS r \gset u3_
SELECT t.chk('E4-43 Claude''s Undo is refused (changed_since, naming the point) and nothing at all changes', :'u3_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND :'u3_r'::jsonb#>>'{res,refused,card}' = 'Batch point B' AND t.snap() = :'sb', :'u3_r');
SELECT t.und(:'gu', 'owner') AS r \gset u4_
SELECT t.chk('E4-44 the owner''s Undo restores the 2 untouched points and leaves the edited one alone, saying so', (:'u4_r'::jsonb#>>'{res,undone}')::int = 2 AND :'u4_r'::jsonb#>>'{res,left_alone,0,card}' = 'Batch point B'
  AND NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE statement = 'Batch point C') AND EXISTS (SELECT 1 FROM deck_strategy_points WHERE id = :'pid_b'::bigint AND proposer = 'owner' AND effect_group = 'card_advantage'), :'u4_r');
SELECT t.chk('E4-45 the dismissed point that the batch had brought back is dismissed again, exactly as before (the memory survives Undo)', (SELECT state = 'dismissed' AND effect_kind IS NULL AND proposer = 'claude' AND batch_id IS NULL FROM deck_strategy_points WHERE id = :'pid_dis'::bigint), '');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Clean batch 1', 'covers', jsonb_build_object('card_type', 'artifact')), jsonb_build_object('statement', 'Clean batch 2', 'covers', jsonb_build_object('card_type', 'land'))))) AS r \gset v1_
SELECT t.und(t.gid(:'v1_r'::jsonb), 'claude') AS r \gset v2_
SELECT t.chk('E4-46 Claude undoes a clean batch in one go (both points gone, both log rows stamped); undoing again is already_undone', (:'v2_r'::jsonb#>>'{res,success}')::boolean AND (:'v2_r'::jsonb#>>'{res,undone}')::int = 2
  AND NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE statement LIKE 'Clean batch%') AND t.und(t.gid(:'v1_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'already_undone', :'v2_r');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Window point', 'covers', jsonb_build_object('card_type', 'artifact'))))) AS r \gset w1_
SELECT t.expire(t.gid(:'w1_r'::jsonb));
SELECT t.chk('E4-47 after 7 days Undo is closed for both (window_closed); a switched-off connection and an unknown actor are refused', t.und(t.gid(:'w1_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'window_closed' AND t.und(t.gid(:'w1_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'window_closed'
  AND t.und(t.gid(:'w1_r'::jsonb), 'claude', t.u1(), t.c1_off())->>'err' = 'connection_revoked' AND t.und(t.gid(:'w1_r'::jsonb), 'bob')->>'err' = 'invalid_actor', '');
SELECT t.chk('E4-48 Recent changes carries the sentence data for a point', (SELECT e->'label_detail'->>'statement' = 'Window point' AND e->'label_detail'->>'covers_kind' = 'card_type' AND e->'label_detail'->>'card_type' = 'artifact'
  FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'w1_r'::jsonb)::text) AND (SELECT count(*) FROM jsonb_array_elements(public.ai_list_recent_changes(t.u2())) e WHERE e->>'user_id' = t.u1()::text) = 0, '');
SQL
echo "== accept, held requests, isolation, RLS, guard"
$P <<'SQL'
SELECT t.age();
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Accept me 1', 'covers', jsonb_build_object('card_type', 'artifact')), jsonb_build_object('statement', 'Accept me 2', 'covers', jsonb_build_object('card_type', 'land'))))) AS r \gset ac_
SELECT id AS pid_ac FROM deck_strategy_points WHERE statement = 'Accept me 1' \gset
SELECT public.owner_decide_strategy_point(t.u1(), 100, :'pid_ac'::bigint, 'accept') AS r \gset ac1_
SELECT t.chk('E4-50 accept turns the Claude point into the owner''s in place (same row), previous returned', :'ac1_r'::jsonb#>>'{previous,proposer}' = 'claude' AND :'ac1_r'::jsonb#>>'{current,proposer}' = 'owner' AND :'ac1_r'::jsonb#>>'{current,id}' = :'pid_ac', :'ac1_r');
SELECT t.chk('E4-51 deciding on something that is not waiting is no_proposal; an unknown point is point_not_found; bad decision refused; user 2 refused',
  t.att(format($q$SELECT public.owner_decide_strategy_point(t.u1(), 100, %s, 'accept')$q$, :'pid_ac'))->>'err' = 'no_proposal' AND t.att($q$SELECT public.owner_decide_strategy_point(t.u1(), 100, 999999, 'accept')$q$)->>'err' = 'point_not_found'
  AND t.att(format($q$SELECT public.owner_decide_strategy_point(t.u1(), 100, %s, 'maybe')$q$, :'pid_ac'))->>'err' = 'bad_decision' AND t.att(format($q$SELECT public.owner_decide_strategy_point(t.u2(), 100, %s, 'accept')$q$, :'pid_ac'))->>'err' = 'deck_not_found', '');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Accept me 3', 'covers', jsonb_build_object('card_type', 'battle'))))) AS r \gset ac3_
SELECT public.owner_accept_strategy_point_proposals(t.u1(), NULL, t.gid(:'ac3_r'::jsonb)) AS r \gset ac4_
SELECT public.owner_accept_strategy_point_proposals(t.u1(), 100, NULL) AS r \gset ac5_
SELECT t.chk('E4-52 accept all by batch (1 point), then by deck (the rest waiting in the deck, 1)', (:'ac4_r'::jsonb->>'accepted')::int = 1 AND (:'ac5_r'::jsonb->>'accepted')::int = 1 AND NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE user_id = t.u1() AND state = 'to_look_at'), :'ac4_r' || :'ac5_r');
SELECT t.chk('E4-53 accept-all needs a scope; another user''s deck refused; another user''s batch accepts 0', t.att($q$SELECT public.owner_accept_strategy_point_proposals(t.u1(), NULL, NULL)$q$)->>'err' = 'invalid_request'
  AND t.att($q$SELECT public.owner_accept_strategy_point_proposals(t.u2(), 100, NULL)$q$)->>'err' = 'deck_not_found' AND (public.owner_accept_strategy_point_proposals(t.u2(), NULL, t.gid(:'ac3_r'::jsonb))->>'accepted')::int = 0, '');
-- a request that has to wait (the hourly total is used up) and is then approved
INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) SELECT t.u1(), gen_random_uuid(), 'Claude', 'deck_add', 'filler' FROM generate_series(1, 497);
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Held 1', 'covers', jsonb_build_object('card_type', 'artifact')), jsonb_build_object('statement', 'Held 2', 'covers', jsonb_build_object('card_type', 'land')),
  jsonb_build_object('statement', 'Held 3', 'covers', jsonb_build_object('card_type', 'creature'))))) AS r \gset h1_
SELECT :'h1_r'::jsonb#>>'{res,pending_id}' AS pid \gset
SELECT t.chk('E4-54 when the hourly total is used up the request waits for the owner (busy) and writes nothing', :'h1_r'::jsonb#>>'{res,outcome}' = 'pending' AND :'h1_r'::jsonb#>>'{res,reason}' = 'busy' AND (SELECT card_count = 3 AND action = 'strategy_point' FROM ai_pending_changes WHERE id = :'pid'::uuid)
  AND NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE statement LIKE 'Held %'), left(:'h1_r', 200));
SELECT t.appr(:'pid'::uuid) AS r \gset h2_
SELECT t.chk('E4-55 approving applies the 3 points, marked approved by the owner', :'h2_r'::jsonb#>>'{res,outcome}' = 'approved' AND (:'h2_r'::jsonb#>>'{res,count}')::int = 3 AND (SELECT count(*) FROM ai_change_log WHERE group_id = (:'h2_r'::jsonb#>>'{res,group_id}')::uuid AND approved_by_owner) = 3
  AND (SELECT count(*) FROM deck_strategy_points WHERE statement LIKE 'Held %' AND state = 'to_look_at') = 3, left(:'h2_r', 200));
SELECT t.und((:'h2_r'::jsonb#>>'{res,group_id}')::uuid, 'claude') AS r \gset h3_
SELECT t.chk('E4-56 Claude cannot undo a batch the owner approved (owner_only)', :'h3_r'::jsonb#>>'{res,refused,code}' = 'owner_only', :'h3_r');
SELECT t.sub('strategy_point', jsonb_build_object('deck_id', 100, 'points', jsonb_build_array(jsonb_build_object('statement', 'Held 4', 'covers', jsonb_build_object('card_type', 'artifact')), jsonb_build_object('statement', 'Held 5', 'covers', jsonb_build_object('card_type', 'land')), jsonb_build_object('statement', 'Held 6', 'covers', jsonb_build_object('card_type', 'creature'))))) AS r \gset h4_
SELECT :'h4_r'::jsonb#>>'{res,pending_id}' AS pid2 \gset
SELECT public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"held 5","covers":{"card_type":"land"}}');
SELECT t.snap() AS s0 \gset
SELECT t.appr(:'pid2'::uuid) AS r \gset h5_
SELECT t.chk('E4-57 a held request that has gone stale (the owner has since written one of its sentences) is applied only for what still changes: Held 5 is skipped (already_exists), the other 2 are applied',
  :'h5_r'::jsonb#>>'{res,outcome}' = 'approved' AND (:'h5_r'::jsonb#>>'{res,count}')::int = 2, left(:'h5_r', 200));
ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE card_name = 'filler'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard;
-- RLS for a second signed-in user
SELECT public.owner_save_strategy_point(t.u2(), 200, NULL, '{"statement":"User 2 point","covers":{"card_type":"artifact"}}');
SELECT t.snap() AS s2 \gset
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS of_u1 FROM public.deck_strategy_points WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2_
SELECT count(*) AS own FROM public.deck_strategy_points \gset u2_
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES ('00000000-0000-0000-0000-000000000002', 200, 'x', 'card_type', 'artifact', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e1 \gset
SELECT t.att($q$WITH u AS (UPDATE public.deck_strategy_points SET statement = 'Hacked' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e2 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_strategy_points RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e3 \gset
SELECT t.att($q$SELECT public.owner_save_strategy_point('00000000-0000-0000-0000-000000000002', 200, NULL, '{}')$q$)->>'err' AS f1 \gset
SELECT t.att($q$SELECT public.owner_delete_strategy_point('00000000-0000-0000-0000-000000000002', 200, 1)$q$)->>'err' AS f2 \gset
SELECT t.att($q$SELECT public.owner_decide_strategy_point('00000000-0000-0000-0000-000000000002', 200, 1, 'accept')$q$)->>'err' AS f3 \gset
SELECT t.att($q$SELECT public.owner_accept_strategy_point_proposals('00000000-0000-0000-0000-000000000002', 200, NULL)$q$)->>'err' AS f4 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.get_deck_strategy_points('00000000-0000-0000-0000-000000000002', 200)$q$)->>'err' AS f5 \gset
SELECT t.att($q$SELECT public._ai_plan_strategy_point('00000000-0000-0000-0000-000000000002', '{}')$q$)->>'err' AS f6 \gset
SELECT t.att($q$SELECT public._ai_execute_strategy_point('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'x', '{}', NULL, false)$q$)->>'err' AS f7 \gset
SELECT t.att($q$SELECT public._ai_undo_strategy_point('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner')$q$)->>'err' AS f8 \gset
SELECT t.att($q$SELECT public._strategy_point_normalize('00000000-0000-0000-0000-000000000002', 200, '{}', '{}', 'x')$q$)->>'err' AS f9 \gset
RESET ROLE;
SELECT t.chk('E4-60 signed-in user 2 sees only their own points (none of user 1''s)', :u2_of_u1 = 0 AND :u2_own = 1, 'own ' || :'u2_own' || ' of user 1 ' || :'u2_of_u1');
SELECT t.chk('E4-61 signed-in users cannot insert, update, delete points or call any strategy point function', :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%'
  AND :'f1' LIKE 'permission denied%' AND :'f2' LIKE 'permission denied%' AND :'f3' LIKE 'permission denied%' AND :'f4' LIKE 'permission denied%' AND :'f5' LIKE 'permission denied%' AND :'f6' LIKE 'permission denied%'
  AND :'f7' LIKE 'permission denied%' AND :'f8' LIKE 'permission denied%' AND :'f9' LIKE 'permission denied%', concat_ws(' | ', :'e1', :'f1', :'f9'));
GRANT INSERT, UPDATE, DELETE ON public.deck_strategy_points TO authenticated;
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT t.att($q$WITH u AS (UPDATE public.deck_strategy_points SET statement = 'Hacked' WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$) AS g1 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_strategy_points WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$) AS g2 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_strategy_points (user_id, deck_id, statement, covers_kind, card_type, proposer, state) VALUES ('00000000-0000-0000-0000-000000000001', 100, 'Planted', 'card_type', 'artifact', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g3 \gset
RESET ROLE;
REVOKE INSERT, UPDATE, DELETE ON public.deck_strategy_points FROM authenticated;
SELECT t.chk('E4-62 with write access wrongly granted, user 2 still changes 0 of user 1''s rows and cannot insert (row security); data byte for byte unchanged', :'g1'::jsonb#>>'{res}' = '0' AND :'g2'::jsonb#>>'{res}' = '0' AND :'g3' LIKE '%row-level security%' AND t.snap() = :'s2', :'g1' || :'g2' || :'g3');
SET ROLE anon;
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.deck_strategy_points$q$)->>'err' AS a1 \gset
RESET ROLE;
SELECT t.chk('E4-63 the anonymous role cannot read points', :'a1' LIKE 'permission denied%', :'a1');
SELECT t.chk('E4-64 the append-only guard still blocks any change to a strategy_point log row', t.try($q$UPDATE ai_change_log SET after = '{}' WHERE kind = 'strategy_point'$q$) LIKE '%ai_change_log_is_append_only%'
  AND t.try($q$UPDATE ai_change_log SET card_name = 'x' WHERE kind = 'strategy_point'$q$) LIKE '%ai_change_log_is_append_only%' AND t.try($q$UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE kind = 'strategy_point' AND undone_at IS NULL$q$) = 'ok', '');
INSERT INTO decks (id, name, format, is_active, user_id, card_count) VALUES (104, 'Doomed', 'commander', true, t.u1(), 0);
SELECT t.sub('strategy_point', '{"deck_id":104,"points":[{"statement":"Doomed point","covers":{"card_type":"artifact"}}]}') AS r \gset dd_
DELETE FROM decks WHERE id = 104;
SELECT t.chk('E4-65 deleting a deck that has points and strategy_point log rows works: the points go with the deck, the log row stays and loses only the deck link; its Undo says deck_gone',
  NOT EXISTS (SELECT 1 FROM deck_strategy_points WHERE deck_id = 104) AND (SELECT deck_id IS NULL AND deck_name = 'Doomed' FROM ai_change_log WHERE group_id = t.gid(:'dd_r'::jsonb)) AND t.und(t.gid(:'dd_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'deck_gone', '');
SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) AS roles0 FROM user_card_roles x \gset
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"Role-safe point","covers":{"card_type":"artifact"}}]}') AS r \gset rs_
SELECT t.chk('E4-66 a strategy point request never touches the role rows (byte for byte the same)', :'rs_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) FROM user_card_roles x) = :'roles0', '');
SQL
echo "== second apply must refuse"
$P -f $D/20261118120300_roles_db4_strategy_points.draft.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E4-70 running DB-4 twice refuses and changes nothing', (SELECT count(*) FROM pg_proc WHERE proname = 'owner_save_strategy_point') = 1, '')"
echo "== rollback while strategy_point log rows exist must refuse"
$P -f $D/20261118120300_roles_db4_strategy_points.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E4-71 rollback refuses while strategy_point log rows exist (table and functions still there)', to_regclass('public.deck_strategy_points') IS NOT NULL AND EXISTS (SELECT 1 FROM ai_change_log WHERE kind = 'strategy_point'), '')"
echo "== rolling DB-2 back is refused while DB-4 is applied"
$P -f $D/20261118120100_roles_db2_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E4-72 DB-2 rollback refuses while DB-4 is applied (the order is 4, 3, 2, 1)', to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL, '')"
echo "== clear the history by hand (test only); the table still holds rows, so it must still refuse"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('strategy_point','card_label'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM ai_pending_changes WHERE action IN ('strategy_point','card_label')"
$P -f $D/20261118120300_roles_db4_strategy_points.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E4-73 rollback refuses while the points table holds rows', to_regclass('public.deck_strategy_points') IS NOT NULL AND (SELECT count(*) FROM deck_strategy_points) > 0, '')"
echo "== rollback with the explicit data-loss setting"
$P <<SQL
SET oracle.rollback_allow_data_loss = 'yes';
\i $D/20261118120300_roles_db4_strategy_points.rollback.sql
SQL
$P <<'SQL'
SELECT t.chk('E4-74 rollback with the override: table and the seven functions gone', to_regclass('public.deck_strategy_points') IS NULL AND to_regprocedure('public.owner_save_strategy_point(uuid,integer,bigint,jsonb)') IS NULL AND to_regprocedure('public.owner_delete_strategy_point(uuid,integer,bigint)') IS NULL
  AND to_regprocedure('public.owner_decide_strategy_point(uuid,integer,bigint,text)') IS NULL AND to_regprocedure('public.owner_accept_strategy_point_proposals(uuid,integer,uuid)') IS NULL AND to_regprocedure('public.get_deck_strategy_points(uuid,integer)') IS NULL
  AND to_regprocedure('public._strategy_point_normalize(uuid,integer,jsonb,jsonb,text)') IS NULL AND to_regprocedure('public._ai_strategy_point_prepare(uuid,jsonb)') IS NULL, '');
SELECT t.chk('E4-75 rollback restores the previous state exactly (every function, grant, constraint, table and trigger fingerprint equals the one taken after DB-2)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp2'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp2'));
SELECT t.age();
SELECT t.chk('E4-76 after the rollback a strategy point request is refused again (strategy_points_not_available) and writes nothing; role requests still work',
  t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"x","covers":{"card_type":"artifact"}}]}')->>'err' = 'strategy_points_not_available' AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['stax_tax'])))#>>'{res,outcome}' = 'applied', '');
SQL
echo "== re-apply, use, and roll back with empty tables"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('strategy_point','card_label'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $D/20261118120300_roles_db4_strategy_points.draft.sql
$P <<'SQL'
SELECT t.chk('E4-77 re-apply works and a point request applies and Claude can undo it', (SELECT t.und(t.gid(t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"Again","covers":{"card_type":"artifact"}}]}')), 'claude')#>>'{res,success}') = 'true', '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('strategy_point','card_label'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM deck_strategy_points"
f $D/20261118120300_roles_db4_strategy_points.rollback.sql
$P -c "SELECT t.chk('E4-78 rollback with empty tables needs no override and again restores the exact previous state', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp2'), '')"
f $D/20261118120100_roles_db2_change_kinds.rollback.sql
$P -c "SELECT t.chk('E4-79 then DB-2 rolls back: state equals the one after DB-1', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp1'), '')"
$P -c "DELETE FROM user_card_roles"
f $D/20261118120000_roles_db1_card_roles.rollback.sql
$P -c "SELECT t.chk('E4-7A then DB-1 rolls back: state equals the live state before the feature', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '')"
$P -f $HERE/results.sql
