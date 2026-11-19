# S3 throwaway test (DV-02 slice 1, Strategy window fields). Sourced by run.sh.
# Base = the real live migrations up to CC-15b. Then: S3 alone on that base (apply, rollback); then the live state (DB-1 to DB-5 applied)
# with S3 on top (all checks, rollback, re-apply); then a database whose deck_strategy has a 1-to-4 bracket CHECK (it is put back exactly).
S3=$D/20261119100000_s3_strategy_window_fields
$P <<'SQL'
CREATE FUNCTION t.sd(p_deck int, p_patch jsonb, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', p_user, p_conn, p_deck, p_patch)) $$;
-- Column list of deck_strategy (the fingerprint t.fp() covers functions, constraints, tables and triggers, not columns).
CREATE FUNCTION t.cols() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_strategy' $$;
CREATE FUNCTION t.st(p_deck int) RETURNS deck_strategy LANGUAGE sql AS $$ SELECT * FROM deck_strategy WHERE deck_id = p_deck $$;
INSERT INTO t.keep VALUES ('fp0', t.fp()), ('cols0', t.cols());
SQL
echo "== S3 on the bare base (no CC-26 drafts): apply and roll back"
f $S3.draft.sql
$P -c "SELECT t.chk('S-00 S3 applies on the cc15b base without DB-1 to DB-5', t.cols() LIKE '%summary:text:YES%' AND t.cols() LIKE '%updated_by:text:YES%', t.cols())"
f $S3.rollback.sql
$P -c "SELECT t.chk('S-00a and its rollback restores that base exactly (functions, grants, constraints, columns)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0'), '')"
echo "== the live state: DB-1 to DB-5 applied"
for d in 20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets; do f $D/$d.draft.sql; done
$P -c "INSERT INTO t.keep VALUES ('fpL', t.fp())"
echo "== before S3 (what the app must live with until the owner applies it)"
$P <<'SQL'
SELECT t.chk('S-01 before S3: bracket 5 from Claude is refused (bad_bracket); a summary key alone is "nothing to set"; the window''s old fields still save',
  t.sd(100, '{"bracket":5}')->>'err' = 'bad_bracket' AND t.sd(100, '{"summary":"x"}')->>'err' = 'nothing_to_set'
  AND t.try($q$INSERT INTO deck_strategy (deck_id, user_id, bracket, strategy_notes, table_context, updated_at) VALUES (100, t.u1(), 3, 'x', 'y', now())$q$) = 'ok', '');
INSERT INTO deck_strategy (deck_id, user_id, bracket, strategy_notes, table_context, updated_at) VALUES (100, t.u1(), 3, 'x', 'y', now());
SQL
echo "== apply S3 on the live state"
f $S3.draft.sql
$P -f $S3.draft.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('S-02 running S3 a second time is refused and changes nothing', (SELECT count(*) FROM information_schema.columns WHERE table_name = 'deck_strategy' AND column_name = 'summary') = 1, '')"
$P <<'SQL'
SELECT t.chk('S-03 the two new columns are nullable text and no existing column changed',
  regexp_replace(regexp_replace(t.cols(), 'summary:text:YES,', ''), ',updated_by:text:YES', '') = (SELECT v FROM t.keep WHERE k = 'cols0')
  AND t.cols() LIKE '%summary:text:YES%' AND t.cols() LIKE '%updated_by:text:YES%', t.cols());
SELECT t.chk('S-03a ai_set_deck_setup can be run by the service role only (not anon, not signed-in users)',
  has_function_privilege('service_role', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE'), '');
SELECT t.chk('S-04 summary: 120 characters ok; 121, a line break, an empty string are refused by the table',
  t.try(format($q$UPDATE deck_strategy SET summary = %L WHERE deck_id = 100$q$, repeat('s', 120))) = 'ok'
  AND t.try(format($q$UPDATE deck_strategy SET summary = %L WHERE deck_id = 100$q$, repeat('s', 121))) LIKE '%deck_strategy_summary_one_line%'
  AND t.try($q$UPDATE deck_strategy SET summary = E'a\nb' WHERE deck_id = 100$q$) LIKE '%deck_strategy_summary_one_line%'
  AND t.try($q$UPDATE deck_strategy SET summary = '' WHERE deck_id = 100$q$) LIKE '%deck_strategy_summary_one_line%', '');
SELECT t.chk('S-05 bracket 1 to 5 and empty are allowed by the table; 0 and 6 are not; updated_by only owner or claude',
  t.try($q$UPDATE deck_strategy SET bracket = 5 WHERE deck_id = 100$q$) = 'ok' AND t.try($q$UPDATE deck_strategy SET bracket = NULL WHERE deck_id = 100$q$) = 'ok'
  AND t.try($q$UPDATE deck_strategy SET bracket = 6 WHERE deck_id = 100$q$) LIKE '%deck_strategy_bracket_1_to_5%'
  AND t.try($q$UPDATE deck_strategy SET bracket = 0 WHERE deck_id = 100$q$) LIKE '%deck_strategy_bracket_1_to_5%'
  AND t.try($q$UPDATE deck_strategy SET updated_by = 'owner' WHERE deck_id = 100$q$) = 'ok'
  AND t.try($q$UPDATE deck_strategy SET updated_by = 'someone' WHERE deck_id = 100$q$) LIKE '%deck_strategy_updated_by_who%', '');
SELECT t.chk('S-06 the row saved before S3 is unchanged by applying it (bracket 3, notes, table context; summary and updated_by empty)',
  (SELECT bracket = 3 AND strategy_notes = 'x' AND table_context = 'y' AND summary IS NULL AND updated_by IS NULL FROM deck_strategy WHERE deck_id = 100), '');
-- The owner's window save, as the app does it (only the window's fields, updated_by owner).
UPDATE deck_strategy SET budget_mode = 'budget', budget_ceiling = 150, win_condition = 'Combo', frustration = 'stax', strategy_notes = E'Yedora plants lands.\n\nNever cut Scute Swarm.\n', summary = 'Lands and recursion', updated_by = 'owner' WHERE deck_id = 100;
SQL
echo "== Claude writes through ai_set_deck_setup"
$P <<'SQL'
SELECT t.sd(100, '{"bracket":5,"summary":"Landfall value with a graveyard engine","playgroup":"Friday pod, casual"}') AS r \gset a_
SELECT t.chk('S-10 bracket 5, summary and playgroup set in one change: applied, one log row with only those keys, marked changed by Claude',
  :'a_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT bracket = 5 AND summary = 'Landfall value with a graveyard engine' AND table_context = 'Friday pod, casual' AND updated_by = 'claude' FROM deck_strategy WHERE deck_id = 100)
  AND (SELECT before = '{"bracket": 3, "summary": "Lands and recursion", "playgroup": "y"}'::jsonb AND after = '{"bracket": 5, "summary": "Landfall value with a graveyard engine", "playgroup": "Friday pod, casual"}'::jsonb
       FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb)), :'a_r');
SELECT t.chk('S-11 budget, win condition and frustration are untouched (parked fields)',
  (SELECT budget_mode = 'budget' AND budget_ceiling = 150 AND win_condition = 'Combo' AND frustration = 'stax' FROM deck_strategy WHERE deck_id = 100), '');
SELECT t.chk('S-12 refusals write nothing: bracket 6, 0, "3"; summary 121 / with a line break / a number; playgroup 501 / a number',
  t.sd(100, '{"bracket":6}')->>'err' = 'bad_bracket' AND t.sd(100, '{"bracket":0}')->>'err' = 'bad_bracket' AND t.sd(100, '{"bracket":"3"}')->>'err' = 'bad_bracket'
  AND t.sd(100, jsonb_build_object('summary', repeat('s', 121)))->>'err' = 'bad_summary' AND t.sd(100, jsonb_build_object('summary', E'a\nb'))->>'err' = 'bad_summary'
  AND t.sd(100, '{"summary":12}')->>'err' = 'bad_summary'
  AND t.sd(100, jsonb_build_object('playgroup', repeat('p', 501)))->>'err' = 'bad_playgroup' AND t.sd(100, '{"playgroup":5}')->>'err' = 'bad_playgroup'
  AND (SELECT bracket = 5 FROM deck_strategy WHERE deck_id = 100) AND (SELECT count(*) FROM ai_change_log WHERE kind = 'deck_setup') = 1, '');
SELECT t.chk('S-14 checked in a separate statement: after the refusals the row still holds bracket 5 and the Claude summary, and only one change is logged',
  (SELECT bracket = 5 AND summary = 'Landfall value with a graveyard engine' FROM deck_strategy WHERE deck_id = 100) AND (SELECT count(*) FROM ai_change_log WHERE kind = 'deck_setup') = 1, '');
SELECT t.chk('S-13 the same summary again is no_change with no log row', t.sd(100, '{"summary":"Landfall value with a graveyard engine"}')#>>'{res,outcome}' = 'no_change' AND (SELECT count(*) FROM ai_change_log WHERE kind = 'deck_setup') = 1, '');
SQL
echo "== Claude only adds to the owner's Strategy text"
$P <<'SQL'
SELECT strategy_notes AS mine FROM deck_strategy WHERE deck_id = 100 \gset
SELECT t.sd(100, jsonb_build_object('strategy_notes', E'Yedora plants lands.\n\nNever cut Scute Swarm.\n\nClaude, 19 Nov 2026: Add a sacrifice outlet.', 'strategy_notes_base', :'mine')) AS r \gset n_
SELECT t.chk('S-20 an addition after the owner''s words (trailing blank line aside) is applied; the owner''s words are still the start of the text',
  :'n_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT left(strategy_notes, length(E'Yedora plants lands.\n\nNever cut Scute Swarm.')) = E'Yedora plants lands.\n\nNever cut Scute Swarm.' AND strategy_notes LIKE '%Claude, 19 Nov 2026: Add a sacrifice outlet.' AND updated_by = 'claude' FROM deck_strategy WHERE deck_id = 100), :'n_r');
SELECT strategy_notes AS now_text FROM deck_strategy WHERE deck_id = 100 \gset
SELECT t.chk('S-21 replacing or editing the owner''s text is refused and nothing changes: a new text, the start cut, the old text edited, clearing it, the same text',
  t.sd(100, '{"strategy_notes":"Totally new strategy."}')->>'err' = 'notes_replace_refused'
  AND t.sd(100, jsonb_build_object('strategy_notes', substr(:'now_text', 5) || ' more'))->>'err' = 'notes_replace_refused'
  AND t.sd(100, jsonb_build_object('strategy_notes', replace(:'now_text', 'Scute Swarm', 'Sol Ring') || ' more'))->>'err' = 'notes_replace_refused'
  AND t.sd(100, '{"strategy_notes":null}')->>'err' = 'notes_replace_refused' AND t.sd(100, '{"strategy_notes":""}')->>'err' = 'notes_replace_refused'
  AND t.sd(100, jsonb_build_object('strategy_notes', :'now_text'))->>'err' = 'notes_replace_refused'
  AND (SELECT strategy_notes = :'now_text' FROM deck_strategy WHERE deck_id = 100), '');
SELECT t.chk('S-22 the owner changed the text after Claude read it: refused as notes_changed, nothing changes',
  t.sd(100, jsonb_build_object('strategy_notes', :'now_text' || E'\n\nClaude: late.', 'strategy_notes_base', 'what Claude read earlier'))->>'err' = 'notes_changed'
  AND (SELECT strategy_notes = :'now_text' FROM deck_strategy WHERE deck_id = 100), '');
SELECT t.mkdeck(300, t.u1(), 1, 'S', 900);
SELECT t.sd(300, '{"strategy_notes":"Claude, 19 Nov 2026: First words.","strategy_notes_base":null}') AS r \gset f_
SELECT t.chk('S-23 a deck with no Strategy yet: Claude''s first paragraph is accepted (deck 300 has no strategy row; one is made, marked Claude)',
  :'f_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT strategy_notes = 'Claude, 19 Nov 2026: First words.' AND updated_by = 'claude' AND summary IS NULL AND bracket IS NULL FROM deck_strategy WHERE deck_id = 300), :'f_r');
SELECT t.chk('S-25 checked in a separate statement: after every refusal above the Strategy text is still exactly what it was, and only the two applied changes are logged',
  (SELECT strategy_notes = :'now_text' FROM deck_strategy WHERE deck_id = 100) AND (SELECT count(*) FROM ai_change_log WHERE kind = 'deck_setup' AND deck_id = 100) = 2, '');
SELECT t.chk('S-24 over 4000 characters in total is refused (notes_too_long)',
  t.sd(100, jsonb_build_object('strategy_notes', :'now_text' || repeat('z', 4001 - length(:'now_text'))))->>'err' = 'notes_too_long', '');
SQL
echo "== Undo, blocker, isolation, old kinds"
$P <<'SQL'
SELECT group_id AS g_strat FROM ai_change_log WHERE kind = 'deck_setup' AND deck_id = 100 AND after ? 'strategy_notes' \gset
SELECT group_id AS g_sum FROM ai_change_log WHERE kind = 'deck_setup' AND deck_id = 100 AND after ? 'summary' \gset
SELECT t.chk('S-30 Recent changes shows the summary change with no Undo blocker while nothing changed by hand',
  (SELECT e->'undo_blocker' = 'null'::jsonb FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = :'g_sum' LIMIT 1), '');
UPDATE deck_strategy SET summary = 'Owner rewrote it', updated_by = 'owner' WHERE deck_id = 100;
SELECT t.chk('S-31 after the owner edits the summary by hand: the blocker says changed_since and Undo refuses; nothing changes',
  (SELECT e->'undo_blocker'->>'code' = 'changed_since' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = :'g_sum' LIMIT 1)
  AND t.und(:'g_sum'::uuid, 'owner')#>>'{res,refused,code}' = 'changed_since' AND (SELECT summary = 'Owner rewrote it' FROM deck_strategy WHERE deck_id = 100), '');
SELECT t.und(:'g_strat'::uuid, 'owner') AS r \gset u1_
SELECT t.chk('S-32 Undo of the Strategy addition (owner) puts the owner''s exact words back and marks it changed by you',
  (:'u1_r'::jsonb#>>'{res,success}')::boolean
  AND (SELECT strategy_notes = E'Yedora plants lands.\n\nNever cut Scute Swarm.\n' AND updated_by = 'owner' FROM deck_strategy WHERE deck_id = 100), :'u1_r');
UPDATE deck_strategy SET summary = 'Landfall value with a graveyard engine' WHERE deck_id = 100;
SELECT t.und(:'g_sum'::uuid, 'claude') AS r \gset u2_
SELECT t.chk('S-33 with the summary back as Claude left it, Claude undoes its bracket/summary/playgroup change: all three back, budget untouched',
  (:'u2_r'::jsonb#>>'{res,success}')::boolean
  AND (SELECT bracket = 3 AND summary = 'Lands and recursion' AND table_context = 'y' AND updated_by = 'claude' AND budget_ceiling = 150 AND win_condition = 'Combo' FROM deck_strategy WHERE deck_id = 100), :'u2_r');
SELECT t.chk('S-34 another owner''s deck: deck_not_found and nothing changes; a switched-off connection is refused',
  t.sd(200, '{"summary":"mine now"}')->>'err' = 'deck_not_found' AND t.sd(100, '{"summary":"x"}', t.u1(), t.c1_off())->>'err' = 'connection_revoked'
  AND NOT EXISTS (SELECT 1 FROM deck_strategy WHERE deck_id = 200), '');
SELECT t.chk('S-35 the old change kinds still work through the front doors with S3 in place (add a card, Claude undoes it)',
  (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SELECT t.chk('S-36 a CC-26 kind still works with S3 in place (health target set and undone)',
  (SELECT t.und(t.gid(t.sub('health_target', '{"deck_id":100,"targets":[{"group":"ramp","target":4,"reason":"S3 test"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SQL
echo "== rollback rules"
$P -f $S3.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('S-40 rollback refuses while Claude summary/playgroup changes are in the history; nothing is dropped', t.cols() LIKE '%summary%', '')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('deck_setup','health_target'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
$P -f $S3.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('S-41 rollback refuses while a deck has a saved summary (test removed the history rows first, test only)', t.cols() LIKE '%summary%', '')"
$P -c "UPDATE deck_strategy SET summary = NULL; UPDATE deck_strategy SET bracket = 5 WHERE deck_id = 100"
$P -f $S3.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('S-42 rollback refuses while a deck has bracket 5', t.cols() LIKE '%summary%', '')"
$P -c "UPDATE deck_strategy SET bracket = 4 WHERE deck_id = 100"
f $S3.rollback.sql
$P <<'SQL'
SELECT t.chk('S-43 rollback: functions, grants, constraints and tables equal the live state before S3; the two columns are gone',
  t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0'), t.fp());
SELECT t.chk('S-44 rollback keeps the data that existed before S3 (bracket, notes, playgroup, budget, win condition)',
  (SELECT bracket = 4 AND table_context = 'y' AND budget_ceiling = 150 AND win_condition = 'Combo' AND strategy_notes LIKE 'Yedora plants lands.%' FROM deck_strategy WHERE deck_id = 100), '');
SELECT t.chk('S-45 after rollback the cc15b behaviour is back: bracket 5 refused, notes replaced as before',
  t.sd(100, '{"bracket":5}')->>'err' = 'bad_bracket' AND t.sd(100, '{"strategy_notes":"Replaced."}')#>>'{res,outcome}' = 'applied', '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'deck_setup'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $S3.draft.sql
$P -c "SELECT t.chk('S-46 re-apply after rollback works (bracket 5 and a summary from Claude)', t.sd(100, '{\"bracket\":5,\"summary\":\"Again\"}')#>>'{res,outcome}' = 'applied', '')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'deck_setup'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; UPDATE deck_strategy SET summary = NULL, bracket = NULL"
f $S3.rollback.sql
$P -c "SELECT t.chk('S-47 second rollback again restores the live state exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0'), '')"
echo "== a live table that already has a 1-to-4 bracket CHECK (not seen in the files; the live table may have one)"
$P -c "ALTER TABLE deck_strategy ADD CONSTRAINT deck_strategy_bracket_check CHECK (bracket >= 1 AND bracket <= 4); INSERT INTO t.keep VALUES ('fpC', t.fp())"
f $S3.draft.sql
$P <<'SQL'
SELECT t.chk('S-50 S3 replaces the 1-to-4 check: bracket 5 is now allowed, and the old definition is kept in the new constraint''s comment',
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deck_strategy_bracket_check')
  AND t.try($q$UPDATE deck_strategy SET bracket = 5 WHERE deck_id = 100$q$) = 'ok'
  AND (SELECT obj_description(oid, 'pg_constraint') LIKE '%deck_strategy_bracket_check%bracket >= 1%' FROM pg_constraint WHERE conname = 'deck_strategy_bracket_1_to_5'), '');
SQL
f $S3.rollback.sql
$P -c "SELECT t.chk('S-51 rollback puts the exact 1-to-4 check back (fingerprint equal to before S3)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fpC') AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deck_strategy_bracket_check'), '')"
$P -c "ALTER TABLE deck_strategy DROP CONSTRAINT deck_strategy_bracket_check"
echo "== then the CC-26 drafts still roll back in reverse (DB-5 to DB-1) after S3 came and went"
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds 20261118120000_roles_db1_card_roles; do f $D/$d.rollback.sql; done
$P -c "SELECT t.chk('S-60 after DB-5 to DB-1 roll back, the database equals the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0'), '')"
$P -f $HERE/results.sql
