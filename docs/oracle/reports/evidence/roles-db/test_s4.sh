# S4 throwaway test (DV-04, a one-line reason on every Claude change). Sourced by run.sh.
# Base = the real live migrations up to CC-15b. Then: S4 alone on that base (apply, rollback, exact restore); then the live state
# (DB-1 to DB-5 applied) plus CC-25 plus S3, with S4 on top (all checks, rollbacks, re-apply); then every earlier draft rolled back in reverse
# with S4 still applied, and S4 last.
S4=$D/20261119110000_s4_claude_change_reason
S3=$D/20261119100000_s3_strategy_window_fields
CC25=$D/20261118130000_cc25_trade_locations
DB=(20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets)
$P <<'SQL'
CREATE FUNCTION t.sd(p_deck int, p_patch jsonb, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', p_user, p_conn, p_deck, p_patch)) $$;
-- Column lists of the tables S4 must not change.
CREATE FUNCTION t.cols() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY table_name, column_name) FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('ai_change_log', 'ai_pending_changes', 'deck_strategy', 'user_locations') $$;
-- A request to add one named card to deck 100 with the given extra payload keys.
CREATE FUNCTION t.add1(p_name text, p_extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.sub('deck_add', jsonb_build_object('deck_id', 100, 'items', jsonb_build_array(jsonb_build_object('card_name', p_name, 'scryfall_id', 's-' || p_name, 'set_code', 'cmm', 'oracle_id', 'o-' || p_name, 'quantity', 1, 'categories', '["Ramp"]'))) || p_extra) $$;
INSERT INTO t.keep VALUES ('fp0', t.fp()), ('cols0', t.cols());
SQL
echo "== S4 on the bare base (no other draft): apply and roll back"
f $S4.draft.sql
$P -c "SELECT t.chk('Q-00 S4 applies on the cc15b base', to_regclass('public.ai_change_reasons') IS NOT NULL AND to_regprocedure('public._ai_submit_change_pre_reason(uuid,uuid,text,jsonb,boolean)') IS NOT NULL, '')"
$P <<'SQL'
SELECT t.add1('Bare Card', '{"claude_reason":"Bare base."}') AS r \gset b_
SELECT t.chk('Q-00b on the bare base a request with a reason applies and the reason is stored', :'b_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT reason FROM ai_change_reasons) = 'Bare base.', left(:'b_r', 200));
SQL
f $S4.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('Q-00c the rollback refuses while a reason is stored (nothing changed)', to_regclass('public.ai_change_reasons') IS NOT NULL, '')"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('Q-00e with the data-loss answer the rollback restores the base EXACTLY (functions, grants, constraints, tables, columns)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0') AND to_regclass('public.ai_change_reasons') IS NULL, '')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE card_name = 'Bare Card'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM deck_cards WHERE card_name = 'Bare Card'"
echo "== the live state: DB-1 to DB-5, CC-25 and S3 applied"
for d in $DB; do f $D/$d.draft.sql; done
f $CC25.draft.sql
f $S3.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fpL', t.fp()), ('colsL', t.cols())"
$P <<'SQL'
INSERT INTO public.decks (id, name, format, is_active, user_id, card_count) VALUES (101, 'Second', 'commander', true, t.u1(), 0);
SELECT t.mkdeck(301, t.u1(), 130, 'Big', 1000);
-- Before S4: a request that carries a reason is not refused and not broken (what the app must live with until the owner applies S4).
SELECT t.add1('Early Card', '{"claude_reason":"Sent before S4 exists."}') AS r \gset e_
SELECT t.chk('Q-01 before S4: a request with a reason key applies as always (the key is ignored) and no reason is stored anywhere',
  :'e_r'::jsonb#>>'{res,outcome}' = 'applied' AND to_regclass('public.ai_change_reasons') IS NULL
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'e_r'::jsonb)) = 1, left(:'e_r', 200));
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['ramp']))::jsonb || '{"claude_reason":"Early label."}') AS r \gset el_
SELECT t.chk('Q-01b before S4: the extra key is also ignored by the card_label plan', :'el_r'::jsonb#>>'{res,outcome}' = 'applied', left(:'el_r', 200));
SQL
echo "== apply S4 on the live state"
f $S4.draft.sql
$P -f $S4.draft.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P <<'SQL'
SELECT t.chk('Q-02 running S4 a second time is refused and changes nothing', (SELECT count(*) FROM pg_proc WHERE proname = 'ai_submit_change') = 1, '');
SELECT t.chk('Q-03 no existing table or column changed: ai_change_log, ai_pending_changes, deck_strategy and user_locations have the same columns as before',
  t.cols() = (SELECT v FROM t.keep WHERE k = 'colsL'), '');
SELECT t.chk('Q-03a the new table has row security (not forced), one owner-only read policy, no write for signed-in users or anon',
  (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = 'public.ai_change_reasons'::regclass)
  AND (SELECT count(*) FROM pg_policies WHERE tablename = 'ai_change_reasons') = 1
  AND has_table_privilege('authenticated', 'public.ai_change_reasons', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.ai_change_reasons', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.ai_change_reasons', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.ai_change_reasons', 'DELETE') AND NOT has_table_privilege('anon', 'public.ai_change_reasons', 'SELECT')
  AND has_table_privilege('service_role', 'public.ai_change_reasons', 'INSERT'), '');
SELECT t.chk('Q-03b the new and the front-door functions run by the service role only (not anon, not signed-in users); the renamed ones keep their grants',
  (SELECT bool_and(has_function_privilege('service_role', f, 'EXECUTE') AND NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('authenticated', f, 'EXECUTE'))
     FROM unnest(ARRAY['public.ai_submit_change(uuid,uuid,text,jsonb,boolean)', 'public.ai_approve_pending(uuid,uuid)', 'public.ai_record_change_reason(uuid,uuid,text)',
       'public._ai_clean_reason(jsonb)', 'public._ai_submit_change_pre_reason(uuid,uuid,text,jsonb,boolean)', 'public._ai_approve_pending_pre_reason(uuid,uuid)']) f), '');
SELECT t.chk('Q-03c a reason longer than 200, with a line break, empty, or with spaces around it cannot be written straight to the table',
  t.try(format($q$INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES (gen_random_uuid(), t.u1(), %L)$q$, repeat('x', 201))) LIKE '%ai_change_reasons_one_line%'
  AND t.try($q$INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES (gen_random_uuid(), t.u1(), E'a\nb')$q$) LIKE '%ai_change_reasons_one_line%'
  AND t.try($q$INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES (gen_random_uuid(), t.u1(), '')$q$) LIKE '%ai_change_reasons_one_line%'
  AND t.try($q$INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES (gen_random_uuid(), t.u1(), ' padded ')$q$) LIKE '%ai_change_reasons_one_line%'
  AND t.try(format($q$INSERT INTO ai_change_reasons (group_id, user_id, reason) VALUES (gen_random_uuid(), t.u1(), %L)$q$, repeat('x', 200))) = 'ok', '');
-- Applied requests keep their reason
SELECT t.add1('Arcane Signet', '{"claude_reason":"The deck is two mana sources under its target."}') AS r \gset a_
SELECT t.chk('Q-04 deck_add with a reason applies and the reason is stored for that group, for this owner',
  :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT reason = 'The deck is two mana sources under its target.' AND user_id = t.u1() FROM ai_change_reasons WHERE group_id = t.gid(:'a_r'::jsonb)), left(:'a_r', 200));
SELECT t.sub('deck_category', jsonb_build_object('deck_id',100,'slots',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Card 2'),'card_name','Card 2','categories',jsonb_build_array('Mana Rocks'))),'claude_reason','Sorting the rocks together.')) AS r \gset c_
SELECT t.sub('deck_zone', jsonb_build_object('deck_id',100,'to','maybeboard','slots',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Card 3'),'card_name','Card 3')),'claude_reason','Parking a card the owner is unsure about.')) AS r \gset z_
SELECT t.sub('deck_remove', jsonb_build_object('deck_id',100,'slots',jsonb_build_array(jsonb_build_object('id',t.slot(100,'Card 4'),'card_name','Card 4')),'claude_reason','Cutting a card that does not fit the plan.')) AS r \gset x_
SELECT t.chk('Q-05 deck_category, deck_zone and deck_remove with a reason each apply and each stores its own reason',
  :'c_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'z_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'x_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'c_r'::jsonb)) = 'Sorting the rocks together.'
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'z_r'::jsonb)) = 'Parking a card the owner is unsure about.'
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'x_r'::jsonb)) = 'Cutting a card that does not fit the plan.', left(:'c_r' || :'z_r' || :'x_r', 300));
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 5', ARRAY['ramp']))::jsonb || '{"claude_reason":"Label with a reason."}') AS r \gset l_
SELECT t.chk('Q-05b a CC-26 kind (card_label) goes through the same front door and stores its reason', :'l_r'::jsonb#>>'{res,outcome}' = 'applied'
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'l_r'::jsonb)) = 'Label with a reason.', left(:'l_r', 200));
-- A reason with spaces around it is stored trimmed; exactly 200 is fine
SELECT t.add1('Trim Card', jsonb_build_object('claude_reason', '   Padded reason.   ')) AS r \gset p_
SELECT t.add1('Long Card', jsonb_build_object('claude_reason', repeat('y', 200))) AS r \gset lg_
SELECT t.chk('Q-06 spaces around a reason are trimmed; exactly 200 characters is accepted',
  (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'p_r'::jsonb)) = 'Padded reason.' AND (SELECT char_length(reason) FROM ai_change_reasons WHERE group_id = t.gid(:'lg_r'::jsonb)) = 200, '');
