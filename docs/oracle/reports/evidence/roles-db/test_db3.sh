# DB-3 throwaway test. Sourced by run.sh. Base = the real live migrations up to CC-15b, then DB-1, DB-2, DB-3 (DB-4 is NOT applied here).
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
f $D/20261118120000_roles_db1_card_roles.draft.sql
f $D/20261118120100_roles_db2_change_kinds.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fp2', t.fp())"
echo "== apply DB-3"
f $D/20261118120200_roles_db3_deck_card_jobs.draft.sql
$P <<'SQL'
SELECT t.mkdeck(300, t.u1(), 140, 'Big', 1000);
INSERT INTO decks (id, name, format, is_active, user_id, card_count) VALUES (103, 'Doomed', 'commander', true, t.u1(), 0);
INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity, user_id) VALUES (103, 'Card 1', t.s(1)::text, 1, t.u1());
SELECT t.chk('E3-01 table, row security (not forced) and the functions exist', to_regclass('public.deck_card_jobs') IS NOT NULL AND (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid = 'public.deck_card_jobs'::regclass)
  AND to_regprocedure('public.owner_set_card_job(uuid,integer,uuid,text,text,text)') IS NOT NULL AND to_regprocedure('public.owner_decide_card_job(uuid,integer,uuid,text)') IS NOT NULL
  AND to_regprocedure('public.owner_accept_job_proposals(uuid,integer,uuid)') IS NOT NULL AND to_regprocedure('public.get_deck_card_jobs(uuid,integer)') IS NOT NULL
  AND to_regprocedure('public.deck_job_names(uuid,integer)') IS NOT NULL AND to_regprocedure('public._job_canonical_name(uuid,integer,text)') IS NOT NULL
  AND position('jobs_not_available' IN pg_get_functiondef('public._ai_label_job_plan(uuid,integer,uuid,jsonb)'::regprocedure)) = 0, '');
SELECT t.chk('E3-02 the table is keyed by deck and card identity: the card id is an oracle id, there is no slot column',
  (SELECT data_type FROM information_schema.columns WHERE table_name = 'deck_card_jobs' AND column_name = 'oracle_id') = 'uuid' AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deck_card_jobs' AND column_name LIKE '%slot%'), '');
SELECT t.chk('E3-03 constraints: job 1 to 40 characters; a Claude row must have a job; owner rows are accepted; a Claude row may not be accepted; reason at most 200; owner rows carry no batch; one row per proposer',
  t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', repeat('j', 41), 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', '', 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', NULL, 'claude', 'to_look_at')$q$) LIKE '%deck_card_jobs_claude_has_job%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', 'Engine', 'claude', 'accepted')$q$) LIKE '%deck_card_jobs_proposer_state%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', 'Engine', repeat('r', 201), 'owner', 'accepted')$q$) LIKE '%violates check constraint%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state, batch_id) VALUES (t.u1(), 100, t.o(1), 'x', 'Engine', 'owner', 'accepted', gen_random_uuid())$q$) LIKE '%deck_card_jobs_claude_only_batch%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', 'Engine', 'owner', 'accepted'), (t.u1(), 100, t.o(1), 'x', 'Flex', 'owner', 'accepted')$q$) LIKE '%deck_card_jobs_one_per_proposer%'
  AND t.try($q$INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES (t.u1(), 100, t.o(1), 'x', NULL, 'owner', 'accepted')$q$) = 'ok', '');
