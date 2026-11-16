# Developer report: Picklist remaining routines (applied; routes built; UI waiting)

Date: 2026-11-16. Status: PARTIAL.

## What was done
- Smoke-tested all five routines on the live project inside one rolled-back run. Every path behaved as the Architect designed (created, repeat = unchanged, other user refused, bad input, wrong state, double tap, Undo from placed / found / missing, bad box, in hand / box / deck). Afterwards no steps existed, no copy was missing or in hand, no new functions remained.
- Applied them to project The Oracle with apply_migration; files moved from `supabase/drafts/` to `supabase/migrations/` with the hosted version names. Grants checked: server only (anon and signed-in browsers cannot run them).
- Built server routes under `/api/moves/` (lists, missing/[copyId]/turned-up, items/[id]/looked-here, undo, cancel), helpers `src/lib/move-routines.ts` and `src/lib/move-routine-route.ts`. User id comes from the session only. Refusals map to 404 / 409 / 400 with plain sentences.
- Tests: `src/app/api/moves/moves.test.ts` (7 pass). Typecheck passes.

## Challenges
- I ran two applies at once; one failed on a duplicate version, so history order is resolve, create, looked_in, undo, cancel (not the draft order). The routines are independent, so no harm.

## New decisions / open questions (why UI is not built)
1. All-decks shape: the contract says the response carries `unowned: PicklistRow[]`, but the spec says unowned cards are never listed, only a footnote count. Which wins? My suggestion: footnote count per deck only.
2. Missing page "I checked here" needs the saved step's id; the Missing payload does not carry it. Adding it is a small read change; confirm OK.
3. Where "Add all n to the Picklist" lives (Unsorted page / import result) and the destination picker design.

## Verification
- typecheck: pass. moves tests: 7/7. UI states not built, so not verified.
- Not done: Add to Picklist / Add all buttons, Found it on Missing, I checked here, Undo, Cancel buttons, all-decks footnote and reshape.
