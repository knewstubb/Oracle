#!/bin/zsh
# THROWAWAY Postgres 17 cluster on 127.0.0.1:55433. Never touches the hosted project. Usage: run.sh <label>  (writes <label>.out)
set -u; setopt SH_WORD_SPLIT
PGBIN=/opt/homebrew/opt/postgresql@17/bin
W=/Users/bradknewstubb/Developer/Personal/oracle_app/.worktrees/cc-15
HERE=$W/docs/oracle/reports/evidence/cc15-db
M=$W/supabase/migrations; D=$W/supabase/drafts
DATA=$(mktemp -d /tmp/cc15pg.XXXXXX); PORT=55433
$PGBIN/initdb -D $DATA -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DATA -o "-p $PORT -k $DATA -c listen_addresses=127.0.0.1" -l $DATA/log -w start >/dev/null || exit 1
trap "$PGBIN/pg_ctl -D $DATA -m immediate stop >/dev/null 2>&1; rm -rf $DATA" EXIT
P="$PGBIN/psql -h 127.0.0.1 -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres"
f() { echo "-- apply $1"; $P -f "$1" || { echo "!! FAILED: $1"; return 1; } }
{
echo "== cluster: $($P -Atc 'select version()') port $PORT (throwaway, deleted at end)"
f $HERE/00_base.sql
for m in 20261116130000_connector_connections 20261116150000_ai_change_log_and_pending 20261116150100_ai_connector_edit_rpcs \
  20261116150200_ai_undo_blocker_make_original_fix 20261116150300_ai_list_recent_changes_zone_to 20261116190000_ai_deck_category \
  20261117100000_cc13_loosen_limits 20261023170100_set_deck_command_zone; do f $M/$m.sql || exit 1; done
f $HERE/01_seed.sql
. $HERE/$1.sh
} 2>&1 | tee $HERE/$1.out
