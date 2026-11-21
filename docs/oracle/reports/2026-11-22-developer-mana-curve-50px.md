# Report: mana-curve-50px
Role: Developer
Status: DONE
Task as received: make the max bar height of the mana curve 50px and always scale the tallest bar to that. Reduce the padding between the header and the chart.

## Summary for the owner
The tallest bar in the Mana curve is now always 50px high, and the other bars scale to it. The empty space between the "MANA CURVE" header and the top count label is gone. It is now the same 12px gap as the other rail sections. I had no real browser, so the numbers below come from the code and not from a screen measurement.

## Before and after
| | Before | After |
|---|---|---|
| Tallest bar | 1.65px per card, capped at 64px (a 8-card bucket was about 13px) | Always 50px |
| Other bars | Same fixed scale | count / tallest x 50 |
| Zero count | No bar | No bar (count and mana value still show) |
| 1-card bar | 2px minimum | 2px minimum |
| Chart area height | Fixed 112px | About 50px bar + count label + mana value label + two 4px gaps (content-sized) |
| Gap header to chart | 12px plus the leftover space above the bars (about 68px measured on deck 792901206) | 12px |

## Changed files
- src/components/deck-rail/RailCurve.tsx — bar height from the tallest bucket (50px), removed the fixed chart height
- src/components/deck-rail/DeckRail.test.tsx — scaling tests (tallest 50, proportional, zero none, min 2px)

## New decisions made (need owner confirmation)
- none

## Assumptions
- The chart is content-sized, so the section's normal 12px gap applies.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npm test — one run had 1 failure in an unrelated printings-tab test (flaky); rerun: 4612 passed, 0 failed
- tsc --noEmit — only the 4 known AddToPicklist errors
- eslint src/components/deck-rail — 0 errors, 1 existing warning in DeckRail.tsx (not touched)
- Browser measurement on deck 792901206 and another deck: not done, no real browser available.
