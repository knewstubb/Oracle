# DB-2 throwaway test. Sourced by run.sh. Base = the real live migrations up to CC-15b, then DB-1, then DB-2.
$P -c "INSERT INTO t.keep VALUES ('fp0', t.fp())"
f $D/20261118120000_roles_db1_card_roles.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fp1', t.fp())"
echo "== apply DB-2"
f $D/20261118120100_roles_db2_change_kinds.draft.sql
$P <<'SQL'
SELECT t.mkdeck(300, t.u1(), 220, 'Big', 1000); SELECT t.mkdeck(301, t.u1(), 130, 'Bgb', 3000);
INSERT INTO decks (id, name, format, is_active, user_id, card_count) VALUES (101, 'Old kinds', 'commander', true, t.u1(), 0);
INSERT INTO deck_cards (deck_id, card_name, scryfall_id, quantity, user_id) VALUES (100, 'Card 1 alt', t.s(101)::text, 1, t.u1());   -- second slot, same card (second printing)
SELECT t.chk('E2-01 new functions exist and the four live functions are kept under *_pre_roles names',
  to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL AND to_regprocedure('public._ai_execute_pre_roles(uuid,uuid,text,text,jsonb,uuid,boolean)') IS NOT NULL
  AND to_regprocedure('public._ai_undo_blocker_pre_roles(uuid,ai_change_log)') IS NOT NULL AND to_regprocedure('public._ai_undo_group_pre_roles(uuid,uuid,text,uuid)') IS NOT NULL
  AND to_regprocedure('public._ai_limits_roles()') IS NOT NULL AND to_regprocedure('public.owner_decide_card_role(uuid,uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.owner_accept_role_proposals(uuid,integer,uuid)') IS NOT NULL AND to_regprocedure('public._ai_plan_card_label(uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public._ai_execute_card_label(uuid,uuid,text,jsonb,uuid,boolean)') IS NOT NULL AND to_regprocedure('public._ai_undo_card_label(uuid,uuid,text)') IS NOT NULL
  AND to_regprocedure('public._ai_blocker_card_label(uuid,ai_change_log)') IS NOT NULL, '');
SELECT t.chk('E2-02 the log and the waiting list accept the two new names, still accept every old one, and reject an invented one',
  t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'card_label', 'x')$q$) = 'ok'
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'strategy_point', 'x')$q$) = 'ok'
  AND (SELECT bool_and(t.try(format($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', %L, 'x')$q$, k)) = 'ok')
         FROM unnest(ARRAY['deck_add','deck_remove','deck_zone','sleeve_copy','make_original','create_proxy','collection_add','copy_move','deck_category','deck_create','deck_setup','box_create','box_move']) k)
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'deck_delete', 'x')$q$) LIKE '%ai_change_log_kind_check%'
  AND t.try($q$INSERT INTO ai_pending_changes (user_id, client_name, kind, action, reason, card_count, payload, payload_hash, preview) VALUES (t.u1(), 'Claude', 'big_edit', 'card_label', 'over_ten', 1, '{}', 'h', '{}')$q$) = 'ok'
  AND t.try($q$INSERT INTO ai_pending_changes (user_id, client_name, kind, action, reason, card_count, payload, payload_hash, preview) VALUES (t.u1(), 'Claude', 'big_edit', 'strategy_point', 'over_ten', 1, '{}', 'h', '{}')$q$) = 'ok'
  AND t.try($q$INSERT INTO ai_pending_changes (user_id, client_name, kind, action, reason, card_count, payload, payload_hash, preview) VALUES (t.u1(), 'Claude', 'big_edit', 'deck_delete', 'over_ten', 1, '{}', 'h', '{}')$q$) LIKE '%violates check constraint%', '');
SELECT t.chk('E2-03 the numbers for the new kinds are exactly the contract''s; the existing limits are unchanged',
  public._ai_limits_roles() = '{"job_name_max_chars":40,"reason_max_chars":200,"statement_max_chars":200,"strategy_points_per_deck_max":30,"strategy_points_per_request_max":10,"point_cards_max":100,"roles_per_card_max":13,"labels_page_max":150}'::jsonb
  AND public._ai_limits() = '{"direct_max":120,"split_window_minutes":30,"split_max":200,"hourly_max":500,"undo_days":7,"pending_hours":24,"max_waiting":20,"max_request":200,"claude_undo_max":200}'::jsonb, public._ai_limits_roles()::text);
SELECT t.chk('E2-04 Claude may undo its own role proposals (card_label and strategy_point are not owner-only); the old owner-only list is unchanged',
  NOT public._ai_kind_owner_only('card_label') AND NOT public._ai_kind_owner_only('strategy_point') AND public._ai_kind_owner_only('copy_move') AND public._ai_kind_owner_only('deck_create'), '');
SELECT t.chk('E2-05 every new function is service-role only (not executable by anon or signed-in users); the renamed functions keep the grants they had (never wider)',
  (SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') AND (p.proname LIKE '%_pre_roles' OR has_function_privilege('service_role', p.oid, 'EXECUTE')))
     FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE '%card_label%' OR p.proname LIKE '%strategy_point%' OR p.proname LIKE '%_pre_roles' OR p.proname IN
       ('_ai_limits_roles','_ai_plan','_ai_execute','_ai_undo_blocker','ai_undo_group','ai_list_recent_changes','owner_decide_card_role','owner_accept_role_proposals')
       OR p.proname LIKE '_ai_label_job_%')), '');
