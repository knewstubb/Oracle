# Report: mana-by-turn-chart
Role: Developer
Status: DONE
Task as received: FEAT-002. Mana by turn chart component, mounted as the last deck-rail section below Mana production; report. Depends on FEAT-001.

## Summary for the owner
The deck summary panel now has a "Mana by turn" section under Mana production. It shows a line chart of average mana available on turns 1 to 7, with a lighter dashed line for "if all lands untapped" and a shaded band for the middle 80% of games. Hovering or tabbing to a turn changes the readout at the top right; moving away returns it to Turn 4. Decision for you: approve the proposed D-064 below.

## Changed files
- src/components/deck-rail/ManaByTurnChart.tsx — SVG chart (260x150), seven focusable turn columns, brand colours only
- src/components/deck-rail/RailManaByTurn.tsx — rail section, deferred simulation, skeleton, empty state, signature memo
- src/components/deck-rail/RailManaByTurn.test.tsx — tests for readout, hover/focus, legend, footnote, empty state, no mana colours
- src/components/deck-rail/DeckRail.tsx — mounts the section after Mana production
- src/components/deck-rail/DeckRail.test.tsx — section list now includes Mana by turn
- src/app/decks/[id]/page.test.tsx — same section list update

## New decisions made (need owner confirmation)
- Proposed D-064: the chart uses the Deck health ramp/draw classifier, mana parsed from card text, 5,000 seeded games on the play, hands of 2 to 5 lands, tapped lands modelled, ramp produces from the turn after it is cast. Chart shows Turn 4 by default. decisions.md not edited.

## Assumptions
- Empty state when fewer than 8 non-commander cards or no lands.
- Report dated by system date (2026-11-21).

## Challenges to locked decisions
- none

## Open questions
- Gene: add this item to docs/oracle/status.md (not edited by Developer).
- Visual check in a browser was not done.

## Verification
- npx vitest run src/components/deck-rail — pass
- npm test — 4611 passed, 0 failed (one unrelated CardDetails keyboard test failed intermittently on one run, also without these changes)
- npm run typecheck — 4 baseline errors only
- npm run lint — 1 baseline error, no new
