# why-here throwaway test (20261120110000_why_here_deck_cards). Sourced by run.sh.
# Base = the real live migrations up to CC-15b, with the live row security on deck_cards (stand-in below). Then the live state
# (DB-1 to DB-5, CC-25, S3, S4, S5, tags) and the why draft on top: applies, nothing existing touched, 200 / 201 limit, row security
# and grants for a second user and anon, rollback rules and exact restore, re-apply, then everything rolled back to the base.
WH=$D/20261120110000_why_here_deck_cards
TG=$D/20261120100000_tags_fill_tag_tables
S5=$D/20261119120000_s5_strategy_replace
S4=$D/20261119110000_s4_claude_change_reason
S3=$D/20261119100000_s3_strategy_window_fields
CC25=$D/20261118130000_cc25_trade_locations
DB=(20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets)
$P <<'SQL'
-- Stand-in for the live state of deck_cards (migration 20261116100000_rls_own_row_policies): row security on (not forced), one own-row policy, no anon access.
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_cards_own_all ON public.deck_cards FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_cards TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
CREATE FUNCTION t.fns() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(pg_get_functiondef(p.oid) || COALESCE(p.proacl::text, ''), '|' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' $$;
CREATE FUNCTION t.cons() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(c.conrelid::regclass::text || c.conname || pg_get_constraintdef(c.oid), '|' ORDER BY c.conrelid::regclass::text, c.conname)) FROM pg_constraint c
   WHERE c.connamespace = 'public'::regnamespace AND c.conname <> 'deck_cards_why_here_max_200' $$;