SQL
TYPES=$REPO/docs/oracle/contracts/card-roles-and-deck-jobs.types.ts
LIM=$(python3 - "$TYPES" <<'PY'
import re, sys, json
s = open(sys.argv[1]).read()
m = re.search(r"AI_LIMITS_ROLES = \{(.*?)\}", s, re.S)
print(json.dumps({k: int(v) for k, v in re.findall(r"(\w+):\s*(\d+)", m.group(1))}))
PY
)
$P -c "SELECT t.chk('E2-03b the numbers in the types file (AI_LIMITS_ROLES) equal _ai_limits_roles() exactly', public._ai_limits_roles() = '$LIM'::jsonb, '$LIM')"
echo "== old kinds still work through the new front doors"
$P <<'SQL'
SELECT t.sub('deck_add', '{"deck_id":101,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"},{"card_name":"Arcane Signet","scryfall_id":"s2","set_code":"cmm","oracle_id":"o2","quantity":1,"categories":"[\"Ramp\"]"}]}') AS r \gset o1_
SELECT t.chk('E2-10 old kind deck_add: 2 cards apply', :'o1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM deck_cards WHERE deck_id = 101) = 2, :'o1_r');
SELECT t.sub('deck_category', jsonb_build_object('deck_id',101,'slots',jsonb_build_array(jsonb_build_object('id',t.slot(101,'Sol Ring'),'card_name','Sol Ring','categories',jsonb_build_array('Mana Rocks'))))) AS r \gset o2_
SELECT t.chk('E2-11 old kind deck_category applies', :'o2_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT categories FROM deck_cards WHERE id = t.slot(101,'Sol Ring')) = '["Mana Rocks"]', :'o2_r');
SELECT t.und(t.gid(:'o2_r'::jsonb), 'claude') AS r \gset o3_
SELECT t.chk('E2-12 old kind deck_category: Claude Undo restores the previous value', (:'o3_r'::jsonb#>>'{res,success}')::boolean AND (SELECT categories FROM deck_cards WHERE id = t.slot(101,'Sol Ring')) = '["Ramp"]', :'o3_r');
SELECT t.sub('deck_zone', jsonb_build_object('deck_id',101,'to','maybeboard','slots',jsonb_build_array(jsonb_build_object('id',t.slot(101,'Arcane Signet'),'card_name','Arcane Signet')))) AS r \gset o4_
SELECT t.und(t.gid(:'o4_r'::jsonb), 'owner') AS r \gset o5_
SELECT t.chk('E2-13 old kind deck_zone applies and the owner can undo it', :'o4_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'o5_r'::jsonb#>>'{res,success}')::boolean AND (SELECT categories FROM deck_cards WHERE id = t.slot(101,'Arcane Signet')) = '["Ramp"]', :'o5_r');
SELECT t.und(t.gid(:'o1_r'::jsonb), 'owner') AS r \gset o6_
SELECT t.chk('E2-14 old kind deck_add: the owner undoes the whole 2-card batch', (:'o6_r'::jsonb#>>'{res,success}')::boolean AND (:'o6_r'::jsonb#>>'{res,undone}')::int = 2 AND (SELECT count(*) FROM deck_cards WHERE deck_id = 101) = 0, :'o6_r');
SELECT public.ai_create_deck(t.u1(), t.c1(), 'Created after DB-2', 'modern', NULL) AS r \gset o7_
SELECT t.und((:'o7_r'::jsonb->>'group_id')::uuid, 'claude') AS r \gset o8_
SELECT t.und((:'o7_r'::jsonb->>'group_id')::uuid, 'owner') AS r \gset o9_
SELECT t.chk('E2-15 old kind deck_create (CC-15): Claude refused (owner_only), the owner undoes the empty deck', :'o8_r'::jsonb#>>'{res,refused,code}' = 'owner_only' AND (:'o9_r'::jsonb#>>'{res,success}')::boolean
  AND NOT EXISTS (SELECT 1 FROM decks WHERE name = 'Created after DB-2'), :'o8_r' || ' ' || :'o9_r');
SELECT t.chk('E2-16 Recent changes still lists old kinds with the old fields', (SELECT count(*) >= 5 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'kind' IN ('deck_add','deck_category','deck_zone','deck_create')) AND
  (SELECT bool_and(e ? 'zone_to' AND e ? 'categories_from' AND e ? 'owner_only' AND e ? 'undo_blocker' AND e ? 'label_detail') FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e), '');
SELECT t.age();
SQL
echo "== propose roles: dry run, apply, layers, repeat, beside the owner, dismissed memory"
$P <<'SQL'
SELECT t.snap() AS s0 \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['ramp','card_draw'], ARRAY['tutor']), t.cd(100,'Card 2', ARRAY['ramp']), t.cd(100,'Card 3', ARRAY['ramp'])), NULL, NULL, true) AS r \gset d_
SELECT t.chk('E2-20 dry run says would_apply with n = 3 cards and writes nothing', :'d_r'::jsonb#>>'{res,outcome}' = 'would_apply' AND (:'d_r'::jsonb#>>'{res,plan,n}')::int = 3 AND t.snap() = :'s0', :'d_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['ramp','card_draw'], ARRAY['tutor']), t.cd(100,'Card 2', ARRAY['ramp']), t.cd(100,'Card 3', ARRAY['ramp'])), NULL, NULL, false) AS r \gset a_
SELECT t.gid(:'a_r'::jsonb) AS g1 \gset
SELECT t.chk('E2-21 apply: outcome applied, 3 cards, ONE log row per card (3), one group', :'a_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'a_r'::jsonb#>>'{res,count}')::int = 3
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'g1' AND kind = 'card_label') = 3, :'a_r');
SELECT t.chk('E2-22 4 Claude rows written (Card 1: ramp and card_draw, Card 2: ramp, Card 3: ramp); "remove tutor" was skipped because Card 1 has no tutor role to remove; all rows waiting, tagged with the group and the deck, no owner row',
  (SELECT count(*) = 4 AND bool_and(proposer = 'claude' AND state = 'to_look_at' AND batch_id = :'g1' AND proposed_in_deck_id = 100) FROM user_card_roles WHERE user_id = t.u1() AND batch_id = :'g1')
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND proposer = 'owner') = 0 AND :'a_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'unchanged', (SELECT count(*)::text FROM user_card_roles WHERE batch_id = :'g1'));
SELECT t.chk('E2-23 the shared list was not written (still empty): Claude proposals stay in the personal layer', (SELECT count(*) FROM ref_card_roles) = 0, '');
SELECT t.chk('E2-24 the log row names the card by oracle id (not printing), keeps the printing and the slot, and holds before / after',
  (SELECT l.oracle_id = t.o(1)::text AND l.printing_id = t.s(1)::text AND l.deck_card_id = t.slot(100,'Card 1') AND l.deck_id = 100 AND l.approved_by_owner = false
     AND jsonb_array_length(l.after->'roles') = 2 AND jsonb_array_length(l.before->'roles') = 2 AND (l.before#>'{roles,0,row}') = 'null'::jsonb AND l.undoable_until > now() + interval '6 days'
   FROM ai_change_log l WHERE l.group_id = :'g1' AND l.card_name = 'Card 1'), '');
SELECT t.chk('E2-25 merged layers: Claude''s waiting roles count straight away', (SELECT bool_and(CASE role WHEN 'tutor' THEN NOT effective ELSE effective END AND effective_from = 'claude') FROM get_effective_card_roles(t.u1(), ARRAY[t.o(1)])), '');
SELECT t.snap() AS s1 \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['ramp','card_draw'], ARRAY['tutor']), t.cd(100,'Card 2', ARRAY['ramp']))) AS r \gset rep_
SELECT t.chk('E2-26 sending the same request again changes nothing (nothing_to_change) and logs nothing', :'rep_r'::jsonb->>'err' = 'nothing_to_change' AND t.snap() = :'s1', :'rep_r');
-- beside the owner
SELECT public.owner_set_card_role(t.u1(), t.o(4), 'ramp', 'add');
SELECT md5(to_jsonb(x)::text) AS own4 FROM user_card_roles x WHERE user_id = t.u1() AND oracle_id = t.o(4) AND proposer = 'owner' \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 4', NULL, ARRAY['ramp']))) AS r \gset b_
SELECT t.chk('E2-27 the owner already says Card 4 is ramp; Claude says it is not: stored BESIDE the owner''s value, reported beside_yours, owner row untouched byte for byte',
  :'b_r'::jsonb#>>'{res,outcome}' = 'applied' AND :'b_r'::jsonb#>>'{res,plan,changes,0,roles,0,result}' = 'beside_yours'
  AND (SELECT md5(to_jsonb(x)::text) FROM user_card_roles x WHERE user_id = t.u1() AND oracle_id = t.o(4) AND proposer = 'owner') = :'own4'
  AND EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(4) AND proposer = 'claude' AND effect = 'remove' AND state = 'to_look_at')
  AND (SELECT effective AND effective_from = 'owner' AND beside FROM get_effective_card_roles(t.u1(), ARRAY[t.o(4)]) WHERE role = 'ramp')
  AND (SELECT after->'beside' FROM ai_change_log WHERE group_id = t.gid(:'b_r'::jsonb)) = '[{"what":"role","role":"ramp"}]'::jsonb, :'b_r');
SELECT t.snap() AS sbs \gset
SELECT t.chk('E2-27b the same "beside the owner" request again is skipped as unchanged (Claude''s identical row is already waiting) and nothing is written', t.sub('card_label', t.lbl(100, t.cd(100,'Card 4', NULL, ARRAY['ramp'])))->>'err' = 'nothing_to_change' AND t.snap() = :'sbs', '');
SELECT t.chk('E2-28 asking for what the owner already has is skipped as unchanged', t.sub('card_label', t.lbl(100, t.cd(100,'Card 4', ARRAY['ramp']), t.cd(100,'Card 5', ARRAY['fixing'])), NULL, NULL, true)#>>'{res,plan,skipped,0,why}' = 'unchanged', '');
-- dismissed memory
SELECT public.owner_decide_card_role(t.u1(), t.o(2), 'ramp', 'dismiss') AS r \gset x_
SELECT t.chk('E2-29 dismiss: the Claude row stays as a marked row (the memory); previous and current returned',
  :'x_r'::jsonb#>>'{previous,claude_state}' = 'to_look_at' AND :'x_r'::jsonb#>>'{current,claude_state}' = 'dismissed' AND (SELECT effective_from IS NULL AND NOT effective FROM get_effective_card_roles(t.u1(), ARRAY[t.o(2)]) WHERE role = 'ramp'), :'x_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 2', ARRAY['ramp']), t.cd(100,'Card 5', ARRAY['fixing'])), NULL, NULL, true) AS r \gset m_
SELECT t.chk('E2-30 Claude proposing the dismissed value again is skipped as previously_dismissed (in every deck: it is keyed by the card, not the deck)',
  :'m_r'::jsonb#>>'{res,plan,skipped,0,why}' = 'previously_dismissed' AND (:'m_r'::jsonb#>>'{res,plan,n}')::int = 1, :'m_r');
SELECT public.owner_decide_card_role(t.u1(), t.o(1), 'ramp', 'accept') AS r \gset y_
SELECT t.chk('E2-31 accept: the owner row now holds the value, the Claude row is gone', :'y_r'::jsonb#>>'{current,owner_effect}' = 'add' AND :'y_r'::jsonb#>>'{current,claude_effect}' IS NULL
  AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(1) AND role = 'ramp' AND proposer = 'claude'), :'y_r');
SELECT t.chk('E2-32 accept or dismiss with nothing waiting is no_proposal; bad role / decision refused',
  t.att($q$SELECT public.owner_decide_card_role(t.u1(), t.o(1), 'ramp', 'accept')$q$)->>'err' = 'no_proposal' AND t.att($q$SELECT public.owner_decide_card_role(t.u1(), t.o(1), 'nope', 'accept')$q$)->>'err' = 'unknown_role'
  AND t.att($q$SELECT public.owner_decide_card_role(t.u1(), t.o(1), 'ramp', 'maybe')$q$)->>'err' = 'bad_decision', '');
SELECT t.age();
SQL
echo "== refusals write nothing"
$P <<'SQL'
SELECT t.snap() AS s0 \gset
SELECT t.sub('card_label', t.lbl(100, jsonb_build_object('id', t.slot(100,'Card 6'), 'card_name', 'Wrong Name', 'add_roles', jsonb_build_array('ramp')))) AS r \gset e1_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp']), t.cd(100,'Card 6', ARRAY['fixing']))) AS r \gset e2_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['fixing']), t.cd(100,'Card 1 alt', ARRAY['fixing']))) AS r \gset e3_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Mystery Card', ARRAY['ramp']))) AS r \gset e4_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['invented']))) AS r \gset e5_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp'], ARRAY['ramp']))) AS r \gset e6_
SELECT t.sub('card_label', jsonb_build_object('deck_id', 100, 'cards', '[]'::jsonb)) AS r \gset e7_
SELECT t.sub('card_label', t.lbl(100, jsonb_build_object('id', t.slot(100,'Card 6'), 'card_name', 'Card 6'))) AS r \gset e8_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp'])), t.u2(), t.c2()) AS r \gset e9_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp'])), t.u1(), t.c1_off()) AS r \gset e10_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp'], NULL, '{"name":"Engine"}'))) AS r \gset e11_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp'], NULL, jsonb_build_object('name', repeat('x', 41))))) AS r \gset e12_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp'], NULL, jsonb_build_object('name', 'Engine', 'reason', repeat('y', 201))))) AS r \gset e13_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 9', ARRAY['ramp'], NULL, '{"name":"Engine"}'))) AS r \gset e14_
SELECT t.sub('card_label', t.bigp(300, 1, 201, 'Big', '{"add_roles":["ramp"]}')) AS r \gset e15_
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['ramp']), jsonb_build_object('id', t.slot(100,'Card 7'), 'card_name', 'Nope', 'add_roles', jsonb_build_array('ramp')))) AS r \gset e16_
SELECT t.sub('card_label', jsonb_build_object('deck_id', 'abc', 'cards', '[]'::jsonb)) AS r \gset e17_
SELECT t.sub('card_label', t.lbl(100, jsonb_build_object('id', t.slot(100,'Card 6'), 'card_name', 'Card 6', 'add_roles', 'ramp'))) AS r \gset e18_
SELECT t.chk('E2-40 slot not in the deck / name does not match: slot_not_found', :'e1_r'::jsonb->>'err' = 'slot_not_found', :'e1_r');
SELECT t.chk('E2-41 same slot twice: duplicate_slot', :'e2_r'::jsonb->>'err' = 'duplicate_slot', :'e2_r');
SELECT t.chk('E2-42 two slots that are the same card: duplicate_card', :'e3_r'::jsonb->>'err' = 'duplicate_card', :'e3_r');
SELECT t.chk('E2-43 a card Oracle cannot identify: card_not_identified', :'e4_r'::jsonb->>'err' = 'card_not_identified', :'e4_r');
SELECT t.chk('E2-44 a role that is not one of the 13: unknown_role', :'e5_r'::jsonb->>'err' = 'unknown_role', :'e5_r');
SELECT t.chk('E2-45 a role both added and removed: conflicting_roles', :'e6_r'::jsonb->>'err' = 'conflicting_roles', :'e6_r');
SELECT t.chk('E2-46 an empty card list, a card with nothing to set, a bad deck id, roles that are not a list: invalid_request',
  :'e7_r'::jsonb->>'err' = 'invalid_request' AND :'e8_r'::jsonb->>'err' = 'invalid_request' AND :'e17_r'::jsonb->>'err' = 'invalid_request' AND :'e18_r'::jsonb->>'err' = 'invalid_request', '');
