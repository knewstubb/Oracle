# DB-1 throwaway test. Sourced by run.sh (P, f, M, D, HERE available). Base = the real live migrations up to CC-15b.
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
echo "== apply DB-1"
f $D/20261118120000_roles_db1_card_roles.draft.sql
$P <<'SQL'
SELECT t.chk('D1-01 both tables and the five functions exist',
  to_regclass('public.ref_card_roles') IS NOT NULL AND to_regclass('public.user_card_roles') IS NOT NULL
  AND to_regprocedure('public.deck_slot_oracle_ids(uuid,integer)') IS NOT NULL AND to_regprocedure('public._slot_oracle_id(uuid,integer,integer)') IS NOT NULL
  AND to_regprocedure('public.get_effective_card_roles(uuid,uuid[])') IS NOT NULL AND to_regprocedure('public.owner_set_card_role(uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public._roles_fail(text,jsonb)') IS NOT NULL, '');
SELECT t.chk('D1-02 the shared list has no user column and ships empty',
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ref_card_roles' AND column_name LIKE '%user%') AND (SELECT count(*) FROM ref_card_roles) = 0, '');
SELECT t.chk('D1-03 row level security is on (not forced) for both tables',
  (SELECT bool_and(relrowsecurity AND NOT relforcerowsecurity) FROM pg_class WHERE oid IN ('public.ref_card_roles'::regclass, 'public.user_card_roles'::regclass)), '');
SELECT t.chk('D1-04 all 13 role names are accepted by both tables',
  (SELECT bool_and(t.try(format($q$INSERT INTO ref_card_roles (oracle_id, role, proposer) VALUES (t.o(1), %L, 'system')$q$, r)) = 'ok'
                AND t.try(format($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), %L, 'add', 'owner', 'accepted')$q$, r)) = 'ok')
     FROM unnest(ARRAY['ramp','fixing','card_draw','card_selection','tutor','targeted_removal','board_wipe','counterspell','protection','recursion','graveyard_hate','stax_tax','hand_disruption']) r), '');
SELECT t.chk('D1-05 an invented role, a bad effect, a bad proposer are rejected',
  t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), 'invented', 'add', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), 'ramp', 'maybe', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO ref_card_roles (oracle_id, role, proposer) VALUES (t.o(1), 'ramp', 'owner')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO ref_card_roles (oracle_id, role, proposer) VALUES (t.o(1), 'invented', 'system')$q$) LIKE '%violates check constraint%', '');
SELECT t.chk('D1-06 owner must be accepted, claude must be to_look_at or dismissed; owner rows carry no batch or deck',
  t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), 'ramp', 'add', 'owner', 'to_look_at')$q$) LIKE '%user_card_roles_proposer_state%'
  AND t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), 'ramp', 'add', 'claude', 'accepted')$q$) LIKE '%user_card_roles_proposer_state%'
  AND t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state, batch_id) VALUES (t.u1(), t.o(1), 'ramp', 'add', 'owner', 'accepted', gen_random_uuid())$q$) LIKE '%user_card_roles_claude_only_fields%'
  AND t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state, batch_id, proposed_in_deck_id) VALUES (t.u1(), t.o(1), 'ramp', 'add', 'claude', 'to_look_at', gen_random_uuid(), 100)$q$) = 'ok', '');
SELECT t.chk('D1-07 one row per user, card, role and proposer (duplicate rejected; the owner row and the Claude row may sit side by side)',
  t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), 'ramp', 'add', 'owner', 'accepted'), (t.u1(), t.o(1), 'ramp', 'remove', 'owner', 'accepted')$q$) LIKE '%user_card_roles_one_per_proposer%'
  AND t.try($q$INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(1), 'ramp', 'add', 'owner', 'accepted'), (t.u1(), t.o(1), 'ramp', 'remove', 'claude', 'to_look_at')$q$) = 'ok', '');
