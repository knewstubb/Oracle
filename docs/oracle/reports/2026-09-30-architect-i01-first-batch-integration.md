# Report: i01-first-batch-integration
Role: Architect
Status: DONE
Task as received: Task I-01: In a fresh temporary worktree based on the current main commit, combine only the reviewed T-32, T-33, and T-34 source/test outputs listed in docs/oracle/reports/2026-09-29-orchestrator-first-batch-acceptance.md. Use the three isolated worktrees at /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t32-collection-client, /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t33-price-freshness, and /Users/bradknewstubb/.paseo/worktrees/03dz1jp4/t34-native-stream-fragments as inputs; exclude their unrelated documentation and architecture files. Do not modify or merge main, do not deploy, and do not create a production commit.
Done when: the temporary integration workspace contains a source/test diff inventory proving only the three reviewed fixes were combined, runs the combined targeted tests plus typecheck/lint/diff checks, classifies new versus pre-existing failures, and writes a plain-English verification report with the manual click-through checklist and merge recommendation.

## Summary for the owner
The three reviewed fixes (Collection search/loading, fewer duplicate price checks, and the AI streaming fix) were combined in a throwaway copy of the app and work together: every new check passes, and nothing that worked before is broken by them. The only failures are ones that already exist in the current app. Recommend merging once you have done the short click-through below; nothing has been merged, committed or deployed.

## Where the combined copy lives
- Temporary workspace: `/tmp/oracle-i01-integration`, detached at main `0a74e8e` (not a branch, no commit).
- Evidence inventory: `/tmp/oracle-i01-integration/.i01/` (file list, status, diffstat, test/typecheck/lint logs for combined and baseline).
- Main checkout (`/Users/bradknewstubb/Developer/Personal/oracle_app`) is untouched: still `0a74e8e`, zero source changes.

## Diff inventory — only the 13 reviewed source/test files

Every file was copied from its task worktree and its SHA-256 checked identical after copy. All three task worktrees sit on the same base commit (`0a74e8e`) with no commits of their own, and no path appears in more than one task, so there was nothing to merge by hand.

| Task | File | Change | SHA-256 (first 12) |
|---|---|---|---|
| T-32 | src/app/collection/page.tsx | modified | b3a2742928fa |
| T-32 | src/app/collection/page.test.tsx | new | c4b0ccaebb02 |
| T-32 | src/components/collection/CollectionToolbar.tsx | modified | 9e83ba2006ec |
| T-32 | src/components/collection/CollectionToolbar.test.tsx | modified | 21aca39ca97b |
| T-32 | src/hooks/useCollectionRollup.ts | modified | 8d2266ae5e98 |
| T-33 | src/lib/price-store.ts | modified | fa91e56d7347 |
| T-33 | src/lib/price-store.test.ts | new | cd48cf1ee345 |
| T-33 | src/app/api/collection/rollup/route.ts | modified | c29299d20ef2 |
| T-33 | src/app/api/collection/rollup/route.test.ts | new | bc69aa7ff5ef |
| T-33 | src/app/api/collection/printings/route.ts | modified | 3c76833e80fd |
| T-33 | src/app/api/collection/printings/route.test.ts | new | 2fd9db9f015f |
| T-34 | src/lib/adapters/deepseek-adapter.ts | modified | 1a0bf7862821 |
| T-34 | src/lib/adapters/deepseek-adapter.test.ts | new | ee13bfa3fb5c |

Total diff: 13 files, +2260 / −85. `git status` in the workspace shows exactly these 13 paths plus the `.i01/` evidence folder and this report.

Excluded on purpose:
- The three task reports (provenance only, already in the task worktrees).
- All frozen decisions/status/roadmap copies and other docs in the task worktrees.
- T-34 worktree's untracked architecture drafts `docs/oracle/contracts/advisor-tools.types.ts` and `advisor-tools.examples.ts` (T-15 work, not part of this batch).
- No package, config, migration or database file was changed by any of the three tasks.

Cross-task interaction check [Confirmed: combined diff]: T-32 only adds an optional `enabled` flag to the Collection data hook (defaults to on, so other callers are unchanged) and does not depend on the response shapes T-33 touched. T-33 changes how the rollup/printings routes compute "prices are stale" (one lookup instead of two) without changing the response fields. T-34 is isolated to the AI provider adapter. `isPriceDataStale` / `getLastRefreshTimestamp` have no callers outside the T-33 files.

## Verification

Baseline = a second throwaway worktree of untouched main `0a74e8e`, same `node_modules`, same commands. Tests run via `NODE_DISABLE_COMPILE_CACHE=1 node node_modules/vitest/vitest.mjs` (workaround from the acceptance report).