-- Without a reason the database still applies (the rule "a reason is required" is the tool's, not the table's)
SELECT t.add1('No Reason Card') AS r \gset n_
SELECT t.chk('Q-07 a request with no reason key still applies (old rows and internal writers keep working) and stores no reason row',
  :'n_r'::jsonb#>>'{res,outcome}' = 'applied' AND NOT EXISTS (SELECT 1 FROM ai_change_reasons WHERE group_id = t.gid(:'n_r'::jsonb)), left(:'n_r', 200));
-- Bad reasons are refused before anything changes
SELECT t.snap() AS s0 \gset
SELECT t.chk('Q-08 an empty, blank, 201-character, multi-line, tab, number, null or list reason is refused as reason_invalid and NOTHING changes',
  (SELECT bool_and(t.add1('Refused Card', jsonb_build_object('claude_reason', v))->>'err' = 'reason_invalid')
     FROM unnest(ARRAY[to_jsonb(''::text), to_jsonb('   '::text), to_jsonb(repeat('z', 201)), to_jsonb(E'one\ntwo'::text), to_jsonb(E'one\ttwo'::text), '5'::jsonb, 'null'::jsonb, '["a"]'::jsonb]) v)
  AND t.snap() = :'s0' AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE card_name = 'Refused Card'), '');
