#!/bin/zsh
# THROWAWAY Postgres 17 cluster on 127.0.0.1:55434, built in a temp folder and deleted when the script ends. Never touches the hosted project.
# Usage: ./run.sh <test_name>   e.g. ./run.sh test_db1   (sources <test_name>.sh, writes <test_name>.out)
set -u; setopt SH_WORD_SPLIT
PGBIN=/opt/homebrew/opt/postgresql@17/bin
HERE=${0:A:h}; REPO=${HERE:h:h:h:h:h}
M=$REPO/supabase/migrations; D=$REPO/supabase/drafts
DATA=$(mktemp -d /tmp/cc25pg.XXXXXX); PORT=55435
$PGBIN/initdb -D $DATA -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DATA -o "-p $PORT -k $DATA -c listen_addresses=127.0.0.1" -l $DATA/log -w start >/dev/null || exit 1
trap "$PGBIN/pg_ctl -D $DATA -m immediate stop >/dev/null 2>&1; rm -rf $DATA" EXIT
P="$PGBIN/psql -h 127.0.0.1 -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres"
f() { echo "-- apply ${1:t}"; $P -f "$1" || { echo "!! FAILED: $1"; return 1; } }
{
echo "== cluster: $($P -Atc 'select version()') port $PORT (throwaway, deleted at end)"
f $HERE/../roles-db/00_base.sql
# The real migrations, unmodified, in order: everything the live database has up to and including CC-15b.
for m in 20261116130000_connector_connections 20261116150000_ai_change_log_and_pending 20261116150100_ai_connector_edit_rpcs \
  20261116150200_ai_undo_blocker_make_original_fix 20261116150300_ai_list_recent_changes_zone_to 20261116190000_ai_deck_category \
  20261117100000_cc13_loosen_limits 20261023170100_set_deck_command_zone 20261117120000_ai_change_log_allow_deck_delete \
  20261117200000_cc15a_new_change_kinds 20261117200100_cc15b_deck_create_setup; do f $M/$m.sql || exit 1; done
f $HERE/../roles-db/01_seed.sql
. $HERE/$1.sh
} 2>&1 | tee $HERE/$1.out
