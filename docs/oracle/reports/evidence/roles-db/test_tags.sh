# tags-fill throwaway test (20261120100000_tags_fill_tag_tables). Sourced by run.sh.
# Base = the real live migrations up to CC-15b. Then the live state (DB-1 to DB-5, CC-25, S3, S4, S5) and the tags draft on top:
# applies, nothing existing touched, grants and row security, constraints, per-run undo, rollback rules and exact restore, re-apply,
# the earlier drafts still work with it applied, then everything rolled back in reverse to the base.
# Part B (only when TAGS_LEGAL_FILE, TAGS_OWNER_FILE and TAGS_COPY_FILE are set): the real fill job (scripts/fill-card-tags.ts) against this throwaway
# database: dry run writes nothing, a real run, a second run changes nothing, --undo-run empties it again.
TG=$D/20261120100000_tags_fill_tag_tables
S5=$D/20261119120000_s5_strategy_replace
S4=$D/20261119110000_s4_claude_change_reason
S3=$D/20261119100000_s3_strategy_window_fields
CC25=$D/20261118130000_cc25_trade_locations
DB=(20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets)
$P <<'SQL'
CREATE FUNCTION t.sd(p_deck int, p_patch jsonb, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', p_user, p_conn, p_deck, p_patch)) $$;
CREATE FUNCTION t.fns() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(pg_get_functiondef(p.oid) || COALESCE(p.proacl::text, ''), '|' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' $$;
CREATE FUNCTION t.cons() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(c.conrelid::regclass::text || c.conname || pg_get_constraintdef(c.oid), '|' ORDER BY c.conrelid::regclass::text, c.conname)) FROM pg_constraint c
   WHERE c.connamespace = 'public'::regnamespace AND c.conrelid::regclass::text NOT IN ('ref_tag_list', 'ref_card_tags') $$;
INSERT INTO t.keep VALUES ('fp0', t.fp());
SQL
echo "== the live state: DB-1 to DB-5, CC-25, S3, S4 and S5 applied"
for d in $DB; do f $D/$d.draft.sql; done
f $CC25.draft.sql
f $S3.draft.sql
f $S4.draft.sql
f $S5.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fpL', t.fp()), ('snapL', t.snap()), ('fnL', t.fns()), ('conL', t.cons())"
echo "== apply the tags draft"
f $TG.draft.sql
$P <<'SQL'
SELECT t.chk('G-01 applies: 40 Tags (13 broad, 27 mechanic), display order 1 to 40, no card rows yet',
  (SELECT count(*) FROM ref_tag_list) = 40 AND (SELECT count(*) FILTER (WHERE kind = 'broad') FROM ref_tag_list) = 13
  AND (SELECT count(*) FILTER (WHERE kind = 'mechanic') FROM ref_tag_list) = 27
  AND (SELECT min(display_order) = 1 AND max(display_order) = 40 FROM ref_tag_list) AND (SELECT count(*) FROM ref_card_tags) = 0, '');
SELECT t.chk('G-02 nothing existing is touched: the data of every earlier feature table is identical (t.snap)', t.snap() = (SELECT v FROM t.keep WHERE k = 'snapL'), '');
SELECT t.chk('G-03 no existing function (body or grants), constraint or trigger changed: functions and the constraints of every other table are identical to before; the new tables have no trigger',
  t.fns() = (SELECT v FROM t.keep WHERE k = 'fnL') AND t.cons() = (SELECT v FROM t.keep WHERE k = 'conL')
  AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('ref_tag_list', 'ref_card_tags')), '');
SELECT t.chk('G-04 row security is on (not forced) for both tables; one read policy each, for signed-in users only',
  (SELECT count(*) FROM pg_class WHERE relname IN ('ref_tag_list', 'ref_card_tags') AND relrowsecurity AND NOT relforcerowsecurity) = 2
  AND (SELECT count(*) FROM pg_policies WHERE tablename IN ('ref_tag_list', 'ref_card_tags') AND cmd = 'SELECT' AND roles = '{authenticated}') = 2
  AND (SELECT count(*) FROM pg_policies WHERE tablename IN ('ref_tag_list', 'ref_card_tags')) = 2, '');
