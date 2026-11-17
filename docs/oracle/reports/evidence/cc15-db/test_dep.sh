# Dependency proof: DB-B WITHOUT 20261117120000 (the guard fix). Sourced by run.sh.
f $D/20261117200000_cc15a_new_change_kinds.draft.sql
echo "== 1. DB-B as written, 20261117120000 NOT applied: it must refuse to install"
$P -f $D/20261117200100_cc15b_deck_create_setup.draft.sql 2>&1 | grep -E "ERROR"
$P -Atc "SELECT 'DB-B installed? ' || (to_regprocedure('public.ai_create_deck(uuid,uuid,text,text,jsonb)') IS NOT NULL)"
echo "== 2. Same file with only the dependency check removed (to show what the check protects against)"
python3 - <<PY
import re
s=open("$D/20261117200100_cc15b_deck_create_setup.draft.sql").read()
s2=re.sub(r"  IF position\('v_deck_cleared'.*?END IF;\n","",s,flags=re.S)
assert s2!=s
open("/tmp/cc15b_nodep.sql","w").write(s2)
PY
f /tmp/cc15b_nodep.sql
$P <<'SQL'
SELECT public.ai_create_deck('00000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Dep deck', 'modern', NULL) AS r \gset
SELECT (:'r'::jsonb->>'group_id') AS g, (:'r'::jsonb->>'deck_id') AS d \gset
\echo -- owner Undo of the empty created deck, without 20261117120000:
SELECT t.att(format('SELECT public.ai_undo_group(%L, %L, ''owner'')', '00000000-0000-0000-0000-000000000001', :'g')) AS undo_result;
SELECT 'deck still exists after the failed Undo: ' || EXISTS (SELECT 1 FROM decks WHERE id = :d) AS state;
\echo -- deleting the same deck by hand, without 20261117120000 (the owner original complaint):
SELECT t.att(format('WITH x AS (DELETE FROM decks WHERE id = %s RETURNING 1) SELECT to_jsonb(count(*)) FROM x', :d)) AS hand_delete_result;
SQL
echo "== 3. Now apply 20261117120000 and retry the same Undo"
f $M/20261117120000_ai_change_log_allow_deck_delete.sql
$P -Atc "SELECT 'Undo now: ' || public.ai_undo_group('00000000-0000-0000-0000-000000000001', (SELECT group_id FROM ai_change_log WHERE deck_name='Dep deck' AND kind='deck_create'), 'owner')::text; SELECT 'deck exists: ' || EXISTS (SELECT 1 FROM decks WHERE name='Dep deck')"