-- Every deck_cards row as it was, with the new column left out (so "no existing row changed" can be proved)
CREATE FUNCTION t.dcrows() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg((to_jsonb(x) - 'why_here')::text, '|' ORDER BY x.id)) FROM public.deck_cards x $$;
CREATE FUNCTION t.pols() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(tablename || policyname || cmd || roles::text || COALESCE(qual, '') || COALESCE(with_check, ''), '|' ORDER BY tablename, policyname)) FROM pg_policies WHERE schemaname = 'public' $$;
CREATE FUNCTION t.rls() RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(relname || relrowsecurity::text || relforcerowsecurity::text, '|' ORDER BY relname) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' $$;
CREATE FUNCTION t.grants() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(table_name || grantee || privilege_type, '|' ORDER BY table_name, grantee, privilege_type)) FROM information_schema.role_table_grants WHERE table_schema = 'public' $$;
INSERT INTO t.keep VALUES ('fp0', t.fp());
SQL
echo "== the live state: DB-1 to DB-5, CC-25, S3, S4, S5 and the tags draft applied"
for d in $DB; do f $D/$d.draft.sql; done
f $CC25.draft.sql
f $S3.draft.sql
f $S4.draft.sql
f $S5.draft.sql
f $TG.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fpL', t.fp()), ('fnL', t.fns()), ('conL', t.cons()), ('rowsL', t.dcrows()), ('polL', t.pols()), ('rlsL', t.rls()), ('grL', t.grants())"
$P -c "INSERT INTO t.keep SELECT 'nrowsL', count(*)::text FROM deck_cards"
echo "== apply the why draft"
f $WH.draft.sql
$P <<'SQL'
SELECT t.chk('W-01 applies: deck_cards.why_here exists, type text, nullable, no default',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deck_cards' AND column_name = 'why_here' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL), '');
SELECT t.chk('W-02 no existing row changed: the row count and the data of every other column are identical, and every row has why_here NULL',
  t.dcrows() = (SELECT v FROM t.keep WHERE k = 'rowsL') AND (SELECT count(*)::text FROM deck_cards) = (SELECT v FROM t.keep WHERE k = 'nrowsL') AND NOT EXISTS (SELECT 1 FROM deck_cards WHERE why_here IS NOT NULL), '');
SELECT t.chk('W-03 no function (body or grants), no policy, no row-security setting and no table grant changed; the only new constraint is the 200-character one',
  t.fns() = (SELECT v FROM t.keep WHERE k = 'fnL') AND t.cons() = (SELECT v FROM t.keep WHERE k = 'conL') AND t.pols() = (SELECT v FROM t.keep WHERE k = 'polL')
  AND t.rls() = (SELECT v FROM t.keep WHERE k = 'rlsL') AND t.grants() = (SELECT v FROM t.keep WHERE k = 'grL')
  AND (SELECT count(*) FROM pg_constraint WHERE conname = 'deck_cards_why_here_max_200') = 1, '');
SELECT t.chk('W-04 the new column is not in any other table', (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'why_here') = 1, '');
-- Limits
SELECT t.chk('W-10 exactly 200 characters is accepted, also 1 character, an empty string and NULL',
  t.try($q$UPDATE deck_cards SET why_here = repeat('a', 200) WHERE id = (SELECT min(id) FROM deck_cards)$q$) = 'ok'
  AND t.try($q$UPDATE deck_cards SET why_here = 'x' WHERE id = (SELECT min(id) FROM deck_cards)$q$) = 'ok'
  AND t.try($q$UPDATE deck_cards SET why_here = '' WHERE id = (SELECT min(id) FROM deck_cards)$q$) = 'ok'
  AND t.try($q$UPDATE deck_cards SET why_here = NULL WHERE id = (SELECT min(id) FROM deck_cards)$q$) = 'ok', '');
SELECT t.chk('W-11 201 characters is refused, on update and on insert',
  t.try($q$UPDATE deck_cards SET why_here = repeat('a', 201) WHERE id = (SELECT min(id) FROM deck_cards)$q$) LIKE '%deck_cards_why_here_max_200%'
  AND t.try($q$INSERT INTO deck_cards (deck_id, card_name, quantity, user_id, why_here) VALUES (100, 'Long', 1, t.u1(), repeat('a', 201))$q$) LIKE '%deck_cards_why_here_max_200%', '');
SELECT t.chk('W-12 200 characters counts characters, not bytes (200 two-byte characters are accepted, 201 refused)',
  t.try($q$UPDATE deck_cards SET why_here = repeat('é', 200) WHERE id = (SELECT min(id) FROM deck_cards)$q$) = 'ok'
  AND t.try($q$UPDATE deck_cards SET why_here = repeat('é', 201) WHERE id = (SELECT min(id) FROM deck_cards)$q$) LIKE '%deck_cards_why_here_max_200%', '');
SELECT t.chk('W-13 a new card added without a why gets NULL', t.try($q$INSERT INTO deck_cards (deck_id, card_name, quantity, user_id) VALUES (100, 'Plain', 1, t.u1())$q$) = 'ok', '');
-- Row security: the second user and anon
UPDATE deck_cards SET why_here = 'Owner one reason.' WHERE deck_id = 100 AND card_name = 'Card 1';
UPDATE deck_cards SET why_here = 'Owner two reason.' WHERE deck_id = 200 AND card_name = 'Card 1';
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS n_own FROM deck_cards WHERE why_here IS NOT NULL \gset
SELECT count(*) AS n_other FROM deck_cards WHERE deck_id = 100 \gset
SELECT t.att($q$WITH x AS (UPDATE deck_cards SET why_here = 'hijack' WHERE deck_id = 100 RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)#>>'{res}' AS n_upd \gset
SELECT t.att($q$WITH x AS (UPDATE deck_cards SET why_here = 'mine' WHERE deck_id = 200 AND card_name = 'Card 1' RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)#>>'{res}' AS n_upd_own \gset
SELECT t.att($q$WITH x AS (INSERT INTO deck_cards (deck_id, card_name, quantity, user_id, why_here) VALUES (100, 'Sneak', 1, '00000000-0000-0000-0000-000000000001', 'x') RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)->>'err' AS e_ins \gset
RESET ROLE;
SELECT t.chk('W-20 a second signed-in user sees only their own why (1 row), none of the first user''s cards, updates 0 of the first user''s rows, can update their own, and cannot insert a row for the first user',
  :'n_own' = '1' AND :'n_other' = '0' AND :'n_upd' = '0' AND :'n_upd_own' = '1' AND :'e_ins' LIKE '%row-level security%', concat_ws(' | ', :'n_own', :'n_other', :'n_upd', :'n_upd_own', :'e_ins'));
SELECT t.chk('W-21 the first user''s why was not changed by the second user', (SELECT why_here FROM deck_cards WHERE deck_id = 100 AND card_name = 'Card 1') = 'Owner one reason.', '');
SET ROLE anon;
SELECT t.att('SELECT to_jsonb(count(*)) FROM deck_cards')->>'err' AS e_a1 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM deck_cards WHERE why_here IS NOT NULL$q$)->>'err' AS e_a2 \gset
SELECT t.att($q$WITH x AS (UPDATE deck_cards SET why_here = 'anon' RETURNING 1) SELECT to_jsonb(count(*)) FROM x$q$)->>'err' AS e_a3 \gset
RESET ROLE;
SELECT t.chk('W-22 the anonymous role can neither read nor write the column', :'e_a1' LIKE 'permission denied%' AND :'e_a2' LIKE 'permission denied%' AND :'e_a3' LIKE 'permission denied%', concat_ws(' | ', :'e_a1', :'e_a2', :'e_a3'));
SELECT t.chk('W-23 the service role (the app''s route) can read and write the column', has_column_privilege('service_role', 'public.deck_cards', 'why_here', 'SELECT,INSERT,UPDATE'), '');
SQL
f $WH.draft.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('W-24 a second apply is refused and changes nothing', (SELECT count(*) FROM deck_cards WHERE why_here IS NOT NULL) = 2, '')"
echo "== the earlier drafts still work with the why draft applied"
$P <<'SQL'
INSERT INTO deck_strategy (deck_id, user_id, bracket, strategy_notes, table_context, summary, updated_by, updated_at, budget_mode, budget_ceiling, win_condition)
  VALUES (100, t.u1(), 3, 'Old text.', 'Friday pod', 'Lands', 'owner', now(), 'budget', 150, 'Combo');
SELECT t.chk('W-30 S5 replace works (the earlier chain is unaffected)', t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', t.u1(), t.c1(), 100, '{"strategy_notes":"Brand new text."}'))#>>'{res,outcome}' = 'applied', '');
SELECT t.chk('W-31 an old kind (add a card, then Claude undoes it) still works',
  (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SELECT t.chk('W-32 a card with a why can be removed through the live removal routine (the row goes, nothing else)',
  (SELECT count(*) FROM deck_cards WHERE deck_id = 100 AND card_name = 'Card 1') = 1
  AND t.try($q$SELECT public.remove_deck_card_with_release(100, (SELECT id FROM deck_cards WHERE deck_id = 100 AND card_name = 'Card 1'), t.u1())$q$) = 'ok', '');
SQL
echo "== rollback refuses while a why exists, then works after clearing, exact restore"
$P -f $WH.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('W-40 rollback refuses while a deck card has a why and removes nothing', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deck_cards' AND column_name = 'why_here') AND (SELECT count(*) FROM deck_cards WHERE why_here IS NOT NULL) = 2 AND (SELECT count(*) FROM pg_constraint WHERE conname = 'deck_cards_why_here_max_200') = 1, '')"
$P -c "UPDATE deck_cards SET why_here = NULL"
f $WH.rollback.sql
$P <<'SQL'
SELECT t.chk('W-41 rollback with every why cleared: column and constraint gone and the database equals the live state EXACTLY (fingerprint, functions, constraints, policies, row security, grants)',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deck_cards' AND column_name = 'why_here') AND t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL')
  AND t.fns() = (SELECT v FROM t.keep WHERE k = 'fnL') AND t.cons() = (SELECT v FROM t.keep WHERE k = 'conL') AND t.pols() = (SELECT v FROM t.keep WHERE k = 'polL')
  AND t.rls() = (SELECT v FROM t.keep WHERE k = 'rlsL') AND t.grants() = (SELECT v FROM t.keep WHERE k = 'grL'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fpL'));
SQL
$P -f $WH.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
echo "== re-apply, write a why, roll back with the override"
f $WH.draft.sql
$P -c "UPDATE deck_cards SET why_here = 'Keep me' WHERE deck_id = 100 AND card_name = 'Card 2'"
$P -f $WH.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $WH.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('W-42 re-applied after a rollback; the override rollback removes the column; the fingerprint equals the live state again', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deck_cards' AND column_name = 'why_here') AND t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL'), '')"
echo "== roll back the tags draft, S5 and every earlier draft in reverse; the database equals the cc15b base"
f $WH.draft.sql
f $WH.rollback.sql
f $TG.rollback.sql
f $S5.rollback.sql
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','deck_setup','deck_create'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; UPDATE deck_strategy SET summary = NULL, bracket = NULL"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
f $S3.rollback.sql
f $CC25.rollback.sql
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds; do f $D/$d.rollback.sql; done
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $D/20261118120000_roles_db1_card_roles.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('W-50 the why draft, tags, S5, S4, S3, CC-25 and DB-5 to DB-1 roll back in reverse and the database equals the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'))"
$P -f $HERE/results.sql
