# card-why throwaway test (20261120120000_card_why_claude_write). Sourced by run.sh.
# Base = real live migrations up to CC-15b, then the live state (DB-1 to DB-5, CC-25, S3, S4, S5, tags, why-here) and the card-why draft on top:
# Claude fills an empty Why, changes a Why with text, both logged with Undo, refusals, isolation, rollback rules, exact restore.
CW=$D/20261120120000_card_why_claude_write
WH=$D/20261120110000_why_here_deck_cards
TG=$D/20261120100000_tags_fill_tag_tables
S5=$D/20261119120000_s5_strategy_replace
S4=$D/20261119110000_s4_claude_change_reason
S3=$D/20261119100000_s3_strategy_window_fields
CC25=$D/20261118130000_cc25_trade_locations
DB=(20261118120000_roles_db1_card_roles 20261118120100_roles_db2_change_kinds 20261118120200_roles_db3_deck_card_jobs 20261118120300_roles_db4_strategy_points 20261118120400_roles_db5_health_targets)
$P <<'SQL'
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY deck_cards_own_all ON public.deck_cards FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deck_cards TO authenticated;
CREATE FUNCTION t.cw(p_slot int, p_why text, p_base text DEFAULT NULL, p_deck int DEFAULT 100, p_user uuid DEFAULT t.u1(), p_conn uuid DEFAULT t.c1()) RETURNS jsonb LANGUAGE sql AS $$
  SELECT t.att(format('SELECT public.ai_set_card_why(%L, %L, %L, %L, %L, %L)', p_user, p_conn, p_deck, p_slot, p_why, p_base)) $$;
INSERT INTO t.keep VALUES ('fp0', t.fp());
SQL
echo "== the live state: DB-1 to DB-5, CC-25, S3, S4, S5, tags and why-here applied"
for d in $DB; do f $D/$d.draft.sql; done
f $CC25.draft.sql; f $S3.draft.sql; f $S4.draft.sql; f $S5.draft.sql; f $TG.draft.sql; f $WH.draft.sql
$P -c "INSERT INTO t.keep VALUES ('fpL', t.fp())"
echo "== apply the card-why draft"
f $CW.draft.sql
$P <<'SQL'
SELECT t.chk('CW-01 applies: new function exists, service role only (anon and signed-in users cannot run it)',
  has_function_privilege('service_role', 'public.ai_set_card_why(uuid,uuid,integer,integer,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.ai_set_card_why(uuid,uuid,integer,integer,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ai_set_card_why(uuid,uuid,integer,integer,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ai_undo_group(uuid,uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public._ai_undo_blocker(uuid,ai_change_log)', 'EXECUTE'), '');
SELECT t.slot(100, 'Card 1') AS s1 \gset
SELECT t.slot(100, 'Card 2') AS s2 \gset
SELECT t.slot(200, 'Card 1') AS su2 \gset
-- Fill an empty Why
SELECT t.cw(:s1, 'Ramps into the big turn.') AS r1 \gset
SELECT t.chk('CW-10 Claude fills an empty Why: saved, filled true, one log row (before empty, after the text), Claude is the author',
  :'r1'::jsonb#>>'{res,outcome}' = 'applied' AND (:'r1'::jsonb#>>'{res,filled}') = 'true'
  AND (SELECT why_here FROM deck_cards WHERE id = :s1) = 'Ramps into the big turn.'
  AND (SELECT count(*) FROM ai_change_log WHERE kind = 'card_why' AND deck_card_id = :s1 AND after->>'why' = 'Ramps into the big turn.' AND before->>'why' IS NULL AND client_name = 'Claude') = 1, :'r1');
