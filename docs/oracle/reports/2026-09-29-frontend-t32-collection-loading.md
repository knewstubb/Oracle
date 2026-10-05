# Report: T-32 Collection loading fixes (F1 active-view gating, F2 single-pause search)
Role: Frontend
Status: DONE
Task as received (second correction round, tests/report only): You are the Frontend agent. Read AGENTS.md and .paseo/agents/frontend.md before anything else.
Task T-32: Finish the still-missing permanent acceptance tests listed below, within your original direct page/toolbar test and completion-report ownership; the coordinator independently reran all six original probes and they now pass, so this follow-up is tests/report only unless a test proves a specific in-scope production defect. [Seven numbered requirements: (1) permanent R1 toolbar-race tests, (2) a hidden-cache test that invalidates an already-loaded cache rather than activating a never-loaded view, (3) a clear-to-empty-after-committed-value test, (4) sort/page tests with real visible footer assertions, (5) a colour-change reset-both-pages test, (6) a genuine hidden late-success test plus a strengthened reversed-search-response test, (7) a strengthened retry test with an always-failing variant.]
Done when: every item below has the exact permanent assertions, the combined focused runner and targeted lint/type checks are rerun with accurate baseline accounting, and the report maps each case to its actual test; stop without new decisions, delegation, commit, merge, deployment or live data/model/browser calls.

Task as received (third, final bounded correction, tests/report only): the colour reset-both-pages test paged to grid3/list2 *then* committed the search, which already reset both pages before the colour click, so it could not prove colour caused the reset — fixed by committing the search first, then navigating both views to page 3/2 under that search, verifying the visible page text, and only then changing colour. Added a `lastHeaderSubtitleText()` "22 owned" assertion to the reversed-response test. Fixed the hidden-cache test's title (it correctly tests LIST cached-and-hidden behind an active GRID; the title previously said "grid is hidden"). Fixed report wording that had wrongly implied all 24 toolbar tests pass (22 pass, 2 known baseline fail, unchanged). No other production/test scope was expanded.

## Summary for the owner
All seven gaps the coordinator found in the previous round's test coverage are now closed with permanent, always-run tests (no temporary probe files involved). The three behaviour fixes from the last round (typing survives an old echo, clearing a search doesn't get overwritten by a stale timer, and "0 owned"/"Showing 0 of 0" doesn't flash before real data arrives) were already correct in the app — this round only strengthens the proof that they, and several related edge cases, actually work: an out-of-view tab correctly re-checks itself when its data goes stale, clearing a search box down to nothing is now checked all the way to the empty result (not just back to the old value), changing the sort order or the colour filter now checks the actual page number shown on screen (not just that no extra network call happened), and one failed request retrying automatically is now checked more strictly, including a case that never succeeds.

## Changed files
- `src/components/collection/CollectionToolbar.tsx` — unchanged this round (R1 fix already in place from an earlier round).
- `src/app/collection/page.tsx` — unchanged this round (R2 fix already in place from an earlier round).
- `src/hooks/useCollectionRollup.ts` — unchanged this round.
- `src/components/collection/CollectionToolbar.test.tsx` — unchanged this (third) round; the `describe('R1: prop-sync race ...')` block (3 permanent tests) was added in the prior round and is untouched here.
- `src/app/collection/page.test.tsx` — this round: (a) reordered the colour-reset-both-pages test so the search is committed before either view is navigated to a later page, with visible page-3/page-2 assertions added before the colour change, so the colour change is provably the only remaining cause of the reset asserted afterward; (b) added a `lastHeaderSubtitleText()` "22 owned" assertion to the reversed-search-response test; (c) corrected the hidden-cache test's title to describe what it actually exercises (list cached-and-hidden behind an active grid, not "grid is hidden"). Test count unchanged at 31.

## New decisions made (need owner confirmation)
None. This round adds test coverage and report accuracy only, per the coordinator's explicit "tests/report only" instruction. No production behaviour was changed.