-- Service role writes; signed-in users read but cannot write; anon sees nothing
INSERT INTO ref_card_tags (oracle_id, tag_key, source, run_id) VALUES (t.o(1), 'ramp', 'scryfall', 'f0000000-0000-4000-8000-000000000001'), (t.o(2), 'ramp', 'scryfall', 'f0000000-0000-4000-8000-000000000001'), (t.o(2), 'blink', 'scryfall', 'f0000000-0000-4000-8000-000000000002');
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS n_a FROM ref_card_tags \gset
SELECT count(*) AS n_l FROM ref_tag_list \gset
SELECT t.att($q$WITH x AS (INSERT INTO ref_card_tags (oracle_id, tag_key, source, run_id) VALUES (gen_random_uuid(), 'ramp', 'scryfall', gen_random_uuid()) RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)->>'err' AS e_ins \gset
SELECT t.att($q$WITH x AS (UPDATE ref_card_tags SET tag_key = 'blink' RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)->>'err' AS e_upd \gset
SELECT t.att($q$WITH x AS (DELETE FROM ref_card_tags RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)->>'err' AS e_del \gset
SELECT t.att($q$WITH x AS (UPDATE ref_tag_list SET display_name = 'x' RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)->>'err' AS e_upl \gset
RESET ROLE;
SELECT t.chk('G-05 a signed-in user reads all 3 card rows and all 40 Tags, and cannot insert, update or delete either table', :'n_a' = '3' AND :'n_l' = '40'
  AND :'e_ins' LIKE 'permission denied%' AND :'e_upd' LIKE 'permission denied%' AND :'e_del' LIKE 'permission denied%' AND :'e_upl' LIKE 'permission denied%', concat_ws(' | ', :'e_ins', :'e_upd', :'e_del', :'e_upl'));
SET ROLE anon;
SELECT t.att('SELECT to_jsonb(count(*)) FROM ref_card_tags')->>'err' AS e_a1 \gset
SELECT t.att('SELECT to_jsonb(count(*)) FROM ref_tag_list')->>'err' AS e_a2 \gset
RESET ROLE;
SELECT t.chk('G-06 the anonymous role cannot read either table', :'e_a1' LIKE 'permission denied%' AND :'e_a2' LIKE 'permission denied%', concat_ws(' | ', :'e_a1', :'e_a2'));
SELECT t.chk('G-07 the service role holds select, insert, update and delete on both tables (on the real platform it also bypasses row security; this stand-in role does not)',
  has_table_privilege('service_role', 'public.ref_card_tags', 'SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('service_role', 'public.ref_tag_list', 'SELECT,INSERT,UPDATE,DELETE'), '');
-- Constraints
SELECT t.chk('G-10 an unknown Tag key is refused', t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'role_ramp', 'scryfall', gen_random_uuid())$q$) LIKE '%foreign key%', t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'role_ramp', 'scryfall', gen_random_uuid())$q$));
SELECT t.chk('G-11 a source outside scryfall / rule / ai / owner_correction is refused; each of the four is accepted',
  t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'ramp', 'guess', gen_random_uuid())$q$) LIKE '%check constraint%'
  AND t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'ramp', 'rule', gen_random_uuid())$q$) = 'ok' AND t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'ramp', 'ai', gen_random_uuid())$q$) = 'ok'
  AND t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'ramp', 'owner_correction', gen_random_uuid())$q$) = 'ok' AND t.try($q$INSERT INTO ref_card_tags VALUES (t.o(3), 'ramp', 'scryfall', gen_random_uuid())$q$) = 'ok', '');
SELECT t.chk('G-12 the same card, Tag and source twice is refused; the same card and Tag from a different source is a different row (room for a later AI pass)',
  t.try($q$INSERT INTO ref_card_tags VALUES (t.o(1), 'ramp', 'scryfall', gen_random_uuid())$q$) LIKE '%duplicate key%'
  AND t.try($q$INSERT INTO ref_card_tags VALUES (t.o(1), 'ramp', 'ai', gen_random_uuid())$q$) = 'ok', '');
SELECT t.chk('G-13 a missing run id or an id that is not a uuid is refused (every row belongs to a run)',
  t.try($q$INSERT INTO ref_card_tags (oracle_id, tag_key, source) VALUES (t.o(3), 'ramp', 'scryfall')$q$) LIKE '%null value%'
  AND t.try($q$INSERT INTO ref_card_tags VALUES ('not-a-uuid', 'ramp', 'scryfall', gen_random_uuid())$q$) LIKE '%invalid input syntax%', '');