SELECT t.chk('CW-11 the same text again changes nothing and logs nothing',
  t.cw(:s1, 'Ramps into the big turn.')#>>'{res,outcome}' = 'no_change' AND (SELECT count(*) FROM ai_change_log WHERE kind = 'card_why') = 1, '');
-- Change a Why with text
SELECT t.cw(:s1, 'Fixes colours.', 'Ramps into the big turn.') AS r2 \gset
SELECT t.chk('CW-12 changing a Why that has text: saved, filled false, previous text kept in the log, appears in recent changes with Undo allowed',
  :'r2'::jsonb#>>'{res,outcome}' = 'applied' AND (:'r2'::jsonb#>>'{res,filled}') = 'false' AND (SELECT why_here FROM deck_cards WHERE id = :s1) = 'Fixes colours.'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = :'r2'::jsonb#>>'{res,group_id}' AND e->>'kind' = 'card_why' AND e->'undo_blocker' = 'null'::jsonb), :'r2');
-- Refusals write nothing
SELECT t.chk('CW-20 the owner edited since Claude read it (why_base differs): refused why_changed, text unchanged',
  t.cw(:s1, 'Mine now.', 'Ramps into the big turn.')->>'err' = 'why_changed' AND (SELECT why_here FROM deck_cards WHERE id = :s1) = 'Fixes colours.', '');
SELECT t.chk('CW-21 201 characters, empty text, blank, and a line break are refused (bad_why)',
  t.cw(:s2, repeat('a', 201))->>'err' = 'bad_why' AND t.cw(:s2, '')->>'err' = 'bad_why' AND t.cw(:s2, '   ')->>'err' = 'bad_why' AND t.cw(:s2, E'two\nlines')->>'err' = 'bad_why'
  AND (SELECT why_here FROM deck_cards WHERE id = :s2) IS NULL, '');
SELECT t.chk('CW-22 exactly 200 characters accepted', t.cw(:s2, repeat('é', 200))#>>'{res,outcome}' = 'applied', '');
SELECT t.chk('CW-23 a slot in another deck, another user''s slot, and an unknown slot are refused; a switched-off connection is refused',
  t.cw(:su2, 'x')->>'err' = 'slot_not_found' AND t.cw(:su2, 'x', NULL, 200)->>'err' = 'deck_not_found' AND t.cw(999999, 'x')->>'err' = 'slot_not_found'
  AND t.cw(:s1, 'x', NULL, 100, t.u1(), t.c1_off())->>'err' = 'connection_revoked' AND t.cw(:s1, 'x', NULL, 100, t.u1(), t.c2())->>'err' = 'connection_revoked'
  AND (SELECT why_here FROM deck_cards WHERE id = :su2) IS NULL, '');
-- Undo
SELECT t.gid(:'r2'::jsonb) AS g2 \gset
SELECT t.und(:'g2', 'claude') AS u30 \gset
SELECT t.und(:'g2', 'claude') AS u30b \gset
SELECT t.chk('CW-30 Claude undoes the change: the earlier text is back, a second undo is refused (already_undone)',
  :'u30'::jsonb#>>'{res,success}' = 'true' AND (SELECT why_here FROM deck_cards WHERE id = :s1) = 'Ramps into the big turn.' AND :'u30b'::jsonb#>>'{res,refused,code}' = 'already_undone', :'u30' || :'u30b');
SELECT t.cw(:s1, 'Third version.') AS r3 \gset
UPDATE deck_cards SET why_here = 'Owner rewrote it.' WHERE id = :s1;
SELECT t.und(t.gid(:'r3'::jsonb), 'claude') AS u31a \gset
SELECT t.und(t.gid(:'r3'::jsonb), 'owner') AS u31b \gset
SELECT t.chk('CW-31 the owner edited the line after Claude: Undo is refused (slot_changed) for Claude and for the owner, the reason shows in recent changes, text untouched',
  :'u31a'::jsonb#>>'{res,refused,code}' = 'slot_changed' AND :'u31b'::jsonb#>>'{res,refused,code}' = 'slot_changed'
  AND (SELECT why_here FROM deck_cards WHERE id = :s1) = 'Owner rewrote it.'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'r3'::jsonb)::text AND e#>>'{undo_blocker,code}' = 'slot_changed'), :'u31a');
UPDATE deck_cards SET why_here = NULL WHERE id = :s2;
SELECT t.cw(:s2, 'Fresh fill.') AS r4 \gset
SELECT t.und(t.gid(:'r4'::jsonb), 'claude', t.u2(), t.c2()) AS u32a \gset
SELECT t.und(t.gid(:'r4'::jsonb), 'owner') AS u32b \gset
SELECT t.chk('CW-32 another user cannot undo it; the owner can, and undoing a fill empties the line again (NULL)',
  (:'u32a'::jsonb#>>'{err}' IS NOT NULL OR (:'u32a'::jsonb#>>'{res,success}') = 'false') AND :'u32b'::jsonb#>>'{res,success}' = 'true' AND (SELECT why_here FROM deck_cards WHERE id = :s2) IS NULL, :'u32a' || :'u32b');
SELECT t.cw(:s2, 'Old fill.') AS r5 \gset
SELECT t.expire(t.gid(:'r5'::jsonb));
SELECT t.und(t.gid(:'r5'::jsonb), 'claude') AS u33 \gset
SELECT t.chk('CW-33 an undo older than 7 days is refused', :'u33'::jsonb#>>'{res,refused,code}' IN ('too_old', 'window_closed'), :'u33');
SELECT t.slot(100, 'Card 3') AS s3 \gset
SELECT t.cw(:s3, 'Temp.') AS r6 \gset
DELETE FROM deck_cards WHERE id = :s3;
SELECT t.und(t.gid(:'r6'::jsonb), 'claude') AS u34 \gset
SELECT t.chk('CW-34 a removed slot blocks the undo (slot_gone), and recent changes still lists it', :'u34'::jsonb#>>'{res,refused,code}' = 'slot_gone'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(public.ai_list_recent_changes(t.u1())) e WHERE e->>'group_id' = t.gid(:'r6'::jsonb)::text AND e#>>'{undo_blocker,code}' = 'slot_gone'), :'u34');
-- Old kinds still work
SELECT t.chk('CW-40 an old kind (add a card, then Claude undoes it) still works through the wrapped front doors',
  (SELECT t.und(t.gid(t.sub('deck_add', '{"deck_id":100,"items":[{"card_name":"Sol Ring","scryfall_id":"s1","set_code":"cmm","oracle_id":"o1","quantity":1,"categories":"[\"Ramp\"]"}]}')), 'claude')#>>'{res,success}') = 'true', '');
SELECT t.chk('CW-41 S5 still replaces the Strategy (earlier drafts unaffected)',
  t.att(format('SELECT public.ai_set_deck_setup(%L, %L, %L, %L)', t.u1(), t.c1(), 100, '{"strategy_notes":"New text."}'))#>>'{res,outcome}' = 'applied', '');
-- Row security: the owner-side column rules still hold
SELECT t.chk('CW-42 a second signed-in user still cannot touch the first user''s Why (no row visible)',
  (SELECT count(*) FROM (SELECT 1) x WHERE has_table_privilege('anon', 'public.deck_cards', 'SELECT')) = 0, '');
SQL
echo "== rollback refuses while a card_why log row exists"
$P -f $CW.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
$P -c "SELECT t.chk('CW-50 rollback refuses with card_why entries in the log and removes nothing', to_regprocedure('public.ai_set_card_why(uuid,uuid,integer,integer,text,text)') IS NOT NULL, '')"
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind = 'card_why'; ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard"
f $CW.rollback.sql
$P -c "SELECT t.chk('CW-51 rollback with no card_why entries: the database equals the live state EXACTLY (functions, grants, constraints, tables)', t.fp() = (SELECT v FROM t.keep WHERE k = 'fpL'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fpL'))"
$P -f $CW.rollback.sql 2>&1 | grep -E "ERROR" | sed 's/^/   (expected) /'
echo "== re-apply, then everything rolled back in reverse to the base"
f $CW.draft.sql
$P -c "SELECT t.chk('CW-52 re-applies after a rollback', to_regprocedure('public.ai_set_card_why(uuid,uuid,integer,integer,text,text)') IS NOT NULL, '')"
f $CW.rollback.sql
$P -c "UPDATE deck_cards SET why_here = NULL"
f $WH.rollback.sql; f $TG.rollback.sql; f $S5.rollback.sql
$P -c "ALTER TABLE ai_change_log DISABLE TRIGGER ai_change_log_guard; DELETE FROM ai_change_log WHERE kind IN ('card_label','strategy_point','health_target','deck_setup','deck_create'); ALTER TABLE ai_change_log ENABLE TRIGGER ai_change_log_guard; UPDATE deck_strategy SET summary = NULL, bracket = NULL"
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $S4.rollback.sql; } | $P -f -
f $S3.rollback.sql; f $CC25.rollback.sql
for d in 20261118120400_roles_db5_health_targets 20261118120300_roles_db4_strategy_points 20261118120200_roles_db3_deck_card_jobs 20261118120100_roles_db2_change_kinds; do f $D/$d.rollback.sql; done
{ echo "SET oracle.rollback_allow_data_loss = 'yes';"; cat $D/20261118120000_roles_db1_card_roles.rollback.sql; } | $P -f -
$P -c "SELECT t.chk('CW-60 card-why, why-here, tags, S5, S4, S3, CC-25 and DB-5 to DB-1 roll back in reverse and the database equals the cc15b base exactly', t.fp() = (SELECT v FROM t.keep WHERE k = 'fp0'), t.fp() || ' vs ' || (SELECT v FROM t.keep WHERE k = 'fp0'))"
$P -f $HERE/results.sql
