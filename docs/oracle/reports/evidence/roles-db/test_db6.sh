# DB-6 throwaway test. Sourced by run.sh. Base = the real live migrations up to CC-15b, then DB-1 to DB-5, then DB-6 and DB-6b.
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
for d in 20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets; do f $D/$d.draft.sql; done
$P -c "INSERT INTO t.keep VALUES ('fp5', t.fp())"
echo "== before DB-6: refused, and a wrong base is refused"
$P <<'SQL'
SELECT t.snap() AS s0 \gset
SELECT t.chk('F6-00 before DB-6 an items request and a links request are refused and write nothing',
  t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"x"}]}')->>'ok' = 'false' AND t.sub('job_link', '{"deck_id":100,"links":[]}')->>'ok' = 'false' AND t.snap() = :'s0', '');
SQL
echo "== DB-6 on a wrong base (DB-5 rolled back) is refused"
f $D/20261118120400_roles_db5_health_targets.rollback.sql
$P -f $D/20261118140000_roles_db6_deck_strategy.draft.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F6-00b DB-6 refuses to apply without DB-5 and creates nothing', to_regclass('public.deck_strategy_items') IS NULL AND to_regclass('public.deck_job_serves') IS NULL AND to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NULL, '')"
f $D/20261118120400_roles_db5_health_targets.draft.sql
echo "== apply DB-6"
f $D/20261118140000_roles_db6_deck_strategy.draft.sql
$P <<'SQL'
SELECT t.chk('F6-01 both tables exist with row security (not forced); the new functions exist; the four fronts exist and so do their *_pre_strategy originals',
  (SELECT count(*) FROM pg_class WHERE relname IN ('deck_strategy_items','deck_job_serves') AND relrowsecurity AND NOT relforcerowsecurity) = 2
  AND to_regprocedure('public.owner_save_strategy_item(uuid,integer,bigint,jsonb)') IS NOT NULL AND to_regprocedure('public.owner_set_job_link(uuid,integer,uuid,text,text,bigint)') IS NOT NULL
  AND to_regprocedure('public.get_deck_strategy_staleness(uuid,integer)') IS NOT NULL AND to_regprocedure('public.get_deck_job_links(uuid,integer)') IS NOT NULL
  AND to_regprocedure('public._ai_plan(uuid,text,jsonb)') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NOT NULL
  AND to_regprocedure('public._ai_execute_pre_strategy(uuid,uuid,text,text,jsonb,uuid,boolean)') IS NOT NULL AND to_regprocedure('public._ai_undo_blocker_pre_strategy(uuid,ai_change_log)') IS NOT NULL
  AND to_regprocedure('public.ai_undo_group_pre_strategy(uuid,uuid,text,uuid)') IS NOT NULL, '');
SELECT t.chk('F6-01b the DB-5 front doors are only renamed: their text still mentions health_target and the DB-2 handoff (_pre_roles), and DB-6 fronts hand over to _pre_strategy',
  position('health_target' IN pg_get_functiondef('public._ai_plan_pre_strategy(uuid,text,jsonb)'::regprocedure)) > 0
  AND position('_ai_plan_pre_roles' IN pg_get_functiondef('public._ai_plan_pre_strategy(uuid,text,jsonb)'::regprocedure)) > 0
  AND position('_ai_plan_pre_strategy' IN pg_get_functiondef('public._ai_plan(uuid,text,jsonb)'::regprocedure)) > 0
  AND position('health_target' IN pg_get_functiondef('public._ai_plan(uuid,text,jsonb)'::regprocedure)) = 0, '');
SELECT t.chk('F6-02 the allow-lists accept the two new names, still accept every old one, and reject an invented one',
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ai_change_log'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%strategy_item%' AND pg_get_constraintdef(oid) LIKE '%job_link%' AND pg_get_constraintdef(oid) LIKE '%health_target%' AND pg_get_constraintdef(oid) LIKE '%deck_zone%') = 1
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ai_pending_changes'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%strategy_item%' AND pg_get_constraintdef(oid) LIKE '%job_link%' AND pg_get_constraintdef(oid) LIKE '%health_target%') = 1
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'strategy_item', 'x')$q$) = 'ok'
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'job_link', 'x')$q$) = 'ok'
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'health_target', 'x')$q$) = 'ok'
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'invented', 'x')$q$) LIKE '%violates check constraint%', '');
SELECT t.chk('F6-03 limits function equals the numbers in the types file',
  public._ai_limits_strategy() = '{"item_statement_max_chars":300,"reason_max_chars":200,"items_per_request_max":7,"items_per_deck_max":7,"aim_max":1,"commander_enables_max":3,"win_condition_max":3,"reference_commander_max":1,"based_on_max":5,"links_per_request_max":200}'::jsonb, public._ai_limits_strategy()::text);
SELECT t.chk('F6-04 item constraints: kind from the list; statement 1 to 300 and trimmed; owner row accepted; Claude row not accepted; owner row carries no batch, replacement or evidence; evidence 1 to 5; not its own replacement',
  t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'plan', 'x', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', '', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', ' padded ', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try(format($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', %L, 'owner', 'accepted')$q$, repeat('s', 301))) LIKE '%violates check constraint%'
  AND t.try(format($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', %L, 'owner', 'accepted')$q$, repeat('s', 300))) = 'ok'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', 'x', 'claude', 'accepted')$q$) LIKE '%deck_strategy_items_proposer_state%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', 'x', 'owner', 'to_look_at')$q$) LIKE '%deck_strategy_items_proposer_state%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state, batch_id) VALUES (t.u1(), 100, 'aim', 'x', 'owner', 'accepted', gen_random_uuid())$q$) LIKE '%deck_strategy_items_claude_only%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state, based_on_oracle_ids) VALUES (t.u1(), 100, 'aim', 'x', 'owner', 'accepted', ARRAY[t.o(1)])$q$) LIKE '%deck_strategy_items_claude_only%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state, based_on_oracle_ids) VALUES (t.u1(), 100, 'aim', 'x', 'claude', 'to_look_at', ARRAY[]::uuid[])$q$) LIKE '%deck_strategy_items_based_on%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state, based_on_oracle_ids) VALUES (t.u1(), 100, 'aim', 'x', 'claude', 'to_look_at', ARRAY[t.o(1),t.o(2),t.o(3),t.o(4),t.o(5),t.o(6)])$q$) LIKE '%deck_strategy_items_based_on%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state, reason) VALUES (t.u1(), 100, 'aim', 'x', 'owner', 'accepted', repeat('r', 201))$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', 'One', 'owner', 'accepted'), (t.u1(), 100, 'aim', 'one', 'claude', 'to_look_at')$q$) LIKE '%deck_strategy_items_one_sentence%'
  AND t.try($q$INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 100, 'aim', 'One', 'owner', 'accepted'), (t.u1(), 100, 'win_condition', 'One', 'owner', 'accepted')$q$) = 'ok', '');
SELECT t.chk('F6-05 link constraints: exactly one target; owner row accepted; one owner row and one Claude row per card; an item of another deck is refused (same-deck key); deleting a deck, an item or a point removes its links',
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.deck_job_serves'::regclass AND contype = 'f' AND confdeltype = 'c') = 4
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.deck_strategy_items'::regclass AND contype = 'f' AND confdeltype = 'c') = 2
  AND (SELECT confdeltype FROM pg_constraint WHERE conrelid = 'public.deck_strategy_items'::regclass AND contype = 'f' AND confrelid = 'public.deck_strategy_items'::regclass) = 'n', '');
SQL
$P <<'SQL'
-- an item in another user's deck, and two items in deck 100, to test the constraints on links
INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u2(), 200, 'aim', 'U2 aim', 'owner', 'accepted');
CREATE TEMP TABLE _ids AS SELECT id FROM deck_strategy_items WHERE deck_id = 200;
SELECT id AS u2item FROM _ids \gset
SELECT t.chk('F6-06 link constraints in action',
  t.try(format($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state) VALUES (t.u1(), 100, t.o(1), 'Card 1', %s, 'owner', 'accepted')$q$, :u2item)) LIKE '%deck_job_serves_item_same_deck%'
  AND t.try($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, proposer, state) VALUES (t.u1(), 100, t.o(1), 'Card 1', 'owner', 'accepted')$q$) LIKE '%deck_job_serves_one_target%'
  AND t.try(format($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, serves_point_id, proposer, state) VALUES (t.u2(), 200, t.o(1), 'Card 1', %s, 1, 'owner', 'accepted')$q$, :u2item)) LIKE '%deck_job_serves_one_target%'
  AND t.try(format($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state) VALUES (t.u2(), 200, t.o(1), 'Card 1', %s, 'owner', 'to_look_at')$q$, :u2item)) LIKE '%deck_job_serves_proposer_state%'
  AND t.try(format($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state, batch_id) VALUES (t.u2(), 200, t.o(1), 'Card 1', %s, 'owner', 'accepted', gen_random_uuid())$q$, :u2item)) LIKE '%deck_job_serves_claude_only_batch%'
  AND t.try(format($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state) VALUES (t.u2(), 200, t.o(1), 'Card 1', %s, 'owner', 'accepted'), (t.u2(), 200, t.o(1), 'Card 1', %s, 'owner', 'accepted')$q$, :u2item, :u2item)) LIKE '%deck_job_serves_one_per_proposer%'
  AND t.try(format($q$INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state) VALUES (t.u2(), 200, t.o(1), 'Card 1', %s, 'owner', 'accepted'), (t.u2(), 200, t.o(1), 'Card 1', %s, 'claude', 'to_look_at')$q$, :u2item, :u2item)) = 'ok', '');
INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state) VALUES (t.u2(), 200, t.o(1), 'Card 1', :u2item, 'owner', 'accepted');
DELETE FROM deck_strategy_items WHERE id = :u2item;
SELECT t.chk('F6-07 deleting an item removes its links', NOT EXISTS (SELECT 1 FROM deck_job_serves WHERE deck_id = 200), '');
SQL

echo "== Claude proposes items (strategy first, Urza / Arti-facts example)"
$P <<'SQL'
SELECT t.snap() AS s1 \gset
SELECT jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(
  jsonb_build_object('kind','aim','statement','Turn artifacts into mana and cast one huge spell.','reason','Urza makes artifacts tap for mana.','based_on', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 1'), 'name', 'Card 1'))),
  jsonb_build_object('kind','commander_enables','statement','Urza turns every artifact into a mana source.'),
  jsonb_build_object('kind','win_condition','statement','Win with the Thopter and Sword combo.','based_on', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2'), jsonb_build_object('slot_id', t.slot(100,'Card 3'), 'name', 'Card 3'))))) AS p \gset
SELECT t.sub('strategy_item', :'p', NULL, NULL, true) AS r \gset d_
SELECT t.chk('F6-10 a dry run says would_apply, shows 3 changes and writes nothing', :'d_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND (:'d_r'::jsonb#>>'{res,plan,n}')::int = 3 AND t.snap() = :'s1', :'d_r');
SELECT t.sub('strategy_item', :'p') AS r \gset a_
SELECT t.chk('F6-11 a request applies at once: 3 Claude rows waiting, one batch, evidence stored as oracle ids, one log row per item named by kind, none counted as the owner''s',
  :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND proposer = 'claude' AND state = 'to_look_at' AND batch_id = t.gid(:'a_r'::jsonb)) = 3
  AND (SELECT based_on_oracle_ids = ARRAY[t.o(1)] FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' AND proposer = 'claude')
  AND (SELECT cardinality(based_on_oracle_ids) = 2 FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'win_condition' AND proposer = 'claude')
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb) AND kind = 'strategy_item' AND NOT approved_by_owner) = 3
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb) AND card_name IN ('Aim: Turn artifacts into mana and cast one huge spell.', 'Commander enables: Urza turns every artifact into a mana source.', 'Win condition: Win with the Thopter and Sword combo.')) = 3, :'a_r');
SELECT t.chk('F6-12 the same request again changes nothing (nothing_to_change) and writes nothing', t.sub('strategy_item', :'p')->>'err' = 'nothing_to_change', '');
SELECT t.chk('F6-13 Recent changes lists the batch with 3 rows and no blocker', (SELECT count(*) = 3 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'kind' = 'strategy_item' AND e->>'group_id' = t.gid(:'a_r'::jsonb)::text AND e->'undo_blocker' = 'null'::jsonb), '');
SELECT t.chk('F6-14 refusals write nothing: unknown kind, empty, 301 characters, blank reason is fine but 201 is not, 8 items, 6 evidence cards, evidence from a slot with the wrong name, a card of another deck, a made-up replaces_id, no deck, user 2''s deck, switched-off connection',
  t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"plan","statement":"x"}]}')->>'err' = 'unknown_kind'
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"  "}]}')->>'err' = 'bad_statement'
  AND t.sub('strategy_item', jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(jsonb_build_object('kind','aim','statement',repeat('s',301)))))->>'err' = 'bad_statement'
  AND t.sub('strategy_item', jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(jsonb_build_object('kind','aim','statement','y','reason',repeat('r',201)))))->>'err' = 'reason_too_long'
  AND t.sub('strategy_item', jsonb_build_object('deck_id', 100, 'items', (SELECT jsonb_agg(jsonb_build_object('kind','commander_enables','statement','e' || i)) FROM generate_series(1, 8) i)))->>'err' = 'too_many_items_in_request'
  AND t.sub('strategy_item', jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(jsonb_build_object('kind','commander_enables','statement','six','based_on',
        (SELECT jsonb_agg(jsonb_build_object('slot_id', t.slot(100, 'Card ' || i), 'name', 'Card ' || i)) FROM generate_series(1, 6) i)))))->>'err' = 'invalid_request'
  AND t.sub('strategy_item', jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(jsonb_build_object('kind','commander_enables','statement','wrong','based_on', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 1'), 'name', 'Card 2'))))))->>'err' = 'slot_not_found'
  AND t.sub('strategy_item', jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(jsonb_build_object('kind','commander_enables','statement','other','based_on', jsonb_build_array(jsonb_build_object('slot_id', (SELECT id FROM deck_cards WHERE deck_id = 200 LIMIT 1), 'name', 'Card 1'))))))->>'err' = 'slot_not_found'
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"fake","replaces_id":99999}]}')->>'err' = 'bad_replaces'
  AND t.sub('strategy_item', '{"deck_id":999,"items":[{"kind":"aim","statement":"x"}]}')->>'err' = 'deck_not_found'
  AND t.sub('strategy_item', '{"deck_id":200,"items":[{"kind":"aim","statement":"x"}]}')->>'err' = 'deck_not_found'
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"off"}]}', NULL, t.c1_off())->>'err' = 'connection_revoked'
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"x"}]}', t.u2(), t.c2())->>'err' = 'deck_not_found'
  AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND proposer = 'claude') = 3 AND (SELECT count(*) FROM ai_change_log WHERE kind = 'strategy_item') = 3, '');
SELECT t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"A second aim."},{"kind":"commander_enables","statement":"Urza makes treasure-like mana from Thopters."}]}') AS r \gset b_
SELECT t.chk('F6-15 a second Aim from Claude is skipped as kind_full (the other item in the same request still applies)',
  :'b_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'kind_full'
  AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' AND proposer = 'claude') = 1 AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'commander_enables' AND proposer = 'claude') = 2, :'b_r');
SQL

echo "== The owner decides; Claude never overwrites the owner's item"
$P <<'SQL'
CREATE FUNCTION t.subf(p_action text, p_payload text) RETURNS jsonb LANGUAGE sql AS $$ SELECT t.sub(p_action, p_payload::jsonb) $$;
SELECT id AS aim_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' AND proposer = 'claude' \gset
SELECT id AS ce1_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'commander_enables' AND statement LIKE 'Urza turns every%' \gset
SELECT id AS ce2_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'commander_enables' AND statement LIKE 'Urza makes treasure%' \gset
SELECT id AS win1_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'win_condition' \gset
SELECT public.owner_decide_strategy_item(t.u1(), 100, :aim_id, 'accept') AS r \gset acc_
SELECT t.chk('F6-20 Accept turns the Claude item into the owner''s, same id, no batch, no evidence, state accepted; the returned previous row is the Claude one',
  (SELECT proposer = 'owner' AND state = 'accepted' AND batch_id IS NULL AND based_on_oracle_ids IS NULL AND replaces_item_id IS NULL FROM deck_strategy_items WHERE id = :aim_id)
  AND :'acc_r'::jsonb#>>'{previous,proposer}' = 'claude' AND :'acc_r'::jsonb#>>'{current,proposer}' = 'owner', :'acc_r');
SELECT t.snap() AS sx \gset
SELECT t.und(batch_id, 'claude') AS r FROM deck_strategy_items WHERE id = :ce1_id \gset ua_
SELECT t.chk('F6-21 Claude cannot undo the first batch any more (one item is the owner''s now): changed_since, and nothing at all changed (all or nothing)',
  :'ua_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND t.snap() = :'sx', :'ua_r');
SELECT to_jsonb(i) AS owner_before FROM deck_strategy_items i WHERE id = :aim_id \gset
SELECT t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"aim","statement":"Cast one huge artifact-powered spell.","reason":"Shorter.","replaces_id":%s}]}', :aim_id)) AS r \gset rep_
SELECT t.chk('F6-22 Claude''s new wording for the owner''s Aim is a second row BESIDE it; the owner''s row is byte for byte unchanged and still in force',
  :'rep_r'::jsonb#>>'{res,plan,changes,0,result}' = 'beside_yours'
  AND (SELECT to_jsonb(i) FROM deck_strategy_items i WHERE id = :aim_id) = :'owner_before'::jsonb
  AND (SELECT count(*) FROM deck_strategy_items WHERE replaces_item_id = :aim_id AND proposer = 'claude' AND state = 'to_look_at') = 1, :'rep_r');
SELECT t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"aim","statement":"Cast one huge spell off artifact mana.","replaces_id":%s}]}', :aim_id)) AS r \gset rep2_
SELECT t.chk('F6-23 a second proposal for the same item rewrites the same beside row (still one), the log keeps the earlier wording, and the owner''s row is still unchanged',
  (SELECT count(*) FROM deck_strategy_items WHERE replaces_item_id = :aim_id) = 1 AND (SELECT statement FROM deck_strategy_items WHERE replaces_item_id = :aim_id) = 'Cast one huge spell off artifact mana.'
  AND (SELECT before->>'statement' FROM ai_change_log WHERE group_id = t.gid(:'rep2_r'::jsonb)) = 'Cast one huge artifact-powered spell.'
  AND (SELECT to_jsonb(i) FROM deck_strategy_items i WHERE id = :aim_id) = :'owner_before'::jsonb, :'rep2_r');
