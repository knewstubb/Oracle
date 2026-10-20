# Report: T-26 batch V3 — status lookups stop guessing
Role: Developer
Status: DONE
Task as received: Task T-26 batch V3 (spec section 10, V3, plus section 5 and D-030). Make status lookups stop guessing: in src/lib/card-status.ts, src/app/api/cards/builder-status/route.ts and src/app/api/decks/route.ts a failed lookup must return an explicit failure, never Unowned, empty or complete; callers must keep compiling and existing tests must pass or be updated to the new behaviour, with new tests for the failure path. Do not add proxy-available (waits on readiness data). Edit only those files and their tests, plus minimal caller type updates. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md first. Spec: docs/oracle/specs/vocabulary.md (locked by D-043). Do not touch files outside your batch. Run 'NODE_DISABLE_COMPILE_CACHE=1 npm run check' before finishing; it must pass. Write your report to docs/oracle/reports/2026-10-12-developer-t26-v3-lookups.md in the AGENTS.md format. For Brad (plain words): this stops the app from saying a card is Unowned when it simply could not check.

## Summary for the owner
The app no longer pretends a card is Unowned, Available or complete when the database lookup fails. Instead it now reports a clear "couldn't check" state for that card or deck, so you can tell the difference between "you don't own this" and "we couldn't look it up right now". The visible words and colours will arrive with the V2 card-badge and V4 deck-header work; this change just makes the underlying status honest.

## Changed files
- `src/lib/card-status.ts` — added a `failed` status; batch lookups now return `failed` for every card when a database query errors instead of defaulting to `unowned`.
- `src/app/api/cards/builder-status/route.ts` — `BuilderStatusResult` now includes `failed`; the route no longer falls back to `unowned` for missing lookup entries.
- `src/app/api/decks/route.ts` — deck `completeness` now carries a `failed` flag that is set when any unresolved card's status lookup fails.
- `src/components/CardSlotBadge.tsx` — minimal type update: added a `failed` entry to the status config so the component still compiles.
- `src/components/CardGroupSection.tsx` — minimal type update: added a `failed` entry to the mobile dot config so the component still compiles.
- `src/lib/card-status.test.ts` — added failure-path tests for `computeUnresolvedStatuses` and `computeDeckCardStatuses`.
- `src/app/api/cards/builder-status/route.test.ts` — new tests covering success and failure responses.
- `src/app/api/decks/route.test.ts` — new tests covering completeness success and failure signalling.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- A lookup failure is when the underlying `user_cards` or `user_copies` query returns an error. A successful query that returns no rows still means "unowned", which matches D-025/D-030.
- Proxy-available and deck readiness states are intentionally left out because they depend on the T-28 supply/readiness contract, per the task instructions.
- Missing entries in a lookup result are treated as failures rather than guesses, because the only way a requested card can be absent from the result is if the lookup did not run for it.

## Challenges to locked decisions
- None.

## Open questions
- None.

## Verification
- `NODE_DISABLE_COMPILE_CACHE=1 npm test` — 1625 passed, 40 skipped.
- `NODE_DISABLE_COMPILE_CACHE=1 npm run typecheck` — passed.
- `NODE_DISABLE_COMPILE_CACHE=1 npm run lint` — 264 pre-existing warnings, 0 errors (exit code 0).
- `NODE_DISABLE_COMPILE_CACHE=1 npm run check` — passed.
