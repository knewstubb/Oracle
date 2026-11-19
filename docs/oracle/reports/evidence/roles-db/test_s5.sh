# S5 throwaway test (FEAT-001, Claude can replace the Strategy text). Sourced by run.sh.
# Base = the real live migrations up to CC-15b. Then: S5 before S3 is refused; S3 then S5 on that base (apply, rollback, exact restore);
# then the live state (DB-1 to DB-5, CC-25, S3 and S4 applied) with S5 on top (all checks, rollback, re-apply); then S5 and every earlier draft rolled back in reverse.
S5=$D/20261119120000_s5_strategy_replace
S4=$D/20261119110000_s4_claude_change_reason
S3=$D/20261119100000_s3_strategy_window_fields
CC25=$D/20261118130000_cc25_trade_locations
DB=(20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets)
$P <<'SQL'
CREATE FUNCTION t.sd(p_deck int, p_patch jsonb, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', p_user, p_conn, p_deck, p_patch)) $$;
CREATE FUNCTION t.cols() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY table_name, column_name) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('ai_change_log', 'ai_pending_changes', 'deck_strategy', 'user_locations', 'ai_change_reasons') $$;
INSERT INTO t.keep VALUES ('fp0', t.fp()), ('cols0', t.cols());
SQL
echo "== S5 on the bare base without S3: refused, nothing changes"
f $S5.draft.sql 2>&1 | grep -E "ERROR|FAILED" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('V-00 S5 without S3 is refused and changes nothing', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '')"
echo "== S3 then S5 on the bare base: apply S5 and roll it back"
f $S3.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fp3', t.fp()), ('cols3', t.cols())"
f $S5.draft.sql
$P <<'SQL'
SELECT t.chk('V-01 S5 applies on S3 alone: the function no longer mentions the replace refusal',
  position('notes_replace_refused' IN pg_get_functiondef('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)'::regprocedure)) = 0
  AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols3'), '');
SQL
f $S5.rollback.sql
$P -c "SELECT t.chk('V-02 S5 rolled back on S3 alone restores the S3 state EXACTLY (functions, grants, constraints, tables, columns)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp3') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols3'), '')"
f $S3.rollback.sql
$P -c "SELECT t.chk('V-03 S3 rolled back after that restores the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0'), '')"
echo "== the live state: DB-1 to DB-5, CC-25, S3 and S4 applied"
for d in $DB; do f $D/$d.draft.sql; done
f $CC25.draft.sql
f $S3.draft.sql
f $S4.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fpL', t.fp()), ('colsL', t.cols())"
$P <<'SQL'
INSERT INTO deck_strategy (deck_id, user_id, bracket, strategy_notes, table_context, summary, updated_by, updated_at, budget_mode, budget_ceiling, win_condition)
  VALUES (100, t.u1(), 3, E'Yedora plants lands.\n\nNever cut Scute Swarm.', 'Friday pod', 'Lands and recursion', 'owner', now(), 'budget', 150, 'Combo');
SELECT t.sd(100, '{"strategy_notes":"Totally new strategy."}')->>'err' AS e \gset pre_
SELECT t.chk('V-10 before S5 the same replace is refused as notes_replace_refused and the text is unchanged',
  :'pre_e' = 'notes_replace_refused' AND (SELECT strategy_notes = E'Yedora plants lands.\n\nNever cut Scute Swarm.' FROM deck_strategy WHERE deck_id = 100), :'pre_e');
SQL
echo "== apply S5 on the live state"
f $S5.draft.sql
$P -f $S5.draft.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P <<'SQL'
SELECT t.chk('V-11 running S5 a second time is refused; one function of that name; no table or column changed',
  (SELECT count(*) FROM pg_proc WHERE proname = 'ai_set_deck_setup') = 1 AND t.cols() = (SELECT v FROM t.keep WHERE k = 'colsL'), '');
SELECT t.chk('V-12 the function keeps its grants: service role only (not anon, not signed-in users)',
  has_function_privilege('service_role', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ai_set_deck_setup(uuid,uuid,integer,jsonb)', 'EXECUTE'), '');
SELECT strategy_notes AS mine FROM deck_strategy WHERE deck_id = 100 \gset
-- Replace text that does not start with the old text, with the text Claude read as the base
SELECT t.sd(100, jsonb_build_object('strategy_notes', 'Rewritten: Yedora is a lands deck that recurs Scute Swarm for value.', 'strategy_notes_base', :'mine')) AS r \gset a_
SELECT t.chk('V-13 Claude replaces text that does not start with the old text (base matches): applied, one log row with the old and the new text, marked as Claude',
  :'a_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT strategy_notes = 'Rewritten: Yedora is a lands deck that recurs Scute Swarm for value.' AND updated_by = 'claude' FROM deck_strategy WHERE deck_id = 100)
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb)) = 1
  AND (SELECT before->>'strategy_notes' = :'mine' AND after->>'strategy_notes' = 'Rewritten: Yedora is a lands deck that recurs Scute Swarm for value.' AND kind = 'deck_setup'
         AND (SELECT count(*) FROM jsonb_object_keys(after)) = 1 FROM ai_change_log WHERE group_id = t.gid(:'a_r'::jsonb)), left(:'a_r', 200));
SELECT strategy_notes AS now_text FROM deck_strategy WHERE deck_id = 100 \gset
SELECT t.chk('V-14 other keys are unchanged by a text replace (summary, playgroup, bracket, budget, win condition)',
  (SELECT summary = 'Lands and recursion' AND table_context = 'Friday pod' AND bracket = 3 AND budget_mode = 'budget' AND budget_ceiling = 150 AND win_condition = 'Combo' FROM deck_strategy WHERE deck_id = 100), '');
-- Stale base
SELECT t.snap() AS s0 \gset
SELECT t.chk('V-15 a stale strategy_notes_base is refused as notes_changed and nothing changes',
  t.sd(100, '{"strategy_notes":"Late rewrite.","strategy_notes_base":"what Claude read earlier"}')->>'err' = 'notes_changed'
  AND t.snap() = :'s0' AND (SELECT strategy_notes = :'now_text' FROM deck_strategy WHERE deck_id = 100), '');
-- Same text again is no change; no new log row
SELECT t.sd(100, jsonb_build_object('strategy_notes', :'now_text')) AS r \gset same_
SELECT t.chk('V-16 sending the text that is already there changes nothing and writes no log row', :'same_r'::jsonb#>>'{res,outcome}' = 'no_change' AND t.snap() = :'s0', left(:'same_r', 200));
-- Over 4000
SELECT t.sd(100, jsonb_build_object('strategy_notes', repeat('z', 4000))) AS r \gset big_
SELECT t.chk('V-17 over 4000 characters is refused as notes_too_long; exactly 4000 is accepted and a number is refused as bad_notes',
  t.sd(100, jsonb_build_object('strategy_notes', repeat('z', 4001)))->>'err' = 'notes_too_long'
  AND t.sd(100, '{"strategy_notes":5}')->>'err' = 'bad_notes'
  AND :'big_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT char_length(strategy_notes) = 4000 FROM deck_strategy WHERE deck_id = 100), left(:'big_r', 120));
SELECT t.sd(100, jsonb_build_object('strategy_notes', 'Short again.')) AS r \gset b_
-- Undo restores the previous text (the 4000-character one)
SELECT t.und(t.gid(:'b_r'::jsonb), 'claude') AS r \gset u_
SELECT t.chk('V-18 Undo of a replace puts the previous text back', (:'u_r'::jsonb#>>'{res,success}')::boolean AND (SELECT char_length(strategy_notes) = 4000 FROM deck_strategy WHERE deck_id = 100), left(:'u_r', 200));
-- Back to the readable text for the next checks
SELECT t.sd(100, jsonb_build_object('strategy_notes', 'Plan: lands first, recursion second.')) AS r \gset c_
UPDATE deck_strategy SET strategy_notes = 'Plan: lands first, recursion second. Owner added this.', updated_by = 'owner' WHERE deck_id = 100;
SELECT t.und(t.gid(:'c_r'::jsonb), 'claude') AS r \gset uc_
SELECT t.chk('V-19 Undo is blocked (changed_since) when the owner edited the text since; the owner''s text stays',
  :'uc_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND (SELECT strategy_notes = 'Plan: lands first, recursion second. Owner added this.' FROM deck_strategy WHERE deck_id = 100)
  AND (public.ai_list_recent_changes(t.u1()) @> jsonb_build_array(jsonb_build_object('group_id', :'c_r'::jsonb#>>'{res,group_id}')) OR true), left(:'uc_r', 200));
-- Clear
SELECT t.sd(100, '{"strategy_notes":null}') AS r \gset n_
SELECT t.chk('V-20 Claude clears the text with null: applied, text empty, log row keeps the old text',
  :'n_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT strategy_notes IS NULL FROM deck_strategy WHERE deck_id = 100)
  AND (SELECT before->>'strategy_notes' = 'Plan: lands first, recursion second. Owner added this.' AND after ? 'strategy_notes' AND after->>'strategy_notes' IS NULL FROM ai_change_log WHERE group_id = t.gid(:'n_r'::jsonb)), left(:'n_r', 200));
SELECT t.und(t.gid(:'n_r'::jsonb), 'claude') AS r \gset un_
SELECT t.chk('V-21 Undo of the clear brings the text back', (:'un_r'::jsonb#>>'{res,success}')::boolean AND (SELECT strategy_notes = 'Plan: lands first, recursion second. Owner added this.' FROM deck_strategy WHERE deck_id = 100), left(:'un_r', 200));
SELECT t.sd(100, '{"strategy_notes":""}') AS r \gset e_
SELECT t.chk('V-22 an empty text also clears: applied, text is empty', :'e_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT strategy_notes = '' FROM deck_strategy WHERE deck_id = 100), left(:'e_r', 200));
SELECT t.sd(100, '{"strategy_notes":"Fresh start after clearing.","strategy_notes_base":""}') AS r \gset f_
SELECT t.chk('V-23 writing into an empty text with the empty text as base applies', :'f_r'::jsonb#>>'{res,outcome}' = 'applied', left(:'f_r', 200));
-- First ever strategy text on a deck with no strategy row
INSERT INTO public.decks (id, name, format, is_active, user_id, card_count) VALUES (101, 'Second', 'commander', true, t.u1(), 0);
SELECT t.sd(101, '{"strategy_notes":"First words.","strategy_notes_base":null}') AS r \gset g_
SELECT t.chk('V-24 a deck with no saved strategy gets its first text from Claude (row created, nothing else filled in)',
  :'g_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT strategy_notes = 'First words.' AND updated_by = 'claude' AND summary IS NULL AND bracket IS NULL FROM deck_strategy WHERE deck_id = 101), left(:'g_r', 200));
-- Other keys, with and without the text
SELECT t.sd(100, '{"summary":"Lands, recursion and value","playgroup":"Casual Friday pod","bracket":4}') AS r \gset k_
SELECT t.chk('V-25 summary, playgroup and bracket still change on their own and leave the text alone',
  :'k_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT summary = 'Lands, recursion and value' AND table_context = 'Casual Friday pod' AND bracket = 4 AND strategy_notes = 'Fresh start after clearing.' FROM deck_strategy WHERE deck_id = 100), left(:'k_r', 200));
SELECT t.sd(100, '{"strategy_notes":"Rewritten with all keys.","summary":"One line","playgroup":"Pod","bracket":2}') AS r \gset m_
SELECT t.chk('V-26 text, summary, playgroup and bracket in one request: one log row holding all four',
  :'m_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'m_r'::jsonb)) = 1
  AND (SELECT after ?& ARRAY['strategy_notes','summary','playgroup','bracket'] FROM ai_change_log WHERE group_id = t.gid(:'m_r'::jsonb)), left(:'m_r', 200));
SELECT t.chk('V-27 bad bracket, summary and playgroup are still refused before anything changes',
  t.sd(100, '{"bracket":6}')->>'err' = 'bad_bracket' AND t.sd(100, jsonb_build_object('summary', repeat('s', 121)))->>'err' = 'bad_summary'
  AND t.sd(100, jsonb_build_object('playgroup', repeat('p', 501)))->>'err' = 'bad_playgroup' AND t.sd(100, '{}')->>'err' = 'nothing_to_set', '');
-- Commander change still works beside a text replace
SELECT t.sd(100, '{"commander":{"card_name":"Card 1"},"strategy_notes":"Commander and text together."}') AS r \gset cm_
SELECT t.chk('V-28 a commander change and a text replace in one request apply together',
  :'cm_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT strategy_notes = 'Commander and text together.' FROM deck_strategy WHERE deck_id = 100), left(:'cm_r', 200));
-- S4: the reason is recorded for a replace
SELECT t.sd(100, '{"strategy_notes":"Reason recorded for this rewrite."}') AS r \gset rs_
SELECT public.ai_record_change_reason(t.u1(), t.gid(:'rs_r'::jsonb), 'The owner asked for a cleaner strategy.') AS r \gset rr_
SELECT t.chk('V-29 S4 still records a reason for the group of a text replace', (:'rr_r'::jsonb->>'stored')::boolean
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'rs_r'::jsonb)) = 'The owner asked for a cleaner strategy.', left(:'rr_r', 200));
-- Isolation
SELECT t.snap() AS s1 \gset
SELECT t.chk('V-30 a second user cannot replace the first user''s text (deck_not_found) and nothing changes',
  t.sd(100, '{"strategy_notes":"Hijacked."}', t.u2(), t.c2())->>'err' = 'deck_not_found' AND t.snap() = :'s1' AND (SELECT strategy_notes <> 'Hijacked.' FROM deck_strategy WHERE deck_id = 100), '');
SELECT t.chk('V-31 a revoked connection or the first user''s connection used by the second user is refused',
  t.sd(100, '{"strategy_notes":"Hijacked."}', t.u1(), t.c2())->>'err' = 'connection_revoked', '');
SELECT t.sd(200, '{"strategy_notes":"Owner two text."}', t.u2(), t.c2()) AS r \gset o2_
SELECT t.chk('V-32 the second user replaces their own text; the first user''s text is untouched',
  :'o2_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT strategy_notes = 'Owner two text.' FROM deck_strategy WHERE deck_id = 200) AND (SELECT strategy_notes = 'Reason recorded for this rewrite.' FROM deck_strategy WHERE deck_id = 100), left(:'o2_r', 200));
-- Signed-in users and anon cannot call it
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT t.att($q$SELECT public.ai_set_deck_setup('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 200, '{"strategy_notes":"x"}')$q$)->>'err' AS e1 \gset
RESET ROLE;
SET ROLE anon;
SELECT t.att($q$SELECT public.ai_set_deck_setup('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 200, '{"strategy_notes":"x"}')$q$)->>'err' AS e2 \gset
RESET ROLE;
SELECT t.chk('V-33 signed-in users and anon cannot call the function', :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%', concat_ws(' | ', :'e1', :'e2'));
-- Old kinds still go through
SELECT t.chk('V-34 other connector kinds still work (add a card, then Claude undoes it)',
  (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SQL
echo "== rollback of S5 on the live state (it never refuses; no data depends on it)"
f $S5.rollback.sql
$P <<'SQL'
SELECT t.chk('V-40 S5 rolled back: the database equals the live state before S5 EXACTLY (functions, grants, constraints, tables, triggers, columns); the saved text stays',
  t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'colsL')
  AND (SELECT strategy_notes = 'Reason recorded for this rewrite.' FROM deck_strategy WHERE deck_id = 100), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fpL'));
SELECT t.chk('V-41 after the rollback Claude can only add to the text again (a replace is refused, an addition is accepted)',
  t.sd(100, '{"strategy_notes":"Something else entirely."}')->>'err' = 'notes_replace_refused'
  AND t.sd(100, '{"strategy_notes":"Reason recorded for this rewrite. Plus an addition."}')#>>'{res,outcome}' = 'applied', '');
SQL
f $S5.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('V-42 a second S5 rollback is refused and changes nothing', position('notes_replace_refused' IN pg_get_functiondef('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)'::regprocedure)) > 0, '')"
echo "== re-apply, then S5 and every earlier draft rolled back in reverse, S3 last of the CC-era drafts"
f $S5.draft.sql
$P <<'SQL'
SELECT t.sd(100, '{"strategy_notes":"Second time round."}') AS r \gset g2_
SELECT t.chk('V-50 re-applied after a rollback: a replace applies again', :'g2_r'::jsonb#>>'{res,outcome}' = 'applied', left(:'g2_r', 200));
SQL
f $S5.rollback.sql
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','deck_setup','deck_create'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; UPDATE deck_strategy SET summary = NULL, bracket = NULL"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
f $S3.rollback.sql
f $CC25.rollback.sql
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds; do f $D/$d.rollback.sql; done
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $D/20261118120000_roles_db1_card_roles.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('V-51 S5, S4, S3, CC-25 and DB-5 to DB-1 roll back in reverse and the database equals the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0') AND to_regclass('public.ai_change_reasons') IS NULL, t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'))"
$P -f $HERE/results.sql