SELECT t.und(t.gid(:'rep2_r'::jsonb), 'claude') AS r \gset u2_
SELECT t.chk('F6-24 Claude undoes the rewording: the earlier beside wording is back', :'u2_r'::jsonb#>>'{res,success}' = 'true'
  AND (SELECT statement FROM deck_strategy_items WHERE replaces_item_id = :aim_id) = 'Cast one huge artifact-powered spell.', :'u2_r');
SELECT t.chk('F6-25 wording identical to the owner''s is skipped (nothing_to_change); a replaces_id of a beside row or of another kind is refused (bad_replaces)',
  t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"aim","statement":"%s","replaces_id":%s}]}', (SELECT statement FROM deck_strategy_items WHERE id = :aim_id), :aim_id))->>'err' = 'nothing_to_change'
  AND t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"aim","statement":"Another","replaces_id":%s}]}', (SELECT id FROM deck_strategy_items WHERE replaces_item_id = :aim_id)))->>'err' = 'bad_replaces'
  AND t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"win_condition","statement":"Another","replaces_id":%s}]}', :aim_id))->>'err' = 'bad_replaces'
  AND t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"aim","statement":"Dup A","replaces_id":%s},{"kind":"aim","statement":"Dup B","replaces_id":%s}]}', :aim_id, :aim_id))->>'err' = 'bad_replaces', '');
SELECT id AS beside_id FROM deck_strategy_items WHERE replaces_item_id = :aim_id \gset
SELECT public.owner_decide_strategy_item(t.u1(), 100, :beside_id, 'accept') AS r \gset acc2_
SELECT t.chk('F6-26 Accept on the beside row writes the new wording into the owner''s item (same id) and removes the beside row',
  (SELECT statement FROM deck_strategy_items WHERE id = :aim_id) = 'Cast one huge artifact-powered spell.' AND (SELECT proposer = 'owner' FROM deck_strategy_items WHERE id = :aim_id)
  AND NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE id = :beside_id) AND :'acc2_r'::jsonb#>>'{previous_target,statement}' = 'Turn artifacts into mana and cast one huge spell.', :'acc2_r');
SELECT t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"commander_enables","statement":"Urza turns every artifact you control into mana.","replaces_id":%s}]}', :ce1_id)) AS r \gset own_
SELECT t.chk('F6-27 Claude may rewrite its OWN waiting item in place (same id, rewrote_own); the earlier wording is in the log; Undo puts it back',
  :'own_r'::jsonb#>>'{res,plan,changes,0,result}' = 'rewrote_own' AND (SELECT statement FROM deck_strategy_items WHERE id = :ce1_id) = 'Urza turns every artifact you control into mana.'
  AND (SELECT before->>'statement' FROM ai_change_log WHERE group_id = t.gid(:'own_r'::jsonb)) = 'Urza turns every artifact into a mana source.', :'own_r');
SELECT t.und(t.gid(:'own_r'::jsonb), 'claude') AS r \gset uo_
SELECT t.chk('F6-28 Undo of the rewrite restores the earlier wording', :'uo_r'::jsonb#>>'{res,success}' = 'true' AND (SELECT statement FROM deck_strategy_items WHERE id = :ce1_id) = 'Urza turns every artifact into a mana source.', :'uo_r');
SELECT public.owner_decide_strategy_item(t.u1(), 100, :ce2_id, 'dismiss') AS r \gset dis_
SELECT t.chk('F6-29 Dismiss keeps the row as dismissed (the memory); Claude proposing the same sentence again is skipped as previously_dismissed; a different sentence is accepted',
  (SELECT state = 'dismissed' FROM deck_strategy_items WHERE id = :ce2_id)
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"Urza makes treasure-like mana from Thopters."}]}')->'detail' IS NOT NULL
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"urza makes TREASURE-like mana from thopters. "},{"kind":"commander_enables","statement":"Urza lets Thopters pay for spells."}]}')#>>'{res,plan,skipped,0,why}' = 'previously_dismissed', '');
SQL

echo "== Owner saves, caps and the 7-item limit"
$P <<'SQL'
SELECT id AS aim_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' \gset
SELECT id AS win1_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'win_condition' \gset
SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"win_condition","statement":"  Win by Thopter and Sword combo, owner wording. ","reason":"My plan"}') AS r \gset w2_
SELECT public.owner_save_strategy_item(t.u1(), 100, :win1_id, '{"kind":"win_condition","statement":"Win with the Thopter and Sword combo, changed by me."}') AS r \gset w1e_
SELECT t.chk('F6-30 owner create trims and stores an owner row; owner edit of a Claude item makes it the owner''s (batch, evidence cleared); both return previous for the 10-second Undo',
  :'w2_r'::jsonb#>>'{current,statement}' = 'Win by Thopter and Sword combo, owner wording.' AND :'w2_r'::jsonb->'previous' = 'null'::jsonb AND :'w1e_r'::jsonb#>>'{previous,proposer}' = 'claude'
  AND (SELECT proposer = 'owner' AND batch_id IS NULL AND based_on_oracle_ids IS NULL FROM deck_strategy_items WHERE id = :win1_id), '');
SELECT t.chk('F6-31 owner refusals: same sentence (item_exists), kind change, wrong deck, missing item, bad kind, bad statement',
  t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"win_condition","statement":"win by thopter and sword combo, owner wording."}')$q$)->>'err' = 'item_exists'
  AND t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, (SELECT id FROM deck_strategy_items WHERE kind = 'aim' AND deck_id = 100), '{"kind":"win_condition","statement":"x"}')$q$)->>'err' = 'invalid_request'
  AND t.att($q$SELECT public.owner_save_strategy_item(t.u2(), 100, NULL, '{"kind":"aim","statement":"x"}')$q$)->>'err' = 'deck_not_found'
  AND t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, 99999, '{"kind":"aim","statement":"x"}')$q$)->>'err' = 'item_not_found'
  AND t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"plan","statement":"x"}')$q$)->>'err' = 'unknown_kind'
  AND t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"aim","statement":""}')$q$)->>'err' = 'bad_statement', '');
SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"win_condition","statement":"Third win condition."}') AS r \gset w3_
SELECT t.chk('F6-32 Aim 1, What the commander enables 3, Win condition 3: a 4th Win condition and a 2nd Aim are refused for the owner (kind_full); a replacement does not count',
  t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"win_condition","statement":"Fourth."}')$q$)->>'err' = 'kind_full'
  AND t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"aim","statement":"Second aim."}')$q$)->>'err' = 'kind_full'
  AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND state <> 'dismissed' AND replaces_item_id IS NULL) = 6, '');
SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"reference_commander","statement":"Play it like Norin the Wary."}') AS r \gset ref_
SELECT t.chk('F6-33 one Play it like line per deck (second refused); the Claude proposal for a second one is skipped as kind_full',
  t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"reference_commander","statement":"Play it like another."}')$q$)->>'err' = 'kind_full'
  AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND state <> 'dismissed' AND replaces_item_id IS NULL) = 7, '');
SELECT t.chk('F6-34 the deck has 7 items now: the owner''s 8th is refused (deck_items_full) even though the kind has room; Claude''s is skipped as deck_items_full',
  t.att($q$SELECT public.owner_save_strategy_item(t.u1(), 100, NULL, '{"kind":"commander_enables","statement":"An eighth item."}')$q$)->>'err' = 'deck_items_full'
  AND t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"Claude eighth."}]}')->'detail' IS NOT NULL, '');
SELECT t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"commander_enables","statement":"Claude eighth."}]}') AS r \gset c8_
SELECT t.chk('F6-35 Claude''s item beyond 7 is skipped with why deck_items_full and nothing is written', :'c8_r'::jsonb->>'err' = 'nothing_to_change' AND :'c8_r'::jsonb->'detail' ->> 0 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE statement = 'Claude eighth.'), :'c8_r');
SELECT t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"win_condition","statement":"Claude would word it so.","replaces_id":%s}]}', :win1_id)) AS r \gset rw_
SELECT t.chk('F6-36 at 7 items a Claude rewording still goes beside the owner''s item (it does not count toward the 7)', :'rw_r'::jsonb#>>'{res,plan,changes,0,result}' = 'beside_yours'
  AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 100 AND state <> 'dismissed' AND replaces_item_id IS NULL) = 7, :'rw_r');
SELECT public.owner_accept_strategy_item_proposals(t.u1(), 100) AS r \gset aa_
SELECT t.chk('F6-37 Accept-all accepts waiting Claude items but leaves a rewording beside an owner item for its own decision',
  (:'aa_r'::jsonb->>'left_beside')::int = 1 AND (:'aa_r'::jsonb->>'accepted')::int >= 1 AND NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id = 100 AND proposer = 'claude' AND state = 'to_look_at' AND replaces_item_id IS NULL)
  AND EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id = 100 AND proposer = 'claude' AND state = 'to_look_at' AND replaces_item_id IS NOT NULL), :'aa_r');