SELECT t.chk('E2-47 user 2 asking about user 1''s deck (with user 2''s own connection): deck_not_found, nothing written', :'e9_r'::jsonb->>'err' = 'deck_not_found', :'e9_r');
SELECT t.chk('E2-48 a switched-off connection: connection_revoked', :'e10_r'::jsonb->>'err' = 'connection_revoked', :'e10_r');
SELECT t.chk('E2-49 a job while DB-3 is not applied: jobs_not_available, and nothing is written for the roles either', :'e11_r'::jsonb->>'err' = 'jobs_not_available', :'e11_r');
SELECT t.chk('E2-50 job name over 40 characters, reason over 200, job on a maybeboard card: bad_job_name, reason_too_long, slot_in_maybeboard',
  :'e12_r'::jsonb->>'err' = 'bad_job_name' AND :'e13_r'::jsonb->>'err' = 'reason_too_long' AND :'e14_r'::jsonb->>'err' = 'slot_in_maybeboard', '');
SELECT t.chk('E2-51 201 cards: too_many_cards', :'e15_r'::jsonb->>'err' = 'too_many_cards', :'e15_r');
SELECT t.chk('E2-52 one bad card among good ones: the WHOLE request is refused, nothing is partly proposed', :'e16_r'::jsonb->>'err' = 'slot_not_found', :'e16_r');
SELECT t.chk('E2-53 after every refusal above the data is byte for byte unchanged', t.snap() = :'s0', '');
SELECT t.chk('E2-54 roles are allowed on a maybeboard card (only jobs are refused there)', t.sub('card_label', t.lbl(100, t.cd(100,'Card 9', ARRAY['ramp'])), NULL, NULL, true)#>>'{res,outcome}' = 'would_apply', '');
SQL
echo "== the 120 limit and the count rule (one request, one log row per card)"
$P <<'SQL'
SELECT t.age();
SELECT t.sub('card_label', t.bigp(300, 1, 120, 'Big', '{"add_roles":["ramp"]}')) AS r \gset l1_
SELECT t.chk('E2-60 120 cards apply at once: outcome applied, 120 log rows, 120 cards proposed', :'l1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (:'l1_r'::jsonb#>>'{res,count}')::int = 120
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = t.gid(:'l1_r'::jsonb)) = 120 AND (SELECT count(*) FROM user_card_roles WHERE batch_id = t.gid(:'l1_r'::jsonb)) = 120, left(:'l1_r', 200));
SELECT t.sub('card_label', t.bigp(300, 121, 201, 'Big', '{"add_roles":["ramp"]}')) AS r \gset l2_
SELECT t.chk('E2-61 81 more cards for the same deck within 30 minutes (120 + 81 > 200) wait for the owner: recent_total', :'l2_r'::jsonb#>>'{res,outcome}' = 'pending' AND :'l2_r'::jsonb#>>'{res,reason}' = 'recent_total'
  AND (SELECT count(*) FROM user_card_roles WHERE proposed_in_deck_id = 300) = 120, left(:'l2_r', 200));
