# All six together, in the order the owner would apply them, then the other legal order (DB-4 before DB-3), and every rollback order.
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
echo "== apply 1, 2, 3, 4, 5, 6"
for d in 20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets 20261118140000_roles_db6_deck_strategy; do f $D/$d.draft.sql; done
$P <<'SQL'
SELECT t.mkdeck(300, t.u1(), 30, 'Big', 1000);
SELECT t.chk('C-01 all six applied: every new table has row security (not forced)', (SELECT count(*) FROM pg_class WHERE relname IN ('ref_card_roles','user_card_roles','deck_card_jobs','deck_strategy_points','deck_health_targets','deck_strategy_items','deck_job_serves') AND relrowsecurity AND NOT relforcerowsecurity) = 7, '');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['ramp'], NULL, '{"name":"Engine","reason":"Ramp"}'), t.cd(100,'Card 2', ARRAY['card_draw']))) AS r \gset a_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"Rocks count as ramp","covers":{"card_type":"artifact"},"effect":{"kind":"counts_as","group":"ramp"}}]}') AS r \gset b_
SELECT t.chk('C-02 a role+job request and a strategy point request both apply, in separate groups, one log row per card / point', :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'b_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb)) = 2 AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'b_r'::jsonb)) = 1, '');
SELECT t.chk('C-03 Recent changes lists both kinds with their sentence data', (SELECT count(*) = 3 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'kind' IN ('card_label','strategy_point') AND e->'label_detail' <> 'null'::jsonb), '');
SELECT t.und(t.gid(:'a_r'::jsonb), 'claude') AS r \gset ua_
SELECT t.und(t.gid(:'b_r'::jsonb), 'claude') AS r \gset ub_
SELECT t.chk('C-04 Claude undoes each batch in one go; every row it wrote is gone', (:'ua_r'::jsonb#>>'{res,success}')::boolean AND (:'ub_r'::jsonb#>>'{res,success}')::boolean AND (SELECT count(*) FROM user_card_roles) = 0 AND (SELECT count(*) FROM deck_card_jobs) = 0 AND (SELECT count(*) FROM deck_strategy_points) = 0, '');
SELECT t.chk('C-05 old kinds still work with everything in place (add + Claude undo)', (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SELECT t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":4,"reason":"Chain test"},{"group":"lands","target":35,"reason":"Chain test"}]}') AS r \gset hc_
SELECT t.und(t.gid(:'hc_r'::jsonb), 'claude') AS r \gset hu_
SELECT t.chk('C-06 all five applied: a health target request applies, is one batch with one log row per group, and Claude undoes it in one go (the table is empty again)', :'hc_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'hu_r'::jsonb#>>'{res,success}')::boolean AND NOT EXISTS (SELECT 1 FROM deck_health_targets) AND (SELECT count(*) FROM ai_change_log WHERE kind = 'health_target' AND undone_by = 'claude') = 2, :'hc_r');
SELECT t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"Chain test aim."},{"kind":"win_condition","statement":"Chain test win."}]}') AS r \gset ic_
SELECT t.und(t.gid(:'ic_r'::jsonb), 'claude') AS r \gset iu_
SELECT t.chk('C-07 all six applied: an items request applies as one batch and Claude undoes it in one go (the table is empty again)', :'ic_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'iu_r'::jsonb#>>'{res,success}')::boolean AND NOT EXISTS (SELECT 1 FROM deck_strategy_items) AND (SELECT count(*) FROM ai_change_log WHERE kind = 'strategy_item' AND undone_by = 'claude') = 2, :'ic_r');
SQL
echo "== rollbacks out of order must refuse"
$P -f $D/20261118120000_roles_db1_card_roles.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120100_roles_db2_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120200_roles_db3_deck_card_jobs.rollback.sql 2>&1 | grep -E "ERROR"
$P -f $D/20261118120400_roles_db5_health_targets.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('C-10 DB-1, DB-2, DB-3 and DB-5 cannot be rolled back while DB-6 (or any later change) is applied', to_regclass('public.user_card_roles') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL AND to_regclass('public.deck_card_jobs') IS NOT NULL AND to_regclass('public.deck_health_targets') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_strategy(uuid,text,jsonb)') IS NOT NULL, '')"
echo "== roll back 6, 5, 4, 3, 2, 1 (tables empty after the Undo; the log rows of the new kinds are cleared by hand first, test only)"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','strategy_item','job_link'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
for d in 20261118140000_roles_db6_deck_strategy 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds 20261118120000_roles_db1_card_roles; do f $D/$d.rollback.sql; done
$P <<'SQL'
SELECT t.chk('C-11 all six rolled back in reverse: the database fingerprint equals the one taken before DB-1 (every function, grant, constraint, table, trigger)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'));
SELECT t.chk('C-12 none of the new tables or functions is left', to_regclass('public.deck_health_targets') IS NULL AND to_regclass('public.ref_card_roles') IS NULL AND to_regclass('public.user_card_roles') IS NULL AND to_regclass('public.deck_card_jobs') IS NULL AND to_regclass('public.deck_strategy_points') IS NULL AND to_regclass('public.deck_strategy_items') IS NULL AND to_regclass('public.deck_job_serves') IS NULL
  AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND (proname LIKE '%card_label%' OR proname LIKE '%strategy_point%' OR proname LIKE '%health_target%' OR proname LIKE '%strategy_item%' OR proname LIKE '%job_link%' OR proname LIKE '%_pre_strategy' OR proname LIKE '%_pre_roles' OR proname LIKE '%job%' OR proname LIKE '%roles%' OR proname LIKE '_slot_oracle_id' OR proname = 'deck_slot_oracle_ids')), '');
SELECT t.chk('C-13 the old connector works after the full rollback (add and Claude undo; old kinds only)', (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Mana Crypt","scryfall_id":"s9","set_code":"cmm","oracle_id":"o9","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SQL
echo "== the other legal order: 1, 2, 4, 3, 5, 6"
for d in 20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120400_roles_db5_health_targets 20261118140000_roles_db6_deck_strategy; do f $D/$d.draft.sql; done
$P <<'SQL'
SELECT t.age();
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['ramp'], NULL, '{"name":"Payoff"}'))) AS r \gset a_
SELECT t.sub('strategy_point', '{"deck_id":100,"points":[{"statement":"Order test","covers":{"card_type":"artifact"}}]}') AS r \gset b_
SELECT t.chk('C-20 applied as 1, 2, 4, 3: role+job and strategy point requests both work', :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'b_r'::jsonb#>>'{res,outcome}' = 'applied', '');
SELECT t.chk('C-23 applied as 1, 2, 4, 3, 5: a health target request works too', t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":4,"reason":"Order test"}]}')#>>'{res,outcome}' = 'applied', '');
SELECT t.chk('C-24 applied as 1, 2, 4, 3, 5, 6: an items request works too', t.sub('strategy_item', '{"deck_id":100,"items":[{"kind":"aim","statement":"Order test aim."}]}')#>>'{res,outcome}' = 'applied', '');
SELECT t.und(t.gid(:'a_r'::jsonb), 'claude');
SELECT t.und(t.gid(:'b_r'::jsonb), 'claude');
DELETE FROM deck_health_targets;
DELETE FROM deck_strategy_items;
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','strategy_item','job_link'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
echo "== roll back 6, 5, 3, 4, 2, 1"
for d in 20261118140000_roles_db6_deck_strategy 20261118120400_roles_db5_health_targets 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120100_roles_db2_change_kinds 20261118120000_roles_db1_card_roles; do f $D/$d.rollback.sql; done
$P -c "SELECT t.chk('C-21 rolled back as 6, 5, 3, 4, 2, 1: the fingerprint again equals the one before DB-1', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '')"
echo "== and all six can be applied again after a full rollback"
for d in 20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets 20261118140000_roles_db6_deck_strategy; do f $D/$d.draft.sql; done
$P <<'SQL'
SELECT t.chk('C-22 re-applied after a full rollback: a role+job request applies', t.sub('card_label', t.lbl(100, t.cd(100,'Card 4', ARRAY['ramp'], NULL, '{"name":"Flex"}')))#>>'{res,outcome}' = 'applied', '');
SQL
echo "== the why-here draft (20261120110000) on top of all six: applied last, rolled back first, then everything applied again"
$P -c "INSERT INTO t.keep VALUES ('fp6', t.fp())"
f $D/20261120110000_why_here_deck_cards.draft.sql
$P <<'SQL'
SELECT t.chk('C-30 why-here applied last on top of all six: a why saves, 201 characters is refused, and a role+job request still applies', t.try($q$UPDATE deck_cards SET why_here = repeat('a', 200) WHERE id = (SELECT min(id) FROM deck_cards)$q$) = 'ok'
  AND t.try($q$UPDATE deck_cards SET why_here = repeat('a', 201) WHERE id = (SELECT min(id) FROM deck_cards)$q$) LIKE '%deck_cards_why_here_max_200%'
  AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 5', ARRAY['ramp'], NULL, '{"name":"Last"}')))#>>'{res,outcome}' = 'applied', '');
SQL
echo "== why-here rolled back first (DB-6 to DB-1 stay applied); then DB-1 to DB-6 cannot be rolled back before it"
$P -f $D/20261120110000_why_here_deck_cards.rollback.sql
$P -c "SELECT t.chk('C-31 why-here rolled back first: the column is gone and the database equals the state with all six applied, exactly', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deck_cards' AND column_name = 'why_here') AND t.fp() = (SELECT v FROM t.keep WHERE k = 'fp6'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp6'))"
echo "== every draft applied again after that: all six, then why-here"
f $D/20261120110000_why_here_deck_cards.draft.sql
$P -c "SELECT t.chk('C-32 why-here applies again after a rollback, with all six in place', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deck_cards' AND column_name = 'why_here'), '')"
$P -f $HERE/results.sql