| Check | Combined | Baseline main | Classification |
|---|---|---|---|
| Targeted tests (`src/components/collection`, `src/app/collection/page.test.tsx`, `src/hooks`, T-33 three test files, T-34 adapter test) | 146 passed / 2 failed / 148 (12 files) | same 2 failures in the 74 of those tests that exist on main | 2 pre-existing: `getPersistedViewMode` "returns list when nothing stored" / "when stored value is invalid" |
| Per-task breakdown | T-32 106/108, T-33 33/33, T-34 7/7 | — | Matches the acceptance report exactly |
| Full unit suite (excl. e2e) | 1272 passed / 241 failed / 1 skipped (1514) | 1199 passed / 240 failed / 1 skipped (1440) | 240 shared failures pre-existing; 74 extra tests are the batch's new tests, all pass; 1 extra failure explained below |
| Typecheck `tsc --noEmit --incremental false` | exit 2, 157 errors | exit 2, 157 errors | Identical after ignoring line/column shifts: 0 added, 0 removed |
| ESLint on the 13 files | 17 errors / 5 warnings | 20 errors / 5 warnings on the 8 files that exist on main | 0 new rule hits; 5 new test files lint clean; batch removes 3 errors (page 3→1, toolbar 1→0) |
| `git diff --check` | clean | — | — |

The one extra full-suite failure: `src/lib/deck-list-generator.property.test.ts` → "Property 1: Card Completeness". This is a randomised test (fast-check, new random seed each run). This run happened to generate a card whose set code is `**`, which the test's row counter mistakes for the bold Total row. I fed that exact input to the untouched main code and got the same output, and neither the generator nor its test is among the 13 files. Classification: pre-existing, intermittent, unrelated to this batch. It deserves a separate small fix to the test.

Not verified: no browser run, no hosted/performance timing, no live Supabase or AI provider calls (all tests use mocks). `npm run build` was not run; per the README it ignores TypeScript errors, so it would add little.

## Manual click-through checklist (for the owner, after merge to a preview, before production)

Collection (T-32)
1. Open Collection. While it loads, the header/footer should not flash "0 cards"; it shows a loading state, then the real total.
2. Type a search quickly (e.g. "sol ri" then keep typing to "sol ring"). Results match the final text, not an earlier partial word.
3. Clear the search box. The box stays empty and the full list returns (it should not jump back to the old text).
4. Go to page 2 or 3, then change the colour filter. You land back on page 1 with the filtered results.
5. Sort by a column, flip it ascending/descending, and switch between list and grid view. Your page and results stay sensible; switching back to a view you've already seen is instant.
6. Edit a card elsewhere (e.g. add a copy), return to Collection. The totals update without a manual refresh.
7. Search for something with no matches. You see a clear "no results" state, not an error or an endless spinner.

Prices (T-33)
8. On Collection, the "prices may be out of date" notice appears or doesn't exactly as it does today (no visible change expected; this fix only removes a duplicate background check).

AI advisor (T-34)
9. Ask the AI advisor something that makes it look cards up (e.g. "suggest three ramp cards for this deck"). The response completes and the looked-up cards appear, with no half-finished or garbled tool step.

Known and unchanged: the view preference test expects "list" as the default while the app keeps the grid default. That is a pre-existing mismatch, deliberately left alone.

## Merge recommendation
Recommend merging these 13 files as one batch, after owner approval and the checklist above. Nothing new fails, typecheck is unchanged, lint improves slightly. Remaining red checks are all pre-existing and outside this batch's scope, so they should not block it. Deployment stays a separate decision.

## Changed files
- `/tmp/oracle-i01-integration/src/…` (13 files above), temporary workspace only; copied verbatim from the task worktrees
- `/tmp/oracle-i01-integration/.i01/*`: evidence inventory and logs
- `docs/oracle/reports/2026-09-30-architect-i01-first-batch-integration.md`: this report (in the temporary workspace and in the grand-dodo worktree)

## New decisions made (need owner confirmation)
- None.

## Assumptions
- Took the acceptance report's 13 source/test paths as authoritative; the optional hash manifest was not located and was not used, per owner instruction.
- The `.i01/` folder and a gitignored `node_modules` link are left in the temporary workspace as evidence; the paths show as "intent to add" in its index only, with no commit.

## Challenges to locked decisions
- None.

## Open questions
- Approve merging the batch?
- Should a small follow-up fix the randomised deck-list test that fails when a set code looks like bold text?

## Cleanup
- Temporary probe test was deleted; baseline worktree `/tmp/oracle-i01-baseline` was removed. The integration workspace `/tmp/oracle-i01-integration` is kept for review; remove it with `git worktree remove --force /tmp/oracle-i01-integration` once it is no longer needed.