SELECT t.chk('G-14 Tag list rules: key must be snake_case, order unique, at least one Scryfall tag, kind broad or mechanic',
  t.try($q$INSERT INTO ref_tag_list (key, display_name, kind, scryfall_tags, display_order) VALUES ('Bad Key', 'x', 'broad', ARRAY['a'], 41)$q$) LIKE '%check constraint%'
  AND t.try($q$INSERT INTO ref_tag_list (key, display_name, kind, scryfall_tags, display_order) VALUES ('extra', 'x', 'broad', ARRAY['a'], 1)$q$) LIKE '%duplicate key%'
  AND t.try($q$INSERT INTO ref_tag_list (key, display_name, kind, scryfall_tags, display_order) VALUES ('extra', 'x', 'broad', '{}', 41)$q$) LIKE '%check constraint%'
  AND t.try($q$INSERT INTO ref_tag_list (key, display_name, kind, scryfall_tags, display_order) VALUES ('extra', 'x', 'role', ARRAY['a'], 41)$q$) LIKE '%check constraint%', '');
-- Undo one run
DELETE FROM ref_card_tags WHERE run_id = 'f0000000-0000-4000-8000-000000000002';
SELECT t.chk('G-15 removing one run removes exactly that run''s rows', (SELECT count(*) FROM ref_card_tags) = 2 AND NOT EXISTS (SELECT 1 FROM ref_card_tags WHERE tag_key = 'blink'), '');
SQL
f $TG.draft.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('G-16 a second apply is refused and changes nothing', (SELECT count(*) FROM ref_tag_list) = 40 AND (SELECT count(*) FROM ref_card_tags) = 2, '')"
echo "== the earlier drafts still work with the tags draft applied"
$P <<'SQL'
INSERT INTO deck_strategy (deck_id, user_id, bracket, strategy_notes, table_context, summary, updated_by, updated_at, budget_mode, budget_ceiling, win_condition)
  VALUES (100, t.u1(), 3, 'Old text.', 'Friday pod', 'Lands', 'owner', now(), 'budget', 150, 'Combo');
