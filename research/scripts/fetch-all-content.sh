#!/bin/bash
#
# Overnight Content Fetch Runner
# 
# Fetches all commander strategy content from multiple sources.
# Run this before bed and let it work overnight.
#
# Usage:
#   ./research/scripts/fetch-all-content.sh
#   ./research/scripts/fetch-all-content.sh 2>&1 | tee fetch-log.txt  # With logging
#

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$APP_DIR"

echo "=============================================="
echo "  Overnight Content Fetch"
echo "  Started: $(date)"
echo "=============================================="
echo ""

# Track timing
START_TIME=$(date +%s)

# ---------------------------------------------
# Phase 1: EDHREC Themes + Article Metadata
# ---------------------------------------------
echo ">>> Phase 1: EDHREC Commander Data"
echo "    Fetching themes and article metadata for all commanders..."
echo ""

npx tsx research/scripts/fetch-edhrec-themes.ts

echo ""
echo "    Phase 1 complete."
echo ""

# ---------------------------------------------
# Phase 2: Commander's Herald Full Articles
# ---------------------------------------------
echo ">>> Phase 2: Commander's Herald Articles"
echo "    Fetching full articles from all strategy categories..."
echo ""

# Deckbuilding (709 articles)
echo "    [2a] Deckbuilding category..."
npx tsx research/scripts/fetch-commanders-herald.ts --category deckbuilding

# cEDH (175 articles)
echo "    [2b] cEDH category..."
npx tsx research/scripts/fetch-commanders-herald.ts --category cedh

# Budget (106 articles)
echo "    [2c] Budget category..."
npx tsx research/scripts/fetch-commanders-herald.ts --category budget

# Opinion (256 articles)
echo "    [2d] Opinion category..."
npx tsx research/scripts/fetch-commanders-herald.ts --category opinion

echo ""
echo "    Phase 2 complete."
echo ""

# ---------------------------------------------
# Phase 3: YouTube Transcripts (OPTIONAL - uncomment to run)
# ---------------------------------------------
# NOTE: This takes 4-6 hours for 1000 commanders (~3 sec each)
# Recommend running as a separate overnight job
#
# echo ">>> Phase 3: YouTube Transcripts"
# echo "    Fetching transcripts for top 1000 commanders..."
# echo ""
# npx tsx research/scripts/fetch-youtube-transcripts.ts --limit 1000
# echo ""
# echo "    Phase 3 complete."
# echo ""

# ---------------------------------------------
# Summary
# ---------------------------------------------
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo "=============================================="
echo "  Fetch Complete!"
echo "  Duration: ${MINUTES}m ${SECONDS}s"
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
SELECT '  With full content: ' || COUNT(*) FROM raw_content WHERE full_content IS NOT NULL;
SELECT '  Unique articles: ' || COUNT(DISTINCT source_url) FROM raw_content;
"

echo ""
echo "Done! Database: $SQLITE_PATH"
