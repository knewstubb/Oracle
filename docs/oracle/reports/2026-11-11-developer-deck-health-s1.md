# Developer report: Deck health S1 "Honest strip and verdict"

## Role
Developer

## Status
DONE (E2E not run, see Verification)

## Task as received
Build slice S1 of Phase 2 Deck health (no migration, no EDHREC) from `docs/oracle/contracts/deck-health-phase2.md`: route fixes, `card-roles.ts` with golden tests, four roles against a general guide, the Light rule (2 or more short), a "Deck health" button and overview panel with "Strategy: Not set yet", and removal of the old paths S1 replaces. Branch `deck-health-s1`, pushed, not merged.

## Summary for the owner
The health strip now reads real card text, so it no longer shows every pill red. It counts four roles (Ramp, Draw, Removal, Wipes) against a general guide (10, 10, 6, 2). A role is Light only when it is 2 or more cards short. A "Deck health" button opens a panel with the verdict, a "Strategy: Not set yet" row and the counts by role, labelled "General guide". Other people can no longer read your deck's health. A failure now shows "Couldn't check deck health" with Try again instead of a false green.

### Owner check steps
1. Open one of your real decks. The pills are no longer all red.
2. A deck with 6 removal against the guide of 6 says fine; 3 removal says Light.
3. Open the panel with the "Deck health" button. It says "General guide".
4. Another account cannot see the deck (health, recheck and overrides all answer "not found").

## Changed files
New:
- `src/lib/card-roles.ts`, `src/lib/card-roles.test.ts` (83 golden tests), `src/lib/__fixtures__/card-roles-scryfall.json` (real card text for 75 cards)
- `src/lib/deck-health.ts`, `src/lib/deck-health-server.ts`, `src/lib/deck-health.test.ts`
- `src/components/DeckHealthButton.tsx`, `DeckHealthPanel.tsx`, `StrategyRow.tsx`

Rewritten:
- `src/components/HealthStrip.tsx`, `HealthPill.tsx`
- `src/app/api/decks/[id]/health/route.ts`, `recheck/route.ts`: owner filter, real card text, 400/404/500 responses, nothing stored

Edited:
- `src/app/api/decks/[id]/health/overrides/route.ts`: owner filter on GET/PUT/DELETE, no recompute, real errors
- `src/lib/health-store.ts` and its test: removed the old result type and save/read functions (overrides kept)
- `src/components/CardsTab.tsx`, `CardGroupSection.tsx`: removed the old per-category health props
- `src/app/decks/[id]/page.tsx`: removed the old health query and pill-jump

Deleted: `src/lib/health-engine.ts`, `src/lib/category-classifier.ts`, `src/components/HealthPill.test.tsx`.

## New decisions
- Guide wording is "Guide is N; you have N." The mockup says "Average"; the contract says the guide is not an average, so "Average" is kept for EDHREC slices.
- "Well covered" has no "(general guide)" suffix; the mockup wins. The Light headline carries it.
- Pills open the panel overview (gap detail is S3).
- The panel is a right drawer (420px) and a bottom sheet (86%) under 700px, built on the existing dialog primitive (focus trap, Esc, focus return).
- "Chat about this" is omitted (chat is S5). "Set strategy" is a greyed, inert control tagged "Phase 4 · not built yet".
- Role calls: a plain cantrip is not draw; treasure makers count as ramp; mana-only instants/sorceries are not ramp; blink is not removal; bounce counts as removal.

## Assumptions
- Unclassified cards (no card text) over 10% of the main deck make the check "partial" ("Couldn't fully check").
- Main deck excludes commanders and maybeboard/sideboard/companion.
- Typical 1 or less is never Light.

## Challenges
- All 132 double-faced cards in the shared card table have no Oracle text, so they count as unclassified. Lands are still found from the type line. A data fix is outside S1.
- Some `type_line` values are truncated (e.g. "Sorcery —"); the base type is intact so it is handled.

## Open questions
- Should double-faced card text be backfilled in the card table (needs a migration or import fix)?

## Not in S1 (left on purpose)
- Role regexes in `spare-copy-browse.ts` (S3) and `getCommanderTopCards` (S2); chat tool (S5).
- Old `deck_health` rows are left alone (nothing destructive). Saved threshold overrides still exist but the verdict no longer uses them.
- `tests/e2e/oracle-smoke.spec.ts` mentions the old strip; not updated, not run.

## Verification
- Unit tests: all pass (`npm test`), including 83 card-role golden tests and 13 deck-health tests using fake clients only; the loader tests cover other-user 404, real text reaching the classifier, and 500 on read failure. No test touched live data.
- Typecheck: only the known error in `docs/oracle/contracts/card-state-actions.examples.ts`.
- Lint: 0 errors; warnings are pre-existing.
- E2E: not run (no separate test account).
- Not visually checked in a browser.

## Follow-up 2026-11-11: Lands as a fifth role (owner feedback)
- Lands is now a fifth role after Wipes, in the strip pills and the panel's counts by role. Same Light rule (2 or more short). Example text: "Guide is 36; you have 31."
- Counted from the front-face type line, by quantity, main deck only (no maybeboard, sideboard or commander). A double-faced card whose front is a spell (e.g. Bala Ged Recovery) is not a land; one whose front is a land is. Lands are never counted as unclassified.
- Chosen guide: **36** (owner's figure; the contract gives no land guide). Reference data point: the 1,880 stored commander builds average 34.8 lands. I kept 36 because that is the instruction and with the Light rule 35 lands still reads fine, 34 reads Light. Say if you would rather use 35.
- Lands is not a card role: `card-roles.ts` is unchanged; the land count lives in `src/lib/deck-health.ts`.
- Files: `src/lib/deck-health.ts`, `src/lib/deck-health.test.ts` (land count, double-faced, 35 ok / 34 Light), `src/components/HealthStrip.tsx` (one more loading placeholder). Panel and pill needed no change as they list whatever roles come back. No drill-in detail (S3).
- Verification: unit tests pass (2,622); typecheck only the known error; E2E not run.
