# DB-5 throwaway test. Sourced by run.sh. Base = the real live migrations up to CC-15b, then DB-1, DB-2, DB-5 (DB-3 and DB-4 are NOT applied here: DB-5 needs only DB-2).
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
f $D/20261118120000_roles_db1_card_roles.draft.sql
f $D/20261118120100_roles_db2_change_kinds.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fp2', t.fp())"
echo "== before DB-5: a health target request is refused and writes nothing"
$P <<'SQL'
SELECT t.snap() AS s0 \gset
SELECT t.chk('F5-00 before DB-5 a health_target request is refused and writes nothing', t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":5,"reason":"x"}]}')->>'ok' = 'false' AND t.snap() = :'s0', '');
SQL
echo "== apply DB-5"
f $D/20261118120400_roles_db5_health_targets.draft.sql
$P <<'SQL'
SELECT t.chk('F5-01 table, row security (not forced), unique key and the seven functions exist; front doors still exist; DB-3 and DB-4 are not needed',
  to_regclass('public.deck_health_targets') IS NOT NULL
  AND (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = 'public.deck_health_targets'::regclass)
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deck_health_targets_one_per_group' AND contype = 'u')
  AND to_regprocedure('public.owner_set_health_target(uuid,integer,text,integer,text)') IS NOT NULL AND to_regprocedure('public.owner_hand_back_health_target(uuid,integer,text)') IS NOT NULL
  AND to_regprocedure('public.get_deck_health_targets(uuid,integer)') IS NOT NULL AND to_regprocedure('public._ai_plan_health_target(uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public._ai_execute_health_target(uuid,uuid,text,jsonb,uuid,boolean)') IS NOT NULL AND to_regprocedure('public._ai_blocker_health_target(uuid,ai_change_log)') IS NOT NULL
  AND to_regprocedure('public._ai_undo_health_target(uuid,uuid,text)') IS NOT NULL AND to_regprocedure('public._ai_plan(uuid,text,jsonb)') IS NOT NULL
  AND to_regclass('public.deck_card_jobs') IS NULL AND to_regclass('public.deck_strategy_points') IS NULL, '');
SELECT t.chk('F5-02 constraints: group from the list; target 0 to 100; Claude row needs a reason; reason trimmed, 1 to 200; owner row has no batch; one row per deck and group',
  t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'wipes', 3, 'x', 'claude')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'ramp', 101, 'x', 'claude')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'ramp', -1, 'x', 'claude')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES (t.u1(), 100, 'ramp', 5, 'claude')$q$) LIKE '%deck_health_targets_claude_reason%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'ramp', 5, '', 'claude')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'ramp', 5, ' padded ', 'claude')$q$) LIKE '%violates check constraint%'
  AND t.try(format($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'ramp', 5, %L, 'claude')$q$, repeat('r', 201))) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by, batch_id) VALUES (t.u1(), 100, 'ramp', 5, 'x', 'owner', gen_random_uuid())$q$) LIKE '%deck_health_targets_claude_only_batch%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u1(), 100, 'ramp', 5, 'x', 'someone')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES (t.u1(), 100, 'ramp', 5, 'owner'), (t.u1(), 100, 'ramp', 6, 'owner')$q$) LIKE '%deck_health_targets_one_per_group%'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES (t.u1(), 100, 'ramp', 5, 'owner'), (t.u2(), 200, 'ramp', 6, 'owner')$q$) = 'ok'
  AND t.try($q$INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES (t.u1(), 100, 'lands', 0, 'owner'), (t.u1(), 100, 'interaction', 100, 'owner')$q$) = 'ok', '');
SELECT t.chk('F5-03 a deck that is deleted takes its targets with it; a user that is deleted too (no orphans)',
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.deck_health_targets'::regclass AND contype = 'f' AND confdeltype = 'c') = 2, '');
SQL
echo "== Claude sets targets from the strategy (D-060)"
$P <<'SQL'
SELECT t.snap() AS s1 \gset
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":3,"reason":"Urza turns artifacts into mana, so it needs little ramp."}]}', NULL, NULL, true) AS r \gset d_
SELECT t.chk('F5-10 a dry run says would_apply, shows the change and writes nothing', :'d_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND (:'d_r'::jsonb#>>'{res,plan,n}')::int = 1
  AND :'d_r'::jsonb#>>'{res,plan,changes,0,group}' = 'ramp' AND t.snap() = :'s1', :'d_r');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":3,"reason":"Urza turns artifacts into mana, so it needs little ramp."},{"group":"lands","target":34,"reason":"Few expensive spells."}]}') AS r \gset a_
SELECT t.chk('F5-11 a request applies at once: 2 rows set by Claude with their reasons, no earlier number, one batch, one log row per group',
  :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM deck_health_targets WHERE deck_id = 100 AND set_by = 'claude' AND previous IS NULL AND batch_id = t.gid(:'a_r'::jsonb) AND reason IS NOT NULL) = 2
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb) AND kind = 'health_target' AND deck_id = 100 AND NOT approved_by_owner) = 2
  AND (SELECT target FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'ramp') = 3, :'a_r');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":3,"reason":"Urza turns artifacts into mana, so it needs little ramp."}]}') AS r \gset b_