SELECT t.chk('F6-38 accept-all needs a scope; user 2 cannot use user 1''s deck', t.att($q$SELECT public.owner_accept_strategy_item_proposals(t.u1())$q$)->>'err' = 'invalid_request'
  AND t.att($q$SELECT public.owner_accept_strategy_item_proposals(t.u2(), 100)$q$)->>'err' = 'deck_not_found'
  AND t.att($q$SELECT public.owner_decide_strategy_item(t.u1(), 100, (SELECT id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim'), 'accept')$q$)->>'err' = 'no_proposal'
  AND t.att($q$SELECT public.owner_decide_strategy_item(t.u1(), 100, (SELECT id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim'), 'maybe')$q$)->>'err' = 'bad_decision', '');
SQL

echo "== Two sessions at once cannot both pass the cap"
$P -c "INSERT INTO decks (id, name, format, is_active, user_id, card_count) VALUES (400, 'Race', 'commander', true, '00000000-0000-0000-0000-000000000001', 0)"
( $P -At -c "BEGIN; SELECT public.owner_save_strategy_item(t.u1(), 400, NULL, '{\"kind\":\"aim\",\"statement\":\"Race A\"}'); SELECT pg_sleep(3); COMMIT;" >/dev/null ) &
sleep 1
RACE_B=$($P -At -c "SELECT t.att(\$q\$SELECT public.owner_save_strategy_item(t.u1(), 400, NULL, '{\"kind\":\"aim\",\"statement\":\"Race B\"}')\$q\$)->>'err'")
wait
$P -c "SELECT t.chk('F6-39 two sessions saving an Aim for the same deck at once: the second waits for the first and is then refused (kind_full); exactly one Aim exists', '$RACE_B' = 'kind_full' AND (SELECT count(*) FROM deck_strategy_items WHERE deck_id = 400) = 1, '$RACE_B')"

echo "== Deleting an item"
$P <<'SQL'
SELECT id AS win1_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'win_condition' AND statement LIKE 'Win with the Thopter%' \gset
SELECT public.owner_delete_strategy_item(t.u1(), 100, :win1_id) AS r \gset del_
SELECT t.chk('F6-40 owner delete removes the item, returns it, and the Claude rewording that sat beside it is kept as dismissed (so no kind goes over its limit)',
  NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE id = :win1_id) AND :'del_r'::jsonb#>>'{deleted,id}' = :'win1_id'
  AND (SELECT state = 'dismissed' AND replaces_item_id IS NULL FROM deck_strategy_items WHERE statement = 'Claude would word it so.')
  AND t.att($q$SELECT public.owner_delete_strategy_item(t.u1(), 100, 99999)$q$)->>'err' = 'item_not_found' AND t.att($q$SELECT public.owner_delete_strategy_item(t.u2(), 100, 1)$q$)->>'err' = 'deck_not_found', :'del_r');
SQL

echo "== Jobs and links"
$P <<'SQL'
SELECT id AS aim_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' \gset
SELECT id AS ce1_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'commander_enables' AND state <> 'dismissed' ORDER BY id LIMIT 1 \gset
SELECT public.owner_set_card_job(t.u1(), 100, t.o(2), 'set', 'Payoff') AS r \gset j2_
SELECT public.owner_set_card_job(t.u1(), 100, t.o(3), 'set', 'Engine') AS r \gset j3_
SELECT public.owner_set_card_job(t.u1(), 100, t.o(6), 'clear_job') AS r \gset j6_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 4', NULL, NULL, '{"name":"Enabler","reason":"Makes mana"}'))) AS r \gset j4_
SELECT t.chk('F6-50 setup: Card 2 and Card 3 have owner jobs, Card 4 a waiting Claude job, Card 6 "no job on purpose", Card 5 nothing', :'j4_r'::jsonb#>>'{res,outcome}' = 'applied', :'j4_r');
SELECT t.snap() AS sl0 \gset
SELECT t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(
  jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 3'), 'name', 'Card 3', 'serves', jsonb_build_object('item_id', :ce1_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 4'), 'name', 'Card 4', 'serves', jsonb_build_object('item_id', :aim_id)))), NULL, NULL, true) AS r \gset ld_
SELECT t.chk('F6-51 a links dry run says would_apply with 3 changes and writes nothing', :'ld_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND (:'ld_r'::jsonb#>>'{res,plan,n}')::int = 3 AND t.snap() = :'sl0', :'ld_r');
SELECT t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(
  jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 3'), 'name', 'Card 3', 'serves', jsonb_build_object('item_id', :ce1_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 4'), 'name', 'Card 4', 'serves', jsonb_build_object('item_id', :aim_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 5'), 'name', 'Card 5', 'serves', jsonb_build_object('item_id', :aim_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 6'), 'name', 'Card 6', 'serves', jsonb_build_object('item_id', :aim_id))))) AS r \gset la_
SELECT t.chk('F6-52 links apply at once: 3 Claude rows waiting in one batch with one log row per card (oracle id and printing recorded); Card 5 (no job) and Card 6 (no job on purpose) are skipped as no_job',
  :'la_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM deck_job_serves WHERE deck_id = 100 AND proposer = 'claude' AND state = 'to_look_at' AND batch_id = t.gid(:'la_r'::jsonb)) = 3
  AND (SELECT count(*) FROM jsonb_array_elements(:'la_r'::jsonb#>'{res,plan,skipped}') e WHERE e->>'why' = 'no_job') = 2
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'la_r'::jsonb) AND kind = 'job_link' AND oracle_id = t.o(2)::text AND printing_id = t.s(2)::text AND deck_card_id = t.slot(100,'Card 2')) = 1
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'la_r'::jsonb)) = 3, :'la_r');
SELECT t.chk('F6-53 the same links again are unchanged (nothing_to_change); only a no-job card gives nothing_to_change too',
  t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)))))->>'err' = 'nothing_to_change'
  AND t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 5'), 'name', 'Card 5', 'serves', jsonb_build_object('item_id', :aim_id)))))->>'err' = 'nothing_to_change', '');
SELECT t.subf('strategy_item', format('{"deck_id":100,"items":[{"kind":"aim","statement":"Beside wording for the link test.","replaces_id":%s}]}', :aim_id)) AS r \gset bs_
SELECT t.snap() AS sl1 \gset
SELECT t.chk('F6-54a link refusal: both targets writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id, 'point_id', 1)))))->>'err' = 'bad_serves', '');
SELECT t.chk('F6-54b link refusal: neither target writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', '{}'::jsonb))))->>'err' = 'bad_serves', '');
SELECT t.chk('F6-54c link refusal: made-up item writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', 99999)))))->>'err' = 'serves_not_found', '');
SELECT t.chk('F6-54d link refusal: made-up point writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('point_id', 99999)))))->>'err' = 'serves_not_found', '');
SELECT t.chk('F6-54e link refusal: dismissed item writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', (SELECT id FROM deck_strategy_items WHERE state = 'dismissed' AND deck_id = 100 LIMIT 1))))))->>'err' = 'serves_not_found', '');
SELECT t.chk('F6-54f link refusal: beside row writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', (SELECT id FROM deck_strategy_items WHERE replaces_item_id IS NOT NULL AND deck_id = 100 LIMIT 1))))))->>'err' = 'serves_not_found', '');
SELECT t.chk('F6-54g link refusal: repeated card writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)), jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)))))->>'err' = 'duplicate_slot', '');
SELECT t.chk('F6-54h link refusal: wrong name writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 3', 'serves', jsonb_build_object('item_id', :aim_id)))))->>'err' = 'slot_not_found', '');
SELECT t.chk('F6-54i link refusal: user 2 writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)))), t.u2(), t.c2())->>'err' = 'deck_not_found', '');
SELECT t.chk('F6-54j link refusal: switched-off connection writes nothing', t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :aim_id)))), NULL, t.c1_off())->>'err' = 'connection_revoked', '');
SELECT t.chk('F6-54k none of those refusals wrote anything', t.snap() = :'sl1', '');
SQL

