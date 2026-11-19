# Report: deck-intent-removal
Role: Developer
Status: DONE
Task as received: Part A, small removal (owner 2026-11-19: 'Remove the intent'): remove the old 'Deck Intent' form from the deck Strategy tab. Slice 1 (merged; report docs/oracle/reports/2026-11-19-developer-slice-1-strategy-window.md, open question 1) added the Strategy window, which now edits the same bracket, Strategy text and playgroup. Remove only the old form and anything that exists only to serve it. Keep the EDHREC build picker, its guide and the category manager exactly where they are. Win condition and budget are parked by the owner: their stored values stay untouched and remain readable by Claude where they are today, but there is no longer an edit form for them (say so plainly in the report). Do not delete database columns or data.

## Summary for the owner
The "Deck Intent" section is gone from the deck's Strategy tab. Bracket, Strategy text and playgroup are edited in the Strategy window only. **Win condition and budget no longer have an edit form anywhere.** Their saved values are untouched and Claude still reads them as before. Nothing in the database changed.

## What to test in 5 minutes
1. Open a deck and go to the Strategy tab. There is no "Deck Intent" row, no Configure/Edit button.
2. The build picker, the strategy guide, the Categories list and Notes still appear where they were.
3. Open the Strategy window from the side rail. Bracket, Strategy and playgroup still show and save.
4. Ask Claude about a deck that had a win condition or budget saved. It should still know them.

## Changed files
- src/components/StrategyTab.tsx: removed the Deck Intent section, its form state, its load and save calls, and the loading/error screen that only waited for it.
- src/components/StrategyTab.test.tsx: new test. Deck Intent, Configure, Win condition and Budget mode are absent, no call to the old strategy endpoint is made, and the build picker and category manager are present.
- docs/oracle/reports/2026-11-19-developer-deck-intent-removal.md: this report.

## New decisions made (need owner confirmation)
- none

## Assumptions
- "Anything that exists only to serve it" covers the code inside the Strategy tab. I kept the old server endpoint for the form (`/api/decks/[id]/strategy`, GET and PUT) because it has its own tests and a large property-test file imports it. It now has no caller in the app.

## Challenges to locked decisions
- none

## Open questions
- Should the now-unused old endpoint and its tests be deleted in a later cleanup? It can still write win condition and budget if called directly, though no screen does.

## Verification
- npx vitest --run: 323 files passed, 6 skipped; 3988 tests passed, 46 skipped
- npx tsc --noEmit: only existing errors in AddToPicklist.test.tsx (not touched)
- npx eslint on changed files: no errors (one existing unused-prop warning)