SQL
echo "== the owner's own jobs"
$P <<'SQL'
SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'set', ' engine ', 'Makes mana every turn') AS r \gset j1_
SELECT t.chk('E3-10 set a job: trimmed, stored with the starting spelling (engine -> Engine), reason kept, previous empty', :'j1_r'::jsonb#>>'{current,owner_job}' = 'Engine' AND :'j1_r'::jsonb#>>'{current,owner_reason}' = 'Makes mana every turn'
  AND :'j1_r'::jsonb#>>'{previous,owner_set}' = 'false' AND (SELECT card_name = 'Card 1' AND proposer = 'owner' AND state = 'accepted' FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 100 AND oracle_id = t.o(1)), :'j1_r');
SELECT public.owner_set_card_job(t.u1(), 100, t.o(2), 'set', 'Mana Sink');
SELECT public.owner_set_card_job(t.u1(), 100, t.o(3), 'set', 'mana sink') AS r \gset j2_
SELECT t.chk('E3-11 a custom job name takes the spelling already used in the deck (mana sink -> Mana Sink)', :'j2_r'::jsonb#>>'{current,owner_job}' = 'Mana Sink', :'j2_r');
SELECT t.chk('E3-12 the picker list: the seven first, then names in use (Mana Sink once)', public.deck_job_names(t.u1(), 100) = ARRAY['Engine','Enabler','Payoff','Win condition','Combo piece','Commander support','Flex','Mana Sink'], array_to_string(public.deck_job_names(t.u1(), 100), ','));
SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'set', 'Payoff', NULL) AS r \gset j3_
SELECT t.chk('E3-13 changing a job replaces it; previous returned for the 10-second Undo; a missing reason clears the reason', :'j3_r'::jsonb#>>'{previous,owner_job}' = 'Engine' AND :'j3_r'::jsonb#>>'{current,owner_job}' = 'Payoff' AND :'j3_r'::jsonb#>>'{current,owner_reason}' IS NULL
  AND (SELECT count(*) FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 100 AND oracle_id = t.o(1)) = 1, :'j3_r');
SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'clear_job') AS r \gset j4_
SELECT t.chk('E3-14 "no job, on purpose" is a stored owner row with no job', :'j4_r'::jsonb#>>'{current,owner_set}' = 'true' AND :'j4_r'::jsonb#>>'{current,owner_job}' IS NULL
  AND (SELECT count(*) = 1 FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(1) AND owner_set AND owner_job IS NULL AND effective_job IS NULL AND effective_from = 'owner'), :'j4_r');
SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'clear') AS r \gset j5_
SELECT t.chk('E3-15 clear removes the owner row', :'j5_r'::jsonb#>>'{current,owner_set}' = 'false' AND NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 100 AND oracle_id = t.o(1)), :'j5_r');
SELECT t.chk('E3-16 refusals: bad action, empty name, name over 40, reason over 200, a maybeboard card, a card not in the deck, someone else''s deck',
  t.att($q$SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'toggle')$q$)->>'err' = 'bad_action'
  AND t.att($q$SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'set', '   ')$q$)->>'err' = 'bad_job_name'
  AND t.att($q$SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'set', repeat('x', 41))$q$)->>'err' = 'bad_job_name'
  AND t.att($q$SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'set', 'Engine', repeat('y', 201))$q$)->>'err' = 'reason_too_long'
  AND t.att($q$SELECT public.owner_set_card_job(t.u1(), 100, t.o(9), 'set', 'Engine')$q$)->>'err' = 'slot_in_maybeboard'
  AND t.att($q$SELECT public.owner_set_card_job(t.u1(), 100, t.o(15), 'set', 'Engine')$q$)->>'err' = 'card_not_in_deck'
  AND t.att($q$SELECT public.owner_set_card_job(t.u2(), 100, t.o(1), 'set', 'Engine')$q$)->>'err' = 'deck_not_found'
  AND NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = t.u2()), '');
-- keyed by card, not slot
SELECT public.owner_set_card_job(t.u1(), 100, t.o(1), 'set', 'Enabler', 'Keeps the engine running');
DELETE FROM deck_cards WHERE id = t.slot(100, 'Card 1');
SELECT t.chk('E3-17 a card removed from the deck: its job is not listed (the Card jobs layer joins to current cards) but the row waits', NOT EXISTS (SELECT 1 FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(1))
  AND EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 100 AND oracle_id = t.o(1)), '');
INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity, user_id, categories) VALUES (100, 'Card 1', t.s(101)::text, 1, t.u1(), '["Other"]');   -- re-import: a NEW slot id, another printing
SELECT t.chk('E3-18 re-added (new slot id, different printing): the job is back, because it is keyed by deck and card identity', (SELECT effective_job = 'Enabler' AND effective_reason = 'Keeps the engine running' FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(1)), '');
SELECT public.owner_set_card_job(t.u1(), 103, t.o(1), 'set', 'Flex');
SELECT t.chk('E3-19 a job exists in the deck about to be deleted', (SELECT count(*) FROM deck_card_jobs WHERE deck_id = 103) = 1, '');
DELETE FROM decks WHERE id = 103;
SELECT t.chk('E3-19b deleting a deck takes its jobs with it', (SELECT count(*) FROM deck_card_jobs WHERE deck_id = 103) = 0, '');
SELECT t.chk('E3-1A the readers refuse another user''s deck', t.att($q$SELECT to_jsonb(count(*)) FROM get_deck_card_jobs(t.u2(), 100)$q$)->>'err' = 'deck_not_found' AND t.att($q$SELECT to_jsonb(public.deck_job_names(t.u2(), 100))$q$)->>'err' = 'deck_not_found', '');
SQL
echo "== Claude proposes a role AND a job for one card: one request, one log row, counted once"
$P <<'SQL'
SELECT t.age();
SELECT t.snap() AS s0 \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['ramp'], NULL, '{"name":"engine","reason":"Ramps into the commander"}'), t.cd(100,'Card 5', NULL, NULL, '{"name":"Win condition"}')), NULL, NULL, true) AS r \gset p0_
SELECT t.chk('E3-20 dry run: n = 2 cards (a card with a role and a job is ONE), job spelling matched to the starting seven, nothing written', :'p0_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND (:'p0_r'::jsonb#>>'{res,plan,n}')::int = 2
  AND :'p0_r'::jsonb#>>'{res,plan,changes,0,job,name}' = 'Engine' AND t.snap() = :'s0', :'p0_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['ramp'], NULL, '{"name":"engine","reason":"Ramps into the commander"}'), t.cd(100,'Card 5', NULL, NULL, '{"name":"Win condition"}'))) AS r \gset p1_
SELECT t.gid(:'p1_r'::jsonb) AS g1 \gset
SELECT t.chk('E3-21 applied: ONE log row per card (2), not one per value (3); the log row holds the role and the job', :'p1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'p1_r'::jsonb#>>'{res,count}')::int = 2 AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'g1') = 2
  AND (SELECT after->'job'->>'job' = 'Engine' AND after->'job'->>'reason' = 'Ramps into the commander' AND jsonb_array_length(after->'roles') = 1 AND before->'job' = '{"row": null}'::jsonb FROM ai_change_log WHERE group_id = :'g1' AND card_name = 'Card 2'), :'p1_r');
SELECT t.chk('E3-22 Claude rows only: a waiting job row and a waiting role row, tagged with the group; no owner row written', (SELECT count(*) = 2 AND bool_and(proposer = 'claude' AND state = 'to_look_at' AND batch_id = :'g1') FROM deck_card_jobs WHERE user_id = t.u1() AND batch_id = :'g1')
  AND (SELECT count(*) = 1 FROM user_card_roles WHERE user_id = t.u1() AND batch_id = :'g1') AND (SELECT count(*) FROM deck_card_jobs WHERE user_id = t.u1() AND proposer = 'owner' AND oracle_id IN (t.o(2), t.o(5))) = 1, '');
SELECT t.chk('E3-23 the reader shows Claude''s job as the effective one, labelled claude; owner job (Mana Sink on card 2) was replaced? no: card 2 already had the owner''s Mana Sink, so Claude''s Engine is BESIDE it',
  (SELECT owner_job = 'Mana Sink' AND claude_job = 'Engine' AND effective_job = 'Mana Sink' AND effective_from = 'owner' AND beside AND claude_state = 'to_look_at' AND batch_id = :'g1' FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(2))
  AND (SELECT claude_job = 'Win condition' AND effective_job = 'Win condition' AND effective_from = 'claude' AND NOT beside FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(5))
  AND :'p1_r'::jsonb#>>'{res,plan,changes,0,job,result}' = 'beside_yours', '');
SELECT t.snap() AS s1 \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['ramp'], NULL, '{"name":"Engine","reason":"Ramps into the commander"}'), t.cd(100,'Card 5', NULL, NULL, '{"name":"win condition"}'))) AS r \gset p2_
SELECT t.chk('E3-24 the same request again changes nothing', :'p2_r'::jsonb->>'err' = 'nothing_to_change' AND t.snap() = :'s1', :'p2_r');
-- the owner already said "no job" on card 6; Claude proposes one
SELECT public.owner_set_card_job(t.u1(), 100, t.o(6), 'clear_job');
SELECT md5(to_jsonb(x)::text) AS own6 FROM deck_card_jobs x WHERE user_id = t.u1() AND oracle_id = t.o(6) AND proposer = 'owner' \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', NULL, NULL, '{"name":"Payoff"}'))) AS r \gset p3_
SELECT t.chk('E3-25 the owner said "no job" on purpose: Claude''s job is stored beside it, the owner row is untouched byte for byte', :'p3_r'::jsonb#>>'{res,plan,changes,0,job,result}' = 'beside_yours'
  AND (SELECT md5(to_jsonb(x)::text) FROM deck_card_jobs x WHERE user_id = t.u1() AND oracle_id = t.o(6) AND proposer = 'owner') = :'own6'
  AND (SELECT beside AND effective_job IS NULL AND effective_from = 'owner' FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(6)), :'p3_r');