echo "== More link behaviour: points, the owner's link, beside, clear, jobs that go away"
$P <<'SQL'
SELECT id AS aim_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' AND proposer = 'owner' \gset
SELECT id AS ce1_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'commander_enables' AND state = 'accepted' ORDER BY id LIMIT 1 \gset
SELECT id AS dis_id FROM deck_strategy_items WHERE deck_id = 100 AND state = 'dismissed' ORDER BY id LIMIT 1 \gset
SELECT (public.owner_save_strategy_point(t.u1(), 100, NULL, '{"statement":"Artifacts count as ramp in this deck","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as","group":"ramp"}}')#>>'{current,id}')::bigint AS pt_id \gset
SELECT t.subf('job_link', format('{"deck_id":100,"links":[{"slot_id":%s,"name":"Card 4","serves":{"point_id":%s}}]}', t.slot(100,'Card 4'), :pt_id)) AS r \gset pl_
SELECT t.chk('F6-60 a link to a strategy POINT works; Claude rewriting its own waiting link keeps the earlier target in the log',
  :'pl_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT serves_point_id = :pt_id AND serves_item_id IS NULL FROM deck_job_serves WHERE deck_id = 100 AND oracle_id = t.o(4) AND proposer = 'claude')
  AND (SELECT before->>'serves_kind' = 'item' AND (before->>'serves_id')::bigint = :aim_id FROM ai_change_log WHERE group_id = t.gid(:'pl_r'::jsonb)), :'pl_r');
SELECT t.und(t.gid(:'pl_r'::jsonb), 'claude') AS r \gset plu_
SELECT t.chk('F6-61 Undo of the rewrite points the link back at the Aim', :'plu_r'::jsonb#>>'{res,success}' = 'true' AND (SELECT serves_item_id = :aim_id FROM deck_job_serves WHERE deck_id = 100 AND oracle_id = t.o(4) AND proposer = 'claude'), :'plu_r');
SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'item', :ce1_id) AS r \gset os_
SELECT t.chk('F6-62 the owner sets Card 2''s link; the waiting Claude link (to the Aim) stays beside it; the effective link is the owner''s',
  :'os_r'::jsonb->'previous' = 'null'::jsonb AND (SELECT effective_from = 'you' AND effective_kind = 'item' AND effective_id = :ce1_id AND beside AND claude_id = :aim_id FROM get_deck_job_links(t.u1(), 100) WHERE oracle_id = t.o(2)), :'os_r');
SELECT t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('item_id', :ce1_id))))) AS r \gset same_
SELECT t.chk('F6-63 Claude proposing exactly what the owner chose is unchanged (nothing written)', :'same_r'::jsonb->>'err' = 'nothing_to_change', :'same_r');
SELECT t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('point_id', :pt_id))))) AS r \gset bl_
SELECT t.chk('F6-64 a different link for a card the owner already linked is written beside the owner''s (beside_yours); the owner row is untouched',
  :'bl_r'::jsonb#>>'{res,plan,changes,0,result}' = 'beside_yours' AND (SELECT serves_item_id = :ce1_id FROM deck_job_serves WHERE oracle_id = t.o(2) AND proposer = 'owner' AND deck_id = 100)
  AND (SELECT serves_point_id = :pt_id FROM deck_job_serves WHERE oracle_id = t.o(2) AND proposer = 'claude' AND deck_id = 100), :'bl_r');
SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'clear') AS r \gset oc_
SELECT t.chk('F6-65 clear removes the owner''s link and sets the waiting Claude link to dismissed, so the card really has no link; Claude proposing the dismissed target again is skipped',
  NOT EXISTS (SELECT 1 FROM deck_job_serves WHERE oracle_id = t.o(2) AND deck_id = 100 AND proposer = 'owner') AND (SELECT state = 'dismissed' FROM deck_job_serves WHERE oracle_id = t.o(2) AND deck_id = 100 AND proposer = 'claude')
  AND (SELECT effective_kind IS NULL FROM get_deck_job_links(t.u1(), 100) WHERE oracle_id = t.o(2))
  AND t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 2'), 'name', 'Card 2', 'serves', jsonb_build_object('point_id', :pt_id)))))->>'err' = 'nothing_to_change', :'oc_r');
SELECT public.owner_decide_job_link(t.u1(), 100, t.o(3), 'accept') AS r \gset ac_
SELECT t.chk('F6-66 Accept turns Card 3''s Claude link into the owner''s', :'ac_r'::jsonb#>>'{current,proposer}' = 'owner' AND (SELECT batch_id IS NULL AND state = 'accepted' FROM deck_job_serves WHERE oracle_id = t.o(3) AND proposer = 'owner'), :'ac_r');
SELECT public.owner_decide_job_link(t.u1(), 100, t.o(4), 'dismiss') AS r \gset dm_
SELECT t.chk('F6-67 Dismiss keeps Card 4''s link row as dismissed; deciding with nothing waiting is no_proposal; a bad decision is refused',
  (SELECT state = 'dismissed' FROM deck_job_serves WHERE oracle_id = t.o(4) AND proposer = 'claude' AND deck_id = 100)
  AND t.att($q$SELECT public.owner_decide_job_link(t.u1(), 100, t.o(4), 'accept')$q$)->>'err' = 'no_proposal'
  AND t.att($q$SELECT public.owner_decide_job_link(t.u1(), 100, t.o(1), 'accept')$q$)->>'err' = 'no_proposal'
  AND t.att($q$SELECT public.owner_decide_job_link(t.u1(), 100, t.o(4), 'maybe')$q$)->>'err' = 'bad_decision', '');
SELECT t.chk('F6-68 owner link refusals: no job (Card 5), a card not in the deck, a made-up item, a dismissed item, bad action, bad target, another user',
  t.att(format($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(5), 'set', 'item', %s)$q$, :aim_id))->>'err' = 'no_job'
  AND t.att(format($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(19), 'set', 'item', %s)$q$, :aim_id))->>'err' = 'card_not_in_deck'
  AND t.att($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'item', 99999)$q$)->>'err' = 'serves_not_found'
  AND t.att(format($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'item', %s)$q$, :dis_id))->>'err' = 'serves_not_found'
  AND t.att($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'point', 99999)$q$)->>'err' = 'serves_not_found'
  AND t.att($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'swap')$q$)->>'err' = 'bad_action'
  AND t.att($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'row', 1)$q$)->>'err' = 'bad_serves'
  AND t.att(format($q$SELECT public.owner_set_job_link(t.u2(), 100, t.o(2), 'set', 'item', %s)$q$, :aim_id))->>'err' = 'deck_not_found', '');
SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'point', :pt_id) AS r \gset o2b_
SELECT public.owner_set_card_job(t.u1(), 100, t.o(2), 'clear_job') AS r \gset cj_
SELECT t.chk('F6-69 when a card''s job is cleared its link is not shown (no effective link) and a new link is refused; when the job comes back the link comes back',
  (SELECT effective_kind IS NULL AND owner_kind = 'point' FROM get_deck_job_links(t.u1(), 100) WHERE oracle_id = t.o(2))
  AND t.att(format($q$SELECT public.owner_set_job_link(t.u1(), 100, t.o(2), 'set', 'item', %s)$q$, :aim_id))->>'err' = 'no_job', '');
SELECT public.owner_set_card_job(t.u1(), 100, t.o(2), 'set', 'Payoff') AS r \gset cj2_
SELECT t.chk('F6-70 the link is back with the job', (SELECT effective_from = 'you' AND effective_kind = 'point' AND effective_id = :pt_id AND NOT beside FROM get_deck_job_links(t.u1(), 100) WHERE oracle_id = t.o(2)), '');
SELECT t.chk('F6-71 the reader works for the owner of the deck only', t.att($q$SELECT to_jsonb(count(*)) FROM get_deck_job_links(t.u2(), 100)$q$)->>'err' = 'deck_not_found'
  AND t.att($q$SELECT to_jsonb(count(*)) FROM get_deck_strategy_items(t.u2(), 100)$q$)->>'err' = 'deck_not_found' AND t.att($q$SELECT public.get_deck_strategy_staleness(t.u2(), 100)$q$)->>'err' = 'deck_not_found', '');
SELECT public.owner_delete_strategy_item(t.u1(), 100, :ce1_id) AS r \gset dl_
SELECT t.chk('F6-72 deleting an item removes the links that pointed at it and returns them (for the 10-second Undo)',
  jsonb_array_length(:'dl_r'::jsonb->'deleted_links') = 1 AND NOT EXISTS (SELECT 1 FROM deck_job_serves WHERE serves_item_id = :ce1_id)
  AND :'dl_r'::jsonb#>>'{deleted_links,0,proposer}' = 'owner' AND :'dl_r'::jsonb#>>'{deleted_links,0,card_name}' = 'Card 3', :'dl_r');
SQL

echo "== Undo of links, the 7-day window, owner undo with left-alone"
$P <<'SQL'
SELECT id AS aim_id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'aim' AND proposer = 'owner' \gset
SELECT public.owner_set_card_job(t.u1(), 100, t.o(7), 'set', 'Flex') AS r \gset a7_
SELECT public.owner_set_card_job(t.u1(), 100, t.o(8), 'set', 'Flex') AS r \gset a8_
SELECT t.age();
SELECT t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(
  jsonb_build_object('slot_id', t.slot(100,'Card 7'), 'name', 'Card 7', 'serves', jsonb_build_object('item_id', :aim_id)),
  jsonb_build_object('slot_id', t.slot(100,'Card 8'), 'name', 'Card 8', 'serves', jsonb_build_object('item_id', :aim_id))))) AS r \gset ub_