SELECT t.chk('G-20 S5 replace works (the earlier chain is unaffected)', t.sd(100, '{"strategy_notes":"Brand new text."}')#>>'{res,outcome}' = 'applied', '');
SELECT t.chk('G-21 an old kind (add a card, then Claude undoes it) still works',
  (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SQL
echo "== rollback refuses while rows exist, then works with the explicit override, exact restore"
$P -f $TG.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('G-30 rollback refuses while ref_card_tags holds rows and removes nothing', to_regclass('public.ref_card_tags') IS NOT NULL AND (SELECT count(*) FROM ref_card_tags) = 2, '')"
$P -c "DELETE FROM ref_card_tags"
f $TG.rollback.sql
$P <<'SQL'
SELECT t.chk('G-31 rollback with the tables empty: both tables gone and the database equals the live state EXACTLY (fingerprint), earlier data unchanged',
  to_regclass('public.ref_card_tags') IS NULL AND to_regclass('public.ref_tag_list') IS NULL AND t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fpL'));
SQL
$P -f $TG.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
echo "== re-apply, fill a few rows, roll back with the override"
f $TG.draft.sql
$P -c "INSERT INTO ref_card_tags VALUES (t.o(1), 'ramp', 'scryfall', gen_random_uuid())"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $TG.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('G-32 re-applied after a rollback; the override rollback removes rows and tables; the fingerprint equals the live state again', to_regclass('public.ref_card_tags') IS NULL AND t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL'), '')"

if [ -n "${TAGS_LEGAL_FILE:-}" ] && [ -n "${TAGS_OWNER_FILE:-}" ] && [ -n "${TAGS_COPY_FILE:-}" ]; then
echo "== Part B: the real fill job against this throwaway database"
f $TG.draft.sql
$P -c "ALTER TABLE public.ref_printings ADD COLUMN legality_commander text"
$P -c "CREATE TABLE t.legal (o uuid)"
$P -c "\\copy t.legal FROM '$TAGS_LEGAL_FILE'"
$P -c "INSERT INTO public.ref_printings (scryfall_id, oracle_id, name, legality_commander) SELECT gen_random_uuid(), o, 'x', 'legal' FROM (SELECT DISTINCT o FROM t.legal) d"
$P -c "INSERT INTO public.ref_printings (scryfall_id, oracle_id, name, legality_commander) VALUES (gen_random_uuid(), gen_random_uuid(), 'banned card', 'banned')"
$P -c "CREATE TABLE t.owner (o uuid)"
$P -c "\\copy t.owner FROM '$TAGS_OWNER_FILE'"
$P -c "INSERT INTO public.user_cards (card_name, oracle_id, user_id) SELECT 'c', o::text, 'da7ccf96-2c73-431c-9d03-952463f82dcc' FROM t.owner"
URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
JOB="npx tsx scripts/fill-card-tags.ts --psql-url $URL --tags-file $TAGS_COPY_FILE"
( cd $REPO
echo "-- dry run";            $=JOB --dry-run --user da7ccf96-2c73-431c-9d03-952463f82dcc > /tmp/tags_dry.txt 2>&1; cat /tmp/tags_dry.txt
echo "-- real run 1";         $=JOB --run-id f1000000-0000-4000-8000-000000000001 > /tmp/tags_run1.txt 2>&1; tail -4 /tmp/tags_run1.txt
$P -c "CREATE TABLE t.snap1 AS SELECT * FROM ref_card_tags"
echo "-- real run 2 (must change nothing)"; $=JOB --run-id f1000000-0000-4000-8000-000000000002 > /tmp/tags_run2.txt 2>&1; tail -4 /tmp/tags_run2.txt
)
PLAN=$(grep -E "^Rows that would be written:" /tmp/tags_dry.txt | grep -oE "[0-9]+$")
NEW2=$(grep -oE "New rows written: [0-9]+" /tmp/tags_run2.txt | grep -oE "[0-9]+$")
$P <<SQL
SELECT t.chk('H-01 the dry run wrote nothing: before run 1 the table was empty (run 1 wrote exactly the planned $PLAN rows)', (SELECT count(*) FROM t.snap1) = $PLAN AND (SELECT count(*) FROM t.snap1 WHERE run_id <> 'f1000000-0000-4000-8000-000000000001') = 0, '');
SELECT t.chk('H-02 a second run wrote 0 new rows and the table is identical to after run 1 (idempotent)', '$NEW2' = '0' AND (SELECT count(*) FROM ref_card_tags) = $PLAN AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM ref_card_tags EXCEPT SELECT * FROM t.snap1) x), '');
SELECT t.chk('H-03 all rows are source scryfall, keyed by a card (oracle_id) that is Commander-legal, and every Tag key is in the Tag list',
  NOT EXISTS (SELECT 1 FROM ref_card_tags WHERE source <> 'scryfall') AND NOT EXISTS (SELECT 1 FROM ref_card_tags c WHERE NOT EXISTS (SELECT 1 FROM ref_printings p WHERE p.oracle_id = c.oracle_id AND p.legality_commander = 'legal'))
  AND NOT EXISTS (SELECT 1 FROM ref_card_tags c WHERE NOT EXISTS (SELECT 1 FROM ref_tag_list l WHERE l.key = c.tag_key)), '');
SELECT t.chk('H-04 the banned test card got no Tag', NOT EXISTS (SELECT 1 FROM ref_card_tags c JOIN ref_printings p USING (oracle_id) WHERE p.legality_commander = 'banned'), '');
SQL
( cd $REPO
echo "-- undo run 2 (nothing to remove)"; $=JOB --undo-run f1000000-0000-4000-8000-000000000002 2>&1 | tail -1
$P -c "SELECT t.chk('H-05 undoing run 2 removed 0 rows (run 1 owns every row)', (SELECT count(*) FROM ref_card_tags) = $PLAN, '')"
echo "-- undo run 1"; $=JOB --undo-run f1000000-0000-4000-8000-000000000001 2>&1 | tail -1
)
$P -c "SELECT t.chk('H-06 undoing run 1 returns the table to empty', (SELECT count(*) FROM ref_card_tags) = 0, '')"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $TG.rollback.sql; } | $P -f -
fi

echo "== roll back S5 and every earlier draft in reverse; the database equals the cc15b base"
f $TG.draft.sql
f $TG.rollback.sql
f $S5.rollback.sql
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','deck_setup','deck_create'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; UPDATE deck_strategy SET summary = NULL, bracket = NULL"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
f $S3.rollback.sql
f $CC25.rollback.sql
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds; do f $D/$d.rollback.sql; done
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $D/20261118120000_roles_db1_card_roles.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('G-40 the tags draft, S5, S4, S3, CC-25 and DB-5 to DB-1 roll back in reverse and the database equals the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'))"
$P -f $HERE/results.sql