-- owner already has exactly this job: skipped
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['fixing'], NULL, '{"name":"mana sink"}')), NULL, NULL, true) AS r \gset p4_
SELECT t.chk('E3-26 asking for the job the owner already set (any letter case) is skipped as unchanged, the role in the same request still goes through', :'p4_r'::jsonb#>>'{res,plan,skipped,0,what}' = 'job' AND :'p4_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'unchanged'
  AND (:'p4_r'::jsonb#>>'{res,plan,n}')::int = 1 AND :'p4_r'::jsonb#>'{res,plan,changes,0,job}' = 'null'::jsonb, :'p4_r');
-- dismissed memory is per deck
SELECT public.owner_decide_card_job(t.u1(), 100, t.o(5), 'dismiss') AS r \gset p5_
SELECT t.chk('E3-27 dismiss a job: the Claude row stays marked dismissed; it stops counting', :'p5_r'::jsonb#>>'{current,claude_state}' = 'dismissed' AND (SELECT effective_job IS NULL FROM get_deck_card_jobs(t.u1(), 100) WHERE oracle_id = t.o(5)), :'p5_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 5', NULL, NULL, '{"name":"Win condition"}'), t.cd(100,'Card 7', ARRAY['ramp'])), NULL, NULL, true) AS r \gset p6_
SELECT t.chk('E3-28 proposing the dismissed job again is skipped (previously_dismissed); a different reason is a different proposal', :'p6_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'previously_dismissed'
  AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 5', NULL, NULL, '{"name":"Win condition","reason":"New reason"}')), NULL, NULL, true)#>>'{res,plan,changes,0,job,result}' = 'proposed', :'p6_r');
SELECT t.chk('E3-29 the same job in ANOTHER deck is not remembered as dismissed (jobs are per deck)', (SELECT count(*) FROM deck_card_jobs WHERE state = 'dismissed') = 1
  AND t.sub('card_label', t.lbl(200, t.cd(200,'Card 1', NULL, NULL, '{"name":"Win condition"}')), t.u2(), t.c2(), true)#>>'{res,plan,changes,0,job,result}' = 'proposed', '');
SELECT public.owner_decide_card_job(t.u1(), 100, t.o(2), 'accept') AS r \gset p7_
SELECT t.chk('E3-2A accept a job beside the owner''s: the owner row takes Claude''s value, the Claude row is gone', :'p7_r'::jsonb#>>'{current,owner_job}' = 'Engine' AND :'p7_r'::jsonb#>>'{previous,owner_job}' = 'Mana Sink' AND :'p7_r'::jsonb#>>'{current,claude_job}' IS NULL, :'p7_r');
SELECT t.chk('E3-2B nothing waiting / bad decision / someone else''s deck', t.att($q$SELECT public.owner_decide_card_job(t.u1(), 100, t.o(2), 'accept')$q$)->>'err' = 'no_proposal'
  AND t.att($q$SELECT public.owner_decide_card_job(t.u1(), 100, t.o(2), 'maybe')$q$)->>'err' = 'bad_decision' AND t.att($q$SELECT public.owner_decide_card_job(t.u2(), 100, t.o(2), 'accept')$q$)->>'err' = 'deck_not_found', '');
SQL
echo "== the 120 limit with a role AND a job on every card"
$P <<'SQL'
SELECT t.age();
SELECT t.sub('card_label', t.bigp(300, 1, 120, 'Big', '{"add_roles":["ramp"],"job":{"name":"Engine","reason":"Test"}}')) AS r \gset b1_
SELECT t.chk('E3-30 120 cards, each with a role and a job (240 values): applied at once, 120 log rows, 120 role rows, 120 job rows', :'b1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'b1_r'::jsonb#>>'{res,count}')::int = 120
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'b1_r'::jsonb)) = 120 AND (SELECT count(*) FROM user_card_roles WHERE batch_id = t.gid(:'b1_r'::jsonb)) = 120
  AND (SELECT count(*) FROM deck_card_jobs WHERE batch_id = t.gid(:'b1_r'::jsonb)) = 120, left(:'b1_r', 200));
SELECT t.age();
SELECT t.sub('card_label', t.bigp(300, 1, 121, 'Big', '{"add_roles":["fixing"],"job":{"name":"Payoff"}}')) AS r \gset b2_
SELECT :'b2_r'::jsonb#>>'{res,pending_id}' AS pid \gset
SELECT t.chk('E3-31 121 cards with role and job wait (over_ten) and write nothing', :'b2_r'::jsonb#>>'{res,reason}' = 'over_ten' AND (SELECT card_count = 121 FROM ai_pending_changes WHERE id = :'pid'::uuid)
  AND (SELECT count(*) FROM deck_card_jobs WHERE job = 'Payoff' AND deck_id = 300) = 0, left(:'b2_r', 200));
SELECT t.appr(:'pid'::uuid) AS r \gset b3_
SELECT t.chk('E3-32 approving applies all 121 roles and 121 jobs and 121 log rows', :'b3_r'::jsonb#>>'{res,outcome}' = 'approved' AND (SELECT count(*) FROM deck_card_jobs WHERE job = 'Payoff' AND deck_id = 300 AND proposer = 'claude') = 121
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = (:'b3_r'::jsonb#>>'{res,group_id}')::uuid AND approved_by_owner) = 121, left(:'b3_r', 200));
SELECT t.age();
SELECT t.sub('card_label', t.bigp(300, 122, 140, 'Big', '{"job":{"name":"Flex"}}')) AS r \gset b4_
SELECT t.chk('E3-33 a job alone (no role) is a full change: 19 cards, 19 log rows', :'b4_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'b4_r'::jsonb#>>'{res,count}')::int = 19, left(:'b4_r', 200));
SQL
echo "== Undo of a batch with jobs"
$P <<'SQL'
SELECT t.age();
INSERT INTO deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, reason, proposer, state) VALUES (t.u1(), 100, t.o(7), 'Card 7', 'Flex', 'old idea', 'claude', 'dismissed');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 7', ARRAY['tutor'], NULL, '{"name":"Combo piece","reason":"With Card 8"}'), t.cd(100,'Card 8', NULL, NULL, '{"name":"Combo piece"}'), t.cd(100,'Card 10', ARRAY['protection'], NULL, '{"name":"Commander support"}'))) AS r \gset u1_
SELECT t.gid(:'u1_r'::jsonb) AS gu \gset
SELECT t.snap() AS sa \gset
SELECT public.owner_decide_card_job(t.u1(), 100, t.o(8), 'accept');
SELECT t.snap() AS sb \gset
SELECT t.und(:'gu', 'claude') AS r \gset u2_
SELECT t.chk('E3-40 the owner accepted one job; Claude''s Undo is refused changed_since (naming the card and "job"), nothing at all changes', :'u2_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND :'u2_r'::jsonb#>>'{res,refused,card}' = 'Card 8' AND :'u2_r'::jsonb#>>'{res,refused,what}' = 'job' AND t.snap() = :'sb', :'u2_r');
SELECT t.und(:'gu', 'owner') AS r \gset u3_
SELECT t.chk('E3-41 the owner''s Undo restores the 2 untouched cards (roles and jobs), leaves the accepted one alone and says so', (:'u3_r'::jsonb#>>'{res,success}')::boolean AND (:'u3_r'::jsonb#>>'{res,undone}')::int = 2 AND :'u3_r'::jsonb#>>'{res,left_alone,0,card}' = 'Card 8'
  AND NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE batch_id = :'gu') AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE batch_id = :'gu')
  AND EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 100 AND oracle_id = t.o(8) AND proposer = 'owner' AND job = 'Combo piece'), :'u3_r');
SELECT t.chk('E3-42 the dismissed job Claude had overwritten on Card 7 is back exactly as it was (the memory survives Undo)', EXISTS (SELECT 1 FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 100 AND oracle_id = t.o(7) AND proposer = 'claude' AND job = 'Flex' AND reason = 'old idea' AND state = 'dismissed' AND batch_id IS NULL), '');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 9', ARRAY['recursion']), t.cd(100,'Card 4', NULL, NULL, '{"name":"Flex"}'))) AS r \gset v1_
SELECT t.gid(:'v1_r'::jsonb) AS gv \gset
SELECT t.und(:'gv', 'claude') AS r \gset v2_
SELECT t.chk('E3-43 Claude undoes a clean batch in one go (2 cards, role and job rows gone, log rows stamped claude)', (:'v2_r'::jsonb#>>'{res,success}')::boolean AND (:'v2_r'::jsonb#>>'{res,undone}')::int = 2
  AND NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE batch_id = :'gv') AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'gv' AND undone_by = 'claude') = 2, :'v2_r');
-- the owner set the identical job by hand: Claude's row goes, so Claude's Undo must refuse
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 4', NULL, NULL, '{"name":"Flex"}'))) AS r \gset w1_
SELECT public.owner_set_card_job(t.u1(), 100, t.o(4), 'set', 'Flex');
SELECT t.und(t.gid(:'w1_r'::jsonb), 'claude') AS r \gset w2_
SELECT t.chk('E3-44 the owner set the same job by hand (which removes Claude''s waiting row): Claude''s Undo is refused changed_since', :'w2_r'::jsonb#>>'{res,refused,code}' = 'changed_since', :'w2_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['recursion'], NULL, '{"name":"Payoff"}'))) AS r \gset w3_
SELECT t.expire(t.gid(:'w3_r'::jsonb));
SELECT t.chk('E3-45 after 7 days Undo is closed for both (window_closed)', t.und(t.gid(:'w3_r'::jsonb), 'claude')#>>'{res,refused,code}' = 'window_closed' AND t.und(t.gid(:'w3_r'::jsonb), 'owner')#>>'{res,refused,code}' = 'window_closed', '');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 10', NULL, NULL, '{"name":"Enabler"}'))) AS r \gset w4_
SELECT t.chk('E3-46 Recent changes: label_detail carries the job name for the sentence', (SELECT e->'label_detail'->>'job' = 'Enabler' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'w4_r'::jsonb)::text), '');
SELECT t.age();
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', NULL, NULL, '{"name":"Flex"}'), t.cd(100,'Card 4', NULL, NULL, '{"name":"Payoff"}'))) AS r \gset x1_
SELECT public.owner_accept_job_proposals(t.u1(), NULL, t.gid(:'x1_r'::jsonb)) AS r \gset x2_
SELECT t.chk('E3-47 accept all by batch: both jobs become the owner''s', (:'x2_r'::jsonb->>'accepted')::int = 2 AND NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE batch_id = t.gid(:'x1_r'::jsonb)), :'x2_r');
SELECT count(*) AS nwait FROM deck_card_jobs WHERE user_id = t.u1() AND deck_id = 300 AND state = 'to_look_at' \gset
SELECT public.owner_accept_job_proposals(t.u1(), 300, NULL) AS r \gset x3_
SELECT t.chk('E3-48 accept all by deck accepts every waiting job in that deck (140: one waiting row per card; the second batch replaced the first batch''s rows) and nothing in other decks', (:'x3_r'::jsonb->>'accepted')::int = :nwait AND :nwait = 140 AND NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE deck_id = 300 AND state = 'to_look_at')
  AND EXISTS (SELECT 1 FROM deck_card_jobs WHERE deck_id = 100 AND state = 'to_look_at'), :'x3_r');
SELECT t.chk('E3-49 accept-all needs a scope; another user''s deck is refused', t.att($q$SELECT public.owner_accept_job_proposals(t.u1(), NULL, NULL)$q$)->>'err' = 'invalid_request' AND t.att($q$SELECT public.owner_accept_job_proposals(t.u2(), 100, NULL)$q$)->>'err' = 'deck_not_found'
  AND (public.owner_accept_job_proposals(t.u2(), NULL, t.gid(:'x1_r'::jsonb))->>'accepted')::int = 0, '');
SQL
echo "== isolation: RLS, grants, the guard"
$P <<'SQL'
SELECT public.owner_set_card_job(t.u2(), 200, t.o(1), 'set', 'Engine');
SELECT t.snap() AS s0 \gset
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS of_u1 FROM public.deck_card_jobs WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2_
SELECT count(*) AS own FROM public.deck_card_jobs \gset u2_
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES ('00000000-0000-0000-0000-000000000002', 200, 'a0000000-0000-4000-8000-000000000001', 'x', 'Engine', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS e1 \gset
SELECT t.att($q$WITH u AS (UPDATE public.deck_card_jobs SET job = 'Hacked' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS e2 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_card_jobs RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$)->>'err' AS e3 \gset
SELECT t.att($q$SELECT public.owner_set_card_job('00000000-0000-0000-0000-000000000002', 200, 'a0000000-0000-4000-8000-000000000001', 'set', 'Engine')$q$)->>'err' AS f1 \gset
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.get_deck_card_jobs('00000000-0000-0000-0000-000000000002', 200)$q$)->>'err' AS f2 \gset
SELECT t.att($q$SELECT public.owner_decide_card_job('00000000-0000-0000-0000-000000000002', 200, 'a0000000-0000-4000-8000-000000000001', 'accept')$q$)->>'err' AS f3 \gset
SELECT t.att($q$SELECT public.owner_accept_job_proposals('00000000-0000-0000-0000-000000000002', 200, NULL)$q$)->>'err' AS f4 \gset
SELECT t.att($q$SELECT to_jsonb(public.deck_job_names('00000000-0000-0000-0000-000000000002', 200))$q$)->>'err' AS f5 \gset
SELECT t.att($q$SELECT public._ai_label_job_plan('00000000-0000-0000-0000-000000000002', 200, 'a0000000-0000-4000-8000-000000000001', '{}')$q$)->>'err' AS f6 \gset
SELECT t.att($q$SELECT public._job_canonical_name('00000000-0000-0000-0000-000000000002', 200, 'x')$q$)->>'err' AS f7 \gset
RESET ROLE;
SELECT t.chk('E3-50 signed-in user 2 sees none of user 1''s jobs (row security) and can read their own', :u2_of_u1 = 0 AND :u2_own = 1, 'own ' || :'u2_own' || ' of user 1 ' || :'u2_of_u1');
SELECT t.chk('E3-51 signed-in users cannot insert, update or delete jobs, nor call any job function', :'e1' LIKE 'permission denied%' AND :'e2' LIKE 'permission denied%' AND :'e3' LIKE 'permission denied%'
  AND :'f1' LIKE 'permission denied%' AND :'f2' LIKE 'permission denied%' AND :'f3' LIKE 'permission denied%' AND :'f4' LIKE 'permission denied%' AND :'f5' LIKE 'permission denied%' AND :'f6' LIKE 'permission denied%' AND :'f7' LIKE 'permission denied%',
  concat_ws(' | ', :'e1', :'f1', :'f6'));
GRANT INSERT, UPDATE, DELETE ON public.deck_card_jobs TO authenticated;
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT t.att($q$WITH u AS (UPDATE public.deck_card_jobs SET job = 'Hacked' WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$) AS g1 \gset
SELECT t.att($q$WITH d AS (DELETE FROM public.deck_card_jobs WHERE user_id = '00000000-0000-0000-0000-000000000001' RETURNING 1) SELECT to_jsonb(count(*)) FROM d$q$) AS g2 \gset
SELECT t.att($q$WITH i AS (INSERT INTO public.deck_card_jobs (user_id, deck_id, oracle_id, card_name, job, proposer, state) VALUES ('00000000-0000-0000-0000-000000000001', 100, 'a0000000-0000-4000-8000-000000000015', 'x', 'Engine', 'owner', 'accepted') RETURNING 1) SELECT to_jsonb(count(*)) FROM i$q$)->>'err' AS g3 \gset
RESET ROLE;
REVOKE INSERT, UPDATE, DELETE ON public.deck_card_jobs FROM authenticated;
SELECT t.chk('E3-52 with write access wrongly granted, user 2 still changes 0 of user 1''s rows and cannot insert (row security); data byte for byte unchanged', :'g1'::jsonb#>>'{res}' = '0' AND :'g2'::jsonb#>>'{res}' = '0' AND :'g3' LIKE '%row-level security%' AND t.snap() = :'s0', :'g1' || :'g2' || :'g3');
SET ROLE anon;
SELECT t.att($q$SELECT to_jsonb(count(*)) FROM public.deck_card_jobs$q$)->>'err' AS a1 \gset
RESET ROLE;
SELECT t.chk('E3-53 the anonymous role cannot read jobs', :'a1' LIKE 'permission denied%', :'a1');
SELECT t.chk('E3-54 Claude cannot reach another user''s deck or cards: user 2 with their own connection on user 1''s deck, and on a job request for it',
  t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', NULL, NULL, '{"name":"Flex"}')), t.u2(), t.c2())->>'err' = 'deck_not_found' AND t.snap() = :'s0', '');
SELECT t.chk('E3-55 the append-only guard still blocks any change to a log row that carries a job', t.try($q$UPDATE ai_change_log SET after = '{}' WHERE kind = 'card_label' AND after ? 'job'$q$) LIKE '%ai_change_log_is_append_only%'
  AND t.try($q$UPDATE ai_change_log SET before = '{}' WHERE kind = 'card_label'$q$) LIKE '%ai_change_log_is_append_only%', '');
SELECT count(*) AS n_log FROM ai_change_log WHERE deck_id = 300 AND kind = 'card_label' \gset
DELETE FROM decks WHERE id = 300;
SELECT t.chk('E3-56 deleting a deck that has job rows and card_label log rows works: jobs go with the deck, log rows stay and lose only the deck link',
  NOT EXISTS (SELECT 1 FROM deck_card_jobs WHERE deck_id = 300) AND :n_log > 250 AND (SELECT count(*) FROM ai_change_log WHERE deck_name = 'Big Big' AND deck_id IS NULL) = :n_log, :n_log::text);
SQL
echo "== second apply must refuse"
$P -f $D/20261118120200_roles_db3_deck_card_jobs.draft.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E3-60 running DB-3 twice refuses and changes nothing', (SELECT count(*) FROM pg_proc WHERE proname = 'owner_set_card_job') = 1, '')"
echo "== rollback while job log rows exist must refuse"
$P -f $D/20261118120200_roles_db3_deck_card_jobs.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E3-61 rollback refuses while a card_label log row carries a job (table and functions still there)', to_regclass('public.deck_card_jobs') IS NOT NULL AND to_regprocedure('public.owner_set_card_job(uuid,integer,uuid,text,text,text)') IS NOT NULL, '')"
echo "== clear the history by hand (test only); the table still holds rows, so it must still refuse"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'card_label'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
$P -c "DELETE FROM ai_pending_changes WHERE action = 'card_label'"
$P -f $D/20261118120200_roles_db3_deck_card_jobs.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E3-62 rollback refuses while the jobs table holds rows', to_regclass('public.deck_card_jobs') IS NOT NULL AND (SELECT count(*) FROM deck_card_jobs) > 0, '')"
echo "== rollback with the explicit data-loss setting"
$P <<SQL
SET oracle.rollback_allow_data_loss = 'yes';
\i $D/20261118120200_roles_db3_deck_card_jobs.rollback.sql
SQL
$P <<'SQL'
SELECT t.chk('E3-63 rollback with the override: table and the six functions gone', to_regclass('public.deck_card_jobs') IS NULL AND to_regprocedure('public.owner_set_card_job(uuid,integer,uuid,text,text,text)') IS NULL AND to_regprocedure('public.get_deck_card_jobs(uuid,integer)') IS NULL
  AND to_regprocedure('public.deck_job_names(uuid,integer)') IS NULL AND to_regprocedure('public._job_canonical_name(uuid,integer,text)') IS NULL AND to_regprocedure('public.owner_decide_card_job(uuid,integer,uuid,text)') IS NULL AND to_regprocedure('public.owner_accept_job_proposals(uuid,integer,uuid)') IS NULL, '');
SELECT t.chk('E3-64 rollback restores the previous state exactly (every function, grant, constraint, table and trigger fingerprint equals the one taken after DB-2)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp2'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp2'));
SELECT t.age();
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', NULL, NULL, '{"name":"Engine"}')))->>'err' AS e \gset st_
SELECT t.chk('E3-65 after the rollback a job request is refused again (jobs_not_available) and writes nothing; role-only requests still work', :'st_e' = 'jobs_not_available'
  AND t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['stax_tax'])))#>>'{res,outcome}' = 'applied', :'st_e');
SQL
echo "== re-apply, use, and roll back with empty tables"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'card_label'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $D/20261118120200_roles_db3_deck_card_jobs.draft.sql
$P <<'SQL'
SELECT t.chk('E3-66 re-apply works and a role+job request applies and Claude can undo it', (SELECT t.und(t.gid(t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['recursion'], NULL, '{"name":"Engine"}')))), 'claude')#>>'{res,success}') = 'true', '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'card_label'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; DELETE FROM deck_card_jobs"
f $D/20261118120200_roles_db3_deck_card_jobs.rollback.sql
$P -c "SELECT t.chk('E3-67 rollback with empty tables and no job log rows needs no override and again restores the exact previous state', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp2'), '')"
$P -f $HERE/results.sql