SELECT public.owner_decide_job_link(t.u1(), 100, t.o(8), 'dismiss') AS r \gset d8_
SELECT t.snap() AS sx \gset
SELECT t.und(t.gid(:'ub_r'::jsonb), 'claude') AS r \gset c1_
SELECT t.chk('F6-80 Claude cannot undo the batch (Card 8''s link was dismissed by the owner): changed_since and nothing changes', :'c1_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND t.snap() = :'sx', :'c1_r');
SELECT t.und(t.gid(:'ub_r'::jsonb), 'owner') AS r \gset o1_
SELECT t.chk('F6-81 the owner''s undo restores Card 7 (link gone) and lists Card 8 as left alone',
  :'o1_r'::jsonb#>>'{res,success}' = 'true' AND (:'o1_r'::jsonb#>>'{res,undone}')::int = 1 AND :'o1_r'::jsonb#>>'{res,left_alone,0,card}' = 'Card 8'
  AND NOT EXISTS (SELECT 1 FROM deck_job_serves WHERE oracle_id = t.o(7) AND deck_id = 100) AND (SELECT state = 'dismissed' FROM deck_job_serves WHERE oracle_id = t.o(8) AND deck_id = 100), :'o1_r');
SELECT t.chk('F6-82 undoing again: nothing is left for the owner to restore (nothing_to_undo; Card 8 is still the owner''s), and Claude still cannot undo the batch (changed_since)', t.und(t.gid(:'ub_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'nothing_to_undo' AND t.und(t.gid(:'ub_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'changed_since', '');
SELECT t.sub('job_link', jsonb_build_object('deck_id', 100, 'links', jsonb_build_array(jsonb_build_object('slot_id', t.slot(100,'Card 7'), 'name', 'Card 7', 'serves', jsonb_build_object('item_id', :aim_id))))) AS r \gset w_
SELECT t.expire(t.gid(:'w_r'::jsonb));
SELECT t.chk('F6-83 after 7 days Undo is closed for Claude and the owner (window_closed)', t.und(t.gid(:'w_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'window_closed' AND t.und(t.gid(:'w_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'window_closed', '');
SELECT t.sub('strategy_item', '{"deck_id":400,"items":[{"kind":"win_condition","statement":"Undo me by Claude."},{"kind":"commander_enables","statement":"Undo me too."}]}') AS r \gset iu_
SELECT t.und(t.gid(:'iu_r'::jsonb), 'claude') AS r \gset iu2_
SELECT t.chk('F6-84 Claude undoes an items batch in one go: both rows are gone, both log rows marked undone by claude',
  :'iu2_r'::jsonb#>>'{res,success}' = 'true' AND NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id = 400 AND proposer = 'claude')
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'iu_r'::jsonb) AND undone_by = 'claude') = 2, :'iu2_r');
SELECT t.chk('F6-85 user 2 cannot undo or see user 1''s batch', t.und(t.gid(:'ub_r'::jsonb), 'owner', t.u2(), t.c2())#>>'{res,refused,code}' IS DISTINCT FROM 'zzz'
  AND (SELECT count(*) FROM jsonb_array_elements(public.ai_list_recent_changes(t.u2())) e WHERE e->>'kind' IN ('strategy_item','job_link')) = 0, '');
SQL

echo "== Limits: 120 links apply, 121 wait, 201 refused; approving a held request"
$P <<'SQL'
SELECT t.age();
SELECT t.mkdeck(300, t.u1(), 130, 'Big', 1000);
SELECT t.mkdeck(301, t.u1(), 130, 'Huge', 3000);
INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) SELECT t.u1(), 300, t.o(1000 + i), 'Big ' || i, 'Flex', 'owner', 'accepted' FROM generate_series(1, 130) i;
INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) SELECT t.u1(), 301, t.o(3000 + i), 'Huge ' || i, 'Flex', 'owner', 'accepted' FROM generate_series(1, 130) i;
SELECT (public.owner_save_strategy_item(t.u1(), 300, NULL, '{"kind":"aim","statement":"Big aim"}')#>>'{current,id}')::bigint AS big_item \gset
SELECT (public.owner_save_strategy_item(t.u1(), 301, NULL, '{"kind":"aim","statement":"Huge aim"}')#>>'{current,id}')::bigint AS huge_item \gset
CREATE FUNCTION t.bigl(p_deck integer, p_lo integer, p_hi integer, p_prefix text, p_item bigint) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('deck_id', p_deck, 'links', COALESCE(jsonb_agg(jsonb_build_object('slot_id', dc.id, 'name', dc.card_name, 'serves', jsonb_build_object('item_id', p_item)) ORDER BY dc.id), '[]'::jsonb))
    FROM public.deck_cards dc WHERE dc.deck_id = p_deck AND dc.card_name IN (SELECT p_prefix || ' ' || i FROM generate_series(p_lo, p_hi) i) $$;
SELECT t.sub('job_link', t.bigl(300, 1, 120, 'Big', :big_item)) AS r \gset l1_
SELECT t.chk('F6-90 120 links apply at once: 120 rows, 120 log rows, one batch', :'l1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM deck_job_serves WHERE deck_id = 300) = 120
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'l1_r'::jsonb) AND kind = 'job_link') = 120, left(:'l1_r', 200));
SELECT t.sub('job_link', t.bigl(301, 1, 121, 'Huge', :huge_item)) AS r \gset l2_
SELECT (:'l2_r'::jsonb#>>'{res,pending_id}')::text AS pid \gset
SELECT t.chk('F6-91 121 links wait for the owner as over_ten and write nothing yet', :'l2_r'::jsonb#>>'{res,outcome}' = 'pending' AND :'l2_r'::jsonb#>>'{res,reason}' = 'over_ten' AND (SELECT count(*) FROM deck_job_serves WHERE deck_id = 301) = 0, left(:'l2_r', 200));
SELECT t.chk('F6-92 201 links are refused outright (too_many_cards)', t.sub('job_link', jsonb_build_object('deck_id', 301, 'links', (SELECT jsonb_agg(jsonb_build_object('slot_id', i, 'name', 'x', 'serves', jsonb_build_object('item_id', :huge_item))) FROM generate_series(1, 201) i)))->>'err' = 'too_many_cards', '');
SELECT t.appr(:'pid'::uuid) AS r \gset ap_
SELECT t.chk('F6-93 approving the held request applies the 121 links, marked approved by the owner, and Claude cannot undo an approved batch (owner_only)',
  :'ap_r'::jsonb#>>'{res,success}' = 'true' AND (SELECT count(*) FROM deck_job_serves WHERE deck_id = 301) = 121 AND (SELECT count(*) FROM ai_change_log WHERE kind = 'job_link' AND deck_id = 301 AND approved_by_owner) = 121
  AND t.und((SELECT group_id FROM ai_change_log WHERE kind = 'job_link' AND deck_id = 301 LIMIT 1), 'claude')#>>'{res,refused,code}' = 'owner_only', left(:'ap_r', 200));
SELECT t.sub('job_link', t.bigl(301, 122, 125, 'Huge', :huge_item)) AS r \gset l3_
SELECT t.chk('F6-94 rows the owner approved do not count toward the 30-minute total, so a small follow-up request for the same deck applies at once', :'l3_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM deck_job_serves WHERE deck_id = 301) = 125, left(:'l3_r', 200));
DELETE FROM decks WHERE id = 301;
SELECT t.chk('F6-96 deleting a deck removes its items and its links (cascade)', NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id = 301) AND NOT EXISTS (SELECT 1 FROM deck_job_serves WHERE deck_id = 301), '');
SQL

echo "== Strategy changed since Claude set the numbers"
$P <<'SQL'
SELECT t.age();
SELECT public.get_deck_strategy_staleness(t.u1(), 400) AS r \gset s0_
SELECT t.chk('F6-100 no Claude numbers yet: claude_set_at is null and stale is false even though the deck has strategy', :'s0_r'::jsonb->>'claude_set_at' IS NULL AND (:'s0_r'::jsonb->>'stale')::boolean = false AND :'s0_r'::jsonb->>'strategy_changed_at' IS NOT NULL, :'s0_r');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":3,"reason":"Urza turns artifacts into mana."}]}') AS r \gset h1_
SELECT public.get_deck_strategy_staleness(t.u1(), 100) AS r \gset s1_
SELECT t.chk('F6-101 targets set after the last strategy change: not stale', :'h1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'s1_r'::jsonb->>'stale')::boolean = false AND :'s1_r'::jsonb->>'claude_set_at' IS NOT NULL, :'s1_r');
SELECT public.owner_save_strategy_item(t.u1(), 100, (SELECT id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'reference_commander'), '{"kind":"reference_commander","statement":"Play it like Norin, with more artifacts."}') AS r \gset e_
SELECT public.get_deck_strategy_staleness(t.u1(), 100) AS r \gset s2_
SELECT t.chk('F6-102 the owner edits an item after Claude set the numbers: stale', (:'s2_r'::jsonb->>'stale')::boolean = true, :'s2_r');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":4,"reason":"Refreshed for the new strategy."}]}') AS r \gset h2_
SELECT public.get_deck_strategy_staleness(t.u1(), 100) AS r \gset s3_
SELECT t.chk('F6-103 Claude sets the numbers again: stale is cleared', :'h2_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'s3_r'::jsonb->>'stale')::boolean = false, :'s3_r');
SELECT public.owner_decide_strategy_item(t.u1(), 100, (SELECT id FROM deck_strategy_items WHERE deck_id = 100 AND proposer = 'claude' AND state = 'to_look_at' AND replaces_item_id IS NOT NULL LIMIT 1), 'dismiss') AS r \gset dz_
SELECT public.owner_delete_strategy_item(t.u1(), 100, (SELECT id FROM deck_strategy_items WHERE deck_id = 100 AND kind = 'win_condition' AND proposer = 'owner' ORDER BY id LIMIT 1)) AS r \gset dd_
SELECT public.get_deck_strategy_staleness(t.u1(), 100) AS r \gset s4_
SELECT t.chk('F6-104 dismissing a row or deleting an item does not mark the numbers stale (documented limit: a delete leaves no update time)', (:'s4_r'::jsonb->>'stale')::boolean = false, :'s4_r');
SELECT public.ai_set_deck_setup(t.u1(), t.c1(), 100, '{"strategy_notes":"Claude added a note."}') AS r \gset n_
SELECT public.get_deck_strategy_staleness(t.u1(), 100) AS r \gset s5_
SELECT t.chk('F6-105 a Notes change through the connector moves deck_strategy.updated_at and marks the numbers stale', (:'s5_r'::jsonb->>'stale')::boolean = true, :'s5_r' || :'n_r');
SELECT public.owner_set_health_target(t.u1(), 400, 'ramp', 5, 'My own number') AS r \gset ov_
SELECT public.get_deck_strategy_staleness(t.u1(), 400) AS r \gset s6_
SELECT t.chk('F6-106 an owner-only override is not a Claude number: claude_set_at stays null and stale false', :'s6_r'::jsonb->>'claude_set_at' IS NULL AND (:'s6_r'::jsonb->>'stale')::boolean = false, :'s6_r');
SELECT t.chk('F6-107 the readers are read-only and refuse another user', t.att($q$SELECT public.get_deck_strategy_staleness(t.u2(), 100)$q$)->>'err' = 'deck_not_found', '');
SQL

echo "== Old kinds still run through the new front doors"
$P <<'SQL'
SELECT t.age();
SELECT t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}') AS r \gset k1_
SELECT t.und(t.gid(:'k1_r'::jsonb), 'claude') AS r \gset k1u_
SELECT t.chk('F6-110 deck_add applies and Claude undoes it', :'k1_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'k1u_r'::jsonb#>>'{res,success}' = 'true', :'k1u_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 10', ARRAY['ramp'], NULL, '{"name":"Engine","reason":"Ramp"}'))) AS r \gset k2_
SELECT t.und(t.gid(:'k2_r'::jsonb), 'claude') AS r \gset k2u_
SELECT t.chk('F6-111 card_label (role + job) applies and Claude undoes it', :'k2_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'k2u_r'::jsonb#>>'{res,success}' = 'true', :'k2u_r');
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"Order test point","covers":{"card_type":"artifact"}}]}') AS r \gset k3_
SELECT t.und(t.gid(:'k3_r'::jsonb), 'claude') AS r \gset k3u_
SELECT t.chk('F6-112 strategy_point applies and Claude undoes it', :'k3_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'k3u_r'::jsonb#>>'{res,success}' = 'true', :'k3u_r');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"lands","target":35,"reason":"Old kind check"}]}') AS r \gset k4_
SELECT t.und(t.gid(:'k4_r'::jsonb), 'claude') AS r \gset k4u_
SELECT t.chk('F6-113 health_target applies and Claude undoes it', :'k4_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'k4u_r'::jsonb#>>'{res,success}' = 'true', :'k4u_r');
SELECT t.sub('deck_category', jsonb_build_object('deck_id',100,'slots',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Card 1'),'card_name','Card 1','categories',jsonb_build_array('Mana Rocks'))))) AS r \gset k5_
SELECT t.chk('F6-114 deck_category applies', :'k5_r'::jsonb#>>'{res,outcome}' = 'applied', :'k5_r');
SELECT t.chk('F6-115 the append-only guard still blocks any change to an item or link log row (before, after, card, kind)',
  t.try($q$UPDATE ai_change_log SET after = '{}' WHERE kind = 'strategy_item'$q$) LIKE '%ai_change_log_is_append_only%' AND t.try($q$UPDATE ai_change_log SET card_name = 'x' WHERE kind = 'job_link'$q$) LIKE '%ai_change_log_is_append_only%'
  AND t.try($q$UPDATE ai_change_log SET kind = 'deck_add' WHERE kind = 'strategy_item'$q$) LIKE '%ai_change_log_is_append_only%', '');
SQL

echo "== Row security and who may call what"
$P <<'SQL'
SELECT t.snap() AS s2 \gset
INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u2(), 200, 'aim', 'User 2 aim.', 'owner', 'accepted');
SELECT id AS u2item FROM deck_strategy_items WHERE user_id = t.u2() \gset
INSERT INTO deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_item_id, proposer, state) VALUES (t.u2(), 200, t.o(1), 'Card 1', :u2item, 'owner', 'accepted');
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT (SELECT count(*) FROM public.deck_strategy_items WHERE user_id = '00000000-0000-0000-0000-000000000001') AS i_of_u1, (SELECT count(*) FROM public.deck_strategy_items) AS i_own,
       (SELECT count(*) FROM public.deck_job_serves WHERE user_id = '00000000-0000-0000-0000-000000000001') AS l_of_u1, (SELECT count(*) FROM public.deck_job_serves) AS l_own \gset u2_
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES ('00000000-0000-0000-0000-000000000002', 200, 'aim', 'x', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e1 \gset
SELECT t.att($q$WITH u AS (UPDATE public.deck_strategy_items SET statement = 'x' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e2 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_job_serves RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e3 \gset
SELECT t.att($q$SELECT public.owner_save_strategy_item('00000000-0000-0000-0000-000000000002', 200, NULL, '{"kind":"aim","statement":"x"}')$q$)->>'err' AS f1 \gset
SELECT t.att($q$SELECT public.owner_set_job_link('00000000-0000-0000-0000-000000000002', 200, gen_random_uuid(), 'clear')$q$)->>'err' AS f2 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.get_deck_strategy_items('00000000-0000-0000-0000-000000000002', 200)$q$)->>'err' AS f3 \gset
SELECT t.att($q$SELECT public._ai_plan_strategy_item('00000000-0000-0000-0000-000000000002', '{}')$q$)->>'err' AS f4 \gset
SELECT t.att($q$SELECT public._ai_execute_job_link('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'x', '{}', NULL, false)$q$)->>'err' AS f5 \gset
SELECT t.att($q$SELECT public.ai_undo_group('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner', NULL)$q$)->>'err' AS f6 \gset
SELECT t.att($q$SELECT public.get_deck_strategy_staleness('00000000-0000-0000-0000-000000000002', 200)$q$)->>'err' AS f7 \gset
SELECT t.att($q$SELECT public._ai_plan('00000000-0000-0000-0000-000000000002', 'strategy_item', '{}')$q$)->>'err' AS f8 \gset
RESET ROLE;
SELECT t.chk('F6-120 signed-in user 2 sees only their own rows in both tables', :u2_i_of_u1 = 0 AND :u2_i_own = 1 AND :u2_l_of_u1 = 0 AND :u2_l_own = 1, '');
SELECT t.chk('F6-121 signed-in users cannot insert, update, delete or call any DB-6 function (also not the four front doors)',
  :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%' AND :'f1' LIKE 'permission denied%' AND :'f2' LIKE 'permission denied%' AND :'f3' LIKE 'permission denied%'
  AND :'f4' LIKE 'permission denied%' AND :'f5' LIKE 'permission denied%' AND :'f6' LIKE 'permission denied%' AND :'f7' LIKE 'permission denied%' AND :'f8' LIKE 'permission denied%', concat_ws(' | ', :'e1', :'f1', :'f8'));
GRANT INSERT, UPDATE, DELETE ON public.deck_strategy_items, public.deck_job_serves TO authenticated;
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT t.att($q$WITH u AS (UPDATE public.deck_strategy_items SET statement = 'hacked' WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$) AS g1 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_job_serves WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$) AS g2 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES ('00000000-0000-0000-0000-000000000001', 100, 'aim', 'planted', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g3 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_job_serves (user_id, deck_id, oracle_id, card_name, serves_point_id, proposer, state) VALUES ('00000000-0000-0000-0000-000000000001', 100, gen_random_uuid(), 'x', 1, 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g4 \gset
RESET ROLE;
REVOKE INSERT, UPDATE, DELETE ON public.deck_strategy_items, public.deck_job_serves FROM authenticated;
SELECT t.chk('F6-122 with write access wrongly granted, user 2 still changes 0 of user 1''s rows and cannot plant one for them (row security)', :'g1'::jsonb#>>'{res}' = '0' AND :'g2'::jsonb#>>'{res}' = '0'
  AND :'g3' LIKE '%row-level security%' AND :'g4' LIKE '%row-level security%', :'g1' || :'g2' || :'g3' || :'g4');
SET ROLE anon;
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.deck_strategy_items$q$)->>'err' AS a1 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.deck_job_serves$q$)->>'err' AS a2 \gset
RESET ROLE;
SELECT t.chk('F6-123 the anonymous role cannot read either table', :'a1' LIKE 'permission denied%' AND :'a2' LIKE 'permission denied%', '');
SELECT t.chk('F6-124 service-role-only grants: no function of DB-6 (new or renamed or the four fronts) is executable by PUBLIC, anon or signed-in users',
  (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname ~ '(strategy_item|job_link|job_serves|strategy_staleness|^_job_effective|^_ai_limits_strategy|^_strategy_kind_label|^_ai_plan|^_ai_execute|^_ai_undo|^ai_undo_group|pre_strategy)'
     AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) = 0
  AND (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname ~ '(strategy_item|job_link|job_serves|strategy_staleness|^_job_effective|^_ai_limits_strategy|^_strategy_kind_label|pre_strategy)' AND has_function_privilege('service_role', p.oid, 'EXECUTE')) >= 28, '');
DELETE FROM deck_strategy_items WHERE user_id = t.u2();
SQL

echo "== The one-time copy of written win conditions (DB-6b)"
$P <<'SQL'
INSERT INTO decks (id, name, format, is_active, user_id, card_count) VALUES (701, 'W1', 'commander', true, t.u1(), 0), (702, 'W2', 'commander', true, t.u1(), 0), (703, 'W3', 'commander', true, t.u1(), 0), (704, 'W4', 'commander', true, t.u1(), 0);
INSERT INTO deck_strategy (deck_id, user_id, win_condition) VALUES (701, t.u1(), '  Combo win  '), (702, t.u1(), repeat('w', 301)), (703, t.u1(), '   '), (704, t.u1(), E'Line one\nLine two'), (200, t.u2(), 'U2 plan'), (400, t.u1(), 'Full deck text');
INSERT INTO deck_strategy_items (user_id, deck_id, kind, statement, proposer, state) VALUES (t.u1(), 400, 'win_condition', 'W-a', 'owner', 'accepted'), (t.u1(), 400, 'win_condition', 'W-b', 'owner', 'accepted'), (t.u1(), 400, 'win_condition', 'W-c', 'owner', 'accepted');
INSERT INTO t.keep VALUES ('h0', (SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY deck_id)) FROM deck_strategy s)), ('n0', (SELECT count(*) FROM deck_strategy_items)::text);
SQL
f $D/20261118140100_roles_db6b_copy_win_conditions.draft.sql
$P <<'SQL'
INSERT INTO t.keep VALUES ('h1', (SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY deck_id)) FROM deck_strategy s)), ('n1', (SELECT count(*) FROM deck_strategy_items)::text);
SELECT t.chk('F6-140 the copy made 3 Win condition items marked "Set by you" (owner, accepted): 701 trimmed, 704 multi-line as one item, user 2''s deck for user 2',
  (SELECT v::int FROM t.keep WHERE k = 'n1') - (SELECT v::int FROM t.keep WHERE k = 'n0') = 3 AND (SELECT statement = 'Combo win' AND proposer = 'owner' AND state = 'accepted' AND reason = 'Copied from your written win condition.' FROM deck_strategy_items WHERE deck_id = 701)
  AND (SELECT statement = E'Line one\nLine two' FROM deck_strategy_items WHERE deck_id = 704) AND (SELECT user_id = t.u2() AND statement = 'U2 plan' FROM deck_strategy_items WHERE deck_id = 200 AND kind = 'win_condition'), '');
SELECT t.chk('F6-141 skipped, not cut: the 301-character text (702), the blank one (703) and the deck that already has 3 Win conditions (400)',
  NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id IN (702, 703)) AND NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id = 400 AND reason = 'Copied from your written win condition.'), '');
SELECT t.chk('F6-142 the old written win condition is untouched: every deck_strategy row is byte for byte the same', (SELECT v FROM t.keep WHERE k = 'h0') = (SELECT v FROM t.keep WHERE k = 'h1'), '');
SQL
f $D/20261118140100_roles_db6b_copy_win_conditions.draft.sql
$P <<'SQL'
SELECT t.chk('F6-143 running the copy a second time makes no second copy', (SELECT count(*) FROM deck_strategy_items) = (SELECT v::int FROM t.keep WHERE k = 'n1'), '');
SELECT public.owner_save_strategy_item(t.u1(), 704, (SELECT id FROM deck_strategy_items WHERE deck_id = 704), '{"kind":"win_condition","statement":"Edited by me."}') AS r \gset ed_
UPDATE deck_strategy_items SET updated_at = updated_at + interval '1 minute' WHERE deck_id = 701;
SQL
$P -f $D/20261118140100_roles_db6b_copy_win_conditions.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F6-144 the copy''s rollback refuses while a copied item was changed since (nothing removed)', (SELECT count(*) FROM deck_strategy_items WHERE reason = 'Copied from your written win condition.') = 2, '')"
$P -c "UPDATE deck_strategy_items SET updated_at = created_at WHERE deck_id = 701"
f $D/20261118140100_roles_db6b_copy_win_conditions.rollback.sql
$P <<'SQL'
SELECT t.chk('F6-145 the copy''s rollback deletes only the unedited copies (701 and user 2''s); the one the owner edited stays; the old text is still identical',
  NOT EXISTS (SELECT 1 FROM deck_strategy_items WHERE deck_id IN (701, 200)) AND (SELECT statement = 'Edited by me.' FROM deck_strategy_items WHERE deck_id = 704)
  AND (SELECT md5(string_agg(to_jsonb(s)::text, '|' ORDER BY deck_id)) FROM deck_strategy s) = (SELECT v FROM t.keep WHERE k = 'h0'), '');
DELETE FROM deck_strategy_items WHERE deck_id IN (704, 400, 701, 702, 703);
SQL

echo "== Rollback: refuses while rows or log rows exist; later drafts refuse while DB-6 is applied"
$P <<'SQL'
SELECT t.snap() AS s9 \gset
SQL
$P -f $D/20261118140000_roles_db6_deck_strategy.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120400_roles_db5_health_targets.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120300_roles_db4_strategy_points.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120200_roles_db3_deck_card_jobs.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120100_roles_db2_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F6-150 DB-6 cannot be rolled back while item or link log rows exist; DB-5, DB-4, DB-3 and DB-2 cannot be rolled back while DB-6 is applied (nothing was removed)',
  to_regclass('public.deck_strategy_items') IS NOT NULL AND to_regclass('public.deck_job_serves') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NOT NULL
  AND to_regclass('public.deck_health_targets') IS NOT NULL AND to_regclass('public.deck_strategy_points') IS NOT NULL AND to_regclass('public.deck_card_jobs') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL
  AND (SELECT count(*) FROM ai_change_log WHERE kind IN ('strategy_item','job_link')) > 0, '')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('strategy_item','job_link'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
$P -f $D/20261118140000_roles_db6_deck_strategy.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F6-151 with the log cleared but a pending request still waiting or held, DB-6 still cannot be rolled back', to_regclass('public.deck_strategy_items') IS NOT NULL AND (SELECT count(*) FROM ai_pending_changes WHERE action IN ('strategy_item','job_link')) > 0, '')"
$P -c "DELETE FROM ai_pending_changes WHERE action IN ('strategy_item','job_link')"
$P -f $D/20261118140000_roles_db6_deck_strategy.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('F6-152 DB-6 cannot be rolled back while the tables hold rows, even with the log cleared', to_regclass('public.deck_strategy_items') IS NOT NULL AND (SELECT count(*) FROM deck_strategy_items) > 0, '')"
echo "== rollback with the explicit data-loss setting"
$P <<SQL
SET oracle.rollback_allow_data_loss = 'yes';
\i $D/20261118140000_roles_db6_deck_strategy.rollback.sql
SQL
$P <<'SQL'
SELECT t.chk('F6-153 rollback with the override: both tables, all new and renamed functions and the new names in the allow-lists are gone',
  to_regclass('public.deck_strategy_items') IS NULL AND to_regclass('public.deck_job_serves') IS NULL AND to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NULL
  AND to_regprocedure('public.ai_undo_group_pre_strategy(uuid,uuid,text,uuid)') IS NULL AND to_regprocedure('public.owner_save_strategy_item(uuid,integer,bigint,jsonb)') IS NULL
  AND to_regprocedure('public._ai_limits_strategy()') IS NULL AND to_regprocedure('public._job_effective(uuid,integer,uuid)') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE pg_get_constraintdef(oid) LIKE '%strategy_item%' OR pg_get_constraintdef(oid) LIKE '%job_link%')
  AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE '%strategy_item%' OR proname LIKE '%job_link%' OR proname LIKE '%pre_strategy' OR proname LIKE '%strategy_staleness%')), '');
SELECT t.chk('F6-154 rollback restores the DB-5 state EXACTLY: every function (text and grants), constraint, table and trigger fingerprint equals the one taken after DB-5, including the four front doors', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp5'), t.fp());
SELECT t.age();
SELECT t.chk('F6-155 after the rollback an items request is refused again and writes nothing; role, job, point and health requests still work',
  t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"x"}]}')->>'ok' = 'false'
  AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 10', ARRAY['ramp'])))#>>'{res,outcome}' = 'applied'
  AND t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":5,"reason":"x"}]}')#>>'{res,outcome}' = 'applied', '');
