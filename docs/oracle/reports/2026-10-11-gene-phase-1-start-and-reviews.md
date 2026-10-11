# Report: phase-1-start-and-reviews
Role: Gene
Status: DONE
Task as received: "Yes to both" (1. make the ten-phase order the new roadmap; 2. review the random-test fix and the Missing removal now)

## Summary for the owner
The roadmap now follows the ten phases, and Phase 1 (Safety net) is current. Both finished jobs passed my checks and are ready to bring in once you say yes. While reviewing, I found that the online copy of the app hasn't been updated since 28 September, and that the daily background jobs have been failing. Both are now Phase 1 tasks.

## Changed files
- docs/oracle/roadmap.md — milestones replaced with Phases 1–10. Phase 1 is CURRENT, each phase has an exit test, and the old milestones are kept as history.
- docs/oracle/status.md — new Phase 1 section (T-39 to T-45), a mapping of paused tasks to phases, T-29/T-36/T-38 set to REVIEW, and O-010 added.
- docs/oracle/reports/2026-10-11-gene-phase-1-start-and-reviews.md — this report.

## Reviews
**T-39 (random test fix), agent aee61e96. Recommend: bring in.**
- The change is test-only, in a single file: src/lib/deck-list-generator.property.test.ts.
- Re-verified: 20/20 consecutive passes, and eslint is clean on the file.

**T-38 (remove Missing and Graveyard), agent e43f82dd. Recommend: bring in.**
- 42 files changed: +141 / −1,166 lines.
- Five files deleted: the Missing toggle, row, helpers, endpoint and tests.
- Re-verified: the full unit suite fails in the same 34 files as main (134 failed), so there are no new failures. Type errors dropped from 141 to 139, and lint from 588 to 581 problems.
- Remaining "graveyard" and "missing" matches are Magic game terms or unrelated English wording.
- Checked a possible regression. T-38 deleted the Graveyard→break-down flow in StatusControl.tsx, but StatusControl is not mounted anywhere on main. Break down therefore had no on-screen caller before this change, and nothing visible is lost. Logged as O-010 for Phase 7.
- Known side effect: copies flagged Missing in the database now count as available, but `assign_physical_copy` still raises `copy_missing` for them. Sleeving one of those copies will show an error until the owner reimports. No migration was made, per D-028.
- T-38 is Phase 4 work that finished early. Bringing it in now avoids it drifting while Phase 1 edits tests.

File overlap check: none between T-38 and T-39. Both branched from 4d7ca96. Main has since gained only docs commits.

## New Phase 1 tasks (TODO, not started)
- T-40 Tester: triage every failing check and scheduled job.
- T-41 Developer: fix the out-of-date checks.
- T-42 Developer: fix the type errors and stop the build ignoring them.
- T-43 Developer: run the checks automatically on every push.
- T-44 Architect: recovery plan.
- T-45 Gene → Owner: bring the online copy and the live app up to date.

## Findings
- origin/main is at 3b0998d (2026-09-28); local main is 24+ commits ahead. If the live app deploys from GitHub, it lacks Reconcile, the Collection loading fixes and any-account import. [Approximate: the deploy source was not checked]
- The GitHub scheduled jobs "Sync Commanders" (daily) and "Shared Read-only Smoke" (weekdays) failed on every run listed from 2026-10-07 to 2026-10-10. The last two e2e runs (2026-09-26, 2026-09-27) also failed.
- CI runs only e2e and scheduled syncs. Unit tests, typecheck and lint never run automatically.

## New decisions made (need owner confirmation)
- none (the roadmap change was owner-approved: "Yes to both")

## Assumptions
- T-45 counts as an owner gate. Pushing changes what the live app runs.

## Challenges to locked decisions
- none

## Open questions
- Approve merging T-39 and T-38 into main?
- Start the Phase 1 tasks (T-40 Tester triage and T-44 recovery plan can begin in parallel)?
- Approve pushing main online (T-45)?

## Verification
- T-39 worktree: 20× `NODE_DISABLE_COMPILE_CACHE=1 npx vitest run src/lib/deck-list-generator.property.test.ts` gave PASS=20 FAIL=0; `npx eslint` on the file was clean.
- T-38 worktree:
  - `npx vitest --run`: 34 failed / 96 passed files; 134 failed / 1411 passed tests. The failing-file list is identical to main.
  - `npx tsc --noEmit`: 139 errors.
  - `npx eslint .`: 581 problems.
- `gh run list` and `git log origin/main..main` were run as quoted above.

## Update 2026-10-11 (after owner "Yes")
- Merged T-39 (1b8d9ae) and T-38 (1a39d6f) into main. Focused tests: 5 files / 71 tests pass. Type errors by file are identical to the pre-merge baseline except two fewer in source (StatusFilter.test.tsx, collection/page.tsx); two extra entries are stale generated `.next` files that point at the deleted Missing route.
- Pushed main to origin (3b0998d → 1a39d6f, 29 commits) after a scan of the pushed changes found no secrets. Vercel reported success. The E2E Tests workflow failed on the new commit, like its last two runs.
- Started T-40 (Tester, agent ac55dd41) and T-44 (Architect, agent e09a16af). Neither had pending permissions. T-41–T-43 stay TODO until T-40 returns.
- Cleaned up: temporary comparison folder /tmp/pre-t38 removed. The T-38 and T-39 worktrees and branches are still in place; they are safe to archive now that they are merged.

## Update 2026-10-11 (local-only direction)
- Owner: "assume that i will be running everything locally until we get all this foundational work done." Recorded in roadmap.md scope rules and status.md Phase 1. T-43 now means one easy local command first; the hosted checks are low priority.
- T-40 (ac55dd41) and T-44 (e09a16af) were sent this direction. T-44 must check where the local app's data really lives.
- Archived the T-38 and T-39 workspaces and deleted their merged branches.

## Correction 2026-10-11 (owner clarification)
The earlier "local-only" note meant: the app runs locally against the hosted Supabase database; the owner only meant no Vercel for now. Roadmap and status wording corrected, and T-40 and T-44 were sent the correction. The hosted database is the single copy of the data, which makes T-44 more important.
