#!/bin/bash
#
# YouTube Transcript Fetch Runner
# 
# Fetches YouTube transcripts for top 1000 commanders.
# Run this as a separate overnight job (4-6 hours).
#
# Usage:
#   ./research/scripts/fetch-youtube-only.sh
#   ./research/scripts/fetch-youtube-only.sh 2>&1 | tee youtube-fetch-log.txt
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$APP_DIR"

echo "=============================================="
echo "  YouTube Transcript Fetch"
echo "  Started: $(date)"
echo "=============================================="
echo ""
echo "Target: Top 1000 commanders"
echo "Estimated time: 4-6 hours"
echo ""

START_TIME=$(date +%s)

# Fetch YouTube transcripts for top 1000 commanders
npx tsx research/scripts/fetch-youtube-transcripts.ts --limit 1000

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
HOURS=$((DURATION / 3600))
MINUTES=$(((DURATION % 3600) / 60))

echo ""
echo "=============================================="
echo "  YouTube Fetch Complete!"
echo "  Duration: ${HOURS}h ${MINUTES}m"
echo "  Finished: $(date)"
echo "=============================================="
echo ""

# Show database stats
echo ">>> Database Summary:"
SQLITE_PATH="${COMMANDER_CONTENT_DB_PATH:-$APP_DIR/../research/commander-content/content-raw.sqlite}"
sqlite3 "$SQLITE_PATH" "
SELECT '  Total rows: ' || COUNT(*) FROM raw_content;
SELECT '  By source:' as header;
SELECT '    ' || source || ': ' || COUNT(*) FROM raw_content GROUP BY source;
SELECT '  YouTube transcripts: ' || COUNT(*) FROM raw_content WHERE source = 'youtube' AND full_content IS NOT NULL;
SELECT '  Unique commanders with YouTube content: ' || COUNT(DISTINCT card_name) FROM raw_content WHERE source = 'youtube';
"

echo ""
echo "Done!"