SQL
echo "== re-apply, use, and roll back with empty tables (no override needed)"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','health_target'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM user_card_roles; DELETE FROM deck_health_targets"
f $D/20261118140000_roles_db6_deck_strategy.draft.sql
$P <<'SQL'
SELECT t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"Again."}]}') AS r \gset ra_
SELECT t.chk('F6-156 re-apply works, an items request applies, and Claude can undo it', :'ra_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT t.und(t.gid(:'ra_r'::jsonb), 'claude')#>>'{res,success}')::boolean, '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('strategy_item'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $D/20261118140000_roles_db6_deck_strategy.rollback.sql
$P -c "SELECT t.chk('F6-157 rollback with empty tables needs no override and again restores the exact DB-5 state', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp5'), '')"
echo "== and the whole stack rolls back to the state before DB-1"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','strategy_item','job_link'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM ai_pending_changes WHERE action IN ('card_label','strategy_point','health_target')"
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds 20261118120000_roles_db1_card_roles; do
$P <<SQL
SET oracle.rollback_allow_data_loss = 'yes';
\i $D/$d.rollback.sql
SQL
done
$P -c "SELECT t.chk('F6-158 DB-5 to DB-1 rolled back after DB-6: the fingerprint equals the one taken before DB-1 (the live state)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '')"
$P -f $HERE/results.sql
