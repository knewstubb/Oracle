# Report: card-data-refresh
Role: Developer
Status: DONE
Task as received: Owner-approved option 1 — (a) refresh card data on demand from the app, (b) stale warning, (c) fix the failing batch (1,310 rows failed in the earlier `--force` sync). Reusable notice component for the ManaBox import dialogs (not wired; they live on test-t56-local/t56).

## Summary for the owner
Settings now has a "Card data" section showing when the card list was last updated and a "Refresh card data" button that runs in the background (a few minutes; you can keep using Oracle) and ends with a clear success or failure message. The 1,310 cards that failed earlier now save: all 118,810 cards are in, including Abigale, Poet Laureate, so ManaBox import should now find it. What went wrong: two joke cards (Gleemax) have a "mana value" of 1,000,000, which didn't fit the storage field, so the 1,000 cards saved alongside them were rejected; the last 310 cards were being sent to a table that doesn't exist. A small notice component ("Card data is X days old…") is built but still needs placing in the ManaBox import dialogs after T-56 merges.

## Changed files
- src/lib/card-data-sync.ts — extracted sync core (row conversion, batch upsert with split-and-retry to isolate bad rows, logging of error + up to 5 ids, sync_meta read/write, download). Used by script and route.
- src/lib/card-data-status.ts — pure staleness calculation (stale = never synced or >7 days) + shared status type.
- src/lib/card-data-refresh.ts — in-process background runner with single-flight guard and progress state.
- src/app/api/card-data/refresh/route.ts — GET status, POST start (202; 409 if already running; requireAuth).
- src/hooks/useCardDataStatus.ts — status hook (polls every 2s while running).
- src/components/CardDataSection.tsx — Settings section; src/app/settings/page.tsx — renders it.
- src/components/CardDataStaleNotice.tsx — reusable one-line notice with link to /settings.
- scripts/sync-scryfall-printings.ts — now a thin CLI wrapper (loads .env.local); package.json — `sync:cards`.
- Tests: card-data-status, card-data-sync, card-data-refresh, route.test.ts, CardDataSection.test.tsx.

## Root cause of the 1,310 failures
1. `ref_printings.cmc` is NUMERIC(5,2) (max 999.99). Gleemax (Unfinity-era un-card) has cmc 1,000,000 and sits in batches 39 and 111 → Postgres rejected both 500-row batches (1,000 rows). Fix: out-of-range cmc stored as null (no migration needed).
2. The final partial batch (310 rows) was upserted into `scryfall_printings` (wrong/non-existent table) instead of `ref_printings`. 1,000 + 310 = 1,310. Fix: single code path for all batches.
- Also fixed: Scryfall's bulk-data listing no longer has `download_uri`/`size`; code uses `jsonl_download_uri` only. Duplicate scryfall_ids were checked: none.
- Failures now log the error and up to 5 offending ids; a bad batch is split to isolate the bad row instead of losing 500.

## Design notes
- Refresh runs inside the Next.js server process (globalThis state, survives hot reload). POST returns immediately; the page polls GET. One at a time; second POST → 409 and the UI just shows the running progress. Suitable for the local single-user dev server only; on serverless hosting the process could be frozen. If the dev server restarts mid-refresh the run stops (safe: upserts only; run again).
- "Last updated" is Scryfall's bulk file date stored in sync_meta `printings_last_sync`; only written when every row saved. The button skips work if Scryfall has nothing newer ("already up to date").
- Staleness: 7 days.
- Vercel cron route `/api/cron/sync-scryfall` and the Edge Function are untouched (owner runs locally now; candidate for removal — not done).

## Still to do (after T-56 merges)
- Render `<CardDataStaleNotice />` (src/components/CardDataStaleNotice.tsx) near the top of the ManaBox import dialogs in src/components/manabox-import/. It needs a QueryClientProvider (already present app-wide).

## New decisions made (need owner confirmation)
- Out-of-range mana value stored as unknown (null) rather than clamped to 999.99.
- 7-day stale threshold.

## Assumptions
- No schema change wanted (Architect's lane); widening the column was not needed.

## Challenges to locked decisions
- none

## Open questions
- Remove the unused Vercel cron + Edge Function reference? 

## Verification
- `npm run typecheck` — clean
- `npx eslint` on all changed files — clean
- `npx vitest --run src/lib/card-data src/app/api/card-data src/components/CardData` — 5 files, 29 tests pass
- `npm run sync:cards` (once, hosted DB, upserts only) — 118,810 processed, 118,810 upserted, 0 failed; sync_meta set to 2026-10-19T21:05:50Z
- Endpoint example: GET needs a signed-in session, so not curl-able here; covered by route test (returns lastSyncedAt, isStale, totalPrintings, refresh.phase). Not browser-tested in the owner's dev server.
