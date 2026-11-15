# Report: cc03c-insights-scripts
Role: Developer
Status: DONE
Task as received: the table ref_commander_insights is being made private (no anon read). Three helper scripts read it with the public anon key: scripts/distill-commander.ts (falls back to anon), scripts/generate-coverage-report.js, scripts/check-insight-status.js. Change them to use SUPABASE_SERVICE_ROLE_KEY only (fail clearly with a message if missing), loading env the same way they do now. Do not change anything else. Verify, commit on branch cc03c-insights-scripts, do not push or merge.

## Summary for the owner
The three helper scripts that read the AI commander analysis now use the private admin key instead of the public one, so they keep working once that data is locked. If the key is missing they stop and say so.

## Changed files
- scripts/distill-commander.ts — removed anon fallback; service key only, exits with a clear message if missing
- scripts/generate-coverage-report.js — anon key replaced by service key, same missing-key check
- scripts/check-insight-status.js — anon key replaced by service key, same missing-key check

## New decisions made (need owner confirmation)
- none

## Assumptions
- Env still loads from `.env.local` via dotenv, unchanged. No new env vars (SUPABASE_SERVICE_ROLE_KEY already existed).
- Work done in git worktree `../oracle_app_cc03c` because the main checkout is on `import-destination` with uncommitted changes. `node_modules` and `.env.local` were temporarily symlinked for testing, then removed.

## Challenges to locked decisions
- none

## Open questions
- generate-coverage-report.js needs a local SQLite file (`research/commander-content/content-raw.sqlite`, or `COMMANDER_CONTENT_DB_PATH`) that does not exist on this machine, so it could not run to the end.

## Verification
- `node --check` on both .js scripts — OK
- `tsc --noEmit` on distill-commander.ts (standalone flags) — no errors
- `node scripts/check-insight-status.js` against live Supabase with service key — OK, listed per-commander insight counts (run before the lock; the service key works regardless of the lock)
- `node scripts/generate-coverage-report.js` — Supabase reads passed; then failed at the missing local SQLite file ("directory does not exist"). Nothing written, nothing to discard.
- Run with `.env.local` removed — check-insight-status exits with the clear "Missing ... SUPABASE_SERVICE_ROLE_KEY" message
- Not pushed or merged. Commit on branch `cc03c-insights-scripts`.