-- slot resolution
SELECT t.chk('D1-10 a slot with a printing resolves by printing', (SELECT oracle_id = t.o(1) AND resolved_by = 'printing' FROM deck_slot_oracle_ids(t.u1(), 100) WHERE slot_id = t.slot(100, 'Card 1')), '');
SELECT t.chk('D1-11 a second printing of the same card resolves to the same oracle id (printing id is never a card id)',
  (SELECT count(*) = 1 FROM ref_printings WHERE oracle_id = t.o(1) AND scryfall_id = t.s(101)) AND t.o(1) <> t.s(1), '');
SELECT t.chk('D1-12 a bad printing text falls back to the owner''s own card by name, no error', (SELECT oracle_id = t.o(11) AND resolved_by = 'name' FROM deck_slot_oracle_ids(t.u1(), 100) WHERE slot_id = t.slot(100, 'Name Only')), '');
SELECT t.chk('D1-13 an unknown card is NULL, not an error', (SELECT oracle_id IS NULL AND resolved_by IS NULL FROM deck_slot_oracle_ids(t.u1(), 100) WHERE slot_id = t.slot(100, 'Mystery Card')), '');
SELECT t.chk('D1-14 a name that matches two different cards of the owner is NULL (never guessed)', (SELECT oracle_id IS NULL FROM deck_slot_oracle_ids(t.u1(), 100) WHERE slot_id = t.slot(100, 'Twin')), '');
SELECT t.chk('D1-15 user 2''s slot of the same name resolves to user 2''s own card, never user 1''s', (SELECT oracle_id = t.o(12) FROM deck_slot_oracle_ids(t.u2(), 200) WHERE slot_id = t.slot(200, 'Name Only')), '');
SELECT t.chk('D1-16 user 2 asking for user 1''s deck gets deck_not_found', t.att($q$SELECT to_jsonb(count(*)) FROM deck_slot_oracle_ids(t.u2(), 100)$q$)->>'err' = 'deck_not_found'
  AND t.att($q$SELECT to_jsonb(public._slot_oracle_id(t.u2(), 100, 1))$q$)->>'err' = 'deck_not_found', '');
