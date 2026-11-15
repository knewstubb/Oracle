# Report: cc03a-verify
Role: Tester
Status: DONE

Task as received: CC-03a verify (read-only; never touch the live/hosted database): check the work in docs/oracle/reports/2026-11-16-developer-cc03a-owner-checks.md (branch import-destination) against docs/oracle/contracts/data-separation.md: run the new route tests, lint, and typecheck; review the status, notes and stats route diffs for owner checks; and read the two draft migrations for syntax errors, missing tables/functions, and anything that would break the app's service-role routes.

## Verdict: PASS for the route fixes; migrations PASS on reading, with one caution (not run, not testable here)

## Summary for the owner
The three privacy fixes do what the plan asked: asking for someone else's deck gives "Deck not found", and the collection totals count only your own cards. The two prepared database changes look safe and shouldn't break the app, but nobody has been able to run them yet. Try them on a test copy of the database first, as the plan already says.

## Findings
**Route diffs (commit 33d9a2d), all match contract 5a–5c [Confirmed: git show 33d9a2d]**
- status PATCH: user id from `authResult.id`; owner filter on both the lookup and the update; 404 kept.
- notes GET: owner deck check returning 404 `Deck not found` before the query; owner filter on `deck_notes` too. A lookup error returns 500 (developer's assumption, reasonable).
- stats GET: owner filter on both `user_copies` and `user_cards` counts.
- Tests cover other-user → 404 with row unchanged, and own-rows-only counts. The tests use an in-memory fake, so they prove the filters are present, not that the real database behaves the same.

**Migration 20261116100000 (RLS)**: syntax reads valid (BEGIN/DO block/format with %I/COMMIT). No FORCE RLS, so service role and definer functions keep working. `user_copies` is correctly skipped for the new policy. Caution: only 8 of the 22 tables (and the `collection_rollup` view) are defined in the repo's migration files; the rest (e.g. `deck_notes`, `sync_runs`, `brew_sessions`) were evidently created outside migrations, so they can only be checked against the live catalog, which the contract says was done. A test database rebuilt from the repo migrations alone would fail on `ALTER TABLE`.

**Migration 20261116100100 (function revoke)**: syntax valid. Service role is re-granted, so every route using `createAdminClient()` keeps working. The guard raises an error if a signature is missing. `get_collection_rollup(uuid)` and `get_shared_cards(uuid)` have no definition in the repo migrations (matches the contract's note that they are dead), so the same caution applies: the guard will abort the whole migration on a database built only from repo files. Rollback scripts exist for both in `supabase/drafts/`.

## Changed files
- `docs/oracle/reports/2026-11-16-tester-cc03a-verify.md` — this report (no code changed)

## New decisions made (need owner confirmation)
- none

## Assumptions
- Live catalog facts in the contract are accurate; I could not re-check them (read-only, no live database access).

## Challenges to locked decisions
- none (the contract's note that `get_collection_rollup` is dead contradicts AGENTS.md, already raised by the Architect)

## Open questions
- For Gene: the test database for the dry run should be a copy of live (not rebuilt from repo migrations), or the dry run will fail on the missing tables/functions above.
- The 22 "list only" routes are untouched and still unfixed (out of scope here).

## Verification
- `npx vitest --run` on the status, notes and stats route tests — 3 files, 5 tests pass.
- `npm run typecheck` — 1 error: `docs/oracle/contracts/card-state-actions.examples.ts` (TS5097), pre-existing and unrelated, as the developer reported.
- `npm run lint` — 0 errors, 276 warnings (pre-existing).
- Endpoint example requests — not done (would need the hosted database); covered only by the mocked route tests.
- Migration SQL — read only, not executed (no local Postgres; live database off limits).
- UI states — none in this task.
- Nothing was run against the live database.
