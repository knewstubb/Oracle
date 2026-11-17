# DB-A throwaway test. Sourced by run.sh (variables P, f, M, D, HERE available).
f $M/20261117120000_ai_change_log_allow_deck_delete.sql
echo "== before DB-A: old kinds through the live functions"
$P <<'SQL'
-- an old-kind group made BEFORE DB-A (deck_add of 2 cards) and a deck_category group
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"},{"card_name":"Arcane Signet","scryfall_id":"s2","set_code":"cmm","oracle_id":"o2","quantity":1,"categories":"[\"Ramp\"]"}]}') AS r \gset pre_
SELECT (:'pre_r'::jsonb->>'group_id') AS pre_group \gset
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_category', jsonb_build_object('deck_id',100,'slots',jsonb_build_array(jsonb_build_object('id',(SELECT id FROM deck_cards WHERE card_name='Sol Ring'),'card_name','Sol Ring','categories',jsonb_build_array('Mana Rocks'))))) AS r2 \gset pre_
SELECT (:'pre_r2'::jsonb->>'group_id') AS pre_cat_group \gset
CREATE TABLE t.keep AS SELECT :'pre_group'::uuid AS add_group, :'pre_cat_group'::uuid AS cat_group;
SELECT t.chk('A00 limits before DB-A are the CC-13 numbers', (public._ai_limits()->>'direct_max')::int = 120, public._ai_limits()::text);
SELECT t.chk('A01 old kinds applied before DB-A', (SELECT count(*) FROM ai_change_log) = 3, (SELECT count(*)::text FROM ai_change_log));
SQL
f $D/20261117200000_cc15a_new_change_kinds.draft.sql
$P -f $HERE/test_a_after.sql
echo "== second apply must refuse"
$P -f $D/20261117200000_cc15a_new_change_kinds.draft.sql 2>&1 | grep -E "ERROR|already" ; echo "(psql exit shown above as ERROR line = refused)"
$P -c "SELECT t.chk('A30 running DB-A twice refuses', (SELECT count(*) FROM pg_proc WHERE proname='_ai_undo_group_prev')=1, 'still one _ai_undo_group_prev')"
echo "== rollback with a new-kind row present must refuse"
$P -c "INSERT INTO ai_change_log (user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, card_name) VALUES (t.u1(), gen_random_uuid(), t.c1(), 'Claude', 'box_create', 100, 'Manual', 'x')"
$P -f $D/20261117200000_cc15a_new_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('A31 rollback refuses while a new-kind row exists', to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NOT NULL, 'still applied')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('deck_create','deck_setup','box_create','box_move'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
echo "== rollback (no new-kind rows)"
f $D/20261117200000_cc15a_new_change_kinds.rollback.sql
$P <<'SQL'
SELECT t.chk('A32 rollback: old names back', to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NULL AND to_regprocedure('public.ai_undo_group(uuid,uuid,text,uuid)') IS NOT NULL
  AND to_regprocedure('public._ai_undo_blocker_prev(uuid,ai_change_log)') IS NULL AND to_regprocedure('public._ai_limits_new()') IS NULL AND to_regprocedure('public._ai_blocker_new(uuid,ai_change_log)') IS NULL, '');
SELECT t.chk('A33 rollback: owner-only list is the three old kinds', NOT public._ai_kind_owner_only('deck_create') AND public._ai_kind_owner_only('copy_move') AND NOT public._ai_kind_owner_only('deck_category'), '');
SELECT t.chk('A34 rollback: constraint rejects a new kind again', (t.att($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'deck_create', 'x') RETURNING NULL::jsonb$q$)->>'ok')::boolean = false, '');
SELECT public.ai_submit_change(t.u1(), t.c1(), 'deck_add', '{"deck_id":100,"items":[{"card_name":"Mana Crypt","scryfall_id":"s9","set_code":"cmm","oracle_id":"o9","quantity":1,"categories":"[\"Ramp\"]"}]}') AS r \gset a35_
SELECT public.ai_undo_group(t.u1(), (:'a35_r'::jsonb->>'group_id')::uuid, 'claude', t.c1()) AS r \gset a35u_
SELECT t.chk('A35 rollback: old kinds still add and undo (Claude)', :'a35_r'::jsonb->>'outcome' = 'applied' AND (:'a35u_r'::jsonb->>'success')::boolean, :'a35u_r');
SQL
echo "== re-apply after rollback"
f $D/20261117200000_cc15a_new_change_kinds.draft.sql
$P <<'SQL'
SELECT t.chk('A36 re-apply works', to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NOT NULL AND to_regprocedure('public._ai_limits_new()') IS NOT NULL, '');
SELECT t.chk('A37 re-apply: constraint accepts the four names', (t.att($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'deck_setup', 'x') RETURNING NULL::jsonb$q$)->>'ok')::boolean, '');
\echo
\echo "######## RESULTS (DB-A) ########"
SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM t.res ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM t.res;
SQL
