# CC-25 throwaway test. Sourced by run.sh (P, f, M, D, HERE available). Base = the real live migrations up to CC-15b (no card roles drafts).
# Stand-in (not the live policy): user_locations gets an own-rows-only policy here, like the live one, so the second user check means something.
$P <<'SQL'
INSERT INTO public.user_locations (id, name, type, user_id) OVERRIDING SYSTEM VALUE VALUES
  (501, 'Black Binder', 'storage', t.u1()), (502, 'Main Box', 'storage', t.u1()), (503, 'Deck place', 'deck', t.u1()), (601, 'Black Binder', 'storage', t.u2());
INSERT INTO public.user_cards (id, card_name, oracle_id, user_id) OVERRIDING SYSTEM VALUE VALUES (9001, 'Trade Test Card', 'o-9001', t.u1());
INSERT INTO public.user_copies (card_id, location_id, user_id) VALUES (9001, 501, t.u1()), (9001, 502, t.u1());
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_rows ON public.user_locations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
INSERT INTO t.keep VALUES ('before', t.fp());
SQL
echo "== apply CC-25 draft"
f $D/20261118130000_cc25_trade_locations.draft.sql
$P <<'SQL'
SELECT t.chk('C25-01 the column exists, is yes/no, is never empty, defaults to false',
  (SELECT data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false' FROM information_schema.columns WHERE table_schema='public' AND table_name='user_locations' AND column_name='is_trade'), '');
SELECT t.chk('C25-02 every existing place got false: nothing is marked automatically, the Black Binder included',
  (SELECT count(*) = 4 AND bool_and(NOT is_trade) FROM public.user_locations), '');
SELECT t.chk('C25-03 a new place made the old way (no flag) is false',
  t.try($q$INSERT INTO public.user_locations (name, type, user_id) VALUES ('New box', 'storage', t.u1())$q$) = 'ok'
  AND (SELECT NOT is_trade FROM public.user_locations WHERE id = 502), '');
SELECT t.chk('C25-04 a storage place can be marked and unmarked',
  t.try($q$UPDATE public.user_locations SET is_trade = true WHERE id = 501$q$) = 'ok', '');
SELECT t.chk('C25-05 a deck place cannot be marked',
  t.try($q$UPDATE public.user_locations SET is_trade = true WHERE id = 503$q$) LIKE '%user_locations_trade_only_storage%'
  AND t.try($q$INSERT INTO public.user_locations (name, type, user_id, is_trade) VALUES ('X', 'deck', t.u1(), true)$q$) LIKE '%user_locations_trade_only_storage%', '');
SELECT t.chk('C25-06 a marked place cannot be turned into a deck place',
  (SELECT t.try($q$UPDATE public.user_locations SET is_trade = true WHERE id = 501$q$) = 'ok') AND
  t.try($q$UPDATE public.user_locations SET is_trade = true, type = 'deck' WHERE id = 501$q$) LIKE '%user_locations_trade_only_storage%', '');
SELECT t.chk('C25-07 the flag cannot be empty', t.try($q$UPDATE public.user_locations SET is_trade = NULL WHERE id = 502$q$) LIKE '%not-null%', '');
SELECT t.chk('C25-08 the old picklist and move-list rule (type = storage) still finds a marked place',
  (SELECT count(*) FROM public.user_locations WHERE id = 501 AND type = 'storage') = 1 AND
  t.try($q$UPDATE public.user_locations SET is_trade = true WHERE id = 502$q$) = 'ok' AND
  (SELECT count(*) FROM public.user_locations WHERE type = 'storage' AND user_id = t.u1()) = 2, '');
UPDATE public.user_locations SET is_trade = true WHERE id = 501;
SELECT t.chk('C25-09 the copies in a marked place did not move', (SELECT count(*) = 2 FROM public.user_copies WHERE card_id = 9001 AND location_id IN (501, 502)), '');
SELECT t.chk('C25-10 the only marked place of user 1 is the one marked (user 2''s Black Binder stays unmarked)',
  (SELECT array_agg(id ORDER BY id) = ARRAY[501] FROM public.user_locations WHERE is_trade) AND (SELECT NOT is_trade FROM public.user_locations WHERE id = 601), '');
SQL
echo "== row security: a second user and the anonymous role"
$P <<'SQL'
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
CREATE TEMP TABLE r2 AS SELECT id, is_trade FROM public.user_locations;
CREATE TEMP TABLE r2u AS WITH u AS (UPDATE public.user_locations SET is_trade = true WHERE id = 502 RETURNING id) SELECT id FROM u;
RESET ROLE;
SELECT t.chk('C25-11 user 2 sees only their own place and its flag, and cannot mark user 1''s place',
  (SELECT array_agg(id) = ARRAY[601] FROM r2) AND (SELECT count(*) = 0 FROM r2u) AND (SELECT NOT is_trade FROM public.user_locations WHERE id = 502), '');
SELECT t.chk('C25-12 a marked-then-rolled-back attempt left place 502 unmarked',
  (SELECT NOT is_trade FROM public.user_locations WHERE id = 502), '');
SET ROLE anon;
CREATE TEMP TABLE ra AS SELECT t.try('SELECT * FROM public.user_locations') AS r;
RESET ROLE;
SELECT t.chk('C25-13 the anonymous role cannot read places', (SELECT r FROM ra) LIKE '%permission denied%', (SELECT r FROM ra));
SQL
echo "== rollback refuses while a place is marked, then restores the exact state"
if $P -f $D/20261118130000_cc25_trade_locations.rollback.sql >/tmp/cc25_rb.txt 2>&1; then RB=ran; else RB=refused; fi
$P -c "SELECT t.chk('C25-14 the real rollback file refuses while a place is marked (nothing changed)', '$RB' = 'refused' AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_locations' AND column_name='is_trade'), '$RB')"
$P -c "UPDATE public.user_locations SET is_trade = false"
f $D/20261118130000_cc25_trade_locations.rollback.sql
$P <<'SQL'
SELECT t.chk('C25-15 rollback with nothing marked restores the exact previous state (every function, grant, constraint, table, view and trigger fingerprint)',
  t.fp() = (SELECT v FROM t.keep WHERE k = 'before'), '');
SELECT t.chk('C25-16 the column and constraint are gone, the places and copies are untouched',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_locations' AND column_name='is_trade')
  AND (SELECT count(*) = 4 FROM public.user_locations) AND (SELECT count(*) = 2 FROM public.user_copies WHERE card_id = 9001), '');
SQL
echo "== marked places forgotten only with the override; re-apply works"
f $D/20261118130000_cc25_trade_locations.draft.sql
$P -c "UPDATE public.user_locations SET is_trade = true WHERE id = 501"
$P -c "SET oracle.rollback_allow_data_loss = 'yes'" -f $D/20261118130000_cc25_trade_locations.rollback.sql
$P <<'SQL'
SELECT t.chk('C25-17 with the override, a marked place is forgotten and the state is restored exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'before'), '');
SQL
f $D/20261118130000_cc25_trade_locations.draft.sql
$P -c "SELECT t.chk('C25-18 re-apply after rollback works', (SELECT count(*) = 4 AND bool_and(NOT is_trade) FROM public.user_locations), '')"
$P -f $HERE/results.sql
