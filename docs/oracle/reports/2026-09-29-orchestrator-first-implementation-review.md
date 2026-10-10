# Report: first-implementation-review
Role: Orchestrator
Status: DONE
Task as received: Please review

## Summary for the owner
The AI streaming fix passes this review. The Collection changes need corrections because newer search text can be overwritten and a collection that is still loading can show zero owned; the price-check change needs a small error-reporting fix. Nothing has been merged or deployed.

DONE describes the completed review, not acceptance of all three implementations.

## Verdict

| Task | Verdict | Remaining gate |
|---|---|---|
| T-32 Collection loading/search | CHANGES REQUESTED | Correct R1/R2, close the specified R3 coverage gaps, then coordinator re-review. |
| T-33 price freshness | CHANGES REQUESTED, narrow | Correct R4 and add its regression; rerun focused checks. Valid timestamp/null and single-read behavior passed review. |
| T-34 native AI streaming | ACCEPTED within the original narrow scope | Owner approval before merge. No deployment or wider AI-safeguard acceptance. |

Inspected the actual production diffs, new tests, relevant existing callers/hooks/toolbar, frozen Collection contract and locked decisions. All 326 frozen input files remain byte-identical. Actual changes outside the input snapshots are exactly the assigned source/test/report files. No overlapping production edits or new schema/dependency/configuration changes were found.

## Findings

The paths below are relative to the task's own isolated worktree, not changes applied to main.

| ID | Priority | Location | Evidence and required correction |
|---|---|---|---|
| R1 | P2 | T-32 `src/components/collection/CollectionToolbar.tsx:143-159` | The unchanged prop-sync effect overwrites newer raw input, and does not cancel an obsolete pending timer on a genuine external reset. Reproduced both: commit `Sol`, type `Sol Ring`, acknowledge the older `Sol` prop -> input becomes `Sol`; start with committed `Sol`, type `Sol Ring`, externally clear -> old timer still commits `Sol Ring`. These are inherited gaps explicitly assigned in F2, not claimed to be newly introduced. Preserve newer input on an older acknowledgement, but honor genuine external resets and cancel their obsolete timers. |
| R2 | P2 | T-32 `src/app/collection/page.tsx:200-234,366-401` | The new unknown-count guard lasts only until the view preference resolves. While the first list request is still pending, the header then says `0 owned` and the footer says `Showing 0 of 0 cards`. Reproduced with the real hooks and QueryClient, a saved list preference and a deferred fetch. These false success-shaped counts violate the assigned distinction between waiting, failure and a confirmed empty result. Keep unknown counts unknown until usable active-view data exists; cover both views and failure states without inventing totals or changing API shape. |
| R3 | P2 | T-32 `src/app/collection/page.test.tsx:202-488` and completion report | Report says every F1/F2 acceptance case is covered, but the rapid-input test never clears, stale prop/reset tests are absent, hidden-cache test never loads/invalidates/reactivates the hidden list, storage exceptions are untested, and `retry:false` prevents testing the required single automatic retry. Later-page sort/direction/view-state transitions and cross-view late response/error isolation are also unproved. Complete the bounded acceptance coverage below; correct the report rather than mapping partial tests to all case IDs. |
| R4 | P3 | T-33 `src/lib/price-store.ts:140-153` | `isPriceDataStale('')` returns stale with zero reads, but emits no required malformed-timestamp diagnostic because `if (!observedRefresh)` treats empty text like explicit null. Reproduced with the real helper and a mocked database boundary. Distinguish null from malformed supplied strings, preserving no-read semantics and the existing threshold. The lookup boundary already logs an empty stored timestamp; make direct-helper behavior consistent. |

[Confirmed: task-worktree source/test files above; session `files/implementation-review-probes/collection-review.test.tsx`, `price-review.test.ts`; `files/review-final-probes.txt`]

### T-32 bounded correction acceptance

Remain within the original page/toolbar/hooks/direct tests/report ownership and frozen F1/F2 contract. No product/default/schema changes, broader status filtering, grouping/pagination redesign, new component styling or app-wide state framework.

1. Reproduce and fix both R1 cases using the real toolbar. Preserve exactly one 300ms pause, callback freshness, clear cancellation and unmount cleanup. A genuine external reset must not be confused with a delayed acknowledgement of the toolbar's own older commit.
2. Keep R2 header/footer counts unknown during preference resolution and first active loading/failure. A genuine successful empty response may show zero; usable previous data during refresh must retain its refresh indication. Do not use the hidden view's totals or synthesize comprehensive original/proxy totals from a page.
3. Add the missing exact F1/F2 checks in a combined focused suite: rapid type-then-clear both from empty and committed search; storage-read exception recovery; loaded hidden-cache invalidation and revalidation on activation; final sort-field/default-direction request at page 1 with inactive page preserved; search/color reset of both pages; view switch while typing; reversed visible rows and totals; hidden late success/error isolation; one automatic retry of the exact key plus existing explicit Retry reload. Use deterministic timers/deferred responses.
4. Keep real QueryClient/hooks for integration assertions, but mock the Oracle context boundary rather than mounting its real provider. Reject unexpected fetches instead of returning `{}` success for every unknown endpoint. Explicitly mock/allow any independent value-banner request. Do not make live requests or mount the app.
5. Correct verification wording: current ESLint findings are errors, not warnings. The full typecheck remains baseline-red, not a pass. Distinguish measured test invariants from the unmeasured loading targets.

### T-33 bounded correction acceptance

