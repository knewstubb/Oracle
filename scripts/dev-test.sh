#!/usr/bin/env bash
# Runs the app on port 3100 against the TEST database, never the live one.
# Needs .env.testdb.local (copy scripts/env.testdb.example and fill it in).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.testdb.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy scripts/env.testdb.example to $ENV_FILE and fill in the TEST Supabase project values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${TEST_DB_CONFIRMED:-}" ]; then
  echo "$ENV_FILE must set NEXT_PUBLIC_SUPABASE_URL and TEST_DB_CONFIRMED=yes." >&2
  exit 1
fi

# Refuse to run if the test URL matches the live project in .env.local.
LIVE_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [ -n "$LIVE_URL" ] && [ "$NEXT_PUBLIC_SUPABASE_URL" = "$LIVE_URL" ]; then
  echo "Refusing to start: the test database URL is the same as the live one in .env.local." >&2
  exit 1
fi

exec npx next dev -p 3100