SELECT t.chk('F5-12 the same request again changes nothing (unchanged), writes no log row and has no batch', :'b_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'b_r'::jsonb#>>'{res,count}')::int = 0
  AND :'b_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'unchanged' AND (SELECT count(*) FROM ai_change_log WHERE kind = 'health_target') = 2, :'b_r');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":6,"reason":"Strategy now leans on mana rocks."},{"group":"interaction","target":8,"reason":"Table needs answers."}]}') AS r \gset c_
SELECT t.chk('F5-13 a changed number keeps the earlier number in previous; the old reason is replaced; a new group starts with no previous',
  (SELECT previous = 3 AND target = 6 AND reason = 'Strategy now leans on mana rocks.' FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'ramp')
  AND (SELECT previous IS NULL AND target = 8 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'interaction'), :'c_r');
SELECT t.chk('F5-14 Recent changes lists the health_target batch with a name per group and the batch can be undone (no blocker)',
  (SELECT count(*) = 2 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'kind' = 'health_target' AND e->>'group_id' = t.gid(:'c_r'::jsonb)::text AND e->'undo_blocker' = 'null'::jsonb
     AND e->>'card_name' IN ('Ramp target', 'Interaction target') AND e->>'owner_only' = 'false'), '');
SELECT t.chk('F5-15 refusals write nothing: unknown group, repeated group, number 101 / -1 / 1.5 / "5", no reason, blank reason, reason over 200, 5 entries, empty list, not a list, no deck, another user''s deck, one bad entry among good ones',
  t.sub('health_target', '{"deck_id":100,"targets":[{"group":"wipes","target":2,"reason":"x"}]}')->>'err' = 'bad_group'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":2,"reason":"x"},{"group":"ramp","target":3,"reason":"y"}]}')->>'err' = 'duplicate_group'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":101,"reason":"x"}]}')->>'err' = 'bad_target'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":-1,"reason":"x"}]}')->>'err' = 'bad_target'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":1.5,"reason":"x"}]}')->>'err' = 'bad_target'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":"5","reason":"x"}]}')->>'err' = 'bad_target'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":5}]}')->>'err' = 'reason_required'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":5,"reason":"   "}]}')->>'err' = 'reason_required'
  AND t.sub('health_target', jsonb_build_object('deck_id', 100, 'targets', jsonb_build_array(jsonb_build_object('group','ramp','target',5,'reason',repeat('r', 201)))))->>'err' = 'reason_too_long'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":1,"reason":"a"},{"group":"ramp","target":1,"reason":"a"},{"group":"card_advantage","target":1,"reason":"a"},{"group":"interaction","target":1,"reason":"a"},{"group":"ramp","target":1,"reason":"a"}]}')->>'err' = 'invalid_request'
  AND t.sub('health_target', '{"deck_id":100,"targets":[]}')->>'err' = 'invalid_request'
  AND t.sub('health_target', '{"deck_id":100,"targets":"ramp"}')->>'err' = 'invalid_request'
  AND t.sub('health_target', '{"targets":[{"group":"ramp","target":5,"reason":"x"}]}')->>'err' = 'invalid_request'
  AND t.sub('health_target', '{"deck_id":999,"targets":[{"group":"ramp","target":5,"reason":"x"}]}')->>'err' = 'deck_not_found'
  AND t.sub('health_target', '{"deck_id":200,"targets":[{"group":"ramp","target":5,"reason":"x"}]}')->>'err' = 'deck_not_found'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"card_advantage","target":9,"reason":"good"},{"group":"ramp","target":"x","reason":"bad"}]}')->>'err' = 'bad_target'
  AND (SELECT count(*) FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'card_advantage') = 0, '');