1. Correct only the explicit empty-string diagnostic gap in R4; preserve explicit null -> stale/no diagnostic/no read, explicit timestamp -> no read, and omitted/undefined -> one read.
2. Add empty/whitespace, null and explicit-undefined regression cases as appropriate. A metadata lookup failure must still log once and return null/stale without a second query.
3. Fix inaccurate test descriptions or report claims without expanding production scope: the rollup test labelled "card-data errors after the freshness site" actually errors in the page query before the freshness site, and the "run in parallel" test does not assert concurrency. Add a deferred concurrency assertion / real post-freshness failure case, or accurately state which properties are source-reviewed rather than tested.
4. Record all unchanged lint findings, including the rollup route's four pre-existing errors, not only printings. No unrelated lint cleanup.

## T-34 acceptance evidence

- The new branch records the first argument fragment once, emits its delta once and continues only the inner native-call loop. Subsequent fragments, separate indices and surrounding text/usage handling retain the original structure.
- Independently ran the seven returned tests against the changed adapter: all passed.
- Independently reran the same tests against a `git show HEAD` source snapshot in the session workspace: five failed, two passed. Failure cases include complete and partial initial JSON, interleaved calls, empty-object JSON and mixed text/call. This confirms regression sensitivity without stashing or editing the agent's source.
- The unchanged DSML `prefer-const` lint error remains at line 152. No new lint errors in the adapter/test. All 157 project type diagnostics match baseline after source-location/union-order normalization.
- No change to DSML parsing, malformed-response protocol, tool executor, permissions, UI, API routes or non-streaming production code. Existing full S3/S1/S2 issues remain outside this acceptance.

[Confirmed: T-34 `src/lib/adapters/deepseek-adapter.ts:181-216`; `src/lib/adapters/deepseek-adapter.test.ts`; session `files/review-final-probes.txt`]

## Changed files
- `docs/oracle/status.md` - record accepted T-34 and requested T-32/T-33 corrections.
- `docs/oracle/reports/2026-09-29-orchestrator-first-implementation-review.md` - findings, reproduction, bounded correction acceptance and independent results.
- Session-only review probes and logs - reproducible offline review evidence; no production edits.

## New decisions made (need owner confirmation)
- None. Corrections enforce the already accepted implementation brief. T-34 is recommended for owner-approved merge, not merged by this review.

## Assumptions
- Parent `main` production source is unchanged from the launch baseline; `git diff --stat -- src` was empty. Its failures are the independent baseline, not the child agents' self-reported stash comparisons.
- Isolated mocked checks establish the specified data/request/fragment behavior, not hosted app timing or whole-app release readiness.

## Challenges to locked decisions
- None.

## Open questions
- No new behavior question is needed for these corrections. Existing broader advisor/pick-list and safe measurement gates remain unchanged.
- Same-agent corrections are dispatched below; there is no permission to merge/deploy.

## Verification

| Command / check | Independent result |
|---|---|
| T-32 `npm test -- src/components/collection src/app/collection/page.test.tsx src/hooks` | 85 passed / 2 failed. All 13 new page tests pass; the two toolbar preference expectation failures reproduce on unchanged main (19 passed / 2 failed). |
| T-33 `npm test -- src/lib/price-store.test.ts src/app/api/collection/rollup/route.test.ts src/app/api/collection/printings/route.test.ts` | 27/27 passed. Additional explicit-undefined/failed-metadata probe passes with one read and one log. |
| T-34 installed `vitest run --config vitest.config.ts src/lib/adapters/deepseek-adapter.test.ts` | 7/7 passed. Initial npm-wrapper invocation stalled before runner startup and was stopped by its exact shell ID; direct installed runner succeeded. |
| Targeted ESLint on every changed/new source/test file, compared with unchanged main | T-32: 2 errors/3 warnings vs 4 errors/3 warnings before; T-33: 15 errors/2 warnings, all unchanged; T-34: 1 unchanged error. Not clean lint passes. |
| `tsc --noEmit --incremental false` in each task and unchanged main | All exit 2, with 157 baseline diagnostics each. No added/removed diagnostics after normalizing moved locations and equivalent union ordering. Two existing errors remain in the T-32 page/toolbar (printing-list props and missing rarity label); no new-test type errors. |
| Session probe runner, real components/hooks/helper with fully mocked external boundaries | Five additional acceptance failures reproduced: two search-sync/reset cases, header/footer pending counts, and empty timestamp diagnostic. One extra helper case passes. |
| Same seven adapter tests against session-only baseline source snapshot | Five fail / two pass, versus seven passing on the changed source. Combined final probe log: ten expected failures / three passes across 13 tests. |
| Frozen-input SHA-256 manifest plus git changed/untracked inventory | All 326 copied inputs unchanged; only task-owned source/test/report outputs. |
| `git diff --check` in each implementation worktree | Passed. |

No database, provider, browser, deployment or live-performance call was made. Temporary baseline source copies and the probe dependency symlink are removed after capturing results; the authored probes and logs remain in the session workspace for the assigned agents.

## Same-agent correction dispatch

Executed `paseo send <known-id> --prompt-file <session-file> --no-wait --json` for T-32 `e84c067c-1ae6-4841-a325-9a954294378f` (R1-R3) and T-33 `dd416894-ced2-4498-a71e-365b343f194f` (R4 and narrowly related test/report accuracy). Both returned `status: sent`; no replacement agents or new model/settings overrides were created. Await correction returns rather than polling or editing their production files.

Exact prompts are preserved in session `files/t32-review-correction-prompt.txt` and `files/t33-review-correction-prompt.txt`. T-34 remains idle and accepted pending owner merge approval.
