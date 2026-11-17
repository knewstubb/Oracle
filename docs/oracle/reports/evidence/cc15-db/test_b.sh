# DB-B throwaway test. Sourced by run.sh. Order: real CC-13 .. set_deck_command_zone migrations (run.sh), then 20261117120000, DB-A, DB-B.
f $M/20261117120000_ai_change_log_allow_deck_delete.sql
f $D/20261117200000_cc15a_new_change_kinds.draft.sql
f $D/20261117200100_cc15b_deck_create_setup.draft.sql
echo "== DB-B twice must refuse"
$P -f $D/20261117200100_cc15b_deck_create_setup.draft.sql 2>&1 | grep -E "ERROR"
cd $HERE && $P -f test_b_all.sql 2>&1 | grep -v "^ *chk\|^-----\|^(1 row)\|^ *$\|^ *[0-9a-f-]*$" | grep -E "ERROR|FATAL|psql:" 
echo "== two sessions, same name in different letter case, at the same moment"
( $P -c "BEGIN; SELECT public.ai_create_deck(t.u1(), t.c1(), 'Race', 'modern', NULL) IS NOT NULL; SELECT pg_sleep(3); COMMIT;" >/dev/null 2>&1 & )
sleep 1
$P -Atc "SELECT t.chk('B10 parallel create with the same name (different case) while the first is still open: the second waits, then is refused deck_name_taken', (t.cd('race', 'modern')->>'err') = 'deck_name_taken', '')"
sleep 3
$P -Atc "SELECT t.chk('B10a exactly one deck called Race exists', (SELECT count(*) FROM decks WHERE lower(name) = 'race') = 1, '')"
echo "== DB-B rollback with deck_create rows present must refuse"
$P -f $D/20261117200100_cc15b_deck_create_setup.rollback.sql 2>&1 | grep ERROR
$P -Atc "SELECT t.chk('B50 DB-B rollback refuses while deck_create rows exist', to_regprocedure('public.ai_create_deck(uuid,uuid,text,text,jsonb)') IS NOT NULL, '')"
$P -c "DELETE FROM ai_change_log WHERE kind IN ('deck_create','deck_setup')"
f $D/20261117200100_cc15b_deck_create_setup.rollback.sql
$P <<'SQL'
SELECT t.chk('B51 DB-B rollback: the five functions are gone, blocker is the empty stub, DB-A still in place',
  to_regprocedure('public.ai_create_deck(uuid,uuid,text,text,jsonb)') IS NULL AND to_regprocedure('public.ai_set_deck_setup(uuid,uuid,integer,jsonb)') IS NULL
  AND to_regprocedure('public._ai_undo_deck_create(uuid,uuid,text)') IS NULL AND to_regprocedure('public._ai_undo_deck_setup(uuid,uuid,text)') IS NULL
  AND to_regprocedure('public._ai_set_primary_commander(uuid,integer,integer)') IS NULL
  AND public._ai_blocker_new(t.u1(), NULL::ai_change_log) IS NULL AND to_regprocedure('public._ai_undo_group_prev(uuid,uuid,text,uuid)') IS NOT NULL AND to_regprocedure('public._ai_limits_new()') IS NOT NULL, '');
SELECT t.chk('B52 after DB-B rollback, the DB-A numbers are still there', public._ai_limits_new()->>'strategy_notes_max_chars' = '4000', '');
SQL
f $D/20261117200100_cc15b_deck_create_setup.draft.sql
$P <<'SQL'
SELECT t.cd('After reapply', 'commander', '{"card_name":"Muldrotha","scryfall_id":"sc-m","oracle_id":"or-m"}') AS r \gset re_
SELECT t.did('After reapply') AS re_id \gset
SELECT t.sd(:re_id, '{"bracket":3}') AS r2 \gset re_
SELECT t.und(t.gid(:'re_r'::jsonb), 'owner') AS r3 \gset re_
SELECT t.chk('B53 re-apply after rollback: create, setup and owner Undo of an empty created deck all work again', (:'re_r2'::jsonb#>>'{res,outcome}') = 'applied' AND (:'re_r3'::jsonb#>>'{res,success}')::boolean AND NOT EXISTS (SELECT 1 FROM decks WHERE id = :re_id), :'re_r3');
\echo
\echo "######## RESULTS (DB-B) ########"
SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, left(detail, 160) AS detail FROM t.res ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM t.res;
SQL