## Assumptions
- The 2 pre-existing failing tests in `CollectionToolbar.test.tsx` (`getPersistedViewMode` expecting `'list'` when nothing/invalid is stored, while the app has always returned `'grid'`) remain the same already-known, contract-flagged mismatch as both prior rounds. Untouched again.
- React Query's `invalidateQueries` (default `refetchType: 'active'`) marks a disabled/hidden query stale without immediately refetching it, and only issues a fetch once that query becomes actively observed again (e.g. by switching to its view). This was previously an unverified assumption; it is now empirically confirmed by the rewritten `C27-F1-04` test (item 2 below), which fails if it does not hold.
- `useCollectionRollup`'s `staleTime: 5 * 60 * 1000` means a cached, fresh, unfiltered ('' search) query would normally be reused without a new fetch on return to it; the clear-to-empty page test (item 3 below) explicitly invalidates only that one cache entry via a `predicate` (matching on `queryKey[1] === 'rollup' && queryKey[5] === ''`, not a hardcoded key array) before clearing, so the resulting request is proven to be genuine rather than relying on a coincidence of cache freshness. No cache rule was changed to achieve this.

## Challenges to locked decisions
None.

## Open questions
None outstanding for this round.

## Coordinator requirement → test mapping

| # | Coordinator requirement | Test(s) | File |
|---|---|---|---|
| 1a | Newer keystroke survives an older acknowledgement echo | `'preserves a newer keystroke when the parent later echoes back an older value the toolbar itself already committed'` | `CollectionToolbar.test.tsx` |
| 1b | Genuine external reset adopted; pending timer cancelled, no stale callback | `'adopts a genuine external reset and cancels its own obsolete pending commit'` | `CollectionToolbar.test.tsx` |
| 1 (clear timing, toolbar side of item 3) | Exact-callback timing for a clear that follows further typing (299ms none, 300ms exactly one `''`) | `'commits an empty string exactly once, 300ms after a clear that follows further typing'` | `CollectionToolbar.test.tsx` |
| 2 | Hidden-cache test invalidates an *already-loaded* cache (not a never-loaded view); zero requests while hidden, exactly one on activation, refresh indication shown while the revalidation is deferred | `'C27-F1-04: invalidating collection while list is hidden (behind an active grid) does not fetch the hidden view; activating it afterward revalidates exactly once, showing the previous result with a refresh indication until the new data arrives'` | `page.test.tsx` |
| 3 (page side) | Committed `Sol` → type `Sol Ring` → clear to `''` before expiry → genuine new empty-search fetch (via explicit predicate-based invalidation of the stale-marked, fresh unfiltered cache entry), no stray request for the abandoned value | `'clearing to empty after a committed search and further typing genuinely commits an empty search exactly once'` | `page.test.tsx` |
| 4 | Sort/page tests assert the real final visible view/page, not just absence of a request; symmetric list-initiated case; visible footer page on switch-back | `'F2 sort-field reset (grid-initiated): ...'` (strengthened with `/Page\s*2\s*of\s*3/` and `/Page\s*3\s*of\s*3/`... assertions) and the new `'F2 sort-field reset (list-initiated): ...'` | `page.test.tsx` |
| 5 | Colour change resets both active and inactive view pages, with identical colour/committed search, no intermediate new-filter/old-page request | `'a colour filter change resets both the active and inactive view pages, carrying the identical colour and committed search into both'` — reordered so the search is committed *before* either view is navigated to a later page, with visible page-3/page-2 assertions before the colour change proves the colour change alone causes the reset | `page.test.tsx` |
| 6a | Remove misleading unused `resolveRollup`; add genuine hidden late-success case, active view unaffected | `'hidden late error for an inactive view is isolated from the active view'` (cleaned up) and new `'hidden late success for an inactive view (sharply different count/identity) is isolated from the active view'` | `page.test.tsx` |
| 6b | Reversed-search-response test: distinct A/B totals, row identity persists, refreshing/placeholder indication shown | `'C27-F2-05: a late response for an earlier search cannot replace the committed later result, with distinct totals, row identity, and the refreshing indication honestly shown throughout'` (renamed/strengthened; now also asserts `lastHeaderSubtitleText()` contains "22 owned" after the late "a" response, in addition to the footer's "Showing 1 of 22 cards" text) | `page.test.tsx` |
| 7 | Retry test: exact URL/key comparison, exactly two attempts, success clears error; always-failing `retry:1` variant, no third attempt, explicit failure, unknown (not zero) counts | `'a network failure automatically retries the exact query key once, and a subsequent success clears the error'` (strengthened) and new `'a request that always fails automatically retries exactly once (no third attempt), showing an explicit failure with unknown, not falsely zero, counts'` | `page.test.tsx` |

## Verification

### Combined focused test run
`npm test -- src/components/collection/CollectionToolbar.test.tsx src/app/collection/page.test.tsx src/hooks`

Result: **85 tests total, 83 passed, 2 failed.** The 2 failures are the pre-existing, contract-flagged `getPersistedViewMode` baseline mismatch (`'returns "list" when nothing stored'`, `'returns "list" when stored value is invalid'`), unchanged and untouched this round. All 31 tests in `page.test.tsx` pass. In `CollectionToolbar.test.tsx`, **22 of its 24 tests pass** (the 3 new permanent R1 tests included among the 22); the other 2 are the baseline `getPersistedViewMode` failures above — this file does **not** have all 24 passing. The coordinator's own independent run over the full `collection`/`page`/`hooks` selection reports 106 passed / 2 baseline-failed of 108 total, consistent with this narrower 85-test run once the coordinator's broader selection's additional non-`CollectionToolbar`/`page`/`hooks` collection-component tests are included.

### Targeted ESLint
`npx eslint src/app/collection/page.tsx src/app/collection/page.test.tsx src/components/collection/CollectionToolbar.tsx src/components/collection/CollectionToolbar.test.tsx src/hooks/useCollectionRollup.ts`

Result: **1 error, 3 warnings** (the pre-existing `react-hooks/set-state-in-effect` error in `page.tsx`, plus 2 pre-existing unused-variable warnings in `page.tsx` and 1 pre-existing `no-img-element` warning in `CollectionToolbar.tsx`). Baseline on the same files (via `git stash`, confirmed in the prior round) is 4 errors, 3 warnings — unchanged from the previous round's report; no new error or warning was introduced this round.

### Targeted TypeScript check
`npx tsc --noEmit -p .`

Result: exits **2** (non-zero), both before and after this round's changes. Counted with `grep -c "error TS"` (not raw output line count, which the coordinator correctly noted overstates the figure): **157 error diagnostics**, identical before and after this round's edits. Diffing the full before/after output shows only a single line-number shift on one pre-existing error inside `page.tsx` (message, column, and type identical — only its line number moved, from an earlier round's unrelated nearby edit); no diagnostic was added or removed by this round's test-only changes.

### File-scope check
`git --no-pager diff --stat` confirms only `src/components/collection/CollectionToolbar.test.tsx` and `src/app/collection/page.test.tsx` were changed this round (no production source, no package/test configuration, and no other agent's files were touched or staged).

No live database, network, browser, or model call was made. `global.fetch`, `localStorage`, and `window.matchMedia` remain fully mocked; the Oracle and page-header contexts remain mocked at the module boundary; any request outside the explicitly modeled set (`/api/collection/rollup`, `/api/collection/printings`, `/api/collection/value`) fails the test rather than silently succeeding. No runtime latency was measured; all timing assertions use `vi.useFakeTimers()`/`vi.advanceTimersByTime()`.

Stopping here for coordinator re-review — no commit, merge, deployment, or further delegation performed.