SELECT t.chk('F5-16 a switched-off connection is refused (connection_revoked) and nothing is written', t.sub('health_target', '{"deck_id":100,"targets":[{"group":"card_advantage","target":9,"reason":"x"}]}', NULL, t.c1_off())->>'err' = 'connection_revoked'
  AND (SELECT count(*) FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'card_advantage') = 0, '');
SELECT t.chk('F5-17 user 2 cannot set targets on user 1''s deck', t.sub('health_target', '{"deck_id":100,"targets":[{"group":"card_advantage","target":9,"reason":"x"}]}', t.u2(), t.c2())->>'err' = 'deck_not_found', '');
SQL
echo "== Undo of Claude's batch"
$P <<'SQL'
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":7,"reason":"Later change."},{"group":"card_advantage","target":9,"reason":"New group."}]}') AS r \gset u_
SELECT t.snap() AS su \gset
SELECT t.und(t.gid(:'u_r'::jsonb), 'claude', t.u2(), t.c2()) AS r \gset x2_
SELECT t.chk('F5-20 user 2 cannot undo user 1''s batch (nothing changes)', COALESCE((:'x2_r'::jsonb#>>'{res,success}')::boolean, false) = false AND t.snap() = :'su', :'x2_r');
SELECT t.und(t.gid(:'u_r'::jsonb), 'claude') AS r \gset u1_
SELECT t.chk('F5-21 Claude undoes its batch in one go: the changed group gets the earlier number AND reason back, the new group is gone, log rows stamped',
  (:'u1_r'::jsonb#>>'{res,success}')::boolean AND (:'u1_r'::jsonb#>>'{res,undone}')::int = 2
  AND (SELECT target = 6 AND reason = 'Strategy now leans on mana rocks.' AND previous = 3 AND batch_id IS NOT NULL AND batch_id <> t.gid(:'u_r'::jsonb) FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'ramp')
  AND NOT EXISTS (SELECT 1 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'card_advantage')
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'u_r'::jsonb) AND undone_by = 'claude') = 2, :'u1_r');
SELECT t.chk('F5-22 undoing again is refused (already_undone)', t.und(t.gid(:'u_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'already_undone', '');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"card_advantage","target":12,"reason":"Draw engines."}]}') AS r \gset w_
SELECT t.expire(t.gid(:'w_r'::jsonb));
SELECT t.chk('F5-23 after 7 days Undo is closed for both Claude and the owner (window_closed)', t.und(t.gid(:'w_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'window_closed' AND t.und(t.gid(:'w_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'window_closed', '');
SQL
echo "== The owner's override (D-060): Claude leaves it alone"
$P <<'SQL'
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":35,"reason":"Claude lands."},{"group":"interaction","target":9,"reason":"Claude interaction."}]}') AS r \gset k_
SELECT public.owner_set_health_target(t.u1(), 100, 'lands', 38, 'I like more lands') AS r \gset o_
SELECT t.chk('F5-30 the owner overrides a number: the row becomes the owner''s, no batch, the earlier number is kept in previous, the old Claude row is returned',
  (SELECT set_by = 'owner' AND target = 38 AND previous = 35 AND batch_id IS NULL AND reason = 'I like more lands' FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'lands')
  AND :'o_r'::jsonb#>>'{previous,set_by}' = 'claude' AND :'o_r'::jsonb#>>'{current,set_by}' = 'owner', :'o_r');
SELECT public.owner_set_health_target(t.u1(), 100, 'card_advantage', 11, NULL) AS r \gset o2_
SELECT t.chk('F5-31 the owner can override without a reason (the earlier Claude number is kept in previous)', (SELECT set_by = 'owner' AND reason IS NULL AND previous = 12 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'card_advantage'), :'o2_r');
SELECT t.snap() AS so \gset
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":30,"reason":"Claude wants fewer."},{"group":"ramp","target":8,"reason":"Claude ramp."}]}') AS r \gset m_
SELECT t.chk('F5-32 a mixed request sets the free group and skips the overridden one, reporting what Claude would have set (left_alone)', :'m_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (:'m_r'::jsonb#>>'{res,count}')::int = 1 AND :'m_r'::jsonb#>>'{res,plan,left_alone,0,group}' = 'lands' AND (:'m_r'::jsonb#>>'{res,plan,left_alone,0,owner_target}')::int = 38
  AND (:'m_r'::jsonb#>>'{res,plan,left_alone,0,would_set}')::int = 30
  AND (SELECT target = 38 AND set_by = 'owner' FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'lands')
  AND (SELECT target = 8 AND set_by = 'claude' FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'ramp'), :'m_r');
SELECT t.snap() AS so2 \gset
SELECT t.chk('F5-33 a request that names only overridden groups is refused (target_overridden) and writes nothing',
  t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":30,"reason":"x"},{"group":"card_advantage","target":2,"reason":"y"}]}')->>'err' = 'target_overridden' AND t.snap() = :'so2', '');
SELECT t.chk('F5-34 a dry run reports the skipped group too and writes nothing', t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":30,"reason":"x"},{"group":"ramp","target":9,"reason":"y"}]}', NULL, NULL, true)#>>'{res,plan,left_alone,0,group}' = 'lands' AND t.snap() = :'so2', '');
SELECT t.und(t.gid(:'k_r'::jsonb), 'claude') AS r \gset k1_
SELECT t.chk('F5-35 Claude''s Undo of the older batch is refused (changed_since, naming the group) and nothing changes: the owner''s number is never touched',
  :'k1_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND :'k1_r'::jsonb#>>'{res,refused,what}' = 'lands' AND t.snap() = :'so2', :'k1_r');
SELECT t.und(t.gid(:'k_r'::jsonb), 'owner') AS r \gset k2_
SELECT t.chk('F5-36 the owner''s Undo of that batch restores the group Claude still owns, leaves the overridden one alone and says so',
  (:'k2_r'::jsonb#>>'{res,undone}')::int = 1 AND :'k2_r'::jsonb#>>'{res,left_alone,0,what}' = 'lands'
  AND (SELECT target = 38 AND set_by = 'owner' FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'lands')
  AND NOT EXISTS (SELECT 1 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'interaction' AND reason = 'Claude interaction.'), :'k2_r');
SQL
echo "== Handing back to Claude"
$P <<'SQL'
SELECT public.owner_hand_back_health_target(t.u1(), 100, 'lands') AS r \gset h_
SELECT t.chk('F5-40 handing back deletes the owner row and returns it; the group then has no row',
  :'h_r'::jsonb#>>'{deleted,set_by}' = 'owner' AND (:'h_r'::jsonb#>>'{deleted,target}')::int = 38 AND NOT EXISTS (SELECT 1 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'lands'), :'h_r');
SELECT t.chk('F5-41 only an owner row can be handed back (not_overridden for a Claude row or an empty group); an unknown group is the same; another user''s deck is refused',
  t.att($q$SELECT public.owner_hand_back_health_target(t.u1(), 100, 'ramp')$q$)->>'err' = 'not_overridden'
  AND t.att($q$SELECT public.owner_hand_back_health_target(t.u1(), 100, 'lands')$q$)->>'err' = 'not_overridden'
  AND t.att($q$SELECT public.owner_hand_back_health_target(t.u1(), 100, 'wipes')$q$)->>'err' = 'not_overridden'
  AND t.att($q$SELECT public.owner_hand_back_health_target(t.u2(), 100, 'card_advantage')$q$)->>'err' = 'deck_not_found'
  AND EXISTS (SELECT 1 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'ramp' AND set_by = 'claude')
  AND EXISTS (SELECT 1 FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'card_advantage' AND set_by = 'owner'), '');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":36,"reason":"Back with Claude."}]}') AS r \gset n_
SELECT t.chk('F5-42 after the hand back Claude can set that group again, and it is Claude''s', :'n_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT set_by = 'claude' AND target = 36 AND previous IS NULL FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'lands'), :'n_r');
SELECT t.chk('F5-43 owner refusals: unknown group, number 101 / -1, reason over 200, another user''s deck; nothing is written',
  t.att($q$SELECT public.owner_set_health_target(t.u1(), 100, 'wipes', 3, NULL)$q$)->>'err' = 'bad_group'
  AND t.att($q$SELECT public.owner_set_health_target(t.u1(), 100, 'ramp', 101, NULL)$q$)->>'err' = 'bad_target'
  AND t.att($q$SELECT public.owner_set_health_target(t.u1(), 100, 'ramp', -1, NULL)$q$)->>'err' = 'bad_target'
  AND t.att(format($q$SELECT public.owner_set_health_target(t.u1(), 100, 'ramp', 5, %L)$q$, repeat('r', 201)))->>'err' = 'reason_too_long'
  AND t.att($q$SELECT public.owner_set_health_target(t.u2(), 100, 'ramp', 5, NULL)$q$)->>'err' = 'deck_not_found'
  AND (SELECT target FROM deck_health_targets WHERE deck_id = 100 AND target_group = 'ramp') = 8, '');
SELECT t.chk('F5-44 the reader returns only this user''s rows for the deck (4 groups set so far in deck 100), and refuses another user''s deck',
  (SELECT count(*) FROM public.get_deck_health_targets(t.u1(), 100)) = 4 AND t.att($q$SELECT to_jsonb(count(*)) FROM public.get_deck_health_targets(t.u2(), 100)$q$)->>'err' = 'deck_not_found', '');
SQL
echo "== Old kinds still work, and the 120 / hourly limits still count health changes"
$P <<'SQL'
SELECT t.chk('F5-50 an old kind (deck_add) still applies and Claude can still undo it', (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}')::boolean, '');
SELECT t.chk('F5-51 a role request (DB-2) still applies next to health targets', t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['ramp'])))#>>'{res,outcome}' = 'applied', '');
SELECT t.chk('F5-52 Claude can see each group at most once per request and a request has at most 4 groups (so at most 4 log rows)', (SELECT max(c) <= 4 FROM (SELECT count(*) c FROM ai_change_log WHERE kind = 'health_target' GROUP BY group_id) x), '');
SQL
echo "== Row security and who may call what"
$P <<'SQL'
SELECT t.snap() AS s2 \gset
INSERT INTO deck_health_targets (user_id, deck_id, target_group, target, reason, set_by) VALUES (t.u2(), 200, 'lands', 30, 'User 2 lands.', 'claude');
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS of_u1 FROM public.deck_health_targets WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2_
SELECT count(*) AS own FROM public.deck_health_targets \gset u2_
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES ('00000000-0000-0000-0000-000000000002', 200, 'ramp', 5, 'owner') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e1 \gset
SELECT t.att($q$WITH u AS (UPDATE public.deck_health_targets SET target = 99 RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e2 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_health_targets RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e3 \gset
SELECT t.att($q$SELECT public.owner_set_health_target('00000000-0000-0000-0000-000000000002', 200, 'ramp', 5, NULL)$q$)->>'err' AS f1 \gset
SELECT t.att($q$SELECT public.owner_hand_back_health_target('00000000-0000-0000-0000-000000000002', 200, 'lands')$q$)->>'err' AS f2 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.get_deck_health_targets('00000000-0000-0000-0000-000000000002', 200)$q$)->>'err' AS f3 \gset
SELECT t.att($q$SELECT public._ai_plan_health_target('00000000-0000-0000-0000-000000000002', '{}')$q$)->>'err' AS f4 \gset
SELECT t.att($q$SELECT public._ai_execute_health_target('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'x', '{}', NULL, false)$q$)->>'err' AS f5 \gset
SELECT t.att($q$SELECT public._ai_undo_health_target('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner')$q$)->>'err' AS f6 \gset
SELECT t.att($q$SELECT public.ai_undo_group('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner', NULL)$q$)->>'err' AS f7 \gset
RESET ROLE;
SELECT t.chk('F5-60 signed-in user 2 sees only their own rows (none of user 1''s)', :u2_of_u1 = 0 AND :u2_own = 1, 'own ' || :'u2_own' || ' of user 1 ' || :'u2_of_u1');
SELECT t.chk('F5-61 signed-in users cannot insert, update, delete or call any health target function (also not the front door ai_undo_group)',
  :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%' AND :'f1' LIKE 'permission denied%' AND :'f2' LIKE 'permission denied%'
  AND :'f3' LIKE 'permission denied%' AND :'f4' LIKE 'permission denied%' AND :'f5' LIKE 'permission denied%' AND :'f6' LIKE 'permission denied%' AND :'f7' LIKE 'permission denied%', concat_ws(' | ', :'e1', :'f1', :'f7'));
GRANT INSERT, UPDATE, DELETE ON public.deck_health_targets TO authenticated;
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT t.att($q$WITH u AS (UPDATE public.deck_health_targets SET target = 99 WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$) AS g1 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_health_targets WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$) AS g2 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES ('00000000-0000-0000-0000-000000000001', 100, 'wipes', 1, 'owner') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g3 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_health_targets (user_id, deck_id, target_group, target, set_by) VALUES ('00000000-0000-0000-0000-000000000001', 100, 'ramp', 1, 'owner') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g4 \gset
RESET ROLE;
REVOKE INSERT, UPDATE, DELETE ON public.deck_health_targets FROM authenticated;
SELECT t.chk('F5-62 with write access wrongly granted, user 2 still changes 0 of user 1''s rows and cannot insert one for them (row security)', :'g1'::jsonb#>>'{res}' = '0' AND :'g2'::jsonb#>>'{res}' = '0'
  AND (:'g3' LIKE '%row-level security%' OR :'g3' LIKE '%violates check%') AND (:'g4' LIKE '%row-level security%' OR :'g4' LIKE '%duplicate key%'), :'g1' || :'g2' || :'g3' || :'g4');
SET ROLE anon;
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.deck_health_targets$q$)->>'err' AS a1 \gset
RESET ROLE;
SELECT t.chk('F5-63 the anonymous role cannot read targets', :'a1' LIKE 'permission denied%', :'a1');
SELECT t.chk('F5-64 service-role-only grants: no function of DB-5 is executable by PUBLIC, anon or signed-in users',
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%health_target%'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) = 0, '');
DELETE FROM deck_health_targets WHERE user_id = t.u2();
SQL
echo "== Rollback: refuses while rows or log rows exist"
$P <<'SQL'
SELECT t.snap() AS s9 \gset
SQL
$P -f $D/20261118120400_roles_db5_health_targets.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120100_roles_db2_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F5-70 DB-5 cannot be rolled back while health_target log rows exist, and DB-2 cannot be rolled back while DB-5 is applied (nothing was removed)', to_regclass('public.deck_health_targets') IS NOT NULL AND (SELECT count(*) FROM deck_health_targets) > 0 AND to_regprocedure('public._ai_plan_health_target(uuid,jsonb)') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL, '')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'health_target'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
$P -f $D/20261118120400_roles_db5_health_targets.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F5-71 DB-5 cannot be rolled back while the table holds rows, even with the log cleared', to_regclass('public.deck_health_targets') IS NOT NULL AND (SELECT count(*) FROM deck_health_targets) > 0, '')"
echo "== rollback with the explicit data-loss setting"
$P <<SQL
SET oracle.rollback_allow_data_loss = 'yes';
\i $D/20261118120400_roles_db5_health_targets.rollback.sql
SQL
$P <<'SQL'
SELECT t.chk('F5-72 rollback with the override: table, the seven functions and the new name in the allow-lists are gone',
  to_regclass('public.deck_health_targets') IS NULL AND to_regprocedure('public.owner_set_health_target(uuid,integer,text,integer,text)') IS NULL
  AND to_regprocedure('public.owner_hand_back_health_target(uuid,integer,text)') IS NULL AND to_regprocedure('public.get_deck_health_targets(uuid,integer)') IS NULL
  AND to_regprocedure('public._ai_plan_health_target(uuid,jsonb)') IS NULL AND to_regprocedure('public._ai_execute_health_target(uuid,uuid,text,jsonb,uuid,boolean)') IS NULL
  AND to_regprocedure('public._ai_blocker_health_target(uuid,ai_change_log)') IS NULL AND to_regprocedure('public._ai_undo_health_target(uuid,uuid,text)') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE pg_get_constraintdef(oid) LIKE '%health_target%'), '');
SELECT t.chk('F5-73 rollback restores the previous state exactly (every function, grant, constraint, table and trigger fingerprint equals the one taken after DB-2)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp2'), t.fp());
SELECT t.age();
SELECT t.chk('F5-74 after the rollback a health_target request is refused again and writes nothing; role requests still work',
  t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":5,"reason":"x"}]}')->>'ok' = 'false' AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['ramp'])))#>>'{res,outcome}' = 'applied', '');
SQL
echo "== re-apply, use, and roll back with empty tables"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','health_target'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM user_card_roles"
f $D/20261118120400_roles_db5_health_targets.draft.sql
$P <<'SQL'
SELECT t.chk('F5-75 re-apply works and a health request applies and Claude can undo it', (SELECT t.und(t.gid(t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":4,"reason":"Again"}]}')), 'claude')#>>'{res,success}')::boolean, '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'health_target'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $D/20261118120400_roles_db5_health_targets.rollback.sql
$P -c "SELECT t.chk('F5-76 rollback with empty tables needs no override and again restores the exact previous state', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp2'), '')"
f $D/20261118120100_roles_db2_change_kinds.rollback.sql
f $D/20261118120000_roles_db1_card_roles.rollback.sql
$P -c "SELECT t.chk('F5-77 then DB-2 and DB-1 roll back: state equals the live state before the feature', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '')"
$P -f $HERE/results.sql
