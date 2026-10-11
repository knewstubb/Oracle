# Report: t39-flaky-deck-list-test
Role: Developer
Status: DONE
Task as received: Task T-39: Fix the randomly failing "Property 1: Card Completeness" test in src/lib/deck-list-generator.property.test.ts, which miscounts rows when a generated set code looks like bold text (e.g. **); details are in docs/oracle/reports/2026-09-30-architect-i01-first-batch-integration.md. Done when: the test no longer fails for that input (add a fixed-seed or explicit regression case), still checks card completeness, and passes 20 consecutive runs, with results in your report.
For Brad (plain words): Fix a behind-the-scenes check that fails at random so real problems are easier to spot.

## Summary for the owner
The build check that randomly went red is fixed. It was counting the rows of the generated card list by looking for "bold text", so a card whose set code or category happened to be `**` was skipped and the count came out wrong; the app itself was never wrong, only the check. The check now counts rows by their shape instead, and it passed 20 times in a row. Nothing you see in the app changes.

## What was wrong
The failing check is a property test (an automated check that runs the deck-list generator over many randomly generated decks). Its helper `countCardRows` identified the summary "Total" row by testing whether a line contains `| **`, because the generator writes that row in bold. But a normal card row can also contain `| **` when a randomly generated field (set code, or category) is literally `**`. That card row was then treated as the total row and dropped from the count, so `rowCount` came out one short of `input.cards.length` and the assertion failed. [Confirmed: src/lib/deck-list-generator.property.test.ts:39 before change] The generator output itself is correct; the fault was in the test's counting heuristic, which is what the Architect classified as pre-existing and intermittent. [Confirmed: docs/oracle/reports/2026-09-30-architect-i01-first-batch-integration.md, "The one extra full-suite failure"]

## Fix
- `countCardRows` now identifies card rows structurally: a tab-indented table row whose first cell is a plain number (the quantity). Header (`Qty`), separator (`---`) and the bold total row (`**N**`) never have a numeric first cell, so they are excluded regardless of what text appears elsewhere in the row.
- Added an explicit regression test with fixed input: one card with `setCode: '**'`, one with `category: '**'`. With the old helper this returned 1 instead of 2 (reproduced); with the fix it returns 2.

No change to `src/lib/deck-list-generator.ts` — the generator is correct and out of scope for this test-only fix.

## Changed files
- src/lib/deck-list-generator.property.test.ts — fixed the `countCardRows` helper and added the `**` regression test (45 insertions, 8 deletions).

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The task is a test-only fix, so the generator's output format (including the unescaped set code) is left as-is. Real set codes are short alphanumeric codes, so `**` only arises in randomised test data.
- Used the Architect's documented test workaround (`NODE_DISABLE_COMPILE_CACHE=1`). A `node_modules` symlink to the main checkout was created because this fresh worktree had no dependencies; the two lockfiles are byte-identical.

## Challenges to locked decisions
- None.

## Open questions
- None. (The Architect's open question "should a small follow-up fix the randomised deck-list test?" is answered by this task.)

## Verification
- Bug reproduction before fix (regression test against the old helper): failed — `expected 1 to be 2` at the `countCardRows` assertion.
- `NODE_DISABLE_COMPILE_CACHE=1 npx vitest run src/lib/deck-list-generator.property.test.ts` — 5 passed (4 original + 1 regression), 0 failed.
- 20 consecutive runs of the same file — PASS=20 FAIL=0.
- `npx eslint src/lib/deck-list-generator.property.test.ts` — exit 0, clean.
- `npx tsc --noEmit --incremental false` — exit 2 with 141 pre-existing errors; zero errors reference `deck-list-generator*`, so this change adds none.
- `git status --short` — only `src/lib/deck-list-generator.property.test.ts` modified.