SELECT t.chk('D1-17 one query returns every slot (13 in deck 100)', (SELECT count(*) = 13 FROM deck_slot_oracle_ids(t.u1(), 100)), '');
SELECT t.chk('D1-18 _slot_oracle_id gives the same answer for one slot', public._slot_oracle_id(t.u1(), 100, t.slot(100, 'Card 3')) = t.o(3), '');
SQL
echo "== the types file and the database agree"
TYPES=$REPO/docs/oracle/contracts/card-roles-and-deck-jobs.types.ts
SLUGS=$(python3 - "$TYPES" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
m = re.search(r"ROLE_SLUGS = \[(.*?)\] as const", s, re.S)
print("{" + ",".join(re.findall(r"'(\w+)'", m.group(1))) + "}")
PY
)
$P <<SQL
SELECT t.chk('D1-08 the 13 role names in the types file equal both tables'' CHECK lists exactly',
  (SELECT count(*) = 2 AND bool_and(ARRAY(SELECT m[1] FROM regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') m ORDER BY 1) = ARRAY(SELECT x FROM unnest('$SLUGS'::text[]) x ORDER BY 1))
     FROM pg_constraint c WHERE c.conrelid IN ('public.ref_card_roles'::regclass, 'public.user_card_roles'::regclass) AND pg_get_constraintdef(c.oid) LIKE '%ramp%' AND pg_get_constraintdef(c.oid) LIKE '%role%'), '$SLUGS');
SELECT t.chk('D1-09 the owner function accepts exactly those 13 names (all 13 work)',
  (SELECT count(*) = 13 AND bool_and(t.try(format('SELECT public.owner_set_card_role(t.u1(), t.o(16), %L, ''add'')', r)) = 'ok') FROM unnest('$SLUGS'::text[]) r), '');
SQL
echo "== layers: baseline, owner and Claude rows merged"
$P <<'SQL'
INSERT INTO ref_card_roles (oracle_id, role, proposer) VALUES (t.o(1), 'ramp', 'system'), (t.o(1), 'card_draw', 'system'), (t.o(2), 'tutor', 'system'), (t.o(6), 'ramp', 'claude');
INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES
  (t.u1(), t.o(1), 'card_draw', 'remove', 'owner', 'accepted'), (t.u1(), t.o(2), 'ramp', 'add', 'owner', 'accepted'),
  (t.u1(), t.o(3), 'ramp', 'add', 'claude', 'to_look_at'), (t.u1(), t.o(3), 'tutor', 'add', 'claude', 'dismissed'),
  (t.u1(), t.o(1), 'ramp', 'remove', 'claude', 'to_look_at'), (t.u1(), t.o(4), 'ramp', 'add', 'owner', 'accepted'), (t.u1(), t.o(4), 'ramp', 'remove', 'claude', 'to_look_at'),
  (t.u1(), t.o(2), 'tutor', 'add', 'claude', 'to_look_at');
CREATE TEMP TABLE want (oracle_id uuid, role text, in_baseline boolean, baseline_proposer text, owner_effect text, claude_effect text, claude_state text, effective boolean, effective_from text, beside boolean);
INSERT INTO want VALUES
 (t.o(1), 'card_draw', true, 'system', 'remove', NULL, NULL, false, 'owner', false),
 (t.o(1), 'ramp', true, 'system', NULL, 'remove', 'to_look_at', false, 'claude', false),
 (t.o(2), 'ramp', false, NULL, 'add', NULL, NULL, true, 'owner', false),
 (t.o(2), 'tutor', true, 'system', NULL, 'add', 'to_look_at', true, 'claude', false),
 (t.o(3), 'ramp', false, NULL, NULL, 'add', 'to_look_at', true, 'claude', false),
 (t.o(3), 'tutor', false, NULL, NULL, 'add', 'dismissed', false, NULL, false),
 (t.o(4), 'ramp', false, NULL, 'add', 'remove', 'to_look_at', true, 'owner', true);
SELECT t.chk('D1-20 the three layers merge exactly as contract section 4 (7 rows, every column)',
  (SELECT count(*) FROM get_effective_card_roles(t.u1(), ARRAY[t.o(1), t.o(2), t.o(3), t.o(4)])) = 7
  AND NOT EXISTS (SELECT * FROM (SELECT * FROM get_effective_card_roles(t.u1(), ARRAY[t.o(1), t.o(2), t.o(3), t.o(4)]) EXCEPT SELECT * FROM want) a)
  AND NOT EXISTS (SELECT * FROM (SELECT * FROM want EXCEPT SELECT * FROM get_effective_card_roles(t.u1(), ARRAY[t.o(1), t.o(2), t.o(3), t.o(4)])) b), '');
SELECT t.chk('D1-21 user 2 sees the shared list but none of user 1''s layers',
  (SELECT count(*) = 3 AND bool_and(effective_from = 'baseline' AND owner_effect IS NULL AND claude_effect IS NULL) FROM get_effective_card_roles(t.u2(), ARRAY[t.o(1), t.o(2), t.o(3), t.o(4)])), '');
SELECT t.chk('D1-22 more than 500 card ids is refused (invalid_request)', t.att($q$SELECT to_jsonb(count(*)) FROM get_effective_card_roles(t.u1(), (SELECT array_agg(t.o(i)) FROM generate_series(1, 501) i))$q$)->>'err' = 'invalid_request'
  AND (t.att($q$SELECT to_jsonb(count(*)) FROM get_effective_card_roles(t.u1(), (SELECT array_agg(t.o(i)) FROM generate_series(1, 500) i))$q$)->>'ok')::boolean, '');
SELECT t.chk('D1-23 an empty or NULL list gives no rows', (SELECT count(*) FROM get_effective_card_roles(t.u1(), ARRAY[]::uuid[])) = 0 AND (SELECT count(*) FROM get_effective_card_roles(t.u1(), NULL)) = 0, '');
SQL
echo "== owner_set_card_role"
$P <<'SQL'
SELECT public.owner_set_card_role(t.u1(), t.o(5), 'ramp', 'add') AS r \gset s1_
SELECT t.chk('D1-30 add: previous empty, current add', :'s1_r'::jsonb#>>'{previous,owner_effect}' IS NULL AND :'s1_r'::jsonb#>>'{current,owner_effect}' = 'add', :'s1_r');
SELECT public.owner_set_card_role(t.u1(), t.o(5), 'ramp', 'remove') AS r \gset s2_
SELECT t.chk('D1-31 remove: previous add, current remove, still one row', :'s2_r'::jsonb#>>'{previous,owner_effect}' = 'add' AND :'s2_r'::jsonb#>>'{current,owner_effect}' = 'remove'
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(5) AND role = 'ramp') = 1, :'s2_r');
SELECT public.owner_set_card_role(t.u1(), t.o(5), 'ramp', 'clear') AS r \gset s3_
SELECT t.chk('D1-32 clear: row gone, previous says remove', :'s3_r'::jsonb#>>'{previous,owner_effect}' = 'remove' AND :'s3_r'::jsonb#>>'{current,owner_effect}' IS NULL
  AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(5)), :'s3_r');
SELECT t.chk('D1-33 refusals: unknown role, bad action, a printing id as a card id, an unknown card, NULL card',
  t.att($q$SELECT public.owner_set_card_role(t.u1(), t.o(5), 'invented', 'add')$q$)->>'err' = 'unknown_role'
  AND t.att($q$SELECT public.owner_set_card_role(t.u1(), t.o(5), 'ramp', 'toggle')$q$)->>'err' = 'bad_action'
  AND t.att($q$SELECT public.owner_set_card_role(t.u1(), t.s(5), 'ramp', 'add')$q$)->>'err' = 'unknown_card'
  AND t.att($q$SELECT public.owner_set_card_role(t.u1(), t.o(9999), 'ramp', 'add')$q$)->>'err' = 'unknown_card'
  AND t.att($q$SELECT public.owner_set_card_role(t.u1(), NULL, 'ramp', 'add')$q$)->>'err' = 'unknown_card'
  AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id IN (t.o(5), t.o(9999)) ), '');
INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES
  (t.u1(), t.o(7), 'ramp', 'add', 'claude', 'to_look_at'), (t.u1(), t.o(7), 'tutor', 'remove', 'claude', 'to_look_at'), (t.u1(), t.o(7), 'fixing', 'add', 'claude', 'dismissed');
SELECT public.owner_set_card_role(t.u1(), t.o(7), 'ramp', 'add');
SELECT public.owner_set_card_role(t.u1(), t.o(7), 'tutor', 'add');
SELECT public.owner_set_card_role(t.u1(), t.o(7), 'fixing', 'add');
SELECT t.chk('D1-34 the owner''s own set deletes a waiting Claude row with the identical value, keeps a different one and keeps a dismissed one (the memory)',
  NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(7) AND role = 'ramp' AND proposer = 'claude')
  AND EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(7) AND role = 'tutor' AND proposer = 'claude' AND effect = 'remove' AND state = 'to_look_at')
  AND EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(7) AND role = 'fixing' AND proposer = 'claude' AND state = 'dismissed')
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(7) AND proposer = 'owner') = 3, '');
SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) AS snap_u1 FROM user_card_roles x WHERE user_id = t.u1() \gset
SELECT public.owner_set_card_role(t.u2(), t.o(5), 'ramp', 'add');
SELECT public.owner_set_card_role(t.u2(), t.o(7), 'ramp', 'remove');
SELECT t.chk('D1-35 user 2''s writes touch only user 2''s rows; user 1''s rows are byte for byte the same',
  (SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) FROM user_card_roles x WHERE user_id = t.u1()) = :'snap_u1' AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u2()) = 2, '');
SELECT t.chk('D1-36 Claude never gets an owner row from an owner write, and the owner function never writes a Claude row',
  NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u2() AND proposer = 'claude'), '');