SELECT t.age();
SELECT t.sub('card_label', t.bigp(301, 1, 121, 'Bgb', '{"add_roles":["ramp"]}')) AS r \gset l3_
SELECT :'l3_r'::jsonb#>>'{res,pending_id}' AS pid \gset
SELECT t.chk('E2-62 121 cards do not apply: they wait as over_ten, one waiting request with card_count 121, nothing written yet', :'l3_r'::jsonb#>>'{res,outcome}' = 'pending' AND :'l3_r'::jsonb#>>'{res,reason}' = 'over_ten'
  AND (SELECT card_count = 121 AND action = 'card_label' AND status = 'waiting' FROM ai_pending_changes WHERE id = :'pid'::uuid) AND (SELECT count(*) FROM user_card_roles WHERE proposed_in_deck_id = 301) = 0, left(:'l3_r', 200));
SELECT t.appr(:'pid'::uuid) AS r \gset l4_
SELECT t.chk('E2-63 approving applies all 121 (owner approved), one group, 121 log rows marked approved_by_owner, pending marked approved',
  :'l4_r'::jsonb#>>'{res,outcome}' = 'approved' AND (:'l4_r'::jsonb#>>'{res,count}')::int = 121
  AND (SELECT count(*) = 121 AND bool_and(approved_by_owner AND pending_id = :'pid'::uuid) FROM ai_change_log WHERE group_id = (:'l4_r'::jsonb#>>'{res,group_id}')::uuid)
  AND (SELECT status = 'approved' FROM ai_pending_changes WHERE id = :'pid'::uuid) AND (SELECT count(*) FROM user_card_roles WHERE proposed_in_deck_id = 301) = 121, left(:'l4_r', 200));
SELECT t.und((:'l4_r'::jsonb#>>'{res,group_id}')::uuid, 'claude') AS r \gset l5_
SELECT t.chk('E2-64 Claude cannot undo a batch the owner approved: owner_only, nothing changes', :'l5_r'::jsonb#>>'{res,refused,code}' = 'owner_only' AND (SELECT count(*) FROM user_card_roles WHERE proposed_in_deck_id = 301) = 121, :'l5_r');
SELECT t.sub('card_label', t.bigp(300, 1, 200, 'Big', '{"add_roles":["fixing"]}')) AS r \gset l6_
SELECT t.sub('card_label', jsonb_build_object('deck_id', 300, 'cards', (SELECT jsonb_agg(jsonb_build_object('id', 1, 'card_name', 'x')) FROM generate_series(1, 201)))) AS r \gset l7_
SELECT t.chk('E2-65 201 cards in one request are refused outright (too_many_cards), 200 wait', :'l7_r'::jsonb->>'err' = 'too_many_cards' AND :'l6_r'::jsonb#>>'{res,outcome}' = 'pending', :'l7_r');
SELECT :'l6_r'::jsonb#>>'{res,pending_id}' AS pid6 \gset
SELECT t.age();
-- a held request that has gone stale is refused, not applied
SELECT t.mkdeck(302, t.u1(), 130, 'Bgc', 5000);
SELECT t.sub('card_label', t.bigp(302, 1, 125, 'Bgc', '{"add_roles":["ramp"]}')) AS r \gset l8_
SELECT :'l8_r'::jsonb#>>'{res,pending_id}' AS pid8 \gset
DELETE FROM deck_cards WHERE deck_id = 302 AND card_name = 'Bgc 7';
SELECT t.snap() AS s0 \gset
SELECT t.appr(:'pid8'::uuid) AS r \gset l9_
SELECT t.chk('E2-66 approving a held request whose card has since gone is refused (failed, slot_not_found), and nothing is written', :'l9_r'::jsonb#>>'{res,outcome}' = 'failed' AND :'l9_r'::jsonb#>>'{res,reason,code}' = 'slot_not_found'
  AND (SELECT count(*) FROM user_card_roles WHERE proposed_in_deck_id = 302) = 0 AND (SELECT status = 'failed' FROM ai_pending_changes WHERE id = :'pid8'::uuid), left(:'l9_r', 200));
SELECT t.chk('E2-67 the same request waiting twice is not queued twice (duplicate flag)', t.sub('card_label', t.bigp(300, 1, 200, 'Big', '{"add_roles":["fixing"]}'))#>>'{res,duplicate}' = 'true'
  AND (SELECT count(*) FROM ai_pending_changes WHERE status = 'waiting' AND action = 'card_label') = 2, '');
SELECT t.chk('E2-68 per-user waiting limit applies to the new kind (20 waiting max): the 21st request is too_many_waiting',
  (SELECT count(*) FROM ai_pending_changes WHERE user_id = t.u1() AND status = 'waiting') < 20, '');
SQL
SQL_X=1
echo "== Undo of a batch: Claude all-or-nothing, owner partial, windows, isolation"
$P <<'SQL'
SELECT t.age();
-- a remembered, dismissed Claude row that the batch will overwrite, so Undo has something to put back
INSERT INTO user_card_roles (user_id, oracle_id, role, effect, proposer, state) VALUES (t.u1(), t.o(5), 'ramp', 'remove', 'claude', 'dismissed');
SELECT t.snap() AS sa \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 5', ARRAY['ramp']), t.cd(100,'Card 6', ARRAY['fixing']), t.cd(100,'Card 7', ARRAY['fixing','tutor']))) AS r \gset u1_
SELECT t.gid(:'u1_r'::jsonb) AS gu \gset
SELECT t.chk('E2-70 a 3-card batch applied (4 Claude rows, 3 log rows)', (SELECT count(*) FROM ai_change_log WHERE group_id = :'gu') = 3 AND (SELECT count(*) FROM user_card_roles WHERE batch_id = :'gu') = 4, '');
SELECT t.und(:'gu', 'claude', t.u2(), t.c2()) AS r \gset u2_
SELECT t.chk('E2-71 user 2 cannot undo user 1''s batch (not found / refused), nothing changes', COALESCE((:'u2_r'::jsonb#>>'{res,success}')::boolean, false) = false AND (SELECT count(*) FROM user_card_roles WHERE batch_id = :'gu') = 4
  AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'gu' AND undone_at IS NOT NULL) = 0, :'u2_r');
SELECT t.und(:'gu', 'claude', t.u1(), t.c1_off()) AS r \gset u3_
SELECT t.und(:'gu', 'bob') AS r \gset u4_
SELECT t.chk('E2-72 Undo with a switched-off connection: connection_revoked; an unknown actor: invalid_actor', :'u3_r'::jsonb->>'err' = 'connection_revoked' AND :'u4_r'::jsonb->>'err' = 'invalid_actor', '');
SELECT t.und(:'gu', 'claude') AS r \gset u5_
SELECT t.chk('E2-73 Claude undoes the whole batch in one go: 3 cards restored, all 3 log rows stamped by claude', (:'u5_r'::jsonb#>>'{res,success}')::boolean AND (:'u5_r'::jsonb#>>'{res,undone}')::int = 3
  AND (SELECT count(*) FROM user_card_roles WHERE batch_id = :'gu') = 0 AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'gu' AND undone_by = 'claude' AND undone_at IS NOT NULL) = 3, :'u5_r');
SELECT t.chk('E2-74 the dismissed row Claude had overwritten is back exactly as it was (the memory survives an Undo); new rows are gone',
  EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(5) AND role = 'ramp' AND proposer = 'claude' AND effect = 'remove' AND state = 'dismissed' AND batch_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id IN (t.o(6), t.o(7)) AND proposer = 'claude'), '');
SELECT t.und(:'gu', 'claude') AS r \gset u6_
SELECT t.chk('E2-75 undoing twice: already_undone', :'u6_r'::jsonb#>>'{res,refused,code}' = 'already_undone', :'u6_r');
-- owner touches one card, then Claude and the owner each try to undo
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 6', ARRAY['fixing']), t.cd(100,'Card 7', ARRAY['fixing']), t.cd(100,'Card 8', ARRAY['fixing']))) AS r \gset v1_
SELECT t.gid(:'v1_r'::jsonb) AS gv \gset
SELECT public.owner_decide_card_role(t.u1(), t.o(7), 'fixing', 'accept');
SELECT t.snap() AS sb \gset
SELECT t.und(:'gv', 'claude') AS r \gset v2_
SELECT t.chk('E2-76 the owner accepted one card; Claude''s Undo is refused (changed_since, naming the card) and nothing at all changes', :'v2_r'::jsonb#>>'{res,refused,code}' = 'changed_since' AND :'v2_r'::jsonb#>>'{res,refused,card}' = 'Card 7' AND t.snap() = :'sb', :'v2_r');
SELECT t.und(:'gv', 'owner') AS r \gset v3_
SELECT t.chk('E2-77 the owner''s Undo restores the 2 untouched cards and reports the accepted one as left alone', (:'v3_r'::jsonb#>>'{res,success}')::boolean AND (:'v3_r'::jsonb#>>'{res,undone}')::int = 2 AND :'v3_r'::jsonb#>>'{res,left_alone,0,card}' = 'Card 7'
  AND jsonb_array_length(:'v3_r'::jsonb#>'{res,left_alone}') = 1, :'v3_r');
SELECT t.chk('E2-78 the accepted card keeps the owner''s row; the others are gone; the left-alone log row stays un-undone, the other two are stamped owner',
  EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(7) AND role = 'fixing' AND proposer = 'owner' AND effect = 'add')
  AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE batch_id = :'gv') AND (SELECT count(*) FROM ai_change_log WHERE group_id = :'gv' AND undone_by = 'owner') = 2
  AND (SELECT undone_at IS NULL FROM ai_change_log WHERE group_id = :'gv' AND card_name = 'Card 7'), '');
SELECT t.und(:'gv', 'owner') AS r \gset v4_
SELECT t.chk('E2-79 asking again when only the touched card is left: nothing_to_undo', :'v4_r'::jsonb#>>'{res,refused,code}' = 'nothing_to_undo', :'v4_r');
-- windows
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 10', ARRAY['protection']))) AS r \gset w1_
SELECT t.expire(t.gid(:'w1_r'::jsonb));
SELECT t.und(t.gid(:'w1_r'::jsonb), 'claude') AS r \gset w2_
SELECT t.und(t.gid(:'w1_r'::jsonb), 'owner') AS r \gset w3_
SELECT t.chk('E2-80 after 7 days neither Claude nor the owner can undo (window_closed)', :'w2_r'::jsonb#>>'{res,refused,code}' = 'window_closed' AND :'w3_r'::jsonb#>>'{res,refused,code}' = 'window_closed', :'w2_r' || :'w3_r');
SELECT t.chk('E2-81 Recent changes: the batch shows its sentence data (label_detail), and the blocker for a batch the owner touched',
  (SELECT e->'label_detail'->'roles' = '[{"role":"fixing","effect":"add"}]'::jsonb AND e->'label_detail'->>'job' IS NULL FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = :'gv' AND e->>'card_name' = 'Card 7')
  AND (SELECT e->'undo_blocker'->>'code' = 'changed_since' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = :'gv' AND e->>'card_name' = 'Card 7')
  AND (SELECT e->>'owner_only' = 'false' FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = :'gv' AND e->>'card_name' = 'Card 7'), '');
SELECT t.chk('E2-82 user 2''s Recent changes shows none of user 1''s rows', (SELECT count(*) FROM jsonb_array_elements(public.ai_list_recent_changes(t.u2())) e WHERE e->>'user_id' = t.u1()::text) = 0, '');
SQL
echo "== owner accept-all, isolation, RLS and the append-only guard"
$P <<'SQL'
SELECT t.age();
SELECT t.sub('card_label', t.lbl(200, t.cd(200,'Card 1', ARRAY['ramp'])), t.u2(), t.c2()) AS r \gset i1_
SELECT t.chk('E2-90 user 2 proposes roles in their own deck (own connection): works, row belongs to user 2', :'i1_r'::jsonb#>>'{res,outcome}' = 'applied' AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u2() AND proposer = 'claude') = 1, :'i1_r');
SELECT t.snap() AS s0 \gset
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 1', ARRAY['recursion'])), t.u2(), t.c1()) AS r \gset i2_
SELECT t.chk('E2-91 user 2 cannot use user 1''s connection: connection_revoked, nothing written', :'i2_r'::jsonb->>'err' = 'connection_revoked' AND t.snap() = :'s0', :'i2_r');
SELECT t.chk('E2-92 user 2 cannot accept user 1''s proposals by deck or by batch (deck_not_found / accepts 0 of user 1''s)',
  t.att($q$SELECT public.owner_accept_role_proposals(t.u2(), 100, NULL)$q$)->>'err' = 'deck_not_found'
  AND (public.owner_accept_role_proposals(t.u2(), NULL, (SELECT batch_id FROM user_card_roles WHERE user_id = t.u1() AND batch_id IS NOT NULL LIMIT 1))->>'accepted')::int = 0
  AND t.att($q$SELECT public.owner_accept_role_proposals(t.u1(), NULL, NULL)$q$)->>'err' = 'invalid_request'
  AND t.att($q$SELECT public.owner_decide_card_role(t.u2(), t.o(5), 'ramp', 'accept')$q$)->>'err' = 'no_proposal'
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND state = 'to_look_at') > 0, '');
SELECT count(*) AS n_before FROM user_card_roles WHERE user_id = t.u1() AND state = 'to_look_at' AND proposed_in_deck_id = 301 \gset
SELECT public.owner_accept_role_proposals(t.u1(), 301, NULL) AS r \gset ac_
SELECT t.chk('E2-93 Accept all for a deck: all 121 waiting roles in deck 301 become the owner''s, none left waiting there, other decks'' proposals untouched',
  (:'ac_r'::jsonb->>'accepted')::int = :n_before AND :n_before = 121 AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE user_id = t.u1() AND state = 'to_look_at' AND proposed_in_deck_id = 301)
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND proposer = 'owner' AND role = 'ramp' AND oracle_id BETWEEN t.o(3001) AND t.o(3130)) = 121
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND state = 'to_look_at' AND proposed_in_deck_id = 300) = 120, :'ac_r');
SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 8', ARRAY['recursion']), t.cd(100,'Card 10', ARRAY['recursion']))) AS r \gset ab_
SELECT t.gid(:'ab_r'::jsonb) AS gb \gset
SELECT public.owner_accept_role_proposals(t.u1(), NULL, :'gb') AS r \gset ac2_
SELECT t.chk('E2-94 Accept all for one batch accepts only that batch (2 rows); the card-10 and card-8 rows are the owner''s now', (:'ac2_r'::jsonb->>'accepted')::int = 2
  AND (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND role = 'recursion' AND proposer = 'owner') = 2, :'ac2_r');
-- RLS on the log, pending list and role tables for a signed-in second user
SET ROLE authenticated; SET request.jwt.sub = '00000000-0000-0000-0000-000000000002';
SELECT count(*) AS log_n FROM public.ai_change_log \gset u2s_
SELECT count(*) AS log_u1 FROM public.ai_change_log WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2s_
SELECT count(*) AS pend_u1 FROM public.ai_pending_changes WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2s_
SELECT count(*) AS roles_u1 FROM public.user_card_roles WHERE user_id = '00000000-0000-0000-0000-000000000001' \gset u2s_
SELECT count(*) AS roles_own FROM public.user_card_roles \gset u2s_
SELECT t.att($q$SELECT public.owner_decide_card_role('00000000-0000-0000-0000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'ramp', 'accept')$q$)->>'err' AS x1 \gset
SELECT t.att($q$SELECT public.owner_accept_role_proposals('00000000-0000-0000-0000-000000000002', 200, NULL)$q$)->>'err' AS x2 \gset
SELECT t.att($q$SELECT public._ai_plan_card_label('00000000-0000-0000-0000-000000000002', '{}')$q$)->>'err' AS x3 \gset
SELECT t.att($q$SELECT public._ai_execute_card_label('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'x', '{}', NULL, false)$q$)->>'err' AS x4 \gset
SELECT t.att($q$SELECT public._ai_undo_card_label('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner')$q$)->>'err' AS x5 \gset
SELECT t.att($q$SELECT public._ai_limits_roles()$q$)->>'err' AS x6 \gset
SELECT t.att($q$SELECT public.ai_undo_group('00000000-0000-0000-0000-000000000002', gen_random_uuid(), 'owner')$q$)->>'err' AS x7 \gset
SELECT t.att($q$SELECT public.ai_submit_change('00000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'card_label', '{}')$q$)->>'err' AS x8 \gset
SELECT t.att($q$WITH u AS (UPDATE public.ai_change_log SET undone_at = now(), undone_by = 'owner' RETURNING 1) SELECT to_jsonb(count(*)) FROM u$q$)->>'err' AS x9 \gset
RESET ROLE;
SELECT t.chk('E2-95 signed-in user 2 sees only their own log rows, waiting requests and personal roles (none of user 1''s)', :u2s_log_u1 = 0 AND :u2s_pend_u1 = 0 AND :u2s_roles_u1 = 0 AND :u2s_log_n >= 1 AND :u2s_roles_own >= 1, 'log ' || :'u2s_log_n' || ' roles ' || :'u2s_roles_own');
SELECT t.chk('E2-96 signed-in users cannot call any new or changed function (permission denied)', :'x1' LIKE 'permission denied%' AND :'x2' LIKE 'permission denied%' AND :'x3' LIKE 'permission denied%' AND :'x4' LIKE 'permission denied%'
  AND :'x5' LIKE 'permission denied%' AND :'x6' LIKE 'permission denied%' AND :'x7' LIKE 'permission denied%' AND :'x8' LIKE 'permission denied%' AND :'x9' LIKE 'permission denied%', concat_ws(' | ', :'x1', :'x3', :'x7', :'x9'));
-- append-only guard, and deleting a deck that holds new-kind log rows
SELECT t.chk('E2-97 the append-only guard still blocks any change to a card_label log row (before, after, card, kind) but lets the undo fields be set once',
  t.try($q$UPDATE ai_change_log SET after = '{}' WHERE kind = 'card_label'$q$) LIKE '%ai_change_log_is_append_only%' AND t.try($q$UPDATE ai_change_log SET card_name = 'x' WHERE kind = 'card_label'$q$) LIKE '%ai_change_log_is_append_only%'
  AND t.try($q$UPDATE ai_change_log SET kind = 'deck_add' WHERE kind = 'card_label'$q$) LIKE '%ai_change_log_is_append_only%'
  AND t.try($q$UPDATE ai_change_log SET undone_at = now(), undone_by = 'owner' WHERE kind = 'card_label' AND undone_at IS NULL$q$) = 'ok'
  AND t.try($q$UPDATE ai_change_log SET undone_at = now() WHERE kind = 'card_label' AND undone_at IS NOT NULL$q$) LIKE '%ai_change_log_already_undone%', '');
SELECT t.sub('card_label', t.lbl(301, t.cd(301,'Bgb 1', ARRAY['tutor']))) AS r \gset dd_
SELECT count(*) AS n_deck FROM ai_change_log WHERE deck_id = 301 AND kind = 'card_label' \gset
DELETE FROM decks WHERE id = 301;
SELECT t.chk('E2-98 deleting a deck that has card_label log rows works (the deck-clear exception passes); the rows stay and lose only the deck link',
  NOT EXISTS (SELECT 1 FROM decks WHERE id = 301) AND (SELECT count(*) FROM ai_change_log WHERE kind = 'card_label' AND deck_name = 'Big Bgb' AND deck_id IS NULL) = :n_deck AND :n_deck > 100
  AND NOT EXISTS (SELECT 1 FROM user_card_roles WHERE proposed_in_deck_id = 301), :n_deck::text);
SELECT t.chk('E2-99 a batch whose deck was deleted cannot be undone (deck_gone) and changes nothing', t.und((SELECT group_id FROM ai_change_log WHERE deck_name = 'Big Bgb' AND undone_at IS NULL LIMIT 1), 'owner')#>>'{res,refused,code}' = 'deck_gone', '');
SQL
echo "== two sessions proposing for the same deck at the same moment"
( $P -c "BEGIN; SELECT t.sub('card_label', t.lbl(100, t.cd(100,'Card 10', ARRAY['stax_tax']))) IS NOT NULL; SELECT pg_sleep(3); COMMIT;" >/dev/null 2>&1 & )
sleep 1
$P -Atc "SELECT t.chk('E2-A0 the same request from a second session while the first is still open waits, then sees the first one''s rows and writes nothing (nothing_to_change)', (t.sub('card_label', t.lbl(100, t.cd(100,'Card 10', ARRAY['stax_tax'])))->>'err') = 'nothing_to_change', '')"
sleep 3
$P -Atc "SELECT t.chk('E2-A1 exactly one Claude row exists for that card and role', (SELECT count(*) FROM user_card_roles WHERE user_id = t.u1() AND oracle_id = t.o(10) AND role = 'stax_tax' AND proposer = 'claude') = 1, '')"
echo "== second apply must refuse"
$P -f $D/20261118120100_roles_db2_change_kinds.draft.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E2-B0 running DB-2 twice refuses and changes nothing', (SELECT count(*) FROM pg_proc WHERE proname = '_ai_plan_pre_roles') = 1, '')"
echo "== rollback while card_label rows exist must refuse"
$P -f $D/20261118120100_roles_db2_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E2-B1 rollback refuses while log rows of the new kind exist (functions still in place)', to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL AND EXISTS (SELECT 1 FROM ai_change_log WHERE kind = 'card_label'), '')"
$P -c "INSERT INTO ai_pending_changes (user_id, client_name, kind, action, reason, card_count, payload, payload_hash, preview) VALUES (t.u1(), 'Claude', 'big_edit', 'strategy_point', 'over_ten', 1, '{}', 'hh', '{}')"
echo "== clear the new-kind history by hand (test only), then rollback"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
$P -f $D/20261118120100_roles_db2_change_kinds.rollback.sql 2>&1 | grep -E "ERROR"
$P -c "SELECT t.chk('E2-B2 rollback still refuses while a waiting strategy_point / card_label request exists', to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL, '')"
$P -c "DELETE FROM ai_pending_changes WHERE action IN ('card_label','strategy_point')"
f $D/20261118120100_roles_db2_change_kinds.rollback.sql
$P <<'SQL'
SELECT t.chk('E2-B3 rollback restores the previous state exactly (every function, grant, constraint, table and trigger fingerprint equals the one taken after DB-1)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp1'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp1'));
SELECT t.sub('deck_add', '{"deck_id":101,"items":[{"card_name":"Mana Crypt","scryfall_id":"s9","set_code":"cmm","oracle_id":"o9","quantity":1,"categories":"[\"Ramp\"]"}]}') AS r \gset rb_
SELECT t.und(t.gid(:'rb_r'::jsonb), 'claude') AS r \gset rbu_
SELECT t.chk('E2-B4 after the rollback the old kinds still work (add, Claude undo) and the new names are rejected by the log again',
  (:'rb_r'::jsonb#>>'{res,outcome}') = 'applied' AND (:'rbu_r'::jsonb#>>'{res,success}') = 'true'
  AND t.try($q$INSERT INTO ai_change_log (user_id, group_id, client_name, kind, card_name) VALUES (t.u1(), gen_random_uuid(), 'Claude', 'card_label', 'x')$q$) LIKE '%ai_change_log_kind_check%', :'rb_r' || :'rbu_r');
SELECT t.chk('E2-B5 the roles tables and the owner''s personal roles are untouched by the DB-2 rollback (they belong to DB-1)', to_regclass('public.user_card_roles') IS NOT NULL AND (SELECT count(*) FROM user_card_roles WHERE proposer = 'owner') > 0, '');
SQL
echo "== re-apply and use"
f $D/20261118120100_roles_db2_change_kinds.draft.sql
$P <<'SQL'
SELECT t.age();
SELECT t.chk('E2-B6 re-apply after rollback works: a role request applies and Claude can undo it', (SELECT t.und(t.gid(t.sub('card_label', t.lbl(100, t.cd(100,'Card 3', ARRAY['recursion']))) ), 'claude')#>>'{res,success}') = 'true', '');
SQL
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $D/20261118120100_roles_db2_change_kinds.rollback.sql
echo "== and DB-1 back out too"
$P -c "DELETE FROM user_card_roles; DELETE FROM ref_card_roles"
f $D/20261118120000_roles_db1_card_roles.rollback.sql
$P -c "SELECT t.chk('E2-B7 DB-2 and then DB-1 rolled back: the database fingerprint equals the one taken before DB-1 (the live state)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), '')"
$P -f $HERE/results.sql