SELECT t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Dry Card","scryfall_id":"sd","set_code":"cmm","oracle_id":"od","quantity":1,"categories":"[\"Ramp\"]"}],"claude_reason":"Only a preview."}', NULL, NULL, true) AS r \gset d_
SELECT t.chk('Q-09 a dry run with a reason changes nothing and stores no reason', :'d_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND t.snap() = :'s0' AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE card_name = 'Dry Card')
  AND NOT EXISTS (SELECT 1 FROM ai_change_reasons WHERE reason = 'Only a preview.'), '');
-- Another owner's request: isolation
SELECT t.sub('deck_add', '{"deck_id":200,"items":[{"card_name":"U2 Card","scryfall_id":"s2c","set_code":"cmm","oracle_id":"o2c","quantity":1,"categories":"[\"Ramp\"]"}],"claude_reason":"Owner two reason."}', t.u2(), t.c2()) AS r \gset u2_
SELECT t.chk('Q-10 a second owner''s reason is stored under that owner', :'u2_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT user_id = t.u2() FROM ai_change_reasons WHERE group_id = t.gid(:'u2_r'::jsonb)), left(:'u2_r', 200));
-- Waiting requests: the reason rides in the stored request, the hold reason stays its own
SELECT t.sub('deck_remove', (SELECT jsonb_build_object('deck_id', 301, 'claude_reason', 'Trimming the long tail of the deck.',
   'slots', jsonb_agg(jsonb_build_object('id', dc.id, 'card_name', dc.card_name) ORDER BY dc.id)) FROM deck_cards dc WHERE dc.deck_id = 301 AND dc.card_name IN (SELECT 'Big ' || i FROM generate_series(1, 121) i))) AS r \gset w_
SELECT :'w_r'::jsonb#>>'{res,pending_id}' AS pid \gset
SELECT t.chk('Q-11 121 cards wait (hold reason over_ten, unchanged); the reason is kept in the stored request; no reason row yet; nothing removed',
  :'w_r'::jsonb#>>'{res,outcome}' = 'pending' AND :'w_r'::jsonb#>>'{res,reason}' = 'over_ten'
  AND (SELECT reason = 'over_ten' AND payload->>'claude_reason' = 'Trimming the long tail of the deck.' AND status = 'waiting' FROM ai_pending_changes WHERE id = :'pid'::uuid)
  AND (SELECT count(*) FROM deck_cards WHERE deck_id = 301) = 130 AND NOT EXISTS (SELECT 1 FROM ai_change_reasons WHERE reason = 'Trimming the long tail of the deck.'), left(:'w_r', 200));
SELECT t.appr(:'pid'::uuid) AS r \gset ap_
SELECT t.chk('Q-12 approving applies it and the reason is written for the new group; the hold reason column still says over_ten and is not the reason',
  :'ap_r'::jsonb#>>'{res,outcome}' = 'approved' AND (SELECT count(*) FROM deck_cards WHERE deck_id = 301) = 9
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = (:'ap_r'::jsonb#>>'{res,group_id}')::uuid) = 'Trimming the long tail of the deck.'
  AND (SELECT reason = 'over_ten' AND status = 'approved' FROM ai_pending_changes WHERE id = :'pid'::uuid)
  AND (SELECT bool_and(approved_by_owner) FROM ai_change_log WHERE group_id = (:'ap_r'::jsonb#>>'{res,group_id}')::uuid), left(:'ap_r', 200));
SELECT t.sub('deck_add', (SELECT jsonb_build_object('deck_id', 100, 'claude_reason', 'A big add that gets declined.', 'items', jsonb_agg(jsonb_build_object('card_name', 'Bulk ' || i, 'scryfall_id', 'sb' || i, 'set_code', 'cmm', 'oracle_id', 'ob' || i, 'quantity', 1, 'categories', '["Other"]'))) FROM generate_series(1, 125) i)) AS r \gset w2_
SELECT :'w2_r'::jsonb#>>'{res,pending_id}' AS pid2 \gset
SELECT public.ai_decline_pending(t.u1(), :'pid2'::uuid) AS r \gset dc_
SELECT t.chk('Q-13 a declined waiting request stores no reason and nothing else', :'w2_r'::jsonb#>>'{res,outcome}' = 'pending' AND (:'dc_r'::jsonb->>'outcome') = 'declined'
  AND NOT EXISTS (SELECT 1 FROM ai_change_reasons WHERE reason = 'A big add that gets declined.'), left(:'w2_r', 200));
-- Undo still works, with and without a reason, and the reason stays with its group
SELECT t.und(t.gid(:'a_r'::jsonb), 'claude') AS r \gset u_
SELECT t.und(t.gid(:'n_r'::jsonb), 'claude') AS r \gset un_
SELECT t.chk('Q-14 Claude undoes a change that has a reason and one that has none; the reason row stays (history is kept)',
  (:'u_r'::jsonb#>>'{res,success}')::boolean AND (:'un_r'::jsonb#>>'{res,success}')::boolean AND EXISTS (SELECT 1 FROM ai_change_reasons WHERE group_id = t.gid(:'a_r'::jsonb))
  AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE card_name IN ('Arcane Signet', 'No Reason Card')), '');
SELECT t.und(t.gid(:'ap_r'::jsonb), 'owner') AS r \gset uo_
SELECT t.chk('Q-15 the owner undoes the approved big change (all 121 back)', (:'uo_r'::jsonb#>>'{res,success}')::boolean AND (SELECT count(*) FROM deck_cards WHERE deck_id = 301) = 130, left(:'uo_r', 200));
-- ai_record_change_reason (create deck, set deck setup)
SELECT t.sd(100, '{"bracket":4,"summary":"Landfall value","playgroup":"Friday pod"}') AS r \gset s_
SELECT public.ai_record_change_reason(t.u1(), t.gid(:'s_r'::jsonb), 'The owner asked for a summary.') AS r \gset rr_
SELECT t.chk('Q-16 set deck setup then record its reason: stored for that group',
  :'s_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'rr_r'::jsonb->>'stored')::boolean AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'s_r'::jsonb)) = 'The owner asked for a summary.', left(:'s_r', 200));
SELECT t.chk('Q-17 recording again does not overwrite (stored false); a bad reason, an unknown group and another owner''s group are refused',
  (public.ai_record_change_reason(t.u1(), t.gid(:'s_r'::jsonb), 'A second answer.')->>'stored')::boolean = false
  AND (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'s_r'::jsonb)) = 'The owner asked for a summary.'
  AND t.att(format('SELECT public.ai_record_change_reason(%L, %L, %L)', t.u1(), t.gid(:'s_r'::jsonb), ''))->>'err' = 'reason_invalid'
  AND t.att(format('SELECT public.ai_record_change_reason(%L, %L, %L)', t.u1(), gen_random_uuid(), 'x'))->>'err' = 'change_not_found'
  AND t.att(format('SELECT public.ai_record_change_reason(%L, %L, %L)', t.u2(), t.gid(:'s_r'::jsonb), 'x'))->>'err' = 'change_not_found', '');
SELECT public.ai_create_deck(t.u1(), t.c1(), 'Reasoned', 'modern', NULL) AS r \gset cd_
SELECT public.ai_record_change_reason(t.u1(), (:'cd_r'::jsonb->>'group_id')::uuid, 'A new deck for the Friday pod.') AS r \gset cr_
SELECT t.chk('Q-18 create deck then record its reason: stored', (:'cr_r'::jsonb->>'stored')::boolean AND (SELECT reason FROM ai_change_reasons WHERE group_id = (:'cd_r'::jsonb->>'group_id')::uuid) = 'A new deck for the Friday pod.', left(:'cd_r', 200));
-- Owner-only reads (results of the role attempts are kept in variables, then checked as the superuser)
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS own FROM public.ai_change_reasons \gset r2_
SELECT count(*) AS of_u1 FROM public.ai_change_reasons WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset r2_
SELECT t.att($q$WITH i AS (INSERT INTO public.ai_change_reasons (group_id, user_id, reason) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', 'x') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e1 \gset
SELECT t.att($q$WITH u AS (UPDATE public.ai_change_reasons SET reason = 'changed' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e2 \gset
SELECT t.att($q$SELECT public.ai_record_change_reason('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'x')$q$)->>'err' AS e3 \gset
SELECT t.att($q$SELECT public.ai_submit_change('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'deck_add', '{}', true)$q$)->>'err' AS e4 \gset
RESET ROLE;
SET ROLE anon;
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.ai_change_reasons$q$)->>'err' AS a1 \gset
RESET ROLE;
SELECT t.chk('Q-19 a signed-in owner reads only their own reasons (owner two sees one row, none of owner one)', :r2_own = 1 AND :r2_of_u1 = 0, :'r2_own');
SELECT t.chk('Q-20 a signed-in owner cannot write a reason or call the new or front-door functions', :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%' AND :'e4' LIKE 'permission denied%', concat_ws(' | ', :'e1', :'e2', :'e3', :'e4'));
SELECT t.chk('Q-21 anon cannot read reasons', :'a1' LIKE 'permission denied%', :'a1');
-- The recent-changes function is untouched (the app reads reasons itself): it still lists the changes and returns no reason field
SELECT t.chk('Q-22 ai_list_recent_changes still works and is unchanged (no reason field; the app joins the reasons itself)',
  jsonb_array_length(public.ai_list_recent_changes(t.u1())) > 0 AND NOT (public.ai_list_recent_changes(t.u1())->0 ? 'claude_reason'), '');
SQL
echo "== rollback refuses while reasons exist; the same files roll back exactly with the data-loss answer"
f $S4.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('Q-30 rollback refuses while reasons exist and changes nothing', to_regclass('public.ai_change_reasons') IS NOT NULL AND to_regprocedure('public._ai_approve_pending_pre_reason(uuid,uuid)') IS NOT NULL, '')"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
$P <<'SQL'
SELECT t.chk('Q-31 with the data-loss answer S4 rolls back and the database equals the live state before S4 EXACTLY (functions, grants, constraints, tables, triggers, columns)',
  t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'colsL'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fpL'));
SELECT t.chk('Q-32 the connector works after the rollback (add and Claude undo, old kinds and CC-26 kinds)',
  (SELECT t.und(t.gid(t.add1('After Rollback')), 'claude')#>>'{res,success}') = 'true', '');
SQL
echo "== re-apply, then every earlier draft rolled back in reverse WITH S4 still applied, S4 last"
f $S4.draft.sql
$P <<'SQL'
SELECT t.add1('Again Card', '{"claude_reason":"Second time round."}') AS r \gset g_
SELECT t.chk('Q-40 re-applied after a rollback: a request with a reason applies and stores it', (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'g_r'::jsonb)) = 'Second time round.', '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','deck_setup','deck_create'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; UPDATE deck_strategy SET summary = NULL, bracket = NULL"
f $S3.rollback.sql
f $CC25.rollback.sql
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds; do f $D/$d.rollback.sql; done
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $D/20261118120000_roles_db1_card_roles.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('Q-41 S3, CC-25 and DB-5 to DB-1 roll back with S4 still on top (they do not touch the functions S4 wraps)', to_regclass('public.ref_card_roles') IS NULL AND to_regclass('public.ai_change_reasons') IS NOT NULL AND to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NULL, '')"
$P <<'SQL'
SELECT t.add1('Older Base', '{"claude_reason":"Older base."}') AS r \gset ob_
SELECT t.chk('Q-42 the connector still takes a reason and applies (old kinds) on that older base', (SELECT reason FROM ai_change_reasons WHERE group_id = t.gid(:'ob_r'::jsonb)) = 'Older base.', '');
SQL
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('Q-43 S4 rolled back last: the database equals the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0') AND t.cols() = (SELECT v FROM t.keep WHERE k = 'cols0'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'))"
$P -f $HERE/results.sql