SQL
echo "== RLS and grants (a second user, the anonymous role, signed-in users)"
$P <<'SQL'
SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) AS snap_u1 FROM user_card_roles x WHERE user_id = t.u1() \gset
SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY oracle_id, role)) AS snap_ref FROM ref_card_roles x \gset
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS own FROM public.user_card_roles \gset u2_
SELECT count(*) AS of_u1 FROM public.user_card_roles WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2_
SELECT count(*) AS ref_n FROM public.ref_card_roles \gset u2_
SELECT t.att($q$WITH i AS (INSERT INTO public.user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES ('00000000-0000-0000-0000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ramp', 'add', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e1 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'ramp', 'add', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e2 \gset
SELECT t.att($q$WITH u AS (UPDATE public.user_card_roles SET effect = 'remove' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e3 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.user_card_roles RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e4 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.ref_card_roles (oracle_id, role, proposer) VALUES ('a0000000-0000-4000-8000-000000000009', 'ramp', 'system') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e5 \gset
SELECT t.att($q$WITH u AS (UPDATE public.ref_card_roles SET proposer = 'claude' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e6 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.ref_card_roles RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e7 \gset
SELECT t.att($q$SELECT public.owner_set_card_role('00000000-0000-0000-0000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ramp', 'add')$q$)->>'err' AS f1 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.get_effective_card_roles('00000000-0000-0000-0000-000000000001', ARRAY['a0000000-0000-4000-8000-000000000001'::uuid])$q$)->>'err' AS f2 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.deck_slot_oracle_ids('00000000-0000-0000-0000-000000000001', 100)$q$)->>'err' AS f3 \gset
SELECT t.att($q$SELECT to_jsonb(public._slot_oracle_id('00000000-0000-0000-0000-000000000001', 100, 1))$q$)->>'err' AS f4 \gset
SELECT t.att($q$SELECT public._roles_fail('x')::text::jsonb$q$)->>'err' AS f5 \gset
RESET ROLE;
SELECT t.chk('D1-40 signed-in user 2 sees only their own personal rows (none of user 1''s), and can read the shared list', :u2_of_u1 = 0 AND :u2_own = 2 AND :u2_ref_n = 4, 'own ' || :'u2_own' || ', of user 1: ' || :'u2_of_u1' || ', shared: ' || :'u2_ref_n');
SELECT t.chk('D1-41 signed-in user 2 cannot insert, update or delete personal rows (permission denied)', :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%' AND :'e4' LIKE 'permission denied%', concat_ws(' | ', :'e1', :'e2', :'e3', :'e4'));
SELECT t.chk('D1-42 signed-in users cannot insert, update or delete the shared list (only the service role can)', :'e5' LIKE 'permission denied%' AND :'e6' LIKE 'permission denied%' AND :'e7' LIKE 'permission denied%'
  AND has_table_privilege('service_role', 'public.ref_card_roles', 'INSERT') AND has_table_privilege('service_role', 'public.ref_card_roles', 'UPDATE') AND has_table_privilege('service_role', 'public.ref_card_roles', 'DELETE'), concat_ws(' | ', :'e5', :'e6', :'e7'));
SELECT t.chk('D1-43 signed-in users cannot call any of the five functions', :'f1' LIKE 'permission denied%' AND :'f2' LIKE 'permission denied%' AND :'f3' LIKE 'permission denied%' AND :'f4' LIKE 'permission denied%' AND :'f5' LIKE 'permission denied%', concat_ws(' | ', :'f1', :'f2', :'f3', :'f4', :'f5'));
SET ROLE anon;
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.user_card_roles$q$)->>'err' AS a1 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.ref_card_roles$q$)->>'err' AS a2 \gset
SELECT t.att($q$SELECT public.owner_set_card_role('00000000-0000-0000-0000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'ramp', 'add')$q$)->>'err' AS a3 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.get_effective_card_roles('00000000-0000-0000-0000-000000000001', ARRAY['a0000000-0000-4000-8000-000000000001'::uuid])$q$)->>'err' AS a4 \gset
RESET ROLE;
SELECT t.chk('D1-44 the anonymous role can read neither table and call no function', :'a1' LIKE 'permission denied%' AND :'a2' LIKE 'permission denied%' AND :'a3' LIKE 'permission denied%' AND :'a4' LIKE 'permission denied%', concat_ws(' | ', :'a1', :'a2', :'a3', :'a4'));
SET ROLE authenticated; SET request.jwt.sub = '';
SELECT count(*) AS n FROM public.user_card_roles \gset nosub_
RESET ROLE;
SELECT t.chk('D1-45 a signed-in session with no user id sees no personal rows', :nosub_n = 0, '');
-- Defence in depth: even if somebody GRANTED write access by mistake, the row policies (select-own only) still stop user 2.
GRANT INSERT, UPDATE, DELETE ON public.user_card_roles, public.ref_card_roles TO authenticated;
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT t.att($q$WITH u AS (UPDATE public.user_card_roles SET effect = 'remove' WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$) AS g1 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.user_card_roles WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$) AS g2 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES ('00000000-0000-0000-0000-000000000001', 'a0000000-0000-4000-8000-000000000015', 'ramp', 'add', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g3 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES ('00000000-0000-0000-0000-000000000002', 'a0000000-0000-4000-8000-000000000015', 'ramp', 'add', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g4 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.ref_card_roles (oracle_id, role, proposer) VALUES ('a0000000-0000-4000-8000-000000000015', 'ramp', 'system') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g5 \gset
SELECT t.att($q$WITH u AS (UPDATE public.ref_card_roles SET proposer = 'claude' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$) AS g6 \gset
RESET ROLE;
REVOKE INSERT, UPDATE, DELETE ON public.user_card_roles, public.ref_card_roles FROM authenticated;
SELECT t.chk('D1-46 with write access wrongly granted, user 2 still changes 0 of user 1''s rows (update 0, delete 0) and cannot insert as user 1 or at all (row security)',
  :'g1'::jsonb#>>'{res}' = '0' AND :'g2'::jsonb#>>'{res}' = '0' AND :'g3' LIKE '%row-level security%' AND :'g4' LIKE '%row-level security%', :'g1' || ' ' || :'g2' || ' ' || :'g3' || ' ' || :'g4');
SELECT t.chk('D1-47 same for the shared list: no insert, no update, with write access wrongly granted', :'g5' LIKE '%row-level security%' AND :'g6'::jsonb#>>'{res}' = '0', :'g5' || ' ' || :'g6');
SELECT t.chk('D1-48 after all of that user 1''s rows and the shared list are byte for byte unchanged',
  (SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY id)) FROM user_card_roles x WHERE user_id = t.u1()) = :'snap_u1'
  AND (SELECT md5(string_agg(to_jsonb(x)::text, '|' ORDER BY oracle_id, role)) FROM ref_card_roles x) = :'snap_ref', '');
SELECT t.chk('D1-49 grants are back to select-only for signed-in users', has_table_privilege('authenticated', 'public.user_card_roles', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.user_card_roles', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.ref_card_roles', 'UPDATE') AND NOT has_table_privilege('anon', 'public.ref_card_roles', 'SELECT'), '');
SQL
echo "== the change log is untouched: append-only guard, batch Undo of an old kind, deletes that cascade"
$P <<'SQL'
INSERT INTO decks (id, name, format, is_active, user_id, card_count) VALUES (101, 'Old kinds', 'commander', true, t.u1(), 0), (102, 'Doomed', 'commander', true, t.u1(), 0);
SELECT t.sub('deck_add', '{"deck_id":101,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"},{"card_name":"Arcane Signet","scryfall_id":"s2","set_code":"cmm","oracle_id":"o2","quantity":1,"categories":"[\"Ramp\"]"}]}') AS r \gset ok_
SELECT t.chk('D1-50 an old-kind batch (2 cards) still applies after DB-1', :'ok_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'ok_r'::jsonb)) = 2, :'ok_r');
SELECT t.chk('D1-51 the append-only guard still stops any change to a log row other than the undo fields',
  t.try($q$UPDATE ai_change_log SET card_name = 'x'$q$) LIKE '%ai_change_log_is_append_only%' AND t.try($q$UPDATE ai_change_log SET after = '{}'$q$) LIKE '%ai_change_log_is_append_only%'
  AND t.try($q$UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner'$q$) = 'ok', '');
SELECT t.und(t.gid(:'ok_r'::jsonb), 'claude') AS r \gset un_
SELECT t.chk('D1-52 Claude undoes the whole old-kind batch in one go (both cards gone, both log rows stamped)', (:'un_r'::jsonb#>>'{res,success}')::boolean AND (:'un_r'::jsonb#>>'{res,undone}')::int = 2
  AND (SELECT count(*) FROM deck_cards WHERE deck_id = 101) = 0 AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'ok_r'::jsonb) AND undone_by = 'claude') = 2, :'un_r');
INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state, proposed_in_deck_id, batch_id) VALUES (t.u1(), t.o(15), 'ramp', 'add', 'claude', 'to_look_at', 102, gen_random_uuid());
DELETE FROM decks WHERE id = 102;
SELECT t.chk('D1-53 deleting a deck keeps the personal row and clears its deck link', (SELECT proposed_in_deck_id IS NULL FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(15)), '');
INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u3(), t.o(15), 'ramp', 'add', 'owner', 'accepted');
DELETE FROM auth.users WHERE id = t.u3();
SELECT t.chk('D1-54 deleting a user removes that user''s personal rows', NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u3()), '');
SQL
echo "== second apply must refuse"
$P -f $D/20261118120000_roles_db1_card_roles.draft.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('D1-60 running DB-1 twice refuses and changes nothing', (SELECT count(*) FROM pg_proc WHERE proname = 'owner_set_card_role') = 1, '')"
echo "== rollback with rows present must refuse"
$P -f $D/20261118120000_roles_db1_card_roles.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('D1-61 rollback refuses while the tables hold rows (tables and functions still there)', to_regclass('public.user_card_roles') IS NOT NULL AND to_regprocedure('public.owner_set_card_role(uuid,uuid,text,text)') IS NOT NULL AND (SELECT count(*) FROM user_card_roles) > 0, '')"
echo "== rollback with the explicit data-loss setting"
$P <<SQL
SET oracle.rollback_allow_data_loss = 'yes';
\i $D/20261118120000_roles_db1_card_roles.rollback.sql
SQL
$P <<'SQL'
SELECT t.chk('D1-62 rollback with the override: tables and functions gone', to_regclass('public.user_card_roles') IS NULL AND to_regclass('public.ref_card_roles') IS NULL AND to_regprocedure('public.owner_set_card_role(uuid,uuid,text,text)') IS NULL AND to_regprocedure('public._roles_fail(text,jsonb)') IS NULL, '');
SELECT t.chk('D1-63 rollback restores the previous state exactly (every function, grant, constraint, table and trigger fingerprint equals the one taken before DB-1)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'));
SELECT t.chk('D1-64 the old connector still works after the rollback (old-kind add applies)', t.sub('deck_add', '{"deck_id":101,"items":[{"card_name":"Mana Crypt","scryfall_id":"s9","set_code":"cmm","oracle_id":"o9","quantity":1,"categories":"[\"Ramp\"]"}]}')#>>'{res,outcome}' = 'applied', '');
SQL
echo "== re-apply, use, empty, roll back without override"
f $D/20261118120000_roles_db1_card_roles.draft.sql
$P <<'SQL'
SELECT t.chk('D1-65 re-apply after rollback works and the owner can set a role', public.owner_set_card_role(t.u1(), t.o(1), 'ramp', 'add')#>>'{current,owner_effect}' = 'add', '');
DELETE FROM user_card_roles;
SQL
f $D/20261118120000_roles_db1_card_roles.rollback.sql
$P <<'SQL'
SELECT t.chk('D1-66 rollback with empty tables needs no override and again restores the exact previous state', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '');
SQL
$P -f $HERE/results.sql
